-- Add directory visibility toggle and key contact name to tenant_info
-- Safe to run multiple times; use IF NOT EXISTS where supported by Postgres

begin;

-- directory_enabled: whether the tenant appears in the public directory
alter table if exists public.tenant_info
    add column if not exists directory_enabled boolean not null default true;

-- key_contact_name: display-only name of the primary contact
alter table if exists public.tenant_info
    add column if not exists key_contact_name text;

commit;
