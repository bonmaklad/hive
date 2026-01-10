-- Add custom public profile name for directory entries
begin;

alter table if exists public.tenant_info
    add column if not exists profile_name text;

commit;
