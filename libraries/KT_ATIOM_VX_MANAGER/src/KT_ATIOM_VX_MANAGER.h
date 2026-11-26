#pragma once

#include <Arduino.h>
#include <PTBOTAtomVX.h>
#include <ESP32Encoder.h>

// ============================================================================
// 1. Motor Channels (M1 - M4)
//    M1, M2 = Left Motors (มอเตอร์ฝั่งซ้าย)
//    M3, M4 = Right Motors (มอเตอร์ฝั่งขวา)
// ============================================================================
#define MOTOR_M1        1
#define MOTOR_M2        2
#define MOTOR_M3        3
#define MOTOR_M4        4

#define MOTOR_L1        MOTOR_M1
#define MOTOR_L2        MOTOR_M2
#define MOTOR_R1        MOTOR_M3
#define MOTOR_R2        MOTOR_M4

#define MOTOR_MIN_SPEED -100
#define MOTOR_MAX_SPEED  100

// ============================================================================
// 2. Encoder Pins (ENC1 - ENC4) — 4 Built-in Motor Encoders
//    อ้างอิงจากแผนผังบอร์ด PT-BOT Atom VX
//    หมายเหตุ: IO34, IO35, IO36, IO39 เป็นขา Input-only ไม่มี internal pull-up
// ============================================================================
#define ENC1_PIN_A      14
#define ENC1_PIN_B      27

#define ENC2_PIN_A      26
#define ENC2_PIN_B      25

#define ENC3_PIN_A      39
#define ENC3_PIN_B      36

#define ENC4_PIN_A      35
#define ENC4_PIN_B      34

extern ESP32Encoder enc1;
extern ESP32Encoder enc2;
extern ESP32Encoder enc3;
extern ESP32Encoder enc4;

// ============================================================================
// 3. Analog Line Sensors (ADC0 - ADC3 via MCP3008) & Extra ADC (ADC4 - ADC7)
//    ซ้ายบน = 0 (ADC0), ขวาบน = 1 (ADC1), ขวาล่าง = 2 (ADC2), ซ้ายล่าง = 3 (ADC3)
// ============================================================================
#define LINE_SENSOR_FL      ADC0   // ซ้ายบน (Front-Left)
#define LINE_SENSOR_FR      ADC1   // ขวาบน (Front-Right)
#define LINE_SENSOR_BR      ADC2   // ขวาล่าง (Back-Right)
#define LINE_SENSOR_BL      ADC3   // ซ้ายล่าง (Back-Left)

#define LINE_SENSOR_COUNT   4

extern const byte LINE_SENSOR_PINS[LINE_SENSOR_COUNT];

// ช่อง ADC เสริมที่เหลือบนบอร์ด (ADC4 - ADC7 ถูกนิยามไว้แล้วใน PTBOTAtomVX.h)
// ADC4, ADC5, ADC6, ADC7 สามารถเรียกผ่าน readADC(ADC4) ได้ทันที

// ============================================================================
// 4. Servo Channels (S0 - S6 / SV0 - SV6, 180-degree)
// ============================================================================
#define SERVO_S0            0
#define SERVO_S1            1
#define SERVO_S2            2
#define SERVO_S3            3
#define SERVO_S4            4
#define SERVO_S5            5
#define SERVO_S6            6

#define SERVO_MIN_ANGLE     0
#define SERVO_MAX_ANGLE     180

// ============================================================================
// 5. General Digital / Analog / PWM IO Pins (แถวบนของบอร์ด)
// ============================================================================
#define PIN_IO2             2
#define PIN_IO4             4
#define PIN_IO5             5
#define PIN_IO13            13

// ============================================================================
// 6. Communication Bus Pins (I2C, UART2, SPI)
// ============================================================================
#define PIN_I2C_SDA         21
#define PIN_I2C_SCL         22

#define PIN_UART_TX2        17
#define PIN_UART_RX2        16

#define PIN_SPI_SCLK        18
#define PIN_SPI_MISO        19
#define PIN_SPI_MOSI        23
#define PIN_SPI_CS          5   // ใช้ร่วมกับขา IO5

// ============================================================================
// 7. Hardware Setup & Helper Functions
// ============================================================================

/**
 * @brief เริ่มต้นระบบบอร์ด PT-BOT Atom VX, PCA9685, TFT, ADC, IMU และ Encoder ทั้ง 4 ตัว
 *        (ไม่มีเสียง beep และไม่แสดงภาพโลโก้ตอนเปิดเครื่อง)
 * @param enableIMU true เพื่อเปิดใช้งาน IMU (ค่าเริ่มต้น true)
 */
void robotInit(bool enableIMU = true);

/**
 * @brief เริ่มต้นพอร์ต UART2 (TX2 = IO17, RX2 = IO16) เมื่อต้องการใช้งาน
 */
void initUART2(unsigned long baud = 115200);

// --- Encoder Helpers ---
void resetEncoders();
long readEncoder(byte motorIndex);
void readAllEncoders(long counts[4]);

// --- Line Sensor & ADC Helpers ---
int readLineSensor(byte sensorIndex);
void readAllLineSensors(int values[4]);
int readADC(byte channel);

// --- Motor Helpers ---
void setMotors(int leftSpeed, int rightSpeed);
void setMotors4(int m1, int m2, int m3, int m4);
void stopMotors();

// --- Servo Helpers ---
void setServoAngle(byte channel, int degree);

// --- Onboard Peripherals Helpers ---
int readKnob();
bool readSwitch(byte switchPin);
bool readSwitch(byte switchPin, int debounceMs);
float readAngle(byte axis);
void beepSound(int durationMs);
void maxBeep(int durationMs);

// --- โครงสร้างจุดพิกัดสำหรับ PathControl (Pure Pursuit) ---
struct Waypoint {
    float x;
    float y;
};

// --- Prototype ฟังก์ชันหลัก (สำหรับเรียกใช้งานข้ามแท็บ .ino ในสเก็ตช์) ---
extern int frontLock;
extern int backLock;

// Config & Calibration
void setupEncodersPT();
void enableCodeMotionDefaults();
void configSetCodeMotionDefaults(bool enabled);
void configLoad();
void configSave();
void configPrintCalibrationJson();
void serviceSerialCalibrationCommand();
bool configSaveEncoderCalibration();
bool configSaveMotorTrim();

// Motor, Encoder & Velocity PID+FF
void readPtEncoders(long counts[4]);
void safeMotorWrite4(int m1, int m2, int m3, int m4);
void safeMotorWrite2(int leftSpeed, int rightSpeed);
void safeMotorStop();
float safeReadYaw();
void motorWriteSpeedBalanced(int leftCommand, int rightCommand);
void driveMotors(int leftSpeed, int rightSpeed);
void driveStop();
void resetMoveSpeedBalance();
void resetVelocityPid();
void updateWheelVelocitiesCmPs();
void getWheelVelocitiesCmPs(float outVel[4]);
float getLeftVelocityCmPs();
float getRightVelocityCmPs();
float getRobotLinearVelocityCmPs();
void driveWheelVelocitiesCmPs(float targetLeftCmPs, float targetRightCmPs);
long encoderCentimetersToTicks(float distance_cm, int speed);
long readEncoderDistance();
long readEncoderSignedDistance(bool forward);
long readEncoderSingleDistance(byte encoder_index);
void resetEncoder();
float getBoxDistCm(int boxNum);
float BOX(float boxes);
float mapFieldCmToRobotCm(float fieldCm);
void readLine();
bool isLineDetected(byte sensorIndex);

// PoseEKF (4-Wheel Odometry + IMU Yaw Sensor Fusion)
void ekfInit(float xCm = 0.0f, float yCm = 0.0f, float headingDeg = 0.0f);
void ekfReset(float xCm = 0.0f, float yCm = 0.0f, float headingDeg = 0.0f);
void ekfSyncEncoders();
void ekfUpdate();
void ekfSnapHeadingDeg(float headingDeg);
void ekfSnapPose(float xCm, float yCm, float headingDeg);
float ekfGetX();
float ekfGetY();
float ekfGetHeadingDeg();
float ekfGetHeadingRad();
float ekfGetLinearVel();
float ekfGetAngularVel();

// PathControl (Adaptive Pure Pursuit)
bool followPath(const Waypoint* pts, int count, float maxSpeedCmPs,
                bool stopAtEnd = true, bool reverse = false, unsigned long timeoutMs = 15000UL);
bool followWaypoints(const float* xs, const float* ys, int count, float maxSpeedCmPs,
                     bool stopAtEnd = true, bool reverse = false, unsigned long timeoutMs = 15000UL);

// Move HUD, Flow & Reset
void clearTurnDistCarry();
void setTurnDistCarry(float signedCm);
void clearMotionFlowState();
void notifyTurnFlowExit(int dirSign, int carrySpeed);
void resetTargetYaw();
void missionStartTimer(int modeNum);
void missionEndTimer();
unsigned long missionElapsedMs();
void missionUpdateTimerHUD();
void missionFinishCommandBeep();
void missionNotifyCommand(const char* cmdText, int iconId = 0, const char* subText = nullptr);

// FC-Only Encoder Motion (FC_BOX / BC_BOX / FC / BC / FC4 / BC4)
void FC_BOX(int speed, float boxes, bool stopAtEnd = false);
void FC_BOX(int speed, float boxes, char dir);
void FC_BOX(int speed, float boxes, int select);
void FC_BOX(int speed, float boxes, const char* select);
void FC_BOX(int speed, float boxes, char dir, bool stopBeforeTurn);
void FC_BOX(int speed, float boxes, const char* select, bool stopBeforeTurn);
void BC_BOX(int speed, float boxes, bool stopAtEnd = false);
void BC_BOX(int speed, float boxes, char dir);
void BC_BOX(int speed, float boxes, int select);
void BC_BOX(int speed, float boxes, const char* select);
void BC_BOX(int speed, float boxes, char dir, bool stopBeforeTurn);
void BC_BOX(int speed, float boxes, const char* select, bool stopBeforeTurn);

void FC(int speed, float cm, bool stopAtEnd = false);
void FC(int speed, float cm, char dir);
void FC(int speed, float cm, int select);
void FC(int speed, float cm, const char* select);
void FC(int speed, float cm, char dir, bool stopBeforeTurn);
void FC(int speed, float cm, const char* select, bool stopBeforeTurn);
void FC(int speed, float cm, int rUp, int rDown);
void FC(int speed, float cm, char dir, unsigned long rUp, long rDown);
void FC(int speed, float cm, int select, unsigned long rUp, long rDown);
void FC(int speed, float cm, const char* select, unsigned long rUp, long rDown);

void BC(int speed, float cm, bool stopAtEnd = false);
void BC(int speed, float cm, char dir);
void BC(int speed, float cm, int select);
void BC(int speed, float cm, const char* select);
void BC(int speed, float cm, char dir, bool stopBeforeTurn);
void BC(int speed, float cm, const char* select, bool stopBeforeTurn);
void BC(int speed, float cm, int rUp, int rDown);
void BC(int speed, float cm, char dir, unsigned long rUp, long rDown);
void BC(int speed, float cm, int select, unsigned long rUp, long rDown);
void BC(int speed, float cm, const char* select, unsigned long rUp, long rDown);

void FC4(int speed, float cm, char dir);
void FC4(int speed, float cm, char dir, bool stopBeforeTurn);
void BC4(int speed, float cm, char dir);
void BC4(int speed, float cm, char dir, bool stopBeforeTurn);

// Time-Based Move (FF / BB)
void FF(int speed, unsigned long timer);
void FF(int speed, unsigned long timer, unsigned long rUp, unsigned long rDown);
void BB(int speed, unsigned long timer);
void BB(int speed, unsigned long timer, unsigned long rUp, unsigned long rDown);

// Gyro Spin & Swing Turn + Encoder Curves
void SpinDegree(float relativeDeg, int maxSpeed = -1, bool stopAtEnd = true);
void TrunDegreeFront(float relativeDeg, int maxSpeed = -1, bool stopAtEnd = true);
void TrunDegreeBack(float relativeDeg, int maxSpeed = -1, bool stopAtEnd = true);
void TTF90(int speed_left, int speed_right, long distance_cm);
void TTF45(int speed_left, int speed_right, long distance_cm);
void TTB90(int speed_right, int speed_left, long distance_cm);
void TTB45(int speed_right, int speed_left, long distance_cm);

// Line Alignment, Drop & Stop
void SetF(int speed = 25);
void SetF(int speed, float backCm);
void SetF(int speed, float backCm, char dir);
void SetB(int speed = 25);
void SetB(int speed, float fwdCm);
void SetB(int speed, float fwdCm, char dir);
void DropF();
void DropF(int speed);
void DropB();
void DropB(int speed);
void STOP();
