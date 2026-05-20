-- HIVE event calendar, RSVPs, locations, and event images.
-- Run this manually in Supabase before using event creation in the platform.

begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do update set public = true;

create table if not exists public.hive_event_locations (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid references public.tenants(id) on delete set null,
    created_by uuid references auth.users(id) on delete set null,
    name text not null,
    address text not null,
    google_maps_url text,
    is_hive_default boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists hive_event_locations_single_default
    on public.hive_event_locations (is_hive_default)
    where is_hive_default = true;

drop trigger if exists hive_event_locations_set_updated_at on public.hive_event_locations;
create trigger hive_event_locations_set_updated_at
before update on public.hive_event_locations
for each row execute function public.set_updated_at();

insert into public.hive_event_locations (
    id,
    name,
    address,
    google_maps_url,
    is_hive_default
)
values (
    '00000000-0000-0000-0000-000000000120',
    'HIVE Whanganui',
    'Level 2, 120 Victoria Avenue, Whanganui 4500, New Zealand',
    'https://www.google.com/maps/search/?api=1&query=Level%202%2C%20120%20Victoria%20Avenue%2C%20Whanganui%204500%2C%20New%20Zealand',
    true
)
on conflict (id) do update set
    name = excluded.name,
    address = excluded.address,
    google_maps_url = excluded.google_maps_url,
    is_hive_default = excluded.is_hive_default;

create table if not exists public.hive_events (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid references public.tenants(id) on delete set null,
    organizer_id uuid references auth.users(id) on delete set null,
    title text not null check (char_length(btrim(title)) between 2 and 160),
    description text not null default '',
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    timezone text not null default 'Pacific/Auckland',
    event_type text not null default 'discover' check (event_type in ('discover', 'incubate', 'accelerate', 'scale', 'community')),
    topics text[] not null default '{}'::text[],
    visibility text not null default 'public' check (visibility in ('public', 'members')),
    status text not null default 'published' check (status in ('draft', 'published', 'cancelled')),
    image_url text,
    image_bucket text,
    image_path text,
    location_id uuid references public.hive_event_locations(id) on delete set null,
    location_name text,
    location_address text,
    google_maps_url text,
    room_booking_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint hive_events_time_check check (ends_at > starts_at),
    constraint hive_events_topics_check check (
        topics <@ array[
            'Future Industries',
            'Big Data',
            'Robotics',
            'Software Automation',
            'AI & Applied ML',
            'Gaming',
            'Tech',
            'Design'
        ]::text[]
    )
);

create index if not exists hive_events_starts_at_idx
    on public.hive_events (starts_at asc);

create index if not exists hive_events_visibility_status_idx
    on public.hive_events (visibility, status, starts_at asc);

create index if not exists hive_events_tenant_idx
    on public.hive_events (tenant_id, starts_at asc);

create index if not exists hive_events_organizer_idx
    on public.hive_events (organizer_id, starts_at desc);

drop trigger if exists hive_events_set_updated_at on public.hive_events;
create trigger hive_events_set_updated_at
before update on public.hive_events
for each row execute function public.set_updated_at();

create table if not exists public.hive_event_rsvps (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.hive_events(id) on delete cascade,
    user_id uuid references auth.users(id) on delete set null,
    name text not null,
    email text not null,
    guests_count int not null default 1 check (guests_count between 1 and 10),
    status text not null default 'going' check (status in ('going', 'waitlist', 'cancelled')),
    note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists hive_event_rsvps_event_email_unique
    on public.hive_event_rsvps (event_id, lower(email));

create index if not exists hive_event_rsvps_event_idx
    on public.hive_event_rsvps (event_id, created_at desc);

drop trigger if exists hive_event_rsvps_set_updated_at on public.hive_event_rsvps;
create trigger hive_event_rsvps_set_updated_at
before update on public.hive_event_rsvps
for each row execute function public.set_updated_at();

alter table public.hive_event_locations enable row level security;
alter table public.hive_events enable row level security;
alter table public.hive_event_rsvps enable row level security;

drop policy if exists hive_event_locations_public_select on public.hive_event_locations;
create policy hive_event_locations_public_select
on public.hive_event_locations
for select
to anon, authenticated
using (true);

drop policy if exists hive_event_locations_authenticated_insert on public.hive_event_locations;
create policy hive_event_locations_authenticated_insert
on public.hive_event_locations
for insert
to authenticated
with check (created_by = auth.uid() or public.is_admin());

drop policy if exists hive_event_locations_owner_update on public.hive_event_locations;
create policy hive_event_locations_owner_update
on public.hive_event_locations
for update
to authenticated
using (created_by = auth.uid() or public.is_admin())
with check (created_by = auth.uid() or public.is_admin());

drop policy if exists hive_events_public_select on public.hive_events;
create policy hive_events_public_select
on public.hive_events
for select
to anon, authenticated
using (
    status = 'published'
    and (
        visibility = 'public'
        or organizer_id = auth.uid()
        or public.is_admin()
        or exists (
            select 1
            from public.tenant_users tu
            where tu.user_id = auth.uid()
              and tu.tenant_id = hive_events.tenant_id
        )
    )
);

drop policy if exists hive_events_authenticated_insert on public.hive_events;
create policy hive_events_authenticated_insert
on public.hive_events
for insert
to authenticated
with check (organizer_id = auth.uid() or public.is_admin());

drop policy if exists hive_events_organizer_update on public.hive_events;
create policy hive_events_organizer_update
on public.hive_events
for update
to authenticated
using (organizer_id = auth.uid() or public.is_admin())
with check (organizer_id = auth.uid() or public.is_admin());

drop policy if exists hive_events_organizer_delete on public.hive_events;
create policy hive_events_organizer_delete
on public.hive_events
for delete
to authenticated
using (organizer_id = auth.uid() or public.is_admin());

drop policy if exists hive_event_rsvps_select_event_owner on public.hive_event_rsvps;
create policy hive_event_rsvps_select_event_owner
on public.hive_event_rsvps
for select
to authenticated
using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (
        select 1
        from public.hive_events e
        where e.id = hive_event_rsvps.event_id
          and e.organizer_id = auth.uid()
    )
);

drop policy if exists hive_event_rsvps_insert_self on public.hive_event_rsvps;
create policy hive_event_rsvps_insert_self
on public.hive_event_rsvps
for insert
to anon, authenticated
with check (
    exists (
        select 1
        from public.hive_events e
        where e.id = hive_event_rsvps.event_id
          and e.status = 'published'
          and e.visibility = 'public'
    )
    or user_id = auth.uid()
);

drop policy if exists hive_event_rsvps_update_self on public.hive_event_rsvps;
create policy hive_event_rsvps_update_self
on public.hive_event_rsvps
for update
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists event_images_public_read on storage.objects;
create policy event_images_public_read
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'event-images');

drop policy if exists event_images_authenticated_upload on storage.objects;
create policy event_images_authenticated_upload
on storage.objects
for insert
to authenticated
with check (bucket_id = 'event-images');

drop policy if exists event_images_owner_update on storage.objects;
create policy event_images_owner_update
on storage.objects
for update
to authenticated
using (bucket_id = 'event-images' and owner = auth.uid())
with check (bucket_id = 'event-images' and owner = auth.uid());

drop policy if exists event_images_owner_delete on storage.objects;
create policy event_images_owner_delete
on storage.objects
for delete
to authenticated
using (bucket_id = 'event-images' and (owner = auth.uid() or public.is_admin()));

grant select on public.hive_event_locations to anon, authenticated;
grant select on public.hive_events to anon, authenticated;
grant select, insert, update, delete on public.hive_events to authenticated;
grant select, insert, update on public.hive_event_locations to authenticated;
grant select, insert, update on public.hive_event_rsvps to anon, authenticated;

commit;
