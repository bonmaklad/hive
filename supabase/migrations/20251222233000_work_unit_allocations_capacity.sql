begin;

-- Support capacity > 1 workspaces by allowing multiple simultaneous allocations per work_unit.
-- The previous exclusion constraint `one_active_allocation` (if present) enforced only one active allocation per unit.

create extension if not exists btree_gist;

alter table public.work_unit_allocations
    drop constraint if exists one_active_allocation;

-- Prevent duplicate/overlapping allocations for the same tenant + unit.
-- Use end-exclusive daterange semantics to match app logic (end_date = today means ended).
alter table public.work_unit_allocations
    add constraint one_active_allocation_per_tenant
    exclude using gist (
        tenant_id with =,
        work_unit_id with =,
        daterange(start_date, coalesce(end_date, 'infinity'::date), '[)') with &&
    );

create index if not exists work_unit_allocations_work_unit_active_idx
    on public.work_unit_allocations (work_unit_id, start_date, end_date);

create index if not exists work_unit_allocations_tenant_active_idx
    on public.work_unit_allocations (tenant_id, start_date, end_date);

commit;

