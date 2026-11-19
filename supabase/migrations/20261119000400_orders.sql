-- 1.4 Orders, order items, item modifiers, payments (supladitos.md §3)
-- Names and prices are snapshotted at the time of sale so menu edits never
-- change past sales. Order IDs are UUIDs generated on the device so retries
-- never create duplicates.

create type public.order_type as enum ('dine_in', 'takeout');
create type public.order_status as enum ('new', 'preparing', 'done', 'voided');
create type public.payment_method as enum ('cash', 'gcash', 'maya');

create table public.orders (
  id              uuid primary key,
  branch_id       uuid not null references public.branches (id),
  -- Per-branch, per-business-date number shown to the customer (see 1.7).
  order_number    integer not null check (order_number > 0),
  business_date   date not null,
  order_type      public.order_type not null default 'dine_in',
  customer_name   text,
  status          public.order_status not null default 'new',
  -- What the device charged. Never rewritten by the server.
  subtotal        numeric(10, 2) not null check (subtotal >= 0),
  total           numeric(10, 2) not null check (total >= 0),
  -- What the server calculated from the menu when the order synced (1.10).
  computed_total  numeric(10, 2),
  price_mismatch  boolean not null default false,
  void_reason     text,
  voided_at       timestamptz,
  voided_by       uuid references auth.users (id),
  status_changed_at timestamptz,
  created_by      uuid references auth.users (id),
  -- Device time when the order was taken (may be well before it synced).
  created_at      timestamptz not null default now(),
  synced_at       timestamptz not null default now(),
  constraint orders_void_reason_required check (
    status <> 'voided' or (void_reason is not null and length(btrim(void_reason)) > 0)
  )
);

create unique index orders_branch_date_number_key on public.orders (branch_id, business_date, order_number);
create index orders_branch_created_at_idx on public.orders (branch_id, created_at desc);
create index orders_branch_status_idx on public.orders (branch_id, status) where status in ('new', 'preparing');

create table public.order_items (
  id                     uuid primary key,
  order_id               uuid not null references public.orders (id) on delete cascade,
  branch_id              uuid not null references public.branches (id),
  menu_item_id           uuid references public.menu_items (id) on delete set null,
  variant_id             uuid references public.item_variants (id) on delete set null,
  item_name_snapshot     text not null,
  variant_name_snapshot  text,
  -- Variant price + modifier deltas, for one unit.
  unit_price             numeric(10, 2) not null check (unit_price >= 0),
  quantity               integer not null check (quantity > 0),
  line_total             numeric(10, 2) not null check (line_total >= 0),
  notes                  text,
  sort_order             integer not null default 0
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_branch_id_idx on public.order_items (branch_id);
create index order_items_menu_item_id_idx on public.order_items (menu_item_id);

create table public.order_item_modifiers (
  id             uuid primary key,
  order_item_id  uuid not null references public.order_items (id) on delete cascade,
  branch_id      uuid not null references public.branches (id),
  modifier_id    uuid references public.modifiers (id) on delete set null,
  name_snapshot  text not null,
  -- Per unit of the modifier, for one unit of the item.
  price_delta    numeric(10, 2) not null,
  quantity       integer not null default 1 check (quantity > 0)
);

create index order_item_modifiers_item_idx on public.order_item_modifiers (order_item_id);
create index order_item_modifiers_branch_id_idx on public.order_item_modifiers (branch_id);
create index order_item_modifiers_modifier_id_idx on public.order_item_modifiers (modifier_id);

create table public.payments (
  id               uuid primary key,
  order_id         uuid not null references public.orders (id) on delete cascade,
  branch_id        uuid not null references public.branches (id),
  method           public.payment_method not null,
  amount           numeric(10, 2) not null check (amount >= 0),
  -- Cash only: what the customer handed over, and the change given back.
  amount_received  numeric(10, 2),
  change_due       numeric(10, 2),
  created_at       timestamptz not null default now()
);

create index payments_order_id_idx on public.payments (order_id);
create index payments_branch_id_idx on public.payments (branch_id);
