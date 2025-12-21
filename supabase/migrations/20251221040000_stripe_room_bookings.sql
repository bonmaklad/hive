-- Stripe pay-as-you-go for room bookings when tokens are insufficient.

begin;

create extension if not exists pgcrypto;

-- Tenants are billed as Stripe customers (tenant-scoped).
alter table if exists public.tenants
    add column if not exists stripe_customer_id text;

create unique index if not exists tenants_stripe_customer_id_unique
    on public.tenants (stripe_customer_id)
    where stripe_customer_id is not null and stripe_customer_id <> '';

-- Track Stripe payment state for bookings (separate table so we don't have to mutate room_bookings schema).
create table if not exists public.room_booking_payments (
    id uuid primary key default gen_random_uuid(),
    room_booking_id uuid not null references public.room_bookings(id) on delete cascade,
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    token_owner_id uuid references auth.users(id) on delete set null,
    stripe_customer_id text not null,
    stripe_checkout_session_id text,
    stripe_payment_intent_id text,
    stripe_invoice_id text,
    amount_cents int not null check (amount_cents >= 0),
    currency text not null default 'NZD',
    status text not null default 'requires_payment' check (status in ('requires_payment', 'paid', 'failed', 'cancelled')),
    coupon_code text,
    discount_cents int not null default 0 check (discount_cents >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists room_booking_payments_checkout_session_unique
    on public.room_booking_payments (stripe_checkout_session_id)
    where stripe_checkout_session_id is not null and stripe_checkout_session_id <> '';

create index if not exists room_booking_payments_booking_idx
    on public.room_booking_payments (room_booking_id, created_at desc);

drop trigger if exists room_booking_payments_set_updated_at on public.room_booking_payments;
create trigger room_booking_payments_set_updated_at
before update on public.room_booking_payments
for each row execute function public.set_updated_at();

-- Stripe webhook idempotency
create table if not exists public.stripe_events (
    id text primary key,
    created_at timestamptz not null default now()
);

-- RLS: users can view payments for their own bookings; admins can view all.
alter table public.room_booking_payments enable row level security;

drop policy if exists room_booking_payments_select_own on public.room_booking_payments;
create policy room_booking_payments_select_own
on public.room_booking_payments
for select
to authenticated
using (
    public.is_admin()
    or exists (
        select 1
        from public.room_bookings rb
        where rb.id = room_booking_payments.room_booking_id
          and rb.owner_id = auth.uid()
    )
);

-- Writes are performed by server/service-role tooling.
drop policy if exists room_booking_payments_insert_none on public.room_booking_payments;
create policy room_booking_payments_insert_none
on public.room_booking_payments
for insert
to authenticated
with check (false);

drop policy if exists room_booking_payments_update_none on public.room_booking_payments;
create policy room_booking_payments_update_none
on public.room_booking_payments
for update
to authenticated
using (false)
with check (false);

drop policy if exists room_booking_payments_delete_none on public.room_booking_payments;
create policy room_booking_payments_delete_none
on public.room_booking_payments
for delete
to authenticated
using (false);

commit;

