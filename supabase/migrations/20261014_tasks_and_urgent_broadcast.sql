-- Migration: Task Delegation & Urgent Broadcasts
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/hytecxupvfhqaddtymcx/sql/new

-- 1. Tasks Table (Delegation & Deadlines)
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text not null default '',
  due_date date,
  due_time text default '',
  priority text not null default 'normal' check (priority in ('urgent', 'normal', 'low')),
  creator_id uuid references auth.users(id) on delete set null,
  creator_name text not null default '',
  creator_avatar text not null default '',
  assignees jsonb not null default '[]'::jsonb,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  created_at timestamptz not null default now()
);

create index if not exists tasks_created_idx on public.tasks(created_at desc);

alter table public.tasks enable row level security;
drop policy if exists task_read on public.tasks;
create policy task_read on public.tasks for select to authenticated using (public.is_active_member());
revoke all on public.tasks from public, anon;
grant select on public.tasks to authenticated;

-- 2. Urgent Flash Broadcasts Table
create table if not exists public.urgent_broadcasts (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(trim(message)) between 1 and 280),
  sender_id uuid references auth.users(id) on delete set null,
  sender_name text not null default '',
  sender_avatar text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists urgent_broadcasts_created_idx on public.urgent_broadcasts(created_at desc);

alter table public.urgent_broadcasts enable row level security;
drop policy if exists urgent_broadcast_read on public.urgent_broadcasts;
create policy urgent_broadcast_read on public.urgent_broadcasts for select to authenticated using (public.is_active_member());
revoke all on public.urgent_broadcasts from public, anon;
grant select on public.urgent_broadcasts to authenticated;

-- Realtime subscriptions
alter publication supabase_realtime add table public.tasks, public.urgent_broadcasts;

-- Function: Create Task
create or replace function public.create_task(
  p_title text,
  p_description text default '',
  p_due_date date default null,
  p_due_time text default '',
  p_priority text default 'normal',
  p_assignees jsonb default '[]'::jsonb
) 
returns uuid 
language plpgsql 
security definer 
set search_path = '' 
as $$
declare
  v_name text := 'สมาชิก';
  v_avatar text := '';
  v_task_id uuid;
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;
  if char_length(trim(p_title)) not between 1 and 200 then raise exception 'invalid_title'; end if;
  if p_priority not in ('urgent', 'normal', 'low') then raise exception 'invalid_priority'; end if;

  select name, coalesce(avatar_url, '') into v_name, v_avatar 
  from public.members where user_id = auth.uid() and active;

  insert into public.tasks(
    title, description, due_date, due_time, priority,
    creator_id, creator_name, creator_avatar, assignees, status
  )
  values (
    trim(p_title), trim(coalesce(p_description, '')), p_due_date, coalesce(p_due_time, ''), p_priority,
    auth.uid(), coalesce(v_name, 'สมาชิก'), coalesce(v_avatar, ''), coalesce(p_assignees, '[]'::jsonb), 'todo'
  )
  returning id into v_task_id;

  return v_task_id;
end;
$$;

-- Function: Toggle Assignee Done Status
create or replace function public.toggle_task_assignee_done(p_task_id uuid) 
returns jsonb 
language plpgsql 
security definer 
set search_path = '' 
as $$
declare
  v_task public.tasks;
  v_uid text := auth.uid()::text;
  v_new_assignees jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_all_done boolean := true;
  v_any_done boolean := false;
  v_is_assignee boolean := false;
  v_done boolean;
  v_new_status text;
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;

  select * into v_task from public.tasks where id = p_task_id;
  if not found then raise exception 'task_not_found'; end if;

  for v_elem in select jsonb_array_elements(v_task.assignees)
  loop
    if (v_elem->>'id') = v_uid then
      v_is_assignee := true;
      v_done := not coalesce((v_elem->>'completed')::boolean, false);
      v_elem := jsonb_set(v_elem, '{completed}', to_jsonb(v_done));
      if v_done then
        v_elem := jsonb_set(v_elem, '{completedAt}', to_jsonb(to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
      else
        v_elem := v_elem - 'completedAt';
      end if;
    end if;

    if coalesce((v_elem->>'completed')::boolean, false) then
      v_any_done := true;
    else
      v_all_done := false;
    end if;

    v_new_assignees := v_new_assignees || jsonb_build_array(v_elem);
  end loop;

  -- Also allow creator to toggle whole task status if not in assignees
  if not v_is_assignee and v_task.creator_id = auth.uid() then
    v_done := v_task.status <> 'done';
    v_new_status := case when v_done then 'done' else 'todo' end;
  else
    if jsonb_array_length(v_new_assignees) = 0 then
      v_new_status := case when v_task.status = 'done' then 'todo' else 'done' end;
    elsif v_all_done then
      v_new_status := 'done';
    elsif v_any_done then
      v_new_status := 'in_progress';
    else
      v_new_status := 'todo';
    end if;
  end if;

  update public.tasks
  set assignees = v_new_assignees,
      status = v_new_status
  where id = p_task_id;

  return v_new_assignees;
end;
$$;

-- Function: Update Task Status
create or replace function public.update_task_status(p_task_id uuid, p_status text) 
returns void 
language plpgsql 
security definer 
set search_path = '' 
as $$
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;
  if p_status not in ('todo', 'in_progress', 'done') then raise exception 'invalid_status'; end if;

  update public.tasks set status = p_status where id = p_task_id;
  if not found then raise exception 'task_not_found'; end if;
end;
$$;

-- Function: Delete Task
create or replace function public.delete_task(p_task_id uuid) 
returns void 
language plpgsql 
security definer 
set search_path = '' 
as $$
declare
  v_task public.tasks;
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;

  select * into v_task from public.tasks where id = p_task_id;
  if not found then raise exception 'task_not_found'; end if;

  if v_task.creator_id <> auth.uid() and not public.is_office_admin() then
    raise exception 'not_allowed';
  end if;

  delete from public.tasks where id = p_task_id;
end;
$$;

-- Function: Send Urgent Flash Broadcast
create or replace function public.send_urgent_broadcast(p_message text) 
returns uuid 
language plpgsql 
security definer 
set search_path = '' 
as $$
declare
  v_name text := 'สมาชิก';
  v_avatar text := '';
  v_broadcast_id uuid;
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;
  if char_length(trim(p_message)) not between 1 and 280 then raise exception 'invalid_message'; end if;

  select name, coalesce(avatar_url, '') into v_name, v_avatar 
  from public.members where user_id = auth.uid() and active;

  insert into public.urgent_broadcasts(message, sender_id, sender_name, sender_avatar)
  values (trim(p_message), auth.uid(), coalesce(v_name, 'สมาชิก'), coalesce(v_avatar, ''))
  returning id into v_broadcast_id;

  return v_broadcast_id;
end;
$$;

-- Grants
revoke all on function public.create_task(text, text, date, text, text, jsonb) from public, anon;
grant execute on function public.create_task(text, text, date, text, text, jsonb) to authenticated;

revoke all on function public.toggle_task_assignee_done(uuid) from public, anon;
grant execute on function public.toggle_task_assignee_done(uuid) to authenticated;

revoke all on function public.update_task_status(uuid, text) from public, anon;
grant execute on function public.update_task_status(uuid, text) to authenticated;

revoke all on function public.delete_task(uuid) from public, anon;
grant execute on function public.delete_task(uuid) to authenticated;

revoke all on function public.send_urgent_broadcast(text) from public, anon;
grant execute on function public.send_urgent_broadcast(text) to authenticated;
