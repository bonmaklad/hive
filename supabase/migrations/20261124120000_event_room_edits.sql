begin;

create or replace function public.update_hive_event_room(
    p_event_id uuid,
    p_expected_updated_at timestamptz,
    p_event jsonb,
    p_slot jsonb,
    p_new_booking_owner uuid,
    p_editor_is_admin boolean
)
returns setof public.hive_events
language plpgsql
set search_path = public, pg_temp
as $$
declare
    v_event public.hive_events;
    v_booking public.room_bookings;
    v_slot public.room_bookings := jsonb_populate_record(null::public.room_bookings, p_slot);
begin
    select * into v_event from public.hive_events where id = p_event_id for update;
    if not found or v_event.updated_at is distinct from p_expected_updated_at then
        raise exception 'The event changed. Refresh and try again.' using errcode = '40001';
    end if;

    select * into v_booking
    from public.room_bookings
    where id = v_event.room_booking_id and status in ('requested', 'approved')
    for update;

    if not found and p_new_booking_owner is null then
        raise exception 'The linked room booking changed. Refresh and try again.' using errcode = '40001';
    end if;
    if v_booking.id is not null and v_booking.owner_id is distinct from v_event.organizer_id and not p_editor_is_admin then
        raise exception 'You can only move a room booking owned by the event organizer.' using errcode = '42501';
    end if;

    -- Serialize event edits for the same destination room and day.
    perform pg_advisory_xact_lock(hashtextextended('event-room:' || v_slot.space_slug || ':' || v_slot.booking_date, 0));

    if exists (
        select 1 from public.room_bookings b
        where b.space_slug = v_slot.space_slug and b.booking_date = v_slot.booking_date
          and b.status in ('requested', 'approved') and b.id is distinct from v_booking.id
          and b.start_time < v_slot.end_time and b.end_time > v_slot.start_time
    ) or exists (
        select 1 from public.public_room_bookings b
        where b.space_slug = v_slot.space_slug and b.booking_date = v_slot.booking_date
          and b.status in ('pending_payment', 'confirmed')
          and b.start_time < v_slot.end_time and b.end_time > v_slot.start_time
    ) then
        raise exception 'Room is already booked at this time.' using errcode = '23P01';
    end if;

    if v_booking.id is null then
        insert into public.room_bookings (
            owner_id, space_slug, booking_date, start_time, end_time, hours, tokens_used, price_cents, status
        ) values (
            p_new_booking_owner, v_slot.space_slug, v_slot.booking_date,
            v_slot.start_time, v_slot.end_time, v_slot.hours, 0, 0, 'requested'
        ) returning id into v_booking.id;
    else
        update public.room_bookings
        set space_slug = v_slot.space_slug, booking_date = v_slot.booking_date,
            start_time = v_slot.start_time, end_time = v_slot.end_time, hours = v_slot.hours
        where id = v_booking.id;
    end if;

    v_event := jsonb_populate_record(v_event, p_event);
    update public.hive_events
    set title = v_event.title, description = v_event.description,
        starts_at = v_event.starts_at, ends_at = v_event.ends_at, event_type = v_event.event_type,
        topics = v_event.topics, capacity = v_event.capacity, visibility = v_event.visibility,
        location_id = v_event.location_id, location_name = v_event.location_name,
        location_address = v_event.location_address, google_maps_url = v_event.google_maps_url,
        image_url = v_event.image_url, image_bucket = v_event.image_bucket, image_path = v_event.image_path,
        room_booking_id = v_booking.id
    where id = p_event_id
    returning * into v_event;

    return next v_event;
end;
$$;

revoke all on function public.update_hive_event_room(uuid, timestamptz, jsonb, jsonb, uuid, boolean)
    from public, anon, authenticated;
grant execute on function public.update_hive_event_room(uuid, timestamptz, jsonb, jsonb, uuid, boolean) to service_role;

commit;
