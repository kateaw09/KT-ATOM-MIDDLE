# KT_ATOM_Middle (PTBOT Atom VX Firmware & KT Middle IDE)

เฟิร์มแวร์หุ่นยนต์ระดับกลางสำหรับบอร์ด **PTBOT Atom VX (ESP32)** พร้อมระบบ **KT Middle IDE** (Blocks + Simulator + Arduino C++ IDE + Map Manager)

---

## วิธีเริ่มต้นใช้งาน (เลือกได้ 2 วิธี)

### วิธีที่ 1: ใช้งานผ่าน KT Middle IDE (แนะนำ — 1-Click ใช้งานได้ทันที)

เหมาะสำหรับผู้ที่โคลน (`git clone`) หรือกด **Download ZIP** จาก GitHub แล้วต้องการคอมไพล์และอัปโหลดทันที **โดยไม่ต้องเปลี่ยนชื่อโฟลเดอร์**

1. ติดตั้ง **Node.js v18 ขึ้นไป** (`https://nodejs.org/`)
2. เปิดใช้งานตามระบบปฏิบัติการ (ครั้งแรกให้เชื่อมต่ออินเทอร์เน็ตเพื่อให้สคริปต์ติดตั้งเครื่องมืออัตโนมัติ):
   - **Windows**: ดับเบิลคลิกไฟล์ `ide\start-ide.bat`
   - **macOS / Linux**:
     ```bash
     chmod +x ide/start-ide.sh ide/app/manage-ide.sh
     ./ide/start-ide.sh
     ```
3. สคริปต์จะดำเนินการให้อัตโนมัติทั้งหมด:
   - ติดตั้ง Vite & dependencies (`npm install`)
   - ติดตั้ง `arduino-cli` แบบ Standalone (หากเครื่องยังไม่มี)
   - เพิ่ม Board Manager URL และติดตั้งบอร์ด **`PTBOT_ESP32:esp32`** (`PTBOT Atom VX`)
   - ซิงก์ไลบรารี **`KT_ATIOM_VX_MANAGER`** ลงโฟลเดอร์ Arduino ของผู้ใช้ให้พร้อมใช้ทั้ง 2 IDE
4. เปิดเบราว์เซอร์ไปที่ `http://localhost:3080` แล้วกด **Verify & Compile** ได้ทันที (รองรับชื่อโฟลเดอร์ `KT-ATOM-MIDDLE` และ `KT-ATOM-MIDDLE-main` อัตโนมัติ)

> คู่มือเพิ่มเติม: [ide/README.md](ide/README.md) และ [ide/USER_MANUAL_IDE.md](ide/USER_MANUAL_IDE.md)

---

### วิธีที่ 2: คอมไพล์ผ่าน Arduino IDE 2.x

1. **เปลี่ยนชื่อโฟลเดอร์โปรเจกต์** ที่โคลนหรือแตกไฟล์ ZIP มาให้เป็น **`KT_ATOM_Middle`** (ตรงกับชื่อไฟล์ `KT_ATOM_Middle.ino`)
2. เพิ่ม **Additional Boards Manager URLs** ใน `File → Preferences`:
   ```text
   https://raw.githubusercontent.com/pt-robotics/esp32/refs/heads/main/package_ptbot_index.json
   ```
3. เปิด `Tools → Board → Boards Manager...` ค้นหา **`PTBOT ESP32`** แล้วกดติดตั้ง จากนั้นเลือกบอร์ด **`PTBOT Atom VX`**
4. ติดตั้งไลบรารี **`KT_ATIOM_VX_MANAGER`** อย่างใดอย่างหนึ่ง:
   - กด `Sketch → Include Library → Add .ZIP Library...` แล้วเลือกไฟล์ `libraries/KT_ATIOM_VX_MANAGER.zip`
   - หรือคัดลอกโฟลเดอร์ `libraries/KT_ATIOM_VX_MANAGER` ไปวางใน `Documents\Arduino\libraries\`
5. เปิดไฟล์ `KT_ATOM_Middle.ino` แล้วกด **Verify / Upload**
