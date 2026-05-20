-- Add event capacity for RSVP sold-out handling.

begin;

alter table public.hive_events
    add column if not exists capacity int;

alter table public.hive_events
    drop constraint if exists hive_events_capacity_check;

alter table public.hive_events
    add constraint hive_events_capacity_check
    check (capacity is null or capacity between 1 and 10000);

commit;
