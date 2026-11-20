# KT Middle IDE (`/ide`)

Dual-Mode Web IDE (Freeform MakeCode Blocks + Variable/Math/Logic Reporters + Calibrated Simulator & Syntax-Highlighted Arduino C++ IDE + Local Version Control) ขับเคลื่อนด้วย **Vite + Node.js** ทำงานแบบ **Offline 100%**

## โครงสร้างภายใน `/ide`
- `start-ide.bat` — ตัวเปิดใช้งาน **1-Click สำหรับ Windows** (ติดตั้ง Vite & Dependencies, ตรวจ `arduino-cli`, เปิด Vite IDE Server และเปิดเบราว์เซอร์อัตโนมัติ)
- `start-ide.sh` — ตัวเปิดใช้งาน **1-Click สำหรับ macOS / Linux**
- `manage-ide.bat` — เมนูจัดการเปิด-ปิดแบบ Background, ตรวจสอบสถานะ และดู Logs
- `README.md` — คู่มือเริ่มต้นฉบับย่อ
- `USER_MANUAL_IDE.md` — คู่มือการใช้งานฉบับสมบูรณ์
- `app/` — โปรเจกต์ Vite เต็มรูปแบบ (`package.json`, `vite.config.js`, `index.html`, `src/`, `backend/apiMiddleware.js`, `public/vendor/`)

## เริ่มใช้งานด่วน
- **Windows**: ดับเบิลคลิก **`start-ide.bat`**
- **macOS / Linux**: รัน `chmod +x start-ide.sh && ./start-ide.sh`
- เปิด **Chrome** หรือ **Edge** ไปที่ `http://localhost:3080`
