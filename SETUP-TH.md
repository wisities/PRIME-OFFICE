# ตั้งค่า PRIME Virtual Office ตั้งแต่เริ่มต้น

คู่มือนี้สำหรับรุ่นฟรี ทีมไม่เกิน 15 คน ข้อมูล ณ 12 ตุลาคม 2026

## สิ่งที่ทำไว้ในเครื่องแล้ว

- เว็บ React + TypeScript + Vite พร้อมออฟฟิศการ์ตูนและโหมดสาธิต
- Project URL ที่ผู้ใช้ให้มา: `https://hytecxupvfhqaddtymcx.supabase.co`
- Publishable key อยู่ใน `.env.local` แล้ว ไม่ต้องสร้างโปรเจกต์ใหม่อีก
- ผู้ดูแลคนแรก: `p.wisities@gmail.com` ตามที่ผู้ใช้ระบุ
- ยังไม่ได้รัน SQL ใน Supabase, เปิด Google OAuth หรือเผยแพร่ Cloudflare แทนผู้ใช้

Publishable key เป็นคีย์สำหรับใช้ในหน้าเว็บได้ สิทธิ์ข้อมูลจริงบังคับด้วย RLS และ RPC ฝั่งฐานข้อมูล ห้ามใส่ secret key, service_role หรือรหัสผ่านฐานข้อมูลในเว็บหรือส่งเข้ามาในแชต

## 1. สร้าง Supabase (ข้ามได้ เพราะมี Project URL แล้ว)

1. เข้า https://supabase.com/dashboard แล้วสมัคร/เข้าสู่ระบบ
2. สร้าง Organization เลือก Free
3. กด New project ตั้งชื่อ `prime-virtual-office`
4. สร้างรหัสผ่านฐานข้อมูลที่ไม่ซ้ำ และเก็บไว้ในตัวจัดการรหัสผ่านของบริษัท
5. เลือก Region ใกล้ผู้ใช้ เช่น Singapore หากมีให้เลือก แล้วกด Create new project
6. รอโปรเจกต์พร้อม เปิด Connect เลือก React แล้วคัดลอก Project URL และ Publishable key
7. อีกตำแหน่งคือ Settings > API Keys สำหรับคีย์ และ Data API/Connect สำหรับ URL ชื่อเมนูอาจเปลี่ยนได้

URL หน้าจัดการ `supabase.com/dashboard/project/...` ไม่ใช่ Project URL ที่เว็บต้องใช้

## 2. สร้างตารางและผู้ดูแลในโปรเจกต์ที่มีอยู่

1. เปิด https://supabase.com/dashboard และเลือกโปรเจกต์ `hytecxupvfhqaddtymcx`
2. เลือก SQL Editor > New query
3. เปิดไฟล์ `supabase/schema.sql` ในโปรเจกต์นี้ คัดลอกทั้งหมด วางแล้วกด Run
4. ต้องเห็นข้อความสำเร็จ หากมีข้อผิดพลาดให้หยุดและส่งข้อความข้อผิดพลาดมา ไม่ต้องรันคำสั่งลบตาราง
5. สร้าง New query อีกอัน คัดลอกไฟล์ `supabase/first-admin.sql` แล้วกด Run
6. เปิด Table Editor ตรวจว่ามี `rooms`, `members`, `announcements`, `knocks`, `office_presence`
7. ใน `members` ต้องมี `p.wisities@gmail.com` และ `is_admin=true`, `active=true`

ไฟล์ schema มี transaction และออกแบบให้รันครั้งแรกครั้งเดียว หากตารางมีอยู่แล้ว ไม่ควรรันทับโดยไม่ตรวจสอบ

ทุกห้องในรุ่นแรกเป็นห้องภายในที่สมาชิกบริษัทเข้าได้เหมือนกัน คำขอเคาะประตูคือการชวนคุย ไม่ใช่การล็อกห้อง ยังไม่มีแขกภายนอกหรือห้องโปรเจกต์จำกัดสิทธิ์

## 3. สร้าง Cloudflare และเผยแพร่เว็บ

1. เข้า https://dash.cloudflare.com/sign-up สมัครบัญชีด้วยอีเมลบริษัท/ผู้ดูแลและยืนยันอีเมล
2. เข้า Workers & Pages > Create application
3. เลือกเส้นทาง Pages แล้ว Get started > Drag and drop your files หรือ Upload assets (ชื่ออาจต่างตามหน้า Dashboard)
4. ตั้งชื่อ เช่น `prime-teamwork` หากซ้ำให้เติมชื่อย่อบริษัท
5. อัปโหลดเนื้อหาโฟลเดอร์ `dist` หรือไฟล์ `prime-cloudflare.zip` ที่เตรียมไว้ใน `release`
6. กด Deploy site แล้วรอ URL ที่ Cloudflare คืนมา เช่น `https://prime-teamwork.pages.dev` — เป็นเพียงตัวอย่าง ชื่อจริงขึ้นกับที่จองได้
7. เปิด URL ตรวจว่าหน้าเข้าสู่ระบบและปุ่มลองใช้งานแสดงถูกต้อง

ไม่ต้องซื้อโดเมน ไม่ต้องเพิ่ม nameserver หรือย้ายโดเมนบริษัท สำหรับการใช้ `pages.dev`

สำคัญ: ต้องอัปโหลดไฟล์จาก `dist` ไม่ใช่โฟลเดอร์ src หรือทั้งโปรเจกต์ ใน zip ต้องเห็น `index.html`, `_headers`, `_redirects`, `assets/` ที่ระดับบนสุด

วิธี Direct Upload นี้ build ในเครื่องแล้ว จึงไม่ต้องกรอก Environment variables ใน Cloudflare Dashboard หากเปลี่ยน Supabase URL/key ให้แก้ `.env.local`, รัน `npm run build` แล้วอัปโหลด dist ใหม่

หากภายหลังต้องการ deploy อัตโนมัติจาก Git ให้สร้างโปรเจกต์ Pages แบบ Git integration ตามเอกสาร Cloudflare เพราะโปรเจกต์ Direct Upload ไม่สามารถสลับเป็น Git integration ได้โดยตรง

## 4. ตั้งค่าลิงก์กลับเข้าเว็บใน Supabase

URL เว็บไซต์จริง (Cloudflare Pages):
`https://prime-virtual-office.pages.dev`

1. เข้า Supabase > Authentication > URL Configuration
2. Site URL:
   `https://prime-virtual-office.pages.dev`
3. Redirect URLs เพิ่ม:
   `https://prime-virtual-office.pages.dev/`
   และเพิ่ม `http://127.0.0.1:5174/` (สำหรับการทดสอบในเครื่อง)
4. กด Save changes

อย่าใส่ wildcard ของทั้ง `pages.dev` เพราะจะเปิดให้ redirect ไปเว็บอื่น

## 5. เปิด Google Login

ต้องมี OAuth Client ของ Google เพิ่มจากบัญชี Supabase และ Cloudflare

1. เข้า https://console.cloud.google.com/ แล้วสร้าง Project เช่น `PRIME Virtual Office`
2. เข้า Google Auth Platform (หน้ารุ่นเก่าอาจเรียก APIs & Services > OAuth consent screen)
3. กรอก Branding: ชื่อแอป `PRIME Virtual Office`, อีเมล support และ contact ของผู้ดูแล
4. Audience: ถ้าใช้ Gmail ทั่วไปให้เลือก External หากมี Workspace และต้องการจำกัดเฉพาะองค์กร เลือก Internal เมื่อบัญชีมีตัวเลือกนี้
5. ถ้าใช้ External สถานะ Testing ให้เพิ่มอีเมลผู้ดูแลและสมาชิกเป็น Test users จนครบรายชื่อที่จะทดลอง
6. Data Access ใช้เฉพาะ `openid`, `userinfo.email`, `userinfo.profile` ไม่ต้องขอ Drive/Gmail/Calendar
7. Clients > Create client > Web application
8. Authorized JavaScript origins: เพิ่ม URL เว็บจริง:
   `https://prime-virtual-office.pages.dev`
   (และ `http://127.0.0.1:5174` สำหรับเครื่องตัวเอง)
9. Authorized redirect URIs: ใส่ค่าต่อไปนี้ตรงตัว:

   `https://hytecxupvfhqaddtymcx.supabase.co/auth/v1/callback`

10. กด Create แล้วคัดลอก Client ID และ Client Secret ไปใส่ใน Supabase เท่านั้น ไม่ต้องส่ง Client Secret ให้ผม
11. Supabase > Authentication > Sign In / Providers > Google เปิด Enable แล้วใส่ Client ID / Client Secret > Save
12. เปิดเว็บไซต์ กดเข้าสู่ระบบด้วย Google และเลือก `p.wisities@gmail.com`
13. เมื่อเข้าได้แล้ว ไป ผู้ดูแลระบบ > อนุญาตสมาชิก ใส่ชื่อและอีเมลของทีม

ต้องตั้ง allowlist ของแอปใน members ด้วย แม้ Google จะอนุญาต OAuth แล้ว บัญชีที่ยังไม่อยู่ใน members จะเข้าออฟฟิศไม่ได้ (อาจมีบัญชี Auth ถูกสร้าง แต่ไม่มีสิทธิ์อ่านข้อมูลบริษัท)

## 6. ตั้งค่าห้องและทดลองกับทีม

1. สร้าง Google Meet แล้วคัดลอกลิงก์รูปแบบ `https://meet.google.com/abc-defg-hij`
2. ในเว็บ PRIME ไป ผู้ดูแลระบบ > ลิงก์ประชุมประจำห้อง เลือกห้องแล้วบันทึกลิงก์
3. ให้สมาชิกสองคนเข้าสู่ระบบคนละเครื่อง ลองย้ายห้อง เปลี่ยนสถานะ บันทึกงาน และส่งคำขอคุย
4. ผู้รับกดกระดิ่งเพื่อตอบรับ คำขอจะย้ายผู้รับไปห้องที่ผู้ส่งระบุ
5. คำขอหมดอายุใน 5 นาที และส่งซ้ำได้หลัง 30 วินาที
6. ตรวจว่าบัญชีนอกทีมเข้าไม่ได้ และบัญชีที่ปิดสิทธิ์ไม่สามารถอ่าน/แก้ไขข้อมูลได้
7. ก่อนใช้งานทั้งบริษัท ให้ลองครบ 15 คนพร้อมกันจริง

## 7. ค่าใช้จ่ายและขอบเขต

- เป้าหมายค่าบริการ 0 บาท/เดือนภายใต้โควตาฟรี ต้องตรวจ usage เป็นระยะ
- Supabase Free อาจพักโปรเจกต์เมื่อกิจกรรมน้อยช่วง 7 วัน ไม่มีการรับประกันพร้อมใช้งานตลอดเวลา
- Google Meet ฟรีมีข้อจำกัดเวลาประชุมกลุ่ม และเปิดแยกแท็บ เว็บนี้ไม่รู้สถานะในสาย Meet อัตโนมัติ
- แผนผังแสดงสถานะห้องทันทีผ่าน Postgres Changes; online heartbeat ทุก 30 วินาที และถือว่าออฟไลน์หลังขาด heartbeat เกิน 90 วินาที โดยรอบดึงข้อมูลอาจทำให้เห็นช้าขึ้น
- เปิดหลายแท็บนับเป็นสมาชิกคนเดียว สถานะล่าสุดใช้ร่วมกัน เมื่อออกจากระบบแท็บหนึ่ง การยืนยันตัวตนในแท็บอื่นจะถูกซิงก์ด้วย Supabase
- งานวันนี้เป็นข้อความสถานะล่าสุด ไม่ล้างอัตโนมัติข้ามวัน ไม่มีระบบมอบหมายงานหรือประวัติรายวัน
- ประกาศสาธิตและลิงก์ประชุมสาธิตเก็บในหน่วยความจำชั่วคราว งานและตำแหน่งสาธิตเก็บใน localStorage
- ไม่มีบริการส่งอีเมล/แจ้งเตือนเมื่อปิดเว็บ ไม่มีบันทึกประชุม และไม่มีการติดตามผลงานจากเวลาออนไลน์
- สำรองฐานข้อมูลก่อนแก้ schema และทดสอบกู้คืนก่อนใช้ข้อมูลสำคัญ รุ่นนี้ยังไม่ตั้งงานสำรองอัตโนมัติ

## พัฒนาในเครื่อง

```powershell
npm ci
npm run dev -- --port 5174
npm test
npm run build
```

เมื่อเผยแพร่ครั้งถัดไป ระบบเชื่อมต่อ Git กับ Cloudflare Pages อัตโนมัติแล้ว เพียงสั่ง git push โค้ดจะ build และ deploy ให้ทันที

## แหล่งข้อมูลทางการ

- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase React: https://supabase.com/docs/guides/getting-started/quickstarts/reactjs
- Supabase Google OAuth: https://supabase.com/docs/guides/auth/social-login/auth-google
- Redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls
- Cloudflare Direct Upload: https://developers.cloudflare.com/pages/get-started/direct-upload/
- Supabase Free usage: https://supabase.com/docs/guides/platform/billing-on-supabase
- Project pausing: https://supabase.com/docs/guides/platform/free-project-pausing
- Google Meet: https://workspace.google.com/products/meet/
