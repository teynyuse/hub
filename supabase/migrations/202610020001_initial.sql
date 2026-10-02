-- Fresh Supabase project. All app data belongs to one account.
begin;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '' check(length(display_name)<=80),
 currency text not null default 'EUR' check(currency in ('EUR','USD','GBP','BGN')),
 timezone text not null default 'Europe/Brussels',
 dashboard_layout jsonb, created_at timestamptz not null default now()
);
create table public.transactions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 200), amount_cents bigint not null check(amount_cents>0 and amount_cents<=99999999999),
 kind text not null check(kind in ('income','expense')),category text not null default 'Overig',date date not null,
 created_at timestamptz not null default now()
);
create table public.payments (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 200),amount_cents bigint not null check(amount_cents>0 and amount_cents<=99999999999),
 due_date date not null,status text not null default 'pending' check(status in ('pending','paid')),created_at timestamptz not null default now()
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 200),due_date date,done boolean not null default false,created_at timestamptz not null default now()
);
create table public.calendar_events (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 200),starts_at timestamptz not null,ends_at timestamptz,
 created_at timestamptz not null default now(),check(ends_at is null or ends_at>starts_at)
);
create table public.pages (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 200),content jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}',
 parent_id uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,user_id),
 foreign key(parent_id,user_id) references public.pages(id,user_id),check(parent_id is null or parent_id<>id)
);
create table public.files (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 255), storage_path text not null unique,
 size_bytes bigint not null check(size_bytes between 1 and 4194304),page_id uuid,created_at timestamptz not null default now(),
 foreign key(page_id,user_id) references public.pages(id,user_id),
 check(split_part(storage_path,'/',1)=user_id::text)
);
create table public.emails (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 gmail_id text not null,sender text not null,subject text not null,category text not null default 'Overig',important boolean not null default false,
 unread boolean not null default false,received_at timestamptz not null,unique(user_id,gmail_id)
);
-- Server-only: no client privileges, even for the user's own encrypted tokens.
create table public.gmail_connections (
 user_id uuid primary key references auth.users(id) on delete cascade,email_address text not null,
 refresh_token_encrypted text not null,connected_at timestamptz not null default now(),last_synced_at timestamptz
);
alter table public.gmail_connections enable row level security;
revoke all on public.gmail_connections from anon,authenticated;
grant all on public.gmail_connections to service_role;
do $$ declare t text; begin
 foreach t in array array['profiles','transactions','payments','tasks','calendar_events','pages','files','emails'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 if t='profiles' then
  execute format('create policy own_data on public.%I for all to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id)',t);
 else
  execute format('create policy own_data on public.%I for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)',t);
  execute format('create index on public.%I (user_id)',t);
 end if;
 end loop;
end $$;
create index transactions_user_date on public.transactions(user_id,date);
create index emails_user_received on public.emails(user_id,received_at desc);
create index payments_user_due on public.payments(user_id,due_date);
create or replace function public.create_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,display_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'display_name',''),80));
 return new;
end $$;
revoke all on function public.create_profile() from public;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_profile();
create or replace function public.touch_page() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now();return new;end $$;
create trigger page_updated before update on public.pages for each row execute function public.touch_page();
insert into storage.buckets (id,name,public,file_size_limit) values ('documents','documents',false,4194304);
create policy own_documents_select on storage.objects for select to authenticated using(bucket_id='documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy own_documents_insert on storage.objects for insert to authenticated with check(bucket_id='documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy own_documents_delete on storage.objects for delete to authenticated using(bucket_id='documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Keep user corrections while updating a batch of Gmail headers atomically.
create function public.sync_gmail_headers(items jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or jsonb_typeof(items)<>'array' or jsonb_array_length(items)>50 then
  raise exception 'Invalid mail batch';
 end if;
 insert into public.emails(user_id,gmail_id,sender,subject,category,important,unread,received_at)
 select auth.uid(),x.gmail_id,x.sender,x.subject,x.category,x.important,x.unread,x.received_at
 from jsonb_to_recordset(items) as x(gmail_id text,sender text,subject text,category text,important boolean,unread boolean,received_at timestamptz)
 on conflict(user_id,gmail_id) do update set sender=excluded.sender,subject=excluded.subject,
 unread=excluded.unread,received_at=excluded.received_at;
end $$;
revoke all on function public.sync_gmail_headers(jsonb) from public;
grant execute on function public.sync_gmail_headers(jsonb) to authenticated;
commit;
