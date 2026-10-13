-- Migration: Allow users to update their own display name and avatar photo in public.members
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/hytecxupvfhqaddtymcx/sql/new

alter table public.members add column if not exists avatar_url text not null default '';

create or replace function public.update_my_identity(p_name text, p_avatar text default '') 
returns void 
language plpgsql 
security definer 
set search_path = '' 
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then 
    raise exception 'not_allowed'; 
  end if;
  
  if char_length(trim(p_name)) not between 1 and 80 then 
    raise exception 'invalid_name'; 
  end if;

  select lower(email) into v_email from auth.users where id = v_uid;

  update public.members
  set name = trim(p_name),
      avatar_url = coalesce(p_avatar, ''),
      user_id = v_uid
  where (user_id = v_uid or (v_email is not null and email = v_email)) and active;

  if not found then 
    raise exception 'not_allowed'; 
  end if;
end;
$$;

revoke all on function public.update_my_identity(text, text) from public, anon;
grant execute on function public.update_my_identity(text, text) to authenticated;
