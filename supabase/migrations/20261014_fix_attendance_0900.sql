-- =========================================================================
-- PRIME Virtual Office Migration: Update Attendance Criteria to 09:00 AM
-- Run this in Supabase SQL Editor if you want to update the database functions
-- and retroactively fix existing 'late' check-ins before 09:05 AM.
-- =========================================================================

create or replace function public.check_in_today()
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (current_timestamp at time zone 'Asia/Bangkok')::date;
  v_now_bkk time := (current_timestamp at time zone 'Asia/Bangkok')::time;
  v_status text := case when v_now_bkk > '09:05:00'::time then 'late' else 'on_time' end;
  v_record public.attendance_logs;
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;
  insert into public.attendance_logs(user_id, work_date, check_in_at, status)
  values(auth.uid(), v_today, now(), v_status)
  on conflict(user_id, work_date) do update set check_in_at = public.attendance_logs.check_in_at
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

create or replace function public.check_out_today()
returns json language plpgsql security definer set search_path = '' as $$
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
    values(
      auth.uid(),
      v_today,
      now(),
      now(),
      case when (current_timestamp at time zone 'Asia/Bangkok')::time > '09:05:00'::time then 'late' else 'on_time' end
    )
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

-- Retroactively fix all attendance records for today that were marked 'late'
-- even though check-in was at or before 09:05:00 AM Bangkok time (e.g. 08:30, 08:37)
update public.attendance_logs
set status = 'on_time'
where status = 'late'
  and (check_in_at at time zone 'Asia/Bangkok')::time <= '09:05:00'::time;
