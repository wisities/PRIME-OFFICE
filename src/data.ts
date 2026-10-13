export type RoomId = 'hub' | 'project' | 'focus' | 'coffee';
export type Status = 'available' | 'focus' | 'away';
export type LeaveType = 'sick' | 'personal' | 'vacation' | 'wfh';

export type AttendanceRecord = {
  id: string;
  user_id: string;
  work_date: string;
  check_in_at: string;
  check_out_at?: string | null;
  status: 'on_time' | 'late';
};

export type ThaiHoliday = {
  date: string;
  name: string;
  thaiDate: string;
  thaiYear: number;
  dayName: string;
  isSubstitute?: boolean;
  isCompanyHoliday: boolean;
};

export type LeaveRequest = {
  id: string;
  user_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  period: 'full' | 'morning' | 'afternoon';
  reason: string;
  status: 'approved' | 'pending' | 'cancelled';
  created_at: string;
};

export type Member = {
  id: string;
  name: string;
  role: string;
  room: RoomId;
  status: Status;
  online: boolean;
  color: string;
  note?: string;
  isAdmin?: boolean;
  avatarUrl?: string;
  leaveToday?: { type: LeaveType; label: string; emoji: string };
};

export type Room = {
  id: RoomId;
  name: string;
  thai: string;
  description: string;
  meet_url?: string;
  task: string;
};

export const rooms: Room[] = [
  {id:'hub',name:'PRIME Hub',thai:'พื้นที่ทำงานกลาง',description:'เริ่มวันใหม่ แบ่งปันไอเดีย และทำงานไปด้วยกัน',task:'อัปเดตสิ่งที่ทำวันนี้ให้ทีมรู้'},
  {id:'project',name:'Project Room',thai:'ห้องคุยโปรเจกต์',description:'รวมทีมคุยงานและเปิดประชุมผ่าน Google Meet',task:'ปักหมุดลิงก์ประชุมได้ในหน้าผู้ดูแล'},
  {id:'focus',name:'Focus Zone',thai:'มุมทำงานเงียบ',description:'พื้นที่สำหรับงานที่ต้องใช้สมาธิ เคาะประตูก่อนคุย',task:'เคารพช่วงเวลาโฟกัสของเพื่อนร่วมทีม'},
  {id:'coffee',name:'Coffee Corner',thai:'มุมพักและพูดคุย',description:'พักสายตา เติมกาแฟ แล้วกลับมาพร้อมไอเดียใหม่',task:'แวะมาทักทายกันได้เสมอ'}
];

export const statuses: Record<Status, string> = {
  available: 'พร้อมคุย',
  focus: 'กำลังโฟกัส',
  away: 'ไม่อยู่ชั่วคราว'
};

export const leaveTypesConfig: Record<LeaveType, { label: string; emoji: string; color: string; desc: string }> = {
  sick: { label: 'ลาป่วย', emoji: '🤒', color: '#e75b5b', desc: 'ป่วย ไม่สบาย พบแพทย์' },
  personal: { label: 'ลากิจ', emoji: '📝', color: '#3182ce', desc: 'มีธุระส่วนตัว ติดต่อราชการ' },
  vacation: { label: 'ลาพักร้อน', emoji: '🏖️', color: '#805ad5', desc: 'พักผ่อนประจำปี ท่องเที่ยว' },
  wfh: { label: 'WFH พิเศษ', emoji: '🏠', color: '#38a169', desc: 'ทำงานจากที่บ้าน' }
};

export const periodLabels: Record<'full' | 'morning' | 'afternoon', string> = {
  full: 'เต็มวัน (08:00 - 17:00)',
  morning: 'ครึ่งวันเช้า (08:00 - 12:00)',
  afternoon: 'ครึ่งวันบ่าย (13:00 - 17:00)'
};

export const sampleMembers: Member[] = [
  {id:'may',name:'เมย์',role:'Project Lead',room:'hub',status:'available',online:true,color:'peach',note:'วางแผนงานประจำสัปดาห์'},
  {id:'ton',name:'ต้น',role:'Developer',room:'hub',status:'focus',online:true,color:'blue',note:'พัฒนาหน้าเว็บไซต์ลูกค้า'},
  {id:'beam',name:'บีม',role:'Designer',room:'hub',status:'available',online:true,color:'lavender'},
  {id:'nan',name:'แนน',role:'Consultant',room:'project',status:'available',online:true,color:'mint'},
  {id:'kong',name:'ก้อง',role:'Developer',room:'project',status:'available',online:true,color:'blue'},
  {id:'ploy',name:'พลอย',role:'Designer',room:'focus',status:'focus',online:true,color:'peach'},
  {id:'art',name:'อาร์ต',role:'Developer',room:'focus',status:'focus',online:true,color:'mint'},
  {id:'nat',name:'นัท',role:'Marketing',room:'coffee',status:'away',online:false,color:'lavender',leaveToday:{type:'sick',label:'ลาป่วย',emoji:'🤒'}},
  ...['ฟ้า','ปอนด์','ไอซ์','วิว','ฟิล์ม','พิม'].map((name,i)=>({
    id:'offline-'+i,
    name,
    role:'ทีม PRIME',
    room:'hub' as RoomId,
    status:'away' as Status,
    online:false,
    color:'blue',
    ...(name==='ฟ้า'?{leaveToday:{type:'vacation' as LeaveType,label:'ลาพักร้อน',emoji:'🏖️'}}:{})
  }))
];

export const sampleLeaves: LeaveRequest[] = [
  {
    id: 'leave-1',
    user_id: 'nat',
    leave_type: 'sick',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
    period: 'full',
    reason: 'มีไข้สูง ไปพบแพทย์โรงพยาบาล',
    status: 'approved',
    created_at: new Date(Date.now() - 3600000 * 5).toISOString()
  },
  {
    id: 'leave-2',
    user_id: 'offline-0',
    leave_type: 'vacation',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
    period: 'full',
    reason: 'พักผ่อนประจำปีต่างจังหวัด',
    status: 'approved',
    created_at: new Date(Date.now() - 86400000).toISOString()
  }
];

export const sampleAttendance: AttendanceRecord[] = [
  { id: 'att-1', user_id: 'may', work_date: new Date().toISOString().slice(0, 10), check_in_at: new Date(new Date().setHours(7, 52, 0)).toISOString(), status: 'on_time' },
  { id: 'att-2', user_id: 'ton', work_date: new Date().toISOString().slice(0, 10), check_in_at: new Date(new Date().setHours(7, 58, 0)).toISOString(), status: 'on_time' },
  { id: 'att-3', user_id: 'beam', work_date: new Date().toISOString().slice(0, 10), check_in_at: new Date(new Date().setHours(8, 0, 0)).toISOString(), status: 'on_time' },
  { id: 'att-4', user_id: 'nan', work_date: new Date().toISOString().slice(0, 10), check_in_at: new Date(new Date().setHours(8, 14, 0)).toISOString(), status: 'late' },
  { id: 'att-5', user_id: 'kong', work_date: new Date().toISOString().slice(0, 10), check_in_at: new Date(new Date().setHours(7, 48, 0)).toISOString(), status: 'on_time' },
  { id: 'att-6', user_id: 'ploy', work_date: new Date().toISOString().slice(0, 10), check_in_at: new Date(new Date().setHours(8, 19, 0)).toISOString(), status: 'late' },
  { id: 'att-7', user_id: 'art', work_date: new Date().toISOString().slice(0, 10), check_in_at: new Date(new Date().setHours(7, 55, 0)).toISOString(), status: 'on_time' }
];
