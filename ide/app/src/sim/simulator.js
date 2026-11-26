'use strict';

import { evalExpression, resolveDirValue } from '../blocks/expressionAst.js';
import { MISSION_SECTIONS, parseWaypointListText } from '../blocks/definitions.js';
import { render2DFieldGrid, renderIsometricGrid } from './fieldRenderer.js';
import { getCellOccupancyMap, getElevationAtCm, resolveTileSemantics } from './fieldTiles.js';

export function encoderCountsPerRevolution(_speed) {
  return 1300.0;
}

export function getCalTuneScale(cal) {
  const distMm = Number(cal.distmm) || 0;
  return Math.min(1.5, Math.max(0.5, (300.0 + distMm) / 300.0));
}

export function mapFieldCmToRobotCm(fieldCm, config = {}) {
  const d = Number(fieldCm) || 0;
  if (d <= 0) return 0;
  let mapped = d;
  if (config?.enableBoxDistCal !== false) {
    const tile = Math.max(5, Number(config?.boxTileCm) || 30);
    const pts = [0];
    for (let i = 1; i <= 8; i++) {
      const raw = Number(config?.[`box${i}Cm`]);
      pts.push(Number.isFinite(raw) ? Math.max(0, raw) : i * tile);
    }
    const boxF = d / tile;
    if (boxF >= 8) {
      let slope = pts[8] - pts[7];
      if (slope <= 0.5) slope = tile;
      mapped = pts[8] + (boxF - 8) * slope;
    } else {
      const idx = Math.max(0, Math.min(7, Math.floor(boxF)));
      const frac = boxF - idx;
      mapped = pts[idx] + frac * (pts[idx + 1] - pts[idx]);
    }
  }
  const rawOffset = Number(config?.distOffsetCm);
  const offsetCm = Number.isFinite(rawOffset) ? Math.max(-10, Math.min(10, rawOffset)) : 0;
  if (Math.abs(offsetCm) > 0.001) {
    const scale = d < 10 ? d / 10 : 1;
    mapped += offsetCm * scale;
  }
  return mapped > 0 ? mapped : 0;
}

export function encoderCentimetersToTicks(distanceCm, speed, cal) {
  if (distanceCm <= 0) return 0;
  const tpcm = Math.max(1.0, Number(cal.tpcm) || 15.0);
  const tuneScale = getCalTuneScale(cal);
  const speedScale = encoderCountsPerRevolution(speed) / 1300.0;
  return Math.round(distanceCm * tpcm * tuneScale * speedScale);
}

export function getCalibratedSpeedCmPerSec(speed, cal) {
  const spd = Math.max(1, Math.min(100, Math.abs(Number(speed) || 45)));
  const calMs = Math.max(150, Number(cal.calms) || 1150);
  const refCmPs = 30000.0 / calMs;
  return refCmPs * (spd / 45.0);
}

function dirToAngle(dir) {
  if (dir === 'L' || dir === 'l') return -90;
  if (dir === 'R' || dir === 'r') return 90;
  return 0;
}

export function evalSegmentPose(seg, tRaw) {
  const t = Math.max(0, Math.min(1, Number(tRaw) || 0));
  const h = seg.fh + (seg.th - seg.fh) * t;
  if (seg.arc) {
    const rad = (h * Math.PI) / 180;
    return {
      x: seg.arc.cx - seg.arc.s * seg.arc.r * Math.cos(rad),
      y: seg.arc.cy - seg.arc.s * seg.arc.r * Math.sin(rad),
      h
    };
  }
  return {
    x: seg.fx + (seg.tx - seg.fx) * t,
    y: seg.fy + (seg.ty - seg.fy) * t,
    h
  };
}

export function normalizeGridConfig(raw = {}) {
  const cellCm = Math.max(5, Math.min(200, Number(raw.cellCm ?? raw.tileWidthCm) || 30));
  const cols = Math.max(2, Math.min(24, parseInt(raw.cols, 10) || 7));
  const rows = Math.max(2, Math.min(24, parseInt(raw.rows, 10) || 7));
  const startCol = Math.max(0, Math.min(cols - 1, parseInt(raw.startCol, 10) || 0));
  const startRow = Math.max(0, Math.min(rows - 1, parseInt(raw.startRow, 10) || 0));
  const startHeading = Number(raw.startHeading) || 0;
  return { cellCm, cols, rows, startCol, startRow, startHeading, arenaW: cols * cellCm, arenaH: rows * cellCm };
}

export function getGridConfig() {
  const cellCm = Math.max(5, Math.min(200, parseFloat(document.getElementById('simCellSizeCm')?.value) || 30));
  const cols = Math.max(2, Math.min(24, parseInt(document.getElementById('simGridCols')?.value, 10) || 7));
  const rows = Math.max(2, Math.min(24, parseInt(document.getElementById('simGridRows')?.value, 10) || 7));
  const startColEl = document.getElementById('simStartCol');
  const startRowEl = document.getElementById('simStartRow');
  if (startColEl) startColEl.max = String(cols - 1);
  if (startRowEl) startRowEl.max = String(rows - 1);
  const startCol = Math.max(0, Math.min(cols - 1, parseInt(startColEl?.value, 10) || 0));
  const startRow = Math.max(0, Math.min(rows - 1, parseInt(startRowEl?.value, 10) || 0));
  const startHeading = parseFloat(document.getElementById('simStartHeading')?.value) || 0;
  return { cellCm, cols, rows, startCol, startRow, startHeading, arenaW: cols * cellCm, arenaH: rows * cellCm };
}

function expandBlocksWithCustomCalls(rawBlocks, extraFunctionsBlocks, topIdx = null, depth = 0) {
  if (!Array.isArray(rawBlocks) || depth > 4) return [];
  const fnMap = extraFunctionsBlocks && typeof extraFunctionsBlocks === 'object' ? extraFunctionsBlocks : null;
  const out = [];
  rawBlocks.forEach((b, i) => {
    const effectiveTopIdx = topIdx !== null ? topIdx : i;
    if (!b || b.disabled || b.__secDisabled) return;
    if (fnMap && b.type === 'RAW' && typeof b.params?.raw === 'string') {
      const m = b.params.raw.trim().match(/^([A-Za-z_]\w*)\s*\(\s*\)\s*;?(?:\s*\/\/.*)?$/);
      if (m) {
        const key = Object.keys(fnMap).find((k) => k.toLowerCase() === m[1].toLowerCase());
        if (key && Array.isArray(fnMap[key])) {
          const inner = expandBlocksWithCustomCalls(fnMap[key], fnMap, effectiveTopIdx, depth + 1);
          for (const item of inner) out.push(item);
          return;
        }
      }
    }
    out.push({ block: b, idx: effectiveTopIdx });
  });
  return out;
}

export function buildSimSegments(state, overrideOpts = null) {
  const grid = overrideOpts?.grid ? normalizeGridConfig(overrideOpts.grid) : getGridConfig();
  const cal = state.calibration || {};
  const vars = state.variables || [];
  const tuneScale = getCalTuneScale(cal);
  const trim = Number(cal.trim) || 0;

  // Match Config.ino / Move.ino / SpinTurn.ino curved turn kinematics
  const enableComp = state.config?.enableTurnDistComp !== false;
  const innerRatio = Math.max(0, Math.min(0.85, Number(state.config?.turnInnerRatio) || 0));
  const innerScale = innerRatio > 0.01 ? (1 + innerRatio) / (1 - innerRatio) : 1;
  const rawExitRadius = Number(state.config?.turnExitRadiusCm);
  const baseTurnRadius = Number.isFinite(rawExitRadius) ? Math.max(0, rawExitRadius) : 2.8;
  const effTurnRadius = Math.min(22, baseTurnRadius * innerScale);
  const turnFrontSpd = Number(state.config?.turnFrontMaxSpeed) || 80;
  const turnBackSpd = Number(state.config?.turnBackMaxSpeed) || 80;
  let turnExitCarryCm = 0;

  let x = (grid.startCol + 0.5) * grid.cellCm;
  let y = (grid.startRow + 0.5) * grid.cellCm;
  let h = grid.startHeading;
  let ekfOriginX = x;
  let ekfOriginY = y;
  let ekfOriginH = h;
  let ekfBaseX = 0;
  let ekfBaseY = 0;
  let ekfBaseDeg = 0;

  const missionObj = state.missions?.[state.activeMissionFile];
  const rawBlocks = Array.isArray(overrideOpts?.blocks)
    ? overrideOpts.blocks
    : missionObj?.sections
      ? MISSION_SECTIONS.flatMap((sec) => {
          const secDisabled = !!missionObj.disabledSections?.[sec.id];
          return (missionObj.sections[sec.id] || []).map((b) => (secDisabled ? { ...b, __secDisabled: true } : b));
        })
      : (missionObj?.blocks || []);
  const extraFnBlocks = overrideOpts?.extraFunctionsBlocks ?? missionObj?.extraFunctionsBlocks ?? null;
  const expandedBlocks = expandBlocksWithCustomCalls(rawBlocks, extraFnBlocks);
  const segments = [];
  let nominalCm = 0;
  let calibratedCm = 0;
  let totalTicks = 0;
  let totalMs = 0;
  const boxUnitCm = Math.max(5, Number(state.config?.boxTileCm) || grid.cellCm || 30);
  const evalCtx = { boxTileCm: boxUnitCm };

  const consumeCarryWorldCm = (rawCm, forward, entryCompWorldCm = 0) => {
    const carry = enableComp ? turnExitCarryCm : 0;
    turnExitCarryCm = 0;
    const signedPrev = forward ? carry : -carry;
    const adj = rawCm - signedPrev - entryCompWorldCm;
    return Math.max(0, adj);
  };

  const pushMoveWorld = (blockIdx, signedWorldCm, speed, label, marker = null, applyEncoderCal = true, rawNominalAbsCm = null) => {
    const fieldAbsCm = Math.abs(signedWorldCm);
    const nomCm = rawNominalAbsCm !== null ? Math.abs(rawNominalAbsCm) : fieldAbsCm;
    const mappedRobotCm = applyEncoderCal ? mapFieldCmToRobotCm(fieldAbsCm, state.config) : fieldAbsCm;
    const effRobotCm = applyEncoderCal ? mappedRobotCm * tuneScale : fieldAbsCm;
    const ticks = applyEncoderCal ? encoderCentimetersToTicks(mappedRobotCm, speed, cal) : 0;
    const driftDeg = applyEncoderCal ? 0 : trim * 0.25;
    const rad = ((h + driftDeg) * Math.PI) / 180;
    const nx = x + Math.sin(rad) * signedWorldCm;
    const ny = y - Math.cos(rad) * signedWorldCm;
    const velCmPs = getCalibratedSpeedCmPerSec(speed, cal);
    const dur = Math.max(100, (effRobotCm / Math.max(1, velCmPs)) * 1000);

    nominalCm += nomCm;
    calibratedCm += effRobotCm;
    totalTicks += ticks;
    totalMs += dur;

    segments.push({
      blockIdx, fx: x, fy: y, fh: h, tx: nx, ty: ny, th: h,
      startMs: totalMs - dur, endMs: totalMs, speedCmPs: velCmPs, label, ticks,
      effCm: Math.sign(signedWorldCm || 1) * effRobotCm, fieldCm: signedWorldCm, dur, marker
    });
    x = nx;
    y = ny;
  };

  const pushMove = (blockIdx, distCm, speed, label, marker = null, applyEncoderCal = true) => {
    pushMoveWorld(blockIdx, distCm, speed, label, marker, applyEncoderCal, Math.abs(distCm));
  };

  const pushTurn = (blockIdx, deg, label, isSwing = false) => {
    const nh = h + deg;
    const spinMax = Number(state.config?.spinMaxSpeed) || 55;
    const dur = Math.max(isSwing ? 140 : 180, Math.abs(deg) * ((isSwing ? 200 : 240) / Math.max(25, spinMax)));
    totalMs += dur;
    segments.push({
      blockIdx, fx: x, fy: y, fh: h, tx: x, ty: y, th: nh,
      startMs: totalMs - dur, endMs: totalMs, speedCmPs: 0, label, ticks: 0, effCm: 0, dur, marker: null
    });
    h = nh;
  };

  const pushArcTurn = (blockIdx, deg, radiusCm, dirSign, speed, label, opts = {}) => {
    if (Math.abs(deg) < 0.1 || radiusCm <= 0.05) {
      pushTurn(blockIdx, deg, label, true);
      return;
    }
    const s = dirSign * Math.sign(deg);
    const h0Rad = (h * Math.PI) / 180;
    const nh = h + deg;
    const h1Rad = (nh * Math.PI) / 180;
    const cx = x + s * radiusCm * Math.cos(h0Rad);
    const cy = y + s * radiusCm * Math.sin(h0Rad);
    const nx = cx - s * radiusCm * Math.cos(h1Rad);
    const ny = cy - s * radiusCm * Math.sin(h1Rad);
    const arcLenCm = Math.abs(deg) * (Math.PI / 180) * radiusCm;
    const velCmPs = getCalibratedSpeedCmPerSec(speed, cal);
    const dur = Math.max(160, (arcLenCm / Math.max(12, velCmPs)) * 1000);
    const ticks = Number.isFinite(opts.ticks) ? opts.ticks : encoderCentimetersToTicks(arcLenCm, speed, cal);
    const nomArc = Number.isFinite(opts.rawNominalCm) ? opts.rawNominalCm : arcLenCm;

    nominalCm += nomArc;
    calibratedCm += arcLenCm;
    totalTicks += ticks;
    totalMs += dur;

    segments.push({
      blockIdx,
      fx: x,
      fy: y,
      fh: h,
      tx: nx,
      ty: ny,
      th: nh,
      arc: { cx, cy, r: radiusCm, s, dirSign },
      startMs: totalMs - dur,
      endMs: totalMs,
      speedCmPs: velCmPs,
      label,
      ticks,
      effCm: dirSign * arcLenCm,
      dur,
      marker: 'turn'
    });
    x = nx;
    y = ny;
    h = nh;
  };

  expandedBlocks.forEach(({ block: b, idx }) => {
    const p = b.params || {};
    const spd = evalExpression(p.speed, vars, 60, evalCtx);
    const cm = evalExpression(p.cm, vars, 30, evalCtx);
    switch (b.type) {
      case 'FC_SIMPLE':
      case 'FC_BOX_SIMPLE': {
        const isBox = b.type === 'FC_BOX_SIMPLE';
        const boxes = isBox ? evalExpression(p.boxes, vars, 1, evalCtx) : 0;
        const moveCm = isBox ? Math.max(0, boxes * boxUnitCm) : cm;
        const straightWorld = enableComp ? consumeCarryWorldCm(moveCm, true, 0) : moveCm;
        turnExitCarryCm = 0;
        const lbl = isBox ? `FC_BOX ${boxes}b (${moveCm.toFixed(0)}cm)` : `FC ${cm.toFixed(0)}cm`;
        if (straightWorld > 0.05) pushMoveWorld(idx, straightWorld, spd, lbl, null, true, straightWorld);
        break;
      }
      case 'BC_SIMPLE':
      case 'BC_BOX_SIMPLE': {
        const isBox = b.type === 'BC_BOX_SIMPLE';
        const boxes = isBox ? evalExpression(p.boxes, vars, 1, evalCtx) : 0;
        const moveCm = isBox ? Math.max(0, boxes * boxUnitCm) : cm;
        const straightWorld = enableComp ? consumeCarryWorldCm(moveCm, false, 0) : moveCm;
        turnExitCarryCm = 0;
        const lbl = isBox ? `BC_BOX ${boxes}b (${moveCm.toFixed(0)}cm)` : `BC ${cm.toFixed(0)}cm`;
        if (straightWorld > 0.05) pushMoveWorld(idx, -straightWorld, spd, lbl, null, true, straightWorld);
        break;
      }
      case 'FC_DIR':
      case 'BC_DIR':
      case 'FC_BOX_DIR':
      case 'BC_BOX_DIR':
      case 'FC4':
      case 'BC4': {
        const isBox = b.type === 'FC_BOX_DIR' || b.type === 'BC_BOX_DIR';
        const forward = b.type === 'FC_DIR' || b.type === 'FC_BOX_DIR' || b.type === 'FC4';
        const is45 = b.type === 'FC4' || b.type === 'BC4';
        const boxes = isBox ? evalExpression(p.boxes, vars, 1, evalCtx) : 0;
        const moveCm = isBox ? Math.max(0, boxes * boxUnitCm) : cm;
        const d = resolveDirValue(p.dir, vars);
        const mag = is45 ? 45 : 90;
        const ang = (d === 'L' || d === 'l') ? -mag : mag;
        const isSwing = (d === 'L' || d === 'R');
        const prefix = isBox
          ? (forward ? 'FC_BOX' : 'BC_BOX')
          : (b.type === 'FC4' ? 'FC4' : b.type === 'BC4' ? 'BC4' : (forward ? 'FC' : 'BC'));
        const amtLbl = isBox ? `${boxes}b` : `${moveCm.toFixed(0)}cm`;

        if (isSwing) {
          const turnLabel = is45 ? `45° Turn '${d}'` : `Turn '${d}'`;
          if (effTurnRadius < 0.05) {
            const straightWorld = enableComp ? consumeCarryWorldCm(moveCm, forward, 0) : moveCm;
            turnExitCarryCm = 0;
            if (straightWorld > 0.05) {
              pushMoveWorld(idx, forward ? straightWorld : -straightWorld, spd, `${prefix} ${amtLbl}`, null, true, straightWorld);
            }
            pushTurn(idx, ang, turnLabel, true);
          } else {
            const tanHalf = Math.tan((Math.min(135, Math.max(5, Math.abs(ang))) * 0.5 * Math.PI) / 180);
            const prevCarrySigned = enableComp ? (forward ? turnExitCarryCm : -turnExitCarryCm) : 0;
            const availWorld = Math.max(0, moveCm - prevCarrySigned);
            const arcR = (enableComp && moveCm > 0.1)
              ? Math.min(effTurnRadius, Math.max(0.2, (availWorld * 0.85) / Math.max(0.2, tanHalf)))
              : effTurnRadius;
            const entryComp = enableComp ? Math.min(availWorld, arcR * tanHalf) : 0;
            const straightWorld = enableComp ? consumeCarryWorldCm(moveCm, forward, entryComp) : moveCm;
            if (straightWorld > 0.05) {
              pushMoveWorld(idx, forward ? straightWorld : -straightWorld, spd, `${prefix} ${amtLbl}`, null, true, straightWorld);
            }
            pushArcTurn(idx, ang, arcR, forward ? 1 : -1, spd || (forward ? turnFrontSpd : turnBackSpd), turnLabel);
            turnExitCarryCm = enableComp ? (forward ? arcR * tanHalf : -arcR * tanHalf) : 0;
          }
        } else {
          const straightWorld = enableComp ? consumeCarryWorldCm(moveCm, forward, 0) : moveCm;
          turnExitCarryCm = 0;
          if (straightWorld > 0.05) {
            pushMoveWorld(idx, forward ? straightWorld : -straightWorld, spd, `${prefix} ${amtLbl}`, null, true, straightWorld);
          }
          pushTurn(idx, ang, is45 ? `45° Spin '${d}'` : `Spin '${d}'`, false);
        }
        break;
      }
      case 'SPIN': {
        turnExitCarryCm = 0;
        const deg = evalExpression(p.deg, vars, 90, evalCtx);
        pushTurn(idx, deg, `SPIN ${deg}°`, false);
        break;
      }
      case 'TURN_F': {
        turnExitCarryCm = 0;
        const deg = evalExpression(p.deg, vars, 90, evalCtx);
        pushArcTurn(idx, deg, effTurnRadius, 1, turnFrontSpd, `TurnF ${deg}°`);
        break;
      }
      case 'TURN_B': {
        turnExitCarryCm = 0;
        const deg = evalExpression(p.deg, vars, 90, evalCtx);
        pushArcTurn(idx, deg, effTurnRadius, -1, turnBackSpd, `TurnB ${deg}°`);
        break;
      }
      case 'TTF90':
      case 'TTF45': {
        turnExitCarryCm = 0;
        const sL = evalExpression(p.spdL, vars, 80, evalCtx);
        const sR = evalExpression(p.spdR, vars, 25, evalCtx);
        const ang = b.type === 'TTF90' ? 90 : 45;
        const delta = sL < sR ? -ang : ang;
        const spdMax = Math.max(Math.abs(sL), Math.abs(sR));
        const arcR = Math.max(2.5, cm / ((Math.abs(delta) * Math.PI) / 180));
        const ticks = encoderCentimetersToTicks(cm, spdMax, cal);
        pushArcTurn(idx, delta, arcR, 1, spdMax, b.type, { rawNominalCm: cm, ticks });
        break;
      }
      case 'TTB90':
      case 'TTB45': {
        turnExitCarryCm = 0;
        const sL = evalExpression(p.spdL, vars, 25, evalCtx);
        const sR = evalExpression(p.spdR, vars, 80, evalCtx);
        const ang = b.type === 'TTB90' ? 90 : 45;
        const delta = sL < sR ? ang : -ang;
        const spdMax = Math.max(Math.abs(sL), Math.abs(sR));
        const arcR = Math.max(2.5, cm / ((Math.abs(delta) * Math.PI) / 180));
        const ticks = encoderCentimetersToTicks(cm, spdMax, cal);
        pushArcTurn(idx, delta, arcR, -1, spdMax, b.type, { rawNominalCm: cm, ticks });
        break;
      }
      case 'FF_TIME': {
        turnExitCarryCm = 0;
        const ms = evalExpression(p.ms, vars, 400, evalCtx);
        pushMove(idx, (getCalibratedSpeedCmPerSec(spd, cal) * ms) / 1000, spd, `FF ${ms}ms`, null, false);
        break;
      }
      case 'BB_TIME': {
        turnExitCarryCm = 0;
        const ms = evalExpression(p.ms, vars, 400, evalCtx);
        pushMove(idx, -(getCalibratedSpeedCmPerSec(spd, cal) * ms) / 1000, spd, `BB ${ms}ms`, null, false);
        break;
      }
      case 'EKF_RESET': {
        turnExitCarryCm = 0;
        ekfOriginX = x;
        ekfOriginY = y;
        ekfOriginH = h;
        ekfBaseX = evalExpression(p.x, vars, 0, evalCtx);
        ekfBaseY = evalExpression(p.y, vars, 0, evalCtx);
        ekfBaseDeg = evalExpression(p.deg, vars, 0, evalCtx);
        break;
      }
      case 'FOLLOW_PATH': {
        turnExitCarryCm = 0;
        const pts = parseWaypointListText(p.points);
        const velCmPs = Math.max(10, evalExpression(p.speed, vars, 50, evalCtx));
        const refRad = ((ekfOriginH - ekfBaseDeg) * Math.PI) / 180;
        const sinR = Math.sin(refRad);
        const cosR = Math.cos(refRad);
        for (const pt of pts) {
          const dxEkf = pt.x - ekfBaseX;
          const dyEkf = pt.y - ekfBaseY;
          const nx = ekfOriginX + dxEkf * sinR + dyEkf * cosR;
          const ny = ekfOriginY - dxEkf * cosR + dyEkf * sinR;
          const segDist = Math.hypot(nx - x, ny - y);
          if (segDist < 0.2) continue;
          const nh = (Math.atan2(nx - x, -(ny - y)) * 180) / Math.PI;
          const ticks = encoderCentimetersToTicks(segDist, 60, cal);
          const dur = Math.max(80, (segDist / velCmPs) * 1000);
          nominalCm += segDist;
          calibratedCm += segDist;
          totalTicks += ticks;
          totalMs += dur;
          segments.push({
            blockIdx: idx, fx: x, fy: y, fh: h, tx: nx, ty: ny, th: nh,
            startMs: totalMs - dur, endMs: totalMs, speedCmPs: velCmPs,
            label: `Path (${pt.x.toFixed(0)},${pt.y.toFixed(0)})`, ticks,
            effCm: segDist, fieldCm: segDist, dur, marker: null
          });
          x = nx;
          y = ny;
          h = nh;
        }
        break;
      }
      case 'VEL_DRIVE': {
        turnExitCarryCm = 0;
        const vL = evalExpression(p.vL, vars, 40, evalCtx);
        const vR = evalExpression(p.vR, vars, 40, evalCtx);
        const vAvg = (vL + vR) * 0.5;
        const dur = 250;
        const dist = (vAvg * dur) / 1000;
        if (Math.abs(dist) > 0.1) pushMove(idx, dist, 50, `Vel ${vL.toFixed(0)}/${vR.toFixed(0)}`, null, false);
        break;
      }
      case 'SETF':
      case 'SETF_BACK':
      case 'SETF_DIR': {
        const approachCm = Math.max(grid.cellCm * 0.1, grid.cellCm * 0.4 - (enableComp ? turnExitCarryCm : 0));
        turnExitCarryCm = 0;
        const backCm = evalExpression(p.cm, vars, 0, evalCtx);
        const d = p.dir ? resolveDirValue(p.dir, vars) : '';
        pushMove(idx, approachCm, spd, 'SetF Align', 'line');
        if (backCm) pushMove(idx, -backCm, spd, `Back ${backCm}cm`);
        if (d) pushTurn(idx, dirToAngle(d), `Spin '${d}'`, false);
        break;
      }
      case 'SETB':
      case 'SETB_FWD':
      case 'SETB_DIR': {
        const approachCm = Math.max(grid.cellCm * 0.1, grid.cellCm * 0.4 + (enableComp ? turnExitCarryCm : 0));
        turnExitCarryCm = 0;
        const fwdCm = evalExpression(p.cm, vars, 0, evalCtx);
        const d = p.dir ? resolveDirValue(p.dir, vars) : '';
        pushMove(idx, -approachCm, spd, 'SetB Align', 'line');
        if (fwdCm) pushMove(idx, fwdCm, spd, `Fwd ${fwdCm}cm`);
        if (d) pushTurn(idx, dirToAngle(d), `Spin '${d}'`, false);
        break;
      }
      case 'DROPF_SPD': {
        const approachCm = Math.max(grid.cellCm * 0.1, grid.cellCm * 0.4 - (enableComp ? turnExitCarryCm : 0));
        turnExitCarryCm = 0;
        pushMove(idx, approachCm, spd, 'DropF Check', 'line');
        totalMs += 200;
        segments.push({ blockIdx: idx, fx: x, fy: y, fh: h, tx: x, ty: y, th: h, startMs: totalMs - 200, endMs: totalMs, speedCmPs: 0, label: 'DropF Cube', ticks: 0, effCm: 0, dur: 200, marker: 'drop' });
        break;
      }
      case 'DROPB_SPD': {
        const approachCm = Math.max(grid.cellCm * 0.1, grid.cellCm * 0.4 + (enableComp ? turnExitCarryCm : 0));
        turnExitCarryCm = 0;
        pushMove(idx, -approachCm, spd, 'DropB Check', 'line');
        totalMs += 200;
        segments.push({ blockIdx: idx, fx: x, fy: y, fh: h, tx: x, ty: y, th: h, startMs: totalMs - 200, endMs: totalMs, speedCmPs: 0, label: 'DropB Cube', ticks: 0, effCm: 0, dur: 200, marker: 'drop' });
        break;
      }
      case 'DROPF':
      case 'DROPB':
        turnExitCarryCm = 0;
        totalMs += 300;
        segments.push({ blockIdx: idx, fx: x, fy: y, fh: h, tx: x, ty: y, th: h, startMs: totalMs - 300, endMs: totalMs, speedCmPs: 0, label: b.type, ticks: 0, effCm: 0, dur: 300, marker: 'drop' });
        break;
      case 'STOP':
        turnExitCarryCm = 0;
        totalMs += 250;
        segments.push({ blockIdx: idx, fx: x, fy: y, fh: h, tx: x, ty: y, th: h, startMs: totalMs - 250, endMs: totalMs, speedCmPs: 0, label: 'STOP()', ticks: 0, effCm: 0, dur: 250, marker: 'pause' });
        break;
      case 'DELAY': {
        const dMs = Math.max(50, evalExpression(p.ms, vars, 250, evalCtx));
        totalMs += dMs;
        segments.push({ blockIdx: idx, fx: x, fy: y, fh: h, tx: x, ty: y, th: h, startMs: totalMs - dMs, endMs: totalMs, speedCmPs: 0, label: `delay ${dMs}ms`, ticks: 0, effCm: 0, dur: dMs, marker: 'pause' });
        break;
      }
      default:
        break;
    }
  });

  return {
    grid,
    startX: (grid.startCol + 0.5) * grid.cellCm,
    startY: (grid.startRow + 0.5) * grid.cellCm,
    startH: grid.startHeading,
    segments,
    stats: { nominalCm, calibratedCm, totalTicks, estSec: totalMs / 1000 }
  };
}

export function renderSimToTarget(state, canvas, teleIds = null, overrideOpts = null) {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const grid = overrideOpts?.grid ? normalizeGridConfig(overrideOpts.grid) : getGridConfig();
  const fieldMap = state.fieldMap;
  const hasFieldGrid = Array.isArray(fieldMap?.gridData) && fieldMap.gridData.length > 0;
  const segs = state.sim.segments;
  const followCam = !!state.sim.cameraFollowRobot;
  const normHeading = (((Math.round(state.sim.robotH) % 360) + 360) % 360);
  let outLayout = null;

  const simOverlay = {
    tileWidthCm: grid.cellCm,
    segments: segs,
    segIdx: state.sim.segIdx,
    segProgress: state.sim.segProgress,
    robotX: state.sim.robotX,
    robotY: state.sim.robotY,
    robotH: state.sim.robotH
  };

  if (hasFieldGrid && fieldMap.simViewMode === 'iso') {
    renderIsometricGrid(canvas, fieldMap.gridData, {
      cameraRotDeg: fieldMap.simCameraRot || 0,
      tileWidthCm: grid.cellCm,
      simOverlay,
      cameraFollowRobot: followCam
    });
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(
      followCam
        ? `CAM LOCK · 3D ISO · HDG ${normHeading}° · ${grid.cols}x${grid.rows} (${grid.cellCm}cm/cell)`
        : `3D ISO (${fieldMap.simCameraRot || 0}°) · ${grid.cols}x${grid.rows} (${grid.cellCm}cm/cell)`,
      12,
      canvas.height - 8
    );
  } else if (hasFieldGrid) {
    const layout = render2DFieldGrid(canvas, fieldMap.gridData, {
      showMarkers: !!fieldMap.showMarkers,
      padding: Number(overrideOpts?.padding ?? 26),
      simOverlay,
      cameraFollowRobot: followCam
    });
    outLayout = layout;
    if (typeof overrideOpts?.after2DRender === 'function') {
      overrideOpts.after2DRender(ctx, canvas, layout, grid);
    }
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(
      followCam
        ? `CAM LOCK · 2D · HDG ${normHeading}° · ${grid.cols}x${grid.rows} (${grid.cellCm}cm/cell)`
        : `${grid.cols}x${grid.rows} (${grid.cellCm}cm/cell = ${grid.arenaW}x${grid.arenaH}cm)`,
      followCam ? 12 : (layout?.offX ?? 26),
      canvas.height - 7
    );
  } else {
    const W = canvas.width;
    const H = canvas.height;
    const pad = 26;
    const basePxPerCm = Math.min((W - pad * 2) / grid.arenaW, (H - pad * 2) / grid.arenaH);
    const pxPerCm = followCam ? Math.max(basePxPerCm * 1.4, Math.min(3.1, Math.min(W, H) / 126)) : basePxPerCm;
    const drawW = grid.arenaW * pxPerCm;
    const drawH = grid.arenaH * pxPerCm;
    const offX = followCam ? 0 : (W - drawW) * 0.5;
    const offY = followCam ? 0 : (H - drawH) * 0.5;
    const toPxX = (cm) => offX + cm * pxPerCm;
    const toPxY = (cm) => offY + cm * pxPerCm;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    if (followCam) {
      const rxWorld = state.sim.robotX * pxPerCm;
      const ryWorld = state.sim.robotY * pxPerCm;
      const camRad = ((state.sim.robotH || 0) * Math.PI) / 180;
      ctx.translate(W * 0.5, H * 0.5);
      ctx.rotate(-camRad);
      ctx.translate(-rxWorld, -ryWorld);
    }
    ctx.fillStyle = '#0c1322';
    ctx.fillRect(offX, offY, drawW, drawH);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.lineWidth = 1.2;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#64748b';
    for (let c = 0; c <= grid.cols; c++) {
      const px = toPxX(c * grid.cellCm);
      ctx.beginPath(); ctx.moveTo(px, offY); ctx.lineTo(px, offY + drawH); ctx.stroke();
      if (c < grid.cols) ctx.fillText(String(c), px + 3, offY - 6);
    }
    for (let r = 0; r <= grid.rows; r++) {
      const py = toPxY(r * grid.cellCm);
      ctx.beginPath(); ctx.moveTo(offX, py); ctx.lineTo(offX + drawW, py); ctx.stroke();
      if (r < grid.rows) ctx.fillText(String(r), offX - 16, py + 12);
    }

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(offX, offY, drawW, drawH);
    ctx.restore();

    if (followCam) {
      ctx.save();
      ctx.translate(W * 0.5, H * 0.5);
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-10, -10, 20, 20, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#10b981';
      ctx.fillRect(-8, -12, 16, 3);
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(-4, 4);
      ctx.lineTo(4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(
      followCam
        ? `CAM LOCK · 2D · HDG ${normHeading}° · ${grid.cols}x${grid.rows}`
        : `${grid.cols}x${grid.rows} (${grid.cellCm}cm/cell = ${grid.arenaW}x${grid.arenaH}cm)`,
      followCam ? 12 : offX,
      H - 7
    );
  }

  const clampedIdx = Math.min(state.sim.segIdx, Math.max(0, segs.length - 1));
  const activeSeg = segs[clampedIdx];
  const stats = state.sim.stats;
  const curSpd = activeSeg && activeSeg.speedCmPs > 0 ? `${activeSeg.speedCmPs.toFixed(1)} cm/s` : '0.0 cm/s';
  let curLabel = `Ready · ${curSpd}`;
  if (activeSeg) {
    if (state.sim.activeBlockIndex < 0 && !state.sim.playing && state.sim.segIdx === 0 && state.sim.segProgress === 0) {
      curLabel = `Start (0/${segs.length}) · 0.0 cm/s`;
    } else {
      curLabel = `Step ${clampedIdx + 1}/${segs.length}: ${activeSeg.label} · ${curSpd}`;
    }
  }
  const elapsedSec = state.sim.elapsedMs / 1000;

  const zMm = hasFieldGrid ? getElevationAtCm(fieldMap.gridData, state.sim.robotX, state.sim.robotY, grid.cellCm) : 5;
  const zNote = Math.round(zMm) !== 5 ? ` · Z:${zMm.toFixed(0)}mm` : '';

  const teleStep = teleIds?.step ? document.getElementById(teleIds.step) : null;
  const telePose = teleIds?.pose ? document.getElementById(teleIds.pose) : null;
  const teleClock = teleIds?.clock ? document.getElementById(teleIds.clock) : null;
  const teleTile = teleIds?.tile ? document.getElementById(teleIds.tile) : null;
  if (teleStep) teleStep.textContent = curLabel;
  if (telePose) telePose.textContent = `${state.sim.robotX.toFixed(1)}, ${state.sim.robotY.toFixed(1)} cm · ${normHeading}°${zNote}`;
  if (teleClock) {
    const hasCalDiff = Math.abs(stats.calibratedCm - stats.nominalCm) >= 0.15;
    teleClock.textContent = hasCalDiff
      ? `${stats.nominalCm.toFixed(1)} cm -> Robot ${stats.calibratedCm.toFixed(1)} cm (${stats.totalTicks} t) · ${elapsedSec.toFixed(2)}s / ${stats.estSec.toFixed(2)}s`
      : `${stats.nominalCm.toFixed(1)} cm (${stats.totalTicks} t) · ${elapsedSec.toFixed(2)}s / ${stats.estSec.toFixed(2)}s`;
  }

  if (teleTile) {
    if (hasFieldGrid) {
      const r = Math.max(0, Math.min(fieldMap.gridData.length - 1, Math.floor(state.sim.robotY / grid.cellCm)));
      const c = Math.max(0, Math.min((fieldMap.gridData[0]?.length || 1) - 1, Math.floor(state.sim.robotX / grid.cellCm)));
      const occ = getCellOccupancyMap(fieldMap.gridData);
      const info = occ[`${r},${c}`];
      if (info) {
        const sem = resolveTileSemantics(info.cell.tileId, info.cell.rot);
        teleTile.textContent = `#${sem.id} ${sem.name} (R${r},C${c})`;
      } else {
        teleTile.textContent = `ช่องว่าง (R${r},C${c}) · 5mm`;
      }
    } else {
      teleTile.textContent = 'Default Grid';
    }
  }
  return { grid, layout: outLayout };
}

export function drawSimulator(state) {
  const mainCanvas = document.getElementById('simCanvas');
  if (mainCanvas) {
    renderSimToTarget(state, mainCanvas, {
      step: 'teleStep',
      pose: 'telePose',
      clock: 'teleClock',
      tile: 'teleTile'
    });
  }

  const codeView = document.getElementById('viewCode');
  const codeLayout = document.getElementById('codeLayout');
  const codeCanvas = document.getElementById('codeSimCanvas');
  if (
    codeCanvas &&
    codeView?.classList.contains('active') &&
    !codeLayout?.classList.contains('code-sim-collapsed')
  ) {
    renderSimToTarget(state, codeCanvas, {
      step: 'codeTeleStep',
      pose: 'codeTelePose',
      clock: 'codeTeleClock',
      tile: 'codeTeleTile'
    });
  }
}
