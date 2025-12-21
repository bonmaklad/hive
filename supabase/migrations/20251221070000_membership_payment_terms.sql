begin;

-- Add membership payment terms (invoice vs automatic card payment).
alter table public.memberships
    add column if not exists payment_terms text not null default 'invoice'
        check (payment_terms in ('invoice', 'auto_card'));

create index if not exists memberships_payment_terms_idx on public.memberships(payment_terms);

commit;

