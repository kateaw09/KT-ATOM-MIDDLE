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

void driveStop() {
    safeMotorStop();
    resetMoveSpeedBalance();
}

// ============================================================================
// การอ่านระยะ Encoder, ตารางระยะ 1-8 ช่อง (Box Cal) และแปลงหน่วย CM -> Ticks
// ============================================================================
const float ENCODER_WHEEL_DIAMETER_CM = 3.3f;

float encoderCountsPerRevolution(int speed) {
    (void)speed;
    return 1300.0f;
}

long encoderCentimetersToTicks(float distance_cm, int speed) {
    (void)speed;
    if (distance_cm <= 0.0f) {
        return 0L;
    }
    float tpcm = max(1.0f, ticksPerCm);
    float tuneScale = constrain((300.0f + (float)distTuneMm) / 300.0f, 0.50f, 1.50f);
    return (long)llround((double)distance_cm * (double)tpcm * (double)tuneScale);
}

float getBoxDistCm(int boxNum) {
    switch (boxNum) {
        case 1: return box1Cm;
        case 2: return box2Cm;
        case 3: return box3Cm;
        case 4: return box4Cm;
        case 5: return box5Cm;
        case 6: return box6Cm;
        case 7: return box7Cm;
        case 8: return box8Cm;
        default: return (float)boxNum * max(5.0f, boxTileCm);
    }
}

float BOX(float boxes) {
    if (boxes <= 0.0f) return 0.0f;
    return boxes * max(5.0f, boxTileCm);
}

float mapFieldCmToRobotCm(float fieldCm) {
    if (fieldCm <= 0.0f) return 0.0f;
    float mapped = fieldCm;
    if (enableBoxDistCal) {
        const float tile = max(5.0f, boxTileCm);
        const float pts[9] = {
            0.0f,
            max(0.0f, box1Cm), max(0.0f, box2Cm), max(0.0f, box3Cm), max(0.0f, box4Cm),
            max(0.0f, box5Cm), max(0.0f, box6Cm), max(0.0f, box7Cm), max(0.0f, box8Cm)
        };
        float boxF = fieldCm / tile;
        if (boxF >= 8.0f) {
            float slope = pts[8] - pts[7];
            if (slope <= 0.5f) slope = tile;
            mapped = pts[8] + (boxF - 8.0f) * slope;
        } else {
            int idx = constrain((int)floorf(boxF), 0, 7);
            float frac = boxF - (float)idx;
            mapped = pts[idx] + frac * (pts[idx + 1] - pts[idx]);
        }
    }
    float offsetCm = constrain(distOffsetCm, -10.0f, 10.0f);
    if (fabsf(offsetCm) > 0.001f) {
        float scale = (fieldCm < 10.0f) ? (fieldCm / 10.0f) : 1.0f;
        mapped += offsetCm * scale;
    }
    return (mapped > 0.0f) ? mapped : 0.0f;
}

long readEncoderDistance() {
    long c[4];
    readPtEncoders(c);
    int64_t total = abs64((int64_t)c[0]) + abs64((int64_t)c[1]) +
                    abs64((int64_t)c[2]) + abs64((int64_t)c[3]);
    return (long)(total / 4LL);
}

long readEncoderSignedDistance(bool forward) {
    long c[4];
    readPtEncoders(c);
    int64_t sum = (int64_t)c[0] + (int64_t)c[1] + (int64_t)c[2] + (int64_t)c[3];
    int64_t avg = sum / 4LL;
    return (long)(forward ? avg : -avg);
}

long readEncoderSingleDistance(byte encoder_index) {
    if (encoder_index + 1 >= 4) {
        return 0;
    }
    long c[4];
    readPtEncoders(c);
    int64_t firstTicks  = abs64((int64_t)c[encoder_index]);
    int64_t secondTicks = abs64((int64_t)c[encoder_index + 1]);
    return (long)((firstTicks + secondTicks) / 2LL);
}

void resetEncoder() {
    resetEncoders();
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
