# คู่มือการติดตั้งและใช้งาน LINE Bot ใน PRIME Virtual Office

ระบบ **PRIME TEAMWORK** รองรับการส่งข้อความแจ้งเตือนเข้าสู่แอป LINE ทั้งแบบ **LINE Bot อัตโนมัติ (Messaging API)** และแบบ **LINE Direct Share (แชร์ทันทีใน 1 คลิก)**

---

## 1. วิธีใช้งานแบบที่ 1: LINE Direct Share (ใช้งานได้ทันที ไม่ต้องตั้งค่า)
- ในเมนูเรียกประชุม หรือ กล่องรับทราบการลาของผู้บริหาร จะมีปุ่ม **"🟢 ส่ง LINE"** หรือ **"แชร์เข้าแอป LINE ทันที"**
- เมื่อกดปุ่ม ระบบจะเปิดแอป LINE ขึ้นมาพร้อมข้อความสรุปการลา หรือรายละเอียดห้องประชุมที่จัดรูปแบบไว้อย่างสวยงาม
- สามารถเลือกส่งเข้า **กลุ่ม LINE ของบริษัท** หรือห้องแชทของเพื่อนร่วมงานได้ทันที 100%

---

## 2. วิธีใช้งานแบบที่ 2: LINE Bot อัตโนมัติ (Messaging API)

### ขั้นตอนที่ 1: สร้าง LINE Official Account & Messaging API
1. ไปที่เว็บไซต์ [LINE Developers Console](https://developers.line.biz/) และล็อกอินด้วยบัญชี LINE
2. กด **Create a new Provider** (เช่น ตั้งชื่อว่า `PRIME Digital`)
3. เลือก **Create a Messaging API channel**
   - ใส่ชื่อบอท เช่น `PRIME Office Bot`
   - ใส่ Email และเลือก Category
4. ไปที่แท็บ **Messaging API**
   - เลื่อนลงมาล่างสุดที่หัวข้อ **Channel access token**
   - กดปุ่ม **Issue** เพื่อสร้าง Token แบบ Long-lived
   - คัดลอก (Copy) ค่า **Channel Access Token** มาเก็บไว้

### ขั้นตอนที่ 2: ดึง LINE Bot เข้ากลุ่มทำงาน
1. เพิ่มเพื่อนกับบอท (สแกน QR Code จากหน้า Messaging API)
2. เชิญบอทเข้าสู่ **กลุ่ม LINE พนักงาน/ผู้บริหาร** ที่ต้องการให้แจ้งเตือน

### ขั้นตอนที่ 3: นำ Group ID หรือ User ID มาใส่ในระบบ
1. ในหน้า **PRIME Virtual Office**:
   - ไปที่หน้าระบบลงเวลา > กล่องผู้บริหาร > กดปุ่ม **"⚙️ ตั้งค่า LINE Bot"**
   - หรือ ในหน้าต่างห้องประชุม กดปุ่ม **"เรียกประชุม"**
2. กรอกข้อมูล:
   - **Channel Access Token:** วาง Token ที่คัดลอกมา
   - **Group ID / User ID:** ใส่ Group ID (ขึ้นต้นด้วย `C...`) หรือ User ID ของคุณ (ขึ้นต้นด้วย `U...`)
3. กดปุ่ม **"⚡ ทดสอบส่งข้อความ"** เพื่อตรวจสอบการเชื่อมต่อ
4. กด **"บันทึกการตั้งค่า"**

---

## 3. การ Bypass Browser CORS ด้วย Supabase Edge Function (ทางเลือกเพิ่มเติม)
เนื่องจากเบราว์เซอร์บางรุ่นจะป้องกันการยิง API ตรงไปยัง `api.line.me` (CORS Policy)
ทางระบบได้เตรียม Supabase Edge Function ไว้ให้ที่:
`supabase/functions/line-bot-push/index.ts`

คำสั่ง Deploy ไปยัง Supabase ของคุณ:
```bash
supabase functions deploy line-bot-push --no-verify-jwt
```
เมื่อ Deploy แล้ว ระบบจะยิงผ่าน Edge Function ได้อย่างราบรื่น ไม่มีปัญหาเรื่อง CORS อย่างแน่นอนครับ
