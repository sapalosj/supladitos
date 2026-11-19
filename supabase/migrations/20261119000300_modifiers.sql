-- 1.3 Modifier groups, modifiers, per-variant prices, item links (supladitos.md §3)
-- Groups are reusable: define "Milk" once and attach it to every milk drink.

create table public.modifier_groups (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid not null default public.auth_branch_id() references public.branches (id),
  name            text not null,
  min_select      integer not null default 0 check (min_select >= 0),
  -- null = no upper limit
  max_select      integer check (max_select is null or max_select >= 1),
  is_required     boolean not null default false,
  -- The same modifier can be picked more than once (e.g. 2x extra shot).
  allow_quantity  boolean not null default false,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint modifier_groups_min_le_max check (max_select is null or min_select <= max_select)
);

create index modifier_groups_branch_id_idx on public.modifier_groups (branch_id);

create table public.modifiers (
  id                 uuid primary key default gen_random_uuid(),
  branch_id          uuid not null default public.auth_branch_id() references public.branches (id),
  modifier_group_id  uuid not null references public.modifier_groups (id) on delete cascade,
  name               text not null,
  price_delta        numeric(10, 2) not null default 0,
  is_available       boolean not null default true,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index modifiers_branch_id_idx on public.modifiers (branch_id);
create index modifiers_group_id_idx on public.modifiers (modifier_group_id, sort_order);

-- Optional: a modifier costs a different amount on a given variant name
-- (e.g. Oat Milk +30 on Iced Regular, +40 on Iced Upsized).
create table public.modifier_variant_prices (
  modifier_id   uuid not null references public.modifiers (id) on delete cascade,
  variant_name  text not null,
  branch_id     uuid not null default public.auth_branch_id() references public.branches (id),
  price_delta   numeric(10, 2) not null,
  primary key (modifier_id, variant_name)
);

create index modifier_variant_prices_branch_id_idx on public.modifier_variant_prices (branch_id);

create table public.item_modifier_groups (
  menu_item_id       uuid not null references public.menu_items (id) on delete cascade,
  modifier_group_id  uuid not null references public.modifier_groups (id) on delete cascade,
  branch_id          uuid not null default public.auth_branch_id() references public.branches (id),
  sort_order         integer not null default 0,
  primary key (menu_item_id, modifier_group_id)
);

create index item_modifier_groups_branch_id_idx on public.item_modifier_groups (branch_id);
create index item_modifier_groups_group_idx on public.item_modifier_groups (modifier_group_id);

create trigger modifier_groups_updated_at before update on public.modifier_groups
  for each row execute function public.set_updated_at();
create trigger modifiers_updated_at before update on public.modifiers
  for each row execute function public.set_updated_at();
