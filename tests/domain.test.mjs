import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  validMeetUrl, loadDemo, normalizeEmail, uniquePresence, checkAttendanceStatus, 
  formatThaiTime, getThaiPublicHoliday, getThaiHolidaysList, calculateWorkingDays, formatThaiFullDate 
} from '../src/domain.mjs';

test('meeting URLs must point to a real-shaped HTTPS Google Meet path',()=>{assert.ok(validMeetUrl('https://meet.google.com/abc-defg-hij'));for(const url of ['javascript:alert(1)','https://meet.google.com.evil.test/abc-defg-hij','http://meet.google.com/abc-defg-hij','https://user@meet.google.com/abc-defg-hij','https://meet.google.com/','not a URL'])assert.equal(validMeetUrl(url),false,url);});
test('corrupted local demo storage recovers safely',()=>{assert.deepEqual(loadDemo({getItem(){return '{bad';}}),{room:'hub',status:'available',note:''});assert.deepEqual(loadDemo({getItem(){return JSON.stringify({room:'wrong',status:'admin',note:7});}}),{room:'hub',status:'available',note:''});assert.equal(loadDemo({getItem(){return JSON.stringify({room:'focus',status:'focus',note:'x'.repeat(500)});}}).note.length,240);});
test('email normalization',()=>assert.equal(normalizeEmail('  Team@Example.COM '),'team@example.com'));
test('multi-tab presence is deduplicated by latest state',()=>{const result=uniquePresence({a:[{user_id:'1',updated_at:'2026-01-01',room:'hub'}],b:[{user_id:'1',updated_at:'2026-01-02',room:'focus'}]});assert.equal(result.length,1);assert.equal(result[0].room,'focus');});
test('attendance calculation and time formatting',()=>{
  const onTime = new Date(2026, 9, 12, 8, 55);
  const late = new Date(2026, 9, 12, 9, 10);
  assert.equal(checkAttendanceStatus(onTime), 'on_time');
  assert.equal(checkAttendanceStatus(late), 'late');
  assert.equal(formatThaiTime(onTime), '08:55 น.');
});

test('Thai Government Public Holiday engine verifies company holidays', () => {
  // 13 October 2026 is King Rama IX Memorial Day (วันนวมินทรมหาราช)
  const oct13 = getThaiPublicHoliday('2026-10-13');
  assert.equal(oct13.isHoliday, true);
  assert.equal(oct13.isPublicHoliday, true);
  assert.equal(oct13.isCompanyHoliday, true);
  assert.equal(oct13.name, 'วันนวมินทรมหาราช (วันคล้ายวันสวรรคต ร.9)');

  // 14 October 2026 is a normal Wednesday working day
  const oct14 = getThaiPublicHoliday('2026-10-14');
  assert.equal(oct14.isHoliday, false);
  assert.equal(oct14.isCompanyHoliday, false);

  // 18 October 2026 is a Sunday (weekend company holiday)
  const oct18 = getThaiPublicHoliday('2026-10-18');
  assert.equal(oct18.isHoliday, true);
  assert.equal(oct18.isWeekend, true);
  assert.equal(oct18.isCompanyHoliday, true);

  // Songkran holiday verification
  const songkran = getThaiPublicHoliday('2026-04-13');
  assert.equal(songkran.isPublicHoliday, true);
  assert.equal(songkran.name, 'วันสงกรานต์');

  // Verify list of holidays for year 2026 has at least 18 holidays
  const holidays2026 = getThaiHolidaysList(2026);
  assert.ok(holidays2026.length >= 18);
  assert.ok(holidays2026.some(h => h.date === '2026-10-13'));

  // Calculate working days for leave request spanning a public holiday (12-14 Oct 2026)
  // 12 Oct (workday), 13 Oct (public holiday), 14 Oct (workday) -> 2 working days only!
  const leaveCalc = calculateWorkingDays('2026-10-12', '2026-10-14');
  assert.equal(leaveCalc.totalDays, 3);
  assert.equal(leaveCalc.workingDays, 2);
  assert.equal(leaveCalc.holidays.length, 1);
  assert.equal(leaveCalc.holidays[0].date, '2026-10-13');
  assert.equal(leaveCalc.holidays[0].name, 'วันนวมินทรมหาราช (วันคล้ายวันสวรรคต ร.9)');
});
