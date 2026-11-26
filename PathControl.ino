// ============================================================================
// PathControl.ino — Adaptive Pure Pursuit + Curvature Velocity Profiling
//                   ใช้พิกัดจาก PoseEKF และสั่งขับเคลื่อนด้วย Velocity PID+FF
// ============================================================================

static constexpr int PP_MAX_DENSE_PTS = 160;
static Waypoint s_ppPts[PP_MAX_DENSE_PTS];
static float    s_ppSpeedProf[PP_MAX_DENSE_PTS];

static float ppPointDist(const Waypoint &a, const Waypoint &b) {
    float dx = b.x - a.x;
    float dy = b.y - a.y;
    return sqrtf(dx * dx + dy * dy);
}

static int densifyPath(const Waypoint* src, int count, float maxSpeedCmPs, bool stopAtEnd) {
    if (src == nullptr || count < 2) return 0;

    float spacing = constrain(ppWaypointSpacingCm, 1.5f, 15.0f);
    int outCount = 0;
    s_ppPts[outCount++] = src[0];

    for (int i = 0; i < count - 1 && outCount < PP_MAX_DENSE_PTS; i++) {
        float segLen = ppPointDist(src[i], src[i + 1]);
        if (segLen < 0.1f) continue;

        int steps = max(1, (int)ceilf(segLen / spacing));
        for (int s = 1; s <= steps && outCount < PP_MAX_DENSE_PTS; s++) {
            float t = (float)s / (float)steps;
            s_ppPts[outCount].x = src[i].x + (src[i + 1].x - src[i].x) * t;
            s_ppPts[outCount].y = src[i].y + (src[i + 1].y - src[i].y) * t;
            outCount++;
        }
    }

    if (outCount >= PP_MAX_DENSE_PTS) {
        s_ppPts[PP_MAX_DENSE_PTS - 1] = src[count - 1];
        outCount = PP_MAX_DENSE_PTS;
    }

    // 1. กำหนดความเร็วสูงสุดเริ่มต้นและจำกัดความเร็วเข้าโค้งจากความโค้ง 3 จุด
    float maxLat = max(15.0f, ppMaxLatAccel);
    float vCap   = max(10.0f, fabsf(maxSpeedCmPs));
    for (int i = 0; i < outCount; i++) {
        s_ppSpeedProf[i] = vCap;
    }

    for (int i = 1; i < outCount - 1; i++) {
        float ax = s_ppPts[i].x - s_ppPts[i - 1].x;
        float ay = s_ppPts[i].y - s_ppPts[i - 1].y;
        float bx = s_ppPts[i + 1].x - s_ppPts[i].x;
        float by = s_ppPts[i + 1].y - s_ppPts[i].y;
        float cx = s_ppPts[i + 1].x - s_ppPts[i - 1].x;
        float cy = s_ppPts[i + 1].y - s_ppPts[i - 1].y;

        float la = sqrtf(ax * ax + ay * ay);
        float lb = sqrtf(bx * bx + by * by);
        float lc = sqrtf(cx * cx + cy * cy);
        float denom = la * lb * lc;
        if (denom > 1e-3f) {
            float cross2 = fabsf(ax * by - ay * bx) * 2.0f;
            float kappa  = cross2 / denom;
            if (kappa > 1e-4f) {
                float vCurve = sqrtf(maxLat / kappa);
                if (vCurve < s_ppSpeedProf[i]) s_ppSpeedProf[i] = max(12.0f, vCurve);
            }
        }
    }

    // 2. โปรไฟล์ชะลอความเร็วเข้าจุดสุดท้าย (Backward Pass)
    if (stopAtEnd && outCount >= 2) {
        float decel = max(40.0f, maxLat * 0.85f);
        s_ppSpeedProf[outCount - 1] = 10.0f;
        for (int i = outCount - 2; i >= 0; i--) {
            float ds = ppPointDist(s_ppPts[i], s_ppPts[i + 1]);
            float vNext = s_ppSpeedProf[i + 1];
            float vAllow = sqrtf(vNext * vNext + 2.0f * decel * ds);
            if (vAllow < s_ppSpeedProf[i]) s_ppSpeedProf[i] = vAllow;
        }
    }

    return outCount;
}

static bool findCircleSegmentIntersection(float rx, float ry, float ld,
                                          const Waypoint &p0, const Waypoint &p1,
                                          Waypoint &outPt) {
    float dx = p1.x - p0.x;
    float dy = p1.y - p0.y;
    float fx = p0.x - rx;
    float fy = p0.y - ry;

    float a = dx * dx + dy * dy;
    if (a < 1e-6f) return false;
    float b = 2.0f * (fx * dx + fy * dy);
    float c = (fx * fx + fy * fy) - ld * ld;

    float disc = b * b - 4.0f * a * c;
    if (disc < 0.0f) return false;

    float sqrtDisc = sqrtf(disc);
    float t1 = (-b - sqrtDisc) / (2.0f * a);
    float t2 = (-b + sqrtDisc) / (2.0f * a);

    // เลือกจุดตัดที่ก้าวไปข้างหน้าตามเส้นทางมากที่สุดใน [0, 1]
    float tBest = -1.0f;
    if (t2 >= 0.0f && t2 <= 1.0f) tBest = t2;
    else if (t1 >= 0.0f && t1 <= 1.0f) tBest = t1;

    if (tBest < 0.0f) return false;
    outPt.x = p0.x + tBest * dx;
    outPt.y = p0.y + tBest * dy;
    return true;
}

bool followPath(const Waypoint* pts, int count, float maxSpeedCmPs,
                bool stopAtEnd, bool reverse, unsigned long timeoutMs) {
    if (pts == nullptr || count < 2) {
        if (stopAtEnd) driveStop();
        return false;
    }

    clearTurnDistCarry();
    float vLimit = max(10.0f, fabsf(maxSpeedCmPs));
    int denseCount = densifyPath(pts, count, vLimit, stopAtEnd);
    if (denseCount < 2) {
        if (stopAtEnd) driveStop();
        return false;
    }

    char cmdBuf[24];
    snprintf(cmdBuf, sizeof(cmdBuf), "Path(%d,%.0f)", count, vLimit);
    missionNotifyCommand(cmdBuf, reverse ? 2 : 1);

    int closestIdx = 0;
    bool reached   = false;
    const float goalTol = max(1.5f, ppGoalToleranceCm);
    const float ldMin   = max(4.0f, ppLookaheadMinCm);
    const float ldMax   = max(ldMin, ppLookaheadMaxCm);
    const float halfTrk = 0.5f * max(1.0f, effectiveTrackCm);
    const float maxLat  = max(15.0f, ppMaxLatAccel);

    unsigned long startMs = millis();
    while (true) {
        missionUpdateTimerHUD();
        ekfUpdate();

        if (millis() - startMs >= timeoutMs) {
            break;
        }

        float rx     = ekfGetX();
        float ry     = ekfGetY();
        float rTheta = ekfGetHeadingRad();

        // อัปเดตดัชนีจุดใกล้สุดแบบเดินหน้าเท่านั้น (Monotonic)
        float bestD2 = 1e12f;
        int searchEnd = min(denseCount - 1, closestIdx + 24);
        for (int i = closestIdx; i <= searchEnd; i++) {
            float dx = s_ppPts[i].x - rx;
            float dy = s_ppPts[i].y - ry;
            float d2 = dx * dx + dy * dy;
            if (d2 <= bestD2) {
                bestD2     = d2;
                closestIdx = i;
            }
        }

        // ตรวจสอบเงื่อนไขถึงจุดปลายทาง
        float gdx = s_ppPts[denseCount - 1].x - rx;
        float gdy = s_ppPts[denseCount - 1].y - ry;
        float distToGoal = sqrtf(gdx * gdx + gdy * gdy);
        if (closestIdx >= denseCount - 4 && distToGoal <= goalTol) {
            reached = true;
            break;
        }

        // Adaptive Lookahead Distance ตามความเร็วปัจจุบัน
        float curSpd = fabsf(ekfGetLinearVel());
        float ld = constrain(ppLookaheadGain * curSpd + ldMin, ldMin, ldMax);

        Waypoint targetPt = s_ppPts[denseCount - 1];
        for (int i = closestIdx; i < denseCount - 1; i++) {
            if (findCircleSegmentIntersection(rx, ry, ld, s_ppPts[i], s_ppPts[i + 1], targetPt)) {
                break;
            }
        }

        // แปลงจุดเป้าหมายเข้าพิกัดตัวหุ่น (+xLocal = ทิศเคลื่อนที่, +yLocal = ขวาของทิศเคลื่อนที่)
        float effTheta = rTheta;
        if (reverse) {
            effTheta += 3.1415926535897932f;
        }
        float c = cosf(effTheta);
        float s = sinf(effTheta);
        float dtx = targetPt.x - rx;
        float dty = targetPt.y - ry;
        float xLocal =  dtx * c + dty * s;
        float yLocal = -dtx * s + dty * c;

        float ldSq  = max(4.0f, xLocal * xLocal + yLocal * yLocal);
        float kappa = (2.0f * yLocal) / ldSq;

        float vMag = min(vLimit, s_ppSpeedProf[closestIdx]);
        if (fabsf(kappa) > 1e-4f) {
            float vCurv = sqrtf(maxLat / fabsf(kappa));
            if (vCurv < vMag) vMag = vCurv;
        }
        vMag = max(10.0f, vMag);

        // คำนวณความเร็วล้อซ้าย-ขวา (+theta = หมุนขวา CW จึงใช้ omega = vMag * kappa ทั้งหน้า/ถอย)
        float v     = reverse ? -vMag : vMag;
        float omega = vMag * kappa;
        float vL    = v + omega * halfTrk;
        float vR    = v - omega * halfTrk;

        float maxWheelAllowed = max(vLimit * 1.35f, 120.0f);
        float peak = max(fabsf(vL), fabsf(vR));
        if (peak > maxWheelAllowed) {
            float scale = maxWheelAllowed / peak;
            vL *= scale;
            vR *= scale;
        }

        driveWheelVelocitiesCmPs(vL, vR);
        delay(5);
    }

    if (stopAtEnd || !reached) {
        driveStop();
    }
    ekfUpdate();
    current_degree = ekfGetHeadingDeg();
    missionFinishCommandBeep();
    return reached;
}

bool followWaypoints(const float* xs, const float* ys, int count, float maxSpeedCmPs,
                     bool stopAtEnd, bool reverse, unsigned long timeoutMs) {
    if (xs == nullptr || ys == nullptr || count < 2) {
        if (stopAtEnd) driveStop();
        return false;
    }
    static constexpr int MAX_PACK = 64;
    int n = min(count, MAX_PACK);
    Waypoint pts[MAX_PACK];
    for (int i = 0; i < n; i++) {
        pts[i].x = xs[i];
        pts[i].y = ys[i];
    }
    return followPath(pts, n, maxSpeedCmPs, stopAtEnd, reverse, timeoutMs);
}
