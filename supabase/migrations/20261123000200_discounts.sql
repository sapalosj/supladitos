-- Discounts: a percentage off chosen units of an order line (e.g. 2 of the 5
-- drinks on an order), not off the whole bill.
--
-- * `discounts` is the branch's list of discount types (name + percentage).
-- * An order line records which discount it got, on how many units, and the
--   peso amount. unit_price and line_total stay at the full price.
-- * The discount covers the drink and its add-ons, rounded to the peso per unit.
-- * orders.subtotal is the full price, discount_total the discounts,
--   total = subtotal - discount_total.
-- * set_order_discounts changes the discounts of a saved order: an unpaid one
--   at payment time, or a paid one when the customer turns out to be eligible
--   (the payment amount follows the new total; the difference is refunded).

create table public.discounts (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null default public.auth_branch_id() references public.branches (id),
  name        text not null check (length(btrim(name)) > 0),
  percent     numeric(5, 2) not null check (percent > 0 and percent <= 100),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index discounts_branch_id_idx on public.discounts (branch_id);

alter table public.discounts enable row level security;

create policy "staff read branch rows" on public.discounts for select to authenticated
  using (branch_id = (select public.auth_branch_id()));
create policy "managers insert branch rows" on public.discounts for insert to authenticated
  with check (branch_id = (select public.auth_branch_id()) and (select public.auth_is_manager()));
create policy "managers update branch rows" on public.discounts for update to authenticated
  using (branch_id = (select public.auth_branch_id()) and (select public.auth_is_manager()))
  with check (branch_id = (select public.auth_branch_id()));
create policy "managers delete branch rows" on public.discounts for delete to authenticated
  using (branch_id = (select public.auth_branch_id()) and (select public.auth_is_manager()));

revoke all on public.discounts from anon;

-- Every existing branch starts with the 20% discount.
insert into public.discounts (branch_id, name, percent)
select id, '20% discount', 20 from public.branches;

alter table public.orders
  add column discount_total numeric(10, 2) not null default 0 check (discount_total >= 0);

alter table public.order_items
  add column discount_id        uuid references public.discounts (id) on delete set null,
  add column discount_name      text,
  add column discount_percent   numeric(5, 2),
  add column discount_quantity  integer not null default 0 check (discount_quantity >= 0),
  add column discount_amount    numeric(10, 2) not null default 0 check (discount_amount >= 0),
  add constraint order_items_discount_within_quantity check (discount_quantity <= quantity);

-- Discount on a line: the percentage off one unit, rounded to the peso, times
-- the number of discounted units.
create or replace function public.line_discount_amount(p_unit_price numeric, p_percent numeric, p_quantity integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(p_unit_price * p_percent / 100) * p_quantity
$$;

-- submit_order, now with line discounts. Each item may carry
--   "discount_id": uuid, "discount_name": text, "discount_percent": numeric,
--   "discount_quantity": int, "discount_amount": numeric
-- and the order "discount_total". As with prices, a sale is never rejected:
-- a discount that doesn't add up is stored as charged and flagged.

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
  v_disc_qty      integer;
  v_disc_pct      numeric(5, 2);
  v_disc_id       uuid;
  v_disc_amount   numeric(10, 2);
  v_disc_total    numeric(10, 2) := 0;   -- as charged by the device
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
    status, status_changed_at, subtotal, discount_total, total, void_reason, voided_at, voided_by,
    created_by, created_at, synced_at
  ) values (
    v_order_id, v_branch, v_number, v_business_date,
    coalesce(nullif(p_order ->> 'order_type', ''), 'dine_in')::public.order_type,
    nullif(btrim(p_order ->> 'customer_name'), ''),
    v_status,
    nullif(p_order ->> 'status_changed_at', '')::timestamptz,
    v_subtotal, coalesce((p_order ->> 'discount_total')::numeric, 0), v_total,
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
      unit_price, quantity, line_total, notes, sort_order,
      discount_id, discount_name, discount_percent, discount_quantity, discount_amount
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
      v_idx,
      null, null, null, 0, 0
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

    -- Line discount: a percentage off some units of the line, rounded to the
    -- peso per unit. Stored as charged; the server's own figure (its unit
    -- price, the discount's current percentage) goes into computed_total.
    v_disc_qty := least(greatest(coalesce((v_item ->> 'discount_quantity')::integer, 0), 0), v_qty);
    if v_disc_qty > 0 then
      v_disc_id := nullif(v_item ->> 'discount_id', '')::uuid;
      select d.percent into v_disc_pct
      from public.discounts d
      where d.id = v_disc_id and d.branch_id = v_branch;
      if not found then
        v_disc_id := null;
        v_disc_pct := (v_item ->> 'discount_percent')::numeric;
        v_mismatch := true;
      elsif v_disc_pct <> (v_item ->> 'discount_percent')::numeric then
        v_mismatch := true;
      end if;
      v_disc_amount := coalesce((v_item ->> 'discount_amount')::numeric, 0);
      if v_disc_amount <> public.line_discount_amount(v_unit, v_disc_pct, v_disc_qty) then
        v_mismatch := true;
      end if;
      v_computed := v_computed - public.line_discount_amount(v_unit, v_disc_pct, v_disc_qty);
      v_disc_total := v_disc_total + v_disc_amount;

      update public.order_items
      set discount_id = v_disc_id,
          discount_name = coalesce(nullif(v_item ->> 'discount_name', ''), 'Discount'),
          discount_percent = (v_item ->> 'discount_percent')::numeric,
          discount_quantity = v_disc_qty,
          discount_amount = v_disc_amount
      where id = v_item_id;
    end if;
  end loop;

  if not v_known or v_computed <> v_total
     or v_disc_total <> coalesce((p_order ->> 'discount_total')::numeric, 0) then
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

-- Change the discounts on a saved order.
--
-- Payload: { "items": [{ "id": order item uuid, "discount_id": uuid,
--            "discount_name": text, "discount_percent": numeric, "discount_quantity": int }] }
-- Lines not listed (or with quantity 0) lose their discount. The amounts are
-- calculated here from the price the line was charged at. Sending the same
-- payload again changes nothing.
--
-- Returns: { id, subtotal, discount_total, total }

create or replace function public.set_order_discounts(p_order_id uuid, p_discounts jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_branch  uuid := public.auth_branch_id();
  v_order   public.orders;
  v_line    public.order_items;
  v_item    jsonb;
  v_qty     integer;
  v_pct     numeric(5, 2);
  v_disc_id uuid;
  v_total   numeric(10, 2) := 0;
begin
  if v_uid is null or v_branch is null then
    raise exception 'Not signed in as active staff' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 0));

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.branch_id <> v_branch then
    raise exception 'Order belongs to another branch' using errcode = '42501';
  end if;

  for v_line in select * from public.order_items where order_id = p_order_id loop
    select value into v_item
    from jsonb_array_elements(coalesce(p_discounts -> 'items', '[]'::jsonb))
    where (value ->> 'id')::uuid = v_line.id
    limit 1;

    v_qty := case when found
      then least(greatest(coalesce((v_item ->> 'discount_quantity')::integer, 0), 0), v_line.quantity)
      else 0 end;

    if v_qty = 0 then
      update public.order_items
      set discount_id = null, discount_name = null, discount_percent = null, discount_quantity = 0, discount_amount = 0
      where id = v_line.id;
    else
      v_disc_id := nullif(v_item ->> 'discount_id', '')::uuid;
      select d.percent into v_pct from public.discounts d where d.id = v_disc_id and d.branch_id = v_branch;
      if not found then
        raise exception 'Unknown discount' using errcode = '22023';
      end if;
      update public.order_items
      set discount_id = v_disc_id,
          discount_name = coalesce(nullif(v_item ->> 'discount_name', ''), 'Discount'),
          discount_percent = v_pct,
          discount_quantity = v_qty,
          discount_amount = public.line_discount_amount(v_line.unit_price, v_pct, v_qty)
      where id = v_line.id;
      v_total := v_total + public.line_discount_amount(v_line.unit_price, v_pct, v_qty);
    end if;
  end loop;

  v_total := least(v_total, v_order.subtotal);

  update public.orders
  set total = subtotal - v_total,
      computed_total = computed_total + discount_total - v_total,
      discount_total = v_total
  where id = p_order_id;

  -- A paid order's payment follows the new total.
  update public.payments set amount = v_order.subtotal - v_total where order_id = p_order_id;

  return jsonb_build_object(
    'id', p_order_id, 'subtotal', v_order.subtotal, 'discount_total', v_total, 'total', v_order.subtotal - v_total
  );
end;
$$;

revoke execute on function public.set_order_discounts(uuid, jsonb) from public, anon;
grant execute on function public.set_order_discounts(uuid, jsonb) to authenticated;
revoke execute on function public.line_discount_amount(numeric, numeric, integer) from public, anon;
grant execute on function public.line_discount_amount(numeric, numeric, integer) to authenticated;
