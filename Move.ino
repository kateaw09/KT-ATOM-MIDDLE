// ============================================================================
// Move.ino — ระบบเคลื่อนที่หลัก (อ้างอิงตาม PT_MIDDLE_ENC_2026Endcode4MOV1 + KT_ATOM_Middle HUD)
//   - moveForward / moveBackward + 4-Wheel Speed Balance
//   - BaseFFE / baseBBE / FFE / BBE / FFE_turn / BBE_turn
//   - FC / BC / FC4 / BC4 (รองรับทั้ง 'L'/'R'/'l'/'r' และ 'TL'/'TR'/'Tl'/'Tr' / "TL"/"TR"/"Tl"/"Tr")
//   - BaseFF / BaseBB / FF / FF_turn / BB / BB_turn (Time-based)
//   - SetFront_Yaw / SetBack_Yaw / SetFront / SetBack / SetFront_time / SetBack_time / SetF / SetB
//   - DropF(speed) / DropB(speed) / STOP
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
// HUD เบื้องหลัง (Core 0): ลูปควบคุมมอเตอร์ (Core 1) แค่ "ฝากข้อความ" ไว้แล้ววิ่งต่อทันที
// งานวาดจอ TFT และ Serial.printf ทั้งหมดทำใน missionHudTask เท่านั้น
// ----------------------------------------------------------------------------
static portMUX_TYPE      s_hudMux        = portMUX_INITIALIZER_UNLOCKED;
static volatile bool     s_hudDirty      = false;
static int               s_hudIcon       = 0;
static char              s_hudMain[24]   = "";
static char              s_hudSub[24]    = "";
static TaskHandle_t      s_hudTaskHandle = nullptr;
static SemaphoreHandle_t s_tftMutex      = nullptr;

static float wrapAngle180(float deg) {
    while (deg > 180.0f)  deg -= 360.0f;
    while (deg < -180.0f) deg += 360.0f;
    return deg;
}

// เขียน Buzzer ผ่าน I2C แบบไม่รอ: ถ้า IMU กำลังใช้บัสอยู่ให้ข้ามไปลองใหม่รอบถัดไป
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

void resetTargetYaw() {
    setAngleOffset();
    delay(5);
    current_degree = 0.0f;
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

// วาดจอ HUD (เรียกจาก missionHudTask บน Core 0 เท่านั้น ยกเว้นตอน STOP ที่หุ่นหยุดอยู่แล้ว)
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

    // กระพริบเส้นสำหรับคำสั่งเช็คเส้น (9 = CMD_ICON_LINE_F, 10 = CMD_ICON_LINE_B)
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

// เรียกในลูปควบคุมมอเตอร์ได้ทุกรอบ: ทำแค่ปิดเสียง Beep ตามเวลา (ไม่แตะจอ)
void missionUpdateTimerHUD() {
    serviceNonBlockingBeep();
}

// เรียกได้ทันทีหลังสั่งมอเตอร์: ใช้เวลาไม่กี่ไมโครวินาที (คัดลอกข้อความ + เปิดเสียง)
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
// STOP() — หยุดหุ่นยนต์และหยุดเวลาชั่วคราว พร้อมรีเซ็ต Yaw เมื่อกลับมาทำงานต่อ
// ============================================================================
void STOP() {
    driveStop();
    serviceNonBlockingBeep();

    s_pauseStartMs  = millis();
    s_missionPaused = true;

    if (s_missionRunning) {
        tftLock(portMAX_DELAY);
        if (showCmdOnRun) {
            s_lastDrawnIcon = -1;
            tftUnlock();
            missionNotifyCommand("STOP();", 13, "PAUSED"); // CMD_ICON_PAUSE
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
// แกนหลักควบคุมการเดินหน้า-ถอยหลัง Gyro PD (ตาม Move.ino ของ PT_MIDDLE_ENC_2026Endcode4MOV1)
// ============================================================================
float moveForward(int speed, float &previous_error, float KP, float KD) {
    int max_speed = speed;
    float kp = KP;
    float kd = KD;
    float yaw = safeReadYaw();
    float error = wrapAngle180(current_degree - yaw);
    float derivative = error - previous_error;
    int pd_value = (int)((error * kp) + (derivative * kd));
    if (pd_value > max_speed) pd_value = max_speed;
    else if (pd_value < -max_speed) pd_value = -max_speed;
    int speed_left  = max_speed + pd_value + motor_trim_forward + getLeftMotorTrim();
    int speed_right = max_speed - pd_value - motor_trim_forward + getRightMotorTrim();
    motorWriteSpeedBalanced(speed_left, speed_right);
    previous_error = error;
    return error;
}

float moveBackward(int speed, float &previous_error, float KP, float KD) {
    int max_speed = speed;
    float kp = KP;
    float kd = KD;
    float yaw = safeReadYaw();
    float error = wrapAngle180(current_degree - yaw);
    float derivative = error - previous_error;
    int pd_value = (int)((error * kp) + (derivative * kd));
    if (pd_value > max_speed) pd_value = max_speed;
    else if (pd_value < -max_speed) pd_value = -max_speed;
    int speed_left  = -(max_speed - pd_value - motor_trim_backward) - getLeftMotorTrim();
    int speed_right = -(max_speed + pd_value + motor_trim_backward) - getRightMotorTrim();
    motorWriteSpeedBalanced(speed_left, speed_right);
    previous_error = error;
    return error;
}

float moveForward(int speed, float &previous_error) {
    return moveForward(speed, previous_error, Set_kp, Set_kd);
}

float moveBackward(int speed, float &previous_error) {
    return moveBackward(speed, previous_error, Set_kp, Set_kd);
}

// ============================================================================
// ตัวช่วยเลือกการหมุน/เลี้ยว ('L','R','l','r' และ 'TR','TL','Tr','Tl' / "TR","TL","Tr","Tl")
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
    if (select == 'L')      spinDegree(-90);
    else if (select == 'R') spinDegree(90);
    else if (select == 'l') spinDegree(-45);
    else if (select == 'r') spinDegree(45);
    turn = false;
}

static void execTurnSelectCode(int select, bool isBack) {
    turn = true;
    if (select == 'L') {
        if (isBack) turnDegreeBack(-90);
        else        turnDegreeFront(-90);
    } else if (select == 'R') {
        if (isBack) turnDegreeBack(90);
        else        turnDegreeFront(90);
    } else if (select == 'l') {
        if (isBack) turnDegreeBack(-45);
        else        turnDegreeFront(-45);
    } else if (select == 'r') {
        if (isBack) turnDegreeBack(45);
        else        turnDegreeFront(45);
    } else if (select == TURN_CODE_TR) {
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
    }
    turn = false;
}

static void execTurnSelectStr(const char* select, bool isBack) {
    execTurnSelectCode(parseTurnSelectStr(select), isBack);
}

// ============================================================================
// กลุ่มเดินหน้า-ถอยหลังด้วย Encoder: BaseFFE / baseBBE และ FFE / BBE / FFE_turn / BBE_turn
// (ตรงตาม MoveENC.ino ของ PT_MIDDLE_ENC_2026Endcode4MOV1)
// ============================================================================
static void baseMoveEncInternal(int Min_speed, int Max_speed, float distance_cm,
                                unsigned long Ramp_up, long Ramp_down,
                                float KP, float KD, bool forward, bool stop_at_end,
                                const char* hudLabel = nullptr, int hudIcon = 0) {
    int min_speed = Min_speed;
    int max_speed = Max_speed;
    long target_ticks    = encoderCentimetersToTicks(distance_cm, max_speed);
    long ramp_up_ticks   = encoderCentimetersToTicks((float)Ramp_up, max_speed);
    long ramp_down_ticks = encoderCentimetersToTicks((float)Ramp_down, max_speed);
    int current_speed    = min_speed;
    float previous_error = 0.0f;
    unsigned long startTime = millis();
    bool hudNotified = (hudLabel == nullptr);
    resetEncoder();

    while (true) {
        serviceNonBlockingBeep();
        missionUpdateTimerHUD();
        unsigned long elapsed_since_start = millis() - startTime;
        long current_ticks = readEncoderDistance();
        if (current_ticks >= target_ticks) {
            if (stop_at_end) driveStop();
            break;
        }
        long remaining_ticks = target_ticks - current_ticks;
        if (ramp_up_ticks == 0) {
            current_speed = max_speed;
        } else if (current_ticks < ramp_up_ticks) {
            current_speed = min_speed + (int)(((float)current_ticks / (float)ramp_up_ticks) * (max_speed - min_speed));
        } else {
            current_speed = max_speed;
        }
        if (ramp_down_ticks > 0 && remaining_ticks <= ramp_down_ticks) {
            int ramp_down_speed = min_speed + (int)(((float)remaining_ticks / (float)ramp_down_ticks) * (max_speed - min_speed));
            ramp_down_speed = constrain(ramp_down_speed, min_speed, max_speed);
            if (ramp_down_speed < current_speed) current_speed = ramp_down_speed;
        }
        if (forward) moveForward(current_speed, previous_error, KP, KD);
        else         moveBackward(current_speed, previous_error, KP, KD);

        if (!hudNotified) {
            hudNotified = true;
            missionNotifyCommand(hudLabel, hudIcon);
        }

        if (elapsed_since_start >= 10000UL) {
            driveStop();
            break;
        }
        delay(1);
    }
}

void BaseFFE(int Min_speed, int Max_speed, long encoder_target,
             unsigned long Ramp_up, long Ramp_down, float KP, float KD, bool stop_at_end) {
    baseMoveEncInternal(Min_speed, Max_speed, (float)encoder_target, Ramp_up, Ramp_down, KP, KD, true, stop_at_end);
}

void baseBBE(int Min_speed, int Max_speed, long encoder_target,
             unsigned long Ramp_up, long Ramp_down, float KP, float KD, bool stop_at_end) {
    baseMoveEncInternal(Min_speed, Max_speed, (float)encoder_target, Ramp_up, Ramp_down, KP, KD, false, stop_at_end);
}

// --- FFE ---
void FFE(int speed, long encoder_target) {
    speed = constrain(speed, min_speed_enc, max_speed_enc);
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "FFE(%d,%ld);", speed, encoder_target);
    baseMoveEncInternal(min_speed_enc, speed, (float)encoder_target, ramp_up, ramp_down, fwdKp, fwdKd, true, false, cmdBuf, 1);
}

void FFE(int speed, long encoder_target, unsigned long rUp, long rDown) {
    speed = constrain(speed, min_speed_enc, max_speed_enc);
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "FFE(%d,%ld);", speed, encoder_target);
    baseMoveEncInternal(min_speed_enc, speed, (float)encoder_target, rUp, rDown, fwdKp, fwdKd, true, true, cmdBuf, 1);
    missionFinishCommandBeep();
}

void FFE(int speed, long encoder_target, char select) {
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), "FFE(%d,%ld,'%c');", speed, encoder_target, select);
    FFE(speed, encoder_target);
    execSpinSelect(select);
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}

void FFE(int speed, long encoder_target, char select, unsigned long rUp, long rDown) {
    speed = constrain(speed, min_speed_enc, max_speed_enc);
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), "FFE(%d,%ld,'%c');", speed, encoder_target, select);
    char subBuf[22];
    snprintf(subBuf, sizeof(subBuf), "FFE(%d,%ld)", speed, encoder_target);
    baseMoveEncInternal(min_speed_enc, speed, (float)encoder_target, rUp, rDown, fwdKp, fwdKd, true, true, subBuf, 1);
    execSpinSelect(select);
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}

// --- FFE_turn (รองรับทั้ง char 'L'/'R'/'l'/'r' และ int/string 'TL'/'TR'/'Tl'/'Tr' / "TL"/"TR"/"Tl"/"Tr") ---
void FFE_turn(int speed, long encoder_target) {
    speed = constrain(speed, min_speed_enc_turn, max_speed_enc_turn);
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "FFE_turn(%d,%ld)", speed, encoder_target);
    baseMoveEncInternal(min_speed_enc_turn, speed, (float)encoder_target, ramp_up_turn, ramp_down_turn, kp_turn, kd_turn, true, false, cmdBuf, 1);
}

void FFE_turn(int speed, long encoder_target, char select) {
    FFE_turn(speed, encoder_target, (int)(unsigned char)select, ramp_up_turn, ramp_down_turn);
}

void FFE_turn(int speed, long encoder_target, int select) {
    FFE_turn(speed, encoder_target, select, ramp_up_turn, ramp_down_turn);
}

void FFE_turn(int speed, long encoder_target, const char* select) {
    FFE_turn(speed, encoder_target, parseTurnSelectStr(select), ramp_up_turn, ramp_down_turn);
}

void FFE_turn(int speed, long encoder_target, unsigned long rUp, long rDown) {
    speed = constrain(speed, min_speed_enc_turn, max_speed_enc_turn);
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "FFE_turn(%d,%ld)", speed, encoder_target);
    baseMoveEncInternal(min_speed_enc_turn, speed, (float)encoder_target, rUp, rDown, kp_turn, kd_turn, true, false, cmdBuf, 1);
}

void FFE_turn(int speed, long encoder_target, char select, unsigned long rUp, long rDown) {
    FFE_turn(speed, encoder_target, (int)(unsigned char)select, rUp, rDown);
}

void FFE_turn(int speed, long encoder_target, int select, unsigned long rUp, long rDown) {
    speed = constrain(speed, min_speed_enc_turn, max_speed_enc_turn);
    char tag[4];
    formatSelectTag(select, tag);
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), "FFE_turn(%d,%ld,'%s')", speed, encoder_target, tag);
    char subBuf[22];
    snprintf(subBuf, sizeof(subBuf), "FFE_turn(%d,%ld)", speed, encoder_target);
    baseMoveEncInternal(min_speed_enc_turn, speed, (float)encoder_target, rUp, rDown, kp_turn, kd_turn, true, false, subBuf, 1);
    execTurnSelectCode(select, false);
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}

void FFE_turn(int speed, long encoder_target, const char* select, unsigned long rUp, long rDown) {
    FFE_turn(speed, encoder_target, parseTurnSelectStr(select), rUp, rDown);
}

// --- BBE ---
void BBE(int speed, long encoder_target) {
    speed = constrain(speed, min_speed_enc, max_speed_enc);
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "BBE(%d,%ld);", speed, encoder_target);
    baseMoveEncInternal(min_speed_enc, speed, (float)encoder_target, ramp_up, ramp_down, bwdKp, bwdKd, false, false, cmdBuf, 2);
}

void BBE(int speed, long encoder_target, unsigned long rUp, long rDown) {
    speed = constrain(speed, min_speed_enc, max_speed_enc);
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "BBE(%d,%ld);", speed, encoder_target);
    baseMoveEncInternal(min_speed_enc, speed, (float)encoder_target, rUp, rDown, bwdKp, bwdKd, false, true, cmdBuf, 2);
    missionFinishCommandBeep();
}

void BBE(int speed, long encoder_target, char select) {
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), "BBE(%d,%ld,'%c');", speed, encoder_target, select);
    BBE(speed, encoder_target);
    execSpinSelect(select);
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}

void BBE(int speed, long encoder_target, char select, unsigned long rUp, long rDown) {
    speed = constrain(speed, min_speed_enc, max_speed_enc);
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), "BBE(%d,%ld,'%c');", speed, encoder_target, select);
    char subBuf[22];
    snprintf(subBuf, sizeof(subBuf), "BBE(%d,%ld)", speed, encoder_target);
    baseMoveEncInternal(min_speed_enc, speed, (float)encoder_target, rUp, rDown, bwdKp, bwdKd, false, true, subBuf, 2);
    execSpinSelect(select);
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}

// --- BBE_turn (รองรับทั้ง char 'L'/'R'/'l'/'r' และ int/string 'TL'/'TR'/'Tl'/'Tr' / "TL"/"TR"/"Tl"/"Tr") ---
void BBE_turn(int speed, long encoder_target) {
    speed = constrain(speed, min_speed_enc_turn, max_speed_enc_turn);
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "BBE_turn(%d,%ld)", speed, encoder_target);
    baseMoveEncInternal(min_speed_enc_turn, speed, (float)encoder_target, ramp_up_turn, ramp_down_turn, kp_turn, kd_turn, false, false, cmdBuf, 2);
}

void BBE_turn(int speed, long encoder_target, char select) {
    BBE_turn(speed, encoder_target, (int)(unsigned char)select, ramp_up_turn, ramp_down_turn);
}

void BBE_turn(int speed, long encoder_target, int select) {
    BBE_turn(speed, encoder_target, select, ramp_up_turn, ramp_down_turn);
}

void BBE_turn(int speed, long encoder_target, const char* select) {
    BBE_turn(speed, encoder_target, parseTurnSelectStr(select), ramp_up_turn, ramp_down_turn);
}

void BBE_turn(int speed, long encoder_target, unsigned long rUp, long rDown) {
    speed = constrain(speed, min_speed_enc_turn, max_speed_enc_turn);
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "BBE_turn(%d,%ld)", speed, encoder_target);
    baseMoveEncInternal(min_speed_enc_turn, speed, (float)encoder_target, rUp, rDown, kp_turn, kd_turn, false, true, cmdBuf, 2);
    missionFinishCommandBeep();
}

void BBE_turn(int speed, long encoder_target, char select, unsigned long rUp, long rDown) {
    BBE_turn(speed, encoder_target, (int)(unsigned char)select, rUp, rDown);
}

void BBE_turn(int speed, long encoder_target, int select, unsigned long rUp, long rDown) {
    speed = constrain(speed, min_speed_enc_turn, max_speed_enc_turn);
    char tag[4];
    formatSelectTag(select, tag);
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), "BBE_turn(%d,%ld,'%s')", speed, encoder_target, tag);
    char subBuf[22];
    snprintf(subBuf, sizeof(subBuf), "BBE_turn(%d,%ld)", speed, encoder_target);
    baseMoveEncInternal(min_speed_enc_turn, speed, (float)encoder_target, rUp, rDown, kp_turn, kd_turn, false, false, subBuf, 2);
    execTurnSelectCode(select, true);
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}

void BBE_turn(int speed, long encoder_target, const char* select, unsigned long rUp, long rDown) {
    BBE_turn(speed, encoder_target, parseTurnSelectStr(select), rUp, rDown);
}

// ============================================================================
// API มาตรฐาน KT_ATOM_Middle: FC / BC / FC4 / BC4 (รันบนระบบเดินใหม่ + รองรับ 'TL'/'TR'/'Tl'/'Tr')
// ============================================================================
static void moveEncTurnWithHud(int speed, float cm, bool forward, bool stopAtEnd,
                               unsigned long rUp, long rDown, const char* label) {
    int maxSpd = constrain(abs(speed), 15, max_speed_enc_turn);
    int minSpd = min(min_speed_enc_turn, maxSpd);
    baseMoveEncInternal(minSpd, maxSpd, cm, rUp, rDown, kp_turn, kd_turn, forward, stopAtEnd, label, forward ? 1 : 2);
    if (stopAtEnd) missionFinishCommandBeep();
}

static void moveStraightEnc(int speed, float cm, bool forward, bool stopAtEnd,
                            unsigned long rUp, long rDown) {
    if (cm <= 0.0f) {
        if (stopAtEnd) {
            driveStop();
            missionFinishCommandBeep();
        }
        return;
    }
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), forward ? "FC(%d,%.0f);" : "BC(%d,%.0f);", speed, cm);
    moveEncTurnWithHud(speed, cm, forward, stopAtEnd, rUp, rDown, cmdBuf);
}

void FC(int speed, float cm, bool stopAtEnd) {
    moveStraightEnc(speed, cm, true, stopAtEnd, ramp_up_turn, ramp_down_turn);
}

void FC(int speed, float cm, int rUp, int rDown) {
    moveStraightEnc(speed, cm, true, true, (unsigned long)max(0, rUp), (long)max(0, rDown));
}

void BC(int speed, float cm, bool stopAtEnd) {
    moveStraightEnc(speed, cm, false, stopAtEnd, ramp_up_turn, ramp_down_turn);
}

void BC(int speed, float cm, int rUp, int rDown) {
    moveStraightEnc(speed, cm, false, true, (unsigned long)max(0, rUp), (long)max(0, rDown));
}

static void moveCompoundTurn(int speed, float cm, char dir, bool forward, float angleOverride,
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

    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), fmtMain, speed, cm, dir);

    if (cm > 0.0f) {
        char subBuf[22];
        snprintf(subBuf, sizeof(subBuf), forward ? "FC(%d,%.0f)" : "BC(%d,%.0f)", speed, cm);
        moveEncTurnWithHud(speed, cm, forward, doStopAndSpin, rUp, rDown, subBuf);
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
            TrunDegreeFront(turnAngle, -1, true);
        } else {
            TrunDegreeBack(turnAngle, -1, true);
        }
        turn = false;
    }

    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}

static void moveCompoundCode(int speed, float cm, int select, bool forward, bool stopBeforeTurn,
                             unsigned long rUp, long rDown) {
    if (!isTTTurnCode(select)) {
        moveCompoundTurn(speed, cm, (char)(select & 0xFF), forward, 0.0f,
                         forward ? "FC(%d,%.0f,'%c');" : "BC(%d,%.0f,'%c');",
                         stopBeforeTurn, rUp, rDown);
        return;
    }

    char tag[4];
    formatSelectTag(select, tag);
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), forward ? "FC(%d,%.0f,'%s');" : "BC(%d,%.0f,'%s');",
             speed, cm, tag);

    if (cm > 0.0f) {
        char subBuf[22];
        snprintf(subBuf, sizeof(subBuf), forward ? "FC(%d,%.0f)" : "BC(%d,%.0f)", speed, cm);
        moveEncTurnWithHud(speed, cm, forward, stopBeforeTurn, rUp, rDown, subBuf);
    } else if (stopBeforeTurn) {
        driveStop();
    }

    execTurnSelectCode(select, !forward);
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}

void FC(int speed, float cm, char dir) {
    moveCompoundTurn(speed, cm, dir, true, 0.0f, "FC(%d,%.0f,'%c');", false, ramp_up_turn, ramp_down_turn);
}

void FC(int speed, float cm, int select) {
    moveCompoundCode(speed, cm, select, true, false, ramp_up_turn, ramp_down_turn);
}

void FC(int speed, float cm, const char* select) {
    moveCompoundCode(speed, cm, parseTurnSelectStr(select), true, false, ramp_up_turn, ramp_down_turn);
}

void FC(int speed, float cm, char dir, bool stopBeforeTurn) {
    moveCompoundTurn(speed, cm, dir, true, 0.0f, "FC(%d,%.0f,'%c');", stopBeforeTurn, ramp_up_turn, ramp_down_turn);
}

void FC(int speed, float cm, const char* select, bool stopBeforeTurn) {
    moveCompoundCode(speed, cm, parseTurnSelectStr(select), true, stopBeforeTurn, ramp_up_turn, ramp_down_turn);
}

void FC(int speed, float cm, char dir, unsigned long rUp, long rDown) {
    moveCompoundTurn(speed, cm, dir, true, 0.0f, "FC(%d,%.0f,'%c');", false, rUp, rDown);
}

void FC(int speed, float cm, int select, unsigned long rUp, long rDown) {
    moveCompoundCode(speed, cm, select, true, false, rUp, rDown);
}

void FC(int speed, float cm, const char* select, unsigned long rUp, long rDown) {
    moveCompoundCode(speed, cm, parseTurnSelectStr(select), true, false, rUp, rDown);
}

void BC(int speed, float cm, char dir) {
    moveCompoundTurn(speed, cm, dir, false, 0.0f, "BC(%d,%.0f,'%c');", false, ramp_up_turn, ramp_down_turn);
}

void BC(int speed, float cm, int select) {
    moveCompoundCode(speed, cm, select, false, false, ramp_up_turn, ramp_down_turn);
}

void BC(int speed, float cm, const char* select) {
    moveCompoundCode(speed, cm, parseTurnSelectStr(select), false, false, ramp_up_turn, ramp_down_turn);
}

void BC(int speed, float cm, char dir, bool stopBeforeTurn) {
    moveCompoundTurn(speed, cm, dir, false, 0.0f, "BC(%d,%.0f,'%c');", stopBeforeTurn, ramp_up_turn, ramp_down_turn);
}

void BC(int speed, float cm, const char* select, bool stopBeforeTurn) {
    moveCompoundCode(speed, cm, parseTurnSelectStr(select), false, stopBeforeTurn, ramp_up_turn, ramp_down_turn);
}

void BC(int speed, float cm, char dir, unsigned long rUp, long rDown) {
    moveCompoundTurn(speed, cm, dir, false, 0.0f, "BC(%d,%.0f,'%c');", false, rUp, rDown);
}

void BC(int speed, float cm, int select, unsigned long rUp, long rDown) {
    moveCompoundCode(speed, cm, select, false, false, rUp, rDown);
}

void BC(int speed, float cm, const char* select, unsigned long rUp, long rDown) {
    moveCompoundCode(speed, cm, parseTurnSelectStr(select), false, false, rUp, rDown);
}

void FC4(int speed, float cm, char dir) {
    moveCompoundTurn(speed, cm, dir, true, 45.0f, "FC4(%d,%.0f,'%c');", false, ramp_up_turn, ramp_down_turn);
}

void BC4(int speed, float cm, char dir) {
    moveCompoundTurn(speed, cm, dir, false, 45.0f, "BC4(%d,%.0f,'%c');", false, ramp_up_turn, ramp_down_turn);
}

void FC4(int speed, float cm, char dir, bool stopBeforeTurn) {
    moveCompoundTurn(speed, cm, dir, true, 45.0f, "FC4(%d,%.0f,'%c');", stopBeforeTurn, ramp_up_turn, ramp_down_turn);
}

void BC4(int speed, float cm, char dir, bool stopBeforeTurn) {
    moveCompoundTurn(speed, cm, dir, false, 45.0f, "BC4(%d,%.0f,'%c');", stopBeforeTurn, ramp_up_turn, ramp_down_turn);
}

// ============================================================================
// กลุ่มเดินหน้า-ถอยหลังด้วยเวลา: BaseFF / BaseBB / FF / FF_turn / BB / BB_turn
// (ตรงตาม MoveTIME.ino ของ PT_MIDDLE_ENC_2026Endcode4MOV1)
// ============================================================================
static void baseMoveTimeInternal(int Min_speed, int Max_speed, unsigned long time_target,
                                 unsigned long Ramp_up, unsigned long Ramp_down,
                                 float KP, float KD, bool forward, bool stop_at_end,
                                 const char* hudLabel = nullptr, int hudIcon = 0) {
    int min_speed = Min_speed;
    int max_speed = Max_speed;
    int current_speed = min_speed;
    float previous_error = 0.0f;
    bool timer_started = false;
    const int angle_tolerance = 10;

    unsigned long timer = 0;
    unsigned long rampStartTime = 0;
    unsigned long startTime = millis();
    bool hudNotified = (hudLabel == nullptr);

    while (true) {
        serviceNonBlockingBeep();
        missionUpdateTimerHUD();
        unsigned long elapsed_since_start = millis() - startTime;

        if (!timer_started) {
            current_speed = (Ramp_up == 0) ? max_speed : min_speed;
        } else {
            unsigned long ramp_elapsed = millis() - rampStartTime;
            if (Ramp_up == 0) {
                current_speed = max_speed;
            } else if (ramp_elapsed <= Ramp_up) {
                current_speed = min_speed + (int)(((float)ramp_elapsed / (float)Ramp_up) * (max_speed - min_speed));
            } else {
                current_speed = max_speed;
            }
        }

        if (timer_started && Ramp_down > 0) {
            unsigned long elapsed_since_timer = millis() - timer;
            unsigned long remaining_time = (elapsed_since_timer < time_target) ? (time_target - elapsed_since_timer) : 0;
            if (remaining_time <= Ramp_down) {
                int ramp_down_speed = min_speed + (int)(((float)remaining_time / (float)Ramp_down) * (max_speed - min_speed));
                ramp_down_speed = constrain(ramp_down_speed, min_speed, max_speed);
                if (ramp_down_speed < current_speed) current_speed = ramp_down_speed;
            }
        }

        float error = forward ? moveForward(current_speed, previous_error, KP, KD)
                              : moveBackward(current_speed, previous_error, KP, KD);

        if (!hudNotified) {
            hudNotified = true;
            missionNotifyCommand(hudLabel, hudIcon);
        }

        if (!timer_started && fabsf(error) <= (float)angle_tolerance) {
            timer = millis();
            rampStartTime = millis();
            timer_started = true;
        }
        if (timer_started && (millis() - timer >= time_target)) {
            if (stop_at_end) driveStop();
            break;
        }
        if (elapsed_since_start >= 8000UL) {
            driveStop();
            break;
        }
        delay(1);
    }
}

void BaseFF(int Min_speed, int Max_speed, unsigned long time_target,
            unsigned long Ramp_up, unsigned long Ramp_down, float KP, float KD, bool stop_at_end) {
    baseMoveTimeInternal(Min_speed, Max_speed, time_target, Ramp_up, Ramp_down, KP, KD, true, stop_at_end);
}

void BaseBB(int Min_speed, int Max_speed, unsigned long time_target,
            unsigned long Ramp_up, unsigned long Ramp_down, float KP, float KD, bool stop_at_end) {
    baseMoveTimeInternal(Min_speed, Max_speed, time_target, Ramp_up, Ramp_down, KP, KD, false, stop_at_end);
}

void FF(int speed, unsigned long timer) {
    speed = constrain(speed, min_speed_time, max_speed_time);
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "FF(%d,%lu);", speed, timer);
    baseMoveTimeInternal(min_speed_time, speed, timer, ramp_up_ms, ramp_down_ms, kp_time, kd_time, true, true, cmdBuf, 1);
    missionFinishCommandBeep();
    delay(delayALL);
}

void FF(int speed, unsigned long timer, unsigned long rUp, unsigned long rDown) {
    speed = constrain(speed, min_speed_time, max_speed_time);
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "FF(%d,%lu);", speed, timer);
    baseMoveTimeInternal(min_speed_time, speed, timer, rUp, rDown, kp_time, kd_time, true, true, cmdBuf, 1);
    missionFinishCommandBeep();
    delay(delayALL);
}

void FF(int speed, unsigned long timer, char select) {
    speed = constrain(speed, min_speed_time, max_speed_time);
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), "FF(%d,%lu,'%c');", speed, timer, select);
    char subBuf[22];
    snprintf(subBuf, sizeof(subBuf), "FF(%d,%lu)", speed, timer);
    baseMoveTimeInternal(min_speed_time, speed, timer, ramp_up_ms, ramp_down_ms, kp_time, kd_time, true, true, subBuf, 1);
    execSpinSelect(select);
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
    delay(delayALL);
}

void FF_turn(int speed, unsigned long timer) {
    speed = constrain(speed, min_speed_time_turn, max_speed_time_turn);
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "FF_turn(%d,%lu)", speed, timer);
    baseMoveTimeInternal(min_speed_time_turn, speed, timer, ramp_up_time_turn, ramp_down_time_turn, kp_time_turn, kd_time_turn, true, true, cmdBuf, 1);
    missionFinishCommandBeep();
}

void FF_turn(int speed, unsigned long timer, char select) {
    FF_turn(speed, timer, (int)(unsigned char)select);
}

void FF_turn(int speed, unsigned long timer, int select) {
    speed = constrain(speed, min_speed_time_turn, max_speed_time_turn);
    char tag[4];
    formatSelectTag(select, tag);
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), "FF_turn(%d,%lu,'%s')", speed, timer, tag);
    char subBuf[22];
    snprintf(subBuf, sizeof(subBuf), "FF_turn(%d,%lu)", speed, timer);
    baseMoveTimeInternal(min_speed_time_turn, speed, timer, ramp_up_time_turn, ramp_down_time_turn, kp_time_turn, kd_time_turn, true, false, subBuf, 1);
    execTurnSelectCode(select, false);
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}

void FF_turn(int speed, unsigned long timer, const char* select) {
    FF_turn(speed, timer, parseTurnSelectStr(select));
}

void BB(int speed, unsigned long timer) {
    speed = constrain(speed, min_speed_time, max_speed_time);
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "BB(%d,%lu);", speed, timer);
    baseMoveTimeInternal(min_speed_time, speed, timer, ramp_up_ms, ramp_down_ms, kp_time, kd_time, false, true, cmdBuf, 2);
    missionFinishCommandBeep();
    delay(delayALL);
}

void BB(int speed, unsigned long timer, unsigned long rUp, unsigned long rDown) {
    speed = constrain(speed, min_speed_time, max_speed_time);
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "BB(%d,%lu);", speed, timer);
    baseMoveTimeInternal(min_speed_time, speed, timer, rUp, rDown, kp_time, kd_time, false, true, cmdBuf, 2);
    missionFinishCommandBeep();
    delay(delayALL);
}

void BB(int speed, unsigned long timer, char select) {
    speed = constrain(speed, min_speed_time, max_speed_time);
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), "BB(%d,%lu,'%c');", speed, timer, select);
    char subBuf[22];
    snprintf(subBuf, sizeof(subBuf), "BB(%d,%lu)", speed, timer);
    baseMoveTimeInternal(min_speed_time, speed, timer, ramp_up_ms, ramp_down_ms, kp_time, kd_time, false, true, subBuf, 2);
    execSpinSelect(select);
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
    delay(delayALL);
}

void BB_turn(int speed, unsigned long timer) {
    speed = constrain(speed, min_speed_time_turn, max_speed_time_turn);
    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "BB_turn(%d,%lu)", speed, timer);
    baseMoveTimeInternal(min_speed_time_turn, speed, timer, ramp_up_time_turn, ramp_down_time_turn, kp_time_turn, kd_time_turn, false, true, cmdBuf, 2);
    missionFinishCommandBeep();
}

void BB_turn(int speed, unsigned long timer, char select) {
    BB_turn(speed, timer, (int)(unsigned char)select);
}

void BB_turn(int speed, unsigned long timer, int select) {
    speed = constrain(speed, min_speed_time_turn, max_speed_time_turn);
    char tag[4];
    formatSelectTag(select, tag);
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), "BB_turn(%d,%lu,'%s')", speed, timer, tag);
    char subBuf[22];
    snprintf(subBuf, sizeof(subBuf), "BB_turn(%d,%lu)", speed, timer);
    baseMoveTimeInternal(min_speed_time_turn, speed, timer, ramp_up_time_turn, ramp_down_time_turn, kp_time_turn, kd_time_turn, false, false, subBuf, 2);
    execTurnSelectCode(select, true);
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}

void BB_turn(int speed, unsigned long timer, const char* select) {
    BB_turn(speed, timer, parseTurnSelectStr(select));
}

// ============================================================================
// กลุ่มจัดแนวเข้าเส้นดำและรีเซ็ต Gyroscope (ตาม Move.ino ของ PT_MIDDLE_ENC_2026Endcode4MOV1)
// ============================================================================
bool SetFront_Yaw(int speed) {
    missionNotifyCommand("SetF();", 9);
    const unsigned long align_timeout = 2500;
    unsigned long start_time = millis();
    float previous_error = 0.0f;

    while (true) {
        serviceNonBlockingBeep();
        missionUpdateTimerHUD();
        readLine();

        bool S0 = line_value[0] <= sensorDifference; // FL
        bool S1 = line_value[1] <= sensorDifference; // FR

        if (S0 && S1) {
            driveStop();
            break;
        }

        if (!S0 && !S1) {
            previous_error = moveForward(speed, previous_error);
        } else {
            int left_speed  = S0 ? -speed : speed;
            int right_speed = S1 ? -speed : speed;
            motorWriteSpeedBalanced(left_speed, right_speed);
        }

        if (millis() - start_time >= align_timeout) {
            driveStop();
            return false;
        }
        delay(1);
    }
    delay(100);
    resetTargetYaw();
    missionFinishCommandBeep();
    return true;
}

bool SetFront_Yaw(int speed, unsigned long target) {
    if (!SetFront_Yaw(speed)) return false;
    BBE(speed, (long)target, 0, 0);
    return true;
}

bool SetFront_Yaw(int speed, unsigned long target, char select) {
    if (!SetFront_Yaw(speed, target)) return false;
    execSpinSelect(select);
    return true;
}

static void alignLineSensors(int speed, bool forward, unsigned long postDelayMs) {
    float previous_error = 0.0f;
    unsigned long start_time = millis();
    byte sA = forward ? 0 : 2;
    byte sB = forward ? 1 : 3;
    while (millis() - start_time < 5000UL) {
        serviceNonBlockingBeep();
        missionUpdateTimerHUD();
        readLine();
        if (line_value[sA] <= sensorDifference && line_value[sB] <= sensorDifference) {
            driveStop();
            break;
        }
        if (forward) moveForward(speed, previous_error);
        else         moveBackward(speed, previous_error);
        delay(1);
    }
    driveStop();
    if (postDelayMs > 0) delay(postDelayMs);
}

void SetFront(int speed) {
    missionNotifyCommand("SetFront", 9);
    alignLineSensors(speed, true, 100);
    missionFinishCommandBeep();
}

void SetFront_drop(int speed) {
    alignLineSensors(speed, true, 0);
}

void SetFront(int speed, unsigned long target) {
    SetFront(speed);
    BBE(speed, (long)target, 0, 0);
}

void SetFront(int speed, unsigned long target, char select) {
    SetFront(speed, target);
    execSpinSelect(select);
}

void SetFront_time(int speed, unsigned long timer) {
    SetFront(speed);
    BB(speed, timer, 0, 0);
}

void SetFront_time(int speed, unsigned long target, char select) {
    SetFront_time(speed, target);
    execSpinSelect(select);
}

bool SetBack_Yaw(int speed) {
    missionNotifyCommand("SetB();", 10);
    const unsigned long align_timeout = 2500;
    unsigned long start_time = millis();
    float previous_error = 0.0f;

    while (true) {
        serviceNonBlockingBeep();
        missionUpdateTimerHUD();
        readLine();

        bool S2 = line_value[2] <= sensorDifference; // BR
        bool S3 = line_value[3] <= sensorDifference; // BL

        if (S2 && S3) {
            driveStop();
            break;
        }

        if (!S2 && !S3) {
            previous_error = moveBackward(speed, previous_error);
        } else {
            int left_speed  = S3 ? speed : -speed;
            int right_speed = S2 ? speed : -speed;
            motorWriteSpeedBalanced(left_speed, right_speed);
        }

        if (millis() - start_time >= align_timeout) {
            driveStop();
            return false;
        }
        delay(1);
    }
    delay(100);
    resetTargetYaw();
    missionFinishCommandBeep();
    return true;
}

bool SetBack_Yaw(int speed, unsigned long target) {
    if (!SetBack_Yaw(speed)) return false;
    FFE(speed, (long)target, 0, 0);
    return true;
}

bool SetBack_Yaw(int speed, unsigned long target, char select) {
    if (!SetBack_Yaw(speed, target)) return false;
    execSpinSelect(select);
    return true;
}

void SetBack(int speed) {
    missionNotifyCommand("SetBack", 10);
    alignLineSensors(speed, false, 100);
    missionFinishCommandBeep();
}

void SetBack_drop(int speed) {
    alignLineSensors(speed, false, 0);
}

void SetBack(int speed, unsigned long target) {
    SetBack(speed);
    FFE(speed, (long)target, 0, 0);
}

void SetBack(int speed, unsigned long target, char select) {
    SetBack(speed, target);
    execSpinSelect(select);
}

void SetBack_time(int speed, unsigned long timer) {
    SetBack(speed);
    FF(speed, timer, 0, 0);
}

void SetBack_time(int speed, unsigned long target, char select) {
    SetBack_time(speed, target);
    execSpinSelect(select);
}

void limitMotorTrim() {
    if (motor_trim_forward > 30) motor_trim_forward = 30;
    else if (motor_trim_forward < -30) motor_trim_forward = -30;
    if (motor_trim_backward > 30) motor_trim_backward = 30;
    else if (motor_trim_backward < -30) motor_trim_backward = -30;
}

// --- API มาตรฐาน KT_ATOM_Middle (SetF / SetB / DropF(speed) / DropB(speed)) ---
void SetF(int speed) {
    SetFront_Yaw(speed);
}

void SetF(int speed, float backCm) {
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), "SetF(%d,%.0f);", speed, backCm);
    SetFront_Yaw(speed);
    if (backCm > 0.0f) {
        int maxSpd = constrain(abs(speed), 15, max_speed_enc);
        int minSpd = min(min_speed_enc, maxSpd);
        baseMoveEncInternal(minSpd, maxSpd, backCm, 0, 0, bwdKp, bwdKd, false, true, "BBE", 2);
    }
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}

void SetF(int speed, float backCm, char dir) {
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), "SetF(%d,%.0f,'%c');", speed, backCm, dir);
    SetFront_Yaw(speed);
    if (backCm > 0.0f) {
        int maxSpd = constrain(abs(speed), 15, max_speed_enc);
        int minSpd = min(min_speed_enc, maxSpd);
        baseMoveEncInternal(minSpd, maxSpd, backCm, 0, 0, bwdKp, bwdKd, false, true, "BBE", 2);
        delay(10);
    }
    execSpinSelect(dir);
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}

void SetB(int speed) {
    SetBack_Yaw(speed);
}

void SetB(int speed, float fwdCm) {
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), "SetB(%d,%.0f);", speed, fwdCm);
    SetBack_Yaw(speed);
    if (fwdCm > 0.0f) {
        int maxSpd = constrain(abs(speed), 15, max_speed_enc);
        int minSpd = min(min_speed_enc, maxSpd);
        baseMoveEncInternal(minSpd, maxSpd, fwdCm, 0, 0, fwdKp, fwdKd, true, true, "FFE", 1);
    }
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}

void SetB(int speed, float fwdCm, char dir) {
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), "SetB(%d,%.0f,'%c');", speed, fwdCm, dir);
    SetBack_Yaw(speed);
    if (fwdCm > 0.0f) {
        int maxSpd = constrain(abs(speed), 15, max_speed_enc);
        int minSpd = min(min_speed_enc, maxSpd);
        baseMoveEncInternal(minSpd, maxSpd, fwdCm, 0, 0, fwdKp, fwdKd, true, true, "FFE", 1);
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
    missionNotifyCommand("SetFront_drop", 9);
    SetFront_drop(speed);
    DropF();
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}

void DropB(int speed) {
    s_inCompoundCmd  = true;
    s_compoundBeeped = false;
    snprintf(s_compoundMain, sizeof(s_compoundMain), "DropB(%d);", speed);
    missionNotifyCommand("SetBack_drop", 10);
    SetBack_drop(speed);
    DropB();
    s_inCompoundCmd = false;
    missionFinishCommandBeep();
}
