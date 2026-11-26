// ============================================================================
// SpinTurn.ino — คำสั่งหมุน/เลี้ยว Gyro (SpinDegree, TrunDegreeFront, TrunDegreeBack)
//                และตีโค้งด้วย Encoder (TTF90/45, TTB90/45) + Auto-Tune + EKF
//   - ใช้ Derivative-on-Measurement (ความเร็วเชิงมุม deg/s จริง) ลดอาการเลี้ยวส่าย
//   - รองรับ Swing Turn ต่อเนื่อง (stopAtEnd = false) ไม่สลับล้อฝั่งตรงข้ามให้ส่าย
// ============================================================================

// 0=OK, 1=USER_CANCEL, 2=IMU_FROZEN, 3=TIMEOUT, 4=WRONG_DIR
static volatile bool s_tuneActive = false;
static volatile int  s_tuneFault  = 0;

int autoTuneGetLastFault() {
    return (int)s_tuneFault;
}

static float wrapDeg180(float deg) {
    while (deg >  180.0f) deg -= 360.0f;
    while (deg < -180.0f) deg += 360.0f;
    return deg;
}

static void updateYawRateDegPs(float yaw, float &prevYaw, unsigned long &prevYawUs, float &omegaDegPs) {
    unsigned long nowUs = micros();
    unsigned long dtUs  = nowUs - prevYawUs;
    float dYaw          = wrapDeg180(yaw - prevYaw);
    if ((fabsf(dYaw) > 0.01f && dtUs >= 4000UL) || dtUs >= 12000UL) {
        float dtSec    = max(0.004f, (float)dtUs * 1e-6f);
        float rawOmega = constrain(dYaw / dtSec, -720.0f, 720.0f);
        omegaDegPs     = 0.45f * rawOmega + 0.55f * omegaDegPs;
        prevYaw        = yaw;
        prevYawUs      = nowUs;
    }
}

static void writeSwingTurnMotors(bool isBack, bool turnRight, int outerCmd, int innerCmd) {
    if (!isBack) {
        if (turnRight) safeMotorWrite4(outerCmd, outerCmd, innerCmd, innerCmd);
        else           safeMotorWrite4(innerCmd, innerCmd, outerCmd, outerCmd);
    } else {
        if (turnRight) safeMotorWrite4(-innerCmd, -innerCmd, -outerCmd, -outerCmd);
        else           safeMotorWrite4(-outerCmd, -outerCmd, -innerCmd, -innerCmd);
    }
}

// ============================================================================
// SpinDegree (หมุนอยู่กับที่ตามมุมสัมพัทธ์ด้วย Velocity-Damped Gyro PD)
// ============================================================================
static void spinDegreeCore(float relative_degree, float threshold, int maxSpeedOverride,
                           bool stopAtEnd, bool notifyHud) {
    clearTurnDistCarry();
    const int min_speed = spinMinSpeed;
    const int max_speed = (maxSpeedOverride > 0)
                              ? max(min_speed, constrain(abs(maxSpeedOverride), min_speed, 100))
                              : spinMaxSpeed;
    const unsigned long settle_time   = spinPostDelayMs;
    const float kp                    = spinKp;
    const float kd                    = spinKd;
    const float small_angle_threshold = smallAngle_threshold;
    const float stop_threshold        = threshold;

    unsigned long stable_timer = 0;
    current_degree = wrapDeg180(current_degree + relative_degree);

    float prevYaw           = safeReadYaw();
    unsigned long prevYawUs = micros();
    float omegaDegPs        = 0.0f;

    if (notifyHud) {
        char cmdBuf[24];
        snprintf(cmdBuf, sizeof(cmdBuf), "Spin(%.0f)", relative_degree);
        missionNotifyCommand(cmdBuf, (relative_degree >= 0.0f) ? 4 : 3);
    }

    unsigned long startMs = millis();
    while (true) {
        missionUpdateTimerHUD();
        ekfUpdate();

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
        updateYawRateDegPs(yaw, prevYaw, prevYawUs, omegaDegPs);

        float error   = wrapDeg180(current_degree - yaw);
        float pd_f    = (error * kp) - (omegaDegPs * kd);
        int pd_value  = constrain((int)roundf(pd_f), -max_speed, max_speed);

        if (fabsf(error) <= stop_threshold) {
            if (!stopAtEnd) {
                break;
            }
            driveStop();
            if (fabsf(omegaDegPs) < 35.0f) {
                if (stable_timer == 0) {
                    stable_timer = millis();
                }
                if (millis() - stable_timer >= settle_time) {
                    break;
                }
            } else {
                stable_timer = 0;
            }
        } else {
            stable_timer = 0;
            if (fabsf(error) < small_angle_threshold &&
                fabsf(omegaDegPs) < 40.0f &&
                abs(pd_value) < min_speed &&
                (pd_f * error >= 0.0f)) {
                pd_value = (error > 0.0f) ? min_speed : -min_speed;
            }
            safeMotorWrite4(pd_value, pd_value, -pd_value, -pd_value);
        }
        delay(1);
    }

    ekfUpdate();
    if (stopAtEnd && notifyHud && s_tuneFault == 0) {
        missionFinishCommandBeep();
    }
}

void SpinDegree(float relativeDeg, int maxSpeed, bool stopAtEnd) {
    spinDegreeCore(relativeDeg, threshold_spinDegree, maxSpeed, stopAtEnd, true);
}

// ============================================================================
// TrunDegreeFront / TrunDegreeBack (เลี้ยวเหวี่ยงล้อหน้า / ล้อหลังเร็วและนิ่ง)
// ============================================================================
static void turnDegreeCore(float relative_degree, float threshold, int maxSpeedOverride,
                           bool stopAtEnd, bool isBack, bool notifyHud) {
    clearTurnDistCarry();
    const int min_speed = isBack ? turnBackMinSpeed : turnFrontMinSpeed;
    const int max_speed = (maxSpeedOverride > 0)
                              ? max(min_speed, constrain(abs(maxSpeedOverride), min_speed, 100))
                              : (isBack ? turnBackMaxSpeed : turnFrontMaxSpeed);
    const float kp             = isBack ? turnBackKp : turnFrontKp;
    const float kd             = isBack ? turnBackKd : turnFrontKd;
    const float stop_threshold = threshold;
    const float turnSign       = (relative_degree >= 0.0f) ? 1.0f : -1.0f;
    const float innerRatio     = constrain(turnInnerRatio, -0.5f, 0.8f);

    unsigned long stable_timer = 0;
    current_degree = wrapDeg180(current_degree + relative_degree);

    float prevYaw           = safeReadYaw();
    unsigned long prevYawUs = micros();
    float omegaDegPs        = 0.0f;

    if (notifyHud) {
        char cmdBuf[24];
        snprintf(cmdBuf, sizeof(cmdBuf), isBack ? "TurnB(%.0f)" : "TurnF(%.0f)", relative_degree);
        int icon = isBack ? ((relative_degree >= 0.0f) ? 8 : 7)
                          : ((relative_degree >= 0.0f) ? 6 : 5);
        missionNotifyCommand(cmdBuf, icon);
    }

    unsigned long startMs = millis();
    while (true) {
        missionUpdateTimerHUD();
        ekfUpdate();

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
        updateYawRateDegPs(yaw, prevYaw, prevYawUs, omegaDegPs);

        float error = wrapDeg180(current_degree - yaw);
        float pd_f  = (error * kp) - (omegaDegPs * kd);

        if (!stopAtEnd) {
            // โหมดเลี้ยวต่อเนื่อง (FC/BC(..., 'R'/'L')): ห้ามหยุดเด็ดขาด — ใช้การเกลี่ยล้อเข้าแนวตรงต่อเนื่อง
            float remaining  = error * turnSign;
            float omegaAlong = omegaDegPs * turnSign;
            float leadDeg    = constrain(omegaAlong * 0.012f, 0.0f, 2.5f);
            if (remaining <= max(stop_threshold, 1.5f) + leadDeg) {
                break;
            }
            const int baseFlow = max(min_speed, 45);
            int steer = constrain((int)roundf(pd_f * turnSign), -20, max_speed);
            if (steer >= min_speed) {
                int innerCmd = (int)roundf((float)steer * innerRatio);
                writeSwingTurnMotors(isBack, turnSign > 0.0f, steer, innerCmd);
            } else if (steer > 0) {
                int outerCmd = baseFlow;
                int innerCmd = max(0, baseFlow - steer);
                writeSwingTurnMotors(isBack, turnSign > 0.0f, outerCmd, innerCmd);
            } else {
                // โมเมนตัมหมุนพาเข้าเป้าแล้ว: เกลี่ยทั้งสองฝั่งวิ่งต่อเนื่องพร้อมหน่วงมุมไม่ให้เลยเป้า
                int damp     = min(18, -steer);
                int outerCmd = max(12, baseFlow - damp);
                int innerCmd = min(max_speed, baseFlow + damp);
                writeSwingTurnMotors(isBack, turnSign > 0.0f, outerCmd, innerCmd);
            }
        } else {
            // โหมดเลี้ยวแล้วหยุด (TrunDegreeFront / TrunDegreeBack)
            if (fabsf(error) <= stop_threshold && fabsf(omegaDegPs) < 35.0f) {
                driveStop();
                if (stable_timer == 0) {
                    stable_timer = millis();
                }
                if (millis() - stable_timer >= 25UL) {
                    break;
                }
            } else {
                stable_timer = 0;
                if (error * turnSign < 0.0f && fabsf(error) > stop_threshold) {
                    // หากเลยเป้าเล็กน้อย แก้มุมกลับอยู่กับที่อย่างสมมาตร (ไม่ส่ายสลับข้าง)
                    int trim = constrain((int)roundf(pd_f), -(max_speed / 2), max_speed / 2);
                    if (fabsf(omegaDegPs) < 35.0f && abs(trim) < spinMinSpeed && (pd_f * error >= 0.0f)) {
                        trim = (error > 0.0f) ? spinMinSpeed : -spinMinSpeed;
                    }
                    safeMotorWrite4(trim, trim, -trim, -trim);
                } else if (pd_f * error <= 0.0f) {
                    safeMotorStop();
                } else {
                    int floorSpd = (fabsf(omegaDegPs) < 40.0f) ? min_speed : 0;
                    int cmd      = constrain((int)roundf(fabsf(pd_f)), floorSpd, max_speed);
                    if (cmd == 0) {
                        safeMotorStop();
                    } else {
                        int innerCmd = (int)roundf((float)cmd * innerRatio);
                        writeSwingTurnMotors(isBack, error > 0.0f, cmd, innerCmd);
                    }
                }
            }
        }
        delay(1);
    }

    ekfUpdate();
    if (!stopAtEnd && s_tuneFault == 0) {
        notifyTurnFlowExit(isBack ? -1 : 1, max(min_speed, 65));
    }

    if (stopAtEnd && notifyHud && s_tuneFault == 0) {
        missionFinishCommandBeep();
    }
}

void TrunDegreeFront(float relativeDeg, int maxSpeed, bool stopAtEnd) {
    turnDegreeCore(relativeDeg, smallAngle_turnDegree, maxSpeed, stopAtEnd, false, true);
}

void TrunDegreeBack(float relativeDeg, int maxSpeed, bool stopAtEnd) {
    turnDegreeCore(relativeDeg, smallAngle_turnDegree, maxSpeed, stopAtEnd, true, true);
}

// ============================================================================
// กลุ่มตีโค้งด้วย Encoder ล้วน: TTF90, TTF45, TTB90, TTB45
// หมายเหตุ: TTB90 / TTB45 รับพารามิเตอร์เรียง (speed_right, speed_left, distance_cm)
// ============================================================================
static void ttCurveCore(int speed_left, int speed_right, long distance_cm,
                        float angleDeg, bool isBack, const char* cmdLabel) {
    clearTurnDistCarry();
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
        missionUpdateTimerHUD();
        ekfUpdate();
        safeMotorWrite4(mL, mL, mR, mR);
        if (millis() - startMs >= 5000UL) break;
        delay(1);
    }
    driveStop();
    ekfUpdate();
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
    ekfSnapHeadingDeg(0.0f);
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
    ekfSnapHeadingDeg(0.0f);
    if (s_tuneFault == 0) {
        configSave();
    } else {
        outSpinErr = 900.0f + (float)s_tuneFault;
    }
    s_tuneActive = false;
}
