export function validMeetUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'meet.google.com' && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/.test(url.pathname) && !url.username && !url.password; } catch { return false; }
}

export function normalizeEmail(value) { return value.trim().toLowerCase(); }

export function uniquePresence(state) {
  const result = new Map();
  for (const entries of Object.values(state)) for (const entry of entries) {
    if (!entry.user_id) continue;
    const previous = result.get(entry.user_id);
    if (!previous || (entry.updated_at || '') >= (previous.updated_at || '')) result.set(entry.user_id, entry);
  }
  return [...result.values()];
}

export function loadDemo(storage) {
  try { const data = JSON.parse(storage.getItem('prime-demo-v1') || '{}'); return { room: ['hub','project','focus','coffee'].includes(data.room) ? data.room : 'hub', status: ['available','focus','away'].includes(data.status) ? data.status : 'available', note: typeof data.note === 'string' ? data.note.slice(0, 240) : '' }; }
  catch { return { room: 'hub', status: 'available', note: '' }; }
}

export function checkAttendanceStatus(date) {
  const d = new Date(date);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  return (hours > 8 || (hours === 8 && minutes > 5)) ? 'late' : 'on_time';
}

export function formatThaiTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} น.`;
}

export const THAI_MONTH_NAMES = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

export const THAI_DAY_NAMES = [
  'วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'
];

// ปฏิทินวันหยุดราชการไทยคงที่ประจำทุกปี (Fixed Annual Public Holidays)
export const THAI_ANNUAL_FIXED_HOLIDAYS = [
  { month: 1, day: 1, name: 'วันขึ้นปีใหม่' },
  { month: 4, day: 6, name: 'วันพระบาทสมเด็จพระพุทธยอดฟ้าจุฬาโลกมหาราช และวันที่ระลึกมหาจักรีบรมราชวงศ์ (วันจักรี)' },
  { month: 4, day: 13, name: 'วันสงกรานต์' },
  { month: 4, day: 14, name: 'วันสงกรานต์' },
  { month: 4, day: 15, name: 'วันสงกรานต์' },
  { month: 5, day: 4, name: 'วันฉัตรมงคล' },
  { month: 6, day: 3, name: 'วันเฉลิมพระชนมพรรษา สมเด็จพระนางเจ้าฯ พระบรมราชินี' },
  { month: 7, day: 28, name: 'วันเฉลิมพระชนมพรรษา พระบาทสมเด็จพระวชิรเกล้าเจ้าอยู่หัว (ร.10)' },
  { month: 8, day: 12, name: 'วันเฉลิมพระชนมพรรษา สมเด็จพระบรมราชชนนีพันปีหลวง และวันแม่แห่งชาติ' },
  { month: 10, day: 13, name: 'วันนวมินทรมหาราช (วันคล้ายวันสวรรคต ร.9)' },
  { month: 10, day: 23, name: 'วันปิยมหาราช' },
  { month: 12, day: 5, name: 'วันคล้ายวันพระบรมราชสมภพ ร.9, วันชาติ และวันพ่อแห่งชาติ' },
  { month: 12, day: 10, name: 'วันรัฐธรรมนูญ' },
  { month: 12, day: 31, name: 'วันสิ้นปี' }
];

// วันหยุดราชการตามมติ ครม., วันหยุดพิเศษ, และวันหยุดทางศาสนาตามปฏิทินจันทรคติ
export const THAI_YEAR_SPECIAL_HOLIDAYS = {
  2024: [
    { date: '2024-02-26', name: 'วันหยุดชดเชยวันมาฆบูชา' },
    { date: '2024-05-10', name: 'วันพระราชพิธีพืชมงคลจรดพระนังคัลแรกนาขวัญ' },
    { date: '2024-05-22', name: 'วันวิสาขบูชา' },
    { date: '2024-07-20', name: 'วันอาสาฬหบูชา' },
    { date: '2024-07-22', name: 'วันหยุดชดเชยวันเข้าพรรษา' },
    { date: '2024-12-30', name: 'วันหยุดพิเศษราชการ (ตามมติ ครม.)' }
  ],
  2025: [
    { date: '2025-01-02', name: 'วันหยุดพิเศษราชการ (ตามมติ ครม.)' },
    { date: '2025-02-12', name: 'วันมาฆบูชา' },
    { date: '2025-04-07', name: 'วันหยุดชดเชยวันจักรี' },
    { date: '2025-04-16', name: 'วันหยุดชดเชยวันสงกรานต์' },
    { date: '2025-05-05', name: 'วันหยุดชดเชยวันฉัตรมงคล' },
    { date: '2025-05-09', name: 'วันพระราชพิธีพืชมงคลจรดพระนังคัลแรกนาขวัญ' },
    { date: '2025-05-12', name: 'วันหยุดชดเชยวันวิสาขบูชา' },
    { date: '2025-06-02', name: 'วันหยุดพิเศษราชการ (ตามมติ ครม.)' },
    { date: '2025-07-10', name: 'วันอาสาฬหบูชา' },
    { date: '2025-07-11', name: 'วันเข้าพรรษา' },
    { date: '2025-08-11', name: 'วันหยุดพิเศษราชการ (ตามมติ ครม.)' }
  ],
  2026: [
    { date: '2026-01-02', name: 'วันหยุดราชการเพิ่มเติมนโยบาย ครม. (หยุดปีใหม่ยาว 5 วัน)' },
    { date: '2026-03-03', name: 'วันมาฆบูชา' },
    { date: '2026-05-13', name: 'วันพระราชพิธีพืชมงคลจรดพระนังคัลแรกนาขวัญ' },
    { date: '2026-05-31', name: 'วันวิสาขบูชา' },
    { date: '2026-06-01', name: 'วันหยุดชดเชยวันวิสาขบูชา' },
    { date: '2026-07-29', name: 'วันอาสาฬหบูชา' },
    { date: '2026-07-30', name: 'วันเข้าพรรษา' },
    { date: '2026-10-16', name: 'วันหยุดราชการกรณีพิเศษ (ตามมติ ครม.)' },
    { date: '2026-12-07', name: 'วันหยุดชดเชยวันพ่อแห่งชาติ' }
  ],
  2027: [
    { date: '2027-02-21', name: 'วันมาฆบูชา' },
    { date: '2027-02-22', name: 'วันหยุดชดเชยวันมาฆบูชา' },
    { date: '2027-05-20', name: 'วันวิสาขบูชา' },
    { date: '2027-07-17', name: 'วันอาสาฬหบูชา' },
    { date: '2027-07-18', name: 'วันเข้าพรรษา' },
    { date: '2027-07-19', name: 'วันหยุดชดเชยวันอาสาฬหบูชาและวันเข้าพรรษา' },
    { date: '2027-10-25', name: 'วันหยุดชดเชยวันปิยมหาราช' },
    { date: '2027-12-06', name: 'วันหยุดชดเชยวันพ่อแห่งชาติ' }
  ]
};

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * ดึงรายการวันหยุดราชการทั้งหมดของปีนั้นๆ (รวมวันหยุดคงที่, วันหยุดชดเชย, และวันหยุดพิเศษ ครม.)
 */
export function getThaiHolidaysList(year) {
  const y = Number(year) || new Date().getFullYear();
  const holidaysMap = new Map();

  // 1. เพิ่มวันหยุดประจำปีคงที่
  for (const h of THAI_ANNUAL_FIXED_HOLIDAYS) {
    const dateStr = `${y}-${pad(h.month)}-${pad(h.day)}`;
    const d = new Date(y, h.month - 1, h.day);
    holidaysMap.set(dateStr, {
      date: dateStr,
      name: h.name,
      isSubstitute: false
    });

    // ตรวจสอบวันหยุดชดเชยกรณีตรงกับวันเสาร์หรือวันอาทิตย์ (สำหรับวันหยุดคงที่ที่ยังไม่มีใน special list)
    const dayOfWeek = d.getDay(); // 0 = อาทิตย์, 6 = เสาร์
    if (dayOfWeek === 6) {
      // วันเสาร์ ชดเชยวันจันทร์ถัดไป (+2 วัน)
      const subD = new Date(y, h.month - 1, h.day + 2);
      const subStr = `${subD.getFullYear()}-${pad(subD.getMonth() + 1)}-${pad(subD.getDate())}`;
      if (!holidaysMap.has(subStr)) {
        holidaysMap.set(subStr, {
          date: subStr,
          name: `วันหยุดชดเชย${h.name}`,
          isSubstitute: true
        });
      }
    } else if (dayOfWeek === 0) {
      // วันอาทิตย์ ชดเชยวันจันทร์ถัดไป (+1 วัน)
      const subD = new Date(y, h.month - 1, h.day + 1);
      const subStr = `${subD.getFullYear()}-${pad(subD.getMonth() + 1)}-${pad(subD.getDate())}`;
      if (!holidaysMap.has(subStr)) {
        holidaysMap.set(subStr, {
          date: subStr,
          name: `วันหยุดชดเชย${h.name}`,
          isSubstitute: true
        });
      }
    }
  }

  // 2. เติมวันหยุดพิเศษ/จันทรคติเฉพาะปี (ทับหรือเพิ่มจากฐานข้อมูล)
  const specials = THAI_YEAR_SPECIAL_HOLIDAYS[y] || [];
  for (const s of specials) {
    holidaysMap.set(s.date, {
      date: s.date,
      name: s.name,
      isSubstitute: s.name.includes('ชดเชย')
    });
  }

  // เรียงลำดับตามวันที่
  const list = [...holidaysMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  return list.map(item => {
    const [yearNum, monthNum, dayNum] = item.date.split('-').map(Number);
    const d = new Date(yearNum, monthNum - 1, dayNum);
    const thaiYear = yearNum + 543;
    const dayName = THAI_DAY_NAMES[d.getDay()];
    const thaiDate = `${dayName}ที่ ${dayNum} ${THAI_MONTH_NAMES[monthNum - 1]} พ.ศ. ${thaiYear}`;

    return {
      ...item,
      thaiDate,
      thaiYear,
      dayName,
      isCompanyHoliday: true
    };
  });
}

/**
 * ตรวจสอบว่าวันที่ระบุเป็นวันหยุดราชการหรือวันหยุดของบริษัทหรือไม่
 * @param {string | Date} dateInput
 */
export function getThaiPublicHoliday(dateInput) {
  let dateStr = '';
  let d;
  if (typeof dateInput === 'string') {
    dateStr = dateInput.slice(0, 10);
    const [y, m, day] = dateStr.split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = dateInput instanceof Date ? dateInput : new Date();
    dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  const year = d.getFullYear();
  const holidays = getThaiHolidaysList(year);
  const found = holidays.find(h => h.date === dateStr);

  const dayOfWeek = d.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (found) {
    return {
      date: dateStr,
      isHoliday: true,
      isPublicHoliday: true,
      isWeekend,
      isCompanyHoliday: true,
      name: found.name,
      thaiDate: found.thaiDate,
      statusLabel: `วันหยุดราชการ: ${found.name}`
    };
  }

  if (isWeekend) {
    const weekendName = dayOfWeek === 0 ? 'วันอาทิตย์ (วันหยุดสุดสัปดาห์)' : 'วันเสาร์ (วันหยุดสุดสัปดาห์)';
    return {
      date: dateStr,
      isHoliday: true,
      isPublicHoliday: false,
      isWeekend: true,
      isCompanyHoliday: true,
      name: weekendName,
      thaiDate: `${THAI_DAY_NAMES[dayOfWeek]}ที่ ${d.getDate()} ${THAI_MONTH_NAMES[d.getMonth()]} พ.ศ. ${year + 543}`,
      statusLabel: weekendName
    };
  }

  return {
    date: dateStr,
    isHoliday: false,
    isPublicHoliday: false,
    isWeekend: false,
    isCompanyHoliday: false,
    name: '',
    thaiDate: `${THAI_DAY_NAMES[dayOfWeek]}ที่ ${d.getDate()} ${THAI_MONTH_NAMES[d.getMonth()]} พ.ศ. ${year + 543}`,
    statusLabel: 'วันทำงานปกติ'
  };
}

/**
 * คำนวณจำนวนวันทำงานจริงในช่วงวันที่ขอลางาน โดยหักวันหยุดราชการและวันเสาร์-อาทิตย์ออก
 */
export function calculateWorkingDays(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) {
    return { totalDays: 0, workingDays: 0, holidays: [] };
  }

  const [sy, sm, sd] = startDateStr.slice(0, 10).split('-').map(Number);
  const [ey, em, ed] = endDateStr.slice(0, 10).split('-').map(Number);

  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);

  if (end < start) {
    return { totalDays: 0, workingDays: 0, holidays: [] };
  }

  let totalDays = 0;
  let workingDays = 0;
  const holidays = [];

  const cur = new Date(start);
  while (cur <= end) {
    totalDays++;
    const curStr = `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`;
    const hol = getThaiPublicHoliday(curStr);

    if (hol.isCompanyHoliday) {
      holidays.push({
        date: curStr,
        name: hol.name,
        isPublicHoliday: hol.isPublicHoliday,
        isWeekend: hol.isWeekend
      });
    } else {
      workingDays++;
    }

    cur.setDate(cur.getDate() + 1);
  }

  return {
    totalDays,
    workingDays,
    holidays
  };
}

/**
 * จัดรูปแบบวันที่ภาษาไทยแบบเต็ม
 */
export function formatThaiFullDate(dateInput) {
  if (!dateInput) return '-';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const day = d.getDate();
  const month = THAI_MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear() + 543;
  const dayName = THAI_DAY_NAMES[d.getDay()];
  return `${dayName}ที่ ${day} ${month} พ.ศ. ${year}`;
}
