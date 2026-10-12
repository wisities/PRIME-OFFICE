-- Run AFTER schema.sql. This authorizes the Google account requested by the owner.
insert into public.members(email,name,is_admin,active)
values 
  ('p.wisities@gmail.com','ผู้ดูแล PRIME',true,true),
  ('wisities@gmail.com','ผู้ดูแล PRIME',true,true)
on conflict(email) do update set is_admin=true,active=true;
