import test from 'node:test';
import assert from 'node:assert/strict';
import { validMeetUrl, loadDemo, normalizeEmail, uniquePresence, checkAttendanceStatus, formatThaiTime } from '../src/domain.mjs';
test('meeting URLs must point to a real-shaped HTTPS Google Meet path',()=>{assert.ok(validMeetUrl('https://meet.google.com/abc-defg-hij'));for(const url of ['javascript:alert(1)','https://meet.google.com.evil.test/abc-defg-hij','http://meet.google.com/abc-defg-hij','https://user@meet.google.com/abc-defg-hij','https://meet.google.com/','not a URL'])assert.equal(validMeetUrl(url),false,url);});
test('corrupted local demo storage recovers safely',()=>{assert.deepEqual(loadDemo({getItem(){return '{bad';}}),{room:'hub',status:'available',note:''});assert.deepEqual(loadDemo({getItem(){return JSON.stringify({room:'wrong',status:'admin',note:7});}}),{room:'hub',status:'available',note:''});assert.equal(loadDemo({getItem(){return JSON.stringify({room:'focus',status:'focus',note:'x'.repeat(500)});}}).note.length,240);});
test('email normalization',()=>assert.equal(normalizeEmail('  Team@Example.COM '),'team@example.com'));
test('multi-tab presence is deduplicated by latest state',()=>{const result=uniquePresence({a:[{user_id:'1',updated_at:'2026-01-01',room:'hub'}],b:[{user_id:'1',updated_at:'2026-01-02',room:'focus'}]});assert.equal(result.length,1);assert.equal(result[0].room,'focus');});
test('attendance calculation and time formatting',()=>{
  const onTime = new Date(2026, 9, 12, 7, 55);
  const late = new Date(2026, 9, 12, 8, 10);
  assert.equal(checkAttendanceStatus(onTime), 'on_time');
  assert.equal(checkAttendanceStatus(late), 'late');
  assert.equal(formatThaiTime(onTime), '07:55 น.');
});
