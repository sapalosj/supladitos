-- 4.x Menu management: atomic saves for the Menu screen.
--
-- All functions are SECURITY INVOKER, so the RLS policies from 1.8 still
-- decide who may write (owners and managers, own branch only). They only
-- bundle several writes into one transaction so the menu is never left half
-- saved. New rows use ids generated on the device.

-- Save a menu item with its variants and attached modifier groups (4.2, 4.3, 4.6).
-- Payload:
-- { "id": uuid, "category_id": uuid, "name": text, "description": text | null,
--   "is_available": bool,
--   "variants": [{ "id": uuid, "name": text, "price": numeric }],   -- in display order
--   "modifier_group_ids": [uuid] }                                  -- in display order
create or replace function public.save_menu_item(p_item jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id        uuid := (p_item ->> 'id')::uuid;
  v_category  uuid := (p_item ->> 'category_id')::uuid;
  v_name      text := nullif(btrim(p_item ->> 'name'), '');
  v_variant   jsonb;
  v_ids       uuid[] := '{}';
  v_idx       integer := 0;
  v_sort      integer;
begin
  if v_id is null or v_category is null or v_name is null then
    raise exception 'Item id, category and name are required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_item -> 'variants') is distinct from 'array' or jsonb_array_length(p_item -> 'variants') = 0 then
    raise exception 'An item needs at least one price' using errcode = '22023';
  end if;

  -- New items go to the end of their category.
  select coalesce(max(sort_order), 0) + 1 into v_sort
  from public.menu_items where category_id = v_category;

  insert into public.menu_items (id, category_id, name, description, is_available, sort_order)
  values (
    v_id, v_category, v_name,
    nullif(btrim(p_item ->> 'description'), ''),
    coalesce((p_item ->> 'is_available')::boolean, true),
    v_sort
  )
  on conflict (id) do update set
    category_id  = excluded.category_id,
    name         = excluded.name,
    description  = excluded.description,
    is_available = excluded.is_available,
    -- Moving to another category puts the item at the end of it.
    sort_order   = case when public.menu_items.category_id = excluded.category_id
                        then public.menu_items.sort_order else excluded.sort_order end;

  for v_variant in select value from jsonb_array_elements(p_item -> 'variants') loop
    v_idx := v_idx + 1;
    if nullif(btrim(v_variant ->> 'name'), '') is null then
      raise exception 'Every price needs a name (e.g. Hot, Regular)' using errcode = '22023';
    end if;
    v_ids := v_ids || (v_variant ->> 'id')::uuid;
    insert into public.item_variants (id, menu_item_id, name, price, sort_order)
    values ((v_variant ->> 'id')::uuid, v_id, btrim(v_variant ->> 'name'), (v_variant ->> 'price')::numeric, v_idx)
    on conflict (id) do update set
      name = excluded.name, price = excluded.price, sort_order = excluded.sort_order;
  end loop;

  delete from public.item_variants where menu_item_id = v_id and id <> all (v_ids);

  delete from public.item_modifier_groups where menu_item_id = v_id;
  insert into public.item_modifier_groups (menu_item_id, modifier_group_id, sort_order)
  select v_id, g.value::uuid, g.ordinality
  from jsonb_array_elements_text(coalesce(p_item -> 'modifier_group_ids', '[]'::jsonb)) with ordinality as g;

  return v_id;
end;
$$;

-- Save a modifier group with its modifiers and per-variant prices (4.4, 4.5).
-- Payload:
-- { "id": uuid, "name": text, "min_select": int, "max_select": int | null,
--   "is_required": bool, "allow_quantity": bool,
--   "modifiers": [{ "id": uuid, "name": text, "price_delta": numeric, "is_available": bool,
--                   "variant_prices": { "<variant name>": numeric } }] }   -- in display order
create or replace function public.save_modifier_group(p_group jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id     uuid := (p_group ->> 'id')::uuid;
  v_name   text := nullif(btrim(p_group ->> 'name'), '');
  v_mod    jsonb;
  v_mod_id uuid;
  v_ids    uuid[] := '{}';
  v_idx    integer := 0;
  v_sort   integer;
begin
  if v_id is null or v_name is null then
    raise exception 'Group id and name are required' using errcode = '22023';
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.modifier_groups;

  insert into public.modifier_groups (id, name, min_select, max_select, is_required, allow_quantity, sort_order)
  values (
    v_id, v_name,
    coalesce((p_group ->> 'min_select')::integer, 0),
    nullif(p_group ->> 'max_select', '')::integer,
    coalesce((p_group ->> 'is_required')::boolean, false),
    coalesce((p_group ->> 'allow_quantity')::boolean, false),
    v_sort
  )
  on conflict (id) do update set
    name = excluded.name,
    min_select = excluded.min_select,
    max_select = excluded.max_select,
    is_required = excluded.is_required,
    allow_quantity = excluded.allow_quantity;

  for v_mod in select value from jsonb_array_elements(coalesce(p_group -> 'modifiers', '[]'::jsonb)) loop
    v_idx := v_idx + 1;
    v_mod_id := (v_mod ->> 'id')::uuid;
    if nullif(btrim(v_mod ->> 'name'), '') is null then
      raise exception 'Every option needs a name' using errcode = '22023';
    end if;
    v_ids := v_ids || v_mod_id;
    insert into public.modifiers (id, modifier_group_id, name, price_delta, is_available, sort_order)
    values (
      v_mod_id, v_id, btrim(v_mod ->> 'name'),
      coalesce((v_mod ->> 'price_delta')::numeric, 0),
      coalesce((v_mod ->> 'is_available')::boolean, true),
      v_idx
    )
    on conflict (id) do update set
      name = excluded.name, price_delta = excluded.price_delta,
      is_available = excluded.is_available, sort_order = excluded.sort_order;

    delete from public.modifier_variant_prices where modifier_id = v_mod_id;
    insert into public.modifier_variant_prices (modifier_id, variant_name, price_delta)
    select v_mod_id, btrim(vp.key), vp.value::numeric
    from jsonb_each_text(coalesce(v_mod -> 'variant_prices', '{}'::jsonb)) as vp
    where nullif(btrim(vp.key), '') is not null and nullif(vp.value, '') is not null;
  end loop;

  delete from public.modifiers where modifier_group_id = v_id and id <> all (v_ids);

  return v_id;
end;
$$;

-- Set the display order of categories, items (within a category) or modifier
-- groups (4.1, 4.2): ids in the new order get sort_order 1, 2, 3…
create or replace function public.set_sort_order(p_table text, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_table not in ('categories', 'menu_items', 'modifier_groups') then
    raise exception 'Cannot sort %', p_table using errcode = '22023';
  end if;
  execute format(
    'update public.%I t set sort_order = o.ord from unnest($1) with ordinality as o(id, ord) where t.id = o.id',
    p_table
  ) using p_ids;
end;
$$;

revoke execute on function public.save_menu_item(jsonb) from public, anon;
revoke execute on function public.save_modifier_group(jsonb) from public, anon;
revoke execute on function public.set_sort_order(text, uuid[]) from public, anon;
grant execute on function public.save_menu_item(jsonb) to authenticated;
grant execute on function public.save_modifier_group(jsonb) to authenticated;
grant execute on function public.set_sort_order(text, uuid[]) to authenticated;
