begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create table if not exists public.community_signups (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    email_normalized text generated always as (lower(btrim(email))) stored,
    first_name text,
    last_name text,
    company text,
    phone text,
    person_type text not null default 'community',
    source text not null default 'website',
    status text not null default 'active' check (status in ('active', 'paused', 'unsubscribed')),
    metadata jsonb not null default '{}'::jsonb,
    subscribed_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint community_signups_email_not_blank check (length(btrim(email)) > 3),
    constraint community_signups_person_type_not_blank check (length(btrim(person_type)) > 0)
);

create unique index if not exists community_signups_email_person_type_unique
    on public.community_signups(email_normalized, person_type);

create index if not exists community_signups_person_type_status_idx
    on public.community_signups(person_type, status, created_at desc);

drop trigger if exists community_signups_set_updated_at on public.community_signups;
create trigger community_signups_set_updated_at
before update on public.community_signups
for each row execute function public.set_updated_at();

alter table public.community_signups enable row level security;

commit;
