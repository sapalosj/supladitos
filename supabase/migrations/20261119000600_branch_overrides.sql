-- 1.6 Branch overrides (table only; the UI is Phase 2)
-- Lets a branch change the price or availability of an item or variant
-- without copying the menu.

create table public.branch_overrides (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references public.branches (id) on delete cascade,
  menu_item_id  uuid references public.menu_items (id) on delete cascade,
  variant_id    uuid references public.item_variants (id) on delete cascade,
  price         numeric(10, 2) check (price is null or price >= 0),
  is_available  boolean,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint branch_overrides_target check (menu_item_id is not null or variant_id is not null),
  constraint branch_overrides_has_change check (price is not null or is_available is not null)
);

create unique index branch_overrides_item_key on public.branch_overrides (branch_id, menu_item_id)
  where variant_id is null;
create unique index branch_overrides_variant_key on public.branch_overrides (branch_id, variant_id)
  where variant_id is not null;

create trigger branch_overrides_updated_at before update on public.branch_overrides
  for each row execute function public.set_updated_at();
