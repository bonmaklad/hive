-- Tenant directory profile information

begin;

create table if not exists public.tenant_info (
    tenant_id uuid primary key references public.tenants(id) on delete cascade,
    about text,
    phone text,
    email text,
    office_location text,
    website_url text,
    profile_name text,
    key_contact_name text,
    directory_enabled boolean not null default true,
    logo_url text,
    logo_bucket text,
    logo_path text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.tenant_info
    add column if not exists profile_name text,
    add column if not exists key_contact_name text,
    add column if not exists website_url text,
    add column if not exists directory_enabled boolean not null default true;

drop trigger if exists tenant_info_set_updated_at on public.tenant_info;
create trigger tenant_info_set_updated_at
before update on public.tenant_info
for each row execute function public.set_updated_at();

alter table public.tenant_info enable row level security;

drop policy if exists tenant_info_select_public on public.tenant_info;
create policy tenant_info_select_public
on public.tenant_info
for select
to anon, authenticated
using (true);

drop policy if exists tenant_info_insert_owner on public.tenant_info;
create policy tenant_info_insert_owner
on public.tenant_info
for insert
to authenticated
with check (
    public.is_admin()
    or exists (
        select 1
        from public.tenant_users tu
        where tu.tenant_id = tenant_info.tenant_id
          and tu.user_id = auth.uid()
          and tu.role in ('owner', 'admin')
    )
);

drop policy if exists tenant_info_update_owner on public.tenant_info;
create policy tenant_info_update_owner
on public.tenant_info
for update
to authenticated
using (
    public.is_admin()
    or exists (
        select 1
        from public.tenant_users tu
        where tu.tenant_id = tenant_info.tenant_id
          and tu.user_id = auth.uid()
          and tu.role in ('owner', 'admin')
    )
)
with check (
    public.is_admin()
    or exists (
        select 1
        from public.tenant_users tu
        where tu.tenant_id = tenant_info.tenant_id
          and tu.user_id = auth.uid()
          and tu.role in ('owner', 'admin')
    )
);

grant select on public.tenant_info to anon, authenticated;
grant insert, update on public.tenant_info to authenticated;

commit;
