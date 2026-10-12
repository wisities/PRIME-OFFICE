import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('database permissions and office workflows',async(t)=>{
  const db=new PGlite();
  const admin='00000000-0000-4000-8000-000000000001', member='00000000-0000-4000-8000-000000000002', outsider='00000000-0000-4000-8000-000000000003';
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
  let schema=await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8');
  // PGlite cannot run Supabase's hosted Realtime service; test its SQL/RLS only.
  schema=schema.replace('alter publication supabase_realtime add table public.members,public.rooms,public.announcements,public.knocks;','');
  await db.exec(schema);
  await db.query("insert into auth.users values ($1,'admin@example.com',now()),($2,'member@example.com',now()),($3,'outsider@example.com',now())",[admin,member,outsider]);
  await db.exec("insert into public.members(email,name,is_admin) values ('admin@example.com','Admin',true),('member@example.com','Member',false)");
  async function asUser(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role authenticated');}
  await t.test('unapproved signed-in user cannot read data or claim membership',async()=>{await asUser(outsider);assert.equal((await db.query('select * from public.rooms')).rows.length,0);await assert.rejects(db.query('select public.claim_membership()'),/not_allowed/);});
  await t.test('approved account can claim only its verified identity',async()=>{await asUser(admin);await db.exec('select public.claim_membership(); select public.heartbeat()');assert.equal((await db.query('select * from public.rooms')).rows.length,4);await asUser(member);await db.exec('select public.claim_membership(); select public.heartbeat()');});
  await t.test('member can move and save a note without changing privileges',async()=>{await asUser(member);await db.exec("select public.update_my_profile('focus','focus','review design')");const row=(await db.query('select * from public.members where user_id=$1',[member])).rows[0];assert.equal(row.room_id,'focus');assert.equal(row.is_admin,false);await assert.rejects(db.exec('update public.members set is_admin=true'),/permission denied/);await assert.rejects(db.exec("select public.admin_post_announcement('oops','not allowed')"),/not_allowed/);});
  await t.test('recipient alone can read and respond to a knock',async()=>{await asUser(admin);await db.query("select public.send_knock($1,'hub')",[member]);assert.equal((await db.query('select * from public.knocks')).rows.length,0);await assert.rejects(db.query("select public.send_knock($1,'hub')",[member]),/rate_limit/);await asUser(member);const knock=(await db.query('select * from public.knocks')).rows[0];await db.query('select public.respond_knock($1,true)',[knock.id]);assert.equal((await db.query('select room_id from public.members where user_id=$1',[member])).rows[0].room_id,'hub');await assert.rejects(db.query('select public.respond_knock($1,true)',[knock.id]),/request_expired_or_handled/);});
  await t.test('member limit, admin protection, and disable enforcement',async()=>{await asUser(admin);for(let i=0;i<13;i++)await db.query('select public.admin_upsert_member($1,$2,true,false)',[`test${i}@example.com`,`Test ${i}`]);await assert.rejects(db.query("select public.admin_upsert_member('extra@example.com','Extra',true,false)"),/member_limit/);await assert.rejects(db.query("select public.admin_upsert_member('admin@example.com','Admin',false,false)"),/self_disable/);await db.query("select public.admin_upsert_member('member@example.com','Member',false,false)");await asUser(member);assert.equal((await db.query('select * from public.members')).rows.length,0);await assert.rejects(db.exec('select public.heartbeat()'),/not_allowed/);await assert.rejects(db.exec("select public.update_my_profile('hub','available','')"),/not_allowed/);});
  await t.test('meeting URLs and anonymous function access are constrained',async()=>{await asUser(admin);await assert.rejects(db.exec("select public.admin_set_meeting('hub','https://evil.example')"),/check constraint/);await db.exec("select public.admin_set_meeting('hub','https://meet.google.com/abc-defg-hij')");await db.exec('reset role; set role anon');await assert.rejects(db.exec('select public.claim_membership()'),/permission denied/);await assert.rejects(db.exec('select * from public.members'),/permission denied/);});
  await db.close();
});
