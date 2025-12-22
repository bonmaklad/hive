-- Spaces CMS upgrades: richer content fields + multiple images via storage bucket.

begin;

create extension if not exists pgcrypto;

-- Ensure shared updated_at trigger helper exists (some older DBs may be missing it).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- Extend spaces with website content fields.
alter table public.spaces
    add column if not exists copy text,
    add column if not exists capacity text,
    add column if not exists layouts jsonb not null default '[]'::jsonb,
    add column if not exists highlights jsonb not null default '[]'::jsonb,
    add column if not exists best_for jsonb not null default '[]'::jsonb;

-- Multiple images per space (covers both Supabase Storage and external URLs).
create table if not exists public.space_images (
    id uuid primary key default gen_random_uuid(),
    space_slug text not null references public.spaces(slug) on delete cascade,
    bucket text,
    path text,
    url text not null,
    sort_order int not null default 0,
    alt text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint space_images_bucket_path_check check (
        (bucket is null and path is null)
        or (bucket is not null and path is not null)
    )
);

create index if not exists space_images_space_order_idx
    on public.space_images(space_slug, sort_order asc, created_at asc);

create unique index if not exists space_images_space_url_unique
    on public.space_images(space_slug, url);

drop trigger if exists space_images_set_updated_at on public.space_images;
create trigger space_images_set_updated_at
before update on public.space_images
for each row execute function public.set_updated_at();

-- RLS: reads allowed; writes go through server-side API routes (service role).
alter table public.space_images enable row level security;

drop policy if exists space_images_select_all on public.space_images;
create policy space_images_select_all
on public.space_images
for select
to anon, authenticated
using (true);

drop policy if exists space_images_write_none on public.space_images;
create policy space_images_write_none
on public.space_images
for all
to anon, authenticated
using (false)
with check (false);

grant select on public.space_images to anon, authenticated;

-- Seed rich content from the current hardcoded website data (so the UI stays the same after switching to DB).
update public.spaces
set
    copy = 'A flexible seminar room with big energy and views down Victoria Avenue.',
    capacity = 'Up to 12 seated (layout dependent)',
    layouts = '[
        {"label":"Boardroom","capacity":"10 people"},
        {"label":"Cafe style","capacity":"12 people (3 tables)"},
        {"label":"Classroom","capacity":"8 people (2 rows)"}
    ]'::jsonb,
    highlights = '["Whiteboard","TV with casting","Natural light + street views"]'::jsonb,
    best_for = '["Workshops","Planning sessions","Team offsites","Client meetings"]'::jsonb
where slug = 'nikau-room';

update public.spaces
set
    copy = 'A calm, light-filled meeting room for focused 1:1s and small team sessions.',
    capacity = 'Up to 4 people',
    layouts = '[{"label":"Meeting","capacity":"Up to 4 people"}]'::jsonb,
    highlights = '["Whiteboard","Quiet + private","Great for short sessions"]'::jsonb,
    best_for = '["1:1s","Interviews","Client check-ins","Planning"]'::jsonb
where slug = 'kauri-room';

update public.spaces
set
    copy = 'Executive boardroom for 6–8 people with conferencing-grade audio visual.',
    capacity = '6–8 people',
    layouts = '[{"label":"Executive boardroom","capacity":"6–8 people"}]'::jsonb,
    highlights = '["Large TV","Camera, microphones, speakers","Cast or plug in a laptop","Custom Whanganui-made boardroom table"]'::jsonb,
    best_for = '["Board meetings","Investor calls","Strategy sessions","Remote conferences"]'::jsonb
where slug = 'backhouse-boardroom';

update public.spaces
set
    copy = 'A flexible meeting space for collaborative sessions, workshops, and short training runs.',
    capacity = 'Up to 6 people',
    layouts = '[{"label":"Workshop","capacity":"Up to 6 people"}]'::jsonb,
    highlights = '["TV","Whiteboard","Easy setup"]'::jsonb,
    best_for = '["Workshops","Team sessions","Small training","Meetings"]'::jsonb
where slug = 'manukau-room';

update public.spaces
set
    copy = 'A 15-person desk setup with monitors, projector, and a whiteboard—built for learning.',
    capacity = '15 people',
    layouts = '[{"label":"Training desks","capacity":"15 desks"}]'::jsonb,
    highlights = '["Monitors","Projector","Whiteboard"]'::jsonb,
    best_for = '["Training days","Team enablement","Hands-on workshops","Study groups"]'::jsonb
where slug = 'hive-training-room';

update public.spaces
set
    copy = 'A 30-person space designed to spark creativity—floor-to-ceiling whiteboards and room to move.',
    capacity = 'Up to 30 people',
    layouts = '[{"label":"Studio / workshop","capacity":"Up to 30 people"}]'::jsonb,
    highlights = '["Floor-to-ceiling whiteboards","TV","Built for strategic + product sessions"]'::jsonb,
    best_for = '["Innovation learning","Product development","Strategic planning","Design sprints"]'::jsonb
where slug = 'design-lab';

update public.spaces
set
    copy = 'After-hours event space for up to 50 people—ideal for talks, launches, and community nights.',
    capacity = 'Up to 50 people (5pm–10pm)',
    layouts = '[{"label":"Event-style seating","capacity":"Up to 50 people"}]'::jsonb,
    highlights = '["Whiteboards","TVs on wheels","PA system","Optional staff for food + drinks service"]'::jsonb,
    best_for = '["Evening talks","Product launches","Community meetups","Celebrations"]'::jsonb
where slug = 'hive-lounge';

-- Seed images from the current hardcoded website data (external URLs and public/ assets).
insert into public.space_images (space_slug, url, sort_order, alt)
values
    ('nikau-room', '/nikau1.jpg', 0, 'Nikau Room'),
    ('nikau-room', '/nikau2.jpg', 1, 'Nikau Room'),
    ('nikau-room', '/nikau3.jpg', 2, 'Nikau Room'),
    ('kauri-room', '/meeting1.jpg', 0, 'Kauri Room'),
    ('backhouse-boardroom', 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1600&q=80', 0, 'Backhouse Boardroom'),
    ('backhouse-boardroom', 'https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=1600&q=80', 1, 'Backhouse Boardroom'),
    ('backhouse-boardroom', 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1600&q=80', 2, 'Backhouse Boardroom'),
    ('manukau-room', '/manukau1.jpg', 0, 'Manukau Room'),
    ('manukau-room', '/manuka2.jpg', 1, 'Manukau Room'),
    ('hive-training-room', 'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1600&q=80', 0, 'Hive Training Room'),
    ('hive-training-room', 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1600&q=80', 1, 'Hive Training Room'),
    ('hive-training-room', 'https://images.unsplash.com/photo-1588072432836-2fdc0fbb2b2c?auto=format&fit=crop&w=1600&q=80', 2, 'Hive Training Room'),
    ('design-lab', '/design1.jpg', 0, 'Hive Design Lab'),
    ('hive-lounge', '/lounge1.jpg', 0, 'Hive Lounge'),
    ('hive-lounge', '/lounge3.jpg', 1, 'Hive Lounge')
on conflict do nothing;

commit;

