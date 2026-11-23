-- Local development seed: one branch, one owner login, and the menu.
-- Runs after migrations on `npm run db:reset`.
--
-- Owner login (local only):  owner@supladitos.local / supladitos
--
-- Menu source: Menu.pdf (Nov 2026), via the Supladitos page designs, which list
-- the Coffee prices and Hawaiian (240). Menu.pdf itself is not in the repo yet.
-- Prices marked PLACEHOLDER below are not on any source we have: confirm them
-- against Menu.pdf (or fix them in the Menu screen) before using the app for
-- real sales.

-- Branch -----------------------------------------------------------------------
insert into public.branches (id, name, timezone)
values ('00000000-0000-4000-8000-000000000001', 'Main branch', 'Asia/Manila');

insert into public.discounts (branch_id, name, percent)
values ('00000000-0000-4000-8000-000000000001', '20% discount', 20);

-- Owner login --------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-0000000000aa',
  'authenticated', 'authenticated',
  'owner@supladitos.local',
  extensions.crypt('supladitos', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"Owner"}',
  now(), now(), '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(),
  '00000000-0000-4000-8000-0000000000aa',
  '00000000-0000-4000-8000-0000000000aa',
  '{"sub":"00000000-0000-4000-8000-0000000000aa","email":"owner@supladitos.local","email_verified":true}',
  'email', now(), now(), now()
);

insert into public.staff (id, branch_id, role, display_name)
values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', 'owner', 'Owner');

-- Menu ----------------------------------------------------------------------------
do $$
declare
  b constant uuid := '00000000-0000-4000-8000-000000000001';
  c_coffee uuid; c_noncoffee uuid; c_pizza uuid; c_tea uuid;
  g_milk uuid; g_addons uuid; g_sweet uuid;
  item uuid;
  i integer;
  -- name, description, hot, iced regular, iced upsized (null = not offered)
  coffee jsonb := '[
    ["ESPRESSO", "Hot only", 90, null, null],
    ["AMERICANO", "Espresso & Water", 100, 110, 130],
    ["LATTE", "Espresso & Steamed Milk", 120, 140, 160],
    ["SPANISH LATTE", "Espresso, Steamed Milk, & Condensed Milk", 140, 160, 180],
    ["CAPPUCCINO", "Espresso, Steamed Milk, & Foamed Milk", 120, 140, 160],
    ["CARAMEL MACCHIATO", "Espresso, Steamed Milk, & Caramel", 140, 160, 180],
    ["MOCHA", "Espresso, Steamed Milk, & Chocolate", 140, 160, 180],
    ["HAZELNUT", "Espresso, Steamed Milk, & Hazelnut", 140, 160, 180]
  ]';
  -- PLACEHOLDER prices: not in the designs.
  noncoffee jsonb := '[
    ["STRAWBERRY SPARKLE", "Strawberry & Sparkling Water", 120, 140, 160]
  ]';
  -- Hawaiian is 240 on the designs; the rest are PLACEHOLDER prices.
  pizza jsonb := '[
    ["HAM & CHEESE", "Ham & Mozzarella", 240],
    ["HAWAIIAN", "Ham, Pineapple & Mozzarella", 240],
    ["PEPPERONI", "Pepperoni & Mozzarella", 270],
    ["BEEF & MUSHROOM", "Ground Beef, Mushroom & Mozzarella", 270]
  ]';
  -- PLACEHOLDER prices.
  tea jsonb := '[["House Blend", 100], ["Strawberry", 110], ["Green Apple", 110]]';
  row jsonb;
begin
  insert into public.categories (branch_id, name, sort_order) values (b, 'COFFEE', 1) returning id into c_coffee;
  insert into public.categories (branch_id, name, sort_order) values (b, 'NON-COFFEE', 2) returning id into c_noncoffee;
  insert into public.categories (branch_id, name, sort_order) values (b, 'PIZZA', 3) returning id into c_pizza;
  insert into public.categories (branch_id, name, sort_order) values (b, 'ICED TEA', 4) returning id into c_tea;

  -- Modifier groups
  insert into public.modifier_groups (branch_id, name, min_select, max_select, is_required, allow_quantity, sort_order)
  values (b, 'Milk', 0, 1, false, false, 1) returning id into g_milk;
  insert into public.modifier_groups (branch_id, name, min_select, max_select, is_required, allow_quantity, sort_order)
  values (b, 'Add-ons', 0, null, false, true, 2) returning id into g_addons;
  insert into public.modifier_groups (branch_id, name, min_select, max_select, is_required, allow_quantity, sort_order)
  values (b, 'Sweetness', 1, 1, true, false, 3) returning id into g_sweet;

  insert into public.modifiers (branch_id, modifier_group_id, name, price_delta, sort_order)
  values (b, g_milk, 'Oat milk', 30, 1);
  insert into public.modifiers (branch_id, modifier_group_id, name, price_delta, sort_order) values
    (b, g_addons, 'Extra shot', 40, 1),   -- PLACEHOLDER price
    (b, g_addons, 'Extra milk', 20, 2),   -- PLACEHOLDER price
    (b, g_sweet, 'Regular', 0, 1),
    (b, g_sweet, 'Less sweet', 0, 2),
    (b, g_sweet, 'No sugar', 0, 3);

  -- Coffee and non-coffee: Hot / Iced Regular / Iced Upsized
  i := 0;
  for row in select value from jsonb_array_elements(coffee || noncoffee) loop
    i := i + 1;
    insert into public.menu_items (branch_id, category_id, name, description, sort_order)
    values (
      b,
      case when i <= jsonb_array_length(coffee) then c_coffee else c_noncoffee end,
      row ->> 0, row ->> 1, i
    )
    returning id into item;

    insert into public.item_variants (branch_id, menu_item_id, name, price, sort_order)
    select b, item, v.name, v.price, v.ord
    from (values
      ('Hot', (row ->> 2)::numeric, 1),
      ('Iced Regular', (row ->> 3)::numeric, 2),
      ('Iced Upsized', (row ->> 4)::numeric, 3)
    ) as v(name, price, ord)
    where v.price is not null;

    if row ->> 0 = 'ESPRESSO' then
      insert into public.item_modifier_groups (branch_id, menu_item_id, modifier_group_id, sort_order)
      values (b, item, g_addons, 1);
    elsif row ->> 0 = 'AMERICANO' then
      insert into public.item_modifier_groups (branch_id, menu_item_id, modifier_group_id, sort_order)
      values (b, item, g_addons, 1), (b, item, g_sweet, 2);
    elsif i <= jsonb_array_length(coffee) then
      insert into public.item_modifier_groups (branch_id, menu_item_id, modifier_group_id, sort_order)
      values (b, item, g_milk, 1), (b, item, g_addons, 2), (b, item, g_sweet, 3);
    else
      insert into public.item_modifier_groups (branch_id, menu_item_id, modifier_group_id, sort_order)
      values (b, item, g_sweet, 1);
    end if;
  end loop;

  -- Hazelnut is sold out on the designs; keep it that way so the state shows.
  update public.menu_items set is_available = false where name = 'HAZELNUT' and branch_id = b;

  -- Pizza: single price
  i := 0;
  for row in select value from jsonb_array_elements(pizza) loop
    i := i + 1;
    insert into public.menu_items (branch_id, category_id, name, description, sort_order)
    values (b, c_pizza, row ->> 0, row ->> 1, i)
    returning id into item;
    insert into public.item_variants (branch_id, menu_item_id, name, price, sort_order)
    values (b, item, 'Regular', (row ->> 2)::numeric, 1);
  end loop;

  -- Brewed iced tea: one item, flavours as variants
  insert into public.menu_items (branch_id, category_id, name, description, sort_order)
  values (b, c_tea, 'BREWED ICED TEA', 'House-brewed, served iced', 1)
  returning id into item;
  i := 0;
  for row in select value from jsonb_array_elements(tea) loop
    i := i + 1;
    insert into public.item_variants (branch_id, menu_item_id, name, price, sort_order)
    values (b, item, row ->> 0, (row ->> 1)::numeric, i);
  end loop;
  insert into public.item_modifier_groups (branch_id, menu_item_id, modifier_group_id, sort_order)
  values (b, item, g_sweet, 1);
end
$$;
