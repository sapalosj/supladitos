-- Pay later: an order can be saved without a payment (submit_order already
-- allows that) and paid afterwards through pay_order.
--
-- * Idempotent: an order has one payment. If it already has one, the stored
--   payment is returned and nothing changes (a retry, or a second device that
--   also took the payment while offline).
-- * The amount is always the order's total; the device only says how it was paid.
--
-- Payload (snake_case JSON):
-- { "id": uuid, "method": "cash" | "gcash" | "maya",
--   "amount_received": numeric | null, "change_due": numeric | null,
--   "paid_at": timestamptz | null }
--
-- Returns: { order_id, payment_id, method, duplicate }

create or replace function public.pay_order(p_order_id uuid, p_payment jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_branch   uuid := public.auth_branch_id();
  v_order    public.orders;
  v_existing public.payments;
  v_id       uuid := coalesce(nullif(p_payment ->> 'id', '')::uuid, gen_random_uuid());
begin
  if v_uid is null or v_branch is null then
    raise exception 'Not signed in as active staff' using errcode = '42501';
  end if;
  if p_order_id is null then
    raise exception 'Order id is required' using errcode = '22023';
  end if;
  if nullif(p_payment ->> 'method', '') is null then
    raise exception 'Payment method is required' using errcode = '22023';
  end if;

  -- Same lock as submit_order, so a payment can't race the order itself.
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 0));

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.branch_id <> v_branch then
    raise exception 'Order belongs to another branch' using errcode = '42501';
  end if;

  select * into v_existing from public.payments where order_id = p_order_id order by created_at limit 1;
  if found then
    return jsonb_build_object(
      'order_id', p_order_id, 'payment_id', v_existing.id, 'method', v_existing.method, 'duplicate', true
    );
  end if;

  insert into public.payments (id, order_id, branch_id, method, amount, amount_received, change_due, created_at)
  values (
    v_id, p_order_id, v_branch,
    (p_payment ->> 'method')::public.payment_method,
    v_order.total,
    nullif(p_payment ->> 'amount_received', '')::numeric,
    nullif(p_payment ->> 'change_due', '')::numeric,
    coalesce(nullif(p_payment ->> 'paid_at', '')::timestamptz, now())
  );

  return jsonb_build_object(
    'order_id', p_order_id, 'payment_id', v_id, 'method', p_payment ->> 'method', 'duplicate', false
  );
end;
$$;

revoke execute on function public.pay_order(uuid, jsonb) from public, anon;
grant execute on function public.pay_order(uuid, jsonb) to authenticated;

-- Finding unpaid orders: recent orders with no payment row.
create index if not exists orders_branch_business_date_idx on public.orders (branch_id, business_date);
