-- Dev Mode sessions (on-prem live coding)

-- Ensure sites table matches UI expectations
alter table if exists public.sites
    add column if not exists name text;

alter table if exists public.sites
    add column if not exists env jsonb not null default '{}'::jsonb;

alter table if exists public.sites
    add column if not exists github_installation_id bigint;

-- Expand framework options (UI supports next, gatsby, static, node, vue)
alter table if exists public.sites drop constraint if exists sites_framework_check;
alter table if exists public.sites
    add constraint sites_framework_check
    check (framework in ('next', 'gatsby', 'static', 'node', 'vue'));

create table if not exists public.site_dev_sessions (
    site_id uuid primary key references public.sites(id) on delete cascade,
    status text not null default 'stopped' check (status in ('stopped', 'starting', 'running', 'stopping', 'error')),
    branch text not null default 'main',
    workspace_path text,
    preview_url text,
    editor_url text,
    server_session_id text,
    requested_by uuid references auth.users(id) on delete set null,
    last_error text,
    started_at timestamptz,
    stopped_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists site_dev_sessions_requested_by_idx on public.site_dev_sessions(requested_by);
create index if not exists site_dev_sessions_updated_at_idx on public.site_dev_sessions(updated_at desc);

alter table public.site_dev_sessions enable row level security;

drop policy if exists site_dev_sessions_select_own on public.site_dev_sessions;
create policy site_dev_sessions_select_own
on public.site_dev_sessions
for select
to authenticated
using (
    exists (
        select 1
        from public.sites s
        where s.id = site_dev_sessions.site_id
          and s.owner_id = auth.uid()
    )
    or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_admin = true
    )
);

drop policy if exists site_dev_sessions_insert_own on public.site_dev_sessions;
create policy site_dev_sessions_insert_own
on public.site_dev_sessions
for insert
to authenticated
with check (
    exists (
        select 1
        from public.sites s
        where s.id = site_dev_sessions.site_id
          and s.owner_id = auth.uid()
    )
    or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_admin = true
    )
);

drop policy if exists site_dev_sessions_update_own on public.site_dev_sessions;
create policy site_dev_sessions_update_own
on public.site_dev_sessions
for update
to authenticated
using (
    exists (
        select 1
        from public.sites s
        where s.id = site_dev_sessions.site_id
          and s.owner_id = auth.uid()
    )
    or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_admin = true
    )
)
with check (
    exists (
        select 1
        from public.sites s
        where s.id = site_dev_sessions.site_id
          and s.owner_id = auth.uid()
    )
    or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_admin = true
    )
);

drop policy if exists site_dev_sessions_delete_own on public.site_dev_sessions;
create policy site_dev_sessions_delete_own
on public.site_dev_sessions
for delete
to authenticated
using (
    exists (
        select 1
        from public.sites s
        where s.id = site_dev_sessions.site_id
          and s.owner_id = auth.uid()
    )
    or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_admin = true
    )
);

