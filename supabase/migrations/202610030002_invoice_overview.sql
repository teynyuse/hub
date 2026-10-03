begin;
create table public.recurring_costs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 200), supplier text not null default '', provider_key text not null default '',
 cost_category text not null default 'Overig', amount_cents bigint not null check(amount_cents between 1 and 99999999999),
 day_of_month integer not null check(day_of_month between 1 and 31), start_month date not null check(extract(day from start_month)=1),
 active boolean not null default true, created_at timestamptz not null default now(), unique(id,user_id)
);
create table public.invoices (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 200), supplier text not null default '', provider_key text not null default '',
 cost_category text not null default 'Overig', amount_cents bigint check(amount_cents between 1 and 99999999999),
 due_date date, billing_month date not null check(extract(day from billing_month)=1),
 status text not null default 'pending' check(status in ('pending','paid')), paid_at timestamptz,
 source text not null check(source in ('gmail','manual','recurring')), source_key text not null,
 gmail_id text, invoice_number text, needs_review boolean not null default false, reviewed_at timestamptz,
 recurring_cost_id uuid, created_at timestamptz not null default now(),
 foreign key(recurring_cost_id,user_id) references public.recurring_costs(id,user_id),
 unique(user_id,source_key), unique(user_id,recurring_cost_id,billing_month)
);
create index invoices_user_due on public.invoices(user_id,status,due_date);
create unique index invoices_reference on public.invoices(user_id,provider_key,invoice_number) where invoice_number is not null;
create unique index invoices_gmail on public.invoices(user_id,gmail_id) where gmail_id is not null;
do $$ declare t text; begin
 foreach t in array array['invoices','recurring_costs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy own_data on public.%I for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)',t);
 end loop;
end $$;
-- Preserve payments that were already entered in Money.
insert into public.invoices(user_id,title,amount_cents,due_date,billing_month,status,source,source_key)
select user_id,title,amount_cents,due_date,date_trunc('month',due_date)::date,status,'manual','legacy:'||id from public.payments
on conflict(user_id,source_key) do nothing;

create function public.ensure_recurring_invoices(target_month date) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or target_month<>date_trunc('month',target_month)::date
    or target_month < current_date-interval '5 years' or target_month > current_date+interval '2 years' then
  raise exception 'Invalid invoice month';
 end if;
 -- Attach an unambiguous actual bill to its monthly plan before generating estimates.
 update public.invoices i set recurring_cost_id=(select r.id from public.recurring_costs r
   where r.user_id=auth.uid() and r.active and r.provider_key=i.provider_key and r.start_month<=i.billing_month limit 1)
 where i.user_id=auth.uid() and i.source='gmail' and i.recurring_cost_id is null and i.provider_key<>''
   and (select count(*) from public.recurring_costs r where r.user_id=auth.uid() and r.active and r.provider_key=i.provider_key and r.start_month<=i.billing_month)=1
   and (select count(*) from public.invoices j where j.user_id=auth.uid() and j.provider_key=i.provider_key and j.billing_month=i.billing_month)=1;
 insert into public.invoices(user_id,title,supplier,provider_key,cost_category,amount_cents,due_date,billing_month,source,source_key,recurring_cost_id)
 select r.user_id,r.title,r.supplier,r.provider_key,r.cost_category,r.amount_cents,
   m::date+least(r.day_of_month-1,extract(day from (m+interval '1 month - 1 day'))::integer-1),
   m::date,'recurring','recurring:'||r.id||':'||to_char(m,'YYYY-MM'),r.id
 from public.recurring_costs r cross join lateral generate_series(
   greatest(r.start_month, (date_trunc('month',current_date)-interval '5 years')::date),target_month,interval '1 month') m
 where r.user_id=auth.uid() and r.active
 on conflict(user_id,recurring_cost_id,billing_month) do nothing;
end $$;
revoke all on function public.ensure_recurring_invoices(date) from public;
grant execute on function public.ensure_recurring_invoices(date) to authenticated;

create function public.save_recurring_cost(cost_id uuid,details jsonb,target_month date) returns uuid
language plpgsql security invoker set search_path='' as $$
declare saved_id uuid;
begin
 if auth.uid() is null then raise exception 'Not signed in'; end if;
 if cost_id is null then
  insert into public.recurring_costs(user_id,title,supplier,provider_key,cost_category,amount_cents,day_of_month,start_month)
  values(auth.uid(),details->>'title',details->>'supplier',details->>'provider_key',details->>'cost_category',
    (details->>'amount_cents')::bigint,(details->>'day_of_month')::integer,(details->>'start_month')::date) returning id into saved_id;
 else
  update public.recurring_costs set title=details->>'title',supplier=details->>'supplier',provider_key=details->>'provider_key',
   cost_category=details->>'cost_category',amount_cents=(details->>'amount_cents')::bigint,
   day_of_month=(details->>'day_of_month')::integer,start_month=(details->>'start_month')::date
  where id=cost_id and user_id=auth.uid() returning id into saved_id;
  if saved_id is null then raise exception 'Unknown recurring cost'; end if;
 end if;
 update public.invoices i set title=r.title,supplier=r.supplier,provider_key=r.provider_key,cost_category=r.cost_category,
   amount_cents=r.amount_cents,due_date=i.billing_month+least(r.day_of_month-1,extract(day from (i.billing_month+interval '1 month - 1 day'))::integer-1)
 from public.recurring_costs r where r.id=saved_id and i.recurring_cost_id=r.id and i.user_id=auth.uid()
  and i.billing_month>=target_month and i.status='pending' and i.gmail_id is null and i.reviewed_at is null;
 perform public.ensure_recurring_invoices(target_month);
 return saved_id;
end $$;
revoke all on function public.save_recurring_cost(uuid,jsonb,date) from public;
grant execute on function public.save_recurring_cost(uuid,jsonb,date) to authenticated;

alter table public.gmail_connections
 add column sync_history_id text,
 add column pending_history_id text,
 add column sync_queue jsonb not null default '[]' check(jsonb_typeof(sync_queue)='array' and jsonb_array_length(sync_queue)<=10000),
 add column next_sync_at timestamptz not null default now(),
 add column sync_lock_id uuid,
 add column sync_lock_until timestamptz,
 add column last_sync_error text;
create index gmail_connections_due on public.gmail_connections(next_sync_at);
create function public.claim_invoice_sync(account_id uuid,lease_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 update public.gmail_connections g set sync_lock_id=lease_id,sync_lock_until=now()+interval '5 minutes'
 where g.user_id=account_id and g.next_sync_at<=now() and (g.sync_lock_until is null or g.sync_lock_until<now())
 returning to_jsonb(g) into result;
 return result;
end $$;

-- Save every completed group and its queue in one transaction. A lost worker can resume.
create function public.save_invoice_sync(account_id uuid,lease_id uuid,items jsonb,remaining jsonb,checkpoint text,finish boolean,error_text text default null) returns void
language plpgsql security definer set search_path='' as $$
declare item jsonb; bill jsonb; invoice_id uuid; matches integer;
begin
 perform 1 from public.gmail_connections where user_id=account_id and sync_lock_id=lease_id and sync_lock_until>now() for update;
 if not found then raise exception 'Sync lease expired'; end if;
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items)>5 or jsonb_typeof(remaining)<>'array' or jsonb_array_length(remaining)>10000 then
  raise exception 'Invalid sync batch';
 end if;
 for item in select value from jsonb_array_elements(items) loop
  insert into public.emails(user_id,gmail_id,sender,subject,category,important,unread,received_at,snippet,classification_version)
  values(account_id,item->>'gmail_id',item->>'sender',item->>'subject',item->>'category',(item->>'important')::boolean,
    (item->>'unread')::boolean,(item->>'received_at')::timestamptz,item->>'snippet',(item->>'classification_version')::integer)
  on conflict(user_id,gmail_id) do update set category=excluded.category,important=excluded.important,snippet=excluded.snippet,
    classification_version=excluded.classification_version;
  bill:=item->'invoice';
  if bill is null or bill='null'::jsonb then continue; end if;
  invoice_id:=null;
  select i.id into invoice_id from public.invoices i where i.user_id=account_id and
    (i.gmail_id=item->>'gmail_id' or (bill->>'invoice_number' is not null and i.provider_key=bill->>'provider_key' and i.invoice_number=bill->>'invoice_number')) limit 1;
  if invoice_id is null and coalesce(bill->>'provider_key','')<>'' then
   select count(*), min(i.id::text)::uuid into matches,invoice_id from public.invoices i
   where i.user_id=account_id and i.recurring_cost_id is not null and i.gmail_id is null
     and i.provider_key=bill->>'provider_key' and i.billing_month=(bill->>'billing_month')::date;
   if matches<>1 then invoice_id:=null; end if;
  end if;
  if invoice_id is null then
   insert into public.invoices(user_id,title,supplier,provider_key,cost_category,amount_cents,due_date,billing_month,source,source_key,gmail_id,invoice_number,needs_review)
   values(account_id,bill->>'title',bill->>'supplier',bill->>'provider_key',bill->>'cost_category',(bill->>'amount_cents')::bigint,
     (bill->>'due_date')::date,(bill->>'billing_month')::date,'gmail','gmail:'||(item->>'gmail_id'),item->>'gmail_id',bill->>'invoice_number',(bill->>'needs_review')::boolean);
  else
   update public.invoices set gmail_id=coalesce(gmail_id,item->>'gmail_id'),invoice_number=coalesce(invoice_number,bill->>'invoice_number'),
     amount_cents=case when reviewed_at is null then coalesce((bill->>'amount_cents')::bigint,amount_cents) else amount_cents end,
     due_date=case when reviewed_at is null then coalesce((bill->>'due_date')::date,due_date) else due_date end,
     needs_review=case when reviewed_at is null then (bill->>'needs_review')::boolean else needs_review end
   where id=invoice_id and user_id=account_id;
  end if;
 end loop;
 update public.gmail_connections set sync_queue=remaining,pending_history_id=checkpoint,
   sync_history_id=case when finish and error_text is null and jsonb_array_length(remaining)=0 then checkpoint else sync_history_id end,
   last_synced_at=case when finish and error_text is null and jsonb_array_length(remaining)=0 then now() else last_synced_at end,
   next_sync_at=case when finish then now()+interval '30 minutes' else next_sync_at end,
   last_sync_error=case when finish then left(error_text,500) else last_sync_error end,
   sync_lock_id=case when finish then null else sync_lock_id end,
   sync_lock_until=case when finish then null else now()+interval '5 minutes' end
 where user_id=account_id and sync_lock_id=lease_id;
end $$;
revoke all on function public.claim_invoice_sync(uuid,uuid) from public;
revoke all on function public.save_invoice_sync(uuid,uuid,jsonb,jsonb,text,boolean,text) from public;
grant execute on function public.claim_invoice_sync(uuid,uuid) to service_role;
grant execute on function public.save_invoice_sync(uuid,uuid,jsonb,jsonb,text,boolean,text) to service_role;
commit;
