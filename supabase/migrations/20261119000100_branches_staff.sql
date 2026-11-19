-- 1.1 Branches and staff (supladitos.md §3)

create type public.staff_role as enum ('owner', 'manager', 'barista');

create table public.branches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- Business dates (orders, day close) are computed in this time zone.
  timezone    text not null default 'Asia/Manila',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.staff (
  id            uuid primary key references auth.users (id) on delete cascade,
  branch_id     uuid not null references public.branches (id),
  role          public.staff_role not null default 'barista',
  display_name  text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create index staff_branch_id_idx on public.staff (branch_id);

-- ---------------------------------------------------------------------------
-- Helpers used by RLS policies and RPCs. SECURITY DEFINER so they can read
-- `staff` without recursing through its own RLS policies.
-- ---------------------------------------------------------------------------

create or replace function public.auth_branch_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.branch_id
  from public.staff s
  where s.id = auth.uid() and s.is_active
$$;

create or replace function public.auth_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select s.role
  from public.staff s
  where s.id = auth.uid() and s.is_active
$$;

-- Owners and managers can change the menu and other settings.
create or replace function public.auth_is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.auth_staff_role() in ('owner', 'manager'), false)
$$;

-- Today's business date for a branch, in the branch's time zone.
create or replace function public.branch_business_date(p_branch_id uuid, p_at timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $$
  select (p_at at time zone coalesce(
    (select b.timezone from public.branches b where b.id = p_branch_id),
    'Asia/Manila'
  ))::date
$$;

-- Generic updated_at trigger for tables that have the column.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
