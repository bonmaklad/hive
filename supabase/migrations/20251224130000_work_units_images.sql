begin;

alter table public.work_units
    add column if not exists image text,
    add column if not exists image_bucket text,
    add column if not exists image_path text;

commit;

