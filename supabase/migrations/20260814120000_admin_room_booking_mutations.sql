begin;

-- Keep the original token debit and cancellation/refund audit trail on the
-- booking so an admin retry cannot return the same tokens twice.
alter table public.room_bookings
    add column if not exists token_owner_id uuid references auth.users(id) on delete set null,
    add column if not exists token_period_start date,
    add column if not exists tokens_refunded_at timestamptz,
    add column if not exists cancelled_at timestamptz;

alter table public.public_room_bookings
    add column if not exists cancelled_at timestamptz;

alter table public.room_booking_payments
    add column if not exists stripe_refund_id text,
    add column if not exists refunded_at timestamptz;

alter table public.public_room_booking_payments
    add column if not exists stripe_refund_id text,
    add column if not exists refunded_at timestamptz;

alter table public.room_booking_payments
    drop constraint if exists room_booking_payments_status_check;
alter table public.room_booking_payments
    add constraint room_booking_payments_status_check
    check (status in ('requires_payment', 'paid', 'failed', 'cancelled', 'refund_pending', 'refunded'));

alter table public.public_room_booking_payments
    drop constraint if exists public_room_booking_payments_status_check;
alter table public.public_room_booking_payments
    add constraint public_room_booking_payments_status_check
    check (status in ('requires_payment', 'paid', 'failed', 'cancelled', 'refund_pending', 'refunded'));

create unique index if not exists room_booking_payments_refund_unique
    on public.room_booking_payments (stripe_refund_id)
    where stripe_refund_id is not null and stripe_refund_id <> '';

create unique index if not exists public_room_booking_payments_refund_unique
    on public.public_room_booking_payments (stripe_refund_id)
    where stripe_refund_id is not null and stripe_refund_id <> '';

-- Token balances and the refund marker move together. The service-role-only
-- function also makes cancellation retries idempotent.
create or replace function public.refund_room_booking_tokens(p_booking_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_booking public.room_bookings%rowtype;
    v_token_owner_id uuid;
    v_period_start date;
    v_refund integer;
begin
    select *
      into v_booking
      from public.room_bookings
     where id = p_booking_id
     for update;

    if not found then
        raise exception 'Room booking % was not found.', p_booking_id;
    end if;

    v_refund := greatest(0, coalesce(v_booking.tokens_used, 0));
    if v_booking.status <> 'approved' or v_booking.tokens_refunded_at is not null then
        v_refund := 0;
    end if;

    if v_refund > 0 then
        v_token_owner_id := coalesce(v_booking.token_owner_id, v_booking.owner_id);
        v_period_start := v_booking.token_period_start;
        if v_period_start is null then
            select rc.period_start
              into v_period_start
              from public.room_credits rc
             where rc.owner_id = v_token_owner_id
               and rc.tokens_used >= v_refund
             order by rc.period_start desc
             limit 1;
        end if;

        if v_period_start is null then
            raise exception 'No token credit period can refund booking %.', p_booking_id;
        end if;

        update public.room_credits
           set tokens_used = tokens_used - v_refund,
               updated_at = now()
         where owner_id = v_token_owner_id
           and period_start = v_period_start
           and tokens_used >= v_refund;

        if not found then
            raise exception 'Token credits for booking % are missing or already below the refund amount.', p_booking_id;
        end if;
    end if;

    update public.room_bookings
       set token_period_start = coalesce(v_period_start, token_period_start),
           tokens_refunded_at = case when v_refund > 0 then now() else tokens_refunded_at end,
           status = 'cancelled',
           cancelled_at = coalesce(cancelled_at, now()),
           updated_at = now()
     where id = p_booking_id;

    return v_refund;
end;
$$;

revoke all on function public.refund_room_booking_tokens(uuid) from public;
revoke all on function public.refund_room_booking_tokens(uuid) from anon;
revoke all on function public.refund_room_booking_tokens(uuid) from authenticated;
grant execute on function public.refund_room_booking_tokens(uuid) to service_role;

-- Marking a paid member booking approved and debiting its tokens must be one
-- transaction. This prevents webhook retries from charging tokens twice.
create or replace function public.finalize_paid_room_booking(p_booking_id uuid, p_token_owner_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_booking public.room_bookings%rowtype;
    v_token_owner_id uuid;
    v_period_start date;
    v_tokens integer;
begin
    select *
      into v_booking
      from public.room_bookings
     where id = p_booking_id
     for update;

    if not found then
        raise exception 'Room booking % was not found.', p_booking_id;
    end if;
    if v_booking.status = 'approved' then
        return false;
    end if;
    if v_booking.status in ('cancelled', 'rejected') then
        raise exception 'Room booking % cannot be approved from status %.', p_booking_id, v_booking.status;
    end if;

    v_tokens := greatest(0, coalesce(v_booking.tokens_used, 0));
    v_token_owner_id := coalesce(v_booking.token_owner_id, p_token_owner_id, v_booking.owner_id);
    v_period_start := v_booking.token_period_start;

    if v_tokens > 0 then
        if v_period_start is null then
            select rc.period_start
              into v_period_start
              from public.room_credits rc
             where rc.owner_id = v_token_owner_id
             order by rc.period_start desc
             limit 1;
        end if;
        if v_period_start is null then
            raise exception 'No token credit period can charge booking %.', p_booking_id;
        end if;

        update public.room_credits
           set tokens_used = tokens_used + v_tokens,
               updated_at = now()
         where owner_id = v_token_owner_id
           and period_start = v_period_start;
        if not found then
            raise exception 'Token credits for booking % were not found.', p_booking_id;
        end if;
    end if;

    update public.room_bookings
       set token_owner_id = v_token_owner_id,
           token_period_start = v_period_start,
           status = 'approved',
           updated_at = now()
     where id = p_booking_id;

    return true;
end;
$$;

revoke all on function public.finalize_paid_room_booking(uuid, uuid) from public;
revoke all on function public.finalize_paid_room_booking(uuid, uuid) from anon;
revoke all on function public.finalize_paid_room_booking(uuid, uuid) from authenticated;
grant execute on function public.finalize_paid_room_booking(uuid, uuid) to service_role;

commit;
