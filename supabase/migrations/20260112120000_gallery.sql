begin;

create table if not exists public.gallery_items (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users (id) on delete cascade,
    bucket_id text not null default 'hive_gallery',
    object_path text not null,
    file_name text,
    mime_type text,
    size_bytes bigint,
    tags text[] not null default '{}',
    created_at timestamptz not null default now()
);

create index if not exists gallery_items_created_at_idx on public.gallery_items (created_at desc);
create index if not exists gallery_items_tags_idx on public.gallery_items using gin (tags);

alter table public.gallery_items enable row level security;

drop policy if exists gallery_items_select_auth on public.gallery_items;
drop policy if exists gallery_items_insert_own on public.gallery_items;
drop policy if exists gallery_items_update_own on public.gallery_items;
drop policy if exists gallery_items_delete_own on public.gallery_items;

create policy gallery_items_select_auth
on public.gallery_items
for select
using (auth.uid() is not null);

create policy gallery_items_insert_own
on public.gallery_items
for insert
with check (owner_id = auth.uid());

create policy gallery_items_update_own
on public.gallery_items
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy gallery_items_delete_own
on public.gallery_items
for delete
using (owner_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('hive_gallery', 'hive_gallery', true)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

drop policy if exists hive_gallery_select on storage.objects;
drop policy if exists hive_gallery_insert on storage.objects;
drop policy if exists hive_gallery_delete on storage.objects;

create policy hive_gallery_select
on storage.objects
for select
using (bucket_id = 'hive_gallery' and auth.uid() is not null);

create policy hive_gallery_insert
on storage.objects
for insert
with check (bucket_id = 'hive_gallery' and auth.uid() is not null);

create policy hive_gallery_delete
on storage.objects
for delete
using (bucket_id = 'hive_gallery' and owner = auth.uid());

commit;
