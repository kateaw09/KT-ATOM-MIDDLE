// ============================================================================
// PoseEKF.ino — 3-State Extended Kalman Filter [x, y, theta]
//               ผสาน 4-Wheel Encoder Odometry + IMU Yaw (safeReadYaw)
//   ระบบพิกัด (สอดคล้องกับ safeReadYaw และ SpinDegree(+deg)):
//     +X     = ทิศหันหน้าเริ่มต้น (theta = 0 deg)
//     +Y     = ทิศด้านขวาเริ่มต้น (theta = +90 deg)
//     +theta = หมุนขวาตามเข็มนาฬิกา (CW), wrap ในช่วง [-pi, pi]
// ============================================================================

static float         s_ekfX           = 0.0f;
static float         s_ekfY           = 0.0f;
static float         s_ekfTheta       = 0.0f;
static float         s_ekfP[3][3]     = {
    { 0.01f, 0.0f, 0.0f },
    { 0.0f, 0.01f, 0.0f },
    { 0.0f, 0.0f, 0.01f }
};
static float         s_ekfLinearVel   = 0.0f;
static float         s_ekfAngularVel  = 0.0f;
static long          s_ekfPrevTicks[4]= { 0, 0, 0, 0 };
static unsigned long s_ekfLastUs      = 0;
static bool          s_ekfInitialized = false;

static constexpr float EKF_DEG_TO_RAD = 0.017453292519943295f;
static constexpr float EKF_RAD_TO_DEG = 57.29577951308232f;
static constexpr float EKF_PI         = 3.1415926535897932f;

static float ekfWrapRadPi(float rad) {
    while (rad >  EKF_PI) rad -= 2.0f * EKF_PI;
    while (rad < -EKF_PI) rad += 2.0f * EKF_PI;
    return rad;
}

static void ekfResetCovariance() {
    for (int i = 0; i < 3; i++) {
        for (int j = 0; j < 3; j++) {
            s_ekfP[i][j] = (i == j) ? 0.01f : 0.0f;
        }
    }
}

void ekfSyncEncoders() {
    readPtEncoders(s_ekfPrevTicks);
    s_ekfLastUs = micros();
}

void ekfReset(float xCm, float yCm, float headingDeg) {
    s_ekfX          = xCm;
    s_ekfY          = yCm;
    s_ekfTheta      = ekfWrapRadPi(headingDeg * EKF_DEG_TO_RAD);
    s_ekfLinearVel  = 0.0f;
    s_ekfAngularVel = 0.0f;
    ekfResetCovariance();
    ekfSyncEncoders();
    s_ekfInitialized = true;
}

void ekfInit(float xCm, float yCm, float headingDeg) {
    ekfReset(xCm, yCm, headingDeg);
}

void ekfSnapHeadingDeg(float headingDeg) {
    if (!s_ekfInitialized) {
        ekfInit(0.0f, 0.0f, headingDeg);
        return;
    }
    s_ekfTheta   = ekfWrapRadPi(headingDeg * EKF_DEG_TO_RAD);
    s_ekfP[2][2] = 0.001f;
    s_ekfP[0][2] = s_ekfP[2][0] = 0.0f;
    s_ekfP[1][2] = s_ekfP[2][1] = 0.0f;
}

void ekfSnapPose(float xCm, float yCm, float headingDeg) {
    ekfReset(xCm, yCm, headingDeg);
}

void ekfUpdate() {
    if (!s_ekfInitialized) {
        ekfInit(0.0f, 0.0f, safeReadYaw());
        return;
    }

    unsigned long nowUs = micros();
    long counts[4];
    readPtEncoders(counts);

    long dTicks[4];
    bool anyTick = false;
    for (int i = 0; i < 4; i++) {
        dTicks[i] = counts[i] - s_ekfPrevTicks[i];
        if (dTicks[i] != 0L) anyTick = true;
    }

    unsigned long dtUs = nowUs - s_ekfLastUs;
    if (!anyTick && dtUs < 5000UL) {
        return;
    }

    for (int i = 0; i < 4; i++) {
        s_ekfPrevTicks[i] = counts[i];
    }
    s_ekfLastUs = nowUs;

    float dtSec = constrain((float)dtUs * 1e-6f, 0.001f, 0.25f);
    float tpcm  = max(1.0f, ticksPerCm);
    float track = max(1.0f, effectiveTrackCm);

    // 1. Prediction Step (4-Wheel Midpoint Odometry)
    float dL = ((float)dTicks[0] + (float)dTicks[1]) / (2.0f * tpcm);
    float dR = ((float)dTicks[2] + (float)dTicks[3]) / (2.0f * tpcm);
    float ds = 0.5f * (dL + dR);
    float dThetaOdom = (dL - dR) / track;

    s_ekfLinearVel  = ds / dtSec;
    s_ekfAngularVel = dThetaOdom / dtSec;

    float thetaMid = s_ekfTheta + 0.5f * dThetaOdom;
    float cosMid   = cosf(thetaMid);
    float sinMid   = sinf(thetaMid);

    s_ekfX     += ds * cosMid;
    s_ekfY     += ds * sinMid;
    s_ekfTheta  = ekfWrapRadPi(s_ekfTheta + dThetaOdom);

    // Dynamic Process Noise: เพิ่ม Q ของมุมเมื่อกำลังเลี้ยวหรือล้อไถลเพื่อให้เชื่อ IMU มากขึ้น
    bool isTurning = (fabsf(s_ekfAngularVel) > 0.25f) || (fabsf(dL - dR) > 0.15f);
    float moveScale = (fabsf(ds) > 0.005f || fabsf(dL - dR) > 0.005f) ? 1.0f : 0.02f;
    float qPos   = max(1e-6f, ekfQPos) * moveScale;
    float qTheta = (isTurning ? max(1e-6f, ekfQHeadingTurn) : max(1e-6f, ekfQHeadingBase)) * moveScale;

    // Jacobian F = [[1, 0, -ds*sinMid], [0, 1, ds*cosMid], [0, 0, 1]]
    float f02 = -ds * sinMid;
    float f12 =  ds * cosMid;

    float p00 = s_ekfP[0][0], p01 = s_ekfP[0][1], p02 = s_ekfP[0][2];
    float p11 = s_ekfP[1][1], p12 = s_ekfP[1][2];
    float p22 = s_ekfP[2][2];

    float fp00 = p00 + f02 * p02;
    float fp01 = p01 + f02 * p12;
    float fp02 = p02 + f02 * p22;

    float fp10 = p01 + f12 * p02;
    float fp11 = p11 + f12 * p12;
    float fp12 = p12 + f12 * p22;

    s_ekfP[0][0] = fp00 + fp02 * f02 + qPos;
    s_ekfP[0][1] = fp01 + fp02 * f12;
    s_ekfP[0][2] = fp02;

    s_ekfP[1][0] = fp10 + fp12 * f02;
    s_ekfP[1][1] = fp11 + fp12 * f12 + qPos;
    s_ekfP[1][2] = fp12;

    s_ekfP[2][0] = p02 + p22 * f02;
    s_ekfP[2][1] = p12 + p22 * f12;
    s_ekfP[2][2] = p22 + qTheta;

    // 2. Measurement Update Step (IMU Yaw: safeReadYaw())
    float zImu  = ekfWrapRadPi(safeReadYaw() * EKF_DEG_TO_RAD);
    float innov = ekfWrapRadPi(zImu - s_ekfTheta);
    float rMeas = max(1e-6f, ekfRImuYaw);
    float S     = s_ekfP[2][2] + rMeas;
    float invS  = 1.0f / S;

    float k0 = s_ekfP[0][2] * invS;
    float k1 = s_ekfP[1][2] * invS;
    float k2 = s_ekfP[2][2] * invS;

    s_ekfX     += k0 * innov;
    s_ekfY     += k1 * innov;
    s_ekfTheta  = ekfWrapRadPi(s_ekfTheta + k2 * innov);

    float u02 = s_ekfP[0][2], u12 = s_ekfP[1][2], u22 = s_ekfP[2][2];
    s_ekfP[0][0] = max(1e-6f, s_ekfP[0][0] - k0 * u02);
    s_ekfP[0][1] = s_ekfP[0][1] - k0 * u12;
    s_ekfP[0][2] = s_ekfP[0][2] - k0 * u22;

    s_ekfP[1][0] = s_ekfP[0][1];
    s_ekfP[1][1] = max(1e-6f, s_ekfP[1][1] - k1 * u12);
    s_ekfP[1][2] = s_ekfP[1][2] - k1 * u22;

    s_ekfP[2][0] = s_ekfP[0][2];
    s_ekfP[2][1] = s_ekfP[1][2];
    s_ekfP[2][2] = max(1e-6f, s_ekfP[2][2] - k2 * u22);
}

float ekfGetX()          { return s_ekfX; }
float ekfGetY()          { return s_ekfY; }
float ekfGetHeadingRad() { return s_ekfTheta; }
float ekfGetHeadingDeg() { return s_ekfTheta * EKF_RAD_TO_DEG; }
float ekfGetLinearVel()  { return s_ekfLinearVel; }
float ekfGetAngularVel() { return s_ekfAngularVel; }
