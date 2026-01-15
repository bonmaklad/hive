-- Track per-user chat read state for unread counts + dividers.

begin;

create table if not exists public.chat_read_states (
    user_id uuid not null references auth.users(id) on delete cascade,
    channel text not null default 'members',
    last_read_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, channel)
);

create index if not exists chat_read_states_channel_last_read_at_idx
    on public.chat_read_states(channel, last_read_at desc);

drop trigger if exists chat_read_states_set_updated_at on public.chat_read_states;
create trigger chat_read_states_set_updated_at
before update on public.chat_read_states
for each row execute function public.set_updated_at();

alter table public.chat_read_states enable row level security;

drop policy if exists chat_read_states_select_self on public.chat_read_states;
create policy chat_read_states_select_self
on public.chat_read_states
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists chat_read_states_insert_self on public.chat_read_states;
create policy chat_read_states_insert_self
on public.chat_read_states
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists chat_read_states_update_self on public.chat_read_states;
create policy chat_read_states_update_self
on public.chat_read_states
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert, update on public.chat_read_states to authenticated;

commit;
