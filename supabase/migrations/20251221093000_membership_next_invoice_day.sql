begin;

-- Convert memberships.next_invoice_at from DATE -> day-of-month INT.
-- We store the billing day (1..31). UI derives the next invoice date from this.
alter table public.memberships
    alter column next_invoice_at type int
    using (
        case
            when next_invoice_at is null then null
            else extract(day from next_invoice_at)::int
        end
    );

-- Populate missing billing day from created_at (keeps existing "monthly from created_at" behaviour).
update public.memberships
set next_invoice_at = extract(day from created_at)::int
where next_invoice_at is null;

alter table public.memberships
    add constraint memberships_next_invoice_at_day_check
    check (next_invoice_at between 1 and 31);

commit;

