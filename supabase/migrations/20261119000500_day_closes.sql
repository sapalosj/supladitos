-- 1.5 Day close (supladitos.md §3, §4.5)

create table public.day_closes (
  id                uuid primary key default gen_random_uuid(),
  branch_id         uuid not null default public.auth_branch_id() references public.branches (id),
  business_date     date not null,
  order_count       integer not null default 0,
  gross_sales       numeric(10, 2) not null default 0,
  -- {"cash": 1240.00, "gcash": 380.00, "maya": 0}
  totals_by_method  jsonb not null default '{}'::jsonb,
  expected_cash     numeric(10, 2) not null,
  actual_cash       numeric(10, 2) not null,
  variance          numeric(10, 2) generated always as (actual_cash - expected_cash) stored,
  notes             text,
  closed_by         uuid default auth.uid() references auth.users (id),
  closed_at         timestamptz not null default now(),
  -- One close per branch per business date (8.3).
  constraint day_closes_branch_date_key unique (branch_id, business_date)
);
