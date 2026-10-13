-- Migration: Real-time Feed Posts, Reactions, and Comments
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/hytecxupvfhqaddtymcx/sql/new

create table if not exists public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('today', 'announcement')),
  title text not null default '',
  content text not null check (char_length(trim(content)) between 1 and 2000),
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null default '',
  author_avatar text not null default '',
  reactions jsonb not null default '{"likes":[],"claps":[],"noted":[]}'::jsonb,
  comments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists feed_posts_created_idx on public.feed_posts(created_at desc);

alter table public.feed_posts enable row level security;

drop policy if exists feed_read on public.feed_posts;
create policy feed_read on public.feed_posts for select to authenticated using (public.is_active_member());

revoke all on public.feed_posts from public, anon;
grant select on public.feed_posts to authenticated;

-- Realtime subscription
alter publication supabase_realtime add table public.feed_posts;

-- Function: Post feed item (both work today and announcements)
create or replace function public.post_feed_item(p_type text, p_title text, p_content text) 
returns uuid 
language plpgsql 
security definer 
set search_path = '' 
as $$
declare
  v_name text := 'สมาชิก';
  v_avatar text := '';
  v_post_id uuid;
begin
  if not public.is_active_member() then 
    raise exception 'not_allowed'; 
  end if;
  
  if p_type not in ('today', 'announcement') then 
    raise exception 'invalid_type'; 
  end if;
  
  if char_length(trim(p_content)) not between 1 and 2000 then 
    raise exception 'invalid_content'; 
  end if;

  select name, coalesce(avatar_url, '') 
  into v_name, v_avatar 
  from public.members 
  where user_id = auth.uid() and active;

  insert into public.feed_posts(type, title, content, author_id, author_name, author_avatar)
  values (p_type, trim(coalesce(p_title, '')), trim(p_content), auth.uid(), coalesce(v_name, 'สมาชิก'), coalesce(v_avatar, ''))
  returning id into v_post_id;

  return v_post_id;
end;
$$;

-- Function: Toggle reaction (likes, claps, noted)
create or replace function public.toggle_feed_reaction(p_post_id uuid, p_reaction text) 
returns jsonb 
language plpgsql 
security definer 
set search_path = '' 
as $$
declare
  v_uid text := auth.uid()::text;
  v_post public.feed_posts;
  v_reactions jsonb;
  v_arr jsonb;
  v_new_arr jsonb;
begin
  if not public.is_active_member() then 
    raise exception 'not_allowed'; 
  end if;
  
  if p_reaction not in ('likes', 'claps', 'noted') then 
    raise exception 'invalid_reaction'; 
  end if;

  select * into v_post from public.feed_posts where id = p_post_id;
  if not found then 
    raise exception 'post_not_found'; 
  end if;

  v_reactions := coalesce(v_post.reactions, '{"likes":[],"claps":[],"noted":[]}'::jsonb);
  v_arr := coalesce(v_reactions->p_reaction, '[]'::jsonb);

  if v_arr ? v_uid then
    select coalesce(jsonb_agg(elem), '[]'::jsonb)
    into v_new_arr
    from jsonb_array_elements_text(v_arr) elem
    where elem <> v_uid;
  else
    v_new_arr := v_arr || jsonb_build_array(v_uid);
  end if;

  v_reactions := jsonb_set(v_reactions, array[p_reaction], v_new_arr);

  update public.feed_posts
  set reactions = v_reactions
  where id = p_post_id;

  return v_reactions;
end;
$$;

-- Function: Add comment to feed post
create or replace function public.add_feed_comment(p_post_id uuid, p_content text) 
returns jsonb 
language plpgsql 
security definer 
set search_path = '' 
as $$
declare
  v_name text := 'สมาชิก';
  v_avatar text := '';
  v_comment jsonb;
  v_comments jsonb;
begin
  if not public.is_active_member() then 
    raise exception 'not_allowed'; 
  end if;
  
  if char_length(trim(p_content)) not between 1 and 1000 then 
    raise exception 'invalid_comment'; 
  end if;

  select name, coalesce(avatar_url, '') 
  into v_name, v_avatar 
  from public.members 
  where user_id = auth.uid() and active;

  v_comment := jsonb_build_object(
    'id', 'c-' || extract(epoch from clock_timestamp())::text || '-' || substr(md5(random()::text), 1, 4),
    'authorId', auth.uid()::text,
    'authorName', coalesce(v_name, 'สมาชิก'),
    'authorAvatar', coalesce(v_avatar, ''),
    'content', trim(p_content),
    'createdAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );

  update public.feed_posts
  set comments = coalesce(comments, '[]'::jsonb) || jsonb_build_array(v_comment)
  where id = p_post_id
  returning comments into v_comments;

  if not found then 
    raise exception 'post_not_found'; 
  end if;

  return v_comments;
end;
$$;

-- Function: Delete feed post (Author or Admin only)
create or replace function public.delete_feed_post(p_post_id uuid) 
returns void 
language plpgsql 
security definer 
set search_path = '' 
as $$
declare
  v_post public.feed_posts;
begin
  if not public.is_active_member() then 
    raise exception 'not_allowed'; 
  end if;

  select * into v_post from public.feed_posts where id = p_post_id;
  if not found then 
    raise exception 'post_not_found'; 
  end if;

  if v_post.author_id <> auth.uid() and not public.is_office_admin() then
    raise exception 'not_allowed';
  end if;

  delete from public.feed_posts where id = p_post_id;
end;
$$;

revoke all on function public.post_feed_item(text, text, text) from public, anon;
grant execute on function public.post_feed_item(text, text, text) to authenticated;

revoke all on function public.toggle_feed_reaction(uuid, text) from public, anon;
grant execute on function public.toggle_feed_reaction(uuid, text) to authenticated;

revoke all on function public.add_feed_comment(uuid, text) from public, anon;
grant execute on function public.add_feed_comment(uuid, text) to authenticated;

revoke all on function public.delete_feed_post(uuid) from public, anon;
grant execute on function public.delete_feed_post(uuid) to authenticated;
