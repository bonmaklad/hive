begin;

alter table public.memberships
    add column if not exists stripe_subscription_id text;

create index if not exists memberships_stripe_subscription_id_idx
    on public.memberships(stripe_subscription_id);

commit;

