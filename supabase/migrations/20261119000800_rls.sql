-- 1.8 Row level security on every business table, scoped to the user's branch.
--
-- Rules:
-- * Staff read everything in their own branch.
-- * Owners and managers write the menu.
-- * Orders are created only through submit_order (SECURITY DEFINER). Staff can
--   update an order's status and void fields directly; nothing else.
-- * Day closes are insert-only.
-- * Anonymous users see nothing.

alter table public.branches enable row level security;
alter table public.staff enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.item_variants enable row level security;
alter table public.modifier_groups enable row level security;
alter table public.modifiers enable row level security;
alter table public.modifier_variant_prices enable row level security;
alter table public.item_modifier_groups enable row level security;
alter table public.branch_overrides enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_modifiers enable row level security;
alter table public.payments enable row level security;
alter table public.day_closes enable row level security;
alter table public.order_number_counters enable row level security;

-- Branches and staff --------------------------------------------------------

create policy "staff read own branch" on public.branches
  for select to authenticated
  using (id = (select public.auth_branch_id()));

create policy "staff read branch staff" on public.staff
  for select to authenticated
  using (branch_id = (select public.auth_branch_id()));

-- Menu tables: read for staff, write for owners/managers --------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'menu_items', 'item_variants', 'modifier_groups', 'modifiers',
    'modifier_variant_prices', 'item_modifier_groups', 'branch_overrides'
  ] loop
    execute format(
      'create policy "staff read branch rows" on public.%I for select to authenticated
         using (branch_id = (select public.auth_branch_id()))', t);
    execute format(
      'create policy "managers insert branch rows" on public.%I for insert to authenticated
         with check (branch_id = (select public.auth_branch_id()) and (select public.auth_is_manager()))', t);
    execute format(
      'create policy "managers update branch rows" on public.%I for update to authenticated
         using (branch_id = (select public.auth_branch_id()) and (select public.auth_is_manager()))
         with check (branch_id = (select public.auth_branch_id()))', t);
    execute format(
      'create policy "managers delete branch rows" on public.%I for delete to authenticated
         using (branch_id = (select public.auth_branch_id()) and (select public.auth_is_manager()))', t);
  end loop;
end
$$;

-- Orders and their children: read for staff --------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['orders', 'order_items', 'order_item_modifiers', 'payments', 'order_number_counters'] loop
    execute format(
      'create policy "staff read branch rows" on public.%I for select to authenticated
         using (branch_id = (select public.auth_branch_id()))', t);
  end loop;
end
$$;

-- Status changes and voids. Column grants below limit what can change.
create policy "staff update branch orders" on public.orders
  for update to authenticated
  using (branch_id = (select public.auth_branch_id()))
  with check (branch_id = (select public.auth_branch_id()));

revoke insert, update, delete on public.orders from anon, authenticated;
grant update (status, status_changed_at, void_reason, voided_at, voided_by) on public.orders to authenticated;
revoke insert, update, delete on public.order_items, public.order_item_modifiers, public.payments, public.order_number_counters from anon, authenticated;

-- Day closes: insert-only ----------------------------------------------------

create policy "staff read branch rows" on public.day_closes
  for select to authenticated
  using (branch_id = (select public.auth_branch_id()));

create policy "staff close own branch" on public.day_closes
  for insert to authenticated
  with check (branch_id = (select public.auth_branch_id()) and closed_by = (select auth.uid()));

revoke update, delete on public.day_closes from anon, authenticated;

-- Nothing for anon ------------------------------------------------------------
revoke all on all tables in schema public from anon;
