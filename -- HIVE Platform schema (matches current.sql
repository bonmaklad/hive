-- HIVE Platform schema (matches current UI structure)
-- Run in Supabase SQL editor (as postgres)

begin;

create extension if not exists pgcrypto;

-- =========================
-- Helpers
-- =========================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;



-- =========================
-- Profiles (name + admin flag)
-- =========================
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text,
    name text,
    is_admin boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_admin = true
    );
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email, name)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', '')
    )
    on conflict (id) do update
    set email = excluded.email;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

grant select, update on public.profiles to authenticated;

-- =========================
-- Spaces (rooms + pricing source of truth)
-- =========================
create table if not exists public.spaces (
    slug text primary key,
    title text not null,
    pricing_half_day_cents int,
    pricing_full_day_cents int,
    pricing_per_event_cents int,
    tokens_per_hour int not null default 1,
    image text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

drop trigger if exists spaces_set_updated_at on public.spaces;
create trigger spaces_set_updated_at
before update on public.spaces
for each row execute function public.set_updated_at();

alter table public.spaces enable row level security;

drop policy if exists "spaces_select_all" on public.spaces;
create policy "spaces_select_all"
on public.spaces
for select
to anon, authenticated
using (true);

-- Admin-only writes (optional)
drop policy if exists "spaces_admin_write" on public.spaces;
create policy "spaces_admin_write"
on public.spaces
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.spaces to anon, authenticated;

-- Seed rooms used in platform booking UI (pricing in NZD cents)
insert into public.spaces (slug, title, pricing_half_day_cents, pricing_full_day_cents, pricing_per_event_cents, tokens_per_hour, image)
values
    ('nikau-room', 'Nikau Room', 12000, 20000, null, 1, '/nikau1.jpg'),
    ('kauri-room', 'Kauri Room', 8000, 15000, null, 1, '/meeting1.jpg'),
    ('backhouse-boardroom', 'Backhouse Boardroom', 10000, 18000, null, 2, null),
    ('manukau-room', 'Manukau Room', 10000, 18000, null, 1, '/manukau1.jpg'),
    ('hive-training-room', 'Hive Training Room', 8000, 15000, null, 1, null),
    ('design-lab', 'Hive Design Lab', 15000, 28000, null, 2, '/design1.jpg'),
    ('hive-lounge', 'Hive Lounge', null, null, 50000, 0, '/lounge1.jpg')
on conflict (slug) do nothing;

-- =========================
-- Website hosting (existing)
-- =========================
create table if not exists public.sites (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    domain text not null unique,
    repo text not null,
    framework text not null check (framework in ('next', 'static', 'node')),
    created_at timestamptz not null default now()
);

create index if not exists sites_owner_id_idx on public.sites(owner_id);

alter table public.sites enable row level security;

drop policy if exists "sites_select_own" on public.sites;
create policy "sites_select_own"
on public.sites
for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists "sites_insert_own" on public.sites;
create policy "sites_insert_own"
on public.sites
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "sites_update_own" on public.sites;
create policy "sites_update_own"
on public.sites
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "sites_delete_own" on public.sites;
create policy "sites_delete_own"
on public.sites
for delete
to authenticated
using (owner_id = auth.uid());

grant select, insert, update, delete on public.sites to authenticated;

create table if not exists public.deployments (
    id uuid primary key default gen_random_uuid(),
    site_id uuid not null references public.sites(id) on delete cascade,
    status text not null check (status in ('pending', 'success', 'failed')),
    created_at timestamptz not null default now()
);

create index if not exists deployments_site_id_created_at_idx on public.deployments(site_id, created_at desc);

alter table public.deployments enable row level security;

drop policy if exists "deployments_select_own_sites" on public.deployments;
create policy "deployments_select_own_sites"
on public.deployments
for select
to authenticated
using (
    exists (
        select 1
        from public.sites s
        where s.id = deployments.site_id
          and s.owner_id = auth.uid()
    )
    or public.is_admin()
);

-- No insert/update/delete policies for authenticated:
-- deployments are expected to be written by service role (deploy server) or admin tooling.

grant select on public.deployments to authenticated;

-- =========================
-- Chat (real-time later; table matches current message shape)
-- =========================
create table if not exists public.chat_messages (
    id uuid primary key default gen_random_uuid(),
    channel text not null default 'members',
    user_id uuid not null references auth.users(id) on delete cascade,
    user_name text not null,
    body text not null,
    created_at timestamptz not null default now()
);

create index if not exists chat_messages_channel_created_at_idx on public.chat_messages(channel, created_at desc);

alter table public.chat_messages enable row level security;

drop policy if exists "chat_select_authenticated" on public.chat_messages;
create policy "chat_select_authenticated"
on public.chat_messages
for select
to authenticated
using (true);

drop policy if exists "chat_insert_self" on public.chat_messages;
create policy "chat_insert_self"
on public.chat_messages
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "chat_admin_delete" on public.chat_messages;
create policy "chat_admin_delete"
on public.chat_messages
for delete
to authenticated
using (public.is_admin());

grant select, insert on public.chat_messages to authenticated;

-- Enable realtime for chat (safe if publication already exists)
do $$
begin
    execute 'alter publication supabase_realtime add table public.chat_messages';
exception when duplicate_object then
    null;
end $$;

-- =========================
-- Tickets (kanban: backlog / doing / done)
-- Members: only see + create their own, cannot move.
-- Admin: sees all + can move (update status).
-- =========================
create table if not exists public.tickets (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    status text not null default 'backlog' check (status in ('backlog', 'doing', 'done')),
    title text not null,
    body text,
    created_by_name text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists tickets_owner_id_status_idx on public.tickets(owner_id, status);
create index if not exists tickets_status_idx on public.tickets(status);

drop trigger if exists tickets_set_updated_at on public.tickets;
create trigger tickets_set_updated_at
before update on public.tickets
for each row execute function public.set_updated_at();

alter table public.tickets enable row level security;

drop policy if exists "tickets_select_own" on public.tickets;
create policy "tickets_select_own"
on public.tickets
for select
to authenticated
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "tickets_insert_own" on public.tickets;
create policy "tickets_insert_own"
on public.tickets
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "tickets_admin_update" on public.tickets;
create policy "tickets_admin_update"
on public.tickets
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert on public.tickets to authenticated;

-- Optional: realtime ticket board for admins
do $$
begin
    execute 'alter publication supabase_realtime add table public.tickets';
exception when duplicate_object then
    null;
end $$;

-- =========================
-- Room bookings (multi-hour ranges)
-- Members: create + view their own bookings.
-- Admin: sees all + approves/rejects.
-- =========================
create table if not exists public.room_bookings (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    space_slug text not null references public.spaces(slug),
    booking_date date not null,
    start_time time not null,
    end_time time not null,
    hours int not null check (hours > 0),
    tokens_used int not null default 0 check (tokens_used >= 0),
    price_cents int not null default 0 check (price_cents >= 0),
    currency text not null default 'NZD',
    status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'cancelled')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists room_bookings_owner_date_idx on public.room_bookings(owner_id, booking_date desc);
create index if not exists room_bookings_space_date_idx on public.room_bookings(space_slug, booking_date desc);

drop trigger if exists room_bookings_set_updated_at on public.room_bookings;
create trigger room_bookings_set_updated_at
before update on public.room_bookings
for each row execute function public.set_updated_at();

alter table public.room_bookings enable row level security;

drop policy if exists "room_bookings_select_own" on public.room_bookings;
create policy "room_bookings_select_own"
on public.room_bookings
for select
to authenticated
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "room_bookings_insert_own" on public.room_bookings;
create policy "room_bookings_insert_own"
on public.room_bookings
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "room_bookings_admin_update" on public.room_bookings;
create policy "room_bookings_admin_update"
on public.room_bookings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert on public.room_bookings to authenticated;

-- Optional monthly room credits (tokens)
create table if not exists public.room_credits (
    owner_id uuid not null references auth.users(id) on delete cascade,
    period_start date not null, -- first day of month
    tokens_total int not null default 0 check (tokens_total >= 0),
    tokens_used int not null default 0 check (tokens_used >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (owner_id, period_start)
);

drop trigger if exists room_credits_set_updated_at on public.room_credits;
create trigger room_credits_set_updated_at
before update on public.room_credits
for each row execute function public.set_updated_at();

alter table public.room_credits enable row level security;

drop policy if exists "room_credits_select_own" on public.room_credits;
create policy "room_credits_select_own"
on public.room_credits
for select
to authenticated
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "room_credits_admin_write" on public.room_credits;
create policy "room_credits_admin_write"
on public.room_credits
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.room_credits to authenticated;

-- =========================
-- Membership + invoices + approval-based changes
-- Members: view membership + invoices; request changes (pending approval).
-- Admin: manages everything.
-- =========================
create table if not exists public.memberships (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    status text not null default 'live' check (status in ('live', 'expired', 'cancelled')),
    plan text not null check (plan in ('member', 'desk', 'pod', 'office', 'premium', 'custom')),
    office_id text,
    donation_cents int not null default 0 check (donation_cents >= 0),
    fridge_enabled boolean not null default false,
    currency text not null default 'NZD',
    monthly_amount_cents int not null default 0 check (monthly_amount_cents >= 0),
    next_invoice_at date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists memberships_owner_id_idx on public.memberships(owner_id);

drop trigger if exists memberships_set_updated_at on public.memberships;
create trigger memberships_set_updated_at
before update on public.memberships
for each row execute function public.set_updated_at();

alter table public.memberships enable row level security;

drop policy if exists "memberships_select_own" on public.memberships;
create policy "memberships_select_own"
on public.memberships
for select
to authenticated
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "memberships_admin_write" on public.memberships;
create policy "memberships_admin_write"
on public.memberships
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.memberships to authenticated;

create table if not exists public.membership_change_requests (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    membership_id uuid references public.memberships(id) on delete set null,
    requested_plan text check (requested_plan in ('member', 'desk', 'pod', 'office', 'premium', 'custom')),
    requested_office_id text,
    requested_donation_cents int not null default 0 check (requested_donation_cents >= 0),
    requested_fridge_enabled boolean not null default false,
    note text,
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    decided_at timestamptz,
    decided_by uuid references auth.users(id),
    decision_note text,
    created_at timestamptz not null default now()
);

create index if not exists membership_change_requests_owner_idx on public.membership_change_requests(owner_id, created_at desc);
create index if not exists membership_change_requests_status_idx on public.membership_change_requests(status);

alter table public.membership_change_requests enable row level security;

drop policy if exists "membership_change_requests_select_own" on public.membership_change_requests;
create policy "membership_change_requests_select_own"
on public.membership_change_requests
for select
to authenticated
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "membership_change_requests_insert_own" on public.membership_change_requests;
create policy "membership_change_requests_insert_own"
on public.membership_change_requests
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "membership_change_requests_admin_update" on public.membership_change_requests;
create policy "membership_change_requests_admin_update"
on public.membership_change_requests
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert on public.membership_change_requests to authenticated;

create table if not exists public.invoices (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    membership_id uuid references public.memberships(id) on delete set null,
    invoice_number text unique,
    amount_cents int not null check (amount_cents >= 0),
    currency text not null default 'NZD',
    status text not null default 'open' check (status in ('draft', 'open', 'paid', 'void')),
    issued_on date,
    due_on date,
    paid_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists invoices_owner_idx on public.invoices(owner_id, created_at desc);

alter table public.invoices enable row level security;

drop policy if exists "invoices_select_own" on public.invoices;
create policy "invoices_select_own"
on public.invoices
for select
to authenticated
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "invoices_admin_write" on public.invoices;
create policy "invoices_admin_write"
on public.invoices
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.invoices to authenticated;

commit;
