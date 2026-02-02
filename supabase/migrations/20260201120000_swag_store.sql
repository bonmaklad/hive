begin;

create table if not exists public.swag_items (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    description text,
    image_url text,
    tokens_cost int not null check (tokens_cost >= 0),
    stock_qty int not null default 0 check (stock_qty >= 0),
    stock_unlimited boolean not null default false,
    is_active boolean not null default true,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists swag_items_active_idx on public.swag_items (is_active);
create index if not exists swag_items_stock_idx on public.swag_items (stock_unlimited, stock_qty);
create index if not exists swag_items_created_at_idx on public.swag_items (created_at desc);

drop trigger if exists swag_items_set_updated_at on public.swag_items;
create trigger swag_items_set_updated_at
before update on public.swag_items
for each row execute function public.set_updated_at();

alter table public.swag_items enable row level security;

drop policy if exists swag_items_select_auth on public.swag_items;
drop policy if exists swag_items_admin_insert on public.swag_items;
drop policy if exists swag_items_admin_update on public.swag_items;
drop policy if exists swag_items_admin_delete on public.swag_items;

create policy swag_items_select_auth
on public.swag_items
for select
using (auth.uid() is not null);

create policy swag_items_admin_insert
on public.swag_items
for insert
with check (public.is_admin());

create policy swag_items_admin_update
on public.swag_items
for update
using (public.is_admin())
with check (public.is_admin());

create policy swag_items_admin_delete
on public.swag_items
for delete
using (public.is_admin());

grant select on public.swag_items to authenticated;

create table if not exists public.swag_orders (
    id uuid primary key default gen_random_uuid(),
    item_id uuid not null references public.swag_items(id) on delete restrict,
    purchaser_id uuid not null references auth.users(id) on delete cascade,
    token_owner_id uuid not null references auth.users(id) on delete cascade,
    tenant_id uuid references public.tenants(id) on delete set null,
    token_period_start date not null,
    quantity int not null default 1 check (quantity > 0),
    unit_tokens int not null default 0 check (unit_tokens >= 0),
    tokens_cost int not null default 0 check (tokens_cost >= 0),
    status text not null default 'placed' check (status in ('placed', 'fulfilled', 'cancelled')),
    item_snapshot jsonb,
    admin_notes text,
    fulfilled_at timestamptz,
    cancelled_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists swag_orders_created_at_idx on public.swag_orders (created_at desc);
create index if not exists swag_orders_purchaser_idx on public.swag_orders (purchaser_id, created_at desc);
create index if not exists swag_orders_token_owner_idx on public.swag_orders (token_owner_id, created_at desc);

drop trigger if exists swag_orders_set_updated_at on public.swag_orders;
create trigger swag_orders_set_updated_at
before update on public.swag_orders
for each row execute function public.set_updated_at();

alter table public.swag_orders enable row level security;

drop policy if exists swag_orders_select_own on public.swag_orders;
drop policy if exists swag_orders_insert_own on public.swag_orders;
drop policy if exists swag_orders_admin_update on public.swag_orders;

create policy swag_orders_select_own
on public.swag_orders
for select
using (purchaser_id = auth.uid() or public.is_admin());

create policy swag_orders_insert_own
on public.swag_orders
for insert
with check (purchaser_id = auth.uid());

create policy swag_orders_admin_update
on public.swag_orders
for update
using (public.is_admin())
with check (public.is_admin());

grant select, insert on public.swag_orders to authenticated;

commit;
