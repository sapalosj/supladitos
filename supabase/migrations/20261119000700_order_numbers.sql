-- 1.7 Per-branch order numbers that are safe for orders created offline
--
-- Order numbers restart at 1 each business date, per branch (#0001, #0002…).
--
-- The device picks the next number itself (from its local copy of today's
-- orders plus the last number the server reported), so it can call the order
-- out to the customer while offline. When the order syncs, `claim_order_number`
-- keeps that number if it is free. If another device already used it, the
-- order gets the next free number instead, and the RPC returns it so the device
-- can update its copy. The sale is never rejected.

create table public.order_number_counters (
  branch_id      uuid not null references public.branches (id) on delete cascade,
  business_date  date not null,
  last_number    integer not null default 0,
  primary key (branch_id, business_date)
);

-- Returns the number to store for this order. Must run inside the transaction
-- that inserts the order (submit_order). Serialises on the counter row so two
-- devices syncing at once cannot take the same number.
create or replace function public.claim_order_number(
  p_branch_id uuid,
  p_business_date date,
  p_requested integer
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_last integer;
  v_number integer;
begin
  insert into public.order_number_counters (branch_id, business_date, last_number)
  values (p_branch_id, p_business_date, 0)
  on conflict (branch_id, business_date) do nothing;

  select last_number into v_last
  from public.order_number_counters
  where branch_id = p_branch_id and business_date = p_business_date
  for update;

  if p_requested is not null and p_requested > 0 and not exists (
    select 1 from public.orders o
    where o.branch_id = p_branch_id
      and o.business_date = p_business_date
      and o.order_number = p_requested
  ) then
    v_number := p_requested;
  else
    v_number := v_last + 1;
    -- Skip any numbers devices already used while offline.
    while exists (
      select 1 from public.orders o
      where o.branch_id = p_branch_id
        and o.business_date = p_business_date
        and o.order_number = v_number
    ) loop
      v_number := v_number + 1;
    end loop;
  end if;

  update public.order_number_counters
  set last_number = greatest(last_number, v_number)
  where branch_id = p_branch_id and business_date = p_business_date;

  return v_number;
end;
$$;

-- The highest order number used today at the caller's branch. The device reads
-- it when online so its local numbering continues from the server's.
create or replace function public.last_order_number(p_business_date date default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(c.last_number), 0)
  from public.order_number_counters c
  where c.branch_id = public.auth_branch_id()
    and c.business_date = coalesce(
      p_business_date,
      public.branch_business_date(public.auth_branch_id())
    )
$$;

revoke execute on function public.claim_order_number(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.last_order_number(date) to authenticated;
