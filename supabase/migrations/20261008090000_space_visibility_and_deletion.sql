begin;

alter table public.spaces
    add column if not exists is_visible boolean not null default true,
    add column if not exists deleted_at timestamptz;

-- Deleting a space retains its row for existing booking and payment references.
-- Block new bookings, including direct member inserts and stale browser requests.
create or replace function public.check_booking_space_available()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_visible boolean;
    v_deleted_at timestamptz;
begin
    -- Existing bookings can still be paid, cancelled, or updated in their room.
    if tg_op = 'UPDATE' then
        if new.space_slug is not distinct from old.space_slug then
            return new;
        end if;
    end if;

    select is_visible, deleted_at
      into v_visible, v_deleted_at
      from public.spaces
     where slug = new.space_slug
     for share;

    -- Missing spaces are handled by the existing foreign key constraint.
    if found and (v_deleted_at is not null or (tg_table_name = 'public_room_bookings' and not v_visible)) then
        raise exception 'This room is no longer available for new bookings.'
            using errcode = '23514';
    end if;

    return new;
end;
$$;

revoke all on function public.check_booking_space_available() from public;

drop trigger if exists room_bookings_check_space_available on public.room_bookings;
create trigger room_bookings_check_space_available
before insert or update of space_slug on public.room_bookings
for each row execute function public.check_booking_space_available();

drop trigger if exists public_room_bookings_check_space_available on public.public_room_bookings;
create trigger public_room_bookings_check_space_available
before insert or update of space_slug on public.public_room_bookings
for each row execute function public.check_booking_space_available();

commit;
