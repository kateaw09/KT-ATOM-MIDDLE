// ============================================================================
// Config.ino — ศูนย์รวมการตั้งค่าโหมด, PID, Velocity PID+FF, PoseEKF,
//              Pure Pursuit, เซนเซอร์, เซอร์โว, ระยะทาง และการบันทึก Flash
// ============================================================================

Preferences cfgPrefs;

// ============================================================================
// [กลุ่มที่ 1] ค่าที่แก้ไขแล้วอัปโหลดลงบอร์ดใช้งานได้ทันทีทุกรอบ (ไม่ถูก Flash เขียนทับ)
// ============================================================================

// --- 1.1 ตั้งค่าโหมดการทำงานหลัก ---
bool enableMultiMode = true;       // true = กด B เปลี่ยนโหมด 1-3, กด A รัน | false = กด A หรือ B รันทันที
int  currentRunMode  = 1;          // โหมดเริ่มต้น = 1 (มี 1, 2, 3)
bool useCodeMotionDefaults = true; // true = ใช้ค่าเริ่มต้นจาก Config.ino และล็อก Auto Tune

// --- 1.2 ค่า PID และพารามิเตอร์การเคลื่อนที่ (FC-Only + FF/BB Time) ---
float fwdKp       = 1.2f;      // เดินหน้า: Kp
float fwdKd       = 15.0f;     // เดินหน้า: Kd

float bwdKp       = 1.2f;      // ถอยหลัง: Kp
float bwdKd       = 15.0f;     // ถอยหลัง: Kd

float kp_turn     = 1.50f;     // เดินตรง FC / BC / FC4 / BC4: Kp
float kd_turn     = 15.0f;     // เดินตรง FC / BC / FC4 / BC4: Kd

float Set_kp      = 2.0f;      // จัดแนวเข้าเส้น SetF / SetB: Kp
float Set_kd      = 15.0f;     // จัดแนวเข้าเส้น SetF / SetB: Kd

// พารามิเตอร์ Encoder (FC / BC)
int min_speed_enc      = 40;
int max_speed_enc      = 100;
unsigned long ramp_up  = 5;    // ระยะเร่ง (cm)
long ramp_down         = 5;    // ระยะชะลอ (cm)

int min_speed_enc_turn     = 40;
int max_speed_enc_turn     = 100;
unsigned long ramp_up_turn = 5;
long ramp_down_turn        = 5;

// พารามิเตอร์จับเวลา (FF / BB Time Move)
float kp_time          = 1.8f;
float kd_time          = 15.0f;
int   min_speed_time   = 20;
int   max_speed_time   = 100;
unsigned long ramp_up_ms   = 150;
unsigned long ramp_down_ms = 200;

float kp_time_turn          = 1.8f;
float kd_time_turn          = 15.0f;

// --- 1.2b ควบคุมระยะคงที่ทุกความเร็ว 1-100 (Speed-Invariant Motion Control) ---
bool  enableSpeedInvariantDist = true;   // true = คุมระยะให้เท่ากันทุกความเร็ว 1-100
float moveAccelRate            = 260.0f; // อัตราเร่งลดล้อฟรีตอนออกตัว (speed^2/cm)
float moveDecelRate            = 260.0f; // อัตราหน่วงชะลอเข้าเป้า (speed^2/cm)
int   moveArriveSpeed          = 15;     // ความเร็วตอนเข้าเป้าก่อนหยุด (1-40)
int   motorMinMoveSpeed        = 12;     // ความเร็วขั้นต่ำที่มอเตอร์เริ่มขยับได้จริง (Anti-Stall)
bool  enableEndPositionTrim    = false;  // true = เติมระยะเดินหน้ากรณีหยุดขาด (ไม่ถอยหลัง)

// ค่าควบคุมการหมุนและเลี้ยว (SpinDegree / TrunDegreeFront / TrunDegreeBack)
float threshold_spinDegree  = 1.5f;    // เกณฑ์หยุดเข้าเป้า SpinDegree (องศา)
float spinLeftOffsetDeg     = 0.0f;    // ชดเชยองศา Spin (คงไว้เพื่อรองรับ IDE CONFIG_SCHEMA)
float smallAngle_threshold  = 30.0f;   // องศาที่เริ่มชะลอความเร็วต่ำก่อนหยุด SpinDegree
float smallAngle_turnDegree = 1.5f;    // เกณฑ์หยุดเข้าเป้า TrunDegreeFront / TrunDegreeBack (องศา)
float turnRightOffsetDeg    = 0.0f;    // ชดเชยองศา Turn (คงไว้เพื่อรองรับ IDE CONFIG_SCHEMA)

float spinKp      = 2.0f;      // SpinDegree: Kp
float spinKd      = 0.16f;     // SpinDegree: Kd (หน่วงตามความเร็วเชิงมุม deg/s)
int   spinMinSpeed = 24;       // SpinDegree: ความเร็วต่ำสุด
int   spinMaxSpeed = 100;      // SpinDegree: ความเร็วสูงสุด
unsigned long spinPostDelayMs = 25; // settle_time ของ SpinDegree (ms)

float turnFrontKp = 2.5f;      // TrunDegreeFront: Kp
float turnFrontKd = 0.16f;     // TrunDegreeFront: Kd (หน่วงตามความเร็วเชิงมุม deg/s)
int   turnFrontMinSpeed = 28;  // TrunDegreeFront: ความเร็วต่ำสุด
int   turnFrontMaxSpeed = 100; // TrunDegreeFront: ความเร็วสูงสุด

float turnBackKp  = 2.5f;      // TrunDegreeBack: Kp
float turnBackKd  = 0.16f;     // TrunDegreeBack: Kd (หน่วงตามความเร็วเชิงมุม deg/s)
int   turnBackMinSpeed  = 28;  // TrunDegreeBack: ความเร็วต่ำสุด
int   turnBackMaxSpeed  = 100; // TrunDegreeBack: ความเร็วสูงสุด
float turnInnerRatio    = 0.0f;

// พารามิเตอร์ชดเชยระยะเข้า-ออกโค้ง Swing Turn อัตโนมัติ (เมื่อเปิด enableTurnDistComp = true)
const float ROBOT_WHEELBASE_CM = 7.5f;
const float ROBOT_TRACK_CM     = 11.5f;
bool  enableTurnDistComp       = true;
float turnEntryCompCm          = 10.0f;
float turnExitRadiusCm         = 2.8f;   // ระยะหักหลังออกโค้ง Swing 90° ในคำสั่งถัดไป (ซม.)

unsigned long delayALL = 0;    // หน่วงเวลาหลังคำสั่งเดินด้วยเวลา (ms)

// ตัวแปรสถานะการเดินและเลี้ยว
int   motor_trim_forward  = 0;
int   motor_trim_backward = 0;
bool  turn                = false;
float current_degree      = 0.0f;
float current_degree_P    = 0.0f;

// พารามิเตอร์ตีโค้ง TT ('TR', 'TL', 'Tr', 'Tl')
int  tt90FastSpeed  = 100;
int  tt90SlowSpeed  = 15;
long tt90DistanceCm = 40;
int  tt45FastSpeed  = 80;
int  tt45SlowSpeed  = 15;
long tt45DistanceCm = 30;

// --- 1.3 ค่าชดเชยความเร็วมอเตอร์และระยะทาง ---
int motorTrim = -1;               // จูนลดความเร็วมอเตอร์: ค่าลบ = ลดฝั่งซ้าย, ค่าบวก = ลดฝั่งขวา (0 = ไม่ลด)
inline int getLeftMotorTrim()  { return (motorTrim < 0) ? motorTrim : 0; }
inline int getRightMotorTrim() { return (motorTrim > 0) ? -motorTrim : 0; }

// --- 1.4 เวลาหน่วงเซอร์โวตอนปล่อย (ใช้ร่วมกันทั้ง DropF และ DropB) ---
int servoDropDelayMs = 200;    // หน่วยมิลลิวินาที (ms)

// --- 1.5 ตารางตั้งค่าระยะเดินตามจำนวนช่อง 1-8 ช่อง + ค่าชดเชยรวม (Box Distance Calibration) ---
bool  enableBoxDistCal = true;    // true = เปิดใช้ตารางแปลงระยะ 1-8 ช่องอัตโนมัติ
float distOffsetCm     = -2.0f;   // ชดเชยระยะเดินตรงรวมทุกช่อง (+/- ซม., ปรับได้ -10 ถึง +10)
float boxTileCm        = 30.0f;   // ความยาวมาตรฐาน 1 ช่องสนาม (ซม.)
float box1Cm           = 30.0f;   // 1 ช่อง (สนาม  30 cm)
float box2Cm           = 60.0f;   // 2 ช่อง (สนาม  60 cm)
float box3Cm           = 90.0f;   // 3 ช่อง (สนาม  90 cm)
float box4Cm           = 120.0f;  // 4 ช่อง (สนาม 120 cm)
float box5Cm           = 150.0f;  // 5 ช่อง (สนาม 150 cm)
float box6Cm           = 180.0f;  // 6 ช่อง (สนาม 180 cm)
float box7Cm           = 210.0f;  // 7 ช่อง (สนาม 210 cm)
float box8Cm           = 240.0f;  // 8 ช่อง (สนาม 240 cm)

// --- 1.6 พารามิเตอร์ Kinematics, I2C, Velocity PID+FF, PoseEKF และ Pure Pursuit ---
float         effectiveTrackCm     = 11.5f;   // ความกว้างฐานล้อเสมือนจริงสำหรับ Skid-Steer 4 ล้อ (cm)
unsigned long motorI2cDedupMs      = 12;      // ช่วง Dedup I2C มอเตอร์ (ms) รองรับลูป 50-100 Hz

// Velocity PID + Feedforward (หน่วยเป้าหมาย cm/s)
float velKs            = 8.0f;    // ชดเชยแรงเสียดทานสถิต (Static Friction)
float velKv            = 0.83f;   // Feedforward Gain (คำนวณตั้งต้นจาก calRun30cmMs = 553)
float velKp            = 0.90f;   // Proportional Gain
float velKi            = 2.50f;   // Integral Gain
float velKd            = 0.02f;   // Derivative Gain
float velIntegralLimit = 25.0f;   // จำกัดเทอม Integral ในช่วง [-25, +25]
float velEmaAlpha      = 0.38f;   // ค่ากรอง EMA ของความเร็วล้อ

// PoseEKF (4-Wheel Odometry + IMU Yaw)
float ekfQPos          = 0.02f;   // Process Noise ตำแหน่ง (cm^2)
float ekfQHeadingBase  = 0.002f;  // Process Noise มุมขณะวิ่งตรง (rad^2)
float ekfQHeadingTurn  = 0.060f;  // Process Noise มุมขณะเลี้ยว/ไถล (rad^2)
float ekfRImuYaw       = 0.0015f; // Measurement Noise ของ IMU Yaw (rad^2)

// Pure Pursuit Path Control
float ppLookaheadMinCm    = 12.0f;  // ระยะมองล่วงหน้าต่ำสุด (cm, ช่วงจูน 10-14 cm)
float ppLookaheadMaxCm    = 28.0f;  // ระยะมองล่วงหน้าสูงสุด (cm)
float ppLookaheadGain     = 0.25f;  // สัดส่วนเพิ่ม Lookahead ตามความเร็ว (k_ld)
float ppMaxLatAccel       = 120.0f; // ความเร่งด้านข้างสูงสุดขณะเข้าโค้ง (cm/s^2)
float ppGoalToleranceCm   = 3.0f;   // รัศมีเข้าเป้าจุดสุดท้าย (cm)
float ppWaypointSpacingCm = 4.0f;   // ระยะแทรกจุด Waypoint (cm)

// ============================================================================
// [กลุ่มที่ 2] ค่าที่คาลิเบรตจากโหมด Assembly (เก็บใน Flash — ป้องกันการเขียนทับทุกรอบ)
// ============================================================================
bool forceOverwriteFlashFromCode = false;

// --- 2.1 ค่าเดินตามระยะ Encoder ---
const float TICKS_PER_CM_MIN     = 40.0f;
const float TICKS_PER_CM_MAX     = 600.0f;
const float CAL_TEST_DISTANCE_CM = 90.0f;
float ticksPerCm   = 153.53f; // Encoder Ticks ต่อ 1 ซม. (Full-Quad ล้อ 3.3 ซม.: 1300 / (PI * 3.3))
int   distTuneMm   = 0;       // ค่าจูนชดเชยระยะเดินมอเตอร์ (คงไว้เพื่อรองรับ IDE/Flash เดิม)
int   calRun30cmMs = 553;     // เวลาเทียบเท่าการเดิน 30.0 ซม. ที่ความเร็ว 45 (ms)

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

// --- 2.4 ตั้งค่าการแสดงคำสั่งและเสียง Beep ตอนรัน ---
bool showCmdOnRun = true;
bool beepOnCmd    = true;

// ============================================================================
// [ระบบจัดการค่าเริ่มต้นจากโค้ด (Code Motion Defaults)]
// ============================================================================
static bool s_codeDefaultsCalledInSetup = false;
static bool s_codeDefaultsSnapshotSaved = false;

struct CodeMotionDefaultsSnapshot {
    float fwdKp, fwdKd, bwdKp, bwdKd, kp_turn, kd_turn, Set_kp, Set_kd;
    float kp_time, kd_time, kp_time_turn, kd_time_turn;
    float threshold_spinDegree, spinLeftOffsetDeg, smallAngle_threshold;
    float smallAngle_turnDegree, turnRightOffsetDeg;
    float spinKp, spinKd;
    int   spinMinSpeed, spinMaxSpeed;
    float turnFrontKp, turnFrontKd;
    int   turnFrontMinSpeed, turnFrontMaxSpeed;
    float turnBackKp, turnBackKd;
    int   turnBackMinSpeed, turnBackMaxSpeed;
};

static CodeMotionDefaultsSnapshot s_codeMotionSnapshot;

static void captureCodeMotionDefaults() {
    if (s_codeDefaultsSnapshotSaved) return;
    s_codeMotionSnapshot.fwdKp                 = fwdKp;
    s_codeMotionSnapshot.fwdKd                 = fwdKd;
    s_codeMotionSnapshot.bwdKp                 = bwdKp;
    s_codeMotionSnapshot.bwdKd                 = bwdKd;
    s_codeMotionSnapshot.kp_turn               = kp_turn;
    s_codeMotionSnapshot.kd_turn               = kd_turn;
    s_codeMotionSnapshot.Set_kp                = Set_kp;
    s_codeMotionSnapshot.Set_kd                = Set_kd;
    s_codeMotionSnapshot.kp_time               = kp_time;
    s_codeMotionSnapshot.kd_time               = kd_time;
    s_codeMotionSnapshot.kp_time_turn          = kp_time_turn;
    s_codeMotionSnapshot.kd_time_turn          = kd_time_turn;
    s_codeMotionSnapshot.threshold_spinDegree  = threshold_spinDegree;
    s_codeMotionSnapshot.spinLeftOffsetDeg     = spinLeftOffsetDeg;
    s_codeMotionSnapshot.smallAngle_threshold  = smallAngle_threshold;
    s_codeMotionSnapshot.smallAngle_turnDegree = smallAngle_turnDegree;
    s_codeMotionSnapshot.turnRightOffsetDeg    = turnRightOffsetDeg;
    s_codeMotionSnapshot.spinKp                = spinKp;
    s_codeMotionSnapshot.spinKd                = spinKd;
    s_codeMotionSnapshot.spinMinSpeed          = spinMinSpeed;
    s_codeMotionSnapshot.spinMaxSpeed          = spinMaxSpeed;
    s_codeMotionSnapshot.turnFrontKp           = turnFrontKp;
    s_codeMotionSnapshot.turnFrontKd           = turnFrontKd;
    s_codeMotionSnapshot.turnFrontMinSpeed     = turnFrontMinSpeed;
    s_codeMotionSnapshot.turnFrontMaxSpeed     = turnFrontMaxSpeed;
    s_codeMotionSnapshot.turnBackKp            = turnBackKp;
    s_codeMotionSnapshot.turnBackKd            = turnBackKd;
    s_codeMotionSnapshot.turnBackMinSpeed      = turnBackMinSpeed;
    s_codeMotionSnapshot.turnBackMaxSpeed      = turnBackMaxSpeed;
    s_codeDefaultsSnapshotSaved = true;
}

static void restoreCodeMotionDefaults() {
    if (!s_codeDefaultsSnapshotSaved) return;
    fwdKp                 = s_codeMotionSnapshot.fwdKp;
    fwdKd                 = s_codeMotionSnapshot.fwdKd;
    bwdKp                 = s_codeMotionSnapshot.bwdKp;
    bwdKd                 = s_codeMotionSnapshot.bwdKd;
    kp_turn               = s_codeMotionSnapshot.kp_turn;
    kd_turn               = s_codeMotionSnapshot.kd_turn;
    Set_kp                = s_codeMotionSnapshot.Set_kp;
    Set_kd                = s_codeMotionSnapshot.Set_kd;
    kp_time               = s_codeMotionSnapshot.kp_time;
    kd_time               = s_codeMotionSnapshot.kd_time;
    kp_time_turn          = s_codeMotionSnapshot.kp_time_turn;
    kd_time_turn          = s_codeMotionSnapshot.kd_time_turn;
    threshold_spinDegree  = s_codeMotionSnapshot.threshold_spinDegree;
    spinLeftOffsetDeg     = s_codeMotionSnapshot.spinLeftOffsetDeg;
    smallAngle_threshold  = s_codeMotionSnapshot.smallAngle_threshold;
    smallAngle_turnDegree = s_codeMotionSnapshot.smallAngle_turnDegree;
    turnRightOffsetDeg    = s_codeMotionSnapshot.turnRightOffsetDeg;
    spinKp                = s_codeMotionSnapshot.spinKp;
    spinKd                = s_codeMotionSnapshot.spinKd;
    spinMinSpeed          = s_codeMotionSnapshot.spinMinSpeed;
    spinMaxSpeed          = s_codeMotionSnapshot.spinMaxSpeed;
    turnFrontKp           = s_codeMotionSnapshot.turnFrontKp;
    turnFrontKd           = s_codeMotionSnapshot.turnFrontKd;
    turnFrontMinSpeed     = s_codeMotionSnapshot.turnFrontMinSpeed;
    turnFrontMaxSpeed     = s_codeMotionSnapshot.turnFrontMaxSpeed;
    turnBackKp            = s_codeMotionSnapshot.turnBackKp;
    turnBackKd            = s_codeMotionSnapshot.turnBackKd;
    turnBackMinSpeed      = s_codeMotionSnapshot.turnBackMinSpeed;
    turnBackMaxSpeed      = s_codeMotionSnapshot.turnBackMaxSpeed;
}

void enableCodeMotionDefaults() {
    captureCodeMotionDefaults();
    s_codeDefaultsCalledInSetup = true;
    useCodeMotionDefaults = true;
}

static void loadSpinTurnFromFlash(Preferences &prefsObj) {
    int tuneVer = prefsObj.getInt("tver", 0);
    if (tuneVer < 8) return;

    threshold_spinDegree  = constrain(prefsObj.getFloat("tspin", threshold_spinDegree), 0.5f, 45.0f);
    spinLeftOffsetDeg     = constrain(prefsObj.getFloat("slofs", spinLeftOffsetDeg), -10.0f, 10.0f);
    smallAngle_threshold  = constrain(prefsObj.getFloat("sathr", smallAngle_threshold), 15.0f, 85.0f);
    spinKp                = constrain(prefsObj.getFloat("spinkp", spinKp), 0.50f, 3.00f);
    spinKd                = constrain(prefsObj.getFloat("spinkd", spinKd), 0.0f, 2.50f);
    spinMaxSpeed          = constrain(prefsObj.getInt("smaxs", spinMaxSpeed), 40, 100);

    smallAngle_turnDegree = constrain(prefsObj.getFloat("tturn", smallAngle_turnDegree), 0.5f, 45.0f);
    turnRightOffsetDeg    = constrain(prefsObj.getFloat("trofs", turnRightOffsetDeg), -10.0f, 10.0f);
    turnFrontKp           = constrain(prefsObj.getFloat("tfkp", turnFrontKp), 0.50f, 3.00f);
    turnFrontKd           = constrain(prefsObj.getFloat("tfkd", turnFrontKd), 0.0f, 2.50f);
    turnFrontMaxSpeed     = constrain(prefsObj.getInt("tfmax", turnFrontMaxSpeed), 40, 100);
    turnBackKp            = constrain(prefsObj.getFloat("tbkp", turnBackKp), 0.50f, 3.00f);
    turnBackKd            = constrain(prefsObj.getFloat("tbkd", turnBackKd), 0.0f, 2.50f);
    turnBackMaxSpeed      = constrain(prefsObj.getInt("tbmax", turnBackMaxSpeed), 40, 100);
}

float estimateCalibratedSpeedCmPerSec(int speed) {
    int spd = abs(speed);
    if (spd < 1) spd = 1;
    float refCmPerSec = 30000.0f / (float)max(150, calRun30cmMs);
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
    Serial.printf("bool useCodeMotionDefaults = %s;\n", useCodeMotionDefaults ? "true" : "false");
    Serial.printf("float threshold_spinDegree  = %.2ff; float smallAngle_threshold = %.2ff; float smallAngle_turnDegree = %.2ff;\n",
                  threshold_spinDegree, smallAngle_threshold, smallAngle_turnDegree);
    Serial.printf("float spinKp = %.2ff; float spinKd = %.2ff; int spinMinSpeed = %d; int spinMaxSpeed = %d;\n",
                  spinKp, spinKd, spinMinSpeed, spinMaxSpeed);
    Serial.printf("float turnFrontKp = %.2ff; float turnFrontKd = %.2ff; int turnFrontMinSpeed = %d; int turnFrontMaxSpeed = %d;\n",
                  turnFrontKp, turnFrontKd, turnFrontMinSpeed, turnFrontMaxSpeed);
    Serial.printf("float turnBackKp  = %.2ff; float turnBackKd  = %.2ff; int turnBackMinSpeed  = %d; int turnBackMaxSpeed  = %d;\n",
                  turnBackKp, turnBackKd, turnBackMinSpeed, turnBackMaxSpeed);
    Serial.printf("float fwdKp = %.2ff; float fwdKd = %.2ff; float bwdKp = %.2ff; float bwdKd = %.2ff; float kp_turn = %.2ff; float kd_turn = %.2ff;\n",
                  fwdKp, fwdKd, bwdKp, bwdKd, kp_turn, kd_turn);
    Serial.printf("float ticksPerCm = %.2ff; int distTuneMm = %d; int motorTrim = %d; int calRun30cmMs = %d; float effectiveTrackCm = %.2ff;\n",
                  ticksPerCm, distTuneMm, motorTrim, calRun30cmMs, effectiveTrackCm);
    Serial.printf("VelocityPID+FF: Ks=%.2ff Kv=%.2ff Kp=%.2ff Ki=%.2ff Kd=%.3ff Ilim=%.1ff Alpha=%.2ff Dedup=%lu ms\n",
                  velKs, velKv, velKp, velKi, velKd, velIntegralLimit, velEmaAlpha, motorI2cDedupMs);
    Serial.printf("PoseEKF: Qpos=%.4ff QthBase=%.4ff QthTurn=%.4ff RimYaw=%.4ff\n",
                  ekfQPos, ekfQHeadingBase, ekfQHeadingTurn, ekfRImuYaw);
    Serial.printf("PurePursuit: Ld=[%.1f..%.1f]cm Gain=%.2f MaxLatAcc=%.1f Tol=%.1f Spacing=%.1f\n",
                  ppLookaheadMinCm, ppLookaheadMaxCm, ppLookaheadGain, ppMaxLatAccel, ppGoalToleranceCm, ppWaypointSpacingCm);
    Serial.printf("int senMin[4]    = { %d, %d, %d, %d };\n", senMin[0], senMin[1], senMin[2], senMin[3]);
    Serial.printf("int senMax[4]    = { %d, %d, %d, %d };\n", senMax[0], senMax[1], senMax[2], senMax[3]);
    Serial.printf("int senThresh[4] = { %d, %d, %d, %d };\n", senThresh[0], senThresh[1], senThresh[2], senThresh[3]);
    Serial.printf("int frontLock = %d; int frontDrop = %d; int backLock = %d; int backDrop = %d;\n",
                  frontLock, frontDrop, backLock, backDrop);
    Serial.println("=====================================");
    Serial.printf(
        "KT_CAL:{\"cdef\":%s,\"tpcm\":%.2f,\"distmm\":%d,\"trim\":%d,\"calms\":%d,\"cmps\":%.2f,"
        "\"smin\":[%d,%d,%d,%d],\"smax\":[%d,%d,%d,%d],\"sthr\":[%d,%d,%d,%d],"
        "\"flock\":%d,\"fdrop\":%d,\"block\":%d,\"bdrop\":%d,\"showcmd\":%s,\"beepcmd\":%s,"
        "\"spinkp\":%.2f,\"spinkd\":%.2f,\"tfkp\":%.2f,\"tfkd\":%.2f,"
        "\"tbkp\":%.2f,\"tbkd\":%.2f,\"tspin\":%.2f,\"slofs\":%.2f,\"tturn\":%.2f,\"trofs\":%.2f,\"sathr\":%.2f,"
        "\"smaxs\":%d,\"tfmax\":%d,\"tbmax\":%d}\n",
        useCodeMotionDefaults ? "true" : "false",
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
    captureCodeMotionDefaults();

    if (forceOverwriteFlashFromCode) {
        useCodeMotionDefaults = s_codeDefaultsCalledInSetup;
        configSave();
        return;
    }

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

    float defaultTpcm = ticksPerCm;
    float loadedTpcm  = cfgPrefs.getFloat("tpcm", defaultTpcm);
    if (!isfinite(loadedTpcm) || loadedTpcm < TICKS_PER_CM_MIN || loadedTpcm > TICKS_PER_CM_MAX) {
        loadedTpcm = defaultTpcm;
    }
    ticksPerCm   = loadedTpcm;
    distTuneMm   = cfgPrefs.getInt("distmm", distTuneMm);
    calRun30cmMs = cfgPrefs.getInt("calms", calRun30cmMs);
    motorTrim    = cfgPrefs.getInt("mtrim", motorTrim);

    showCmdOnRun = cfgPrefs.getBool("showcmd", showCmdOnRun);
    beepOnCmd    = cfgPrefs.getBool("beepcmd", beepOnCmd);

    bool hasSetupKey = cfgPrefs.isKey("cdef_s");
    bool lastSetupFlag = hasSetupKey ? cfgPrefs.getBool("cdef_s", s_codeDefaultsCalledInSetup)
                                     : s_codeDefaultsCalledInSetup;
    bool setupFlagChanged = (!hasSetupKey) || (lastSetupFlag != s_codeDefaultsCalledInSetup);
    if (setupFlagChanged) {
        useCodeMotionDefaults = s_codeDefaultsCalledInSetup;
    } else {
        useCodeMotionDefaults = cfgPrefs.getBool("cdef", s_codeDefaultsCalledInSetup);
    }
    if (!useCodeMotionDefaults) {
        loadSpinTurnFromFlash(cfgPrefs);
    }
    cfgPrefs.end();

    if (setupFlagChanged) {
        if (cfgPrefs.begin("kt_robot", false)) {
            cfgPrefs.putBool("cdef_s", s_codeDefaultsCalledInSetup);
            cfgPrefs.putBool("cdef",   useCodeMotionDefaults);
            cfgPrefs.end();
        }
    }

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
    cfgPrefs.putBool("cdef_s",  s_codeDefaultsCalledInSetup);
    cfgPrefs.putBool("cdef",    useCodeMotionDefaults);

    if (!useCodeMotionDefaults || forceOverwriteFlashFromCode) {
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
        cfgPrefs.putInt("tver",     8);
    }

    cfgPrefs.end();
    configPrintCalibrationJson();
}

void configSetCodeMotionDefaults(bool enabled) {
    captureCodeMotionDefaults();
    useCodeMotionDefaults = enabled;
    if (enabled) {
        restoreCodeMotionDefaults();
    } else {
        if (cfgPrefs.begin("kt_robot", true)) {
            loadSpinTurnFromFlash(cfgPrefs);
            cfgPrefs.end();
        }
    }
    if (cfgPrefs.begin("kt_robot", false)) {
        cfgPrefs.putBool("cdef_s", s_codeDefaultsCalledInSetup);
        cfgPrefs.putBool("cdef",   useCodeMotionDefaults);
        cfgPrefs.end();
    }
    configPrintCalibrationJson();
}

bool configSaveEncoderCalibration() {
    if (!isfinite(ticksPerCm)) {
        ticksPerCm = 143.12f;
    }
    ticksPerCm = constrain(ticksPerCm, TICKS_PER_CM_MIN, TICKS_PER_CM_MAX);

    if (!cfgPrefs.begin("kt_robot", false)) {
        return false;
    }
    size_t w1 = cfgPrefs.putFloat("tpcm", ticksPerCm);
    size_t w2 = cfgPrefs.putInt("distmm", distTuneMm);
    size_t w3 = cfgPrefs.putInt("calms", calRun30cmMs);
    float verifyTpcm = cfgPrefs.getFloat("tpcm", -1.0f);
    cfgPrefs.end();

    bool ok = (w1 > 0 && w2 > 0 && w3 > 0 &&
               isfinite(verifyTpcm) && fabsf(verifyTpcm - ticksPerCm) < 0.01f);
    configPrintCalibrationJson();
    return ok;
}

bool configSaveMotorTrim() {
    if (!cfgPrefs.begin("kt_robot", false)) {
        return false;
    }
    size_t w1 = cfgPrefs.putInt("mtrim", motorTrim);
    int verifyTrim = cfgPrefs.getInt("mtrim", 999);
    cfgPrefs.end();

    bool ok = (w1 > 0 && verifyTrim == motorTrim);
    configPrintCalibrationJson();
    return ok;
}
