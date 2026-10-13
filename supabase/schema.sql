-- PRIME Virtual Office v0.1 — Run once in Supabase SQL Editor.
-- Existing installations: review migrations before rerunning this file.
begin;

create table public.rooms (
  id text primary key check (id in ('hub','project','focus','coffee')),
  name text not null,
  sort_order int not null,
  meet_url text not null default '' check (meet_url = '' or meet_url ~ '^https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}/?(\?.*)?$')
);
insert into public.rooms(id,name,sort_order) values ('hub','PRIME Hub',1),('project','Project Room',2),('focus','Focus Zone',3),('coffee','Coffee Corner',4);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  email text unique not null check (email = lower(trim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  name text not null check (char_length(trim(name)) between 1 and 80),
  role text not null default 'ทีม PRIME',
  is_admin boolean not null default false,
  active boolean not null default true,
  room_id text not null default 'hub' references public.rooms(id),
  status text not null default 'available' check (status in ('available','focus','away')),
  daily_note text not null default '' check (char_length(daily_note) <= 240),
  avatar_url text not null default '',
  last_seen timestamptz,
  created_at timestamptz not null default now()
);
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 120),
  body text not null check (char_length(trim(body)) between 1 and 2000),
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.knocks (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  room_id text not null references public.rooms(id),
  state text not null default 'pending' check (state in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  check (sender_id <> receiver_id)
);
create index knocks_receiver_created on public.knocks(receiver_id,created_at desc);
create index knocks_sender_created on public.knocks(sender_id,created_at desc);

-- Heartbeats are polled, not published, to conserve the Free realtime quota.
create table public.office_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen timestamptz not null default now()
);

-- Security-definer membership helpers avoid recursive RLS policies.
create function public.is_active_member() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.members where user_id=auth.uid() and active);
$$;
create function public.is_office_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.members where user_id=auth.uid() and active and is_admin);
$$;

alter table public.members enable row level security;
alter table public.rooms enable row level security;
alter table public.announcements enable row level security;
alter table public.knocks enable row level security;
alter table public.office_presence enable row level security;
create policy member_read on public.members for select to authenticated using (public.is_active_member() and active);
create policy room_read on public.rooms for select to authenticated using (public.is_active_member());
create policy announcement_read on public.announcements for select to authenticated using (public.is_active_member());
create policy knock_read on public.knocks for select to authenticated using (public.is_active_member() and receiver_id=auth.uid());
create policy presence_read on public.office_presence for select to authenticated using (public.is_active_member());

-- No browser role can write directly; RPCs validate each mutation.
revoke all on public.members,public.rooms,public.announcements,public.knocks from anon,authenticated;
grant select on public.members,public.rooms,public.announcements,public.knocks to authenticated;
revoke all on public.office_presence from anon,authenticated;
grant select on public.office_presence to authenticated;

create function public.claim_membership() returns void language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  -- Identity comes from the verified Auth record, never user-editable metadata.
  select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  update public.members set user_id=auth.uid()
    where email=v_email and active and (user_id is null or user_id=auth.uid());
  if not found then raise exception 'not_allowed'; end if;
end;
$$;
create function public.heartbeat() returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;
  insert into public.office_presence(user_id,last_seen) values(auth.uid(),now())
    on conflict(user_id) do update set last_seen=excluded.last_seen;
end;
$$;
create function public.leave_office() returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.office_presence where user_id=auth.uid();
end;
$$;
create function public.update_my_profile(p_room text,p_status text,p_note text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('available','focus','away') or p_room not in ('hub','project','focus','coffee') or char_length(p_note)>240 then raise exception 'invalid_profile'; end if;
  update public.members set room_id=p_room,status=p_status,daily_note=p_note where user_id=auth.uid() and active;
  if not found then raise exception 'not_allowed'; end if;
end;
$$;
create function public.update_my_identity(p_name text,p_avatar text default '') returns void language plpgsql security definer set search_path = '' as $$
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
      user_id = v_uid
  where (user_id = v_uid or (v_email is not null and email = v_email)) and active;
  if not found then raise exception 'not_allowed'; end if;
end;
$$;
create function public.send_knock(p_receiver uuid,p_room text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if not exists(select 1 from public.members m join public.office_presence p on m.user_id=p.user_id where m.user_id=p_receiver and m.active and p.last_seen>now()-interval '90 seconds') then raise exception 'recipient_offline'; end if;
  if not exists(select 1 from public.members where user_id=auth.uid() and room_id=p_room and active) then raise exception 'invalid_room'; end if;
  if exists(select 1 from public.knocks where sender_id=auth.uid() and created_at>now()-interval '30 seconds') then raise exception 'rate_limit'; end if;
  -- Keep only a seven-day notification history without requiring a paid scheduler.
  delete from public.knocks where created_at<now()-interval '7 days';
  insert into public.knocks(sender_id,receiver_id,room_id) values(auth.uid(),p_receiver,p_room);
end;
$$;
create function public.respond_knock(p_id uuid,p_accept boolean) returns void language plpgsql security definer set search_path = '' as $$
declare v_room text;
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;
  update public.knocks set state=case when p_accept then 'accepted' else 'declined' end
    where id=p_id and receiver_id=auth.uid() and state='pending' and created_at>now()-interval '5 minutes'
    returning room_id into v_room;
  if not found then raise exception 'request_expired_or_handled'; end if;
  if p_accept then update public.members set room_id=v_room where user_id=auth.uid() and active; end if;
end;
$$;
create function public.admin_list_members() returns setof public.members language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_office_admin() then raise exception 'not_allowed'; end if;
  return query select * from public.members order by created_at;
end;
$$;
create function public.admin_upsert_member(p_email text,p_name text,p_active boolean,p_admin boolean default false) returns void language plpgsql security definer set search_path = '' as $$
declare v_email text:=lower(trim(p_email)); v_member public.members;
begin
  if not public.is_office_admin() then raise exception 'not_allowed'; end if;
  perform pg_advisory_xact_lock(152026);
  select * into v_member from public.members where email=v_email;
  if v_member.user_id=auth.uid() and (not p_active or not p_admin) then raise exception 'self_disable'; end if;
  if p_active and not coalesce(v_member.active,false) and (select count(*) from public.members where active)>=15 then raise exception 'member_limit'; end if;
  insert into public.members(email,name,active,is_admin) values(v_email,trim(p_name),p_active,p_admin)
    on conflict(email) do update set name=excluded.name,active=excluded.active,is_admin=excluded.is_admin,
      last_seen=case when excluded.active then public.members.last_seen else null end;
end;
$$;
create function public.admin_set_meeting(p_room text,p_url text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_office_admin() then raise exception 'not_allowed'; end if;
  update public.rooms set meet_url=trim(p_url) where id=p_room;
  if not found then raise exception 'invalid_room'; end if;
end;
$$;
create function public.admin_post_announcement(p_title text,p_body text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_office_admin() then raise exception 'not_allowed'; end if;
  insert into public.announcements(title,body,author_id) values(trim(p_title),trim(p_body),auth.uid());
end;
$$;

create table public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null default (current_timestamp at time zone 'Asia/Bangkok')::date,
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  status text not null default 'on_time' check (status in ('on_time','late')),
  created_at timestamptz not null default now(),
  unique(user_id, work_date)
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  leave_type text not null check (leave_type in ('sick','personal','vacation','wfh')),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  period text not null default 'full' check (period in ('full','morning','afternoon')),
  reason text not null default '' check (char_length(reason) <= 300),
  status text not null default 'approved' check (status in ('approved','pending','cancelled')),
  created_at timestamptz not null default now()
);

alter table public.attendance_logs enable row level security;
alter table public.leave_requests enable row level security;

create policy attendance_read on public.attendance_logs for select to authenticated using (public.is_active_member());
create policy leave_read on public.leave_requests for select to authenticated using (public.is_active_member());

revoke all on public.attendance_logs, public.leave_requests from anon, authenticated;
grant select on public.attendance_logs, public.leave_requests to authenticated;

create function public.check_in_today() returns json language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (current_timestamp at time zone 'Asia/Bangkok')::date;
  v_now_bkk time := (current_timestamp at time zone 'Asia/Bangkok')::time;
  v_status text := case when v_now_bkk > '08:05:00'::time then 'late' else 'on_time' end;
  v_record public.attendance_logs;
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;
  insert into public.attendance_logs(user_id, work_date, check_in_at, status)
  values(auth.uid(), v_today, now(), v_status)
  on conflict(user_id, work_date) do update set check_in_at = public.attendance_logs.check_in_at
  returning * into v_record;
  return json_build_object('id', v_record.id, 'work_date', v_record.work_date, 'check_in_at', v_record.check_in_at, 'check_out_at', v_record.check_out_at, 'status', v_record.status);
end;
$$;

create function public.check_out_today() returns json language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (current_timestamp at time zone 'Asia/Bangkok')::date;
  v_record public.attendance_logs;
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;
  update public.attendance_logs set check_out_at = now()
  where user_id = auth.uid() and work_date = v_today
  returning * into v_record;
  if not found then
    insert into public.attendance_logs(user_id, work_date, check_in_at, check_out_at, status)
    values(auth.uid(), v_today, now(), now(), 'late')
    returning * into v_record;
  end if;
  return json_build_object('id', v_record.id, 'work_date', v_record.work_date, 'check_in_at', v_record.check_in_at, 'check_out_at', v_record.check_out_at, 'status', v_record.status);
end;
$$;

create function public.submit_leave(p_type text, p_start date, p_end date, p_period text default 'full', p_reason text default '') returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;
  if p_type not in ('sick','personal','vacation','wfh') then raise exception 'invalid_leave_type'; end if;
  if p_period not in ('full','morning','afternoon') then raise exception 'invalid_period'; end if;
  if p_end < p_start then raise exception 'invalid_date_range'; end if;
  if char_length(p_reason) > 300 then raise exception 'reason_too_long'; end if;
  insert into public.leave_requests(user_id, leave_type, start_date, end_date, period, reason, status)
  values(auth.uid(), p_type, p_start, p_end, p_period, trim(p_reason), 'approved')
  returning id into v_id;
  return v_id;
end;
$$;

create function public.cancel_leave(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;
  update public.leave_requests set status = 'cancelled'
  where id = p_id and (user_id = auth.uid() or public.is_office_admin());
  if not found then raise exception 'not_found_or_not_allowed'; end if;
end;
$$;

-- Feed Posts, Reactions, and Comments
create table public.feed_posts (
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
create index feed_posts_created_idx on public.feed_posts(created_at desc);
alter table public.feed_posts enable row level security;
create policy feed_read on public.feed_posts for select to authenticated using (public.is_active_member());
revoke all on public.feed_posts from anon,authenticated;
grant select on public.feed_posts to authenticated;

create function public.post_feed_item(p_type text, p_title text, p_content text) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_name text := 'สมาชิก';
  v_avatar text := '';
  v_post_id uuid;
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;
  if p_type not in ('today', 'announcement') then raise exception 'invalid_type'; end if;
  if char_length(trim(p_content)) not between 1 and 2000 then raise exception 'invalid_content'; end if;
  select name, coalesce(avatar_url, '') into v_name, v_avatar from public.members where user_id = auth.uid() and active;
  insert into public.feed_posts(type, title, content, author_id, author_name, author_avatar)
  values (p_type, trim(coalesce(p_title, '')), trim(p_content), auth.uid(), coalesce(v_name, 'สมาชิก'), coalesce(v_avatar, ''))
  returning id into v_post_id;
  return v_post_id;
end;
$$;

create function public.toggle_feed_reaction(p_post_id uuid, p_reaction text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid text := auth.uid()::text;
  v_post public.feed_posts;
  v_reactions jsonb;
  v_arr jsonb;
  v_new_arr jsonb;
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;
  if p_reaction not in ('likes', 'claps', 'noted') then raise exception 'invalid_reaction'; end if;
  select * into v_post from public.feed_posts where id = p_post_id;
  if not found then raise exception 'post_not_found'; end if;
  v_reactions := coalesce(v_post.reactions, '{"likes":[],"claps":[],"noted":[]}'::jsonb);
  v_arr := coalesce(v_reactions->p_reaction, '[]'::jsonb);
  if v_arr ? v_uid then
    select coalesce(jsonb_agg(elem), '[]'::jsonb) into v_new_arr from jsonb_array_elements_text(v_arr) elem where elem <> v_uid;
  else
    v_new_arr := v_arr || jsonb_build_array(v_uid);
  end if;
  v_reactions := jsonb_set(v_reactions, array[p_reaction], v_new_arr);
  update public.feed_posts set reactions = v_reactions where id = p_post_id;
  return v_reactions;
end;
$$;

create function public.add_feed_comment(p_post_id uuid, p_content text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_name text := 'สมาชิก';
  v_avatar text := '';
  v_comment jsonb;
  v_comments jsonb;
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;
  if char_length(trim(p_content)) not between 1 and 1000 then raise exception 'invalid_comment'; end if;
  select name, coalesce(avatar_url, '') into v_name, v_avatar from public.members where user_id = auth.uid() and active;
  v_comment := jsonb_build_object(
    'id', 'c-' || extract(epoch from clock_timestamp())::text || '-' || substr(md5(random()::text), 1, 4),
    'authorId', auth.uid()::text,
    'authorName', coalesce(v_name, 'สมาชิก'),
    'authorAvatar', coalesce(v_avatar, ''),
    'content', trim(p_content),
    'createdAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
  update public.feed_posts set comments = coalesce(comments, '[]'::jsonb) || jsonb_build_array(v_comment) where id = p_post_id returning comments into v_comments;
  if not found then raise exception 'post_not_found'; end if;
  return v_comments;
end;
$$;

create function public.delete_feed_post(p_post_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_post public.feed_posts;
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;
  select * into v_post from public.feed_posts where id = p_post_id;
  if not found then raise exception 'post_not_found'; end if;
  if v_post.author_id <> auth.uid() and not public.is_office_admin() then
    raise exception 'not_allowed';
  end if;
  delete from public.feed_posts where id = p_post_id;
end;
$$;

-- Explicit grants: anonymous callers cannot execute office functions.
revoke all on function public.is_active_member(),public.is_office_admin(),public.claim_membership(),public.heartbeat(),public.leave_office(),public.update_my_profile(text,text,text),public.update_my_identity(text,text),public.send_knock(uuid,text),public.respond_knock(uuid,boolean),public.admin_list_members(),public.admin_upsert_member(text,text,boolean,boolean),public.admin_set_meeting(text,text),public.admin_post_announcement(text,text),public.check_in_today(),public.check_out_today(),public.submit_leave(text,date,date,text,text),public.cancel_leave(uuid),public.post_feed_item(text,text,text),public.toggle_feed_reaction(uuid,text),public.add_feed_comment(uuid,text),public.delete_feed_post(uuid) from public,anon;
grant execute on function public.is_active_member(),public.is_office_admin(),public.claim_membership(),public.heartbeat(),public.leave_office(),public.update_my_profile(text,text,text),public.update_my_identity(text,text),public.send_knock(uuid,text),public.respond_knock(uuid,boolean),public.admin_list_members(),public.admin_upsert_member(text,text,boolean,boolean),public.admin_set_meeting(text,text),public.admin_post_announcement(text,text),public.check_in_today(),public.check_out_today(),public.submit_leave(text,date,date,text,text),public.cancel_leave(uuid),public.post_feed_item(text,text,text),public.toggle_feed_reaction(uuid,text),public.add_feed_comment(uuid,text),public.delete_feed_post(uuid) to authenticated;

-- Postgres Changes respect SELECT RLS. No public Broadcast/Presence channels.
alter publication supabase_realtime add table public.members,public.rooms,public.announcements,public.knocks,public.attendance_logs,public.leave_requests,public.feed_posts;
commit;

-- NEXT: run this separately, replacing the email with your real Google account.
-- insert into public.members(email,name,is_admin) values ('YOUR_GOOGLE_EMAIL','ผู้ดูแล PRIME',true);
