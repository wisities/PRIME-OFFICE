-- PRIME Virtual Office — HR, Executive Roles, Medical Cert & Leave Quota Extension
-- Run this script in the Supabase SQL Editor (Dashboard > SQL Editor)

begin;

-- 1. Extend members table with system role_type
-- 'admin'     : Full system control
-- 'hr'        : Manage attendance, leaves, quotas, CSV export
-- 'executive' : Exempt from daily check-in, acknowledges leaves, gets Telegram alerts
-- 'member'    : Regular employee
alter table public.members
  add column if not exists role_type text not null default 'member'
  check (role_type in ('admin', 'hr', 'executive', 'member'));

-- Sync existing is_admin to role_type
update public.members set role_type = 'admin' where is_admin = true and role_type = 'member';

-- 2. Extend leave_requests for medical certificate & executive acknowledgement
alter table public.leave_requests
  add column if not exists medical_cert_url text,
  add column if not exists acknowledged_by_executive boolean not null default false,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by uuid references auth.users(id);

-- 3. Create Annual Leave Quotas table
create table if not exists public.leave_quotas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  year int not null default extract(year from current_date)::int,
  sick_total int not null default 30,
  personal_total int not null default 7,
  vacation_total int not null default 10,
  wfh_total int not null default 30,
  updated_at timestamptz not null default now(),
  unique(user_id, year)
);

alter table public.leave_quotas enable row level security;

drop policy if exists quota_read on public.leave_quotas;
create policy quota_read on public.leave_quotas for select to authenticated using (public.is_active_member());

drop policy if exists quota_write_hr on public.leave_quotas;
create policy quota_write_hr on public.leave_quotas for all to authenticated using (
  exists (
    select 1 from public.members
    where user_id = auth.uid() and active and (is_admin or role_type in ('admin', 'hr'))
  )
);

grant select, insert, update on public.leave_quotas to authenticated;

-- 4. Function: Check if user is HR or Admin
create or replace function public.is_hr_or_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.members
    where user_id = auth.uid() and active and (is_admin or role_type in ('admin', 'hr'))
  );
$$;

-- 5. Function: Check if user is Executive
create or replace function public.is_executive() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.members
    where user_id = auth.uid() and active and (role_type = 'executive')
  );
$$;

-- 6. Function: Admin update member role
create or replace function public.admin_set_member_role(p_user_id uuid, p_role_type text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_office_admin() then raise exception 'admin_only'; end if;
  if p_role_type not in ('admin', 'hr', 'executive', 'member') then raise exception 'invalid_role'; end if;
  
  update public.members
  set role_type = p_role_type,
      is_admin = (p_role_type = 'admin')
  where user_id = p_user_id or id = p_user_id;
end;
$$;

create or replace function public.admin_set_member_role(p_user_id text, p_role_type text, p_email text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_office_admin() then raise exception 'admin_only'; end if;
  if p_role_type not in ('admin', 'hr', 'executive', 'member') then raise exception 'invalid_role'; end if;
  
  update public.members
  set role_type = p_role_type,
      is_admin = (p_role_type = 'admin')
  where (user_id::text = p_user_id)
     or (id::text = p_user_id)
     or (p_email is not null and lower(email) = lower(trim(p_email)));
end;
$$;

-- 7. Function: Executive acknowledges leave
create or replace function public.executive_acknowledge_leave(p_leave_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_executive() or public.is_office_admin() or public.is_hr_or_admin()) then
    raise exception 'not_authorized';
  end if;
  
  update public.leave_requests
  set acknowledged_by_executive = true,
      acknowledged_at = now(),
      acknowledged_by = auth.uid()
  where id = p_leave_id;
end;
$$;

-- 8. Function: Attach Medical Certificate retroactively
create or replace function public.attach_medical_cert(p_leave_id uuid, p_cert_url text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_member() then raise exception 'not_allowed'; end if;
  
  update public.leave_requests
  set medical_cert_url = p_cert_url
  where id = p_leave_id and (user_id = auth.uid() or public.is_hr_or_admin());
  
  if not found then raise exception 'leave_not_found_or_forbidden'; end if;
end;
$$;

-- 9. Function: HR upsert leave quota
create or replace function public.hr_upsert_leave_quota(
  p_user_id uuid,
  p_year int,
  p_sick int,
  p_personal int,
  p_vacation int,
  p_wfh int
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_hr_or_admin() then raise exception 'hr_only'; end if;
  
  insert into public.leave_quotas(user_id, year, sick_total, personal_total, vacation_total, wfh_total, updated_at)
  values(p_user_id, p_year, p_sick, p_personal, p_vacation, p_wfh, now())
  on conflict (user_id, year) do update set
    sick_total = excluded.sick_total,
    personal_total = excluded.personal_total,
    vacation_total = excluded.vacation_total,
    wfh_total = excluded.wfh_total,
    updated_at = now();
end;
$$;

grant execute on function public.admin_set_member_role(uuid, text) to authenticated;
grant execute on function public.admin_set_member_role(text, text, text) to authenticated;
grant execute on function public.executive_acknowledge_leave(uuid) to authenticated;
grant execute on function public.attach_medical_cert(uuid, text) to authenticated;
grant execute on function public.hr_upsert_leave_quota(uuid, int, int, int, int, int) to authenticated;

alter publication supabase_realtime add table public.leave_quotas;

commit;
