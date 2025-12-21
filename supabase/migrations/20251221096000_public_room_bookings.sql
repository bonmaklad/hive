-- Public (non-member) room bookings paid via Stripe checkout.
-- These bookings are separate from authenticated member room_bookings.

begin;

create extension if not exists pgcrypto;

create table if not exists public.public_room_bookings (
    id uuid primary key default gen_random_uuid(),
    space_slug text not null references public.spaces(slug),
    booking_date date not null,
    start_time time not null,
    end_time time not null,
    hours int not null check (hours > 0),
    price_cents int not null default 0 check (price_cents >= 0),
    currency text not null default 'NZD',
    status text not null default 'pending_payment' check (status in ('pending_payment', 'confirmed', 'cancelled', 'expired')),
    customer_name text not null,
    customer_email text not null,
    customer_phone text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists public_room_bookings_space_date_idx
    on public.public_room_bookings(space_slug, booking_date desc);

drop trigger if exists public_room_bookings_set_updated_at on public.public_room_bookings;
create trigger public_room_bookings_set_updated_at
before update on public.public_room_bookings
for each row execute function public.set_updated_at();

create table if not exists public.public_room_booking_payments (
    id uuid primary key default gen_random_uuid(),
    public_room_booking_id uuid not null references public.public_room_bookings(id) on delete cascade,
    stripe_customer_id text,
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

create unique index if not exists public_room_booking_payments_checkout_session_unique
    on public.public_room_booking_payments(stripe_checkout_session_id)
    where stripe_checkout_session_id is not null and stripe_checkout_session_id <> '';

create index if not exists public_room_booking_payments_booking_idx
    on public.public_room_booking_payments(public_room_booking_id, created_at desc);

drop trigger if exists public_room_booking_payments_set_updated_at on public.public_room_booking_payments;
create trigger public_room_booking_payments_set_updated_at
before update on public.public_room_booking_payments
for each row execute function public.set_updated_at();

-- RLS: public bookings are accessed via server-side API routes (service role).
alter table public.public_room_bookings enable row level security;
alter table public.public_room_booking_payments enable row level security;

drop policy if exists public_room_bookings_select_none on public.public_room_bookings;
create policy public_room_bookings_select_none
on public.public_room_bookings
for select
to anon, authenticated
using (false);

drop policy if exists public_room_bookings_write_none on public.public_room_bookings;
create policy public_room_bookings_write_none
on public.public_room_bookings
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists public_room_booking_payments_select_none on public.public_room_booking_payments;
create policy public_room_booking_payments_select_none
on public.public_room_booking_payments
for select
to anon, authenticated
using (false);

drop policy if exists public_room_booking_payments_write_none on public.public_room_booking_payments;
create policy public_room_booking_payments_write_none
on public.public_room_booking_payments
for all
to anon, authenticated
using (false)
with check (false);

commit;

