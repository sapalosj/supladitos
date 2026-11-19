-- 1.2 Categories, menu items and variants (supladitos.md §3)
-- Variants hold the base price: size (Hot / Iced Regular / Iced Upsized) is a
-- variant, not a modifier. Single-price items have one variant.
-- Every menu table carries branch_id so RLS can scope it directly. Inserts from
-- the app default to the signed-in user's branch.

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null default public.auth_branch_id() references public.branches (id),
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index categories_branch_id_idx on public.categories (branch_id, sort_order);

create table public.menu_items (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null default public.auth_branch_id() references public.branches (id),
  category_id   uuid not null references public.categories (id) on delete cascade,
  name          text not null,
  description   text,
  is_available  boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index menu_items_branch_id_idx on public.menu_items (branch_id);
create index menu_items_category_id_idx on public.menu_items (category_id, sort_order);

create table public.item_variants (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null default public.auth_branch_id() references public.branches (id),
  menu_item_id  uuid not null references public.menu_items (id) on delete cascade,
  name          text not null,
  price         numeric(10, 2) not null check (price >= 0),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index item_variants_branch_id_idx on public.item_variants (branch_id);
create index item_variants_menu_item_id_idx on public.item_variants (menu_item_id, sort_order);

create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger menu_items_updated_at before update on public.menu_items
  for each row execute function public.set_updated_at();
create trigger item_variants_updated_at before update on public.item_variants
  for each row execute function public.set_updated_at();
