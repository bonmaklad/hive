-- Work units (offices/desks/pods) inventory + allocations + tags + availability view.
-- Matches the schema you created manually (work_units, work_unit_tags, work_unit_allocations, tenant_work_units).

begin;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- -------------------------
-- Inventory
-- -------------------------
create table if not exists public.work_units (
    id uuid primary key default gen_random_uuid(),
    building text not null,
    unit_number int not null,
    label text not null,
    unit_type text not null check (unit_type in ('premium_office', 'private_office', 'desk', 'desk_pod', 'small_office')),
    capacity int not null default 1,
    base_price_cents int,
    custom_price_cents int,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    unique (building, unit_number)
);

alter table if exists public.work_units
    add column if not exists custom_price_cents int;

-- -------------------------
-- Tags
-- -------------------------
create table if not exists public.work_unit_tags (
    id uuid primary key default gen_random_uuid(),
    work_unit_id uuid not null references public.work_units(id) on delete cascade,
    tag text not null,
    created_at timestamptz not null default now(),
    unique (work_unit_id, tag)
);

-- -------------------------
-- Allocations (occupancy + historical tracking)
-- Note: if you already created this table with the EXCLUDE constraint, leave it as-is.
-- -------------------------
create table if not exists public.work_unit_allocations (
    id uuid primary key default gen_random_uuid(),
    work_unit_id uuid not null references public.work_units(id) on delete cascade,
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    start_date date not null,
    end_date date,
    price_cents int,
    created_at timestamptz not null default now()
);

-- Optional helper table (some installs use it as a cache/denormalisation layer).
create table if not exists public.tenant_work_units (
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    work_unit_id uuid not null references public.work_units(id) on delete cascade,
    primary key (tenant_id, work_unit_id)
);

-- -------------------------
-- Availability view (vacant/occupied + price)
-- Uses start/end date logic consistent with daterange [start, end) semantics:
-- active if start_date <= today AND (end_date is null OR end_date > today)
-- -------------------------
create or replace view public.work_units_availability as
select
    wu.id,
    wu.building,
    wu.unit_number,
    (wu.building || '.' || wu.unit_number::text) as code,
    wu.label,
    wu.unit_type,
    wu.capacity,
    coalesce(wu.custom_price_cents, wu.base_price_cents) as display_price_cents,
    exists (
        select 1
        from public.work_unit_allocations a
        where a.work_unit_id = wu.id
          and a.start_date <= current_date
          and (a.end_date is null or a.end_date > current_date)
    ) as is_occupied,
    not exists (
        select 1
        from public.work_unit_allocations a
        where a.work_unit_id = wu.id
          and a.start_date <= current_date
          and (a.end_date is null or a.end_date > current_date)
    ) as is_vacant
from public.work_units wu
where wu.active = true;

grant select on public.work_units_availability to authenticated;

-- -------------------------
-- RLS
-- Members: read inventory/tags/availability; Admin: manage inventory/allocations/tags.
-- -------------------------
alter table public.work_units enable row level security;
alter table public.work_unit_tags enable row level security;
alter table public.work_unit_allocations enable row level security;

drop policy if exists work_units_select_active on public.work_units;
create policy work_units_select_active
on public.work_units
for select
to authenticated
using (active = true or public.is_admin());

drop policy if exists work_units_admin_write on public.work_units;
create policy work_units_admin_write
on public.work_units
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists work_unit_tags_select_all on public.work_unit_tags;
create policy work_unit_tags_select_all
on public.work_unit_tags
for select
to authenticated
using (true);

drop policy if exists work_unit_tags_admin_write on public.work_unit_tags;
create policy work_unit_tags_admin_write
on public.work_unit_tags
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists work_unit_allocations_select on public.work_unit_allocations;
create policy work_unit_allocations_select
on public.work_unit_allocations
for select
to authenticated
using (
    public.is_admin()
    or exists (
        select 1
        from public.tenant_users tu
        where tu.user_id = auth.uid()
          and tu.tenant_id = work_unit_allocations.tenant_id
    )
);

drop policy if exists work_unit_allocations_admin_write on public.work_unit_allocations;
create policy work_unit_allocations_admin_write
on public.work_unit_allocations
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

commit;

