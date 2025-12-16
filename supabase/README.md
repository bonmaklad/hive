## Platform schema

Apply `supabase/migrations/20251216150000_platform.sql` in the Supabase SQL editor to create:

- `sites(id, owner_id, domain, repo, framework, created_at)`
- `deployments(id, site_id, status, created_at)`

Row Level Security is enabled so authenticated users can only read/write their own sites and deployments.

