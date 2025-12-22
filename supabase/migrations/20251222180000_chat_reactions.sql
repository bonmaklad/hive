-- Chat message emoji reactions (Facebook-style).

begin;

create table if not exists public.chat_message_reactions (
    id uuid primary key default gen_random_uuid(),
    channel text not null default 'members',
    message_id uuid not null references public.chat_messages(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    emoji text not null,
    created_at timestamptz not null default now(),
    unique (message_id, user_id, emoji)
);

create index if not exists chat_message_reactions_channel_created_at_idx on public.chat_message_reactions(channel, created_at desc);
create index if not exists chat_message_reactions_message_id_created_at_idx on public.chat_message_reactions(message_id, created_at desc);

alter table public.chat_message_reactions enable row level security;

drop policy if exists chat_reactions_select_authenticated on public.chat_message_reactions;
create policy chat_reactions_select_authenticated
on public.chat_message_reactions
for select
to authenticated
using (true);

drop policy if exists chat_reactions_insert_self on public.chat_message_reactions;
create policy chat_reactions_insert_self
on public.chat_message_reactions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists chat_reactions_delete_self on public.chat_message_reactions;
create policy chat_reactions_delete_self
on public.chat_message_reactions
for delete
to authenticated
using (user_id = auth.uid() or public.is_admin());

grant select, insert, delete on public.chat_message_reactions to authenticated;

-- Enable realtime (safe if publication already exists)
do $$
begin
    execute 'alter publication supabase_realtime add table public.chat_message_reactions';
exception when duplicate_object then
    null;
end $$;

commit;

