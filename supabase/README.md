## Platform schema

Apply `supabase/migrations/20251216150000_platform.sql` in the Supabase SQL editor to create:

- `sites(id, owner_id, domain, repo, framework, created_at)`
- `deployments(id, site_id, status, created_at)`

Row Level Security is enabled so authenticated users can only read/write their own sites and deployments.

## Tenant users RLS fix

If your `tenant_users` policies are throwing `42P17: infinite recursion detected in policy for relation "tenant_users"`,
apply `supabase/migrations/20251219170000_fix_tenant_users_rls.sql`.

This keeps `tenant_users` readable only by the logged-in user (for role gating in the UI) and relies on admin/service-role tooling for writes.

## Work units (offices/desks/pods)

Apply `supabase/migrations/20251221013000_work_units.sql` to create:

- `work_units` (inventory)
- `work_unit_tags` (metadata tags like `premium`, `private`, `pod`)
- `work_unit_allocations` (admin-managed occupancy, enforces 1 active allocation per unit)
- `work_units_availability` view (vacant/occupied + price for tenants)

RLS rules:

- Authenticated users can view units/tags and vacancy status.
- Only platform admins (`profiles.is_admin = true`) can change inventory or allocations.

## Stripe room booking top-ups

Apply `supabase/migrations/20251221040000_stripe_room_bookings.sql` to create:

- `tenants.stripe_customer_id` (tenant-scoped Stripe customer)
- `room_booking_payments` (Stripe checkout session + invoice linkage per booking)
- `stripe_events` (webhook idempotency)

Env vars (Next.js):

- `STRIPE_SECRET_KEY` (server)
- `STRIPE_WEBHOOK_SECRET` (server)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (client)

## Membership invoicing (Stripe invoices)

An Edge Function `supabase/functions/invoice-memberships/index.ts` can generate monthly Stripe invoices for memberships with:

- `memberships.status = 'live'`
- `memberships.payment_terms = 'invoice'` (or `advanced` that has expired)
- `memberships.next_invoice_at = <today day-of-month in NZ>`

It creates/sends a Stripe invoice for `memberships.monthly_amount_cents` (GST-inclusive) and upserts a row into `public.invoices`.
