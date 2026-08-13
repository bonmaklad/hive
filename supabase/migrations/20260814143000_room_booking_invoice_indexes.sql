begin;

-- Admin-created Stripe invoices are reconciled by invoice id. Keep that link
-- unique so paid-invoice webhook retries can safely target one payment row.
create unique index if not exists room_booking_payments_invoice_unique
    on public.room_booking_payments (stripe_invoice_id)
    where stripe_invoice_id is not null and stripe_invoice_id <> '';

create unique index if not exists public_room_booking_payments_invoice_unique
    on public.public_room_booking_payments (stripe_invoice_id)
    where stripe_invoice_id is not null and stripe_invoice_id <> '';

commit;
