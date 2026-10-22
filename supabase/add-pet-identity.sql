-- Migration: Add Pet Identity (type and name) to members table
-- Run this in Supabase SQL Editor to enable pet syncing across devices and between team members

alter table public.members add column if not exists pet_type text not null default 'cat';
alter table public.members add column if not exists pet_name text not null default 'เจ้าส้ม';

-- Function with 4 parameters: updates name, avatar, pet_type, pet_name
create or replace function public.update_my_identity(
  p_name text,
  p_avatar text default '',
  p_pet_type text default 'cat',
  p_pet_name text default 'เจ้าส้ม'
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then raise exception 'not_allowed'; end if;
  if char_length(trim(p_name)) not between 1 and 80 then raise exception 'invalid_name'; end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  update public.members
  set name = trim(p_name),
      avatar_url = coalesce(p_avatar, ''),
      pet_type = coalesce(nullif(trim(p_pet_type), ''), 'cat'),
      pet_name = coalesce(nullif(trim(p_pet_name), ''), 'เจ้าส้ม'),
      user_id = v_uid
  where (user_id = v_uid or (v_email is not null and email = v_email)) and active;
  if not found then raise exception 'not_allowed'; end if;
end;
$$;

-- Backward-compatible 2-parameter overload
create or replace function public.update_my_identity(
  p_name text,
  p_avatar text default ''
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.update_my_identity(p_name, p_avatar, 'cat', 'เจ้าส้ม');
end;
$$;

revoke all on function public.update_my_identity(text, text, text, text) from public, anon;
grant execute on function public.update_my_identity(text, text, text, text) to authenticated;
revoke all on function public.update_my_identity(text, text) from public, anon;
grant execute on function public.update_my_identity(text, text) to authenticated;
