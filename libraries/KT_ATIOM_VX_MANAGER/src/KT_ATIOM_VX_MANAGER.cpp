#include "KT_ATIOM_VX_MANAGER.h"
#include "KT_Logo.h"

// สร้างออบเจ็กต์ Encoder สำหรับมอเตอร์ M1 - M4
ESP32Encoder enc1;
ESP32Encoder enc2;
ESP32Encoder enc3;
ESP32Encoder enc4;

// ลำดับเซนเซอร์: 0 = ซ้ายบน, 1 = ขวาบน, 2 = ขวาล่าง, 3 = ซ้ายล่าง
const byte LINE_SENSOR_PINS[LINE_SENSOR_COUNT] = {
    LINE_SENSOR_FL,
    LINE_SENSOR_FR,
    LINE_SENSOR_BR,
    LINE_SENSOR_BL
};

static void initIMUHardware() {
    init_imu = false;
    imu_type = 0;

    if (i2cDeviceExists(ICM20948_ADDRESS)) {
        imu_type = ICM20948_ADDRESS; // 0x68 (104)
        if (icm.begin(Wire, false, ICM20948_ADDRESS) == ICM_20948_Stat_Ok) {
            icm.initializeDMP();
            icm.sleep(false);
            icm.lowPower(false);
            icm.enableDMPSensor(INV_ICM20948_SENSOR_GAME_ROTATION_VECTOR, true);
            icm.setDMPODRrate(DMP_ODR_Reg_Quat6, 0);
            icm.enableFIFO(true);
            icm.enableDMP(true);
            icm.resetDMP();
            icm.resetFIFO();

            prefs.begin("imu", true);
            if (prefs.isKey("gx")) {
                gyro_bias_x  = prefs.getInt("gx", 0);
                gyro_bias_y  = prefs.getInt("gy", 0);
                gyro_bias_z  = prefs.getInt("gz", 0);
                accel_bias_x = prefs.getInt("ax", 0);
                accel_bias_y = prefs.getInt("ay", 0);
                accel_bias_z = prefs.getInt("az", 0);
                icm.setBiasGyroX(gyro_bias_x);
                icm.setBiasGyroY(gyro_bias_y);
                icm.setBiasGyroZ(gyro_bias_z);
                icm.setBiasAccelX(accel_bias_x);
                icm.setBiasAccelY(accel_bias_y);
                icm.setBiasAccelZ(accel_bias_z);
            }
            prefs.end();

            xTaskCreatePinnedToCore(IMUHandle, "IMUHandle", 4096, NULL, 5, NULL, 1);
            init_imu = true;
        }
    } else if (i2cDeviceExists(BNO055_ADDRESS_A)) {
        imu_type = BNO055_ADDRESS_A; // 0x28 (40)
        bno = Adafruit_BNO055(55, BNO055_ADDRESS_A, &Wire);
        if (bno.begin(OPERATION_MODE_IMUPLUS)) {
            setAngleOffset();
            init_imu = true;
        }
    } else if (i2cDeviceExists(BNO055_ADDRESS_B)) {
        imu_type = BNO055_ADDRESS_B; // 0x29 (41)
        bno = Adafruit_BNO055(55, BNO055_ADDRESS_B, &Wire);
        if (bno.begin(OPERATION_MODE_IMUPLUS)) {
            setAngleOffset();
            init_imu = true;
        }
    } else if (i2cDeviceExists(BNO085_ADDRESS_A)) {
        imu_type = BNO085_ADDRESS_A; // 0x4A (74)
        delay(300);
        if (bno085.begin(BNO085_ADDRESS_A, Wire)) {
            bno085.enableGameRotationVector(10);
            xTaskCreatePinnedToCore(BNO085Handle, "BNO085Handle", 4096, NULL, 5, NULL, 1);
            init_imu = true;
        }
    } else if (i2cDeviceExists(BNO085_ADDRESS_B)) {
        imu_type = BNO085_ADDRESS_B; // 0x4B (75)
        delay(300);
        if (bno085.begin(BNO085_ADDRESS_B, Wire)) {
            bno085.enableGameRotationVector(10);
            xTaskCreatePinnedToCore(BNO085Handle, "BNO085Handle", 4096, NULL, 5, NULL, 1);
            init_imu = true;
        }
    }
}

// ค่อยๆ แสดงโลโก้ KT (บริเวณตรงกลาง x=10, y=25, w=140, h=78) ให้สว่างขึ้นใน 1 วินาที
static void fadeInKTLogo1Sec() {
    const int16_t lx = 10;
    const int16_t ly = 25;
    const int16_t lw = 140;
    const int16_t lh = 78;
    const int steps = 20;
    const int stepDelayMs = 50; // 20 x 50ms = 1,000 ms (1 วินาที)

    tft.fillScreen(ST77XX_BLACK);

    uint16_t rowBuf[lw];
    for (int s = 1; s <= steps; s++) {
        uint32_t tStart = millis();
        for (int16_t row = 0; row < lh; row++) {
            int baseIdx = (ly + row) * 160 + lx;
            for (int16_t col = 0; col < lw; col++) {
                uint16_t c = pgm_read_word(&kt_logo[baseIdx + col]);
                if (c == 0) {
                    rowBuf[col] = 0;
                } else {
                    uint8_t r = ((c >> 11) & 0x1F) * s / steps;
                    uint8_t g = ((c >> 5)  & 0x3F) * s / steps;
                    uint8_t b = (c         & 0x1F) * s / steps;
                    rowBuf[col] = (uint16_t)((r << 11) | (g << 5) | b);
                }
            }
            tft.drawRGBBitmap(lx, ly + row, rowBuf, lw, 1);
        }
        int elapsed = (int)(millis() - tStart);
        if (elapsed < stepDelayMs) {
            delay(stepDelayMs - elapsed);
        }
    }
}

void robotInit(bool enableIMU) {
    delay(200);

    // 1. ตั้งค่าปุ่มกดและ Mutex สำหรับ I2C
    pinMode(0, INPUT_PULLUP);
    i2cMutex = xSemaphoreCreateMutex();

    // 2. เริ่มต้น PCA9685 (pca_1 = มอเตอร์ / Buzzer (CH5), pca_2 = เซอร์โว S0-S6)
    pca_1.begin();
    pca_2.begin();
    Wire.setClock(200000);

    pca_1.setPWMFreq(1000.0f);
    pca_2.setOscillatorFrequency(27000000);
    pca_2.setPWMFreq(50.0f);

    // ปิดสัญญาณ PWM บนช่องควบคุมที่ยังไม่ใช้งาน (pca_1 = มอเตอร์)
    pca_1.setPWM(13, 0, 0);
    pca_1.setPWM(15, 0, 0);
    pca_1.setPWM(11, 0, 0);
    pca_1.setPWM(9, 0, 0);
    pca_1.setPWM(7, 0, 0);

    // 3. เริ่มต้นจอ TFT (เคลียร์จอดำ)
    tft.initR(INITR_BLACKTAB);
    tft.fillScreen(ST77XX_BLACK);
    tft.setRotation(3);

    // 4. เริ่มต้น ADC MCP3008 สำหรับอ่านค่าเซนเซอร์ทั้ง 8 ช่อง (ADC0 - ADC7)
    adc.begin(ADC_CS, &SPI);

    // 5. เริ่มต้น IMU (ใช้ Address I2C จริงเป็น imu_type)
    if (enableIMU) {
        initIMUHardware();
    } else {
        init_imu = false;
    }
    setEnableIMU(enableIMU);

    // 6. ตั้งค่า Encoder ทั้ง 4 ตัว (Full Quadrature ตาม PT_MIDDLE_ENC_2026Endcode4)
    ESP32Encoder::useInternalWeakPullResistors = puType::up;

    enc1.attachFullQuad(ENC1_PIN_A, ENC1_PIN_B);
    enc2.attachFullQuad(ENC2_PIN_A, ENC2_PIN_B);
    enc3.attachFullQuad(ENC3_PIN_A, ENC3_PIN_B);
    enc4.attachFullQuad(ENC4_PIN_A, ENC4_PIN_B);

    resetEncoders();
    stopMotors();

    // 7. ค่อยๆ แสดงโลโก้ KT ตรงกลางจอใน 1 วินาที แล้วเล่นเสียงต้อนรับ
    fadeInKTLogo1Sec();
    beep(300);  // ยาว
    delay(250); // ดับยาว
    beep(70);   // สั้น 1
    delay(60);
    beep(70);   // สั้น 2
    delay(60);
    beep(70);   // สั้น 3
}

void initUART2(unsigned long baud) {
    Serial2.begin(baud, SERIAL_8N1, PIN_UART_RX2, PIN_UART_TX2);
}

void resetEncoders() {
    enc1.clearCount();
    enc2.clearCount();
    enc3.clearCount();
    enc4.clearCount();
}

long readEncoder(byte motorIndex) {
    switch (motorIndex) {
        // M1, M2 อยู่ฝั่งซ้าย (หมุนตรงข้ามฝั่งขวา) จึงกลับเครื่องหมายให้เดินหน้าเป็นบวกเหมือนกัน
        case MOTOR_M1: return -(long)enc1.getCount();
        case MOTOR_M2: return -(long)enc2.getCount();
        case MOTOR_M3: return  (long)enc3.getCount();
        case MOTOR_M4: return  (long)enc4.getCount();
        default:       return 0;
    }
}

void readAllEncoders(long counts[4]) {
    counts[0] = -(long)enc1.getCount();
    counts[1] = -(long)enc2.getCount();
    counts[2] =  (long)enc3.getCount();
    counts[3] =  (long)enc4.getCount();
}

int readLineSensor(byte sensorIndex) {
    if (sensorIndex >= LINE_SENSOR_COUNT) {
        return 0;
    }
    return adcRead(LINE_SENSOR_PINS[sensorIndex]);
}

void readAllLineSensors(int values[4]) {
    for (byte i = 0; i < LINE_SENSOR_COUNT; i++) {
        values[i] = adcRead(LINE_SENSOR_PINS[i]);
    }
}

int readADC(byte channel) {
    return adcRead(channel);
}

static int           s_libLastMotors[4]   = { 0, 0, 0, 0 };
static bool          s_libMotorsSynced    = false;
static unsigned long s_libLastMotorI2cMs  = 0;

static inline void libI2cLock() {
    if (i2cMutex != nullptr) xSemaphoreTake(i2cMutex, portMAX_DELAY);
}

static inline void libI2cUnlock() {
    if (i2cMutex != nullptr) xSemaphoreGive(i2cMutex);
}

void setMotors(int leftSpeed, int rightSpeed) {
    setMotors4(leftSpeed, leftSpeed, rightSpeed, rightSpeed);
}

void setMotors4(int m1, int m2, int m3, int m4) {
    int c1 = constrain(m1, MOTOR_MIN_SPEED, MOTOR_MAX_SPEED);
    int c2 = constrain(m2, MOTOR_MIN_SPEED, MOTOR_MAX_SPEED);
    int c3 = constrain(m3, MOTOR_MIN_SPEED, MOTOR_MAX_SPEED);
    int c4 = constrain(m4, MOTOR_MIN_SPEED, MOTOR_MAX_SPEED);
    unsigned long now = millis();
    if (s_libMotorsSynced &&
        c1 == s_libLastMotors[0] && c2 == s_libLastMotors[1] &&
        c3 == s_libLastMotors[2] && c4 == s_libLastMotors[3] &&
        (now - s_libLastMotorI2cMs) < 50UL) {
        return;
    }
    libI2cLock();
    motorWrite(c1, c2, c3, c4);
    libI2cUnlock();
    s_libLastMotors[0] = c1; s_libLastMotors[1] = c2;
    s_libLastMotors[2] = c3; s_libLastMotors[3] = c4;
    s_libMotorsSynced  = true;
    s_libLastMotorI2cMs = now;
}

void stopMotors() {
    libI2cLock();
    motorStop();
    libI2cUnlock();
    s_libLastMotors[0] = s_libLastMotors[1] = 0;
    s_libLastMotors[2] = s_libLastMotors[3] = 0;
    s_libMotorsSynced  = true;
    s_libLastMotorI2cMs = millis();
}

void setServoAngle(byte channel, int degree) {
    byte clamped = (byte)constrain(degree, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE);
    libI2cLock();
    servoWrite(channel, clamped);
    libI2cUnlock();
}

int readKnob() {
    return knobRead();
}

bool readSwitch(byte switchPin) {
    return switchRead(switchPin);
}

bool readSwitch(byte switchPin, int debounceMs) {
    return switchRead(switchPin, debounceMs);
}

float readAngle(byte axis) {
    if (imu_type == BNO055_ADDRESS_A || imu_type == BNO055_ADDRESS_B) {
        libI2cLock();
        float ang = angleRead(axis);
        libI2cUnlock();
        return ang;
    }
    return angleRead(axis);
}

void beepSound(int durationMs) {
    maxBeep(durationMs);
}

void maxBeep(int durationMs) {
    // ห้ามถือ i2cMutex ค้างระหว่าง delay() เพื่อไม่ให้ขวาง Task อ่าน IMU บน I2C (Buzzer อยู่บน pca_1 CH5 @ 1000Hz)
    int dur = (durationMs < 45) ? 45 : durationMs;
    libI2cLock();
    pca_1.setPWM(5, 0, 2000);
    libI2cUnlock();
    delay(dur);
    libI2cLock();
    pca_1.setPWM(5, 0, 0);
    libI2cUnlock();
}
