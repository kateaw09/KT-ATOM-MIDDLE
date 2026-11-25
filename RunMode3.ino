// ============================================================================
// RunMode3.ino — ภารกิจโหมดที่ 3 (สร้างจาก KT Middle IDE)
// ============================================================================

extern int speed;

void runMode3() {
    M3_Box1();
    M3_Box2();
    M3_Box3();
    M3_Box4();
    M3_EndMission();
}

void M3_Box1() {
    FC(100, 30.0f);
    STOP();
    FC(100, 60.0f);
    STOP();
    FC(100, 90.0f);
    STOP();
    FC(100, 120.0f);
}

void M3_Box2() {
}

void M3_Box3() {
}

void M3_Box4() {
}

void M3_EndMission() {
}
