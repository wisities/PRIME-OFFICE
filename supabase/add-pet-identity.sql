-- Migration: Add Pet Identity (type and name) to members table
-- Run this in Supabase SQL Editor if you want to store pet settings directly in public.members

alter table public.members add column if not exists pet_type text not null default 'cat';
alter table public.members add column if not exists pet_name text not null default 'เจ้าส้ม';

-- Drop the old 2-argument signature to prevent ambiguous overload
drop function if exists public.update_my_identity(text, text);

create or replace function public.update_my_identity(
  p_name text,
  p_avatar text default '',
  p_pet_type text default 'cat',
  p_pet_name text default 'เจ้าส้ม'
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;
  if char_length(trim(p_name)) not between 1 and 80 then raise exception 'invalid_name'; end if;
  update public.members
  set name = trim(p_name),
      avatar_url = trim(p_avatar),
      pet_type = coalesce(nullif(trim(p_pet_type), ''), 'cat'),
      pet_name = coalesce(nullif(trim(p_pet_name), ''), 'เจ้าส้ม')
  where user_id = auth.uid() and active;
  if not found then raise exception 'not_allowed'; end if;
end;
$$;

revoke all on function public.update_my_identity(text, text, text, text) from public, anon;
grant execute on function public.update_my_identity(text, text, text, text) to authenticated;
