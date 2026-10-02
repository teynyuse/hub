-- Run once after the initial migration. Existing account data is kept.
begin;
alter table public.emails add column if not exists snippet text not null default '' check(length(snippet)<=240);
alter table public.emails add column if not exists classification_version integer not null default 0;
alter table public.gmail_connections add column if not exists granted_scope text not null default 'https://www.googleapis.com/auth/gmail.metadata';
-- Recalculate categories on every sync; RLS and auth.uid() bind writes to the caller.
create or replace function public.sync_gmail_messages(items jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or items is null or jsonb_typeof(items)<>'array' or jsonb_array_length(items)>200 then
  raise exception 'Invalid mail batch';
 end if;
 insert into public.emails(user_id,gmail_id,sender,subject,category,important,unread,received_at,snippet,classification_version)
 select auth.uid(),x.gmail_id,x.sender,x.subject,x.category,x.important,x.unread,x.received_at,x.snippet,x.classification_version
 from jsonb_to_recordset(items) as x(gmail_id text,sender text,subject text,category text,important boolean,unread boolean,received_at timestamptz,snippet text,classification_version integer)
 on conflict(user_id,gmail_id) do update set sender=excluded.sender,subject=excluded.subject,
 category=excluded.category,important=excluded.important,unread=excluded.unread,received_at=excluded.received_at,
 snippet=excluded.snippet,classification_version=excluded.classification_version;
end $$;
revoke all on function public.sync_gmail_messages(jsonb) from public;
grant execute on function public.sync_gmail_messages(jsonb) to authenticated;
commit;
