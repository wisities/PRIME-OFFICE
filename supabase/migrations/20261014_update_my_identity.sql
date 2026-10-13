-- Migration: Allow users to update their own display name and avatar photo in public.members
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/hytecxupvfhqaddtymcx/sql/new

create or replace function public.update_my_identity(p_name text, p_avatar text default '') returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;
  if char_length(trim(p_name)) not between 1 and 80 then raise exception 'invalid_name'; end if;
  update public.members set name = trim(p_name), avatar_url = trim(p_avatar) where user_id = auth.uid() and active;
  if not found then raise exception 'not_allowed'; end if;
end;
$$;

grant execute on function public.update_my_identity(text, text) to authenticated;
