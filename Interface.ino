// ============================================================================
// Interface.ino — UI 3 ส่วน (Top Bar / Content / Bottom Bar) พร้อมไอคอน + Assembly Mode
// ============================================================================
#include <KT_Logo.h>

// ============================================================================
// ไอคอนแสดงคำสั่งขณะหุ่นยนต์กำลังทำงาน (40x40 px ที่มุมซ้ายของการ์ด Active Command)
// ============================================================================
#define CMD_ICON_NONE    0
#define CMD_ICON_FWD     1
#define CMD_ICON_BWD     2
#define CMD_ICON_SPIN_L  3
#define CMD_ICON_SPIN_R  4
#define CMD_ICON_TURN_FL 5
#define CMD_ICON_TURN_FR 6
#define CMD_ICON_TURN_BL 7
#define CMD_ICON_TURN_BR 8
#define CMD_ICON_LINE_F  9
#define CMD_ICON_LINE_B  10
#define CMD_ICON_DROP_F  11
#define CMD_ICON_DROP_B  12
#define CMD_ICON_PAUSE   13

static void drawHexCube3D(int cx, int cy, uint16_t color) {
    // หกเหลี่ยม 3 มิติ (Isometric Cube)
    int x0 = cx,     y0 = cy - 10;
    int x1 = cx + 9, y1 = cy - 5;
    int x2 = cx + 9, y2 = cy + 5;
    int x3 = cx,     y3 = cy + 10;
    int x4 = cx - 9, y4 = cy + 5;
    int x5 = cx - 9, y5 = cy - 5;

    tft.drawLine(x0, y0, x1, y1, color);
    tft.drawLine(x1, y1, x2, y2, color);
    tft.drawLine(x2, y2, x3, y3, color);
    tft.drawLine(x3, y3, x4, y4, color);
    tft.drawLine(x4, y4, x5, y5, color);
    tft.drawLine(x5, y5, x0, y0, color);
    // เส้นแกน Y ด้านในให้ดูเป็นลูกบาศก์ 3 มิติ
    tft.drawLine(x5, y5, cx, cy, color);
    tft.drawLine(x1, y1, cx, cy, color);
    tft.drawLine(x0, cy, x3, y3, color);
}

void uiDrawCommandIcon(int iconId, bool blinkOn) {
    const int bx = 11, by = 46, bw = 44, bh = 46;
    const int cx = bx + bw / 2;
    const int cy = by + bh / 2;

    tft.fillRoundRect(bx, by, bw, bh, 7, 0x0842);
    tft.drawRoundRect(bx, by, bw, bh, 7, 0x2965);

    switch (iconId) {
        case CMD_ICON_FWD: // ลูกศรชี้ขึ้น (ขอบมน)
            tft.fillRoundRect(cx - 3, cy - 4, 7, 16, 2, ST77XX_GREEN);
            tft.fillTriangle(cx, cy - 15, cx - 10, cy - 3, cx + 10, cy - 3, ST77XX_GREEN);
            break;

        case CMD_ICON_BWD: // ลูกศรชี้ลง (ขอบมน)
            tft.fillRoundRect(cx - 3, cy - 12, 7, 16, 2, 0xFFE0);
            tft.fillTriangle(cx, cy + 15, cx - 10, cy + 3, cx + 10, cy + 3, 0xFFE0);
            break;

        case CMD_ICON_SPIN_L: // หมุนซ้าย (ขอบมน)
            tft.fillRoundRect(cx - 4, cy - 3, 16, 7, 2, 0x07FF);
            tft.fillTriangle(cx - 15, cy, cx - 3, cy - 10, cx - 3, cy + 10, 0x07FF);
            break;

        case CMD_ICON_SPIN_R: // หมุนขวา (ขอบมน)
            tft.fillRoundRect(cx - 12, cy - 3, 16, 7, 2, 0x07FF);
            tft.fillTriangle(cx + 15, cy, cx + 3, cy - 10, cx + 3, cy + 10, 0x07FF);
            break;

        case CMD_ICON_TURN_FL: // เส้นตรงขึ้นไปแล้วเลี้ยวซ้าย (มุมโค้ง)
            tft.fillRoundRect(cx + 4, cy - 7, 4, 21, 2, 0x07FF);
            tft.fillRoundRect(cx - 6, cy - 8, 13, 4, 2, 0x07FF);
            tft.fillCircle(cx + 5, cy - 6, 3, 0x07FF);
            tft.fillTriangle(cx - 15, cy - 6, cx - 5, cy - 13, cx - 5, cy + 1, 0x07FF);
            break;

        case CMD_ICON_TURN_FR: // เส้นตรงขึ้นไปแล้วเลี้ยวขวา (มุมโค้ง)
            tft.fillRoundRect(cx - 8, cy - 7, 4, 21, 2, 0x07FF);
            tft.fillRoundRect(cx - 7, cy - 8, 13, 4, 2, 0x07FF);
            tft.fillCircle(cx - 6, cy - 6, 3, 0x07FF);
            tft.fillTriangle(cx + 15, cy - 6, cx + 5, cy - 13, cx + 5, cy + 1, 0x07FF);
            break;

        case CMD_ICON_TURN_BL: // เส้นตรงลงมาแล้วเลี้ยวซ้าย (มุมโค้ง)
            tft.fillRoundRect(cx + 4, cy - 14, 4, 21, 2, 0xFFE0);
            tft.fillRoundRect(cx - 6, cy + 4, 13, 4, 2, 0xFFE0);
            tft.fillCircle(cx + 5, cy + 5, 3, 0xFFE0);
            tft.fillTriangle(cx - 15, cy + 6, cx - 5, cy - 1, cx - 5, cy + 13, 0xFFE0);
            break;

        case CMD_ICON_TURN_BR: // เส้นตรงลงมาแล้วเลี้ยวขวา (มุมโค้ง)
            tft.fillRoundRect(cx - 8, cy - 14, 4, 21, 2, 0xFFE0);
            tft.fillRoundRect(cx - 7, cy + 4, 13, 4, 2, 0xFFE0);
            tft.fillCircle(cx - 6, cy + 5, 3, 0xFFE0);
            tft.fillTriangle(cx + 15, cy + 6, cx + 5, cy - 1, cx + 5, cy + 13, 0xFFE0);
            break;

        case CMD_ICON_LINE_F: // ลูกศรชี้ขึ้น + เส้นกระพริบด้านบน (ขอบมน)
            if (blinkOn) {
                tft.fillRoundRect(bx + 5, by + 4, bw - 10, 4, 2, ST77XX_WHITE);
            }
            tft.fillRoundRect(cx - 3, cy, 7, 14, 2, ST77XX_GREEN);
            tft.fillTriangle(cx, cy - 9, cx - 9, cy + 1, cx + 9, cy + 1, ST77XX_GREEN);
            break;

        case CMD_ICON_LINE_B: // ลูกศรชี้ลง + เส้นกระพริบด้านล่าง (ขอบมน)
            if (blinkOn) {
                tft.fillRoundRect(bx + 5, by + bh - 8, bw - 10, 4, 2, ST77XX_WHITE);
            }
            tft.fillRoundRect(cx - 3, cy - 14, 7, 14, 2, 0xFFE0);
            tft.fillTriangle(cx, cy + 9, cx - 9, cy - 1, cx + 9, cy - 1, 0xFFE0);
            break;

        case CMD_ICON_DROP_F: // ลูกบาศก์ 3D ด้านซ้าย + ลูกศรชี้ขึ้นด้านขวา
            drawHexCube3D(bx + 13, cy, 0xFFE0);
            tft.fillRoundRect(bx + 31, cy - 2, 5, 13, 2, ST77XX_GREEN);
            tft.fillTriangle(bx + 33, cy - 13, bx + 26, cy - 2, bx + 40, cy - 2, ST77XX_GREEN);
            break;

        case CMD_ICON_DROP_B: // ลูกบาศก์ 3D ด้านซ้าย + ลูกศรชี้ลงด้านขวา
            drawHexCube3D(bx + 13, cy, 0xFFE0);
            tft.fillRoundRect(bx + 31, cy - 11, 5, 13, 2, 0xFFE0);
            tft.fillTriangle(bx + 33, cy + 13, bx + 26, cy + 2, bx + 40, cy + 2, 0xFFE0);
            break;

        case CMD_ICON_PAUSE: // สัญลักษณ์หยุดชั่วคราว STOP() (ขอบมน)
            tft.fillRoundRect(cx - 9, cy - 12, 6, 24, 2, ST77XX_RED);
            tft.fillRoundRect(cx + 3, cy - 12, 6, 24, 2, ST77XX_RED);
            break;
    }
}

void uiDrawKTLogoCenter() {
    const int16_t lx = 10, ly = 25, lw = 140, lh = 78;
    uint16_t rowBuf[lw];
    for (int16_t row = 0; row < lh; row++) {
        int baseIdx = (ly + row) * 160 + lx;
        for (int16_t col = 0; col < lw; col++) {
            rowBuf[col] = pgm_read_word(&kt_logo[baseIdx + col]);
        }
        tft.drawRGBBitmap(lx, ly + row, rowBuf, lw, 1);
    }
}

#define UI_COLOR_TOP_BLUE   0x0255
#define UI_COLOR_TOP_ORANGE 0xC280
#define UI_COLOR_TOP_GREEN  0x03E0
#define UI_COLOR_BOTTOM_BG  0x18E3
#define UI_COLOR_CARD_BG    0x0841
#define UI_COLOR_CARD_LINE  0x39E7

#define BTN_NONE 0
#define BTN_A    1
#define BTN_B    2
#define BTN_AB   3

static void waitBothReleased() {
    while (readSwitch(A) || readSwitch(B)) {
        delay(10);
    }
    delay(35);
}

static int pollButtonAction(bool allowHoldRepeat = false) {
    serviceSerialCalibrationCommand();
    bool aDown = readSwitch(A);
    bool bDown = readSwitch(B);
    if (!aDown && !bDown) return BTN_NONE;

    delay(65); // ตรวจจับการกด A+B พร้อมกัน
    aDown = readSwitch(A);
    bDown = readSwitch(B);

    if (aDown && bDown) {
        maxBeep(30); // เสียงกดปุ่มดังสุดทุกครั้ง
        waitBothReleased();
        return BTN_AB;
    }
    if (aDown) {
        maxBeep(25);
        if (!allowHoldRepeat) waitBothReleased();
        else delay(65);
        return BTN_A;
    }
    if (bDown) {
        maxBeep(25);
        if (!allowHoldRepeat) waitBothReleased();
        else delay(65);
        return BTN_B;
    }
    return BTN_NONE;
}

static int pollSingleABForReady() {
    serviceSerialCalibrationCommand();
    bool aDown = readSwitch(A);
    bool bDown = readSwitch(B);
    if (!aDown && !bDown) return BTN_NONE;

    delay(30);
    aDown = readSwitch(A);
    bDown = readSwitch(B);
    if (aDown) {
        maxBeep(30);
        waitBothReleased();
        return BTN_A;
    }
    if (bDown) {
        maxBeep(30);
        waitBothReleased();
        return BTN_B;
    }
    return BTN_NONE;
}

// ============================================================================
// วาดไอคอนขนาดเล็ก (10x10) สำหรับหน้าจอ TFT
// ============================================================================
static void drawPlayIcon(int x, int y, uint16_t color) {
    tft.fillTriangle(x, y, x, y + 8, x + 7, y + 4, color);
}

static void drawMenuIcon(int idx, int x, int y, uint16_t color) {
    switch (idx) {
        case 0: // Sensor: แท่งสัญญาณ 3 ขีด
            tft.fillRect(x,     y + 5, 2, 4, color);
            tft.fillRect(x + 3, y + 3, 2, 6, color);
            tft.fillRect(x + 6, y + 1, 2, 8, color);
            break;
        case 1: // Servo: แขนเซอร์โว
            tft.drawCircle(x + 3, y + 5, 3, color);
            tft.drawLine(x + 3, y + 5, x + 8, y + 1, color);
            tft.drawLine(x + 3, y + 6, x + 8, y + 2, color);
            break;
        case 2: // IMU: เข็มทิศ
            tft.drawCircle(x + 4, y + 4, 4, color);
            tft.fillTriangle(x + 4, y + 1, x + 2, y + 5, x + 6, y + 5, color);
            break;
        case 3: // Encoder: ล้อเฟือง
            tft.drawCircle(x + 4, y + 4, 4, color);
            tft.fillCircle(x + 4, y + 4, 1, color);
            break;
        case 4: // Distance 30cm: ไม้บรรทัด
            tft.drawRect(x, y + 2, 9, 5, color);
            tft.drawFastVLine(x + 3, y + 2, 3, color);
            tft.drawFastVLine(x + 6, y + 2, 3, color);
            break;
        case 5: // Setup: สวิตช์
            tft.drawRoundRect(x, y + 2, 9, 5, 2, color);
            tft.fillCircle(x + 6, y + 4, 2, color);
            break;
    }
}

// ============================================================================
// แถบด้านบน (Top Bar: y = 0..19) และแถบด้านล่าง (Bottom Bar: y = 108..127)
// ============================================================================
void uiDrawTopBar(const char* title, const char* badge, uint16_t barColor) {
    tft.fillRect(0, 0, 160, 20, barColor);
    tft.drawFastHLine(0, 19, 160, 0xFFFF);

    // ไอคอนเล็กด้านซ้ายของ Top Bar
    tft.fillCircle(8, 9, 3, 0xFFE0);

    tft.setTextSize(1);
    tft.setTextColor(ST77XX_WHITE, barColor);
    tft.setCursor(15, 6);
    tft.print(title);

    if (badge != nullptr && badge[0] != '\0') {
        int bw = strlen(badge) * 6 + 8;
        int bx = 160 - bw - 4;
        tft.fillRoundRect(bx, 3, bw, 13, 3, ST77XX_BLACK);
        tft.setTextColor(0xFFE0, ST77XX_BLACK);
        tft.setCursor(bx + 4, 6);
        tft.print(badge);
    }
}

void uiDrawBottomBar(const char* leftHint, const char* rightHint) {
    tft.fillRect(0, 108, 160, 20, UI_COLOR_BOTTOM_BG);
    tft.drawFastHLine(0, 108, 160, UI_COLOR_CARD_LINE);
    tft.setTextSize(1);
    tft.setTextColor(0x07FF, UI_COLOR_BOTTOM_BG);
    tft.setCursor(6, 114);
    tft.print(leftHint);

    if (rightHint != nullptr && rightHint[0] != '\0') {
        int rw = strlen(rightHint) * 6;
        tft.setTextColor(0xFFE0, UI_COLOR_BOTTOM_BG);
        tft.setCursor(160 - rw - 6, 114);
        tft.print(rightHint);
    }
}

static void drawMenuList(const char* title, const char* badge, uint16_t headerColor,
                         const char* const items[], int count, int selected,
                         const char* leftHint, const char* rightHint, bool showIcons = false) {
    uiDrawTopBar(title, badge, headerColor);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
    tft.setTextSize(1);
    for (int i = 0; i < count; i++) {
        int y = 23 + i * 14;
        uint16_t fg = ST77XX_WHITE;
        if (i == selected) {
            tft.fillRoundRect(4, y - 1, 152, 12, 3, 0x07FF);
            fg = ST77XX_BLACK;
            tft.setTextColor(ST77XX_BLACK, 0x07FF);
        } else {
            tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
        }
        if (showIcons) {
            drawMenuIcon(i, 8, y + 1, fg);
            tft.setCursor(21, y + 1);
        } else {
            tft.setCursor(10, y + 1);
        }
        tft.print(items[i]);
    }
    uiDrawBottomBar(leftHint, rightHint);
}

// ============================================================================
// Assembly Sub-menu 1: Sensor (นับถอยหลัง 3 วิ -> หมุนคาลิเบรตสีเขียว/ขาวอัตโนมัติ)
// ============================================================================
static void runSensorAutoCalibrate() {
    // ยืนยันก่อนเริ่ม: กด A เพื่อเริ่มนับถอยหลัง 3 วิ, กด B เพื่อยกเลิก
    uiDrawTopBar("SENSOR CAL", "CONFIRM", UI_COLOR_TOP_ORANGE);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
    tft.drawRoundRect(8, 26, 144, 74, 6, 0xFFE0);
    tft.setTextSize(1);
    tft.setTextColor(0x07FF, ST77XX_BLACK);
    tft.setCursor(20, 36); tft.print("Auto Calibrate Line");
    tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
    tft.setCursor(20, 56); tft.print("[A] Start (3s count)");
    tft.setCursor(20, 72); tft.print("[B] Cancel");
    uiDrawBottomBar("[A] Start", "[B] Cancel");

    while (true) {
        int act = pollButtonAction();
        if (act == BTN_A) break;
        if (act == BTN_B) return;
        delay(20);
    }

    // นับถอยหลัง 3 วินาที เพื่อให้ผู้ใช้งานปล่อยมือจากหุ่นได้ทัน
    uiDrawTopBar("SENSOR CAL", "WAIT", UI_COLOR_TOP_ORANGE);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
    tft.drawRoundRect(10, 24, 140, 78, 6, 0xFFE0);
    tft.setTextSize(1);
    tft.setTextColor(0x07FF, ST77XX_BLACK);
    tft.setCursor(24, 30);
    tft.print("Hands off robot!");
    uiDrawBottomBar("[A/B] Cancel", "3s COUNT");

    for (int sec = 3; sec >= 1; sec--) {
        tft.setTextSize(4);
        tft.setTextColor(0xFFE0, ST77XX_BLACK);
        tft.setCursor(68, 48);
        tft.printf("%d", sec);
        maxBeep(60);

        unsigned long t0 = millis();
        while (millis() - t0 < 940UL) {
            if (readSwitch(A) || readSwitch(B)) {
                maxBeep(25);
                waitBothReleased();
                return;
            }
            delay(15);
        }
    }

    maxBeep(150);
    uiDrawTopBar("SENSOR CAL", "SPIN", UI_COLOR_TOP_ORANGE);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
    tft.drawRoundRect(6, 28, 148, 66, 4, 0xFFE0);
    tft.setTextSize(1);
    tft.setTextColor(0xFFE0, ST77XX_BLACK);
    tft.setCursor(16, 42);
    tft.print("Spinning to sample");
    tft.setCursor(16, 56);
    tft.print("Green & White...");
    uiDrawBottomBar("[A/B] Stop", "SAMPLING");

    int sMin[4] = { 4095, 4095, 4095, 4095 };
    int sMax[4] = { 0, 0, 0, 0 };

    unsigned long startMs = millis();
    setMotors(30, -30);
    while (millis() - startMs < 3500UL) {
        int vals[4];
        readAllLineSensors(vals);
        for (int i = 0; i < 4; i++) {
            if (vals[i] < sMin[i]) sMin[i] = vals[i];
            if (vals[i] > sMax[i]) sMax[i] = vals[i];
        }
        if (readSwitch(A) || readSwitch(B)) {
            maxBeep(25);
            waitBothReleased();
            break;
        }
        delay(10);
    }
    driveStop();

    for (int i = 0; i < 4; i++) {
        senMin[i]    = sMin[i];
        senMax[i]    = sMax[i];
        senThresh[i] = sMin[i] + ((sMax[i] - sMin[i]) * sensorDifference) / 100;
    }
    configSave();
    maxBeep(120);

    uiDrawTopBar("CAL SAVED!", "OK", UI_COLOR_TOP_GREEN);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
    tft.setTextSize(1);
    tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
    for (int i = 0; i < 4; i++) {
        tft.setCursor(8, 26 + i * 19);
        tft.printf("S%d: %3d-%4d T:%4d", i, senMin[i], senMax[i], senThresh[i]);
    }
    uiDrawBottomBar("[A/B] Back", "SAVED");
    while (pollButtonAction() == BTN_NONE) { delay(20); }
}

static void screenSensor() {
    uiDrawTopBar("1. SENSOR", "LINE", UI_COLOR_TOP_BLUE);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
    uiDrawBottomBar("[A+B] Cal", "[A/B] Back");

    while (true) {
        int vals[4];
        readAllLineSensors(vals);

        for (int i = 0; i < 4; i++) {
            int y = 25 + i * 20;
            bool onLine = (vals[i] < senThresh[i]);
            tft.setCursor(6, y);
            tft.setTextSize(1);
            tft.setTextColor(onLine ? ST77XX_GREEN : ST77XX_WHITE, ST77XX_BLACK);
            tft.printf("S%d:%4d T:%4d", i, vals[i], senThresh[i]);

            int barW = map(constrain(vals[i], 0, 1023), 0, 1023, 0, 48);
            tft.drawRect(102, y - 1, 52, 10, UI_COLOR_CARD_LINE);
            tft.fillRect(103, y, barW, 8, onLine ? ST77XX_GREEN : 0x07FF);
            if (barW < 50) tft.fillRect(103 + barW, y, 50 - barW, 8, ST77XX_BLACK);
        }

        Serial.printf("SEN: %4d %4d %4d %4d\n", vals[0], vals[1], vals[2], vals[3]);

        int act = pollButtonAction();
        if (act == BTN_AB) {
            runSensorAutoCalibrate();
            uiDrawTopBar("1. SENSOR", "LINE", UI_COLOR_TOP_BLUE);
            tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
            uiDrawBottomBar("[A+B] Cal", "[A/B] Back");
        } else if (act == BTN_A || act == BTN_B) {
            return;
        }
        delay(50);
    }
}

// ============================================================================
// Assembly Sub-menu 2: Setup Servo (การ์ด 2x2 + แถบเลื่อน 0-90-180)
// ============================================================================
static void editServoAngleScreen(const char* label, byte channel, int* targetVal) {
    uiDrawTopBar(label, "0-180", UI_COLOR_TOP_BLUE);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
    tft.drawRoundRect(8, 23, 144, 42, 5, 0x07FF);
    uiDrawBottomBar("[A]-1  [B]+1", "[A+B] Save");

    // สเกล 0 - 90 - 180 ด้านล่างแถบเลื่อน
    tft.setTextSize(1);
    tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
    tft.setCursor(10, 96);  tft.print("0");
    tft.setCursor(74, 96);  tft.print("90");
    tft.setCursor(134, 96); tft.print("180");

    int angle = constrain(*targetVal, 0, 180);
    int lastDrawn = -1;

    while (true) {
        if (angle != lastDrawn) {
            lastDrawn = angle;
            setServoAngle(channel, angle);

            // ตัวเลขมุมตรงกลางการ์ด
            tft.setTextSize(3);
            tft.setTextColor(ST77XX_GREEN, ST77XX_BLACK);
            tft.setCursor(48, 33);
            tft.printf("%3d", angle);

            // แถบเลื่อน 0 - 180 (x = 12..148, กว้าง 136px, ค่ากลาง 90 = x 80)
            const int barX = 12, barY = 74, barW = 136, barH = 14;
            tft.fillRect(barX, barY - 2, barW + 2, barH + 5, ST77XX_BLACK);
            tft.drawRoundRect(barX, barY, barW, barH, 3, UI_COLOR_CARD_LINE);

            int midX = barX + barW / 2;
            int posX = barX + (angle * (barW - 6)) / 180;

            // แถบสีจากจุดกึ่งกลาง (90°) ไปยังตำแหน่งปัจจุบัน
            if (angle >= 90) {
                tft.fillRect(midX, barY + 2, (posX + 3) - midX, barH - 4, 0x07FF);
            } else {
                tft.fillRect(posX + 3, barY + 2, midX - (posX + 3), barH - 4, 0xFFE0);
            }

            // เส้นมาร์คกึ่งกลาง 90°
            tft.drawFastVLine(midX, barY - 2, barH + 4, ST77XX_WHITE);
            // ตัวเลื่อน (Thumb)
            tft.fillRoundRect(posX, barY - 1, 6, barH + 2, 2, ST77XX_GREEN);
        }

        int act = pollButtonAction(true);
        if (act == BTN_A)      angle = constrain(angle - 1, 0, 180);
        else if (act == BTN_B) angle = constrain(angle + 1, 0, 180);
        else if (act == BTN_AB) {
            *targetVal = angle;
            configSave();
            maxBeep(100);
            return;
        }
        delay(15);
    }
}

static void drawServoGrid(int selected) {
    const char* titles[4] = { "F.LOCK", "F.DROP", "B.LOCK", "B.DROP" };
    const int vals[4]     = { frontLock, frontDrop, backLock, backDrop };

    uiDrawTopBar("2. SETUP SERVO", "S0/S1", UI_COLOR_TOP_BLUE);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);

    for (int i = 0; i < 4; i++) {
        int col = i % 2;
        int row = i / 2;
        int x = 6 + col * 76;
        int y = 23 + row * 33;
        int w = 72;
        int h = 30;
        bool sel = (i == selected);

        uint16_t bg = sel ? 0x07FF : UI_COLOR_CARD_BG;
        uint16_t fg = sel ? ST77XX_BLACK : ST77XX_WHITE;
        uint16_t bd = sel ? 0xFFE0 : UI_COLOR_CARD_LINE;

        tft.fillRoundRect(x, y, w, h, 4, bg);
        tft.drawRoundRect(x, y, w, h, 4, bd);

        tft.setTextSize(1);
        tft.setTextColor(sel ? ST77XX_BLACK : 0x07FF, bg);
        tft.setCursor(x + 6, y + 4);
        tft.print(titles[i]);

        tft.setTextSize(1);
        tft.setTextColor(sel ? ST77XX_BLACK : ST77XX_GREEN, bg);
        tft.setCursor(x + 6, y + 17);
        tft.printf("%d deg", vals[i]);
    }

    // การ์ด Back ด้านล่าง
    bool backSel = (selected == 4);
    tft.fillRoundRect(6, 90, 148, 15, 3, backSel ? 0x07FF : UI_COLOR_CARD_BG);
    tft.drawRoundRect(6, 90, 148, 15, 3, backSel ? 0xFFE0 : UI_COLOR_CARD_LINE);
    tft.setTextSize(1);
    tft.setTextColor(backSel ? ST77XX_BLACK : ST77XX_WHITE, backSel ? 0x07FF : UI_COLOR_CARD_BG);
    tft.setCursor(54, 94);
    tft.print("<- BACK");

    uiDrawBottomBar("[A/B] Move", "[A+B] Edit");
}

static void screenServo() {
    int idx = 0;
    int lastIdx = -1;

    while (true) {
        if (idx != lastIdx) {
            lastIdx = idx;
            drawServoGrid(idx);
        }
        int act = pollButtonAction();
        if (act == BTN_A)      idx = (idx - 1 + 5) % 5;
        else if (act == BTN_B) idx = (idx + 1) % 5;
        else if (act == BTN_AB) {
            if (idx == 4) return;
            switch (idx) {
                case 0: editServoAngleScreen("FRONT LOCK", SERVO_S0, &frontLock); break;
                case 1: editServoAngleScreen("FRONT DROP", SERVO_S0, &frontDrop); break;
                case 2: editServoAngleScreen("BACK LOCK",  SERVO_S1, &backLock);  break;
                case 3: editServoAngleScreen("BACK DROP",  SERVO_S1, &backDrop);  break;
            }
            lastIdx = -1;
        }
        delay(20);
    }
}

// ============================================================================
// Assembly Sub-menu 3: Read IMU (กด A = Reset Yaw, กด B = กลับ)
// ============================================================================
static void screenIMU() {
    uiDrawTopBar("3. READ IMU", "DEG", UI_COLOR_TOP_BLUE);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
    tft.drawRoundRect(6, 23, 148, 34, 4, ST77XX_GREEN);
    tft.drawRoundRect(6, 61, 72, 42, 4, UI_COLOR_CARD_LINE);
    tft.drawRoundRect(82, 61, 72, 42, 4, UI_COLOR_CARD_LINE);

    tft.setTextSize(1);
    tft.setTextColor(0x07FF, ST77XX_BLACK);
    tft.setCursor(12, 26); tft.print("YAW");
    tft.setCursor(12, 65); tft.print("PITCH");
    tft.setCursor(88, 65); tft.print("ROLL");
    uiDrawBottomBar("[A] Reset", "[B] Back");

    while (true) {
        float yaw   = readAngle(YAW);
        float pitch = readAngle(PITCH);
        float roll  = readAngle(ROLL);

        tft.setTextSize(2);
        tft.setTextColor(ST77XX_GREEN, ST77XX_BLACK);
        tft.setCursor(46, 34); tft.printf("%6.1f", yaw);

        tft.setTextSize(1);
        tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
        tft.setCursor(14, 82); tft.printf("%6.1f", pitch);
        tft.setCursor(90, 82); tft.printf("%6.1f", roll);

        Serial.printf("IMU Y:%.2f P:%.2f R:%.2f\n", yaw, pitch, roll);

        int act = pollButtonAction();
        if (act == BTN_A) {
            setAngleOffset();
            resetTargetYaw();
            maxBeep(80);
        } else if (act == BTN_B) {
            return;
        }
        delay(50);
    }
}

// ============================================================================
// Assembly Sub-menu 4: Read Encoder + Calibrate 30cm
//    กด A = Reset 0, กด B = ย้อนกลับ, กด A+B = เข้าหน้า Calibrate 30cm
// ============================================================================
static void screenDistance30cm();

static void drawEncoderLayout() {
    char rateBuf[12];
    snprintf(rateBuf, sizeof(rateBuf), "%.1f/cm", max(1.0f, ticksPerCm));
    uiDrawTopBar("4. ENCODER", rateBuf, UI_COLOR_TOP_BLUE);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);

    // 4 กล่องแยกตามมอเตอร์ M1-M4 (แสดงทั้ง Ticks และ cm ในแต่ละกล่อง) + กล่อง AVG
    tft.drawRoundRect(6,  22, 72, 30, 4, UI_COLOR_CARD_LINE);
    tft.drawRoundRect(82, 22, 72, 30, 4, UI_COLOR_CARD_LINE);
    tft.drawRoundRect(6,  54, 72, 30, 4, UI_COLOR_CARD_LINE);
    tft.drawRoundRect(82, 54, 72, 30, 4, UI_COLOR_CARD_LINE);
    tft.drawRoundRect(6,  86, 148, 19, 4, ST77XX_GREEN);

    tft.setTextSize(1);
    tft.setTextColor(0x07FF, ST77XX_BLACK);
    tft.setCursor(10, 25); tft.print("M1:");
    tft.setCursor(10, 57); tft.print("M2:");
    tft.setCursor(86, 25); tft.print("M3:");
    tft.setCursor(86, 57); tft.print("M4:");
    tft.setTextColor(ST77XX_GREEN, ST77XX_BLACK);
    tft.setCursor(10, 91); tft.print("AVG:");
    uiDrawBottomBar("[A]0 [B]Back", "[A+B]Cal30");
}

static void screenEncoder() {
    drawEncoderLayout();

    while (true) {
        long c[4];
        readAllEncoders(c);

        float tpcm = max(1.0f, ticksPerCm);
        float cm[4];
        for (int i = 0; i < 4; i++) {
            cm[i] = (float)c[i] / tpcm;
        }
        float avgT  = (fabsf((float)c[0]) + fabsf((float)c[1]) +
                       fabsf((float)c[2]) + fabsf((float)c[3])) * 0.25f;
        float avgCm = avgT / tpcm;

        tft.setTextSize(1);
        // M1 (ซ้ายบน)
        tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
        tft.setCursor(28, 25); tft.printf("%7ld", c[0]);
        tft.setTextColor(ST77XX_GREEN, ST77XX_BLACK);
        tft.setCursor(10, 39); tft.printf("%6.1f cm ", cm[0]);

        // M2 (ซ้ายล่าง)
        tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
        tft.setCursor(28, 57); tft.printf("%7ld", c[1]);
        tft.setTextColor(ST77XX_GREEN, ST77XX_BLACK);
        tft.setCursor(10, 71); tft.printf("%6.1f cm ", cm[1]);

        // M3 (ขวาบน)
        tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
        tft.setCursor(104, 25); tft.printf("%7ld", c[2]);
        tft.setTextColor(ST77XX_GREEN, ST77XX_BLACK);
        tft.setCursor(86, 39);  tft.printf("%6.1f cm ", cm[2]);

        // M4 (ขวาล่าง)
        tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
        tft.setCursor(104, 57); tft.printf("%7ld", c[3]);
        tft.setTextColor(ST77XX_GREEN, ST77XX_BLACK);
        tft.setCursor(86, 71);  tft.printf("%6.1f cm ", cm[3]);

        // AVG รวม
        tft.setTextColor(ST77XX_GREEN, ST77XX_BLACK);
        tft.setCursor(36, 91); tft.printf("%5.0ft |%5.1fcm", avgT, avgCm);

        Serial.printf("ENC M1:%ld(%.1fcm) M2:%ld(%.1fcm) M3:%ld(%.1fcm) M4:%ld(%.1fcm)\n",
                      c[0], cm[0], c[1], cm[1], c[2], cm[2], c[3], cm[3]);

        int act = pollButtonAction();
        if (act == BTN_A) {
            resetEncoders();
            maxBeep(80);
        } else if (act == BTN_B) {
            return;
        } else if (act == BTN_AB) {
            screenDistance30cm();
            drawEncoderLayout();
        }
        delay(50);
    }
}

// ============================================================================
// Assembly Sub-menu 5: Calibrate Distance (30 cm + Test 30 cm Verification)
// ============================================================================
static void screenPush30cm() {
    resetEncoders();
    uiDrawTopBar("PUSH 30 CM", "STEP 1", UI_COLOR_TOP_BLUE);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
    tft.setTextSize(1);
    tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
    tft.setCursor(8, 28);
    tft.print("Push robot 30 cm now");
    uiDrawBottomBar("[A+B] Save", "[A/B] Back");

    while (true) {
        long c[4];
        readAllEncoders(c);
        float avgTicks = (fabsf((float)c[0]) + fabsf((float)c[1]) +
                          fabsf((float)c[2]) + fabsf((float)c[3])) * 0.25f;

        tft.setTextSize(1);
        tft.setTextColor(ST77XX_GREEN, ST77XX_BLACK);
        tft.setCursor(8, 52); tft.printf("Ticks: %6.1f     ", avgTicks);
        tft.setTextColor(0xFFE0, ST77XX_BLACK);
        tft.setCursor(8, 70); tft.printf("Calc : %5.1f t/cm ", avgTicks / 30.0f);

        int act = pollButtonAction();
        if (act == BTN_AB) {
            if (avgTicks >= 10.0f) {
                ticksPerCm = avgTicks / 30.0f;
                distTuneMm = 0;
                configSave();
                maxBeep(100);
            }
            return;
        } else if (act == BTN_A || act == BTN_B) {
            return;
        }
        delay(50);
    }
}

static void screenTest30cmRun() {
    // นับถอยหลัง 3 วินาที เพื่อให้วางหุ่นบนจุดเริ่มต้นและปล่อยมือได้ทัน
    uiDrawTopBar("TEST 30 CM", "WAIT", UI_COLOR_TOP_ORANGE);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
    tft.drawRoundRect(10, 24, 140, 78, 6, 0xFFE0);
    tft.setTextSize(1);
    tft.setTextColor(0x07FF, ST77XX_BLACK);
    tft.setCursor(22, 30);
    tft.print("Place at 0 cm!");
    uiDrawBottomBar("[A/B] Cancel", "3s COUNT");

    for (int sec = 3; sec >= 1; sec--) {
        tft.setTextSize(4);
        tft.setTextColor(0xFFE0, ST77XX_BLACK);
        tft.setCursor(68, 48);
        tft.printf("%d", sec);
        maxBeep(60);

        unsigned long t0 = millis();
        while (millis() - t0 < 940UL) {
            if (readSwitch(A) || readSwitch(B)) {
                maxBeep(25);
                waitBothReleased();
                return;
            }
            delay(15);
        }
    }

    uiDrawTopBar("TEST 30 CM", "RUN", UI_COLOR_TOP_ORANGE);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
    tft.drawRoundRect(10, 26, 140, 74, 5, 0xFFE0);
    tft.setTextSize(1);
    tft.setTextColor(0x07FF, ST77XX_BLACK);
    tft.setCursor(18, 52);
    tft.print("Running 30.0 cm...");
    uiDrawBottomBar("RUNNING", "30.0 CM");

    maxBeep(120);
    resetTargetYaw();
    unsigned long tRunStart = millis();
    FC(45, 30.0f, true);
    unsigned long runElapsedMs = millis() - tRunStart;
    if (runElapsedMs >= 150UL && runElapsedMs <= 15000UL) {
        calRun30cmMs = (int)runElapsedMs;
        configSave();
    }
    maxBeep(120);

    long c[4];
    readAllEncoders(c);
    float avgTicks = (fabsf((float)c[0]) + fabsf((float)c[1]) +
                      fabsf((float)c[2]) + fabsf((float)c[3])) * 0.25f;
    float measuredCmPs = 30000.0f / (float)max(150, calRun30cmMs);

    uiDrawTopBar("TEST RESULT", "30CM", UI_COLOR_TOP_GREEN);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
    tft.drawRoundRect(8, 24, 144, 78, 5, ST77XX_GREEN);
    tft.setTextSize(1);
    tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
    tft.setCursor(16, 30); tft.printf("Ticks : %.1f", avgTicks);
    tft.setCursor(16, 44); tft.printf("Rate  : %.1f t/cm", ticksPerCm);
    tft.setCursor(16, 58); tft.printf("Time  : %d ms", calRun30cmMs);
    tft.setTextColor(0x07FF, ST77XX_BLACK);
    tft.setCursor(16, 72); tft.printf("Speed : %.1f cm/s", measuredCmPs);
    tft.setTextColor(ST77XX_GREEN, ST77XX_BLACK);
    tft.setCursor(16, 86); tft.print("30.0 cm SAVED");
    uiDrawBottomBar("[A/B] Back", "CHECK");

    while (pollButtonAction() == BTN_NONE) { delay(20); }
}

static void screenTuneDistMm() {
    uiDrawTopBar("TUNE DIST", "MM", UI_COLOR_TOP_BLUE);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
    tft.drawRoundRect(10, 28, 140, 66, 6, 0x07FF);
    uiDrawBottomBar("[A]-1mm [B]+1mm", "[A+B] Save");

    int lastMm = -999;

    while (true) {
        if (distTuneMm != lastMm) {
            lastMm = distTuneMm;
            float effRate = max(1.0f, ticksPerCm) * ((300.0f + (float)distTuneMm) / 300.0f);
            tft.setTextSize(2);
            tft.setTextColor(ST77XX_GREEN, ST77XX_BLACK);
            tft.setCursor(24, 38);
            tft.printf("%+4d mm ", distTuneMm);
            tft.setTextSize(1);
            tft.setTextColor(0xFFE0, ST77XX_BLACK);
            tft.setCursor(24, 68);
            tft.printf("Eff: %5.2f t/cm", effRate);
        }

        int act = pollButtonAction(true);
        if (act == BTN_A) {
            distTuneMm = constrain(distTuneMm - 1, -150, 150);
        } else if (act == BTN_B) {
            distTuneMm = constrain(distTuneMm + 1, -150, 150);
        } else if (act == BTN_AB) {
            configSave();
            maxBeep(100);
            return;
        }
        delay(15);
    }
}

static void screenTuneMotorTrim() {
    uiDrawTopBar("MOTOR TRIM", "TRIM", UI_COLOR_TOP_BLUE);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
    tft.drawRoundRect(14, 28, 132, 66, 6, 0x07FF);
    uiDrawBottomBar("[A]-1  [B]+1", "[A+B] Save");

    int lastVal = -999;
    while (true) {
        if (motorTrim != lastVal) {
            lastVal = motorTrim;

            tft.setTextSize(3);
            tft.setTextColor(ST77XX_GREEN, ST77XX_BLACK);
            tft.setCursor(46, 38);
            tft.printf("%+3d", motorTrim);

            tft.fillRect(22, 70, 116, 14, ST77XX_BLACK);
            tft.setTextSize(1);
            if (motorTrim < 0) {
                tft.setTextColor(0xFFE0, ST77XX_BLACK);
                tft.setCursor(32, 73);
                tft.print("LEFT SPEED DOWN");
            } else if (motorTrim > 0) {
                tft.setTextColor(0x07FF, ST77XX_BLACK);
                tft.setCursor(32, 73);
                tft.print("RIGHT SPEED UP");
            } else {
                tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
                tft.setCursor(48, 73);
                tft.print("CENTER (0)");
            }
        }

        int act = pollButtonAction(true);
        if (act == BTN_A)      motorTrim = constrain(motorTrim - 1, -25, 25);
        else if (act == BTN_B) motorTrim = constrain(motorTrim + 1, -25, 25);
        else if (act == BTN_AB) {
            configSave();
            maxBeep(100);
            return;
        }
        delay(15);
    }
}

static void drawTuneMenuCards(int selected) {
    uiDrawTopBar("3. TUNE MENU", "DIST", UI_COLOR_TOP_BLUE);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);

    char sub1[20], sub2[16];
    snprintf(sub1, sizeof(sub1), "%+dmm (%.1ft/c)", distTuneMm, ticksPerCm);
    snprintf(sub2, sizeof(sub2), "Trim: %+d", motorTrim);

    const char* titles[2] = { "1. TUNE DIST (mm)", "2. MOTOR TRIM" };
    const char* subs[2]   = { sub1, sub2 };

    for (int i = 0; i < 2; i++) {
        int y = 24 + i * 31;
        bool sel = (i == selected);
        uint16_t bg = sel ? 0x07FF : UI_COLOR_CARD_BG;
        uint16_t bd = sel ? 0xFFE0 : UI_COLOR_CARD_LINE;

        tft.fillRoundRect(6, y, 148, 26, 4, bg);
        tft.drawRoundRect(6, y, 148, 26, 4, bd);
        tft.setTextSize(1);
        tft.setTextColor(sel ? ST77XX_BLACK : ST77XX_WHITE, bg);
        tft.setCursor(12, y + 4);  tft.print(titles[i]);
        tft.setTextColor(sel ? ST77XX_BLACK : 0xFFE0, bg);
        tft.setCursor(12, y + 15); tft.print(subs[i]);
    }

    bool backSel = (selected == 2);
    tft.fillRoundRect(6, 90, 148, 15, 3, backSel ? 0x07FF : UI_COLOR_CARD_BG);
    tft.drawRoundRect(6, 90, 148, 15, 3, backSel ? 0xFFE0 : UI_COLOR_CARD_LINE);
    tft.setTextSize(1);
    tft.setTextColor(backSel ? ST77XX_BLACK : ST77XX_WHITE, backSel ? 0x07FF : UI_COLOR_CARD_BG);
    tft.setCursor(54, 94);
    tft.print("<- BACK");

    uiDrawBottomBar("[A/B] Move", "[A+B] OK");
}

static void screenTuneTicksPerCm() {
    int idx = 0;
    int lastIdx = -1;
    bool needRedraw = true;

    while (true) {
        if (idx != lastIdx || needRedraw) {
            lastIdx = idx;
            needRedraw = false;
            drawTuneMenuCards(idx);
        }

        int act = pollButtonAction();
        if (act == BTN_A)      idx = (idx - 1 + 3) % 3;
        else if (act == BTN_B) idx = (idx + 1) % 3;
        else if (act == BTN_AB) {
            if (idx == 0)      screenTuneDistMm();
            else if (idx == 1) screenTuneMotorTrim();
            else               return;
            needRedraw = true;
        }
        delay(20);
    }
}

static void drawDistMenuCards(int selected) {
    uiDrawTopBar("5. CAL 30CM", "DIST", UI_COLOR_TOP_BLUE);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);

    char tuneSub[16];
    snprintf(tuneSub, sizeof(tuneSub), "%.1f t/cm", ticksPerCm);
    const char* titles[3] = { "1. PUSH 30CM", "2. TEST 30CM", "3. TUNE RATE" };
    const char* subs[3]   = { "Roll & Cap",   "Run & Check",  tuneSub };

    for (int i = 0; i < 3; i++) {
        int y = 22 + i * 22;
        bool sel = (i == selected);
        uint16_t bg = sel ? 0x07FF : UI_COLOR_CARD_BG;
        uint16_t bd = sel ? 0xFFE0 : UI_COLOR_CARD_LINE;
        tft.fillRoundRect(6, y, 148, 19, 4, bg);
        tft.drawRoundRect(6, y, 148, 19, 4, bd);

        tft.setTextSize(1);
        tft.setTextColor(sel ? ST77XX_BLACK : ST77XX_WHITE, bg);
        tft.setCursor(12, y + 6);
        tft.print(titles[i]);

        int sw = strlen(subs[i]) * 6;
        tft.setTextColor(sel ? ST77XX_BLACK : 0xFFE0, bg);
        tft.setCursor(148 - sw, y + 6);
        tft.print(subs[i]);
    }

    bool backSel = (selected == 3);
    tft.fillRoundRect(6, 90, 148, 15, 3, backSel ? 0x07FF : UI_COLOR_CARD_BG);
    tft.drawRoundRect(6, 90, 148, 15, 3, backSel ? 0xFFE0 : UI_COLOR_CARD_LINE);
    tft.setTextSize(1);
    tft.setTextColor(backSel ? ST77XX_BLACK : ST77XX_WHITE, backSel ? 0x07FF : UI_COLOR_CARD_BG);
    tft.setCursor(54, 94);
    tft.print("<- BACK");

    uiDrawBottomBar("[A/B] Move", "[A+B] OK");
}

static void screenDistance30cm() {
    int idx = 0;
    int lastIdx = -1;
    bool needRedraw = true;

    while (true) {
        if (idx != lastIdx || needRedraw) {
            lastIdx = idx;
            needRedraw = false;
            drawDistMenuCards(idx);
        }

        int act = pollButtonAction();
        if (act == BTN_A)      idx = (idx - 1 + 4) % 4;
        else if (act == BTN_B) idx = (idx + 1) % 4;
        else if (act == BTN_AB) {
            if (idx == 0)      screenPush30cm();
            else if (idx == 1) screenTest30cmRun();
            else if (idx == 2) screenTuneTicksPerCm();
            else               return;
            needRedraw = true;
        }
        delay(20);
    }
}

// ============================================================================
// Assembly Sub-menu 6: Run Setup (Auto Tune, Send Serial, Show Cmd, Cmd Beep)
// ============================================================================
void autoTuneSpinAndTurn(float &outSpinErr, float &outTurnErr,
                         void (*onProgress)(const char* stage, int pct, float lastErr));
int autoTuneGetLastFault();

static void onAutoTuneProgress(const char* stage, int pct, float lastErr) {
    char badge[8];
    snprintf(badge, sizeof(badge), "%d%%", constrain(pct, 0, 100));
    uiDrawTopBar("AUTO TUNE", badge, UI_COLOR_TOP_ORANGE);

    tft.fillRect(10, 28, 140, 70, ST77XX_BLACK);
    tft.setTextSize(1);
    tft.setTextColor(0x07FF, ST77XX_BLACK);
    tft.setCursor(14, 30);
    tft.print(stage);

    // Progress bar (x=14..146, y=44, w=132, h=10)
    tft.drawRoundRect(14, 44, 132, 10, 3, ST77XX_WHITE);
    int fillW = constrain((pct * 128) / 100, 2, 128);
    tft.fillRect(16, 46, fillW, 6, ST77XX_GREEN);

    tft.setTextColor(0xFFE0, ST77XX_BLACK);
    tft.setCursor(14, 60);
    tft.printf("Err:%+5.1f deg", lastErr);

    tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
    tft.setCursor(14, 73);
    tft.printf("Spn:%.2f/%.2f", spinKp, spinKd);
    tft.setCursor(14, 85);
    tft.printf("Trn:%4.1f Ofs:%+4.1f", smallAngle_turnDegree, turnRightOffsetDeg);
}

static void screenAutoTuneTurn() {
    uiDrawTopBar("AUTO TUNE", "WAIT", UI_COLOR_TOP_ORANGE);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
    tft.drawRoundRect(10, 24, 140, 78, 6, 0xFFE0);
    tft.setTextSize(1);
    tft.setTextColor(0x07FF, ST77XX_BLACK);
    tft.setCursor(20, 30);
    tft.print("PLACE ON FLOOR!");
    uiDrawBottomBar("[A/B] Cancel", "3s COUNT");

    for (int sec = 3; sec >= 1; sec--) {
        tft.setTextSize(4);
        tft.setTextColor(0xFFE0, ST77XX_BLACK);
        tft.setCursor(68, 48);
        tft.printf("%d", sec);
        maxBeep(60);

        unsigned long t0 = millis();
        while (millis() - t0 < 940UL) {
            if (readSwitch(A) || readSwitch(B)) {
                maxBeep(25);
                waitBothReleased();
                return;
            }
            delay(15);
        }
    }

    uiDrawTopBar("AUTO TUNE", "0%", UI_COLOR_TOP_ORANGE);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
    tft.drawRoundRect(8, 24, 144, 78, 5, 0xFFE0);
    tft.setTextSize(1);
    tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
    tft.setCursor(16, 48);
    tft.print("STARTING AUTO TUNE...");
    uiDrawBottomBar("[A/B] Stop", "LO->MD->HI");

    float spinErr = 0.0f;
    float turnErr = 0.0f;
    autoTuneSpinAndTurn(spinErr, turnErr, onAutoTuneProgress);
    int fault = autoTuneGetLastFault();
    if (fault == 1) {
        maxBeep(45);
        waitBothReleased();
        return;
    }
    if (fault >= 2 || spinErr > 900.0f) {
        const char* reason = "UNKNOWN FAULT!";
        const char* hint   = "Check IMU / Battery";
        if (fault == 2) {
            reason = "IMU NOT MOVING!";
            hint   = "I2C/IMU frozen on run";
        } else if (fault == 3) {
            reason = "SPIN TIMEOUT!";
            hint   = "Did not reach target";
        } else if (fault == 4) {
            reason = "IMU/MOTOR DIR!";
            hint   = "Turned wrong way";
        }

        uiDrawTopBar("TUNE STOPPED", "ERR", ST77XX_RED);
        tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
        tft.drawRoundRect(6, 22, 148, 84, 5, ST77XX_RED);
        tft.setTextSize(1);
        tft.setTextColor(0xFFE0, ST77XX_BLACK);
        tft.setCursor(12, 30);
        tft.print(reason);
        tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
        tft.setCursor(12, 46);
        tft.print(hint);
        tft.setTextColor(0x07FF, ST77XX_BLACK);
        tft.setCursor(12, 62);
        tft.printf("YAW:%6.1f  (F%d)", readAngle(YAW), fault);
        tft.setTextColor(ST77XX_RED, ST77XX_BLACK);
        tft.setCursor(12, 82);
        tft.print("NOT SAVED TO FLASH");
        uiDrawBottomBar("[A/B] Back", "ABORT");

        maxBeep(80);
        delay(60);
        maxBeep(80);
        waitBothReleased();
        while (pollButtonAction() == BTN_NONE) { delay(20); }
        return;
    }
    maxBeep(120);

    uiDrawTopBar("TUNE SAVED!", "OK", UI_COLOR_TOP_GREEN);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
    tft.drawRoundRect(6, 22, 148, 84, 5, ST77XX_GREEN);
    tft.setTextSize(1);
    tft.setTextColor(0xFFE0, ST77XX_BLACK);
    tft.setCursor(10, 28);
    tft.printf("SpinThr:%4.1f (%+.1f)", threshold_spinDegree, spinErr);
    tft.setCursor(10, 42);
    tft.printf("Trn:%4.1f%+4.1f (%+.1f)", smallAngle_turnDegree, turnRightOffsetDeg, turnErr);
    tft.setTextColor(0x07FF, ST77XX_BLACK);
    tft.setCursor(10, 56);
    tft.printf("Spn:%.2f/%.2f M%d", spinKp, spinKd, spinMaxSpeed);
    tft.setCursor(10, 70);
    tft.printf("Trn:%.2f/%.2f M%d", turnFrontKp, turnFrontKd, turnFrontMaxSpeed);
    tft.setTextColor(ST77XX_GREEN, ST77XX_BLACK);
    tft.setCursor(18, 88);
    tft.print("SAVED & SENT SERIAL");
    uiDrawBottomBar("[A/B] Back", "SAVED");

    while (pollButtonAction() == BTN_NONE) { delay(20); }
}

static void drawRunSetupCards(int selected, bool sentSerialBadge) {
    uiDrawTopBar("6. RUN SETUP", "CFG", UI_COLOR_TOP_BLUE);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);

    const char* labels[4] = {
        "1. AUTO TUNE TURN",
        "2. SEND TO SERIAL",
        "3. SHOW CMD",
        "4. CMD BEEP"
    };

    for (int i = 0; i < 4; i++) {
        int y = 21 + i * 17;
        bool sel = (i == selected);
        uint16_t bg = sel ? 0x07FF : UI_COLOR_CARD_BG;
        uint16_t bd = sel ? 0xFFE0 : UI_COLOR_CARD_LINE;

        tft.fillRoundRect(6, y, 148, 15, 3, bg);
        tft.drawRoundRect(6, y, 148, 15, 3, bd);

        tft.setTextSize(1);
        tft.setTextColor(sel ? ST77XX_BLACK : ST77XX_WHITE, bg);
        tft.setCursor(11, y + 4);
        tft.print(labels[i]);

        if (i == 0) {
            const char* sub = "Run";
            int sw = strlen(sub) * 6;
            tft.setTextColor(sel ? ST77XX_BLACK : 0xFFE0, bg);
            tft.setCursor(148 - sw, y + 4);
            tft.print(sub);
        } else if (i == 1) {
            uint16_t pillBg = sentSerialBadge ? ST77XX_GREEN : 0x2104;
            const char* pillTxt = sentSerialBadge ? "SENT!" : "Print";
            int pw = sentSerialBadge ? 34 : 34;
            tft.fillRoundRect(116, y + 2, pw, 11, 3, pillBg);
            tft.setTextColor(sentSerialBadge ? ST77XX_BLACK : 0x07FF, pillBg);
            tft.setCursor(118, y + 4);
            tft.print(pillTxt);
        } else {
            bool on = (i == 2) ? showCmdOnRun : beepOnCmd;
            uint16_t pillBg = on ? ST77XX_GREEN : ST77XX_RED;
            tft.fillRoundRect(122, y + 2, 26, 11, 3, pillBg);
            tft.setTextColor(ST77XX_BLACK, pillBg);
            tft.setCursor(on ? 129 : 126, y + 4);
            tft.print(on ? "ON" : "OFF");
        }
    }

    bool backSel = (selected == 4);
    tft.fillRoundRect(6, 90, 148, 15, 3, backSel ? 0x07FF : UI_COLOR_CARD_BG);
    tft.drawRoundRect(6, 90, 148, 15, 3, backSel ? 0xFFE0 : UI_COLOR_CARD_LINE);
    tft.setTextSize(1);
    tft.setTextColor(backSel ? ST77XX_BLACK : ST77XX_WHITE, backSel ? 0x07FF : UI_COLOR_CARD_BG);
    tft.setCursor(54, 94);
    tft.print("<- BACK");

    uiDrawBottomBar("[A/B] Move", "[A+B] OK");
}

static void screenRunSetup() {
    int idx = 0;
    int lastIdx = -1;
    bool needRedraw = true;
    bool sentBadge = false;

    while (true) {
        if (idx != lastIdx || needRedraw) {
            lastIdx = idx;
            needRedraw = false;
            drawRunSetupCards(idx, sentBadge);
        }

        int act = pollButtonAction();
        if (act == BTN_A)      { idx = (idx - 1 + 5) % 5; sentBadge = false; }
        else if (act == BTN_B) { idx = (idx + 1) % 5; sentBadge = false; }
        else if (act == BTN_AB) {
            if (idx == 0) {
                sentBadge = false;
                screenAutoTuneTurn();
            } else if (idx == 1) {
                configPrintCalibrationJson();
                maxBeep(100);
                sentBadge = true;
            } else if (idx == 2) {
                sentBadge = false;
                showCmdOnRun = !showCmdOnRun;
                configSave();
            } else if (idx == 3) {
                sentBadge = false;
                beepOnCmd = !beepOnCmd;
                configSave();
            } else {
                return;
            }
            needRedraw = true;
        }
        delay(20);
    }
}

// ============================================================================
// Assembly Main Menu (เข้าเมื่อกด SW A ค้างตอนเปิดเครื่อง)
// ============================================================================
static void drawAssemblyCardIcon(int idx, int cx, int cy, uint16_t color) {
    switch (idx) {
        case 0: // LINE: เซนเซอร์ 4 จุด + เส้น
            tft.drawFastHLine(cx - 8, cy + 5, 17, color);
            tft.fillRect(cx - 7, cy - 1, 3, 5, color);
            tft.fillRect(cx - 3, cy - 4, 3, 8, color);
            tft.fillRect(cx + 1, cy - 4, 3, 8, color);
            tft.fillRect(cx + 5, cy - 1, 3, 5, color);
            break;
        case 1: // SERVO: ตัวเซอร์โว + แขนหมุน
            tft.drawRoundRect(cx - 7, cy - 2, 14, 8, 2, color);
            tft.fillCircle(cx, cy + 1, 2, color);
            tft.drawLine(cx, cy + 1, cx + 6, cy - 6, color);
            tft.drawLine(cx + 1, cy + 1, cx + 7, cy - 6, color);
            break;
        case 2: // IMU: เข็มทิศ
            tft.drawCircle(cx, cy, 7, color);
            tft.fillTriangle(cx, cy - 5, cx - 3, cy + 3, cx + 3, cy + 3, color);
            break;
        case 3: // ENC: ล้อ Encoder
            tft.drawCircle(cx, cy, 7, color);
            tft.drawCircle(cx, cy, 3, color);
            tft.fillCircle(cx, cy, 1, color);
            break;
        case 4: // SETUP: ไอคอนฟันเฟืองตั้งค่า (Gear)
            tft.drawCircle(cx, cy, 5, color);
            tft.drawCircle(cx, cy, 2, color);
            tft.fillRect(cx - 1, cy - 7, 3, 2, color);
            tft.fillRect(cx - 1, cy + 6, 3, 2, color);
            tft.fillRect(cx - 7, cy - 1, 2, 3, color);
            tft.fillRect(cx + 6, cy - 1, 2, 3, color);
            tft.drawPixel(cx - 5, cy - 5, color);
            tft.drawPixel(cx + 5, cy - 5, color);
            tft.drawPixel(cx - 5, cy + 5, color);
            tft.drawPixel(cx + 5, cy + 5, color);
            break;
        case 5: // EXIT: ประตูออก / Play Ready
            tft.drawRect(cx - 6, cy - 6, 12, 12, color);
            tft.fillTriangle(cx - 2, cy - 3, cx - 2, cy + 3, cx + 4, cy, color);
            break;
    }
}

static void drawAssemblyGrid(int selected) {
    const char* shortNames[6] = { "LINE", "SERVO", "IMU", "ENC", "SETUP", "EXIT" };
    const char* descText[6]   = {
        "Calibrate Line Sensors",
        "Front/Back Servo Angle",
        "Read & Reset IMU Yaw",
        "Encoder & Cal 30cm",
        "AutoTune, Serial & Cmd",
        "Go to Ready-to-Run"
    };

    char badge[8];
    snprintf(badge, sizeof(badge), "%d/6", selected + 1);
    uiDrawTopBar("ASSEMBLY MODE", badge, UI_COLOR_TOP_ORANGE);

    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);

    for (int i = 0; i < 6; i++) {
        int col = i % 3;
        int row = i / 3;
        int x = 5 + col * 51;
        int y = 23 + row * 36;
        int w = 48;
        int h = 33;

        bool sel = (i == selected);
        uint16_t bg = sel ? 0x07FF : UI_COLOR_CARD_BG;
        uint16_t fg = sel ? ST77XX_BLACK : ST77XX_WHITE;
        uint16_t bd = sel ? 0xFFE0 : UI_COLOR_CARD_LINE;

        tft.fillRoundRect(x, y, w, h, 4, bg);
        tft.drawRoundRect(x, y, w, h, 4, bd);

        drawAssemblyCardIcon(i, x + w / 2, y + 11, sel ? ST77XX_BLACK : 0x07FF);

        int tw = strlen(shortNames[i]) * 6;
        tft.setTextSize(1);
        tft.setTextColor(fg, bg);
        tft.setCursor(x + (w - tw) / 2, y + 23);
        tft.print(shortNames[i]);
    }

    // แถบคำอธิบายเมนูที่เลือก (y = 96..106)
    tft.setTextSize(1);
    tft.setTextColor(0xFFE0, ST77XX_BLACK);
    int dw = strlen(descText[selected]) * 6;
    tft.setCursor(max(4, (160 - dw) / 2), 97);
    tft.print(descText[selected]);

    uiDrawBottomBar("[A/B] Move", "[A+B] Open");
}

static void screenAssemblyMenu() {
    // เสียง Beep 1 รอบแจ้งผู้ใช้งานว่าเข้าหน้า Assembly พร้อมทำงานแล้ว
    maxBeep(120);

    int idx = 0;
    int lastIdx = -1;

    while (true) {
        if (idx != lastIdx) {
            lastIdx = idx;
            drawAssemblyGrid(idx);
        }
        int act = pollButtonAction();
        if (act == BTN_A)      idx = (idx - 1 + 6) % 6;
        else if (act == BTN_B) idx = (idx + 1) % 6;
        else if (act == BTN_AB) {
            switch (idx) {
                case 0: screenSensor();   break;
                case 1: screenServo();    break;
                case 2: screenIMU();      break;
                case 3: screenEncoder();  break;
                case 4: screenRunSetup(); break;
                case 5: return;
            }
            lastIdx = -1;
        }
        delay(20);
    }
}

// ============================================================================
// Mission Execution Wrapper (รันโหมด 1, 2 หรือ 3)
// ============================================================================
static void executeMission(int modeNum) {
    // เซตมุม YAW ปัจจุบันที่หุ่นหันหน้าอยู่ให้เป็น 0° ก่อนเริ่มทำงาน
    setAngleOffset();
    resetTargetYaw();
    missionStartTimer(modeNum);

    if (modeNum == 1)      runMode1();
    else if (modeNum == 2) runMode2();
    else if (modeNum == 3) runMode3();

    driveStop();
    missionEndTimer();
    maxBeep(150);

    float totalSec = missionElapsedMs() / 1000.0f;
    Serial.printf("MODE %d FINISH: %.2f s\n", modeNum, totalSec);

    uiDrawTopBar("MISSION DONE", "OK", UI_COLOR_TOP_GREEN);
    tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
    tft.drawRoundRect(8, 28, 144, 64, 5, ST77XX_GREEN);
    tft.setTextSize(1);
    tft.setTextColor(0x07FF, ST77XX_BLACK);
    tft.setCursor(16, 36);
    tft.printf("MODE %d TOTAL TIME:", modeNum);

    tft.setTextSize(2);
    tft.setTextColor(ST77XX_GREEN, ST77XX_BLACK);
    tft.setCursor(18, 56);
    tft.printf("%6.2f s", totalSec);

    uiDrawBottomBar("[A/B] Ready", "DONE");
    while (pollSingleABForReady() == BTN_NONE) { delay(20); }
}

// ============================================================================
// Ready-to-Run Screen (หน้าหลักตอนเปิดเครื่องปกติ)
// ============================================================================
static void drawReadyScreen() {
    if (enableMultiMode) {
        char badge[12];
        snprintf(badge, sizeof(badge), "M%d/3", currentRunMode);
        uiDrawTopBar("KT-BOT READY", badge, UI_COLOR_TOP_BLUE);

        tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
        tft.drawRoundRect(6, 24, 148, 56, 5, 0x07FF);

        // ไอคอน Play ด้านซ้ายของการ์ด
        drawPlayIcon(16, 48, ST77XX_GREEN);

        tft.setTextSize(1);
        tft.setTextColor(0x07FF, ST77XX_BLACK);
        tft.setCursor(30, 30);
        tft.print("SELECT");

        tft.setTextSize(2);
        tft.setTextColor(ST77XX_GREEN, ST77XX_BLACK);
        tft.setCursor(30, 44);
        tft.printf("MODE %d", currentRunMode);

        // จุดบอกสถานะโหมด 1-2-3 มุมขวาของการ์ด
        for (int m = 1; m <= 3; m++) {
            int cx = 122 + (m - 1) * 10;
            if (m == currentRunMode) tft.fillCircle(cx, 34, 3, ST77XX_GREEN);
            else                     tft.drawCircle(cx, 34, 3, UI_COLOR_CARD_LINE);
        }

        // แถบสถานะเล็กๆ ด้านล่างการ์ด
        tft.setTextSize(1);
        tft.setTextColor(0xFFE0, ST77XX_BLACK);
        tft.setCursor(10, 88);
        tft.printf("CMD:%s  BEEP:%s", showCmdOnRun ? "ON" : "OFF", beepOnCmd ? "ON" : "OFF");

        uiDrawBottomBar("[A] RUN", "[B] MODE");
    } else {
        uiDrawTopBar("KT-BOT READY", "1-MODE", UI_COLOR_TOP_BLUE);

        tft.fillRect(0, 20, 160, 88, ST77XX_BLACK);
        tft.drawRoundRect(6, 24, 148, 56, 5, ST77XX_GREEN);

        drawPlayIcon(16, 48, ST77XX_GREEN);

        tft.setTextSize(2);
        tft.setTextColor(ST77XX_GREEN, ST77XX_BLACK);
        tft.setCursor(30, 44);
        tft.print("READY!");

        tft.setTextSize(1);
        tft.setTextColor(0xFFE0, ST77XX_BLACK);
        tft.setCursor(10, 88);
        tft.printf("CMD:%s  BEEP:%s", showCmdOnRun ? "ON" : "OFF", beepOnCmd ? "ON" : "OFF");

        uiDrawBottomBar("[A] RUN", "[B] RUN");
    }
}

void interfaceBegin() {
    // กดปุ่ม A ค้างตอนเปิดเครื่องเพื่อเข้า Assembly Mode
    if (readSwitch(A)) {
        waitBothReleased();
        screenAssemblyMenu();
    }
}

void interfaceLoop() {
    bool needRedraw = true;
    bool firstReadyBeep = true;

    while (true) {
        if (needRedraw) {
            needRedraw = false;
            drawReadyScreen();
            if (firstReadyBeep) {
                firstReadyBeep = false;
                maxBeep(120); // เสียง Beep 1 รอบแจ้งผู้ใช้งานว่าหุ่นพร้อมทำงานแล้ว
            }
        }

        int act = pollSingleABForReady();
        if (act == BTN_A) {
            executeMission(enableMultiMode ? currentRunMode : 1);
            needRedraw = true;
            firstReadyBeep = true;
        } else if (act == BTN_B) {
            if (enableMultiMode) {
                currentRunMode++;
                if (currentRunMode > 3) currentRunMode = 1;
                needRedraw = true;
            } else {
                executeMission(1);
                needRedraw = true;
                firstReadyBeep = true;
            }
        }
        delay(20);
    }
}
