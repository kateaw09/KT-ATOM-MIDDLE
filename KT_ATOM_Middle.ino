#include <KT_ATIOM_VX_MANAGER.h>
#include <Preferences.h>

// ============================================================================
// KT-BOT Atom VX — Main Entry Point
// (การตั้งค่าโหมดต่างๆ และค่าคาลิเบรตทั้งหมด อยู่ที่แท็บ Config.ino)
// ============================================================================

void setup() {
    Serial.begin(115200);

    // 1. เริ่มต้นการทำงานบอร์ด
    robotInit(true);
    TaskHandle_t hImu = xTaskGetHandle("IMUHandle");
    if (hImu != nullptr) vTaskPrioritySet(hImu, 5);
    TaskHandle_t hBno = xTaskGetHandle("BNO085Handle");
    if (hBno != nullptr) vTaskPrioritySet(hBno, 5);
    if (imu_type == BNO055_ADDRESS_A || imu_type == BNO055_ADDRESS_B) {
        bno.setMode(OPERATION_MODE_IMUPLUS);
        delay(25);
        setAngleOffset();
    }
    setupEncodersPT();

    // 2. เปิดใช้ค่าเริ่มต้นการเดิน/หมุน/เลี้ยวจากโค้ด Config.ino (คอมเม้นต์บรรทัดนี้หากต้องการปิดและใช้ค่าจาก Flash/AutoTune)
    enableCodeMotionDefaults();

    // 3. โหลดค่าที่คาลิเบรตไว้จาก Flash (ไม่เขียนทับค่า Assembly เว้นแต่เปิดใน Config.ino)
    configLoad();

    // 4. เริ่มต้นระบบคำนวณพิกัด PoseEKF (4-Wheel Odometry + IMU Yaw)
    ekfInit(0.0f, 0.0f, 0.0f);

    // 5. ตั้งเซอร์โวหน้า-หลังให้อยู่ตำแหน่ง Lock ตลอดเมื่อเริ่มต้น
    setServoAngle(SERVO_S0, frontLock);
    setServoAngle(SERVO_S1, backLock);

    // 6. เข้าสู่หน้าจอ UI (กด SW A ค้างตอนเปิดเครื่อง = Assembly Mode, ปกติ = Ready-to-Run)
    interfaceBegin();
}

void loop() {
    interfaceLoop();
}
