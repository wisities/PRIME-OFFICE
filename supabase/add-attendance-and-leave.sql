-- PRIME Virtual Office — Attendance & Leave System (ลงเวลาทำงาน & ลางาน อนุมัติแบบที่ 1)
-- Run this script in the Supabase SQL Editor (Dashboard > SQL Editor)

begin;

create table if not exists public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null default (current_timestamp at time zone 'Asia/Bangkok')::date,
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  status text not null default 'on_time' check (status in ('on_time','late')),
  created_at timestamptz not null default now(),
  unique(user_id, work_date)
);

create table if not exists public.leave_requests (
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

drop policy if exists attendance_read on public.attendance_logs;
create policy attendance_read on public.attendance_logs for select to authenticated using (public.is_active_member());

drop policy if exists leave_read on public.leave_requests;
create policy leave_read on public.leave_requests for select to authenticated using (public.is_active_member());

revoke all on public.attendance_logs, public.leave_requests from anon, authenticated;
grant select on public.attendance_logs, public.leave_requests to authenticated;

-- Check-in function: Records check-in and detects late (> 08:05 BKK)
create or replace function public.check_in_today()
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (current_timestamp at time zone 'Asia/Bangkok')::date;
  v_now_bkk time := (current_timestamp at time zone 'Asia/Bangkok')::time;
  v_status text := case when v_now_bkk > '08:05:00'::time then 'late' else 'on_time' end;
  v_record public.attendance_logs;
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;
  
  insert into public.attendance_logs(user_id, work_date, check_in_at, status)
  values(auth.uid(), v_today, now(), v_status)
  on conflict(user_id, work_date) do update set
    check_in_at = public.attendance_logs.check_in_at
  returning * into v_record;
  
  return json_build_object(
    'id', v_record.id,
    'work_date', v_record.work_date,
    'check_in_at', v_record.check_in_at,
    'check_out_at', v_record.check_out_at,
    'status', v_record.status
  );
end;
$$;

-- Check-out function: Updates checkout timestamp
create or replace function public.check_out_today()
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (current_timestamp at time zone 'Asia/Bangkok')::date;
  v_record public.attendance_logs;
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;
  
  update public.attendance_logs
  set check_out_at = now()
  where user_id = auth.uid() and work_date = v_today
  returning * into v_record;
  
  if not found then
    insert into public.attendance_logs(user_id, work_date, check_in_at, check_out_at, status)
    values(auth.uid(), v_today, now(), now(), 'late')
    returning * into v_record;
  end if;
  
  return json_build_object(
    'id', v_record.id,
    'work_date', v_record.work_date,
    'check_in_at', v_record.check_in_at,
    'check_out_at', v_record.check_out_at,
    'status', v_record.status
  );
end;
$$;

-- Submit Leave (Auto approved Mode 1)
create or replace function public.submit_leave(
  p_type text,
  p_start date,
  p_end date,
  p_period text default 'full',
  p_reason text default ''
)
returns uuid language plpgsql security definer set search_path = '' as $$
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

-- Cancel Leave
create or replace function public.cancel_leave(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;
  update public.leave_requests set status = 'cancelled'
  where id = p_id and (user_id = auth.uid() or public.is_office_admin());
  if not found then raise exception 'not_found_or_not_allowed'; end if;
end;
$$;

revoke all on function public.check_in_today(), public.check_out_today(), public.submit_leave(text,date,date,text,text), public.cancel_leave(uuid) from public, anon;
grant execute on function public.check_in_today(), public.check_out_today(), public.submit_leave(text,date,date,text,text), public.cancel_leave(uuid) to authenticated;

alter publication supabase_realtime add table public.attendance_logs, public.leave_requests;

commit;
