export type RoomId = 'hub' | 'project' | 'focus' | 'coffee';
export type Status = 'available' | 'focus' | 'away';
export type Member = { id:string; name:string; role:string; room:RoomId; status:Status; online:boolean; color:string; note?:string; isAdmin?:boolean; avatarUrl?:string };
export type Room = { id:RoomId; name:string; thai:string; description:string; meet_url?:string; task:string };
export const rooms:Room[] = [
  {id:'hub',name:'PRIME Hub',thai:'พื้นที่ทำงานกลาง',description:'เริ่มวันใหม่ แบ่งปันไอเดีย และทำงานไปด้วยกัน',task:'อัปเดตสิ่งที่ทำวันนี้ให้ทีมรู้'},
  {id:'project',name:'Project Room',thai:'ห้องคุยโปรเจกต์',description:'รวมทีมคุยงานและเปิดประชุมผ่าน Google Meet',task:'ปักหมุดลิงก์ประชุมได้ในหน้าผู้ดูแล'},
  {id:'focus',name:'Focus Zone',thai:'มุมทำงานเงียบ',description:'พื้นที่สำหรับงานที่ต้องใช้สมาธิ เคาะประตูก่อนคุย',task:'เคารพช่วงเวลาโฟกัสของเพื่อนร่วมทีม'},
  {id:'coffee',name:'Coffee Corner',thai:'มุมพักและพูดคุย',description:'พักสายตา เติมกาแฟ แล้วกลับมาพร้อมไอเดียใหม่',task:'แวะมาทักทายกันได้เสมอ'}
];
export const statuses:Record<Status,string> = {available:'พร้อมคุย',focus:'กำลังโฟกัส',away:'ไม่อยู่ชั่วคราว'};
export const sampleMembers:Member[] = [
  {id:'may',name:'เมย์',role:'Project Lead',room:'hub',status:'available',online:true,color:'peach',note:'วางแผนงานประจำสัปดาห์'},
  {id:'ton',name:'ต้น',role:'Developer',room:'hub',status:'focus',online:true,color:'blue',note:'พัฒนาหน้าเว็บไซต์ลูกค้า'},
  {id:'beam',name:'บีม',role:'Designer',room:'hub',status:'available',online:true,color:'lavender'},
  {id:'nan',name:'แนน',role:'Consultant',room:'project',status:'available',online:true,color:'mint'},
  {id:'kong',name:'ก้อง',role:'Developer',room:'project',status:'available',online:true,color:'blue'},
  {id:'ploy',name:'พลอย',role:'Designer',room:'focus',status:'focus',online:true,color:'peach'},
  {id:'art',name:'อาร์ต',role:'Developer',room:'focus',status:'focus',online:true,color:'mint'},
  {id:'nat',name:'นัท',role:'Marketing',room:'coffee',status:'available',online:true,color:'lavender'},
  ...['ฟ้า','ปอนด์','ไอซ์','วิว','ฟิล์ม','พิม'].map((name,i)=>({id:'offline-'+i,name,role:'ทีม PRIME',room:'hub' as RoomId,status:'away' as Status,online:false,color:'blue'}))
];
