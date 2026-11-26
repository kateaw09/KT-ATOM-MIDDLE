// ============================================================================
// Move.ino — แกนควบคุมการเคลื่อนที่สะอาด (FC-Only + FF/BB Time + SetF/SetB + DropF/B + HUD)
//   - runEncoderMove(): แกนเดียวสำหรับเดินตาม Encoder (Speed-Invariant + Cosine + Anti-Stall + EKF)
//   - runTimedMove():   แกนเดียวสำหรับเดินจับเวลา FF / BB
//   - alignLineYaw():   แกนเดียวสำหรับจัดแนวเข้าเส้น SetF / SetB และ DropF / DropB
//   - MissionHUD (Core 0), STOP(), Flow & Turn-Exit Carry
// ============================================================================

static unsigned long s_missionStartMs  = 0;
static unsigned long s_pausedTotalMs   = 0;
static unsigned long s_pauseStartMs    = 0;
static volatile bool s_missionPaused   = false;
static volatile bool s_missionRunning  = false;
static unsigned long s_lastHudUpdateMs = 0;
static unsigned long s_beepStopMs      = 0;
static bool          s_beepActive      = false;

static int           s_activeIcon      = 0;
static int           s_lastDrawnIcon   = -1;
static unsigned long s_lastBlinkMs     = 0;
static bool          s_blinkState      = true;
static bool          s_inCompoundCmd   = false;
static char          s_compoundMain[24] = "";
static bool          s_compoundBeeped  = false;

// ----------------------------------------------------------------------------
// HUD เบื้องหลัง (Core 0): ลูปควบคุมมอเตอร์ (Core 1) ฝากข้อความแล้ววิ่งต่อทันที
// ----------------------------------------------------------------------------
static portMUX_TYPE      s_hudMux        = portMUX_INITIALIZER_UNLOCKED;
static volatile bool     s_hudDirty      = false;
static int               s_hudIcon       = 0;
static char              s_hudMain[24]   = "";
static char              s_hudSub[24]    = "";
static TaskHandle_t      s_hudTaskHandle = nullptr;
static SemaphoreHandle_t s_tftMutex      = nullptr;

static float wrapAngle180(float deg) {
    while (deg >  180.0f) deg -= 360.0f;
    while (deg < -180.0f) deg += 360.0f;
    return deg;
}

static bool buzzerWrite(bool on) {
    if (i2cMutex != nullptr && xSemaphoreTake(i2cMutex, 0) != pdTRUE) return false;
    pca_1.setPWM(5, 0, on ? 2000 : 0);
    if (i2cMutex != nullptr) xSemaphoreGive(i2cMutex);
    return true;
}

static void serviceNonBlockingBeep() {
    if (s_beepActive && (long)(millis() - s_beepStopMs) >= 0) {
        if (buzzerWrite(false)) s_beepActive = false;
    }
}

static void triggerCommandStartBeep() {
    if (!beepOnCmd) return;
    if (s_inCompoundCmd && s_compoundBeeped) return;
    if (s_inCompoundCmd) s_compoundBeeped = true;

    if (buzzerWrite(true)) {
        s_beepStopMs = millis() + 45UL;
        s_beepActive = true;
    }
}

void missionFinishCommandBeep() {
    // เสียงเตือนดังตอนเริ่มคำสั่งใน triggerCommandStartBeep() แล้ว
}

// ----------------------------------------------------------------------------
// Turn Exit Carry & Continuous Flow State
// ----------------------------------------------------------------------------
float g_turnExitCarryCm = 0.0f;

static int           g_flowLastDir        = 0;
static int           g_flowCarrySpeed     = 0;
static unsigned long g_flowStampMs        = 0;
static float         g_flowPendingCoastCm = 0.0f;

void clearMotionFlowState() {
    g_flowLastDir        = 0;
    g_flowCarrySpeed     = 0;
    g_flowStampMs        = 0;
    g_flowPendingCoastCm = 0.0f;
}

void notifyTurnFlowExit(int dirSign, int carrySpeed) {
    g_flowLastDir        = (dirSign > 0) ? 1 : ((dirSign < 0) ? -1 : 0);
    g_flowCarrySpeed     = constrain(abs(carrySpeed), 0, 100);
    g_flowStampMs        = millis();
    g_flowPendingCoastCm = 0.0f;
}

void clearTurnDistCarry() {
    g_turnExitCarryCm = 0.0f;
    clearMotionFlowState();
}

void setTurnDistCarry(float signedCm) {
    g_turnExitCarryCm = enableTurnDistComp ? constrain(signedCm, -22.0f, 22.0f) : 0.0f;
}

static float calcTurnInnerScale() {
    return (turnInnerRatio > 0.01f && turnInnerRatio < 0.85f)
               ? ((1.0f + turnInnerRatio) / (1.0f - turnInnerRatio))
               : 1.0f;
}

static float calcTurnEntryCompCm(float absAngleDeg) {
    if (!enableTurnDistComp || absAngleDeg < 5.0f) return 0.0f;
    float halfRad = constrain(absAngleDeg, 5.0f, 135.0f) * 0.5f * 0.0174532925f;
    return constrain(turnEntryCompCm * tanf(halfRad) * calcTurnInnerScale(), 0.0f, 18.0f);
}

static float calcTurnExitCarryCm(float absAngleDeg) {
    if (!enableTurnDistComp || absAngleDeg < 5.0f) return 0.0f;
    float halfRad = constrain(absAngleDeg, 5.0f, 135.0f) * 0.5f * 0.0174532925f;
    return constrain(turnExitRadiusCm * tanf(halfRad) * calcTurnInnerScale(), 0.0f, 22.0f);
}

static float consumeTurnDistCarry(float rawCm, bool forward, float entryCompCm) {
    float carry = enableTurnDistComp ? g_turnExitCarryCm : 0.0f;
    g_turnExitCarryCm = 0.0f;
    float signedPrev = forward ? carry : -carry;
    float adj = rawCm - signedPrev - entryCompCm;
    return (adj > 0.0f) ? adj : 0.0f;
}

void resetTargetYaw() {
    setAngleOffset();
    delay(5);
    current_degree = 0.0f;
    clearTurnDistCarry();
    ekfSnapHeadingDeg(0.0f);
}

unsigned long missionElapsedMs() {
    if (!s_missionRunning && s_missionStartMs == 0) return 0;
    unsigned long refNow = s_missionPaused ? s_pauseStartMs : millis();
    return (refNow - s_missionStartMs) - s_pausedTotalMs;
}

static bool tftLock(TickType_t waitTicks) {
    if (s_tftMutex == nullptr) return true;
    return xSemaphoreTake(s_tftMutex, waitTicks) == pdTRUE;
}

static void tftUnlock() {
    if (s_tftMutex != nullptr) xSemaphoreGive(s_tftMutex);
}

static void renderHudFrame(bool forceTimer) {
    unsigned long now = millis();

    bool dirty = false;
    int  icon  = 0;
    char mainCopy[24];
    char subCopy[24];
    portENTER_CRITICAL(&s_hudMux);
    if (s_hudDirty) {
        dirty = true;
        icon  = s_hudIcon;
        memcpy(mainCopy, s_hudMain, sizeof(mainCopy));
        memcpy(subCopy,  s_hudSub,  sizeof(subCopy));
        s_hudDirty = false;
    }
    portEXIT_CRITICAL(&s_hudMux);

    if (dirty) {
        if (subCopy[0] != '\0') {
            Serial.printf("[%7.2fs] CMD: %s -> %s\n", missionElapsedMs() / 1000.0f, mainCopy, subCopy);
        } else {
            Serial.printf("[%7.2fs] CMD: %s\n", missionElapsedMs() / 1000.0f, mainCopy);
        }
    }

    if (!tftLock(pdMS_TO_TICKS(5))) return;

    if (dirty && showCmdOnRun) {
        if (icon != s_lastDrawnIcon) {
            uiDrawCommandIcon(icon, true);
            s_lastDrawnIcon = icon;
        }
        tft.fillRect(58, 46, 92, 48, ST77XX_BLACK);
        tft.setTextSize(1);
        if (subCopy[0] != '\0') {
            tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
            tft.setCursor(60, 51);
            tft.print(mainCopy);

            tft.fillRoundRect(58, 67, 92, 16, 4, 0x1A68);
            tft.setTextColor(0x07FF, 0x1A68);
            tft.setCursor(61, 71);
            tft.print("> ");
            tft.print(subCopy);
        } else {
            tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
            tft.setCursor(60, 62);
            tft.print(mainCopy);
        }
    }

    if (showCmdOnRun && (s_activeIcon == 9 || s_activeIcon == 10) && now - s_lastBlinkMs >= 180) {
        s_lastBlinkMs = now;
        s_blinkState  = !s_blinkState;
        uiDrawCommandIcon(s_activeIcon, s_blinkState);
        s_lastDrawnIcon = s_activeIcon;
    }

    if (forceTimer || now - s_lastHudUpdateMs >= 100) {
        s_lastHudUpdateMs = now;
        char buf[12];
        snprintf(buf, sizeof(buf), "%5.2fs", missionElapsedMs() / 1000.0f);
        tft.fillRoundRect(112, 3, 44, 13, 3, ST77XX_BLACK);
        tft.setTextSize(1);
        tft.setTextColor(0xFFE0, ST77XX_BLACK);
        tft.setCursor(116, 6);
        tft.print(buf);
    }

    tftUnlock();
}

static void missionHudTask(void* param) {
    (void)param;
    while (s_missionRunning) {
        if (!s_missionPaused) renderHudFrame(false);
        vTaskDelay(pdMS_TO_TICKS(15));
    }
    s_hudTaskHandle = nullptr;
    vTaskDelete(nullptr);
}

void missionStartTimer(int modeNum) {
    if (s_tftMutex == nullptr) s_tftMutex = xSemaphoreCreateMutex();

    clearTurnDistCarry();
    s_missionStartMs  = millis();
    s_pausedTotalMs   = 0;
    s_pauseStartMs    = 0;
    s_missionPaused   = false;
    s_lastHudUpdateMs = 0;
    s_activeIcon      = 0;
    s_lastDrawnIcon   = -1;
    s_inCompoundCmd   = false;
    s_hudDirty        = false;

    char titleBuf[24];
    snprintf(titleBuf, sizeof(titleBuf), "RUN : MODE %d", modeNum);
    uiDrawTopBar(titleBuf, " 0.00s", 0x03E0);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);

    if (showCmdOnRun) {
        tft.drawRoundRect(6, 24, 148, 78, 8, 0xFFE0);
        tft.setTextSize(1);
        tft.setTextColor(0xFFE0, ST77XX_BLACK);
        tft.setCursor(14, 30);
        tft.print("ACTIVE COMMAND");
    } else {
        uiDrawKTLogoCenter();
    }

    uiDrawBottomBar("IMU: OK", showCmdOnRun ? "CMD ON" : "LOGO");

    s_missionRunning = true;
    if (s_hudTaskHandle == nullptr) {
        xTaskCreatePinnedToCore(missionHudTask, "MissionHUD", 4096, nullptr, 1, &s_hudTaskHandle, 0);
    }
}

void missionEndTimer() {
    clearTurnDistCarry();
    s_missionRunning = false;
    unsigned long waitStart = millis();
    while (s_hudTaskHandle != nullptr && millis() - waitStart < 200UL) {
        delay(2);
    }
    if (s_beepActive) {
        while (!buzzerWrite(false)) delay(1);
        s_beepActive = false;
    }
}

void missionUpdateTimerHUD() {
    serviceNonBlockingBeep();
}

void missionNotifyCommand(const char* cmdText, int iconId, const char* subText) {
    const char* mainLine = (s_inCompoundCmd && s_compoundMain[0] != '\0') ? s_compoundMain : cmdText;
    const char* subLine  = (subText != nullptr && subText[0] != '\0')
                           ? subText
                           : ((s_inCompoundCmd && s_compoundMain[0] != '\0') ? cmdText : nullptr);

    s_activeIcon  = iconId;
    s_blinkState  = true;
    s_lastBlinkMs = millis();

    if (!s_missionRunning) return;

    portENTER_CRITICAL(&s_hudMux);
    s_hudIcon = iconId;
    strncpy(s_hudMain, mainLine, sizeof(s_hudMain) - 1);
    s_hudMain[sizeof(s_hudMain) - 1] = '\0';
    if (subLine != nullptr) {
        strncpy(s_hudSub, subLine, sizeof(s_hudSub) - 1);
        s_hudSub[sizeof(s_hudSub) - 1] = '\0';
    } else {
        s_hudSub[0] = '\0';
    }
    s_hudDirty = true;
    portEXIT_CRITICAL(&s_hudMux);

    triggerCommandStartBeep();
}

// ============================================================================
// STOP() — หยุดหุ่นยนต์และหยุดเวลาชั่วคราว พร้อมรีเซ็ต Yaw & EKF Heading
// ============================================================================
void STOP() {
    driveStop();
    clearTurnDistCarry();
    serviceNonBlockingBeep();

    s_pauseStartMs  = millis();
    s_missionPaused = true;

    if (s_missionRunning) {
        tftLock(portMAX_DELAY);
        if (showCmdOnRun) {
            s_lastDrawnIcon = -1;
            tftUnlock();
            missionNotifyCommand("STOP();", 13, "PAUSED");
            renderHudFrame(true);
            tftLock(portMAX_DELAY);
        } else {
            tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
            tft.drawRoundRect(10, 28, 140, 72, 8, ST77XX_RED);
            uiDrawCommandIcon(13, true);
            tft.setTextSize(2);
            tft.setTextColor(ST77XX_RED, ST77XX_BLACK);
            tft.setCursor(64, 58);
            tft.print("PAUSE");
        }
        uiDrawBottomBar("PAUSED!", "[A/B] Resume");
        tftUnlock();
    }

    if (s_beepActive) {
        while (!buzzerWrite(false)) delay(1);
        s_beepActive = false;
    }
    maxBeep(100);
    delay(60);
    maxBeep(100);

    while (readSwitch(A) || readSwitch(B)) { delay(10); }
    while (!readSwitch(A) && !readSwitch(B)) { delay(15); }
    maxBeep(80);
    while (readSwitch(A) || readSwitch(B)) { delay(10); }
    delay(50);

    if (s_missionRunning) {
        tftLock(portMAX_DELAY);
        if (!showCmdOnRun) {
            tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
            uiDrawKTLogoCenter();
        }
        uiDrawBottomBar("IMU: OK", showCmdOnRun ? "CMD ON" : "LOGO");
        tftUnlock();
    }

    s_pausedTotalMs += (millis() - s_pauseStartMs);
    s_missionPaused  = false;
    resetTargetYaw();
}

// ============================================================================
// แกนขับเคลื่อน Gyro PD ภายใน (ใช้ร่วมกันทุกโหมดเดินตรง)
// ============================================================================
static float driveHeadingPD(int speed, float &previous_error, float KP, float KD, bool forward) {
    float yaw        = safeReadYaw();
    float error      = wrapAngle180(current_degree - yaw);
    float derivative = error - previous_error;
    int pd_value     = constrain((int)((error * KP) + (derivative * KD)), -speed, speed);

    int trimLimit = max(0, speed - 1);
    int trimL = constrain(getLeftMotorTrim(), -trimLimit, 0);
    int trimR = constrain(getRightMotorTrim(), -trimLimit, 0);

    int speed_left, speed_right;
    if (forward) {
        speed_left  = speed + pd_value + motor_trim_forward + trimL;
        speed_right = speed - pd_value - motor_trim_forward + trimR;
        int peak = max(speed_left, speed_right);
        if (peak > 100) {
            int excess = peak - 100;
            speed_left  -= excess;
            speed_right -= excess;
        }
    } else {
        speed_left  = -(speed - pd_value - motor_trim_backward) - trimL;
        speed_right = -(speed + pd_value + motor_trim_backward) - trimR;
        int trough = min(speed_left, speed_right);
        if (trough < -100) {
            int excess = -100 - trough;
            speed_left  += excess;
            speed_right += excess;
        }
    }

    motorWriteSpeedBalanced(speed_left, speed_right);
    previous_error = error;
    return error;
}

// ============================================================================
// ตัวช่วยเลี้ยว ('L','R','l','r' และ 'TR','TL','Tr','Tl' / "TR","TL","Tr","Tl")
// ============================================================================
static constexpr int TURN_CODE_TR = (((int)'T') << 8) | (int)'R';
static constexpr int TURN_CODE_TL = (((int)'T') << 8) | (int)'L';
static constexpr int TURN_CODE_Tr = (((int)'T') << 8) | (int)'r';
static constexpr int TURN_CODE_Tl = (((int)'T') << 8) | (int)'l';

static inline bool isTTTurnCode(int code) {
    return code == TURN_CODE_TR || code == TURN_CODE_TL ||
           code == TURN_CODE_Tr || code == TURN_CODE_Tl;
}

static int parseTurnSelectStr(const char* select) {
    if (select == nullptr || select[0] == '\0') return 0;
    if (select[1] == '\0') return (int)(unsigned char)select[0];
    if (select[2] == '\0') {
        return (((int)(unsigned char)select[0]) << 8) | (int)(unsigned char)select[1];
    }
    return 0;
}

static void formatSelectTag(int code, char outTag[4]) {
    if (isTTTurnCode(code)) {
        outTag[0] = (char)((code >> 8) & 0xFF);
        outTag[1] = (char)(code & 0xFF);
        outTag[2] = '\0';
    } else {
        outTag[0] = (char)(code & 0xFF);
        outTag[1] = '\0';
    }
}

static void execSpinSelect(char select) {
    turn = true;
    if      (select == 'L') SpinDegree(-90.0f);
    else if (select == 'R') SpinDegree(90.0f);
    else if (select == 'l') SpinDegree(-45.0f);
    else if (select == 'r') SpinDegree(45.0f);
    turn = false;
}

static void execTTSelectCode(int select, bool isBack) {
    turn = true;
    if (select == TURN_CODE_TR) {
        if (isBack) TTB90(tt90FastSpeed, tt90SlowSpeed, tt90DistanceCm);
        else        TTF90(tt90FastSpeed, tt90SlowSpeed, tt90DistanceCm);
    } else if (select == TURN_CODE_TL) {
        if (isBack) TTB90(tt90SlowSpeed, tt90FastSpeed, tt90DistanceCm);
        else        TTF90(tt90SlowSpeed, tt90FastSpeed, tt90DistanceCm);
    } else if (select == TURN_CODE_Tr) {
        if (isBack) TTB45(tt45FastSpeed, tt45SlowSpeed, tt45DistanceCm);
        else        TTF45(tt45FastSpeed, tt45SlowSpeed, tt45DistanceCm);
    } else if (select == TURN_CODE_Tl) {
        if (isBack) TTB45(tt45SlowSpeed, tt45FastSpeed, tt45DistanceCm);
        else        TTF45(tt45SlowSpeed, tt45FastSpeed, tt45DistanceCm);
    } else {
        driveStop();
        clearTurnDistCarry();
    }
    turn = false;
}

// ============================================================================
// แกนที่ 1: runEncoderMove() — เดินด้วย Encoder เดียว (Speed-Invariant + EKF)
// ============================================================================
static void runEncoderMove(int Min_speed, int Max_speed, float distance_cm,
                           unsigned long Ramp_up, long Ramp_down,
                           float KP, float KD, bool forward, bool stop_at_end,
                           const char* hudLabel = nullptr, int hudIcon = 0) {
    if (distance_cm <= 0.0f) {
        if (stop_at_end) {
            driveStop();
            clearMotionFlowState();
        }
        return;
    }

    int thisDir = forward ? 1 : -1;
    unsigned long flowAge = millis() - g_flowStampMs;
    bool isFlowFresh   = (g_flowLastDir != 0 && flowAge < 60UL);
    bool isSameDirFlow = (isFlowFresh && g_flowLastDir == thisDir);
    float refundCoastCm = isSameDirFlow ? g_flowPendingCoastCm : 0.0f;
    int flowStartSpd    = isSameDirFlow ? g_flowCarrySpeed : 0;
    clearMotionFlowState();

    float robot_cm = mapFieldCmToRobotCm(distance_cm) + refundCoastCm;
    if (robot_cm < 0.0f) robot_cm = 0.0f;
    int reqSpeed      = constrain(abs(Max_speed), 1, 100);
    long target_ticks = encoderCentimetersToTicks(robot_cm, reqSpeed);
    if (target_ticks <= 0L) {
        if (stop_at_end) driveStop();
        return;
    }

    float effTpcm        = max(1.0f, (float)target_ticks / max(0.01f, robot_cm));
    long ramp_up_ticks   = encoderCentimetersToTicks((float)Ramp_up, reqSpeed);
    long ramp_down_ticks = encoderCentimetersToTicks((float)Ramp_down, reqSpeed);

    int minMoveFloor = constrain(motorMinMoveSpeed, 1, 40);
    int arriveTarget = stop_at_end
        ? min(reqSpeed, constrain(moveArriveSpeed, 1, 60))
        : ((Ramp_down == 0) ? reqSpeed : min(reqSpeed, constrain(Min_speed, 1, 100)));
    int startTarget  = min(reqSpeed, max(constrain(moveArriveSpeed, 1, 60), minMoveFloor));
    if (flowStartSpd > startTarget) {
        startTarget = min(reqSpeed, flowStartSpd);
    }
    float accelRate = max(50.0f, moveAccelRate);
    float decelRate = max(50.0f, moveDecelRate);

    int legacyMinSpd     = min(constrain(Min_speed, 1, 100), reqSpeed);
    int current_speed    = enableSpeedInvariantDist ? startTarget : legacyMinSpd;
    float previous_error = wrapAngle180(current_degree - safeReadYaw());
    float lastHeadingErr = previous_error;
    unsigned long startTime = millis();
    unsigned long timeoutMs = (reqSpeed < 25)
        ? constrain((unsigned long)(robot_cm * 1200.0f / (float)max(1, reqSpeed)), 10000UL, 35000UL)
        : 10000UL;
    bool hudNotified = (hudLabel == nullptr);

    unsigned long lastStallMs = startTime;
    long lastStallTicks       = 0;
    int stallBoost            = 0;

    resetEncoder();
    long prev_raw_ticks    = 0;
    double projected_ticks = 0.0;

    while (true) {
        serviceNonBlockingBeep();
        missionUpdateTimerHUD();
        ekfUpdate();

        unsigned long nowMs = millis();
        unsigned long elapsed_since_start = nowMs - startTime;
        long raw_ticks = readEncoderDistance();
        long d_ticks   = raw_ticks - prev_raw_ticks;
        if (d_ticks > 0L) {
            float cosProj = cosf(lastHeadingErr * 0.0174532925f);
            if (cosProj < 0.25f) cosProj = 0.25f;
            projected_ticks += (double)d_ticks * (double)cosProj;
            prev_raw_ticks = raw_ticks;
        }
        long current_ticks = (long)llround(projected_ticks);

        if (current_ticks >= target_ticks) {
            if (stop_at_end) {
                driveStop();

                if (enableSpeedInvariantDist && enableEndPositionTrim) {
                    unsigned long settleStart = millis();
                    while (millis() - settleStart < 25UL) {
                        serviceNonBlockingBeep();
                        missionUpdateTimerHUD();
                        ekfUpdate();
                        delay(2);
                    }
                    long absPos    = readEncoderDistance();
                    long signedPos = readEncoderSignedDistance(forward);
                    long tolTicks  = max(8L, (long)roundf(0.15f * effTpcm));
                    if (absPos > 0 && signedPos > (absPos / 2)) {
                        long errTicks = target_ticks - signedPos;
                        if (errTicks > tolTicks) {
                            unsigned long trimStart = millis();
                            float trimPrevErr = 0.0f;
                            long lastTrimPos = signedPos;
                            unsigned long lastTrimCheck = trimStart;
                            int trimBoost = 0;
                            while (millis() - trimStart < 220UL) {
                                serviceNonBlockingBeep();
                                missionUpdateTimerHUD();
                                ekfUpdate();
                                signedPos = readEncoderSignedDistance(forward);
                                errTicks = target_ticks - signedPos;
                                if (errTicks <= tolTicks) break;
                                unsigned long tNow = millis();
                                if (tNow - lastTrimCheck >= 25UL) {
                                    if (labs(signedPos - lastTrimPos) < 2L) {
                                        trimBoost = min(trimBoost + 2, 12);
                                    }
                                    lastTrimPos = signedPos;
                                    lastTrimCheck = tNow;
                                }
                                int baseSpd = constrain((int)roundf((float)errTicks * 0.08f),
                                                        minMoveFloor, max(minMoveFloor + 4, arriveTarget));
                                int cmdSpd = constrain(baseSpd + trimBoost, minMoveFloor, 30);
                                driveHeadingPD(cmdSpd, trimPrevErr, KP, KD, forward);
                                delay(2);
                            }
                            driveStop();
                        }
                    }
                }
            }
            ekfUpdate();

            float appliedCoastOffset = 0.0f;
            if (distOffsetCm < -0.001f) {
                float absOfs = min(10.0f, -distOffsetCm);
                float scale  = (distance_cm < 10.0f) ? (distance_cm / 10.0f) : 1.0f;
                appliedCoastOffset = absOfs * scale;
            }
            g_flowLastDir        = thisDir;
            g_flowCarrySpeed     = stop_at_end
                ? min(reqSpeed, max(arriveTarget, 25))
                : max(arriveTarget, current_speed);
            g_flowStampMs        = millis();
            g_flowPendingCoastCm = appliedCoastOffset;
            break;
        }

        long remaining_ticks = target_ticks - current_ticks;
        if (enableSpeedInvariantDist) {
            float traveledCm = (float)current_ticks / effTpcm;
            float remCm      = (float)remaining_ticks / effTpcm;

            int upSpd = reqSpeed;
            if (Ramp_up > 0) {
                int physUp = (int)roundf(sqrtf((float)(startTarget * startTarget) + 2.0f * accelRate * traveledCm));
                upSpd = min(reqSpeed, max(startTarget, physUp));
                if (ramp_up_ticks > 0 && current_ticks < ramp_up_ticks) {
                    int linUp = startTarget + (int)(((float)current_ticks / (float)ramp_up_ticks) * (reqSpeed - startTarget));
                    upSpd = min(upSpd, linUp);
                }
            }

            int downSpd = reqSpeed;
            if (Ramp_down > 0) {
                int physDown = (int)roundf(sqrtf((float)(arriveTarget * arriveTarget) + 2.0f * decelRate * remCm));
                downSpd = min(reqSpeed, max(arriveTarget, physDown));
                if (ramp_down_ticks > 0 && remaining_ticks <= ramp_down_ticks) {
                    int linDown = arriveTarget + (int)(((float)remaining_ticks / (float)ramp_down_ticks) * (reqSpeed - arriveTarget));
                    downSpd = min(downSpd, max(arriveTarget, linDown));
                }
            }

            current_speed = constrain(min(reqSpeed, min(upSpd, downSpd)), 1, reqSpeed);
        } else {
            if (ramp_up_ticks == 0) {
                current_speed = reqSpeed;
            } else if (current_ticks < ramp_up_ticks) {
                current_speed = legacyMinSpd + (int)(((float)current_ticks / (float)ramp_up_ticks) * (reqSpeed - legacyMinSpd));
            } else {
                current_speed = reqSpeed;
            }
            if (ramp_down_ticks > 0 && remaining_ticks <= ramp_down_ticks) {
                int ramp_down_speed = legacyMinSpd + (int)(((float)remaining_ticks / (float)ramp_down_ticks) * (reqSpeed - legacyMinSpd));
                ramp_down_speed = constrain(ramp_down_speed, legacyMinSpd, reqSpeed);
                if (ramp_down_speed < current_speed) current_speed = ramp_down_speed;
            }
        }

        unsigned long dtStall = nowMs - lastStallMs;
        if (dtStall >= 15UL) {
            long dTicks = raw_ticks - lastStallTicks;
            long minDesired = max(1L, (long)roundf((float)current_speed * 0.25f));
            if (enableSpeedInvariantDist && (current_speed < minMoveFloor + 6 || dTicks < minDesired)) {
                if (dTicks < minDesired) {
                    int maxBoost = max(0, max(minMoveFloor + 12, 26) - current_speed);
                    stallBoost = min(stallBoost + 1, maxBoost);
                } else if (dTicks > minDesired * 2L && stallBoost > 0) {
                    stallBoost = max(0, stallBoost - 2);
                }
            } else if (stallBoost > 0) {
                stallBoost = max(0, stallBoost - 1);
            }
            lastStallTicks = raw_ticks;
            lastStallMs = nowMs;
        }

        int driveSpd = enableSpeedInvariantDist ? constrain(current_speed + stallBoost, 1, 100) : current_speed;
        lastHeadingErr = driveHeadingPD(driveSpd, previous_error, KP, KD, forward);

        if (!hudNotified) {
            hudNotified = true;
            missionNotifyCommand(hudLabel, hudIcon);
        }

        if (elapsed_since_start >= timeoutMs) {
            driveStop();
            ekfUpdate();
            clearMotionFlowState();
            break;
        }
        delay(1);
    }
}

// ============================================================================
// Wrapper FC-Only: FC / BC / FC4 / BC4 / FC_BOX / BC_BOX
// ============================================================================
static void execFCBase(int speed, float cm, bool forward, bool stopAtEnd,
                       unsigned long rUp, long rDown) {
    float adjCm = consumeTurnDistCarry(cm, forward, 0.0f);
    if (adjCm <= 0.05f) {
        if (stopAtEnd) {
            driveStop();
            missionFinishCommandBeep();
        }
        return;
    }
    int maxSpd = constrain(abs(speed), 1, max_speed_enc_turn);
    int minSpd = min(min_speed_enc_turn, maxSpd);
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), forward ? "FC(%d,%.0f);" : "BC(%d,%.0f);", speed, cm);
    runEncoderMove(minSpd, maxSpd, adjCm, rUp, rDown, kp_turn, kd_turn, forward, stopAtEnd, cmdBuf, forward ? 1 : 2);
    if (stopAtEnd) missionFinishCommandBeep();
}

static void execFCTurnChar(int speed, float cm, char dir, bool forward, float angleOverride,
                           const char* fmtMain, bool stopBeforeTurn,
                           unsigned long rUp, long rDown) {
    bool isLeft  = (dir == 'L' || dir == 'l');
    bool isRight = (dir == 'R' || dir == 'r');
    bool isValid = isLeft || isRight;
    bool isLower = (dir == 'l' || dir == 'r');
    bool doStopAndSpin = stopBeforeTurn || isLower;

    float turnAngle = 0.0f;
    if (isValid) {
        float mag = (angleOverride > 0.0f) ? angleOverride : 90.0f;
        turnAngle = isLeft ? -mag : mag;
    }

    float entryCompCm = (isValid && !doStopAndSpin) ? calcTurnEntryCompCm(fabsf(turnAngle)) : 0.0f;
    float adjCm = consumeTurnDistCarry(cm, forward, entryCompCm);

    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), fmtMain, speed, cm, dir);

    if (adjCm > 0.05f) {
        int maxSpd = constrain(abs(speed), 1, max_speed_enc_turn);
        int minSpd = min(min_speed_enc_turn, maxSpd);
        char subBuf[22];
        snprintf(subBuf, sizeof(subBuf), forward ? "FC(%d,%.0f)" : "BC(%d,%.0f)", speed, cm);
        runEncoderMove(minSpd, maxSpd, adjCm, rUp, doStopAndSpin ? rDown : 0L, kp_turn, kd_turn,
                       forward, doStopAndSpin, subBuf, forward ? 1 : 2);
    } else if (doStopAndSpin) {
        driveStop();
    }

    if (!isValid) {
        driveStop();
    } else {
        turn = true;
        if (doStopAndSpin) {
            SpinDegree(turnAngle, -1, true);
        } else if (forward) {
            TrunDegreeFront(turnAngle, -1, false);
            setTurnDistCarry(calcTurnExitCarryCm(fabsf(turnAngle)));
        } else {
            TrunDegreeBack(turnAngle, -1, false);
            setTurnDistCarry(-calcTurnExitCarryCm(fabsf(turnAngle)));
        }
        turn = false;
    }

    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}

static void execFCTurn(int speed, float cm, int select, bool forward, bool stopBeforeTurn,
                       unsigned long rUp, long rDown) {
    if (!isTTTurnCode(select)) {
        execFCTurnChar(speed, cm, (char)(select & 0xFF), forward, 0.0f,
                       forward ? "FC(%d,%.0f,'%c');" : "BC(%d,%.0f,'%c');",
                       stopBeforeTurn, rUp, rDown);
        return;
    }

    float adjCm = consumeTurnDistCarry(cm, forward, 0.0f);
    char tag[4];
    formatSelectTag(select, tag);
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain),
             forward ? "FC(%d,%.0f,'%s');" : "BC(%d,%.0f,'%s');", speed, cm, tag);

    if (adjCm > 0.05f) {
        int maxSpd = constrain(abs(speed), 1, max_speed_enc_turn);
        int minSpd = min(min_speed_enc_turn, maxSpd);
        char subBuf[22];
        snprintf(subBuf, sizeof(subBuf), forward ? "FC(%d,%.0f)" : "BC(%d,%.0f)", speed, cm);
        runEncoderMove(minSpd, maxSpd, adjCm, rUp, rDown, kp_turn, kd_turn,
                       forward, stopBeforeTurn, subBuf, forward ? 1 : 2);
    } else if (stopBeforeTurn) {
        driveStop();
    }

    execTTSelectCode(select, !forward);
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}

void FC(int speed, float cm, bool stopAtEnd) {
    execFCBase(speed, cm, true, stopAtEnd, ramp_up_turn, stopAtEnd ? ramp_down_turn : 0L);
}
void FC(int speed, float cm, int rUp, int rDown) {
    execFCBase(speed, cm, true, true, (unsigned long)max(0, rUp), (long)max(0, rDown));
}
void FC(int speed, float cm, char dir) {
    execFCTurnChar(speed, cm, dir, true, 0.0f, "FC(%d,%.0f,'%c');", false, ramp_up_turn, ramp_down_turn);
}
void FC(int speed, float cm, int select) {
    execFCTurn(speed, cm, select, true, false, ramp_up_turn, ramp_down_turn);
}
void FC(int speed, float cm, const char* select) {
    execFCTurn(speed, cm, parseTurnSelectStr(select), true, false, ramp_up_turn, ramp_down_turn);
}
void FC(int speed, float cm, char dir, bool stopBeforeTurn) {
    execFCTurnChar(speed, cm, dir, true, 0.0f, "FC(%d,%.0f,'%c');", stopBeforeTurn, ramp_up_turn, ramp_down_turn);
}
void FC(int speed, float cm, const char* select, bool stopBeforeTurn) {
    execFCTurn(speed, cm, parseTurnSelectStr(select), true, stopBeforeTurn, ramp_up_turn, ramp_down_turn);
}
void FC(int speed, float cm, char dir, unsigned long rUp, long rDown) {
    execFCTurnChar(speed, cm, dir, true, 0.0f, "FC(%d,%.0f,'%c');", false, rUp, rDown);
}
void FC(int speed, float cm, int select, unsigned long rUp, long rDown) {
    execFCTurn(speed, cm, select, true, false, rUp, rDown);
}
void FC(int speed, float cm, const char* select, unsigned long rUp, long rDown) {
    execFCTurn(speed, cm, parseTurnSelectStr(select), true, false, rUp, rDown);
}

void BC(int speed, float cm, bool stopAtEnd) {
    execFCBase(speed, cm, false, stopAtEnd, ramp_up_turn, stopAtEnd ? ramp_down_turn : 0L);
}
void BC(int speed, float cm, int rUp, int rDown) {
    execFCBase(speed, cm, false, true, (unsigned long)max(0, rUp), (long)max(0, rDown));
}
void BC(int speed, float cm, char dir) {
    execFCTurnChar(speed, cm, dir, false, 0.0f, "BC(%d,%.0f,'%c');", false, ramp_up_turn, ramp_down_turn);
}
void BC(int speed, float cm, int select) {
    execFCTurn(speed, cm, select, false, false, ramp_up_turn, ramp_down_turn);
}
void BC(int speed, float cm, const char* select) {
    execFCTurn(speed, cm, parseTurnSelectStr(select), false, false, ramp_up_turn, ramp_down_turn);
}
void BC(int speed, float cm, char dir, bool stopBeforeTurn) {
    execFCTurnChar(speed, cm, dir, false, 0.0f, "BC(%d,%.0f,'%c');", stopBeforeTurn, ramp_up_turn, ramp_down_turn);
}
void BC(int speed, float cm, const char* select, bool stopBeforeTurn) {
    execFCTurn(speed, cm, parseTurnSelectStr(select), false, stopBeforeTurn, ramp_up_turn, ramp_down_turn);
}
void BC(int speed, float cm, char dir, unsigned long rUp, long rDown) {
    execFCTurnChar(speed, cm, dir, false, 0.0f, "BC(%d,%.0f,'%c');", false, rUp, rDown);
}
void BC(int speed, float cm, int select, unsigned long rUp, long rDown) {
    execFCTurn(speed, cm, select, false, false, rUp, rDown);
}
void BC(int speed, float cm, const char* select, unsigned long rUp, long rDown) {
    execFCTurn(speed, cm, parseTurnSelectStr(select), false, false, rUp, rDown);
}

void FC4(int speed, float cm, char dir) {
    execFCTurnChar(speed, cm, dir, true, 45.0f, "FC4(%d,%.0f,'%c');", false, ramp_up_turn, ramp_down_turn);
}
void FC4(int speed, float cm, char dir, bool stopBeforeTurn) {
    execFCTurnChar(speed, cm, dir, true, 45.0f, "FC4(%d,%.0f,'%c');", stopBeforeTurn, ramp_up_turn, ramp_down_turn);
}
void BC4(int speed, float cm, char dir) {
    execFCTurnChar(speed, cm, dir, false, 45.0f, "BC4(%d,%.0f,'%c');", false, ramp_up_turn, ramp_down_turn);
}
void BC4(int speed, float cm, char dir, bool stopBeforeTurn) {
    execFCTurnChar(speed, cm, dir, false, 45.0f, "BC4(%d,%.0f,'%c');", stopBeforeTurn, ramp_up_turn, ramp_down_turn);
}

void FC_BOX(int speed, float boxes, bool stopAtEnd) { FC(speed, BOX(boxes), stopAtEnd); }
void FC_BOX(int speed, float boxes, char dir) { FC(speed, BOX(boxes), dir); }
void FC_BOX(int speed, float boxes, int select) { FC(speed, BOX(boxes), select); }
void FC_BOX(int speed, float boxes, const char* select) { FC(speed, BOX(boxes), select); }
void FC_BOX(int speed, float boxes, char dir, bool stopBeforeTurn) { FC(speed, BOX(boxes), dir, stopBeforeTurn); }
void FC_BOX(int speed, float boxes, const char* select, bool stopBeforeTurn) { FC(speed, BOX(boxes), select, stopBeforeTurn); }

void BC_BOX(int speed, float boxes, bool stopAtEnd) { BC(speed, BOX(boxes), stopAtEnd); }
void BC_BOX(int speed, float boxes, char dir) { BC(speed, BOX(boxes), dir); }
void BC_BOX(int speed, float boxes, int select) { BC(speed, BOX(boxes), select); }
void BC_BOX(int speed, float boxes, const char* select) { BC(speed, BOX(boxes), select); }
void BC_BOX(int speed, float boxes, char dir, bool stopBeforeTurn) { BC(speed, BOX(boxes), dir, stopBeforeTurn); }
void BC_BOX(int speed, float boxes, const char* select, bool stopBeforeTurn) { BC(speed, BOX(boxes), select, stopBeforeTurn); }

// ============================================================================
// แกนที่ 2: runTimedMove() — เดินหน้า-ถอยหลังแบบจับเวลา (FF / BB)
// ============================================================================
static void runTimedMove(int speed, unsigned long time_target,
                         unsigned long Ramp_up, unsigned long Ramp_down,
                         bool forward, const char* hudLabel) {
    clearTurnDistCarry();
    int max_speed = constrain(abs(speed), min_speed_time, max_speed_time);
    int min_speed = min(min_speed_time, max_speed);
    int current_speed = min_speed;
    float previous_error = wrapAngle180(current_degree - safeReadYaw());
    bool timer_started = false;
    const float angle_tolerance = 10.0f;

    unsigned long timer = 0;
    unsigned long rampStartTime = 0;
    unsigned long startTime = millis();
    bool hudNotified = (hudLabel == nullptr);

    while (true) {
        serviceNonBlockingBeep();
        missionUpdateTimerHUD();
        ekfUpdate();

        unsigned long nowMs = millis();
        if (!timer_started) {
            current_speed = (Ramp_up == 0) ? max_speed : min_speed;
        } else {
            unsigned long ramp_elapsed = nowMs - rampStartTime;
            if (Ramp_up == 0 || ramp_elapsed >= Ramp_up) {
                current_speed = max_speed;
            } else {
                current_speed = min_speed + (int)(((float)ramp_elapsed / (float)Ramp_up) * (max_speed - min_speed));
            }
        }

        if (timer_started && Ramp_down > 0) {
            unsigned long elapsed_since_timer = nowMs - timer;
            unsigned long remaining_time = (elapsed_since_timer < time_target) ? (time_target - elapsed_since_timer) : 0UL;
            if (remaining_time <= Ramp_down) {
                int ramp_down_speed = min_speed + (int)(((float)remaining_time / (float)Ramp_down) * (max_speed - min_speed));
                ramp_down_speed = constrain(ramp_down_speed, min_speed, max_speed);
                if (ramp_down_speed < current_speed) current_speed = ramp_down_speed;
            }
        }

        float error = driveHeadingPD(current_speed, previous_error, kp_time, kd_time, forward);

        if (!hudNotified) {
            hudNotified = true;
            missionNotifyCommand(hudLabel, forward ? 1 : 2);
        }

        if (!timer_started && fabsf(error) <= angle_tolerance) {
            timer = nowMs;
            rampStartTime = nowMs;
            timer_started = true;
        }
        if (timer_started && (nowMs - timer >= time_target)) {
            driveStop();
            break;
        }
        if (nowMs - startTime >= 8000UL) {
            driveStop();
            break;
        }
        delay(1);
    }

    ekfUpdate();
    missionFinishCommandBeep();
    if (delayALL > 0) delay(delayALL);
}

void FF(int speed, unsigned long timer) {
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "FF(%d,%lu);", speed, timer);
    runTimedMove(speed, timer, ramp_up_ms, ramp_down_ms, true, cmdBuf);
}

void FF(int speed, unsigned long timer, unsigned long rUp, unsigned long rDown) {
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "FF(%d,%lu);", speed, timer);
    runTimedMove(speed, timer, rUp, rDown, true, cmdBuf);
}

void BB(int speed, unsigned long timer) {
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "BB(%d,%lu);", speed, timer);
    runTimedMove(speed, timer, ramp_up_ms, ramp_down_ms, false, cmdBuf);
}

void BB(int speed, unsigned long timer, unsigned long rUp, unsigned long rDown) {
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "BB(%d,%lu);", speed, timer);
    runTimedMove(speed, timer, rUp, rDown, false, cmdBuf);
}

// ============================================================================
// แกนที่ 3: alignLineYaw() — จัดแนวเข้าเส้น (SetF / SetB) และเข้าเส้นปล่อยของ (DropF / DropB)
// ============================================================================
static bool alignLineYaw(int speed, bool forward, bool squareDifferential,
                         bool resetYawAtEnd, unsigned long postDelayMs,
                         const char* hudLabel, int hudIcon) {
    clearTurnDistCarry();
    if (hudLabel != nullptr) {
        missionNotifyCommand(hudLabel, hudIcon);
    }

    const unsigned long align_timeout = squareDifferential ? 2500UL : 5000UL;
    const byte sLeft  = forward ? 0 : 3; // 0=FL, 3=BL
    const byte sRight = forward ? 1 : 2; // 1=FR, 2=BR
    float previous_error = 0.0f;
    unsigned long start_time = millis();
    bool aligned = false;

    while (millis() - start_time < align_timeout) {
        serviceNonBlockingBeep();
        missionUpdateTimerHUD();
        ekfUpdate();
        readLine();

        bool hitL = line_value[sLeft]  <= sensorDifference;
        bool hitR = line_value[sRight] <= sensorDifference;

        if (hitL && hitR) {
            driveStop();
            aligned = true;
            break;
        }

        if (!squareDifferential || (!hitL && !hitR)) {
            previous_error = driveHeadingPD(speed, previous_error, Set_kp, Set_kd, forward);
        } else {
            int spdL, spdR;
            if (forward) {
                spdL = hitL ? -speed : speed;
                spdR = hitR ? -speed : speed;
            } else {
                spdL = hitL ? speed : -speed;
                spdR = hitR ? speed : -speed;
            }
            motorWriteSpeedBalanced(spdL, spdR);
        }
        delay(1);
    }

    if (!aligned) {
        driveStop();
    }
    ekfUpdate();

    if (postDelayMs > 0) delay(postDelayMs);
    if (resetYawAtEnd && aligned) {
        resetTargetYaw();
        missionFinishCommandBeep();
    }
    return aligned;
}

void limitMotorTrim() {
    motor_trim_forward  = constrain(motor_trim_forward, -30, 30);
    motor_trim_backward = constrain(motor_trim_backward, -30, 30);
}

// --- API สาธารณะ: SetF / SetB / DropF(speed) / DropB(speed) ---
void SetF(int speed) {
    alignLineYaw(speed, true, true, true, 100UL, "SetF();", 9);
}

void SetF(int speed, float backCm) {
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), "SetF(%d,%.0f);", speed, backCm);
    alignLineYaw(speed, true, true, true, 100UL, "SetF();", 9);
    if (backCm > 0.0f) {
        int maxSpd = constrain(abs(speed), 1, max_speed_enc);
        int minSpd = min(min_speed_enc, maxSpd);
        runEncoderMove(minSpd, maxSpd, backCm, 0, 0, bwdKp, bwdKd, false, true, "BC", 2);
    }
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}

void SetF(int speed, float backCm, char dir) {
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), "SetF(%d,%.0f,'%c');", speed, backCm, dir);
    alignLineYaw(speed, true, true, true, 100UL, "SetF();", 9);
    if (backCm > 0.0f) {
        int maxSpd = constrain(abs(speed), 1, max_speed_enc);
        int minSpd = min(min_speed_enc, maxSpd);
        runEncoderMove(minSpd, maxSpd, backCm, 0, 0, bwdKp, bwdKd, false, true, "BC", 2);
        delay(10);
    }
    execSpinSelect(dir);
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}

void SetB(int speed) {
    alignLineYaw(speed, false, true, true, 100UL, "SetB();", 10);
}

void SetB(int speed, float fwdCm) {
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), "SetB(%d,%.0f);", speed, fwdCm);
    alignLineYaw(speed, false, true, true, 100UL, "SetB();", 10);
    if (fwdCm > 0.0f) {
        int maxSpd = constrain(abs(speed), 1, max_speed_enc);
        int minSpd = min(min_speed_enc, maxSpd);
        runEncoderMove(minSpd, maxSpd, fwdCm, 0, 0, fwdKp, fwdKd, true, true, "FC", 1);
    }
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}

void SetB(int speed, float fwdCm, char dir) {
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), "SetB(%d,%.0f,'%c');", speed, fwdCm, dir);
    alignLineYaw(speed, false, true, true, 100UL, "SetB();", 10);
    if (fwdCm > 0.0f) {
        int maxSpd = constrain(abs(speed), 1, max_speed_enc);
        int minSpd = min(min_speed_enc, maxSpd);
        runEncoderMove(minSpd, maxSpd, fwdCm, 0, 0, fwdKp, fwdKd, true, true, "FC", 1);
        delay(10);
    }
    execSpinSelect(dir);
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}

void DropF(int speed) {
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), "DropF(%d);", speed);
    alignLineYaw(speed, true, false, false, 0UL, "Align Front", 9);
    DropF();
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}

void DropB(int speed) {
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), "DropB(%d);", speed);
    alignLineYaw(speed, false, false, false, 0UL, "Align Back", 10);
    DropB();
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}
