#include <KT_ATIOM_VX_MANAGER.h>

void setup() {
    Serial.begin(115200);

    // เริ่มต้นบอร์ด, IMU, และ Encoder ทั้ง 4 ตัว (ไม่มีเสียง ไม่มีภาพ)
    robotInit(true);

    // ตั้งค่ามุมเริ่มต้นของเซอร์โว S0 และ S1 (0 - 180 องศา)
    setServoAngle(SERVO_S0, 90);
    setServoAngle(SERVO_S1, 90);
}

void loop() {
    int sensors[LINE_SENSOR_COUNT];
    readAllLineSensors(sensors);

    long enc[4];
    readAllEncoders(enc);

    Serial.printf("ADC[FL:%4d FR:%4d BR:%4d BL:%4d] | ENC[M1:%ld M2:%ld M3:%ld M4:%ld]\n",
                  sensors[0], sensors[1], sensors[2], sensors[3],
                  enc[0], enc[1], enc[2], enc[3]);

    delay(100);
}
