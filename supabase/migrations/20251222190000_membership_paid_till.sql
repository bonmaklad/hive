begin;

-- Allow invoice-based memberships that are paid in advance for a period.
alter table public.memberships
    add column if not exists paid_till date;

-- Expand payment_terms to include 'advanced' (paid in advance on invoice).
do $$
declare
    r record;
begin
    for r in
        select conname
        from pg_constraint
        where conrelid = 'public.memberships'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%payment_terms%'
    loop
        execute format('alter table public.memberships drop constraint %I', r.conname);
    end loop;
end $$;

alter table public.memberships
    add constraint memberships_payment_terms_check
    check (payment_terms in ('invoice', 'auto_card', 'advanced'));

create index if not exists memberships_paid_till_idx on public.memberships(paid_till);

commit;

