-- Migration: Room Chat (excl. Focus) & Direct Messages
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/hytecxupvfhqaddtymcx/sql/new

-- 1. Room Messages Table (PRIME Hub, Project Room, Coffee Corner -- Focus Zone is strictly disallowed)
create table if not exists public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null check (room_id in ('hub', 'project', 'coffee')),
  sender_id uuid references auth.users(id) on delete set null,
  sender_name text not null default '',
  sender_avatar text not null default '',
  content text not null check (char_length(trim(content)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists room_messages_room_created_idx on public.room_messages(room_id, created_at asc);

alter table public.room_messages enable row level security;
drop policy if exists room_msg_read on public.room_messages;
create policy room_msg_read on public.room_messages for select to authenticated using (public.is_active_member());

revoke all on public.room_messages from public, anon;
grant select on public.room_messages to authenticated;

-- 2. Direct Messages Table (Private 1-on-1 Messages between Members)
create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users(id) on delete set null,
  sender_name text not null default '',
  sender_avatar text not null default '',
  recipient_id uuid not null references auth.users(id) on delete cascade,
  recipient_name text not null default '',
  recipient_avatar text not null default '',
  content text not null check (char_length(trim(content)) between 1 and 1000),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists dm_participants_idx on public.direct_messages(sender_id, recipient_id, created_at asc);
create index if not exists dm_recipient_unread_idx on public.direct_messages(recipient_id, is_read);

alter table public.direct_messages enable row level security;

-- Privacy RLS: only sender or recipient can read direct messages
drop policy if exists dm_read on public.direct_messages;
create policy dm_read on public.direct_messages for select to authenticated using (
  public.is_active_member() and (auth.uid() = sender_id or auth.uid() = recipient_id)
);

revoke all on public.direct_messages from public, anon;
grant select on public.direct_messages to authenticated;

-- Add to Realtime Publication
alter publication supabase_realtime add table public.room_messages, public.direct_messages;

-- 3. Function: Send Room Message
create or replace function public.send_room_message(
  p_room_id text,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_sender_name text;
  v_sender_avatar text;
  v_msg_id uuid;
begin
  if not public.is_active_member() then
    raise exception 'not_allowed';
  end if;

  if p_room_id = 'focus' then
    raise exception 'focus_chat_disabled';
  end if;

  if p_room_id not in ('hub', 'project', 'coffee') then
    raise exception 'invalid_room_id';
  end if;

  if p_content is null or char_length(trim(p_content)) < 1 or char_length(trim(p_content)) > 1000 then
    raise exception 'invalid_content_length';
  end if;

  select name, coalesce(avatar_url, '') into v_sender_name, v_sender_avatar
  from public.members
  where user_id = v_uid and active = true
  limit 1;

  if v_sender_name is null then
    v_sender_name := 'สมาชิก';
  end if;

  insert into public.room_messages(room_id, sender_id, sender_name, sender_avatar, content)
  values (p_room_id, v_uid, v_sender_name, v_sender_avatar, trim(p_content))
  returning id into v_msg_id;

  return v_msg_id;
end;
$$;

revoke all on function public.send_room_message from public, anon;
grant execute on function public.send_room_message to authenticated;

-- 4. Function: Send Direct Message
create or replace function public.send_direct_message(
  p_recipient_id uuid,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_sender_name text;
  v_sender_avatar text;
  v_recipient_name text;
  v_recipient_avatar text;
  v_msg_id uuid;
begin
  if not public.is_active_member() then
    raise exception 'not_allowed';
  end if;

  if p_recipient_id is null or p_recipient_id = v_uid then
    raise exception 'invalid_recipient';
  end if;

  if p_content is null or char_length(trim(p_content)) < 1 or char_length(trim(p_content)) > 1000 then
    raise exception 'invalid_content_length';
  end if;

  -- Verify sender
  select name, coalesce(avatar_url, '') into v_sender_name, v_sender_avatar
  from public.members
  where user_id = v_uid and active = true
  limit 1;

  if v_sender_name is null then
    v_sender_name := 'สมาชิก';
  end if;

  -- Verify recipient
  select name, coalesce(avatar_url, '') into v_recipient_name, v_recipient_avatar
  from public.members
  where user_id = p_recipient_id and active = true
  limit 1;

  if v_recipient_name is null then
    raise exception 'recipient_not_found';
  end if;

  insert into public.direct_messages(
    sender_id, sender_name, sender_avatar,
    recipient_id, recipient_name, recipient_avatar,
    content, is_read
  )
  values (
    v_uid, v_sender_name, v_sender_avatar,
    p_recipient_id, v_recipient_name, v_recipient_avatar,
    trim(p_content), false
  )
  returning id into v_msg_id;

  return v_msg_id;
end;
$$;

revoke all on function public.send_direct_message from public, anon;
grant execute on function public.send_direct_message to authenticated;

-- 5. Function: Mark Direct Messages Read
create or replace function public.mark_direct_messages_read(
  p_sender_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if not public.is_active_member() then
    raise exception 'not_allowed';
  end if;

  update public.direct_messages
  set is_read = true
  where recipient_id = v_uid and sender_id = p_sender_id and is_read = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_direct_messages_read from public, anon;
grant execute on function public.mark_direct_messages_read to authenticated;
