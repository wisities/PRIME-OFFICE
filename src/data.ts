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

export type RoleType = 'admin' | 'hr' | 'executive' | 'member';

export type LeaveRequest = {
  id: string;
  user_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  period: 'full' | 'morning' | 'afternoon';
  reason: string;
  status: 'approved' | 'pending' | 'cancelled';
  medical_cert_url?: string | null;
  acknowledged_by_executive?: boolean;
  acknowledged_at?: string | null;
  created_at: string;
};

export type LeaveQuota = {
  user_id: string;
  year: number;
  sick_total: number;
  sick_used: number;
  personal_total: number;
  personal_used: number;
  vacation_total: number;
  vacation_used: number;
  wfh_total: number;
  wfh_used: number;
};

export type Member = {
  id: string;
  name: string;
  email?: string;
  role: string;
  role_type?: RoleType;
  room: RoomId;
  status: Status;
  online: boolean;
  color: string;
  note?: string;
  isAdmin?: boolean;
  isHr?: boolean;
  isExecutive?: boolean;
  avatarUrl?: string;
  pet_type?: 'cat' | 'dog' | 'hamster' | 'frog' | 'toad';
  pet_name?: string;
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
  {id:'project',name:'Project Room',thai:'ห้องคุยโปรเจกต์',description:'รวมทีมคุยงานและเปิดห้องประชุม WebRTC Meeting',task:'กดเข้าห้องก่อนเริ่มประชุมงาน'},
  {id:'focus',name:'Focus Zone',thai:'มุมทำงานเงียบ',description:'พื้นที่งานที่ต้องใช้สมาธิขั้นสูง ปิดเสียงและปิดการประชุม โทรหามือถือหากด่วน',task:'โหมดห้ามรบกวน ไม่อนุญาตให้เคาะหรือประชุม'},
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
  full: 'เต็มวัน (09:00 - 17:00)',
  morning: 'ครึ่งวันเช้า (09:00 - 12:00)',
  afternoon: 'ครึ่งวันบ่าย (13:00 - 17:00)'
};

export const sampleMembers: Member[] = [
  {id:'may',name:'เมย์',role:'Executive Director',role_type:'executive',isExecutive:true,room:'hub',status:'available',online:true,color:'peach',note:'ผู้บริหาร — ยกเว้นการลงเวลา'},
  {id:'ton',name:'ต้น',role:'HR Officer',role_type:'hr',isHr:true,room:'hub',status:'focus',online:true,color:'blue',note:'ฝ่ายบุคคล จัดการการลาและสิทธิ์'},
  {id:'beam',name:'บีม',role:'Designer',role_type:'member',room:'hub',status:'available',online:true,color:'lavender'},
  {id:'nan',name:'แนน',role:'Consultant',role_type:'member',room:'project',status:'available',online:true,color:'mint'},
  {id:'kong',name:'ก้อง',role:'Developer',role_type:'member',room:'project',status:'available',online:true,color:'blue'},
  {id:'ploy',name:'พลอย',role:'Designer',role_type:'member',room:'focus',status:'focus',online:true,color:'peach'},
  {id:'art',name:'อาร์ต',role:'System Admin',role_type:'admin',isAdmin:true,room:'focus',status:'focus',online:true,color:'mint'},
  {id:'nat',name:'นัท',role:'Marketing',role_type:'member',room:'coffee',status:'away',online:false,color:'lavender',leaveToday:{type:'sick',label:'ลาป่วย',emoji:'🤒'}},
  ...['ฟ้า','ปอนด์','ไอซ์','วิว','ฟิล์ม','พิม'].map((name,i)=>({
    id:'offline-'+i,
    name,
    role:'ทีม PRIME',
    role_type:'member' as RoleType,
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
    end_date: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10), // ลาป่วย 4 วัน
    period: 'full',
    reason: 'มีไข้สูง และอาหารเป็นพิษ แพทย์สั่งพักฟื้น 4 วัน',
    status: 'approved',
    medical_cert_url: null, // รอแนบใบรับรองแพทย์
    acknowledged_by_executive: false,
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
    acknowledged_by_executive: true,
    acknowledged_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    created_at: new Date(Date.now() - 86400000).toISOString()
  }
];

export const sampleLeaveQuotas: LeaveQuota[] = [
  { user_id: 'may', year: new Date().getFullYear(), sick_total: 30, sick_used: 0, personal_total: 7, personal_used: 1, vacation_total: 15, vacation_used: 3, wfh_total: 30, wfh_used: 5 },
  { user_id: 'ton', year: new Date().getFullYear(), sick_total: 30, sick_used: 1, personal_total: 7, personal_used: 0, vacation_total: 10, vacation_used: 2, wfh_total: 30, wfh_used: 4 },
  { user_id: 'beam', year: new Date().getFullYear(), sick_total: 30, sick_used: 2, personal_total: 7, personal_used: 1, vacation_total: 10, vacation_used: 4, wfh_total: 30, wfh_used: 6 },
  { user_id: 'nan', year: new Date().getFullYear(), sick_total: 30, sick_used: 0, personal_total: 7, personal_used: 0, vacation_total: 10, vacation_used: 1, wfh_total: 30, wfh_used: 2 },
  { user_id: 'kong', year: new Date().getFullYear(), sick_total: 30, sick_used: 1, personal_total: 7, personal_used: 2, vacation_total: 10, vacation_used: 5, wfh_total: 30, wfh_used: 3 },
  { user_id: 'ploy', year: new Date().getFullYear(), sick_total: 30, sick_used: 0, personal_total: 7, personal_used: 1, vacation_total: 10, vacation_used: 2, wfh_total: 30, wfh_used: 5 },
  { user_id: 'art', year: new Date().getFullYear(), sick_total: 30, sick_used: 0, personal_total: 7, personal_used: 0, vacation_total: 10, vacation_used: 0, wfh_total: 30, wfh_used: 8 },
  { user_id: 'nat', year: new Date().getFullYear(), sick_total: 30, sick_used: 4, personal_total: 7, personal_used: 2, vacation_total: 10, vacation_used: 3, wfh_total: 30, wfh_used: 1 }
];

export const sampleAttendance: AttendanceRecord[] = [
  { id: 'att-1', user_id: 'may', work_date: new Date().toISOString().slice(0, 10), check_in_at: new Date(new Date().setHours(8, 52, 0)).toISOString(), status: 'on_time' },
  { id: 'att-2', user_id: 'ton', work_date: new Date().toISOString().slice(0, 10), check_in_at: new Date(new Date().setHours(8, 58, 0)).toISOString(), status: 'on_time' },
  { id: 'att-3', user_id: 'beam', work_date: new Date().toISOString().slice(0, 10), check_in_at: new Date(new Date().setHours(9, 0, 0)).toISOString(), status: 'on_time' },
  { id: 'att-4', user_id: 'nan', work_date: new Date().toISOString().slice(0, 10), check_in_at: new Date(new Date().setHours(9, 14, 0)).toISOString(), status: 'late' },
  { id: 'att-5', user_id: 'kong', work_date: new Date().toISOString().slice(0, 10), check_in_at: new Date(new Date().setHours(8, 48, 0)).toISOString(), status: 'on_time' },
  { id: 'att-6', user_id: 'ploy', work_date: new Date().toISOString().slice(0, 10), check_in_at: new Date(new Date().setHours(9, 19, 0)).toISOString(), status: 'late' },
  { id: 'att-7', user_id: 'art', work_date: new Date().toISOString().slice(0, 10), check_in_at: new Date(new Date().setHours(8, 55, 0)).toISOString(), status: 'on_time' }
];

export type RoomChatMessage = {
  id: string;
  roomId: 'hub' | 'project' | 'coffee';
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  message: string;
  content?: string;
  imageUrl?: string;
  createdAt: string;
};

export type DirectMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  recipientId: string;
  recipientName: string;
  recipientAvatar?: string;
  message: string;
  content?: string;
  imageUrl?: string;
  isRead: boolean;
  createdAt: string;
};

export const sampleRoomMessages: RoomChatMessage[] = [
  {
    id: 'rm-1',
    roomId: 'hub',
    senderId: 'may',
    senderName: 'เมย์',
    senderAvatar: '👩🏻‍💻',
    message: 'สวัสดีทุกคนค่า วันนี้เตรียมสรุปงานสปรินต์ประจำสัปดาห์กันนะคะ ✨',
    content: 'สวัสดีทุกคนค่า วันนี้เตรียมสรุปงานสปรินต์ประจำสัปดาห์กันนะคะ ✨',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString()
  },
  {
    id: 'rm-2',
    roomId: 'hub',
    senderId: 'ton',
    senderName: 'ต้น',
    senderAvatar: '👨🏻‍💻',
    message: 'ครับผม หน้าแดชบอร์ดงานและแชทห้องพร้อมใช้งานแล้วครับ 👍',
    content: 'ครับผม หน้าแดชบอร์ดงานและแชทห้องพร้อมใช้งานแล้วครับ 👍',
    createdAt: new Date(Date.now() - 3600000 * 1.5).toISOString()
  },
  {
    id: 'rm-3',
    roomId: 'project',
    senderId: 'nan',
    senderName: 'แนน',
    senderAvatar: '👩🏻‍💼',
    message: 'เอกสารข้อกำหนดระบบของลูกค้าส่งให้ตรวจในโฟลเดอร์เรียบร้อยแล้วค่ะ',
    content: 'เอกสารข้อกำหนดระบบของลูกค้าส่งให้ตรวจในโฟลเดอร์เรียบร้อยแล้วค่ะ',
    createdAt: new Date(Date.now() - 3600000 * 3).toISOString()
  },
  {
    id: 'rm-4',
    roomId: 'project',
    senderId: 'kong',
    senderName: 'ก้อง',
    senderAvatar: '👨🏻‍🎨',
    message: 'รับทราบครับ กำลังดูรายละเอียดเพื่อประเมินเวลาครับ',
    content: 'รับทราบครับ กำลังดูรายละเอียดเพื่อประเมินเวลาครับ',
    createdAt: new Date(Date.now() - 3600000 * 2.8).toISOString()
  },
  {
    id: 'rm-5',
    roomId: 'coffee',
    senderId: 'beam',
    senderName: 'บีม',
    senderAvatar: '👩🏻‍🎨',
    message: 'ใครทำงานเหนื่อยๆ แวะมาชงกาแฟหรือชาได้นะ มีขนมมาฝากที่บาร์ค่ะ ☕🥐',
    content: 'ใครทำงานเหนื่อยๆ แวะมาชงกาแฟหรือชาได้นะ มีขนมมาฝากที่บาร์ค่ะ ☕🥐',
    createdAt: new Date(Date.now() - 3600000 * 0.8).toISOString()
  }
];

export const sampleDirectMessages: DirectMessage[] = [
  {
    id: 'dm-1',
    senderId: 'may',
    senderName: 'เมย์',
    senderAvatar: '👩🏻‍💻',
    recipientId: 'me',
    recipientName: 'คุณ',
    message: 'สวัสดีค่ะ รบกวนปรึกษาเรื่องแผนงานสำหรับช่วงบ่ายนี้หน่อยได้ไหมคะ?',
    content: 'สวัสดีค่ะ รบกวนปรึกษาเรื่องแผนงานสำหรับช่วงบ่ายนี้หน่อยได้ไหมคะ?',
    isRead: false,
    createdAt: new Date(Date.now() - 1800000).toISOString()
  },
  {
    id: 'dm-2',
    senderId: 'me',
    senderName: 'คุณ',
    recipientId: 'may',
    recipientName: 'เมย์',
    recipientAvatar: '👩🏻‍💻',
    message: 'ยินดีเลยครับ สะดวกช่วง 14:00 น. หรือจะคุยในห้อง Project Room ก็ได้ครับ',
    content: 'ยินดีเลยครับ สะดวกช่วง 14:00 น. หรือจะคุยในห้อง Project Room ก็ได้ครับ',
    isRead: true,
    createdAt: new Date(Date.now() - 1200000).toISOString()
  },
  {
    id: 'dm-3',
    senderId: 'ton',
    senderName: 'ต้น',
    senderAvatar: '👨🏻‍💻',
    recipientId: 'me',
    recipientName: 'คุณ',
    message: 'เช็คฟังก์ชันแชทห้องและ DM แล้ว ใช้งานลื่นไหลดีมากเลยครับ 🚀',
    content: 'เช็คฟังก์ชันแชทห้องและ DM แล้ว ใช้งานลื่นไหลดีมากเลยครับ 🚀',
    isRead: true,
    createdAt: new Date(Date.now() - 600000).toISOString()
  }
];

