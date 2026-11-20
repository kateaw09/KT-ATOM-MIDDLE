// ============================================================================
// Config.ino — ศูนย์รวมการตั้งค่าโหมด, PID, เซนเซอร์, เซอร์โว, ระยะทาง และการบันทึก Flash
// ============================================================================

Preferences cfgPrefs;

// ============================================================================
// [กลุ่มที่ 1] ค่าที่แก้ไขแล้วอัปโหลดลงบอร์ดใช้งานได้ทันทีทุกรอบ (ไม่ถูก Flash เขียนทับ)
// ============================================================================

// --- 1.1 ตั้งค่าโหมดการทำงานหลัก ---
bool enableMultiMode = true;   // true = กด B เปลี่ยนโหมด 1-3, กด A รัน | false = กด A หรือ B รันทันที
int  currentRunMode  = 1;      // โหมดเริ่มต้น = 1 (มี 1, 2, 3)

// --- 1.2 ค่า PID และพารามิเตอร์การเคลื่อนที่ (PT_MIDDLE_ENC_2026Endcode4 + KT_Optimize) ---
float fwdKp       = 1.2f;      // เดินหน้า (FFE / FC): Kp
float fwdKd       = 15.0f;     // เดินหน้า (FFE / FC): Kd

float bwdKp       = 1.2f;      // ถอยหลัง (BBE / BC): Kp
float bwdKd       = 15.0f;     // ถอยหลัง (BBE / BC): Kd

float kp_turn     = 1.35f;     // เดินพร้อมเตรียมเลี้ยว (FC / BC / FC4 / BC4): Kp
float kd_turn     = 15.0f;     // เดินพร้อมเตรียมเลี้ยว (FC / BC / FC4 / BC4): Kd

float Set_kp      = 2.0f;      // จัดแนวเข้าเส้น (SetFront / SetBack / SetF / SetB): Kp
float Set_kd      = 15.0f;     // จัดแนวเข้าเส้น (SetFront / SetBack / SetF / SetB): Kd

// พารามิเตอร์ FFE / BBE (Encoder)
int min_speed_enc      = 40;
int max_speed_enc      = 100;
unsigned long ramp_up  = 5;    // ระยะเร่ง (cm)
long ramp_down         = 5;    // ระยะชะลอ (cm)

int min_speed_enc_turn     = 40;
int max_speed_enc_turn     = 100;
unsigned long ramp_up_turn = 5;
long ramp_down_turn        = 5;

// พารามิเตอร์ FF / BB / FF_turn / BB_turn (แบบจับเวลา ms)
float kp_time          = 1.8f;
float kd_time          = 15.0f;
int   min_speed_time   = 20;
int   max_speed_time   = 100;
unsigned long ramp_up_ms   = 150;
unsigned long ramp_down_ms = 200;

float kp_time_turn          = 1.8f;
float kd_time_turn          = 15.0f;
int   min_speed_time_turn   = 40;
int   max_speed_time_turn   = 80;
unsigned long ramp_up_time_turn   = 0;
unsigned long ramp_down_time_turn = 0;

// ค่าควบคุมการหมุนและเลี้ยว (จูนสำหรับหุ่น ~300g, ฐานล้อ 7.5 ซม., กว้างซ้าย-ขวา 11.5 ซม.)
float threshold_spinDegree  = 3.2f;    // ขอบเขตหยุดหมุน Spin (องศา)
float spinLeftOffsetDeg     = 0.0f;    // ชดเชยหมุนซ้ายแรงกว่าขวาใน Spin (+ = หมุนซ้ายหยุดเร็วขึ้น)
float smallAngle_threshold  = 55.0f;   // ช่วงชะลอเข้าความเร็วต่ำก่อนหยุด Spin (องศาสุดท้าย)
float smallAngle_turnDegree = 5.5f;    // ขอบเขตหยุดเลี้ยว Swing Turn (องศา — ชะลอเข้ามุมแล้วหยุดนุ่มไม่เหวี่ยง)
float turnRightOffsetDeg    = 0.0f;    // ชดเชยความต่างล้อซ้าย/ขวาตอนเลี้ยว Swing (+ = ล้อซ้ายขับ/เลี้ยวขวาหยุดเร็วขึ้น)

float spinKp      = 1.3f;      // หมุนอยู่กับที่ (spinDegree): Kp
float spinKd      = 1.46f;     // หมุนอยู่กับที่ (spinDegree): Kd (หน่วงแรงเฉื่อยจากอัตราการหมุน IMU deg/100ms)
int   spinMinSpeed = 20;       // หมุนอยู่กับที่: ความเร็วต่ำสุด
int   spinMaxSpeed = 80;       // หมุนอยู่กับที่: ความเร็วสูงสุด
unsigned long spinPostDelayMs = 30; // ดีเลย์รอนิ่งหลังหมุน Spin ก่อนทำคำสั่งถัดไป (แนะนำ 20-80 ms)

float turnFrontKp = 1.45f;     // เลี้ยวไปข้างหน้า (turnDegreeFront): Kp
float turnFrontKd = 1.30f;     // เลี้ยวไปข้างหน้า (turnDegreeFront): Kd (หน่วงช่วงเข้ามุมลดอาการเหวี่ยง)
int   turnFrontMinSpeed = 26;  // เลี้ยวไปข้างหน้า: ความเร็วช่วงชะลอเข้ามุม (กันเหวี่ยง/ไม่สะดุด)
int   turnFrontMaxSpeed = 90;  // เลี้ยวไปข้างหน้า: ความเร็วสูงสุดช่วงเลี้ยว (70-100)

float turnBackKp  = 1.45f;     // เลี้ยวไปข้างหลัง (turnDegreeBack): Kp
float turnBackKd  = 1.30f;     // เลี้ยวไปข้างหลัง (turnDegreeBack): Kd (หน่วงช่วงเข้ามุมลดอาการเหวี่ยง)
int   turnBackMinSpeed  = 26;  // เลี้ยวไปข้างหลัง: ความเร็วช่วงชะลอเข้ามุม (กันเหวี่ยง/ไม่สะดุด)
int   turnBackMaxSpeed  = 90;  // เลี้ยวไปข้างหลัง: ความเร็วสูงสุดช่วงเลี้ยว (70-100)
float turnInnerRatio    = 0.0f;  // 0.0 = ล้อฝั่งในหยุดหมุน (วงเลี้ยวแคบแบบเดิม), >0 = ล้อในหมุนตามสัดส่วน

unsigned long delayALL = 0;    // หน่วงเวลาหลังคำสั่งเดินด้วยเวลา (ms)

// --- 1.3 ค่าชดเชยความเร็วมอเตอร์และระยะทาง ---
int motorTrim = -2;               // จูนความเร็วมอเตอร์ค่าเดียว: ลบ = ลดซ้าย, บวก = เพิ่มขวา

// --- 1.4 เวลาหน่วงเซอร์โวตอนปล่อย (ใช้ร่วมกันทั้ง DropF และ DropB) ---
int servoDropDelayMs = 200;    // หน่วยมิลลิวินาที (ms) (delayDrop 100 + 100 ms)

// ============================================================================
// [กลุ่มที่ 2] ค่าที่คาลิเบรตจากโหมด Assembly (เก็บใน Flash — ป้องกันการเขียนทับทุกรอบ)
//    - false (ค่าเริ่มต้น): โหลดค่าที่คาลิเบรตไว้ในหุ่น (Flash) มาใช้งาน ไม่เขียนทับเมื่ออัปโหลดโค้ดใหม่
//    - true : บังคับเขียนค่าด้านล่างนี้ทับลง Flash (ใช้เฉพาะกรณีจอเสีย/อ่านค่าผ่านจอไม่ได้)
// ============================================================================
bool forceOverwriteFlashFromCode = false;

// --- 2.1 ค่าเดินตามระยะ Encoder ---
float ticksPerCm   = 143.12f;  // Encoder Ticks ต่อ 1 ซม. (Full-Quad ล้อ 3.3 ซม.: 1300 / (PI * 3.3))
int   distTuneMm   = 10;        // ค่าจูนชดเชยระยะเดินมอเตอร์ (หน่วย mm ต่อการเดิน 30 ซม.)
int   calRun30cmMs = 431;     // เวลาที่หุ่นเดินจริง 30.0 ซม. ที่ความเร็ว 45 (หน่วย ms จากโหมด TEST 30 CM)

// --- 2.2 ค่าคาลิเบรตเซนเซอร์เส้น 4 ตัว (0=ซ้ายบน, 1=ขวาบน, 2=ขวาล่าง, 3=ซ้ายล่าง) ---
int senMin[4]    = { 200, 200, 200, 200 };
int senMax[4]    = { 800, 800, 800, 800 };
int senThresh[4] = { 320, 320, 320, 320 };
int line_value[4] = { 100, 100, 100, 100 };
int sensorDifference = 20;

// --- 2.3 มุมเซอร์โวหน้า (S0) และหลัง (S1) ---
int frontLock = 72;
int frontDrop = 145;
int backLock  = 79;
int backDrop  = 154;

// --- 2.4 ตั้งค่าการแสดงคำสั่งและเสียง Beep ตอนรัน (ตั้งค่าในหุ่นผ่านโหมด Assembly) ---
bool showCmdOnRun = true;
bool beepOnCmd    = true;

float estimateCalibratedSpeedCmPerSec(int speed) {
    int spd = abs(speed);
    if (spd < 15) spd = 15;
    float refCmPerSec = 30000.0f / (float)max(150, calRun30cmMs); // cm/s at speed 45
    return refCmPerSec * ((float)spd / 45.0f);
}

unsigned long estimateCalibratedMoveTimeMs(float distanceCm, int speed) {
    if (distanceCm <= 0.0f) return 0UL;
    float tuneScale = constrain((300.0f + (float)distTuneMm) / 300.0f, 0.50f, 1.50f);
    float effCm = fabsf(distanceCm) * tuneScale;
    float cmPerSec = max(1.0f, estimateCalibratedSpeedCmPerSec(speed));
    return (unsigned long)roundf((effCm / cmPerSec) * 1000.0f);
}

void configPrintCalibrationJson() {
    float refCmPs = 30000.0f / (float)max(150, calRun30cmMs);
    Serial.println();
    Serial.println("===== KT ROBOT TUNED PARAMETERS =====");
    Serial.printf("float threshold_spinDegree  = %.2ff;\n", threshold_spinDegree);
    Serial.printf("float spinLeftOffsetDeg     = %.2ff;\n", spinLeftOffsetDeg);
    Serial.printf("float smallAngle_threshold  = %.2ff;\n", smallAngle_threshold);
    Serial.printf("float smallAngle_turnDegree = %.2ff;\n", smallAngle_turnDegree);
    Serial.printf("float turnRightOffsetDeg    = %.2ff;\n", turnRightOffsetDeg);
    Serial.printf("float spinKp = %.2ff; float spinKd = %.2ff; int spinMinSpeed = %d; int spinMaxSpeed = %d;\n",
                  spinKp, spinKd, spinMinSpeed, spinMaxSpeed);
    Serial.printf("float turnFrontKp = %.2ff; float turnFrontKd = %.2ff; int turnFrontMinSpeed = %d; int turnFrontMaxSpeed = %d;\n",
                  turnFrontKp, turnFrontKd, turnFrontMinSpeed, turnFrontMaxSpeed);
    Serial.printf("float turnBackKp  = %.2ff; float turnBackKd  = %.2ff; int turnBackMinSpeed  = %d; int turnBackMaxSpeed  = %d;\n",
                  turnBackKp, turnBackKd, turnBackMinSpeed, turnBackMaxSpeed);
    Serial.printf("float fwdKp = %.2ff; float fwdKd = %.2ff; float bwdKp = %.2ff; float bwdKd = %.2ff; float kp_turn = %.2ff; float kd_turn = %.2ff;\n",
                  fwdKp, fwdKd, bwdKp, bwdKd, kp_turn, kd_turn);
    Serial.printf("float ticksPerCm = %.2ff; int distTuneMm = %d; int motorTrim = %d; int calRun30cmMs = %d;\n",
                  ticksPerCm, distTuneMm, motorTrim, calRun30cmMs);
    Serial.printf("int senMin[4]    = { %d, %d, %d, %d };\n", senMin[0], senMin[1], senMin[2], senMin[3]);
    Serial.printf("int senMax[4]    = { %d, %d, %d, %d };\n", senMax[0], senMax[1], senMax[2], senMax[3]);
    Serial.printf("int senThresh[4] = { %d, %d, %d, %d };\n", senThresh[0], senThresh[1], senThresh[2], senThresh[3]);
    Serial.printf("int frontLock = %d; int frontDrop = %d; int backLock = %d; int backDrop = %d;\n",
                  frontLock, frontDrop, backLock, backDrop);
    Serial.println("=====================================");
    Serial.printf(
        "KT_CAL:{\"tpcm\":%.2f,\"distmm\":%d,\"trim\":%d,\"calms\":%d,\"cmps\":%.2f,"
        "\"smin\":[%d,%d,%d,%d],\"smax\":[%d,%d,%d,%d],\"sthr\":[%d,%d,%d,%d],"
        "\"flock\":%d,\"fdrop\":%d,\"block\":%d,\"bdrop\":%d,\"showcmd\":%s,\"beepcmd\":%s,"
        "\"spinkp\":%.2f,\"spinkd\":%.2f,\"tfkp\":%.2f,\"tfkd\":%.2f,"
        "\"tbkp\":%.2f,\"tbkd\":%.2f,\"tspin\":%.2f,\"slofs\":%.2f,\"tturn\":%.2f,\"trofs\":%.2f,\"sathr\":%.2f,"
        "\"smaxs\":%d,\"tfmax\":%d,\"tbmax\":%d}\n",
        ticksPerCm, distTuneMm, motorTrim, calRun30cmMs, refCmPs,
        senMin[0], senMin[1], senMin[2], senMin[3],
        senMax[0], senMax[1], senMax[2], senMax[3],
        senThresh[0], senThresh[1], senThresh[2], senThresh[3],
        frontLock, frontDrop, backLock, backDrop,
        showCmdOnRun ? "true" : "false",
        beepOnCmd ? "true" : "false",
        spinKp, spinKd, turnFrontKp, turnFrontKd,
        turnBackKp, turnBackKd, threshold_spinDegree, spinLeftOffsetDeg, smallAngle_turnDegree, turnRightOffsetDeg, smallAngle_threshold,
        spinMaxSpeed, turnFrontMaxSpeed, turnBackMaxSpeed
    );
}

void serviceSerialCalibrationCommand() {
    static char s_cmdBuf[32];
    static uint8_t s_cmdLen = 0;
    while (Serial.available() > 0) {
        char ch = (char)Serial.read();
        if (ch == '\r' || ch == '\n') {
            s_cmdBuf[s_cmdLen] = '\0';
            if (s_cmdLen > 0 && (strcmp(s_cmdBuf, "GET_CAL") == 0 || strcmp(s_cmdBuf, "?") == 0)) {
                configPrintCalibrationJson();
            }
            s_cmdLen = 0;
        } else if (s_cmdLen < sizeof(s_cmdBuf) - 1) {
            s_cmdBuf[s_cmdLen++] = ch;
        }
    }
}

void configLoad() {
    // หากเปิดโหมดบังคับเขียนทับ ให้เขียนค่ากลุ่มที่ 2 ลง Flash ทันที
    if (forceOverwriteFlashFromCode) {
        configSave();
        return;
    }

    // โหลดค่ากลุ่มที่ 2 จาก Flash (หากยังไม่เคยบันทึกใน Flash จะคงค่าเริ่มต้นไว้)
    cfgPrefs.begin("kt_robot", true);
    for (int i = 0; i < 4; i++) {
        char kMin[12], kMax[12], kThr[12];
        snprintf(kMin, sizeof(kMin), "smin%d", i);
        snprintf(kMax, sizeof(kMax), "smax%d", i);
        snprintf(kThr, sizeof(kThr), "sthr%d", i);

        senMin[i]    = cfgPrefs.getInt(kMin, senMin[i]);
        senMax[i]    = cfgPrefs.getInt(kMax, senMax[i]);
        senThresh[i] = cfgPrefs.getInt(kThr, senThresh[i]);
        if (senMax[i] > senMin[i]) {
            senThresh[i] = senMin[i] + ((senMax[i] - senMin[i]) * 20) / 100;
        }
    }

    frontLock  = cfgPrefs.getInt("flock", frontLock);
    frontDrop  = cfgPrefs.getInt("fdrop", frontDrop);
    backLock   = cfgPrefs.getInt("block", backLock);
    backDrop   = cfgPrefs.getInt("bdrop", backDrop);

    ticksPerCm   = cfgPrefs.getFloat("tpcm", ticksPerCm);
    if (ticksPerCm < 80.0f) {
        ticksPerCm = 125.40f;
    }
    distTuneMm   = cfgPrefs.getInt("distmm", distTuneMm);
    calRun30cmMs = cfgPrefs.getInt("calms", calRun30cmMs);
    motorTrim    = cfgPrefs.getInt("mtrim", motorTrim);

    showCmdOnRun = cfgPrefs.getBool("showcmd", showCmdOnRun);
    beepOnCmd    = cfgPrefs.getBool("beepcmd", beepOnCmd);

    int tuneVer = cfgPrefs.getInt("tver", 0);
    threshold_spinDegree  = constrain(cfgPrefs.getFloat("tspin", threshold_spinDegree), 1.5f, 6.0f);
    spinLeftOffsetDeg     = constrain(cfgPrefs.getFloat("slofs", spinLeftOffsetDeg), -3.5f, 3.5f);
    smallAngle_threshold  = constrain(cfgPrefs.getFloat("sathr", smallAngle_threshold), 35.0f, 80.0f);
    spinKp      = constrain(cfgPrefs.getFloat("spinkp", spinKp), 0.55f, 1.80f);
    spinKd      = constrain(cfgPrefs.getFloat("spinkd", spinKd), 0.25f, 2.00f);
    spinMaxSpeed = constrain(cfgPrefs.getInt("smaxs", spinMaxSpeed), 40, 100);
    if (tuneVer >= 6) {
        smallAngle_turnDegree = constrain(cfgPrefs.getFloat("tturn", smallAngle_turnDegree), 1.5f, 30.0f);
        turnRightOffsetDeg    = constrain(cfgPrefs.getFloat("trofs", turnRightOffsetDeg), -10.0f, 10.0f);
        turnFrontKp = constrain(cfgPrefs.getFloat("tfkp", turnFrontKp), 0.85f, 2.50f);
        turnFrontKd = constrain(cfgPrefs.getFloat("tfkd", turnFrontKd), 0.40f, 2.00f);
        turnBackKp  = constrain(cfgPrefs.getFloat("tbkp", turnBackKp),  0.85f, 2.50f);
        turnBackKd  = constrain(cfgPrefs.getFloat("tbkd", turnBackKd),  0.40f, 2.00f);
        turnFrontMaxSpeed = constrain(cfgPrefs.getInt("tfmax", turnFrontMaxSpeed), 70, 100);
        turnBackMaxSpeed  = constrain(cfgPrefs.getInt("tbmax", turnBackMaxSpeed),  70, 100);
    }

    cfgPrefs.end();
    configPrintCalibrationJson();
}

void configSave() {
    cfgPrefs.begin("kt_robot", false);
    for (int i = 0; i < 4; i++) {
        char kMin[12], kMax[12], kThr[12];
        snprintf(kMin, sizeof(kMin), "smin%d", i);
        snprintf(kMax, sizeof(kMax), "smax%d", i);
        snprintf(kThr, sizeof(kThr), "sthr%d", i);

        cfgPrefs.putInt(kMin, senMin[i]);
        cfgPrefs.putInt(kMax, senMax[i]);
        cfgPrefs.putInt(kThr, senThresh[i]);
    }

    cfgPrefs.putInt("flock", frontLock);
    cfgPrefs.putInt("fdrop", frontDrop);
    cfgPrefs.putInt("block", backLock);
    cfgPrefs.putInt("bdrop", backDrop);

    cfgPrefs.putFloat("tpcm",   ticksPerCm);
    cfgPrefs.putInt("distmm",   distTuneMm);
    cfgPrefs.putInt("calms",    calRun30cmMs);
    cfgPrefs.putInt("mtrim",    motorTrim);

    cfgPrefs.putBool("showcmd", showCmdOnRun);
    cfgPrefs.putBool("beepcmd", beepOnCmd);

    cfgPrefs.putFloat("tspin",  threshold_spinDegree);
    cfgPrefs.putFloat("slofs",  spinLeftOffsetDeg);
    cfgPrefs.putFloat("tturn",  smallAngle_turnDegree);
    cfgPrefs.putFloat("trofs",  turnRightOffsetDeg);
    cfgPrefs.putFloat("sathr",  smallAngle_threshold);
    cfgPrefs.putFloat("spinkp", spinKp);
    cfgPrefs.putFloat("spinkd", spinKd);
    cfgPrefs.putFloat("tfkp",   turnFrontKp);
    cfgPrefs.putFloat("tfkd",   turnFrontKd);
    cfgPrefs.putFloat("tbkp",   turnBackKp);
    cfgPrefs.putFloat("tbkd",   turnBackKd);
    cfgPrefs.putInt("smaxs",    spinMaxSpeed);
    cfgPrefs.putInt("tfmax",    turnFrontMaxSpeed);
    cfgPrefs.putInt("tbmax",    turnBackMaxSpeed);
    cfgPrefs.putInt("tver",     6);

    cfgPrefs.end();
    configPrintCalibrationJson();
}
