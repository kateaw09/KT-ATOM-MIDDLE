// ============================================================================
// SpinTurn.ino — คำสั่งหมุนและเลี้ยวแยก (อ้างอิงตาม SpinFunction.ino ของ PT_MIDDLE_ENC_2026Endcode4MOV1)
// ============================================================================

// 0=OK, 1=USER_CANCEL, 2=IMU_FROZEN, 3=TIMEOUT, 4=WRONG_DIR
static volatile bool s_tuneActive = false;
static volatile int  s_tuneFault  = 0;

int autoTuneGetLastFault() {
    return (int)s_tuneFault;
}

static float wrapDeg180(float deg) {
    while (deg > 180.0f)  deg -= 360.0f;
    while (deg < -180.0f) deg += 360.0f;
    return deg;
}

// ============================================================================
// spinDegree (หมุนอยู่กับที่ตามมุมสัมพัทธ์ด้วย Gyro PD)
// ============================================================================
static void spinDegreeCore(float relative_degree, float threshold, int maxSpeedOverride,
                           bool stopAtEnd, bool notifyHud) {
    const int min_speed = spinMinSpeed;
    const int max_speed = (maxSpeedOverride > 0)
                              ? max(min_speed, constrain(abs(maxSpeedOverride), min_speed, 100))
                              : spinMaxSpeed;
    const unsigned long settle_time = spinPostDelayMs;
    const float kp = spinKp;
    const float kd = spinKd;
    const float small_angle_threshold = smallAngle_threshold;
    const float stop_threshold = threshold;

    unsigned long stable_timer = 0;
    float previous_error = 0.0f;
    current_degree = wrapDeg180(current_degree + relative_degree);

    if (notifyHud) {
        char cmdBuf[24];
        snprintf(cmdBuf, sizeof(cmdBuf), "Spin(%.0f)", relative_degree);
        missionNotifyCommand(cmdBuf, (relative_degree >= 0.0f) ? 4 : 3);
    }

    unsigned long startMs = millis();
    while (true) {
        serviceNonBlockingBeep();
        missionUpdateTimerHUD();
        if (s_tuneActive && (readSwitch(A) || readSwitch(B))) {
            driveStop();
            s_tuneFault = 1;
            return;
        }
        if (millis() - startMs >= 5000UL) {
            driveStop();
            if (s_tuneActive) s_tuneFault = 3;
            break;
        }

        float yaw = safeReadYaw();
        float error = wrapDeg180(current_degree - yaw);
        float derivative = error - previous_error;
        int pd_value = (int)((error * kp) + (derivative * kd));
        if (pd_value > max_speed) pd_value = max_speed;
        else if (pd_value < -max_speed) pd_value = -max_speed;

        if (fabsf(error) <= stop_threshold) {
            if (!stopAtEnd) {
                break;
            }
            driveStop();
            if (stable_timer == 0) {
                stable_timer = millis();
            }
            if (millis() - stable_timer >= settle_time) {
                break;
            }
        } else {
            stable_timer = 0;
            if (fabsf(error) < small_angle_threshold && abs(pd_value) < min_speed) {
                pd_value = (error > 0.0f) ? min_speed : -min_speed;
            }
            safeMotorWrite4(pd_value, pd_value, -pd_value, -pd_value);
        }
        previous_error = error;
        delay(1);
    }

    if (stopAtEnd && notifyHud && s_tuneFault == 0) {
        missionFinishCommandBeep();
    }
}

void spinDegree(int relative_degree) {
    spinDegree(relative_degree, threshold_spinDegree);
}

void spinDegree(int relative_degree, float threshold) {
    spinDegreeCore((float)relative_degree, threshold, -1, true, true);
}

void SpinDegree(float relativeDeg, int maxSpeed, bool stopAtEnd) {
    spinDegreeCore(relativeDeg, threshold_spinDegree, maxSpeed, stopAtEnd, true);
}

// ============================================================================
// turnDegreeFront / turnDegreeBack (เลี้ยวเหวี่ยงล้อหน้า / ล้อหลังด้วย Gyro PD)
// ============================================================================
static void turnDegreeCore(float relative_degree, float threshold, int maxSpeedOverride,
                           bool stopAtEnd, bool isBack, bool notifyHud) {
    const int min_speed = isBack ? turnBackMinSpeed : turnFrontMinSpeed;
    const int max_speed = (maxSpeedOverride > 0)
                              ? max(min_speed, constrain(abs(maxSpeedOverride), min_speed, 100))
                              : (isBack ? turnBackMaxSpeed : turnFrontMaxSpeed);
    const float kp = isBack ? turnBackKp : turnFrontKp;
    const float kd = isBack ? turnBackKd : turnFrontKd;
    const float stop_threshold = threshold;
    const unsigned long stable_time = 0;

    unsigned long stable_timer = 0;
    float previous_error = 0.0f;
    current_degree = wrapDeg180(current_degree + relative_degree);

    if (notifyHud) {
        char cmdBuf[24];
        snprintf(cmdBuf, sizeof(cmdBuf), isBack ? "TurnB(%.0f)" : "TurnF(%.0f)", relative_degree);
        int icon = isBack ? ((relative_degree >= 0.0f) ? 8 : 7)
                          : ((relative_degree >= 0.0f) ? 6 : 5);
        missionNotifyCommand(cmdBuf, icon);
    }

    unsigned long startMs = millis();
    while (true) {
        serviceNonBlockingBeep();
        missionUpdateTimerHUD();
        if (s_tuneActive && (readSwitch(A) || readSwitch(B))) {
            driveStop();
            s_tuneFault = 1;
            return;
        }
        if (millis() - startMs >= 5000UL) {
            driveStop();
            if (s_tuneActive) s_tuneFault = 3;
            break;
        }

        float yaw = safeReadYaw();
        float error = wrapDeg180(current_degree - yaw);
        float derivative = error - previous_error;
        int pd_value = (int)fabsf((error * kp) + (derivative * kd));
        if (pd_value > max_speed) pd_value = max_speed;
        if (pd_value < min_speed) pd_value = min_speed;

        if (fabsf(error) <= stop_threshold) {
            if (stopAtEnd) {
                driveStop();
            }
            if (stable_timer == 0) {
                stable_timer = millis();
            }
            if (millis() - stable_timer >= stable_time) {
                break;
            }
        } else {
            stable_timer = 0;
            if (!isBack) {
                if (error > 0.0f) safeMotorWrite4(pd_value, pd_value, 0, 0);
                else              safeMotorWrite4(0, 0, pd_value, pd_value);
            } else {
                if (error > 0.0f) safeMotorWrite4(0, 0, -pd_value, -pd_value);
                else              safeMotorWrite4(-pd_value, -pd_value, 0, 0);
            }
        }
        previous_error = error;
        delay(1);
    }

    if (stopAtEnd && notifyHud && s_tuneFault == 0) {
        missionFinishCommandBeep();
    }
}

void turnDegreeFront(int relative_degree) {
    turnDegreeFront(relative_degree, smallAngle_turnDegree);
}

void turnDegreeFront(int relative_degree, float threshold) {
    turnDegreeCore((float)relative_degree, threshold, -1, true, false, true);
}

void TrunDegreeFront(float relativeDeg, int maxSpeed, bool stopAtEnd) {
    turnDegreeCore(relativeDeg, smallAngle_turnDegree, maxSpeed, stopAtEnd, false, true);
}

void turnDegreeBack(int relative_degree) {
    turnDegreeBack(relative_degree, smallAngle_turnDegree);
}

void turnDegreeBack(int relative_degree, float threshold) {
    turnDegreeCore((float)relative_degree, threshold, -1, true, true, true);
}

void TrunDegreeBack(float relativeDeg, int maxSpeed, bool stopAtEnd) {
    turnDegreeCore(relativeDeg, smallAngle_turnDegree, maxSpeed, stopAtEnd, true, true);
}

// ============================================================================
// กลุ่มตีโค้งด้วย Encoder ล้วน: TTF90, TTF45, TTB90, TTB45
// (ตรงตาม SpinFunction.ino ของ PT_MIDDLE_ENC_2026Endcode4MOV1)
// หมายเหตุ: TTB90 / TTB45 รับพารามิเตอร์เรียง (speed_right, speed_left, distance_cm)
// ============================================================================
static void ttCurveCore(int speed_left, int speed_right, long distance_cm,
                        float angleDeg, bool isBack, const char* cmdLabel) {
    float target_degree = 0.0f;
    byte chanel_encoder;
    if (speed_left < speed_right) {
        chanel_encoder = 2;
        target_degree = current_degree + (isBack ? angleDeg : -angleDeg);
    } else {
        chanel_encoder = 0;
        target_degree = current_degree + (isBack ? -angleDeg : angleDeg);
    }
    current_degree = wrapDeg180(target_degree);

    int icon = isBack ? ((speed_left < speed_right) ? 8 : 7)
                      : ((speed_left < speed_right) ? 5 : 6);
    missionNotifyCommand(cmdLabel, icon);

    int speed = max(abs(speed_left), abs(speed_right));
    long target_ticks = encoderCentimetersToTicks((float)distance_cm, speed);
    resetEncoder();

    int mL = isBack ? -speed_left  : speed_left;
    int mR = isBack ? -speed_right : speed_right;
    unsigned long startMs = millis();
    while (readEncoderSingleDistance(chanel_encoder) < target_ticks) {
        serviceNonBlockingBeep();
        missionUpdateTimerHUD();
        safeMotorWrite4(mL, mL, mR, mR);
        if (millis() - startMs >= 5000UL) break;
        delay(1);
    }
    driveStop();
    missionFinishCommandBeep();
}

void TTF90(int speed_left, int speed_right, long distance_cm) {
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "TTF90(%d,%d,%ld)", speed_left, speed_right, distance_cm);
    ttCurveCore(speed_left, speed_right, distance_cm, 90.0f, false, cmdBuf);
}

void TTF45(int speed_left, int speed_right, long distance_cm) {
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "TTF45(%d,%d,%ld)", speed_left, speed_right, distance_cm);
    ttCurveCore(speed_left, speed_right, distance_cm, 45.0f, false, cmdBuf);
}

void TTB90(int speed_right, int speed_left, long distance_cm) {
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "TTB90(%d,%d,%ld)", speed_right, speed_left, distance_cm);
    ttCurveCore(speed_left, speed_right, distance_cm, 90.0f, true, cmdBuf);
}

void TTB45(int speed_right, int speed_left, long distance_cm) {
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "TTB45(%d,%d,%ld)", speed_right, speed_left, distance_cm);
    ttCurveCore(speed_left, speed_right, distance_cm, 45.0f, true, cmdBuf);
}

// ============================================================================
// Auto-Tune Support (สำหรับเมนู Run Setup ใน Interface.ino)
// ============================================================================
static bool tunePauseMs(unsigned long ms) {
    unsigned long t0 = millis();
    while (millis() - t0 < ms) {
        if (s_tuneFault != 0) return false;
        if (readSwitch(A) || readSwitch(B)) {
            driveStop();
            s_tuneFault = 1;
            return false;
        }
        delay(10);
    }
    return true;
}

static float measureYawErr(float targetDeg, bool turnRight) {
    float err = wrapDeg180(targetDeg - safeReadYaw());
    return turnRight ? -err : err;
}

void autoTuneSpinAndTurn(float &outSpinErr, float &outTurnErr,
                         void (*onProgress)(const char* stage, int pct, float lastErr)) {
    if (useCodeMotionDefaults) {
        outSpinErr = 901.0f;
        outTurnErr = 0.0f;
        s_tuneFault = 1;
        return;
    }

    outSpinErr = 0.0f;
    outTurnErr = 0.0f;
    s_tuneActive = true;
    s_tuneFault  = 0;

    setAngleOffset();
    delay(10);
    current_degree = 0.0f;
    if (!tunePauseMs(150)) { s_tuneActive = false; return; }

    if (onProgress) onProgress("SPIN TEST +90", 20, 0.0f);
    float y0 = safeReadYaw();
    current_degree = y0;
    spinDegreeCore(90.0f, threshold_spinDegree, -1, true, false);
    if (s_tuneFault == 0) {
        if (!tunePauseMs(180)) { s_tuneActive = false; return; }
        float y1 = safeReadYaw();
        float moved = fabsf(wrapDeg180(y1 - y0));
        if (moved < 3.0f) s_tuneFault = 2;
        else if (wrapDeg180(y1 - y0) < -30.0f) s_tuneFault = 4;
        outSpinErr = measureYawErr(wrapDeg180(y0 + 90.0f), true);
        if (onProgress) onProgress("SPIN TEST -90", 45, outSpinErr);
    }

    if (s_tuneFault == 0 && tunePauseMs(200)) {
        y0 = safeReadYaw();
        current_degree = y0;
        spinDegreeCore(-90.0f, threshold_spinDegree, -1, true, false);
        if (s_tuneFault == 0) {
            if (!tunePauseMs(180)) { s_tuneActive = false; return; }
            float errL = measureYawErr(wrapDeg180(y0 - 90.0f), false);
            if (fabsf(errL) > fabsf(outSpinErr)) outSpinErr = errL;
            if (onProgress) onProgress("TURN FRONT +90", 70, outSpinErr);
        }
    }

    if (s_tuneFault == 0 && tunePauseMs(200)) {
        y0 = safeReadYaw();
        current_degree = y0;
        turnDegreeCore(90.0f, smallAngle_turnDegree, -1, true, false, false);
        if (s_tuneFault == 0) {
            if (!tunePauseMs(180)) { s_tuneActive = false; return; }
            outTurnErr = measureYawErr(wrapDeg180(y0 + 90.0f), true);
            if (onProgress) onProgress("TURN BACK -90", 90, outTurnErr);
        }
    }

    if (s_tuneFault == 0 && tunePauseMs(200)) {
        y0 = safeReadYaw();
        current_degree = y0;
        turnDegreeCore(-90.0f, smallAngle_turnDegree, -1, true, true, false);
        if (s_tuneFault == 0) {
            if (!tunePauseMs(180)) { s_tuneActive = false; return; }
            float errB = measureYawErr(wrapDeg180(y0 - 90.0f), false);
            if (fabsf(errB) > fabsf(outTurnErr)) outTurnErr = errB;
            if (onProgress) onProgress("VERIFY COMPLETE", 100, outTurnErr);
        }
    }

    driveStop();
    setAngleOffset();
    current_degree = 0.0f;
    if (s_tuneFault == 0) {
        configSave();
    } else {
        outSpinErr = 900.0f + (float)s_tuneFault;
    }
    s_tuneActive = false;
}
