import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
 create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,storage to authenticated,anon,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant select,insert,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
 `);
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/202610020001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query(
    'insert into auth.users(id,raw_user_meta_data) values ($1,\'{"display_name":"Alice"}\'),($2,\'{"display_name":"Bob"}\')',
    [a, b],
  );
  await db.query(
    "insert into public.gmail_connections(user_id,email_address,refresh_token_encrypted) values ($1,'alice@example.test','encrypted')",
    [a],
  );
  for (const user of [a, b]) {
    await db.query(
      "insert into public.transactions(user_id,title,amount_cents,kind,date) values ($1,'tx',100,'expense','2026-10-02')",
      [user],
    );
    await db.query(
      "insert into public.payments(user_id,title,amount_cents,due_date) values ($1,'bill',100,'2026-10-02')",
      [user],
    );
    await db.query("insert into public.tasks(user_id,title) values ($1,'task')", [user]);
    await db.query(
      "insert into public.calendar_events(user_id,title,starts_at) values ($1,'event',now())",
      [user],
    );
    await db.query("insert into public.pages(user_id,title) values ($1,'page')", [user]);
    await db.query(
      "insert into public.files(user_id,name,storage_path,size_bytes) values ($1,'file',$2,100)",
      [user, `${user}/file`],
    );
    await db.query(
      "insert into public.emails(user_id,gmail_id,sender,subject,received_at) values ($1,'mail','sender','subject',now())",
      [user],
    );
    await db.query("insert into storage.objects(bucket_id,name) values ('documents',$1)", [
      `${user}/file`,
    ]);
  }
});
afterAll(async () => {
  await db.close();
});
async function asUser<T>(user: string, fn: () => Promise<T>) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
describe("two separate accounts", () => {
  it.each([
    "profiles",
    "transactions",
    "payments",
    "tasks",
    "calendar_events",
    "pages",
    "files",
    "emails",
  ])("only reads own %s", async (table) => {
    const key = table === "profiles" ? "id" : "user_id";
    const result = await asUser(a, () =>
      db.query<Record<string, string>>(`select * from public.${table}`),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0][key]).toBe(a);
    const other = await asUser(b, () =>
      db.query<Record<string, string>>(`select * from public.${table}`),
    );
    expect(other.rows).toHaveLength(1);
    expect(other.rows[0][key]).toBe(b);
  });
  it("does not expose even own encrypted Google tokens", async () => {
    await expect(
      asUser(a, () => db.query("select * from public.gmail_connections")),
    ).rejects.toThrow();
  });
  it("cannot insert data for a different owner", async () => {
    await expect(
      asUser(a, () =>
        db.query("insert into public.tasks(user_id,title) values ($1,'attack')", [b]),
      ),
    ).rejects.toThrow();
  });
  it("cannot transfer an owned record to another user", async () => {
    await expect(
      asUser(a, () => db.query("update public.tasks set user_id=$1", [b])),
    ).rejects.toThrow();
  });
  it("cannot delete another user's record", async () => {
    const result = await asUser(a, () =>
      db.query("delete from public.tasks where user_id=$1 returning id", [b]),
    );
    expect(result.rows).toHaveLength(0);
  });
  it("prevents linking pages across accounts even with a known ID", async () => {
    const page = await db.query<{ id: string }>("select id from public.pages where user_id=$1", [
      b,
    ]);
    await expect(
      asUser(a, () =>
        db.query("insert into public.pages(user_id,title,parent_id) values ($1,'linked',$2)", [
          a,
          page.rows[0].id,
        ]),
      ),
    ).rejects.toThrow();
  });
  it("prevents storing a file under another user's folder", async () => {
    await expect(
      asUser(a, () =>
        db.query(
          "insert into public.files(user_id,name,storage_path,size_bytes) values ($1,'bad',$2,10)",
          [a, `${b}/attack`],
        ),
      ),
    ).rejects.toThrow();
  });
  it("protects the actual storage objects", async () => {
    const own = await asUser(a, () =>
      db.query<{ name: string }>("select name from storage.objects"),
    );
    expect(own.rows.map((r) => r.name)).toEqual([`${a}/file`]);
    await expect(
      asUser(a, () =>
        db.query("insert into storage.objects(bucket_id,name) values ('documents',$1)", [
          `${b}/attack`,
        ]),
      ),
    ).rejects.toThrow();
    const removed = await asUser(a, () =>
      db.query("delete from storage.objects where name=$1 returning id", [`${b}/file`]),
    );
    expect(removed.rows).toHaveLength(0);
  });
  it("supports own writes", async () => {
    const result = await asUser(a, () =>
      db.query("update public.tasks set done=true where user_id=$1 returning done", [a]),
    );
    expect(result.rows).toEqual([{ done: true }]);
  });
  it("blocks anonymous access", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public.tasks")).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
  });
  it("batch sync preserves user corrections and scopes ownership", async () => {
    await asUser(a, () =>
      db.query("update public.emails set category='Werk',important=true where gmail_id='mail'"),
    );
    const batch = JSON.stringify([
      {
        gmail_id: "mail",
        sender: "updated",
        subject: "updated",
        category: "Overig",
        important: false,
        unread: true,
        received_at: "2026-10-02T12:00:00Z",
      },
    ]);
    await asUser(a, () => db.query("select public.sync_gmail_headers($1::jsonb)", [batch]));
    const own = await asUser(a, () =>
      db.query("select category,important,sender from public.emails"),
    );
    expect(own.rows).toEqual([{ category: "Werk", important: true, sender: "updated" }]);
    const other = await asUser(b, () =>
      db.query("select category,important,sender from public.emails"),
    );
    expect(other.rows).toEqual([{ category: "Overig", important: false, sender: "sender" }]);
  });
});
