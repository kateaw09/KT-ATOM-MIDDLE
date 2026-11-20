# คู่มือการใช้งาน KT Middle IDE (Vite Edition)

เอกสารฉบับนี้อธิบายการติดตั้งและใช้งาน **KT Middle IDE** เวอร์ชัน **Vite + Node.js** ที่ติดตั้งและเปิดใช้งานได้ทันทีผ่านไฟล์ `.bat` / `.sh` มาพร้อม:
- ระบบ **บล็อกคำสั่ง 2D ลากวางอิสระ** และ **ลากบล็อกตัวแปร (Variables), คณิตศาสตร์ (Math) และตรรกศาสตร์ (Logic) ใส่ในพารามิเตอร์ซ้อนกันได้**
- **Arduino C++ IDE** พร้อม **Syntax Highlighting (สีตามไวยากรณ์โค้ด)**, **Autocomplete (ระบบช่วยเขียน)**, และ **Inline Word Prediction (ระบบเดาคำในบรรทัด)** ที่เปิด/ปิดได้ในหน้า **IDE Settings** แยกจากตั้งค่าหุ่นยนต์
- ระบบ **Auto Save** อัตโนมัติ และ **Local Version Control** (บันทึกโน้ต + แนบรูปภาพ + ดู Diff + ดึงย้อนกลับ) บนดิสก์ของผู้ใช้งาน

---

## 1. โครงสร้างไฟล์ภายใน `/ide`

| รายการใน `/ide` | หน้าที่หลัก |
| :--- | :--- |
| `start-ide.bat` | สคริปต์ **1-Click Launcher (Windows)** — ติดตั้ง Vite / `npm install`, ตรวจ `arduino-cli`, เปิด IDE ที่ `http://localhost:3080` |
| `start-ide.sh` | สคริปต์ **1-Click Launcher (macOS / Linux)** |
| `manage-ide.bat` | ตัวจัดการ Background Server (`manage-ide.bat start \| stop \| status \| setup`) |
| `README.md` | คู่มือเริ่มต้นฉบับย่อ (Quick Start) |
| `USER_MANUAL_IDE.md` | คู่มือการใช้งานฉบับสมบูรณ์ |
| `app/` | โปรเจกต์ **Vite** เต็มรูปแบบ (`package.json`, `vite.config.js`, `index.html`, `src/`, `backend/apiMiddleware.js`, `public/vendor/`) |

---

## 2. วิธีติดตั้งและเปิดใช้งานด้วยสคริปต์ `.bat` / `.sh`

### 2.1 สำหรับ Windows
1. ติดตั้ง **Node.js (v18 ขึ้นไป)** จาก `https://nodejs.org/`
2. ดับเบิลคลิก **`ide\start-ide.bat`**
   - ระบบจะติดตั้ง `vite` ผ่าน `npm install` (ครั้งแรกที่มีอินเทอร์เน็ต หรือถ้าติดตั้งแล้วจะเปิดทันทีแบบ Offline 100%), รัน `setup-deps.js` ตรวจ `arduino-cli` และ `.kt-versions`, และเปิด `http://localhost:3080` ให้อัตโนมัติ

### 2.2 สำหรับ macOS / Linux
```bash
cd ide
chmod +x start-ide.sh app/manage-ide.sh
./start-ide.sh
```

---

## 3. การลากบล็อก ตัวแปร คณิตศาสตร์ และตรรกศาสตร์ ใส่ในพารามิเตอร์ (Blocks Mode)

1. **หมวด `Variables`**:
   - สร้างตัวแปรใหม่ลงใน `Variables.ino` ได้ทั้ง `int`, `float`, `char`, `bool`
   - ตัวแปรทุกตัวจะปรากฏเป็นการ์ดวงรี **`VAR`** ที่ลากไปหย่อนลงในช่องพารามิเตอร์ (เช่น `spd`, `cm`, `deg`, `ms`) หรือในบล็อกคำนวณได้โดยตรง
2. **หมวด `Math` (คณิตศาสตร์)**:
   - บล็อก `a + b`, `a - b`, `a * b`, `a / b`, `a % b`, `-a`, `abs(x)`, `min(a, b)`, `max(a, b)`, `constrain(x, min, max)`, `random(min, max)`
   - ลากไปวางในช่องพารามิเตอร์ของคำสั่งหุ่นยนต์ หรือ **วางซ้อนลงในช่องย่อยของบล็อกคณิตศาสตร์/ตรรกศาสตร์อีกชั้น** ได้อิสระ (เช่น `FC(spdNorm + 20, cellCm * 2);`)
3. **หมวด `Logic` (ตรรกศาสตร์)**:
   - บล็อกเปรียบเทียบ `==`, `!=`, `<`, `<=`, `>`, `>=`, ตรรกะ `&&` (AND), `||` (OR), `!` (NOT), `cond ? a : b` (Ternary เลือกค่าตามเงื่อนไข), `true / false`
   - ใช้ร่วมกับช่องพารามิเตอร์หรือบล็อก `if (cond) { stmt; }` ในหมวด `Control` ได้ทันที พร้อมแปลงเป็น C++ และจำลองค่าใน Simulator แบบเรียลไทม์

---

## 4. โหมด Arduino C++ & ตั้งค่า IDE (`IDE Settings`)

กดปุ่ม **`IDE Settings`** บนแถบเครื่องมือด้านบน (แยกอิสระจาก `Robot Config`) เพื่อปรับแต่งตัวช่วยเขียนโค้ด:
- **Syntax Highlighting**: แยกสีคำสั่งหุ่นยนต์ (`FC`, `SpinDegree`, `SetF`), ชนิดตัวแปร, คีย์เวิร์ด C++, ตัวเลข, สตริง, ตัวแปรจาก `Variables.ino` และคอมเมนต์
- **Autocomplete (`Ctrl + Space`)**: แสดงเมนูคำสั่งพร้อมคำอธิบายและพารามิเตอร์ กด `Enter` หรือ `Tab` เพื่อแทรก
- **Inline Word Prediction**: แสดงคำแนะนำต่อท้ายเคอร์เซอร์แบบจาง กด `Tab` หรือลูกศรขวา เพื่อเติมคำทันที
- **Parameter Signature Hints**, **Auto-Close Brackets**, **Word Wrap**, **Font Size (11–20 px)** และ **Tab Size (2 / 4 spaces)**

---

## 5. ระบบ Auto Save, ปรับขนาดหน้าต่าง และ Version Control

- **Auto Save**: เปิด/ปิดได้ที่สวิตช์ `Auto` มุมซ้ายบน บันทึกอัตโนมัติลงเครื่องภายใน ~1.2 วินาที
- **Version Control (`Versions` / `Ctrl+Shift+G`)**: บันทึก Snapshot ทุกไฟล์ `.ino`, ตำแหน่งบล็อก, ค่า Calibration พร้อมตั้งชื่อ, Tag, คำอธิบาย, แนบรูปภาพจากเครื่อง/Ctrl+V/แคป Simulator, ดู Diff และ Restore ย้อนกลับได้ทุกเวลา
- **ย่อ/ขยาย & ปรับขนาดทุกส่วน**: ลากเส้นแบ่งระหว่างคอลัมน์หรือแนวนอน เพื่อปรับขนาด Toolbox, Simulation Field, พรีวิว C++, Console, แถบไฟล์ Code และพับกล่อง Mission บน Canvas ได้อิสระ
