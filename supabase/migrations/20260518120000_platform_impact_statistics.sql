begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create table if not exists public.platform_impact_tenant_stats (
    tenant_id uuid primary key references public.tenants(id) on delete cascade,
    external_revenue_cents bigint not null default 0 check (external_revenue_cents >= 0),
    updated_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

drop trigger if exists platform_impact_tenant_stats_set_updated_at on public.platform_impact_tenant_stats;
create trigger platform_impact_tenant_stats_set_updated_at
before update on public.platform_impact_tenant_stats
for each row execute function public.set_updated_at();

alter table public.platform_impact_tenant_stats enable row level security;

drop policy if exists platform_impact_tenant_stats_manage_tenant_admins on public.platform_impact_tenant_stats;
create policy platform_impact_tenant_stats_manage_tenant_admins
on public.platform_impact_tenant_stats
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_admin = true
    )
    or exists (
        select 1
        from public.tenant_users tu
        where tu.user_id = auth.uid()
          and tu.tenant_id = platform_impact_tenant_stats.tenant_id
          and tu.role in ('owner', 'admin')
    )
)
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_admin = true
    )
    or exists (
        select 1
        from public.tenant_users tu
        where tu.user_id = auth.uid()
          and tu.tenant_id = platform_impact_tenant_stats.tenant_id
          and tu.role in ('owner', 'admin')
    )
);

grant select, insert, update on public.platform_impact_tenant_stats to authenticated;

create table if not exists public.platform_impact_events (
    id uuid primary key default gen_random_uuid(),
    category text not null default 'member_support' check (category in ('external_revenue', 'member_support')),
    support_type text check (support_type in ('hired_member', 'helped_member')),
    amount_cents bigint not null check (amount_cents > 0),
    occurred_on date not null,
    reporter_id uuid references auth.users(id) on delete set null,
    tenant_id uuid references public.tenants(id) on delete cascade,
    source text not null default 'platform_dashboard',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint platform_impact_events_category_support_check check (
        (category = 'external_revenue' and support_type is null)
        or
        (category = 'member_support' and support_type is not null)
    )
);

create index if not exists platform_impact_events_category_date_idx
    on public.platform_impact_events(category, occurred_on desc);

create index if not exists platform_impact_events_reporter_idx
    on public.platform_impact_events(reporter_id, created_at desc);

create index if not exists platform_impact_events_tenant_idx
    on public.platform_impact_events(tenant_id, created_at desc);

drop trigger if exists platform_impact_events_set_updated_at on public.platform_impact_events;
create trigger platform_impact_events_set_updated_at
before update on public.platform_impact_events
for each row execute function public.set_updated_at();

alter table public.platform_impact_events enable row level security;

drop policy if exists platform_impact_events_select_own_or_admin on public.platform_impact_events;
drop policy if exists platform_impact_events_insert_own on public.platform_impact_events;
drop policy if exists platform_impact_events_admin_update on public.platform_impact_events;
drop policy if exists platform_impact_events_admin_delete on public.platform_impact_events;
drop policy if exists platform_impact_events_manage_tenant_owner on public.platform_impact_events;

create policy platform_impact_events_manage_tenant_owner
on public.platform_impact_events
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_admin = true
    )
    or exists (
        select 1
        from public.tenant_users tu
        where tu.user_id = auth.uid()
          and tu.tenant_id = platform_impact_events.tenant_id
          and tu.role = 'owner'
    )
)
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_admin = true
    )
    or exists (
        select 1
        from public.tenant_users tu
        where tu.user_id = auth.uid()
          and tu.tenant_id = platform_impact_events.tenant_id
          and tu.role = 'owner'
    )
);

grant select, insert, update, delete on public.platform_impact_events to authenticated;

insert into public.platform_impact_tenant_stats (tenant_id, external_revenue_cents, updated_by)
select
    tenant_id,
    coalesce(sum(amount_cents), 0)::bigint as external_revenue_cents,
    (array_agg(reporter_id order by updated_at desc nulls last, created_at desc nulls last))[1] as updated_by
from public.platform_impact_events
where category = 'external_revenue'
  and tenant_id is not null
group by tenant_id
on conflict (tenant_id) do nothing;

create or replace view public.platform_impact_public_totals as
select
    'external_revenue'::text as category,
    null::text as support_type,
    count(*) filter (where external_revenue_cents > 0)::bigint as event_count,
    coalesce(sum(external_revenue_cents), 0)::bigint as amount_cents,
    null::date as first_event_on,
    null::date as latest_event_on
from public.platform_impact_tenant_stats
union all
select
    category,
    support_type,
    count(*)::bigint as event_count,
    coalesce(sum(amount_cents), 0)::bigint as amount_cents,
    min(occurred_on) as first_event_on,
    max(occurred_on) as latest_event_on
from public.platform_impact_events
where category = 'member_support'
group by category, support_type;

grant select on public.platform_impact_public_totals to anon, authenticated;

commit;
