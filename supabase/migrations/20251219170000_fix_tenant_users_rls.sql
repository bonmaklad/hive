-- Fix tenant_users RLS recursion (42P17)
--
-- Problem:
-- Some tenant_users policies were written with self-referential subqueries like:
--   exists (select 1 from tenant_users ...)
-- which can trigger: "infinite recursion detected in policy for relation tenant_users".
--
-- Goal:
-- Allow authenticated users to read ONLY their own tenant_users rows.
-- All writes should be performed by privileged backend/admin tooling (service role),
-- so we intentionally do not allow client-side INSERT/UPDATE/DELETE here.

alter table if exists public.tenant_users enable row level security;

drop policy if exists tenant_users_select_own on public.tenant_users;
create policy tenant_users_select_own
on public.tenant_users
for select
using (user_id = auth.uid());

drop policy if exists tenant_users_insert_none on public.tenant_users;
create policy tenant_users_insert_none
on public.tenant_users
for insert
with check (false);

drop policy if exists tenant_users_update_none on public.tenant_users;
create policy tenant_users_update_none
on public.tenant_users
for update
using (false)
with check (false);

drop policy if exists tenant_users_delete_none on public.tenant_users;
create policy tenant_users_delete_none
on public.tenant_users
for delete
using (false);

