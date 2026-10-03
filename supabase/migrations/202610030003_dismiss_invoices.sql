begin;
alter table public.invoices add column dismissed_at timestamptz;
create index invoices_visible on public.invoices(user_id, dismissed_at, status, due_date);
commit;
