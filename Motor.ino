// ============================================================================
// Motor.ino — ควบคุมมอเตอร์ (4-Wheel Speed Balance + Trim), Encoder และเซอร์โว DropF/B
// (ปรับปรุงตาม PT_MIDDLE_ENC_2026Endcode4 + แก้ Bug 4-Wheel Balance & Sensor Map)
// ============================================================================

const unsigned long wheel_speed_sample_ms = 50;
const float wheel_speed_kp         = 12.0f;
const float wheel_speed_ki         = 3.0f;
const float wheel_speed_trim_limit = 20.0f;

static long          s_wheelPrevTicks[4]    = { 0, 0, 0, 0 };
static unsigned long s_wheelLastSampleMs    = 0;
static float         s_wheelIntegral[2]     = { 0.0f, 0.0f };
static float         s_wheelCorrection[2]   = { 0.0f, 0.0f };
static int           s_wheelPrevSign[2]     = { 0, 0 };
static bool          s_wheelInitialized     = false;

static const byte PT_ENC_PINS_A[4] = { 14, 26, 39, 35 };
static const byte PT_ENC_PINS_B[4] = { 27, 25, 36, 34 };

static void ensureEncoderFullQuad(ESP32Encoder &enc, byte pinA, byte pinB) {
    if (enc.isAttached() &&
        (int)enc.aPinNumber == (int)pinA &&
        (int)enc.bPinNumber == (int)pinB &&
        enc.countsMode == 4) {
        return;
    }
    if (enc.isAttached()) {
        enc.detach();
    }
    ESP32Encoder::useInternalWeakPullResistors = puType::up;
    enc.attachFullQuad(pinA, pinB);
    enc.clearCount();
}

void setupEncodersPT() {
    ensureEncoderFullQuad(enc1, PT_ENC_PINS_A[0], PT_ENC_PINS_B[0]);
    ensureEncoderFullQuad(enc2, PT_ENC_PINS_A[1], PT_ENC_PINS_B[1]);
    ensureEncoderFullQuad(enc3, PT_ENC_PINS_A[2], PT_ENC_PINS_B[2]);
    ensureEncoderFullQuad(enc4, PT_ENC_PINS_A[3], PT_ENC_PINS_B[3]);
}

void readPtEncoders(long counts[4]) {
    counts[0] = -(long)enc1.getCount();
    counts[1] = -(long)enc2.getCount();
    counts[2] =  (long)enc3.getCount();
    counts[3] =  (long)enc4.getCount();
}

void resetMoveSpeedBalance() {
    s_wheelLastSampleMs  = 0;
    s_wheelIntegral[0]   = 0.0f;
    s_wheelIntegral[1]   = 0.0f;
    s_wheelCorrection[0] = 0.0f;
    s_wheelCorrection[1] = 0.0f;
    s_wheelPrevSign[0]   = 0;
    s_wheelPrevSign[1]   = 0;
    s_wheelInitialized   = false;
}

static inline int64_t abs64(int64_t v) {
    return (v < 0) ? -v : v;
}

static long calcEncoderDelta(long currentTicks, long prevTicks) {
    int64_t delta = (int64_t)currentTicks - (int64_t)prevTicks;
    return (long)abs64(delta);
}

static void updateWheelSpeedBalance(int leftCommand, int rightCommand) {
    unsigned long now = millis();
    long currentTicks[4];
    readPtEncoders(currentTicks);

    int sideCommands[2] = { leftCommand, rightCommand };

    if (!s_wheelInitialized) {
        for (byte i = 0; i < 4; i++) {
            s_wheelPrevTicks[i] = currentTicks[i];
        }
        for (byte side = 0; side < 2; side++) {
            s_wheelPrevSign[side] = (sideCommands[side] > 0) ? 1 : ((sideCommands[side] < 0) ? -1 : 0);
        }
        s_wheelLastSampleMs = now;
        s_wheelInitialized  = true;
        return;
    }

    // รีเซ็ตค่า Baseline และ Integral ทันทีเมื่อคำสั่งของฝั่งใดฝั่งหนึ่งกลับทิศหรือหยุด
    for (byte side = 0; side < 2; side++) {
        int sign = (sideCommands[side] > 0) ? 1 : ((sideCommands[side] < 0) ? -1 : 0);
        if (sign != s_wheelPrevSign[side]) {
            byte firstEnc  = side * 2;
            byte secondEnc = firstEnc + 1;
            s_wheelPrevTicks[firstEnc]  = currentTicks[firstEnc];
            s_wheelPrevTicks[secondEnc] = currentTicks[secondEnc];
            s_wheelIntegral[side]       = 0.0f;
            s_wheelCorrection[side]     = 0.0f;
            s_wheelPrevSign[side]       = sign;
        }
    }

    if (now - s_wheelLastSampleMs < wheel_speed_sample_ms) {
        return;
    }

    long tickDelta[4];
    for (byte i = 0; i < 4; i++) {
        tickDelta[i]        = calcEncoderDelta(currentTicks[i], s_wheelPrevTicks[i]);
        s_wheelPrevTicks[i] = currentTicks[i];
    }
    s_wheelLastSampleMs = now;

    for (byte side = 0; side < 2; side++) {
        byte firstEnc  = side * 2;
        byte secondEnc = firstEnc + 1;
        int64_t totalTicks = (int64_t)tickDelta[firstEnc] + (int64_t)tickDelta[secondEnc];

        if (sideCommands[side] == 0 || totalTicks == 0) {
            continue;
        }

        float speedError = (float)(tickDelta[firstEnc] - tickDelta[secondEnc]) / (float)totalTicks;
        s_wheelIntegral[side] = constrain(
            s_wheelIntegral[side] + wheel_speed_ki * speedError,
            -wheel_speed_trim_limit, wheel_speed_trim_limit
        );
        s_wheelCorrection[side] = constrain(
            wheel_speed_kp * speedError + s_wheelIntegral[side],
            -wheel_speed_trim_limit, wheel_speed_trim_limit
        );
    }
}

static int adjustMotorSpeed(int command, float adjustment) {
    if (command == 0) return 0;
    float magnitude = fabsf((float)command) + adjustment;
    if (magnitude < 0.0f) magnitude = 0.0f;
    return ((command > 0) ? 1 : -1) * (int)roundf(magnitude);
}

static int           s_safeLastMotors[4] = { 0, 0, 0, 0 };
static bool          s_safeMotorsSynced  = false;
static unsigned long s_safeLastI2cMs     = 0;

void safeMotorWrite4(int m1, int m2, int m3, int m4) {
    int c1 = constrain(m1, MOTOR_MIN_SPEED, MOTOR_MAX_SPEED);
    int c2 = constrain(m2, MOTOR_MIN_SPEED, MOTOR_MAX_SPEED);
    int c3 = constrain(m3, MOTOR_MIN_SPEED, MOTOR_MAX_SPEED);
    int c4 = constrain(m4, MOTOR_MIN_SPEED, MOTOR_MAX_SPEED);
    unsigned long now = millis();
    if (s_safeMotorsSynced &&
        c1 == s_safeLastMotors[0] && c2 == s_safeLastMotors[1] &&
        c3 == s_safeLastMotors[2] && c4 == s_safeLastMotors[3] &&
        (now - s_safeLastI2cMs) < 50UL) {
        return;
    }
    if (i2cMutex != nullptr) xSemaphoreTake(i2cMutex, portMAX_DELAY);
    motorWrite(c1, c2, c3, c4);
    if (i2cMutex != nullptr) xSemaphoreGive(i2cMutex);
    s_safeLastMotors[0] = c1; s_safeLastMotors[1] = c2;
    s_safeLastMotors[2] = c3; s_safeLastMotors[3] = c4;
    s_safeMotorsSynced  = true;
    s_safeLastI2cMs     = now;
}

void safeMotorWrite2(int leftSpeed, int rightSpeed) {
    safeMotorWrite4(leftSpeed, leftSpeed, rightSpeed, rightSpeed);
}

void safeMotorStop() {
    if (i2cMutex != nullptr) xSemaphoreTake(i2cMutex, portMAX_DELAY);
    motorStop();
    if (i2cMutex != nullptr) xSemaphoreGive(i2cMutex);
    s_safeLastMotors[0] = s_safeLastMotors[1] = 0;
    s_safeLastMotors[2] = s_safeLastMotors[3] = 0;
    s_safeMotorsSynced  = true;
    s_safeLastI2cMs     = millis();
}

float safeReadYaw() {
    if (imu_type == BNO055_ADDRESS_A || imu_type == BNO055_ADDRESS_B) {
        if (i2cMutex != nullptr) xSemaphoreTake(i2cMutex, portMAX_DELAY);
        float y = angleRead(YAW);
        if (i2cMutex != nullptr) xSemaphoreGive(i2cMutex);
        return y;
    }
    return angleRead(YAW);
}

// ============================================================================
// Encoder + IMU Complementary Heading Fusion (ลด Lag 10ms ของ IMU + กันส่ายตอนออกโค้ง)
// ============================================================================
static const float FUSED_EFF_TRACK_CM = 15.8f; // 4WD skid-steer effective track (track 11.5cm, wheelbase 7.5cm)

static float         s_fusedYaw          = 0.0f;
static float         s_fusedRateDeg100ms = 0.0f; // + = CW (ขวา), - = CCW (ซ้าย)
static float         s_fusedLastImuYaw   = 0.0f;
static long          s_fusedPrevEnc[4]   = { 0, 0, 0, 0 };
static unsigned long s_fusedLastMs       = 0;
static unsigned long s_fusedLastImuMs    = 0;
static bool          s_fusedInit         = false;

static float wrapFusedDeg180(float deg) {
    while (deg > 180.0f)  deg -= 360.0f;
    while (deg < -180.0f) deg += 360.0f;
    return deg;
}

void fusedHeadingOnEncoderReset() {
    s_fusedPrevEnc[0] = 0;
    s_fusedPrevEnc[1] = 0;
    s_fusedPrevEnc[2] = 0;
    s_fusedPrevEnc[3] = 0;
}

void fusedHeadingSyncToImu() {
    float imuYaw = safeReadYaw();
    readPtEncoders(s_fusedPrevEnc);
    s_fusedYaw          = imuYaw;
    s_fusedLastImuYaw   = imuYaw;
    s_fusedRateDeg100ms = 0.0f;
    s_fusedLastMs       = millis();
    s_fusedLastImuMs    = s_fusedLastMs;
    s_fusedInit         = true;
}

void fusedHeadingUpdate(float &outYaw, float &outRateDeg100ms) {
    unsigned long now = millis();
    float imuYaw = safeReadYaw();
    long curEnc[4];
    readPtEncoders(curEnc);

    if (!s_fusedInit || (now - s_fusedLastMs) > 250UL ||
        fabsf(wrapFusedDeg180(imuYaw - s_fusedLastImuYaw)) > 35.0f) {
        s_fusedYaw          = imuYaw;
        s_fusedLastImuYaw   = imuYaw;
        s_fusedRateDeg100ms = 0.0f;
        for (int i = 0; i < 4; i++) s_fusedPrevEnc[i] = curEnc[i];
        s_fusedLastMs       = now;
        s_fusedLastImuMs    = now;
        s_fusedInit         = true;
        outYaw = s_fusedYaw;
        outRateDeg100ms = 0.0f;
        return;
    }

    // 1) อัปเดตมุมทันทีจาก Encoder ทั้ง 4 ล้อ (ไม่มีดีเลย์ I2C)
    float dL = 0.5f * (float)((curEnc[0] - s_fusedPrevEnc[0]) + (curEnc[1] - s_fusedPrevEnc[1]));
    float dR = 0.5f * (float)((curEnc[2] - s_fusedPrevEnc[2]) + (curEnc[3] - s_fusedPrevEnc[3]));
    for (int i = 0; i < 4; i++) s_fusedPrevEnc[i] = curEnc[i];

    float tpcm = max(80.0f, ticksPerCm);
    float dYawEnc = ((dL - dR) / (tpcm * FUSED_EFF_TRACK_CM)) * 57.2957795f;
    if (fabsf(dYawEnc) > 25.0f) dYawEnc = 0.0f; // กันกระโดดถ้ามี reset จากภายนอก

    s_fusedYaw = wrapFusedDeg180(s_fusedYaw + dYawEnc);

    unsigned long dtMs = now - s_fusedLastMs;
    if (dtMs >= 2UL) {
        float encRate100ms = constrain(dYawEnc * (100.0f / (float)dtMs), -120.0f, 120.0f);
        s_fusedRateDeg100ms = 0.35f * encRate100ms + 0.65f * s_fusedRateDeg100ms;
        s_fusedLastMs = now;
    }

    // 2) ผสานแก้ Slip/Drift ด้วยค่าจริงจาก BNO085 ทุกเฟรมที่อัปเดต
    float dImu = wrapFusedDeg180(imuYaw - s_fusedLastImuYaw);
    unsigned long dtImu = now - s_fusedLastImuMs;
    if (fabsf(dImu) > 0.03f && dtImu >= 4UL) {
        float imuErr = wrapFusedDeg180(imuYaw - s_fusedYaw);
        s_fusedYaw = wrapFusedDeg180(s_fusedYaw + 0.60f * imuErr);
        float imuRate100ms = constrain(dImu * (100.0f / (float)dtImu), -120.0f, 120.0f);
        s_fusedRateDeg100ms = 0.55f * imuRate100ms + 0.45f * s_fusedRateDeg100ms;
        s_fusedLastImuYaw = imuYaw;
        s_fusedLastImuMs  = now;
    } else if (dtImu > 35UL) {
        float imuErr = wrapFusedDeg180(imuYaw - s_fusedYaw);
        s_fusedYaw = wrapFusedDeg180(s_fusedYaw + 0.30f * imuErr);
        if (fabsf(dYawEnc) < 0.05f) {
            s_fusedRateDeg100ms *= 0.60f;
            if (fabsf(s_fusedRateDeg100ms) < 0.8f) s_fusedRateDeg100ms = 0.0f;
        }
        s_fusedLastImuMs = now;
    }

    outYaw = s_fusedYaw;
    outRateDeg100ms = s_fusedRateDeg100ms;
}

void motorWriteSpeedBalanced(int leftCommand, int rightCommand) {
    updateWheelSpeedBalance(leftCommand, rightCommand);

    int motor1 = adjustMotorSpeed(leftCommand,  -s_wheelCorrection[0]); // M1: ซ้ายหน้า
    int motor2 = adjustMotorSpeed(leftCommand,   s_wheelCorrection[0]); // M2: ซ้ายหลัง
    int motor3 = adjustMotorSpeed(rightCommand, -s_wheelCorrection[1]); // M3: ขวาหน้า
    int motor4 = adjustMotorSpeed(rightCommand,  s_wheelCorrection[1]); // M4: ขวาหลัง

    safeMotorWrite4(motor1, motor2, motor3, motor4);
}

void driveMotors(int leftSpeed, int rightSpeed) {
    int trimL = getLeftMotorTrim();  // ค่า <= 0: ลดความเร็วฝั่งซ้าย
    int trimR = getRightMotorTrim(); // ค่า <= 0: ลดความเร็วฝั่งขวา

    int left  = leftSpeed;
    int right = rightSpeed;
    if (leftSpeed > 0)       left = max(0, leftSpeed + trimL);
    else if (leftSpeed < 0)  left = min(0, leftSpeed - trimL);

    if (rightSpeed > 0)      right = max(0, rightSpeed + trimR);
    else if (rightSpeed < 0) right = min(0, rightSpeed - trimR);

    // M1, M2 = ฝั่งซ้าย (M1 หน้า, M2 หลัง) | M3, M4 = ฝั่งขวา (M3 หน้า, M4 หลัง)
    safeMotorWrite2(constrain(left, -100, 100), constrain(right, -100, 100));
}

// ความเร็วที่หุ่น "ยังวิ่งค้างอยู่" ตอนจบคำสั่งก่อนหน้า (บวก = เดินหน้า, ลบ = ถอยหลัง, 0 = หยุดนิ่ง)
int g_motionCarrySpeed = 0;

void driveStop() {
    safeMotorStop();
    resetMoveSpeedBalance();
    g_motionCarrySpeed = 0;
}

// ============================================================================
// การอ่านระยะ Encoder และแปลงหน่วย CM -> Ticks (อ้างอิงล้อ 3.3 ซม. ตาม Sensor.ino)
// ============================================================================
const float ENCODER_WHEEL_DIAMETER_CM = 3.3f;
const float ENCODER_BASE_TICKS_PER_CM = 1300.0f / (3.14159265f * ENCODER_WHEEL_DIAMETER_CM);

float encoderCountsPerRevolution(int speed) {
    (void)speed;
    return 1300.0f;
}

long encoderCentimetersToTicks(float distanceCm, int speed) {
    (void)speed;
    if (distanceCm <= 0.0f) return 0L;
    float tpcm = max(1.0f, ticksPerCm);
    float tuneScale = constrain((300.0f + (float)distTuneMm) / 300.0f, 0.50f, 1.50f);
    return (long)llround((double)distanceCm * (double)tpcm * (double)tuneScale);
}

long readEncoderDistance() {
    long c[4];
    readPtEncoders(c);
    int64_t total = abs64((int64_t)c[0]) + abs64((int64_t)c[1]) +
                    abs64((int64_t)c[2]) + abs64((int64_t)c[3]);
    return (long)((total + 2LL) / 4LL);
}

long readEncoderSingleDistance(byte channelEncoder) {
    if (channelEncoder >= 3) return 0;
    long c[4];
    readPtEncoders(c);
    int64_t firstTicks  = abs64((int64_t)c[channelEncoder]);
    int64_t secondTicks = abs64((int64_t)c[channelEncoder + 1]);
    return (long)((firstTicks + secondTicks + 1LL) / 2LL);
}

void resetEncoder() {
    resetEncoders();
    fusedHeadingOnEncoderReset();
    resetMoveSpeedBalance();
}

// ============================================================================
// เซอร์โวปล่อยวัตถุหน้า/หลัง และเซนเซอร์จับเส้น (Mapping 0-100)
// ============================================================================
void openDropF() {
    setServoAngle(SERVO_S0, frontDrop);
    delay(45);
}

void closeDropF() {
    setServoAngle(SERVO_S0, frontLock);
}

void openDropB() {
    setServoAngle(SERVO_S1, backDrop);
    delay(45);
}

void closeDropB() {
    setServoAngle(SERVO_S1, backLock);
}

void DropF() {
    driveStop();
    clearTurnDistCarry();
    missionNotifyCommand("DropF();", 11); // CMD_ICON_DROP_F
    setServoAngle(SERVO_S0, frontDrop);
    delay(servoDropDelayMs);
    setServoAngle(SERVO_S0, frontLock);
    missionFinishCommandBeep();
}

void DropB() {
    driveStop();
    clearTurnDistCarry();
    missionNotifyCommand("DropB();", 12); // CMD_ICON_DROP_B
    setServoAngle(SERVO_S1, backDrop);
    delay(servoDropDelayMs);
    setServoAngle(SERVO_S1, backLock);
    missionFinishCommandBeep();
}

void readLine() {
    int vals[4];
    readAllLineSensors(vals);
    for (byte i = 0; i < LINE_SENSOR_COUNT; i++) {
        if (senMin[i] == senMax[i]) {
            line_value[i] = 100;
            continue;
        }
        line_value[i] = map(vals[i], senMin[i], senMax[i], 0, 100);
        line_value[i] = constrain(line_value[i], 0, 100);
    }
}

bool isLineDetected(byte sensorIndex) {
    if (sensorIndex >= LINE_SENSOR_COUNT) return false;
    if (senMin[sensorIndex] == senMax[sensorIndex]) {
        return readLineSensor(sensorIndex) < senThresh[sensorIndex];
    }
    int val = map(readLineSensor(sensorIndex), senMin[sensorIndex], senMax[sensorIndex], 0, 100);
    val = constrain(val, 0, 100);
    line_value[sensorIndex] = val;
    return val <= sensorDifference;
}
