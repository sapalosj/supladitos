-- 1.9 / 1.10 submit_order: save an order, its lines, modifiers and payment in
-- one transaction.
--
-- * Idempotent: the order id is generated on the device. Sending the same order
--   again returns the stored result and changes nothing.
-- * Never rejects a sale because of price: the server recalculates every line
--   from the menu and, if anything differs from what the device charged (or
--   an item no longer exists), stores the order as charged and sets
--   price_mismatch = true.
--
-- Payload (snake_case JSON):
-- {
--   "id": uuid, "created_at": timestamptz, "business_date": date,
--   "order_number": int, "order_type": "dine_in" | "takeout",
--   "customer_name": text | null, "status": "new" | "preparing" | "done" | "voided",
--   "status_changed_at": timestamptz | null, "void_reason": text | null, "voided_at": timestamptz | null,
--   "subtotal": numeric, "total": numeric,
--   "items": [{
--     "id": uuid, "menu_item_id": uuid, "variant_id": uuid,
--     "item_name": text, "variant_name": text | null,
--     "unit_price": numeric, "quantity": int, "line_total": numeric, "notes": text | null,
--     "modifiers": [{ "id": uuid, "modifier_id": uuid, "name": text, "price_delta": numeric, "quantity": int }]
--   }],
--   "payment": { "id": uuid, "method": "cash" | "gcash" | "maya", "amount": numeric,
--                "amount_received": numeric | null, "change_due": numeric | null }
-- }
--
-- Returns: { id, order_number, business_date, price_mismatch, computed_total, duplicate }

create or replace function public.submit_order(p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid           uuid := auth.uid();
  v_branch        uuid := public.auth_branch_id();
  v_order_id      uuid := nullif(p_order ->> 'id', '')::uuid;
  v_existing      public.orders;
  v_created_at    timestamptz := coalesce(nullif(p_order ->> 'created_at', '')::timestamptz, now());
  v_business_date date;
  v_number        integer;
  v_status        public.order_status := coalesce(nullif(p_order ->> 'status', ''), 'new')::public.order_status;
  v_total         numeric(10, 2) := (p_order ->> 'total')::numeric;
  v_subtotal      numeric(10, 2) := coalesce((p_order ->> 'subtotal')::numeric, v_total);
  v_item          jsonb;
  v_mod           jsonb;
  v_item_id       uuid;
  v_variant       public.item_variants;
  v_unit          numeric(10, 2);
  v_mod_price     numeric(10, 2);
  v_mod_qty       integer;
  v_qty           integer;
  v_computed      numeric(10, 2) := 0;
  v_known         boolean := true;   -- every item and modifier still exists
  v_mismatch      boolean := false;
  v_idx           integer := 0;
  v_payment       jsonb := p_order -> 'payment';
begin
  if v_uid is null or v_branch is null then
    raise exception 'Not signed in as active staff' using errcode = '42501';
  end if;
  if v_order_id is null then
    raise exception 'Order id is required' using errcode = '22023';
  end if;
  if v_total is null then
    raise exception 'Order total is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_order -> 'items') is distinct from 'array' or jsonb_array_length(p_order -> 'items') = 0 then
    raise exception 'Order has no items' using errcode = '22023';
  end if;

  -- Serialise retries of the same order (e.g. two sync loops at once).
  perform pg_advisory_xact_lock(hashtextextended(v_order_id::text, 0));

  select * into v_existing from public.orders where id = v_order_id;
  if found then
    if v_existing.branch_id <> v_branch then
      raise exception 'Order belongs to another branch' using errcode = '42501';
    end if;
    return jsonb_build_object(
      'id', v_existing.id,
      'order_number', v_existing.order_number,
      'business_date', v_existing.business_date,
      'price_mismatch', v_existing.price_mismatch,
      'computed_total', v_existing.computed_total,
      'duplicate', true
    );
  end if;

  v_business_date := coalesce(
    nullif(p_order ->> 'business_date', '')::date,
    public.branch_business_date(v_branch, v_created_at)
  );
  v_number := public.claim_order_number(v_branch, v_business_date, nullif(p_order ->> 'order_number', '')::integer);

  insert into public.orders (
    id, branch_id, order_number, business_date, order_type, customer_name,
    status, status_changed_at, subtotal, total, void_reason, voided_at, voided_by,
    created_by, created_at, synced_at
  ) values (
    v_order_id, v_branch, v_number, v_business_date,
    coalesce(nullif(p_order ->> 'order_type', ''), 'dine_in')::public.order_type,
    nullif(btrim(p_order ->> 'customer_name'), ''),
    v_status,
    nullif(p_order ->> 'status_changed_at', '')::timestamptz,
    v_subtotal, v_total,
    case when v_status = 'voided' then nullif(btrim(p_order ->> 'void_reason'), '') end,
    case when v_status = 'voided' then coalesce(nullif(p_order ->> 'voided_at', '')::timestamptz, now()) end,
    case when v_status = 'voided' then v_uid end,
    v_uid, v_created_at, now()
  );

  for v_item in select value from jsonb_array_elements(p_order -> 'items') loop
    v_idx := v_idx + 1;
    v_item_id := (v_item ->> 'id')::uuid;
    v_qty := coalesce((v_item ->> 'quantity')::integer, 1);

    -- Server price for one unit: variant (or branch override) + modifiers.
    select * into v_variant
    from public.item_variants iv
    where iv.id = nullif(v_item ->> 'variant_id', '')::uuid
      and iv.branch_id = v_branch
      and iv.menu_item_id = nullif(v_item ->> 'menu_item_id', '')::uuid;

    if found then
      v_unit := coalesce(
        (select bo.price from public.branch_overrides bo
          where bo.branch_id = v_branch and bo.variant_id = v_variant.id and bo.price is not null),
        v_variant.price
      );
    else
      v_known := false;
      v_unit := 0;
    end if;

    insert into public.order_items (
      id, order_id, branch_id, menu_item_id, variant_id,
      item_name_snapshot, variant_name_snapshot,
      unit_price, quantity, line_total, notes, sort_order
    ) values (
      v_item_id, v_order_id, v_branch,
      (select mi.id from public.menu_items mi where mi.id = nullif(v_item ->> 'menu_item_id', '')::uuid and mi.branch_id = v_branch),
      v_variant.id,
      coalesce(nullif(v_item ->> 'item_name', ''), 'Unknown item'),
      nullif(v_item ->> 'variant_name', ''),
      (v_item ->> 'unit_price')::numeric,
      v_qty,
      (v_item ->> 'line_total')::numeric,
      nullif(btrim(v_item ->> 'notes'), ''),
      v_idx
    );

    if jsonb_typeof(v_item -> 'modifiers') = 'array' then
      for v_mod in select value from jsonb_array_elements(v_item -> 'modifiers') loop
        v_mod_qty := coalesce((v_mod ->> 'quantity')::integer, 1);

        select coalesce(mvp.price_delta, m.price_delta) into v_mod_price
        from public.modifiers m
        left join public.modifier_variant_prices mvp
          on mvp.modifier_id = m.id and mvp.variant_name = v_variant.name
        where m.id = nullif(v_mod ->> 'modifier_id', '')::uuid
          and m.branch_id = v_branch;

        if found then
          v_unit := v_unit + v_mod_price * v_mod_qty;
        else
          v_known := false;
        end if;

        insert into public.order_item_modifiers (
          id, order_item_id, branch_id, modifier_id, name_snapshot, price_delta, quantity
        ) values (
          (v_mod ->> 'id')::uuid, v_item_id, v_branch,
          (select m.id from public.modifiers m where m.id = nullif(v_mod ->> 'modifier_id', '')::uuid and m.branch_id = v_branch),
          coalesce(nullif(v_mod ->> 'name', ''), 'Unknown modifier'),
          coalesce((v_mod ->> 'price_delta')::numeric, 0),
          v_mod_qty
        );
      end loop;
    end if;

    if v_unit <> (v_item ->> 'unit_price')::numeric
       or v_unit * v_qty <> (v_item ->> 'line_total')::numeric then
      v_mismatch := true;
    end if;
    v_computed := v_computed + v_unit * v_qty;
  end loop;

  if not v_known or v_computed <> v_total then
    v_mismatch := true;
  end if;

  update public.orders
  set computed_total = case when v_known then v_computed end,
      price_mismatch = v_mismatch
  where id = v_order_id;

  if v_payment is not null and jsonb_typeof(v_payment) = 'object' then
    insert into public.payments (id, order_id, branch_id, method, amount, amount_received, change_due, created_at)
    values (
      coalesce(nullif(v_payment ->> 'id', '')::uuid, gen_random_uuid()),
      v_order_id, v_branch,
      (v_payment ->> 'method')::public.payment_method,
      coalesce((v_payment ->> 'amount')::numeric, v_total),
      nullif(v_payment ->> 'amount_received', '')::numeric,
      nullif(v_payment ->> 'change_due', '')::numeric,
      v_created_at
    );
  end if;

  return jsonb_build_object(
    'id', v_order_id,
    'order_number', v_number,
    'business_date', v_business_date,
    'price_mismatch', v_mismatch,
    'computed_total', case when v_known then v_computed end,
    'duplicate', false
  );
end;
$$;

revoke execute on function public.submit_order(jsonb) from public, anon;
grant execute on function public.submit_order(jsonb) to authenticated;
