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

static void spinApplyBrake(float rateMag, float fusedRate100ms, bool spinRight, bool &braked) {
    if (braked || rateMag <= 7.0f) return;
    // กำลังหมุนขวา (CW) -> ยิงเบรกสวนไปซ้าย (-, +), หมุนซ้าย (CCW) -> ยิงสวนไปขวา (+, -)
    bool movingRight = (fabsf(fusedRate100ms) > 2.0f) ? (fusedRate100ms > 0.0f) : spinRight;
    int brakeSpd = constrain((int)roundf(rateMag * 0.60f), 14, 40);
    int brakeMs  = constrain((int)roundf(rateMag * 0.35f), 5, 10);
    int brakeDir = movingRight ? -1 : 1;
    safeMotorWrite2(brakeDir * brakeSpd, -brakeDir * brakeSpd);
    delay(brakeMs);
    braked = true;
}

static bool spinWaitSettleMs(unsigned long waitMs) {
    unsigned long w0 = millis();
    while (millis() - w0 < waitMs) {
        serviceNonBlockingBeep();
        if (s_tuneActive && (readSwitch(A) || readSwitch(B))) {
            driveStop();
            s_tuneFault = 1;
            return false;
        }
        delay(2);
    }
    return true;
}

static void spinDegreeCore(float relativeDeg, float threshold, int maxSpeedOverride,
                           bool stopAtEnd, bool notifyHud) {
    clearTurnDistCarry();
    current_degree = wrapDeg180(current_degree + relativeDeg);
    bool hudNotified = !notifyHud;

    const int minSpd = spinMinSpeed;
    const int maxSpd = (maxSpeedOverride > 0)
                           ? max(minSpd, constrain(abs(maxSpeedOverride), 15, 100))
                           : spinMaxSpeed;
    const unsigned long postWaitMs = constrain(spinPostDelayMs, 20UL, 80UL);
    const unsigned long timeoutMs  = s_tuneActive ? 2200UL : 3000UL;
    const bool spinRight = (relativeDeg >= 0.0f);
    const float spinSpan = (fabsf(relativeDeg) >= 5.0f) ? fabsf(relativeDeg) : 90.0f;
    const float angleScale = constrain(spinSpan / 90.0f, 0.55f, 1.0f);
    const float dirSpinThr = threshold + (spinRight ? -spinLeftOffsetDeg : spinLeftOffsetDeg);
    const float effThreshold = min(constrain(dirSpinThr, 1.0f, 16.0f) * angleScale, spinSpan * 0.45f);

    fusedHeadingSyncToImu();
    float startYaw = 0.0f, initRate = 0.0f;
    fusedHeadingUpdate(startYaw, initRate);
    float smoothRate = 0.0f;
    float maxTravelDeg = 0.0f;
    unsigned long startMs = millis();
    unsigned long lowRateSinceMs = 0;
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

        float yaw = 0.0f, fusedRate100ms = 0.0f;
        fusedHeadingUpdate(yaw, fusedRate100ms);
        unsigned long now = millis();

        if (didMove && fabsf(fusedRate100ms) < 2.0f) {
            if (lowRateSinceMs == 0) lowRateSinceMs = now;
        } else {
            lowRateSinceMs = 0;
        }
        bool stalled = (lowRateSinceMs != 0 && (now - lowRateSinceMs) >= 40UL);

        float travelFromStart = fabsf(wrapDeg180(yaw - startYaw));
        if (travelFromStart > maxTravelDeg) maxTravelDeg = travelFromStart;

        float error = wrapDeg180(current_degree - yaw);
        if (!didMove && fabsf(relativeDeg) >= 170.0f) {
            if (spinRight && error < 0.0f) error += 360.0f;
            else if (!spinRight && error > 0.0f) error -= 360.0f;
        }

        float approachingRate = (error > 0.0f) ? fusedRate100ms : (-fusedRate100ms);
        if (approachingRate > 0.0f) {
            smoothRate = (smoothRate <= 0.1f)
                             ? approachingRate
                             : (0.65f * approachingRate + 0.35f * smoothRate);
        } else {
            smoothRate *= 0.4f;
        }
        float stopLeadDeg = (stopAtEnd && !didPostCorrect && smoothRate > 4.0f)
                                ? constrain(smoothRate * 0.17f, 0.0f, 8.5f)
                                : 0.0f;
        float stopBandDeg = didPostCorrect ? 1.6f : (effThreshold + stopLeadDeg);

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

        if (fabsf(error) <= stopBandDeg) {
            if (!stopAtEnd) {
                reachedTarget = true;
                break;
            }
            if (!didPostCorrect) {
                spinApplyBrake(smoothRate, fusedRate100ms, spinRight, braked);
            }
            driveStop();
            lastSentSpd = 999;

            if (s_tuneActive) {
                reachedTarget = true;
                break;
            }

            unsigned long waitTarget = didPostCorrect ? 20UL : postWaitMs;
            if (!spinWaitSettleMs(waitTarget)) return;

            float postErr = wrapDeg180(current_degree - safeReadYaw());
            if (didPostCorrect || fabsf(postErr) <= 2.6f) {
                reachedTarget = true;
                break;
            }
            didPostCorrect = true;
            braked         = true;
            signCrossCount = max(signCrossCount, 1);
            lastErrSign    = (postErr > 0.0f) ? 1 : -1;
            fusedHeadingSyncToImu();
            continue;
        }

        int errSign = (error > 0.0f) ? 1 : -1;
        if (didMove && lastErrSign != 0 && errSign != lastErrSign) {
            signCrossCount++;
            if (stopAtEnd && !didPostCorrect) {
                spinApplyBrake(fabsf(fusedRate100ms), fusedRate100ms, spinRight, braked);
            }
            driveStop();
            lastSentSpd = 999;
            if (s_tuneActive || !stopAtEnd) {
                reachedTarget = true;
                break;
            }
            if (didPostCorrect || signCrossCount >= 2) {
                if (!spinWaitSettleMs(20UL)) return;
                reachedTarget = true;
                break;
            }
            if (!spinWaitSettleMs(postWaitMs)) return;
            float postErr = wrapDeg180(current_degree - safeReadYaw());
            if (fabsf(postErr) <= 2.6f) {
                reachedTarget = true;
                break;
            }
            didPostCorrect = true;
            braked         = true;
            lastErrSign    = (postErr > 0.0f) ? 1 : -1;
            fusedHeadingSyncToImu();
            continue;
        }
        lastErrSign = errSign;

        unsigned long elapsed = now - startMs;
        int corrSpd      = stalled ? minSpd : max(18, minSpd - 2);
        int landFloor    = max(16, minSpd - 4);
        int dynMinSpd    = minSpd;
        if (signCrossCount == 0 && !didPostCorrect && !stalled && fabsf(error) < 12.0f && minSpd > landFloor) {
            dynMinSpd = landFloor + (int)((fabsf(error) / 12.0f) * (minSpd - landFloor));
        }
        int floorSpd     = (signCrossCount > 0 || didPostCorrect) ? corrSpd : dynMinSpd;
        int activeMaxSpd = (signCrossCount > 0 || didPostCorrect) ? corrSpd : maxSpd;
        int launchFloor  = (signCrossCount > 0 || didPostCorrect) ? floorSpd : min(activeMaxSpd, max(floorSpd, 46));
        int rampMaxSpd   = (elapsed < 28UL && activeMaxSpd > launchFloor)
                               ? (launchFloor + (int)(((float)elapsed / 28.0f) * (activeMaxSpd - launchFloor)))
                               : activeMaxSpd;
        const float spinDecelDeg = max(12.0f, min(smallAngle_threshold, fabsf(relativeDeg) * 0.65f));
        if (signCrossCount == 0 && !didPostCorrect && fabsf(error) < spinDecelDeg && rampMaxSpd > floorSpd) {
            int distCap = floorSpd + (int)((fabsf(error) / spinDecelDeg) * (activeMaxSpd - floorSpd));
            if (distCap < rampMaxSpd) rampMaxSpd = distCap;
        }

        float pTerm = fabsf(error) * spinKp;
        float dBrake = 0.0f;
        if (signCrossCount == 0 && !didPostCorrect && fabsf(error) < spinDecelDeg && smoothRate > 0.0f) {
            float decelBlend = constrain(1.20f - (fabsf(error) / spinDecelDeg), 0.15f, 1.0f);
            dBrake = smoothRate * spinKd * 0.65f * decelBlend;
        }
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
        clearTurnDistCarry();
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
    float rollOutArcDeg    = fabsf(relativeDeg);
    float rollOutNewAxisCm = 0.0f;
    long  rollPrevEnc[4]   = { 0, 0, 0, 0 };
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
            bool crossedZero = (didMove && lastErrSign != 0 && errSign != lastErrSign);
            if (fabsf(error) <= blendZoneDeg || crossedZero) {
                inRollOut = true;
                rollOutStartMs = now;
                rollOutArcDeg = crossedZero
                                    ? fabsf(relativeDeg)
                                    : constrain(fabsf(relativeDeg) - fabsf(error), 0.0f, fabsf(relativeDeg));
                readPtEncoders(rollPrevEnc);
            }
        }

        if (inRollOut) {
            long curEnc[4];
            readPtEncoders(curEnc);
            float dL = 0.5f * (float)((curEnc[0] - rollPrevEnc[0]) + (curEnc[1] - rollPrevEnc[1]));
            float dR = 0.5f * (float)((curEnc[2] - rollPrevEnc[2]) + (curEnc[3] - rollPrevEnc[3]));
            for (int i = 0; i < 4; i++) rollPrevEnc[i] = curEnc[i];
            float signedTicks = isBack ? (-0.5f * (dL + dR)) : (0.5f * (dL + dR));
            if (signedTicks > 0.0f && signedTicks < 800.0f) {
                float stepCm = signedTicks / max(80.0f, ticksPerCm);
                rollOutNewAxisCm += stepCm * cosf(fabsf(error) * 0.0174532925f);
            }

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

            int trimL = getLeftMotorTrim();
            int trimR = getRightMotorTrim();
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

            int trimL = getLeftMotorTrim();
            int trimR = getRightMotorTrim();
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

    if (!stopAtEnd && !s_tuneActive && enableTurnDistComp && reachedTarget) {
        float thetaRad = constrain(fabsf(relativeDeg), 5.0f, 135.0f) * 0.0174532925f;
        float alphaRad = constrain(rollOutArcDeg, 0.0f, fabsf(relativeDeg)) * 0.0174532925f;
        float innerScale = (turnInnerRatio > 0.01f && turnInnerRatio < 0.85f)
                               ? ((1.0f + turnInnerRatio) / (1.0f - turnInnerRatio))
                               : 1.0f;
        float effR = max(0.0f, turnExitRadiusCm) * innerScale;
        float arcFactor = (1.0f - cosf(alphaRad)) * sinf(thetaRad)
                        + (sinf(alphaRad) - tanf(thetaRad * 0.5f)) * cosf(thetaRad);
        float arcNewCm  = max(0.0f, effR * arcFactor);
        float rollCm    = constrain(rollOutNewAxisCm, 0.0f, 15.0f);
        float exitCm    = constrain(arcNewCm + rollCm, 0.0f, 22.0f);
        setTurnDistCarry(isBack ? -exitCm : exitCm);
    } else {
        clearTurnDistCarry();
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
    clearTurnDistCarry();
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
    fusedHeadingSyncToImu();
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

static bool tuneSpinSideThreshold(float relDeg, int speed, float initThr,
                                  const char* logTag, const char* uiTag, int pctStart, int pctSpan,
                                  float &outBestThr, float &outBestErr, float &outBestPeak,
                                  void (*onProgress)(const char* stage, int pct, float lastErr)) {
    spinLeftOffsetDeg = 0.0f;
    const int MAX_ITERS = 6;
    float curThr   = constrain(initThr, 1.0f, 14.0f);
    float bestThr  = curThr;
    float bestErr  = 999.0f;
    float bestPeak = 999.0f;
    bool hasLow = false, hasHigh = false;
    float lowThr = 1.0f, lowErr = 0.0f;
    float highThr = 14.0f, highErr = 0.0f;

    for (int iter = 0; iter < MAX_ITERS; iter++) {
        if (tuneCheckAbort()) return false;
        threshold_spinDegree = curThr;
        float peakOver = 0.0f, settledErr = 0.0f, yaw0 = 0.0f, yaw1 = 0.0f;
        measureSpinTrial(relDeg, speed, peakOver, settledErr, yaw0, yaw1);

        if (s_tuneFault == 0) {
            if (fabsf(settledErr) < fabsf(bestErr)) {
                bestErr  = settledErr;
                bestThr  = curThr;
                bestPeak = peakOver;
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
            float step = constrain(settledErr * 0.70f, -3.5f, 3.5f);
            if (fabsf(step) < 0.25f) step = (settledErr >= 0.0f) ? 0.25f : -0.25f;
            nextThr = curThr + step;
        }
        nextThr = constrain(nextThr, 1.0f, 14.0f);
        if (fabsf(nextThr - curThr) < 0.05f) break;
        curThr = nextThr;
    }

    outBestThr  = bestThr;
    outBestErr  = bestErr;
    outBestPeak = bestPeak;
    return true;
}

static bool verifySpinPair(const char* logTag, const char* uiTag, int pct, int speed,
                           float &outErrR, float &outErrL, float &outWorstPeak,
                           void (*onProgress)(const char* stage, int pct, float lastErr)) {
    const float dirs2[2] = { 1.0f, -1.0f };
    float errs[2] = { 0.0f, 0.0f };
    float worstPeak = -999.0f;
    for (int i = 0; i < 2; i++) {
        if (tuneCheckAbort()) return false;
        float ang = dirs2[i] * 90.0f;
        float peakOver = 0.0f, settledErr = 0.0f, yaw0 = 0.0f, yaw1 = 0.0f;
        measureSpinTrial(ang, speed, peakOver, settledErr, yaw0, yaw1);
        Serial.printf("[TUNE] %s ang=%+.0f spd=%d yaw=%.1f->%.1f peak=%+.1f err=%+.1f thr=%.2f slofs=%+.2f fault=%d\n",
                      logTag, ang, speed, yaw0, yaw1, peakOver, settledErr,
                      threshold_spinDegree, spinLeftOffsetDeg, (int)s_tuneFault);
        if (s_tuneFault != 0) return false;
        errs[i] = settledErr;
        if (peakOver > worstPeak) worstPeak = peakOver;
        if (!tunePauseMs(220)) return false;
    }
    outErrR = errs[0];
    outErrL = errs[1];
    outWorstPeak = worstPeak;
    float worstErr = (fabsf(errs[0]) > fabsf(errs[1])) ? errs[0] : errs[1];
    if (onProgress) onProgress(uiTag, pct, worstErr);
    return true;
}

static void autoTuneRunStages(float &outSpinErr, float &outTurnErr,
                              void (*onProgress)(const char* stage, int pct, float lastErr)) {
    threshold_spinDegree  = 3.4f;
    spinLeftOffsetDeg     = 0.0f;
    smallAngle_turnDegree = 5.5f;
    turnRightOffsetDeg    = 0.0f;
    smallAngle_threshold  = 55.0f;
    spinKp      = constrain(spinKp, 0.80f, 1.40f);
    spinKd      = constrain(spinKd, 0.80f, 1.80f);
    turnFrontKp = constrain(turnFrontKp, 0.90f, 2.00f);
    turnFrontKd = constrain(turnFrontKd, 0.80f, 1.80f);
    turnBackKp  = turnFrontKp;
    turnBackKd  = turnFrontKd;

    setAngleOffset();
    current_degree = 0.0f;
    if (!tunePauseMs(150)) return;
    if (onProgress) onProgress("SPIN PROBE", 5, 0.0f);

    // --- Stage 1: SPIN SAFE PROBE (50 -> 65 -> 75 -> 80) ---
    int bestSpinMax = 50;
    float probeThr  = 3.4f;
    {
        const int probeSpeeds[4] = { 50, 65, 75, 80 };
        for (int idx = 0; idx < 4; idx++) {
            if (tuneCheckAbort()) return;
            int sp = probeSpeeds[idx];
            threshold_spinDegree = probeThr;
            float peakOver = 0.0f, settledErr = 0.0f, yaw0 = 0.0f, yaw1 = 0.0f;
            measureSpinTrial(90.0f, sp, peakOver, settledErr, yaw0, yaw1);
            Serial.printf("[TUNE] SPIN PROBE(%d) yaw=%.1f->%.1f peak=%+.1f err=%+.1f thr=%.2f Kp=%.2f Kd=%.2f fault=%d\n",
                          sp, yaw0, yaw1, peakOver, settledErr, probeThr, spinKp, spinKd, (int)s_tuneFault);
            if (s_tuneFault != 0) return;

            float rebound = peakOver - settledErr;
            if (sp > 50 && (peakOver > 9.0f || rebound > 3.5f)) {
                spinKd = constrain(spinKd + 0.08f, 0.60f, 2.00f);
                smallAngle_threshold = constrain(smallAngle_threshold + 3.0f, 45.0f, 75.0f);
                outSpinErr = settledErr;
                if (onProgress) onProgress("SPIN PROBE", 6 + idx * 3, settledErr);
                if (!tunePauseMs(220)) return;
                break;
            }
            bestSpinMax = sp;
            if (peakOver > 4.0f) {
                spinKd = constrain(spinKd + 0.08f, 0.60f, 2.00f);
                spinKp = constrain(spinKp - 0.04f, 0.75f, 1.50f);
                smallAngle_threshold = constrain(smallAngle_threshold + 2.0f, 45.0f, 75.0f);
            }
            probeThr = constrain(probeThr + constrain(settledErr * 0.65f, -3.5f, 3.5f), 1.2f, 14.0f);
            outSpinErr = settledErr;
            if (onProgress) onProgress("SPIN PROBE", 6 + idx * 3, settledErr);
            if (!tunePauseMs(220)) return;
        }
    }

    // --- Stage 2 & 3: SPIN BEST-SEARCH RIGHT/LEFT -> COMBINE + VERIFY PAIR + POLISH ---
    {
        float bestThrR = probeThr, bestErrR = 999.0f, bestPeakR = 999.0f;
        if (!tuneSpinSideThreshold(90.0f, bestSpinMax, probeThr, "SPIN R", "SPIN RIGHT", 18, 12,
                                   bestThrR, bestErrR, bestPeakR, onProgress)) return;

        float bestThrL = bestThrR, bestErrL = 999.0f, bestPeakL = 999.0f;
        if (!tuneSpinSideThreshold(-90.0f, bestSpinMax, bestThrR, "SPIN L", "SPIN LEFT", 30, 12,
                                   bestThrL, bestErrL, bestPeakL, onProgress)) return;

        if (bestSpinMax > 50 &&
            (fabsf(bestErrR) > 2.0f || fabsf(bestErrL) > 2.0f || bestPeakR > 4.5f || bestPeakL > 4.5f)) {
            bestSpinMax = (bestSpinMax >= 80) ? 70 : ((bestSpinMax >= 70) ? 60 : 50);
            spinKd = constrain(spinKd + 0.08f, 0.60f, 2.00f);
            if (!tuneSpinSideThreshold(90.0f, bestSpinMax, bestThrR, "SPIN R2", "SPIN RIGHT*", 42, 2,
                                       bestThrR, bestErrR, bestPeakR, onProgress)) return;
            if (!tuneSpinSideThreshold(-90.0f, bestSpinMax, bestThrL, "SPIN L2", "SPIN LEFT*", 44, 2,
                                       bestThrL, bestErrL, bestPeakL, onProgress)) return;
        }

        // dirSpinThr = threshold + (spinRight ? -spinLeftOffsetDeg : spinLeftOffsetDeg)
        // +90 -> thr - slofs = bestThrR, -90 -> thr + slofs = bestThrL
        float candThr1 = constrain((bestThrR + bestThrL) * 0.5f, 1.0f, 14.0f);
        float candOfs1 = constrain((bestThrL - bestThrR) * 0.5f, -5.0f, 5.0f);
        threshold_spinDegree = candThr1;
        spinLeftOffsetDeg    = candOfs1;

        float ver1R = 0.0f, ver1L = 0.0f, ver1Peak = 0.0f;
        if (!verifySpinPair("SPIN VER1", "SPIN VERIFY", 50, bestSpinMax,
                            ver1R, ver1L, ver1Peak, onProgress)) return;
        (void)ver1Peak;
        float bestVerR = ver1R, bestVerL = ver1L;
        float bestVerScore = fabsf(ver1R) + fabsf(ver1L);

        if (fabsf(ver1R) > 1.0f || fabsf(ver1L) > 1.0f) {
            float polThrR = (fabsf(ver1R) > 0.6f)
                                ? constrain(bestThrR + constrain(ver1R * 0.55f, -2.0f, 2.0f), 1.0f, 14.0f)
                                : bestThrR;
            float polThrL = (fabsf(ver1L) > 0.6f)
                                ? constrain(bestThrL + constrain(ver1L * 0.55f, -2.0f, 2.0f), 1.0f, 14.0f)
                                : bestThrL;
            threshold_spinDegree = constrain((polThrR + polThrL) * 0.5f, 1.0f, 14.0f);
            spinLeftOffsetDeg    = constrain((polThrL - polThrR) * 0.5f, -5.0f, 5.0f);
            float ver2R = 0.0f, ver2L = 0.0f, ver2Peak = 0.0f;
            if (!verifySpinPair("SPIN VER2", "SPIN RE-VER", 55, bestSpinMax,
                                ver2R, ver2L, ver2Peak, onProgress)) return;
            (void)ver2Peak;
            float score2 = fabsf(ver2R) + fabsf(ver2L);
            if (score2 <= bestVerScore) {
                bestVerR = ver2R;
                bestVerL = ver2L;
            } else {
                threshold_spinDegree = candThr1;
                spinLeftOffsetDeg    = candOfs1;
            }
        }
        outSpinErr   = (fabsf(bestVerR) > fabsf(bestVerL)) ? bestVerR : bestVerL;
        spinMaxSpeed = bestSpinMax;
    }

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
    clearTurnDistCarry();
    outSpinErr = 0.0f;
    outTurnErr = 0.0f;
    s_tuneActive = true;
    s_tuneFault  = 0;

    autoTuneRunStages(outSpinErr, outTurnErr, onProgress);

    driveStop();
    clearTurnDistCarry();
    s_tuneActive = false;
    if (s_tuneFault != 0) {
        outSpinErr = 900.0f + (float)s_tuneFault;
    }
}
