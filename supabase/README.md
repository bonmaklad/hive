## Platform schema

Apply `supabase/migrations/20251216150000_platform.sql` in the Supabase SQL editor to create:

- `sites(id, owner_id, domain, repo, framework, created_at)`
- `deployments(id, site_id, status, created_at)`

Row Level Security is enabled so authenticated users can only read/write their own sites and deployments.

## Tenant users RLS fix

If your `tenant_users` policies are throwing `42P17: infinite recursion detected in policy for relation "tenant_users"`,
apply `supabase/migrations/20251219170000_fix_tenant_users_rls.sql`.

This keeps `tenant_users` readable only by the logged-in user (for role gating in the UI) and relies on admin/service-role tooling for writes.
