-- Migration: Image attachment support in Room Chat & Direct Messages
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/hytecxupvfhqaddtymcx/sql/new

-- 1. Add image_url column to room_messages and relax content constraint
alter table public.room_messages
  add column if not exists image_url text;

alter table public.room_messages
  alter column content set default '';

alter table public.room_messages
  drop constraint if exists room_messages_content_check;

alter table public.room_messages
  drop constraint if exists room_messages_content_or_image;

alter table public.room_messages
  add constraint room_messages_content_or_image check (
    char_length(trim(content)) <= 1000 and (char_length(trim(content)) > 0 or image_url is not null)
  );

-- 2. Add image_url column to direct_messages and relax content constraint
alter table public.direct_messages
  add column if not exists image_url text;

alter table public.direct_messages
  alter column content set default '';

alter table public.direct_messages
  drop constraint if exists direct_messages_content_check;

alter table public.direct_messages
  drop constraint if exists direct_messages_content_or_image;

alter table public.direct_messages
  add constraint direct_messages_content_or_image check (
    char_length(trim(content)) <= 1000 and (char_length(trim(content)) > 0 or image_url is not null)
  );

-- 3. Replace send_room_message RPC to accept p_image_url
create or replace function public.send_room_message(
  p_room_id text,
  p_message text default '',
  p_image_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_avatar text;
  v_id uuid;
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

  if (p_message is null or char_length(trim(p_message)) = 0) and (p_image_url is null or char_length(trim(p_image_url)) = 0) then
    raise exception 'invalid_content';
  end if;

  if p_message is not null and char_length(trim(p_message)) > 1000 then
    raise exception 'content_too_long';
  end if;

  select name, coalesce(avatar_url, '') into v_name, v_avatar
  from public.members
  where user_id = v_uid and active = true
  limit 1;

  insert into public.room_messages(room_id, sender_id, sender_name, sender_avatar, content, image_url)
  values (
    p_room_id,
    v_uid,
    coalesce(v_name, 'สมาชิก'),
    coalesce(v_avatar, ''),
    coalesce(trim(p_message), ''),
    p_image_url
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.send_room_message(text, text, text) from public, anon;
grant execute on function public.send_room_message(text, text, text) to authenticated;

-- 4. Replace send_direct_message RPC to accept p_image_url
create or replace function public.send_direct_message(
  p_recipient_id uuid,
  p_message text default '',
  p_image_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_s_name text;
  v_s_avatar text;
  v_r_name text;
  v_r_avatar text;
  v_id uuid;
begin
  if not public.is_active_member() then
    raise exception 'not_allowed';
  end if;

  if p_recipient_id is null or p_recipient_id = v_uid then
    raise exception 'invalid_recipient';
  end if;

  if (p_message is null or char_length(trim(p_message)) = 0) and (p_image_url is null or char_length(trim(p_image_url)) = 0) then
    raise exception 'invalid_content';
  end if;

  if p_message is not null and char_length(trim(p_message)) > 1000 then
    raise exception 'content_too_long';
  end if;

  select name, coalesce(avatar_url, '') into v_s_name, v_s_avatar
  from public.members
  where user_id = v_uid and active = true
  limit 1;

  select name, coalesce(avatar_url, '') into v_r_name, v_r_avatar
  from public.members
  where user_id = p_recipient_id and active = true
  limit 1;

  if v_r_name is null then
    raise exception 'recipient_not_found';
  end if;

  insert into public.direct_messages(
    sender_id, sender_name, sender_avatar,
    recipient_id, recipient_name, recipient_avatar,
    content, image_url, is_read
  )
  values (
    v_uid,
    coalesce(v_s_name, 'สมาชิก'),
    coalesce(v_s_avatar, ''),
    p_recipient_id,
    v_r_name,
    coalesce(v_r_avatar, ''),
    coalesce(trim(p_message), ''),
    p_image_url,
    false
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.send_direct_message(uuid, text, text) from public, anon;
grant execute on function public.send_direct_message(uuid, text, text) to authenticated;
