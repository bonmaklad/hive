-- Platform tables + RLS policies

create table if not exists public.sites (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users (id) on delete cascade,
    domain text not null unique,
    repo text not null,
    framework text not null check (framework in ('next', 'static', 'node')),
    created_at timestamptz not null default now()
);

create index if not exists sites_owner_id_created_at_idx on public.sites (owner_id, created_at desc);

create table if not exists public.deployments (
    id uuid primary key default gen_random_uuid(),
    site_id uuid not null references public.sites (id) on delete cascade,
    status text not null,
    created_at timestamptz not null default now()
);

create index if not exists deployments_site_id_created_at_idx on public.deployments (site_id, created_at desc);

alter table public.sites enable row level security;
alter table public.deployments enable row level security;

drop policy if exists sites_select_own on public.sites;
drop policy if exists sites_insert_own on public.sites;
drop policy if exists sites_update_own on public.sites;
drop policy if exists sites_delete_own on public.sites;

create policy sites_select_own
on public.sites
for select
using (owner_id = auth.uid());

create policy sites_insert_own
on public.sites
for insert
with check (owner_id = auth.uid());

create policy sites_update_own
on public.sites
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy sites_delete_own
on public.sites
for delete
using (owner_id = auth.uid());

drop policy if exists deployments_select_own on public.deployments;
drop policy if exists deployments_insert_own on public.deployments;
drop policy if exists deployments_update_own on public.deployments;
drop policy if exists deployments_delete_own on public.deployments;

create policy deployments_select_own
on public.deployments
for select
using (
    exists (
        select 1
        from public.sites s
        where s.id = deployments.site_id
        and s.owner_id = auth.uid()
    )
);

create policy deployments_insert_own
on public.deployments
for insert
with check (
    exists (
        select 1
        from public.sites s
        where s.id = deployments.site_id
        and s.owner_id = auth.uid()
    )
);

create policy deployments_update_own
on public.deployments
for update
using (
    exists (
        select 1
        from public.sites s
        where s.id = deployments.site_id
        and s.owner_id = auth.uid()
    )
)
with check (
    exists (
        select 1
        from public.sites s
        where s.id = deployments.site_id
        and s.owner_id = auth.uid()
    )
);

create policy deployments_delete_own
on public.deployments
for delete
using (
    exists (
        select 1
        from public.sites s
        where s.id = deployments.site_id
        and s.owner_id = auth.uid()
    )
);

