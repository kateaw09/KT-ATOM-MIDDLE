// ============================================================================
// SpinTurn.ino — คำสั่งหมุนและเลี้ยวแยก (อ้างอิง PT_MIDDLE_ENC_2026Endcode4 + แก้ Error)
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

static void updateImuAngularRate(float yaw, unsigned long now,
                                 float &lastImuYaw, unsigned long &lastImuMs,
                                 float &angularRate) {
    float dyaw = wrapDeg180(yaw - lastImuYaw);
    unsigned long dt = now - lastImuMs;
    if (fabsf(dyaw) > 0.05f && dt >= 4UL) {
        float instRate = constrain(-dyaw * (100.0f / (float)dt), -120.0f, 120.0f); // deg per 100ms
        angularRate = 0.65f * instRate + 0.35f * angularRate;
        lastImuYaw = yaw;
        lastImuMs  = now;
    } else if (dt > 45UL) {
        angularRate *= 0.35f;
        if (fabsf(angularRate) < 1.5f) angularRate = 0.0f;
        lastImuMs = now;
    }
}

static void spinApplyBrake(float rateMag, float angularRate, bool &braked) {
    if (braked || rateMag <= 8.0f) return;
    int brakeSpd = constrain((int)roundf(rateMag * 0.55f), 14, 38);
    int brakeDir = (angularRate < 0.0f) ? -1 : 1;
    safeMotorWrite2(brakeDir * brakeSpd, -brakeDir * brakeSpd);
    delay(8);
    braked = true;
}

static void spinDegreeCore(float relativeDeg, float threshold, int maxSpeedOverride,
                           bool stopAtEnd, bool notifyHud) {
    current_degree = wrapDeg180(current_degree + relativeDeg);
    bool hudNotified = !notifyHud;

    const int minSpd = spinMinSpeed;
    const int maxSpd = (maxSpeedOverride > 0)
                           ? max(minSpd, constrain(abs(maxSpeedOverride), 15, 100))
                           : spinMaxSpeed;
    const unsigned long postWaitMs = constrain(spinPostDelayMs, 15UL, 80UL);
    const unsigned long timeoutMs  = s_tuneActive ? 2200UL : 3000UL;
    const bool spinRight = (relativeDeg >= 0.0f);
    const float dirSpinThr = threshold + (spinRight ? -spinLeftOffsetDeg : spinLeftOffsetDeg);
    const float effThreshold = constrain(dirSpinThr, 1.5f, 7.0f);

    float startYaw = safeReadYaw();
    float lastImuYaw = startYaw;
    unsigned long lastImuMs = millis();
    float angularRate = 0.0f;
    float maxTravelDeg = 0.0f;
    unsigned long startMs = millis();
    bool didMove = false;
    bool braked  = false;
    bool didPostCorrect = false;
    bool reachedTarget  = false;
    int signCrossCount = 0;
    int lastErrSign    = 0;
    int lastSentSpd    = 999;
    unsigned long lastMotorWriteMs = 0;

    while (millis() - startMs < timeoutMs) {
        serviceNonBlockingBeep();
        if (s_tuneActive && (readSwitch(A) || readSwitch(B))) {
            driveStop();
            s_tuneFault = 1;
            return;
        }

        float yaw = safeReadYaw();
        unsigned long now = millis();
        updateImuAngularRate(yaw, now, lastImuYaw, lastImuMs, angularRate);

        float travelFromStart = fabsf(wrapDeg180(yaw - startYaw));
        if (travelFromStart > maxTravelDeg) maxTravelDeg = travelFromStart;

        float error = wrapDeg180(current_degree - yaw);
        if (!didMove && fabsf(relativeDeg) >= 170.0f) {
            if (spinRight && error < 0.0f) error += 360.0f;
            else if (!spinRight && error > 0.0f) error -= 360.0f;
        }

        float approachingRate = (error > 0.0f) ? (-angularRate) : angularRate;
        float stopLeadDeg = (stopAtEnd && !didPostCorrect && approachingRate > 5.0f)
                                ? constrain(approachingRate * 0.14f, 0.0f, 7.5f)
                                : 0.0f;

        if (s_tuneActive) {
            if ((now - startMs) > 800UL && maxTravelDeg < 3.0f) {
                driveStop();
                s_tuneFault = 2;
                return;
            }
            float signedProgress = spinRight ? wrapDeg180(yaw - startYaw) : wrapDeg180(startYaw - yaw);
            if (signCrossCount == 0 && (now - startMs) > 350UL && signedProgress < -30.0f) {
                driveStop();
                s_tuneFault = 4;
                return;
            }
        }

        if (fabsf(error) <= (effThreshold + stopLeadDeg)) {
            if (!stopAtEnd) {
                reachedTarget = true;
                break;
            }
            spinApplyBrake(approachingRate, angularRate, braked);
            driveStop();
            lastSentSpd = 999;

            unsigned long w0 = millis();
            while (millis() - w0 < postWaitMs) {
                serviceNonBlockingBeep();
                if (s_tuneActive && (readSwitch(A) || readSwitch(B))) {
                    driveStop();
                    s_tuneFault = 1;
                    return;
                }
                delay(2);
            }

            float postErr = wrapDeg180(current_degree - safeReadYaw());
            if (didPostCorrect || fabsf(postErr) <= max(2.0f, effThreshold + 0.5f)) {
                reachedTarget = true;
                break;
            }
            didPostCorrect = true;
            signCrossCount = max(signCrossCount, 1);
            lastErrSign    = (postErr > 0.0f) ? 1 : -1;
            continue;
        }

        int errSign = (error > 0.0f) ? 1 : -1;
        if (didMove && lastErrSign != 0 && errSign != lastErrSign) {
            signCrossCount++;
            if (stopAtEnd) {
                spinApplyBrake(-approachingRate, angularRate, braked);
            }
            driveStop();
            lastSentSpd = 999;
            if ((signCrossCount == 1 && fabsf(error) <= effThreshold + 1.2f) ||
                signCrossCount >= 2) {
                reachedTarget = true;
                break;
            }
            delay(8);
        }
        lastErrSign = errSign;

        unsigned long elapsed = now - startMs;
        int corrSpd      = max(14, minSpd - 4);
        int floorSpd     = (signCrossCount > 0) ? corrSpd : minSpd;
        int activeMaxSpd = (signCrossCount > 0) ? corrSpd : maxSpd;
        int rampMaxSpd = (elapsed < 40UL && activeMaxSpd > floorSpd)
                             ? (floorSpd + (int)(((float)elapsed / 40.0f) * (activeMaxSpd - floorSpd)))
                             : activeMaxSpd;
        if (signCrossCount == 0 && fabsf(error) < smallAngle_threshold && rampMaxSpd > floorSpd) {
            int distCap = floorSpd + (int)((fabsf(error) / smallAngle_threshold) * (activeMaxSpd - floorSpd));
            if (distCap < rampMaxSpd) rampMaxSpd = distCap;
        }

        float pTerm = fabsf(error) * spinKp;
        float dBrake = (approachingRate > 0.0f) ? (approachingRate * spinKd * 0.60f) : 0.0f;
        int mag = constrain((int)roundf(pTerm - dBrake), floorSpd, rampMaxSpd);
        int pdValue = (error > 0.0f) ? mag : -mag;

        if (!didMove || abs(pdValue - lastSentSpd) >= 3 || (pdValue * lastSentSpd < 0) || (now - lastMotorWriteMs) >= 15UL) {
            safeMotorWrite2(pdValue, -pdValue);
            lastSentSpd = pdValue;
            lastMotorWriteMs = now;
        }
        didMove = true;
        if (!hudNotified) {
            hudNotified = true;
            char cmdBuf[24];
            snprintf(cmdBuf, sizeof(cmdBuf), "Spin(%.0f)", relativeDeg);
            missionNotifyCommand(cmdBuf, (relativeDeg >= 0.0f) ? 4 : 3);
        }
        delay(2);
    }

    if (s_tuneActive && (millis() - startMs >= timeoutMs) && !reachedTarget) {
        s_tuneFault = 3;
    }

    if (stopAtEnd || (millis() - startMs >= timeoutMs)) {
        driveStop();
        if (stopAtEnd && notifyHud && s_tuneFault == 0) missionFinishCommandBeep();
    }
}

static void swingApplyBrake(bool isBack, bool turnRight, float approachRate) {
    if (approachRate <= 8.0f) return;
    int brakeSpd = constrain((int)roundf(approachRate * 0.55f), 16, 42);
    if (!isBack) {
        if (turnRight) safeMotorWrite2(-brakeSpd, 0);
        else           safeMotorWrite2(0, -brakeSpd);
    } else {
        if (turnRight) safeMotorWrite2(0, brakeSpd);
        else           safeMotorWrite2(brakeSpd, 0);
    }
    delay(10);
}

static void turnSwingCore(float relativeDeg, float threshold, int maxSpeedOverride,
                          bool stopAtEnd, bool isBack, bool notifyHud) {
    current_degree = wrapDeg180(current_degree + relativeDeg);
    bool hudNotified = !notifyHud;

    if (fabsf(relativeDeg) < 0.5f) {
        if (stopAtEnd) {
            driveStop();
            if (notifyHud) missionFinishCommandBeep();
        }
        return;
    }

    const int minSpd = isBack ? turnBackMinSpeed : turnFrontMinSpeed;
    const int maxSpd = (maxSpeedOverride > 0)
                           ? max(minSpd, constrain(abs(maxSpeedOverride), 15, 100))
                           : (isBack ? turnBackMaxSpeed : turnFrontMaxSpeed);
    const int floorSpd = stopAtEnd ? minSpd : max(minSpd, min(maxSpd, 46));
    const float turnKp = isBack ? turnBackKp : turnFrontKp;
    const float turnKd = isBack ? turnBackKd : turnFrontKd;
    const float kp = turnKp;
    const float kd = turnKd;
    const bool turnRight = (relativeDeg >= 0.0f);
    const bool leftWheelOuter = (!isBack && turnRight) || (isBack && !turnRight);
    float angleScale = constrain(fabsf(relativeDeg) / 90.0f, 0.55f, 1.0f);
    const float dirThreshold = threshold + (leftWheelOuter ? turnRightOffsetDeg : -turnRightOffsetDeg);
    const float effThreshold = constrain(dirThreshold, 1.5f, 34.0f) * angleScale;
    const bool fromRest = (g_motionCarrySpeed == 0);
    const unsigned long timeoutMs = s_tuneActive ? 2500UL : 3500UL;

    if (stopAtEnd) fusedHeadingSyncToImu();
    float startYaw = 0.0f, initRate = 0.0f;
    fusedHeadingUpdate(startYaw, initRate);
    float smoothApproachRate = 0.0f;
    float maxTravelDeg = 0.0f;
    unsigned long startMs = millis();
    bool didMove = false;
    bool reachedTarget = false;
    bool inRollOut = false;
    unsigned long rollOutStartMs = 0;
    const float blendZoneDeg = min(22.0f, fabsf(relativeDeg) * 0.35f);
    int lastErrSign    = 0;
    int lastOuterSpd   = 0;
    int lastSentL = 999, lastSentR = 999;
    unsigned long lastMotorWriteMs = 0;

    while (millis() - startMs < timeoutMs) {
        serviceNonBlockingBeep();
        if (s_tuneActive && (readSwitch(A) || readSwitch(B))) {
            driveStop();
            s_tuneFault = 1;
            return;
        }

        float yaw = 0.0f, fusedRate100ms = 0.0f;
        fusedHeadingUpdate(yaw, fusedRate100ms);
        unsigned long now = millis();

        float travelFromStart = fabsf(wrapDeg180(yaw - startYaw));
        if (travelFromStart > maxTravelDeg) maxTravelDeg = travelFromStart;

        float error = wrapDeg180(current_degree - yaw);
        if (!didMove && fabsf(relativeDeg) >= 170.0f) {
            if (turnRight && error < 0.0f) error += 360.0f;
            else if (!turnRight && error > 0.0f) error -= 360.0f;
        }

        float approachingRate = (error > 0.0f) ? fusedRate100ms : (-fusedRate100ms);
        if (approachingRate > 0.0f) {
            smoothApproachRate = (smoothApproachRate <= 0.1f)
                                     ? approachingRate
                                     : (0.55f * approachingRate + 0.45f * smoothApproachRate);
        } else {
            smoothApproachRate *= 0.4f;
        }
        float leadGain = stopAtEnd ? 0.12f : 0.14f;
        float leadMax  = stopAtEnd ? 6.0f  : 8.0f;
        float turnLeadDeg = (smoothApproachRate > 6.0f)
                                ? constrain(smoothApproachRate * leadGain, 0.0f, leadMax)
                                : 0.0f;
        float exitBandDeg = min(effThreshold + turnLeadDeg, fabsf(relativeDeg) * 0.55f);

        if (s_tuneActive) {
            if ((now - startMs) > 800UL && maxTravelDeg < 3.0f) {
                driveStop();
                s_tuneFault = 2;
                return;
            }
            float signedProgress = turnRight ? wrapDeg180(yaw - startYaw) : wrapDeg180(startYaw - yaw);
            if ((now - startMs) > 350UL && signedProgress < -30.0f) {
                driveStop();
                s_tuneFault = 4;
                return;
            }
        }

        int errSign = (error > 0.0f) ? 1 : -1;

        if (!stopAtEnd && !inRollOut) {
            if (fabsf(error) <= blendZoneDeg ||
                (didMove && lastErrSign != 0 && errSign != lastErrSign)) {
                inRollOut = true;
                rollOutStartMs = now;
            }
        }

        if (inRollOut) {
            float absErr  = fabsf(error);
            float absRate = fabsf(fusedRate100ms);
            unsigned long rollElapsed = now - rollOutStartMs;
            if ((absErr <= 2.5f && absRate <= 14.0f) ||
                (absErr <= 1.2f && rollElapsed >= 15UL) ||
                (rollElapsed >= 110UL)) {
                reachedTarget = true;
                int carrySpd = (abs(lastSentL) <= 100 && abs(lastSentR) <= 100)
                                   ? ((abs(lastSentL) + abs(lastSentR)) / 2)
                                   : max(floorSpd, 56);
                g_motionCarrySpeed = isBack ? -carrySpd : carrySpd;
                break;
            }

            float progress = constrain(1.0f - (absErr / blendZoneDeg), 0.0f, 1.0f);
            int rollBase = constrain(max(floorSpd, 58), minSpd, maxSpd);
            int baseFwd  = (int)roundf((float)rollBase * (0.50f + 0.50f * progress));
            float steerF = (error * 2.40f) - (fusedRate100ms * kd * 0.65f);
            int steerCap = max(baseFwd, (int)roundf((float)rollBase * 0.65f));
            int steer    = constrain((int)roundf(steerF), -steerCap, steerCap);

            int trimL = (motorTrim < 0) ? motorTrim : 0;
            int trimR = (motorTrim > 0) ? motorTrim : 0;
            int cmdL = 0, cmdR = 0;
            if (!isBack) {
                cmdL = constrain(baseFwd + steer + trimL, 0, 100);
                cmdR = constrain(baseFwd - steer + trimR, 0, 100);
            } else {
                cmdL = constrain(-baseFwd + steer - trimL, -100, 0);
                cmdR = constrain(-baseFwd - steer - trimR, -100, 0);
            }
            if (!didMove || abs(cmdL - lastSentL) >= 2 || abs(cmdR - lastSentR) >= 2 || (now - lastMotorWriteMs) >= 10UL) {
                safeMotorWrite2(cmdL, cmdR);
                lastSentL = cmdL;
                lastSentR = cmdR;
                lastMotorWriteMs = now;
            }
            lastOuterSpd = max(abs(cmdL), abs(cmdR));
            didMove = true;
            lastErrSign = errSign;
        } else {
            if (stopAtEnd &&
                (fabsf(error) <= exitBandDeg || (didMove && lastErrSign != 0 && errSign != lastErrSign))) {
                reachedTarget = true;
                swingApplyBrake(isBack, turnRight, smoothApproachRate);
                driveStop();
                break;
            }
            lastErrSign = errSign;

            unsigned long elapsed = now - startMs;
            int activeMaxSpd = maxSpd;
            int launchFloor = min(activeMaxSpd, max(floorSpd, 55));
            int rampMaxSpd = (fromRest && elapsed < 35UL && activeMaxSpd > launchFloor)
                                 ? (launchFloor + (int)(((float)elapsed / 35.0f) * (activeMaxSpd - launchFloor)))
                                 : activeMaxSpd;
            const float turnDecelDeg = stopAtEnd ? min(48.0f, fabsf(relativeDeg) * 0.60f) : min(44.0f, fabsf(relativeDeg) * 0.56f);
            if (fabsf(error) < turnDecelDeg && rampMaxSpd > floorSpd) {
                int distCap = floorSpd + (int)((fabsf(error) / turnDecelDeg) * (activeMaxSpd - floorSpd));
                if (distCap < rampMaxSpd) rampMaxSpd = distCap;
            }

            float pTerm = fabsf(error) * kp;
            float dBrake = 0.0f;
            if (fabsf(error) < turnDecelDeg && smoothApproachRate > 0.0f) {
                float decelBlend = 1.0f - (fabsf(error) / turnDecelDeg);
                float dScale = stopAtEnd ? 0.50f : 0.42f;
                dBrake = smoothApproachRate * kd * dScale * decelBlend;
            }
            int pdValue = constrain((int)roundf(pTerm - dBrake), floorSpd, rampMaxSpd);

            int trimL = (motorTrim < 0) ? motorTrim : 0;
            int trimR = (motorTrim > 0) ? motorTrim : 0;
            int outerFloor = max(20, floorSpd - 4);
            int outerL = constrain(pdValue + trimL, outerFloor, 100);
            int outerR = constrain(pdValue + trimR, outerFloor, 100);
            int innerSpd = 0;
            if (turnInnerRatio > 0.01f && pdValue > 10) {
                innerSpd = constrain((int)roundf((float)pdValue * turnInnerRatio), 18, pdValue - 10);
            }
            int cmdL = 0, cmdR = 0;
            if (!isBack) {
                if (error > 0.0f) { cmdL = outerL;   cmdR = innerSpd; }
                else              { cmdL = innerSpd; cmdR = outerR;   }
            } else {
                if (error > 0.0f) { cmdL = -innerSpd; cmdR = -outerR;   }
                else              { cmdL = -outerL;   cmdR = -innerSpd; }
            }
            if (!didMove || abs(cmdL - lastSentL) >= 3 || abs(cmdR - lastSentR) >= 3 || (now - lastMotorWriteMs) >= 15UL) {
                safeMotorWrite2(cmdL, cmdR);
                lastSentL = cmdL;
                lastSentR = cmdR;
                lastMotorWriteMs = now;
            }
            lastOuterSpd = pdValue;
            didMove = true;
        }
        if (!hudNotified) {
            hudNotified = true;
            char cmdBuf[24];
            snprintf(cmdBuf, sizeof(cmdBuf), isBack ? "TurnB(%.0f)" : "TurnF(%.0f)", relativeDeg);
            int icon = isBack ? ((relativeDeg >= 0.0f) ? 8 : 7) : ((relativeDeg >= 0.0f) ? 6 : 5);
            missionNotifyCommand(cmdBuf, icon);
        }
        delay(2);
    }

    if (s_tuneActive && (millis() - startMs >= timeoutMs) && !reachedTarget) {
        s_tuneFault = 3;
    }

    if (stopAtEnd || (millis() - startMs >= timeoutMs)) {
        driveStop();
        if (stopAtEnd && notifyHud && s_tuneFault == 0) missionFinishCommandBeep();
    }
}

void spinDegree(int relative_degree) {
    spinDegree(relative_degree, threshold_spinDegree);
}

void spinDegree(int relative_degree, float threshold) {
    spinDegreeCore((float)relative_degree, threshold, -1, true, false);
}

void SpinDegree(float relativeDeg, int maxSpeed, bool stopAtEnd) {
    spinDegreeCore(relativeDeg, threshold_spinDegree, maxSpeed, stopAtEnd, true);
}

void turnSwingContinuous(float relativeDeg, int entrySpeed, bool isBack) {
    // stopAtEnd = false: จบเลี้ยวแล้วไม่หยุด ส่งต่อความเร็วให้คำสั่งถัดไปทันที
    turnSwingCore(relativeDeg, smallAngle_turnDegree, entrySpeed, false, isBack, true);
}

void turnDegreeFront(int relative_degree) {
    turnDegreeFront(relative_degree, smallAngle_turnDegree);
}

void turnDegreeFront(int relative_degree, float threshold) {
    turnSwingCore((float)relative_degree, threshold, -1, true, false, false);
}

void TrunDegreeFront(float relativeDeg, int maxSpeed, bool stopAtEnd) {
    turnSwingCore(relativeDeg, smallAngle_turnDegree, maxSpeed, stopAtEnd, false, true);
}

void turnDegreeBack(int relative_degree) {
    turnDegreeBack(relative_degree, smallAngle_turnDegree);
}

void turnDegreeBack(int relative_degree, float threshold) {
    turnSwingCore((float)relative_degree, threshold, -1, true, true, false);
}

void TrunDegreeBack(float relativeDeg, int maxSpeed, bool stopAtEnd) {
    turnSwingCore(relativeDeg, smallAngle_turnDegree, maxSpeed, stopAtEnd, true, true);
}

// ============================================================================
// กลุ่มตีโค้งด้วย Encoder ล้วน: TTF90, TTF45, TTB90, TTB45 (ซ้ายก่อน ขวาทีหลัง)
// ============================================================================
static void curveTurnEnc(int speedLeft, int speedRight, long distanceCm,
                         float angleDeg, bool reverseDir, const char* cmdLabel) {
    byte channelEncoder = (speedLeft < speedRight) ? 2 : 0;
    float deltaDeg = ((speedLeft < speedRight) ^ reverseDir) ? -angleDeg : angleDeg;
    current_degree = wrapDeg180(current_degree + deltaDeg);

    int icon = reverseDir ? ((deltaDeg >= 0.0f) ? 8 : 7) : ((deltaDeg >= 0.0f) ? 6 : 5);
    missionNotifyCommand(cmdLabel, icon);

    int speed = max(abs(speedLeft), abs(speedRight));
    long targetTicks = encoderCentimetersToTicks((float)distanceCm, speed);
    resetEncoder();

    int mLeft  = reverseDir ? -speedLeft  : speedLeft;
    int mRight = reverseDir ? -speedRight : speedRight;
    unsigned long startMs = millis();

    while (readEncoderSingleDistance(channelEncoder) < targetTicks) {
        serviceNonBlockingBeep();
        missionUpdateTimerHUD();
        safeMotorWrite4(mLeft, mLeft, mRight, mRight);
        if (millis() - startMs > 4500UL) break;
        delay(1);
    }
    driveStop();
    missionFinishCommandBeep();
}

void TTF90(int speed_left, int speed_right, long distance_cm) {
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "TTF90(%d,%d,%ld)", speed_left, speed_right, distance_cm);
    curveTurnEnc(speed_left, speed_right, distance_cm, 90.0f, false, cmdBuf);
}

void TTF45(int speed_left, int speed_right, long distance_cm) {
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "TTF45(%d,%d,%ld)", speed_left, speed_right, distance_cm);
    curveTurnEnc(speed_left, speed_right, distance_cm, 45.0f, false, cmdBuf);
}

void TTB90(int speed_left, int speed_right, long distance_cm) {
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "TTB90(%d,%d,%ld)", speed_left, speed_right, distance_cm);
    curveTurnEnc(speed_left, speed_right, distance_cm, 90.0f, true, cmdBuf);
}

void TTB45(int speed_left, int speed_right, long distance_cm) {
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "TTB45(%d,%d,%ld)", speed_left, speed_right, distance_cm);
    curveTurnEnc(speed_left, speed_right, distance_cm, 45.0f, true, cmdBuf);
}

// ============================================================================
// Progressive Low -> Mid -> High Auto-Tune (กันไจโรหลุด + ไล่ความเร็วปลอดภัยสูงสุด)
// ============================================================================
static bool tuneCheckAbort() {
    if (s_tuneFault != 0) return true;
    if (readSwitch(A) || readSwitch(B)) {
        driveStop();
        s_tuneFault = 1;
        return true;
    }
    return false;
}

static bool tunePauseMs(unsigned long ms) {
    unsigned long t0 = millis();
    while (millis() - t0 < ms) {
        if (tuneCheckAbort()) return false;
        delay(10);
    }
    return true;
}

static void measureSettleWindow(float targetDeg, bool turnRight, float &peakOver, float &settledErr, float &endYawOut) {
    peakOver = -999.0f;
    unsigned long t0 = millis();
    float endYaw = safeReadYaw();
    float prevYaw = endYaw;
    unsigned long stableSince = t0;
    while (millis() - t0 < 380UL) {
        if (tuneCheckAbort()) break;
        endYaw = safeReadYaw();
        float errToTarget = wrapDeg180(targetDeg - endYaw);
        float over = turnRight ? -errToTarget : errToTarget;
        if (over > peakOver) peakOver = over;
        if (fabsf(wrapDeg180(endYaw - prevYaw)) > 0.15f) {
            prevYaw = endYaw;
            stableSince = millis();
        }
        if ((millis() - t0 >= 220UL) && (millis() - stableSince >= 60UL)) {
            break;
        }
        delay(10);
    }
    float finalErr = wrapDeg180(targetDeg - endYaw);
    settledErr = turnRight ? -finalErr : finalErr;
    if (peakOver < settledErr) peakOver = settledErr;
    endYawOut = endYaw;
}

static void measureSpinTrial(float relDeg, int testMaxSpd, float &peakOver, float &settledErr,
                             float &startYawOut, float &endYawOut) {
    float startYaw = safeReadYaw();
    startYawOut = startYaw;
    endYawOut   = startYaw;
    current_degree = startYaw;
    spinDegreeCore(relDeg, threshold_spinDegree, testMaxSpd, true, false);
    if (s_tuneFault != 0) {
        endYawOut = safeReadYaw();
        return;
    }
    measureSettleWindow(wrapDeg180(startYaw + relDeg), relDeg >= 0.0f, peakOver, settledErr, endYawOut);
}

static void measureSwingTrial(float relDeg, int testMaxSpd, bool isBack, float &peakOver, float &settledErr,
                              float &startYawOut, float &endYawOut) {
    fusedHeadingSyncToImu();
    float startYaw = safeReadYaw();
    startYawOut = startYaw;
    endYawOut   = startYaw;
    current_degree = startYaw;
    turnSwingCore(relDeg, smallAngle_turnDegree, testMaxSpd, true, isBack, false);
    if (s_tuneFault != 0) {
        endYawOut = safeReadYaw();
        return;
    }
    measureSettleWindow(wrapDeg180(startYaw + relDeg), relDeg >= 0.0f, peakOver, settledErr, endYawOut);
}

static void adjustSpinGains(float peakOver, float settledErr) {
    if (peakOver > 4.0f) {
        spinKd = constrain(spinKd + 0.12f, 0.30f, 2.00f);
        spinKp = constrain(spinKp - 0.06f, 0.55f, 1.80f);
        smallAngle_threshold = constrain(smallAngle_threshold + 3.0f, 40.0f, 75.0f);
    } else if (settledErr > 1.8f) {
        spinKd = constrain(spinKd + 0.06f, 0.30f, 2.00f);
        // เลยเป้า -> เพิ่มขอบเขตหยุดให้เบรกเร็วขึ้น
        threshold_spinDegree = constrain(threshold_spinDegree + 0.20f, 1.5f, 5.0f);
    } else if (settledErr < -2.2f) {
        spinKp = constrain(spinKp + 0.08f, 0.55f, 1.80f);
        // ขาดเป้า -> ลดขอบเขตหยุดให้หมุนเข้าไปต่ออีกนิด
        threshold_spinDegree = constrain(threshold_spinDegree - 0.20f, 1.5f, 5.0f);
    }
}

static void adjustSwingGains(float &kp, float &kd, float peakOver, float settledErr, bool updateThr) {
    if (updateThr) {
        if (settledErr > 0.6f) {
            float step = constrain(settledErr * 0.55f, 0.20f, 4.5f);
            smallAngle_turnDegree = constrain(smallAngle_turnDegree + step, 3.0f, 28.0f);
        } else if (settledErr < -0.6f) {
            float step = constrain((-settledErr) * 0.52f, 0.20f, 4.5f);
            smallAngle_turnDegree = constrain(smallAngle_turnDegree - step, 3.0f, 28.0f);
        }
    }
    if (peakOver > 5.0f) {
        kd = constrain(kd + 0.08f, 0.30f, 1.20f);
        kp = constrain(kp - 0.06f, 1.20f, 2.60f);
    } else if (settledErr < -2.5f) {
        kp = constrain(kp + 0.08f, 1.20f, 2.60f);
    }
}

static bool tuneSwingSideThreshold(float relDeg, int speed, float initThr,
                                   const char* logTag, const char* uiTag, int pctStart, int pctSpan,
                                   float &outBestThr, float &outBestErr,
                                   void (*onProgress)(const char* stage, int pct, float lastErr)) {
    turnRightOffsetDeg = 0.0f;
    const int MAX_ITERS = 7;
    float curThr  = constrain(initThr, 1.5f, 30.0f);
    float bestThr = curThr;
    float bestErr = 999.0f;
    bool hasLow = false, hasHigh = false;
    float lowThr = 1.5f, lowErr = 0.0f;
    float highThr = 30.0f, highErr = 0.0f;

    for (int iter = 0; iter < MAX_ITERS; iter++) {
        if (tuneCheckAbort()) return false;
        smallAngle_turnDegree = curThr;
        float peakOver = 0.0f, settledErr = 0.0f, yaw0 = 0.0f, yaw1 = 0.0f;
        measureSwingTrial(relDeg, speed, false, peakOver, settledErr, yaw0, yaw1);

        if (s_tuneFault == 0) {
            if (fabsf(settledErr) < fabsf(bestErr)) {
                bestErr = settledErr;
                bestThr = curThr;
            }
            if (settledErr > 0.0f) {
                lowThr = curThr;
                lowErr = settledErr;
                hasLow = true;
                if (hasHigh && lowThr >= highThr - 0.1f) hasHigh = false;
            } else {
                highThr = curThr;
                highErr = settledErr;
                hasHigh = true;
                if (hasLow && highThr <= lowThr + 0.1f) hasLow = false;
            }
        }

        Serial.printf("[TUNE] %s#%d spd=%d ang=%+.0f yaw=%.1f->%.1f peak=%+.1f err=%+.1f thr=%.2f best=%.2f(%+.1f) fault=%d\n",
                      logTag, iter + 1, speed, relDeg, yaw0, yaw1, peakOver, settledErr,
                      curThr, bestThr, bestErr, (int)s_tuneFault);
        if (s_tuneFault != 0) return false;

        if (onProgress) {
            onProgress(uiTag, pctStart + ((iter + 1) * pctSpan) / MAX_ITERS, settledErr);
        }
        if (!tunePauseMs(220)) return false;
        if (fabsf(settledErr) <= 0.6f) break;

        float nextThr = curThr;
        if (hasLow && hasHigh && (highThr - lowThr) > 0.25f) {
            float frac = constrain(lowErr / (lowErr - highErr), 0.25f, 0.75f);
            nextThr = lowThr + (highThr - lowThr) * frac;
        } else {
            float step = constrain(settledErr * 0.75f, -5.0f, 5.0f);
            if (fabsf(step) < 0.35f) step = (settledErr >= 0.0f) ? 0.35f : -0.35f;
            nextThr = curThr + step;
        }
        nextThr = constrain(nextThr, 1.5f, 30.0f);
        if (fabsf(nextThr - curThr) < 0.05f) break;
        curThr = nextThr;
    }

    outBestThr = bestThr;
    outBestErr = bestErr;
    return true;
}

static bool verifySwingFrontPair(const char* logTag, const char* uiTag, int pct, int speed,
                                 float &outErrR, float &outErrL,
                                 void (*onProgress)(const char* stage, int pct, float lastErr)) {
    const float dirs2[2] = { 1.0f, -1.0f };
    float errs[2] = { 0.0f, 0.0f };
    for (int i = 0; i < 2; i++) {
        if (tuneCheckAbort()) return false;
        float ang = dirs2[i] * 90.0f;
        float peakOver = 0.0f, settledErr = 0.0f, yaw0 = 0.0f, yaw1 = 0.0f;
        measureSwingTrial(ang, speed, false, peakOver, settledErr, yaw0, yaw1);
        Serial.printf("[TUNE] %s ang=%+.0f spd=%d yaw=%.1f->%.1f peak=%+.1f err=%+.1f thr=%.2f ofs=%+.2f fault=%d\n",
                      logTag, ang, speed, yaw0, yaw1, peakOver, settledErr,
                      smallAngle_turnDegree, turnRightOffsetDeg, (int)s_tuneFault);
        if (s_tuneFault != 0) return false;
        errs[i] = settledErr;
        if (!tunePauseMs(220)) return false;
    }
    outErrR = errs[0];
    outErrL = errs[1];
    float worstErr = (fabsf(errs[0]) > fabsf(errs[1])) ? errs[0] : errs[1];
    if (onProgress) onProgress(uiTag, pct, worstErr);
    return true;
}

static void adjustSpinPairAsymmetry(float errR, float errL) {
    float asymL = (errL - errR) * 0.5f; // + = Left overshot more than Right
    if (fabsf(asymL) > 0.5f) {
        float step = constrain(asymL * 0.45f, -1.2f, 1.2f);
        spinLeftOffsetDeg = constrain(spinLeftOffsetDeg + step, -3.5f, 3.5f);
    }
}

static void autoTuneRunStages(float &outSpinErr, float &outTurnErr,
                              void (*onProgress)(const char* stage, int pct, float lastErr)) {
    threshold_spinDegree  = 3.0f;
    spinLeftOffsetDeg     = 0.0f;
    smallAngle_turnDegree = 5.5f;
    turnRightOffsetDeg    = 0.0f;
    smallAngle_threshold  = 55.0f;
    spinKp      = constrain(spinKp, 0.70f, 1.30f);
    spinKd      = constrain(spinKd, 0.45f, 1.40f);
    turnFrontKp = constrain(turnFrontKp, 0.90f, 2.00f);
    turnFrontKd = constrain(turnFrontKd, 0.80f, 1.80f);
    turnBackKp  = turnFrontKp;
    turnBackKd  = turnFrontKd;

    setAngleOffset();
    current_degree = 0.0f;
    if (!tunePauseMs(150)) return;
    if (onProgress) onProgress("SPIN LOW (35)", 5, 0.0f);

    // --- Stage 1: SPIN LOW (35) ---
    const float dirs2[2] = { 1.0f, -1.0f };
    for (int i = 0; i < 2; i++) {
        if (tuneCheckAbort()) return;
        float peakOver = 0.0f, settledErr = 0.0f, yaw0 = 0.0f, yaw1 = 0.0f;
        measureSpinTrial(dirs2[i] * 90.0f, 35, peakOver, settledErr, yaw0, yaw1);
        Serial.printf("[TUNE] SPIN LOW(35) dir=%+.0f yaw=%.1f->%.1f peak=%+.1f err=%+.1f Kp=%.2f Kd=%.2f fault=%d\n",
                      dirs2[i] * 90.0f, yaw0, yaw1, peakOver, settledErr, spinKp, spinKd, (int)s_tuneFault);
        if (s_tuneFault != 0) return;
        adjustSpinGains(peakOver, settledErr);
        outSpinErr = settledErr;
        if (onProgress) onProgress("SPIN LOW (35)", 10 + i * 8, settledErr);
        if (!tunePauseMs(260)) return;
    }

    // --- Stage 2: SPIN MID (50) + Consecutive ---
    float spinMidErr[2] = { 0.0f, 0.0f };
    for (int i = 0; i < 2; i++) {
        if (tuneCheckAbort()) return;
        float peakOver = 0.0f, settledErr = 0.0f, yaw0 = 0.0f, yaw1 = 0.0f;
        measureSpinTrial(dirs2[i] * 90.0f, 50, peakOver, settledErr, yaw0, yaw1);
        Serial.printf("[TUNE] SPIN MID(50) dir=%+.0f yaw=%.1f->%.1f peak=%+.1f err=%+.1f Kp=%.2f Kd=%.2f fault=%d\n",
                      dirs2[i] * 90.0f, yaw0, yaw1, peakOver, settledErr, spinKp, spinKd, (int)s_tuneFault);
        if (s_tuneFault != 0) return;
        spinMidErr[i] = settledErr;
        adjustSpinGains(peakOver, settledErr);
        outSpinErr = settledErr;
        if (onProgress) onProgress("SPIN MID (50)", 24 + i * 6, settledErr);
        if (!tunePauseMs(260)) return;
    }
    adjustSpinPairAsymmetry(spinMidErr[0], spinMidErr[1]);
    for (int p = 0; p < 2; p++) {
        if (tuneCheckAbort()) return;
        float dir = dirs2[p];
        float startYaw = safeReadYaw();
        current_degree = startYaw;
        spinDegreeCore(dir * 90.0f, threshold_spinDegree, 50, true, false);
        if (s_tuneFault != 0) return;
        if (!tunePauseMs(100)) return;
        spinDegreeCore(dir * 90.0f, threshold_spinDegree, 50, true, false);
        if (s_tuneFault != 0) return;
        float peakOver = 0.0f, cumErr = 0.0f, endYaw = 0.0f;
        measureSettleWindow(wrapDeg180(startYaw + dir * 180.0f), dir >= 0.0f, peakOver, cumErr, endYaw);
        Serial.printf("[TUNE] SPIN SEQ(50) dir=%+.0f yaw=%.1f->%.1f cumErr=%+.1f Kp=%.2f Kd=%.2f fault=%d\n",
                      dir * 180.0f, startYaw, endYaw, cumErr, spinKp, spinKd, (int)s_tuneFault);
        if (s_tuneFault != 0) return;
        adjustSpinGains(peakOver, cumErr * 0.5f);
        outSpinErr = cumErr * 0.5f;
        if (onProgress) onProgress("SPIN SEQ (50)", 36 + p * 5, outSpinErr);
        if (!tunePauseMs(260)) return;
    }

    // --- Stage 3: SPIN HIGH (65 -> 80 or fallback 55 -> 50) ---
    int bestSpinMax = 50;
    bool spin65Ok = true;
    float spinHi65Err[2] = { 0.0f, 0.0f };
    for (int i = 0; i < 2; i++) {
        if (tuneCheckAbort()) return;
        float peakOver = 0.0f, settledErr = 0.0f, yaw0 = 0.0f, yaw1 = 0.0f;
        measureSpinTrial(dirs2[i] * 90.0f, 65, peakOver, settledErr, yaw0, yaw1);
        Serial.printf("[TUNE] SPIN HI(65) dir=%+.0f yaw=%.1f->%.1f peak=%+.1f err=%+.1f fault=%d\n",
                      dirs2[i] * 90.0f, yaw0, yaw1, peakOver, settledErr, (int)s_tuneFault);
        if (s_tuneFault != 0) return;
        spinHi65Err[i] = settledErr;
        outSpinErr = settledErr;
        if (peakOver > 8.5f || fabsf(settledErr) > 4.0f) {
            spinKd = constrain(spinKd + 0.14f, 0.30f, 2.00f);
            spinKp = constrain(spinKp - 0.06f, 0.55f, 1.80f);
            spin65Ok = false;
        } else {
            adjustSpinGains(peakOver, settledErr);
        }
        if (onProgress) onProgress("SPIN HI (65)", 46 + i * 4, settledErr);
        if (!tunePauseMs(260)) return;
    }
    adjustSpinPairAsymmetry(spinHi65Err[0], spinHi65Err[1]);
    if (spin65Ok) {
        bestSpinMax = 65;
        bool spin80Ok = true;
        float spinHi80Err[2] = { 0.0f, 0.0f };
        for (int i = 0; i < 2; i++) {
            if (tuneCheckAbort()) return;
            float peakOver = 0.0f, settledErr = 0.0f, yaw0 = 0.0f, yaw1 = 0.0f;
            measureSpinTrial(dirs2[i] * 90.0f, 80, peakOver, settledErr, yaw0, yaw1);
            Serial.printf("[TUNE] SPIN MAX(80) dir=%+.0f yaw=%.1f->%.1f peak=%+.1f err=%+.1f slofs=%+.2f fault=%d\n",
                          dirs2[i] * 90.0f, yaw0, yaw1, peakOver, settledErr, spinLeftOffsetDeg, (int)s_tuneFault);
            if (s_tuneFault != 0) return;
            spinHi80Err[i] = settledErr;
            outSpinErr = settledErr;
            if (peakOver > 8.5f || fabsf(settledErr) > 4.0f) {
                spin80Ok = false;
            } else {
                adjustSpinGains(peakOver, settledErr);
            }
            if (onProgress) onProgress("SPIN MAX (80)", 53 + i * 3, settledErr);
            if (!tunePauseMs(260)) return;
        }
        adjustSpinPairAsymmetry(spinHi80Err[0], spinHi80Err[1]);
        if (spin80Ok) bestSpinMax = 80;
    } else {
        if (tuneCheckAbort()) return;
        float peakOver = 0.0f, settledErr = 0.0f, yaw0 = 0.0f, yaw1 = 0.0f;
        measureSpinTrial(90.0f, 55, peakOver, settledErr, yaw0, yaw1);
        Serial.printf("[TUNE] SPIN CAP(55) yaw=%.1f->%.1f peak=%+.1f err=%+.1f fault=%d\n",
                      yaw0, yaw1, peakOver, settledErr, (int)s_tuneFault);
        if (s_tuneFault != 0) return;
        outSpinErr = settledErr;
        if (peakOver <= 8.5f && fabsf(settledErr) <= 4.0f) {
            adjustSpinGains(peakOver, settledErr);
            bestSpinMax = 55;
        }
        if (onProgress) onProgress("SPIN CAP (55)", 56, settledErr);
        if (!tunePauseMs(260)) return;
    }
    spinMaxSpeed = bestSpinMax;

    // --- Stage 4: TURN FRONT SAFE PROBE -> BEST-SEARCH RIGHT/LEFT -> FINAL VERIFY ---
    {
        const int probeSpeeds[4] = { 70, 85, 95, 100 };
        int bestFrontMax = 70;
        float probeThr = 5.5f;
        turnRightOffsetDeg = 0.0f;

        for (int idx = 0; idx < 4; idx++) {
            if (tuneCheckAbort()) return;
            int sp = probeSpeeds[idx];
            smallAngle_turnDegree = probeThr;
            float peakOver = 0.0f, settledErr = 0.0f, yaw0 = 0.0f, yaw1 = 0.0f;
            measureSwingTrial(90.0f, sp, false, peakOver, settledErr, yaw0, yaw1);
            Serial.printf("[TUNE] TRN_F PROBE(%d) yaw=%.1f->%.1f peak=%+.1f err=%+.1f thr=%.2f Kp=%.2f Kd=%.2f fault=%d\n",
                          sp, yaw0, yaw1, peakOver, settledErr, probeThr, turnFrontKp, turnFrontKd, (int)s_tuneFault);
            if (s_tuneFault != 0) return;

            if (sp > 70 && peakOver > 8.0f) {
                if (onProgress) onProgress("TURN F PROBE", 58 + idx * 2, settledErr);
                if (!tunePauseMs(220)) return;
                break;
            }
            bestFrontMax = sp;
            if (peakOver > 4.0f) {
                turnFrontKd = constrain(turnFrontKd + 0.08f, 0.80f, 1.80f);
                turnFrontKp = constrain(turnFrontKp - 0.05f, 0.90f, 1.80f);
            }
            probeThr = constrain(probeThr + constrain(settledErr * 0.65f, -5.0f, 5.0f), 1.5f, 30.0f);
            if (onProgress) onProgress("TURN F PROBE", 58 + idx * 2, settledErr);
            if (!tunePauseMs(220)) return;
        }

        float bestThrR = probeThr, bestErrR = 999.0f;
        if (!tuneSwingSideThreshold(90.0f, bestFrontMax, probeThr, "TRN_F R", "TURN F RIGHT", 66, 8, bestThrR, bestErrR, onProgress)) return;

        float bestThrL = bestThrR, bestErrL = 999.0f;
        if (!tuneSwingSideThreshold(-90.0f, bestFrontMax, bestThrR, "TRN_F L", "TURN F LEFT", 74, 8, bestThrL, bestErrL, onProgress)) return;

        if (bestFrontMax > 70 && (fabsf(bestErrR) > 2.2f || fabsf(bestErrL) > 2.2f)) {
            bestFrontMax = (bestFrontMax >= 95) ? 85 : 70;
            if (!tuneSwingSideThreshold(90.0f, bestFrontMax, bestThrR, "TRN_F R2", "TURN F RIGHT*", 76, 3, bestThrR, bestErrR, onProgress)) return;
            if (!tuneSwingSideThreshold(-90.0f, bestFrontMax, bestThrL, "TRN_F L2", "TURN F LEFT*", 79, 3, bestThrL, bestErrL, onProgress)) return;
        }

        float candThr1 = constrain((bestThrR + bestThrL) * 0.5f, 1.5f, 30.0f);
        float candOfs1 = constrain((bestThrR - bestThrL) * 0.5f, -10.0f, 10.0f);
        smallAngle_turnDegree = candThr1;
        turnRightOffsetDeg    = candOfs1;
        float ver1R = 0.0f, ver1L = 0.0f;
        if (!verifySwingFrontPair("TRN_F VER1", "TURN F VERIFY", 83, bestFrontMax, ver1R, ver1L, onProgress)) return;
        float bestVerR = ver1R, bestVerL = ver1L;
        float bestVerScore = fabsf(ver1R) + fabsf(ver1L);

        if (fabsf(ver1R) > 1.0f || fabsf(ver1L) > 1.0f) {
            float polThrR = (fabsf(ver1R) > 0.6f) ? constrain(bestThrR + constrain(ver1R * 0.55f, -2.5f, 2.5f), 1.5f, 30.0f) : bestThrR;
            float polThrL = (fabsf(ver1L) > 0.6f) ? constrain(bestThrL + constrain(ver1L * 0.55f, -2.5f, 2.5f), 1.5f, 30.0f) : bestThrL;
            smallAngle_turnDegree = constrain((polThrR + polThrL) * 0.5f, 1.5f, 30.0f);
            turnRightOffsetDeg    = constrain((polThrR - polThrL) * 0.5f, -10.0f, 10.0f);
            float ver2R = 0.0f, ver2L = 0.0f;
            if (!verifySwingFrontPair("TRN_F VER2", "TURN F RE-VER", 85, bestFrontMax, ver2R, ver2L, onProgress)) return;
            float score2 = fabsf(ver2R) + fabsf(ver2L);
            if (score2 <= bestVerScore) {
                bestVerR = ver2R;
                bestVerL = ver2L;
            } else {
                smallAngle_turnDegree = candThr1;
                turnRightOffsetDeg    = candOfs1;
            }
        }
        outTurnErr = (fabsf(bestVerR) > fabsf(bestVerL)) ? bestVerR : bestVerL;
        turnFrontMaxSpeed = bestFrontMax;
    }

    // --- Stage 5: TURN BACK LOW(70) -> MID(85) -> HIGH(95 -> 100, fallback 85) ---
    turnBackKp = turnFrontKp;
    turnBackKd = turnFrontKd;
    int bestBackMax = 85;
    {
        if (tuneCheckAbort()) return;
        float peakOver = 0.0f, settledErr = 0.0f, yaw0 = 0.0f, yaw1 = 0.0f;
        measureSwingTrial(90.0f, 70, true, peakOver, settledErr, yaw0, yaw1);
        Serial.printf("[TUNE] TRN_B(70) ang=+90 yaw=%.1f->%.1f peak=%+.1f err=%+.1f thr=%.1f Kp=%.2f Kd=%.2f fault=%d\n",
                      yaw0, yaw1, peakOver, settledErr, smallAngle_turnDegree, turnBackKp, turnBackKd, (int)s_tuneFault);
        if (s_tuneFault != 0) return;
        adjustSwingGains(turnBackKp, turnBackKd, peakOver, settledErr, false);
        if (onProgress) onProgress("TURN B LOW (70)", 86, settledErr);
        if (!tunePauseMs(260)) return;

        measureSwingTrial(-90.0f, 85, true, peakOver, settledErr, yaw0, yaw1);
        Serial.printf("[TUNE] TRN_B(85) ang=-90 yaw=%.1f->%.1f peak=%+.1f err=%+.1f thr=%.1f Kp=%.2f Kd=%.2f fault=%d\n",
                      yaw0, yaw1, peakOver, settledErr, smallAngle_turnDegree, turnBackKp, turnBackKd, (int)s_tuneFault);
        if (s_tuneFault != 0) return;
        adjustSwingGains(turnBackKp, turnBackKd, peakOver, settledErr, false);
        if (onProgress) onProgress("TURN B MID (85)", 91, settledErr);
        if (!tunePauseMs(260)) return;

        measureSwingTrial(90.0f, 95, true, peakOver, settledErr, yaw0, yaw1);
        Serial.printf("[TUNE] TRN_B(95) ang=+90 yaw=%.1f->%.1f peak=%+.1f err=%+.1f thr=%.1f Kp=%.2f Kd=%.2f fault=%d\n",
                      yaw0, yaw1, peakOver, settledErr, smallAngle_turnDegree, turnBackKp, turnBackKd, (int)s_tuneFault);
        if (s_tuneFault != 0) return;
        if (peakOver <= 8.0f && fabsf(settledErr) <= 3.5f) {
            adjustSwingGains(turnBackKp, turnBackKd, peakOver, settledErr, false);
            bestBackMax = 95;
            if (onProgress) onProgress("TURN B HI (95)", 96, settledErr);
            if (!tunePauseMs(260)) return;
            measureSwingTrial(-90.0f, 100, true, peakOver, settledErr, yaw0, yaw1);
            Serial.printf("[TUNE] TRN_B MAX(100) ang=-90 yaw=%.1f->%.1f peak=%+.1f err=%+.1f thr=%.1f fault=%d\n",
                          yaw0, yaw1, peakOver, settledErr, smallAngle_turnDegree, (int)s_tuneFault);
            if (s_tuneFault != 0) return;
            if (peakOver <= 8.0f && fabsf(settledErr) <= 3.5f) {
                adjustSwingGains(turnBackKp, turnBackKd, peakOver, settledErr, false);
                bestBackMax = 100;
            }
            if (onProgress) onProgress("TURN B MAX(100)", 100, settledErr);
        } else {
            bestBackMax = 85;
            if (onProgress) onProgress("TURN B CAP (85)", 100, settledErr);
        }
    }
    turnBackMaxSpeed = bestBackMax;

    setAngleOffset();
    current_degree = 0.0f;
    configSave();
}

void autoTuneSpinAndTurn(float &outSpinErr, float &outTurnErr,
                         void (*onProgress)(const char* stage, int pct, float lastErr)) {
    outSpinErr = 0.0f;
    outTurnErr = 0.0f;
    s_tuneActive = true;
    s_tuneFault  = 0;

    autoTuneRunStages(outSpinErr, outTurnErr, onProgress);

    driveStop();
    s_tuneActive = false;
    if (s_tuneFault != 0) {
        outSpinErr = 900.0f + (float)s_tuneFault;
    }
}
