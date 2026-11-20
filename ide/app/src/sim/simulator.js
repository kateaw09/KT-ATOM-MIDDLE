'use strict';

import { evalExpression, resolveDirValue } from '../blocks/expressionAst.js';

export function encoderCountsPerRevolution(speed) {
  const s = Math.abs(Number(speed) || 0);
  if (s >= 70) return 1000.0;
  if (s >= 50) return 1200.0;
  return 1300.0;
}

export function getCalTuneScale(cal) {
  const distMm = Number(cal.distmm) || 0;
  return Math.min(1.5, Math.max(0.5, (300.0 + distMm) / 300.0));
}

export function encoderCentimetersToTicks(distanceCm, speed, cal) {
  if (distanceCm <= 0) return 0;
  const tpcm = Math.max(1.0, Number(cal.tpcm) || 15.0);
  const tuneScale = getCalTuneScale(cal);
  const speedScale = encoderCountsPerRevolution(speed) / 1300.0;
  return Math.round(distanceCm * tpcm * tuneScale * speedScale);
}

export function getCalibratedSpeedCmPerSec(speed, cal) {
  const spd = Math.max(15, Math.min(100, Math.abs(Number(speed) || 45)));
  const calMs = Math.max(150, Number(cal.calms) || 1150);
  const refCmPs = 30000.0 / calMs;
  return refCmPs * (spd / 45.0);
}

function dirToAngle(dir) {
  if (dir === 'L' || dir === 'l') return -90;
  if (dir === 'R' || dir === 'r') return 90;
  return 0;
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

export function buildSimSegments(state) {
  const grid = getGridConfig();
  const cal = state.calibration;
  const vars = state.variables || [];
  const tuneScale = getCalTuneScale(cal);
  const trim = Number(cal.trim) || 0;

  let x = (grid.startCol + 0.5) * grid.cellCm;
  let y = (grid.startRow + 0.5) * grid.cellCm;
  let h = grid.startHeading;

  const blocks = state.missions[state.activeMissionFile]?.blocks || [];
  const segments = [];
  let nominalCm = 0;
  let calibratedCm = 0;
  let totalTicks = 0;
  let totalMs = 0;

  const pushMove = (blockIdx, distCm, speed, label, marker = null, applyEncoderCal = true) => {
    const absCm = Math.abs(distCm);
    const signedEffCm = applyEncoderCal ? distCm * tuneScale : distCm;
    const ticks = applyEncoderCal ? encoderCentimetersToTicks(absCm, speed, cal) : 0;
    const driftDeg = applyEncoderCal ? 0 : trim * 0.25;
    const rad = ((h + driftDeg) * Math.PI) / 180;
    const nx = x + Math.sin(rad) * signedEffCm;
    const ny = y - Math.cos(rad) * signedEffCm;
    const velCmPs = getCalibratedSpeedCmPerSec(speed, cal);
    const dur = Math.max(100, (Math.abs(signedEffCm) / Math.max(1, velCmPs)) * 1000);

    nominalCm += absCm;
    calibratedCm += Math.abs(signedEffCm);
    totalTicks += ticks;
    totalMs += dur;

    segments.push({
      blockIdx, fx: x, fy: y, fh: h, tx: nx, ty: ny, th: h,
      startMs: totalMs - dur, endMs: totalMs, speedCmPs: velCmPs, label, ticks, effCm: signedEffCm, dur, marker
    });
    x = nx;
    y = ny;
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

  blocks.forEach((b, idx) => {
    const p = b.params || {};
    const spd = evalExpression(p.speed, vars, 60);
    const cm = evalExpression(p.cm, vars, 30);
    switch (b.type) {
      case 'FC_SIMPLE':
        pushMove(idx, cm, spd, `FC ${cm.toFixed(0)}cm`);
        break;
      case 'BC_SIMPLE':
        pushMove(idx, -cm, spd, `BC ${cm.toFixed(0)}cm`);
        break;
      case 'FC_DIR': {
        const d = resolveDirValue(p.dir, vars);
        const ang = (d === 'L' || d === 'l') ? -90 : 90;
        const isSwing = (d === 'L' || d === 'R');
        pushMove(idx, cm, spd, `FC ${cm.toFixed(0)}cm`);
        pushTurn(idx, ang, isSwing ? `Swing '${d}'` : `Spin '${d}'`, isSwing);
        break;
      }
      case 'BC_DIR': {
        const d = resolveDirValue(p.dir, vars);
        const ang = (d === 'L' || d === 'l') ? -90 : 90;
        const isSwing = (d === 'L' || d === 'R');
        pushMove(idx, -cm, spd, `BC ${cm.toFixed(0)}cm`);
        pushTurn(idx, ang, isSwing ? `Swing '${d}'` : `Spin '${d}'`, isSwing);
        break;
      }
      case 'FC4': {
        const d = resolveDirValue(p.dir, vars);
        const isSwing = (d === 'L' || d === 'R');
        pushMove(idx, cm, spd, `FC4 ${cm.toFixed(0)}cm`);
        pushTurn(idx, (d === 'L' || d === 'l') ? -45 : 45, isSwing ? `45° Swing '${d}'` : `45° Spin '${d}'`, isSwing);
        break;
      }
      case 'BC4': {
        const d = resolveDirValue(p.dir, vars);
        const isSwing = (d === 'L' || d === 'R');
        pushMove(idx, -cm, spd, `BC4 ${cm.toFixed(0)}cm`);
        pushTurn(idx, (d === 'L' || d === 'l') ? -45 : 45, isSwing ? `45° Swing '${d}'` : `45° Spin '${d}'`, isSwing);
        break;
      }
      case 'SPIN':
      case 'TURN_F':
      case 'TURN_B': {
        const deg = evalExpression(p.deg, vars, 90);
        pushTurn(idx, deg, `${b.type} ${deg}°`);
        break;
      }
      case 'TTF90':
      case 'TTF45': {
        const sL = evalExpression(p.spdL, vars, 80);
        const sR = evalExpression(p.spdR, vars, 25);
        const ang = b.type === 'TTF90' ? 90 : 45;
        const delta = sL < sR ? -ang : ang;
        const nh = h + delta;
        const chord = cm * 0.72 * tuneScale;
        const midRad = ((h + delta * 0.5) * Math.PI) / 180;
        const nx = x + Math.sin(midRad) * chord;
        const ny = y - Math.cos(midRad) * chord;
        const spdMax = Math.max(Math.abs(sL), Math.abs(sR));
        const velCmPs = getCalibratedSpeedCmPerSec(spdMax, cal);
        const dur = Math.max(220, ((cm * tuneScale) / velCmPs) * 1000);
        const ticks = encoderCentimetersToTicks(cm, spdMax, cal);
        totalTicks += ticks;
        nominalCm += cm;
        calibratedCm += cm * tuneScale;
        totalMs += dur;
        segments.push({ blockIdx: idx, fx: x, fy: y, fh: h, tx: nx, ty: ny, th: nh, startMs: totalMs - dur, endMs: totalMs, speedCmPs: velCmPs, label: b.type, ticks, effCm: chord, dur, marker: null });
        x = nx; y = ny; h = nh;
        break;
      }
      case 'TTB90':
      case 'TTB45': {
        const sL = evalExpression(p.spdL, vars, 25);
        const sR = evalExpression(p.spdR, vars, 80);
        const ang = b.type === 'TTB90' ? 90 : 45;
        const delta = sL < sR ? ang : -ang;
        const nh = h + delta;
        const chord = cm * 0.72 * tuneScale;
        const midRad = ((h + delta * 0.5) * Math.PI) / 180;
        const nx = x - Math.sin(midRad) * chord;
        const ny = y + Math.cos(midRad) * chord;
        const spdMax = Math.max(Math.abs(sL), Math.abs(sR));
        const velCmPs = getCalibratedSpeedCmPerSec(spdMax, cal);
        const dur = Math.max(220, ((cm * tuneScale) / velCmPs) * 1000);
        const ticks = encoderCentimetersToTicks(cm, spdMax, cal);
        totalTicks += ticks;
        nominalCm += cm;
        calibratedCm += cm * tuneScale;
        totalMs += dur;
        segments.push({ blockIdx: idx, fx: x, fy: y, fh: h, tx: nx, ty: ny, th: nh, startMs: totalMs - dur, endMs: totalMs, speedCmPs: velCmPs, label: b.type, ticks, effCm: -chord, dur, marker: null });
        x = nx; y = ny; h = nh;
        break;
      }
      case 'FF_TIME': {
        const ms = evalExpression(p.ms, vars, 400);
        pushMove(idx, (getCalibratedSpeedCmPerSec(spd, cal) * ms) / 1000, spd, `FF ${ms}ms`, null, false);
        break;
      }
      case 'BB_TIME': {
        const ms = evalExpression(p.ms, vars, 400);
        pushMove(idx, -(getCalibratedSpeedCmPerSec(spd, cal) * ms) / 1000, spd, `BB ${ms}ms`, null, false);
        break;
      }
      case 'SETF':
      case 'SETF_BACK':
      case 'SETF_DIR': {
        const backCm = evalExpression(p.cm, vars, 0);
        const d = p.dir ? resolveDirValue(p.dir, vars) : '';
        pushMove(idx, grid.cellCm * 0.4, spd, 'SetF Align', 'line');
        if (backCm) pushMove(idx, -backCm, spd, `Back ${backCm}cm`);
        if (d) pushTurn(idx, dirToAngle(d), `Turn '${d}'`);
        break;
      }
      case 'SETB':
      case 'SETB_FWD':
      case 'SETB_DIR': {
        const fwdCm = evalExpression(p.cm, vars, 0);
        const d = p.dir ? resolveDirValue(p.dir, vars) : '';
        pushMove(idx, -grid.cellCm * 0.4, spd, 'SetB Align', 'line');
        if (fwdCm) pushMove(idx, fwdCm, spd, `Fwd ${fwdCm}cm`);
        if (d) pushTurn(idx, dirToAngle(d), `Turn '${d}'`);
        break;
      }
      case 'DROPF_SPD':
        pushMove(idx, grid.cellCm * 0.4, spd, 'DropF Check', 'line');
        totalMs += 200;
        segments.push({ blockIdx: idx, fx: x, fy: y, fh: h, tx: x, ty: y, th: h, startMs: totalMs - 200, endMs: totalMs, speedCmPs: 0, label: 'DropF Cube', ticks: 0, effCm: 0, dur: 200, marker: 'drop' });
        break;
      case 'DROPB_SPD':
        pushMove(idx, -grid.cellCm * 0.4, spd, 'DropB Check', 'line');
        totalMs += 200;
        segments.push({ blockIdx: idx, fx: x, fy: y, fh: h, tx: x, ty: y, th: h, startMs: totalMs - 200, endMs: totalMs, speedCmPs: 0, label: 'DropB Cube', ticks: 0, effCm: 0, dur: 200, marker: 'drop' });
        break;
      case 'DROPF':
      case 'DROPB':
        totalMs += 300;
        segments.push({ blockIdx: idx, fx: x, fy: y, fh: h, tx: x, ty: y, th: h, startMs: totalMs - 300, endMs: totalMs, speedCmPs: 0, label: b.type, ticks: 0, effCm: 0, dur: 300, marker: 'drop' });
        break;
      case 'STOP':
        totalMs += 250;
        segments.push({ blockIdx: idx, fx: x, fy: y, fh: h, tx: x, ty: y, th: h, startMs: totalMs - 250, endMs: totalMs, speedCmPs: 0, label: 'STOP()', ticks: 0, effCm: 0, dur: 250, marker: 'pause' });
        break;
      case 'DELAY': {
        const dMs = Math.max(50, evalExpression(p.ms, vars, 250));
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

export function drawSimulator(state) {
  const canvas = document.getElementById('simCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const grid = getGridConfig();

  const W = canvas.width;
  const H = canvas.height;
  const pad = 26;
  const pxPerCm = Math.min((W - pad * 2) / grid.arenaW, (H - pad * 2) / grid.arenaH);
  const drawW = grid.arenaW * pxPerCm;
  const drawH = grid.arenaH * pxPerCm;
  const offX = (W - drawW) * 0.5;
  const offY = (H - drawH) * 0.5;
  const toPxX = (cm) => offX + cm * pxPerCm;
  const toPxY = (cm) => offY + cm * pxPerCm;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#070b14';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0c1322';
  ctx.fillRect(offX, offY, drawW, drawH);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.07)';
  ctx.lineWidth = 1;
  const subStepCm = grid.cellCm / 3;
  for (let cm = subStepCm; cm < grid.arenaW; cm += subStepCm) {
    const p = toPxX(cm);
    ctx.beginPath(); ctx.moveTo(p, offY); ctx.lineTo(p, offY + drawH); ctx.stroke();
  }
  for (let cm = subStepCm; cm < grid.arenaH; cm += subStepCm) {
    const p = toPxY(cm);
    ctx.beginPath(); ctx.moveTo(offX, p); ctx.lineTo(offX + drawW, p); ctx.stroke();
  }

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
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`${grid.cols}x${grid.rows} (${grid.cellCm}cm/cell = ${grid.arenaW}x${grid.arenaH}cm)`, offX, H - 7);

  const segs = state.sim.segments;
  if (segs.length > 0) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(toPxX(segs[0].fx), toPxY(segs[0].fy));
    for (const seg of segs) ctx.lineTo(toPxX(seg.tx), toPxY(seg.ty));
    ctx.stroke();
    ctx.restore();
  }

  for (let i = 0; i <= state.sim.segIdx && i < segs.length; i++) {
    const seg = segs[i];
    const t = i === state.sim.segIdx ? state.sim.segProgress : 1;
    const cx = seg.fx + (seg.tx - seg.fx) * t;
    const cy = seg.fy + (seg.ty - seg.fy) * t;

    ctx.strokeStyle = seg.marker === 'line' ? '#34d399' : '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(toPxX(seg.fx), toPxY(seg.fy)); ctx.lineTo(toPxX(cx), toPxY(cy)); ctx.stroke();

    if (t >= 0.99 && seg.marker === 'drop') {
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath(); ctx.arc(toPxX(seg.tx), toPxY(seg.ty), 5.5, 0, Math.PI * 2); ctx.fill();
    } else if (t >= 0.99 && seg.marker === 'line') {
      ctx.fillStyle = '#10b981';
      ctx.fillRect(toPxX(seg.tx) - 4, toPxY(seg.ty) - 4, 8, 8);
    }
  }

  const rx = toPxX(state.sim.robotX);
  const ry = toPxY(state.sim.robotY);
  const rad = (state.sim.robotH * Math.PI) / 180;
  const rHalf = Math.max(7, Math.min(20, 7.5 * pxPerCm));

  ctx.save();
  ctx.translate(rx, ry);
  ctx.rotate(rad);
  ctx.fillStyle = '#334155';
  ctx.fillRect(-rHalf - 3, -rHalf + 2, 3, rHalf * 2 - 4);
  ctx.fillRect(rHalf, -rHalf + 2, 3, rHalf * 2 - 4);
  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(-rHalf, -rHalf, rHalf * 2, rHalf * 2, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#10b981';
  ctx.fillRect(-rHalf + 2, -rHalf - 2, rHalf * 2 - 4, 3);
  ctx.fillStyle = '#fde047';
  ctx.beginPath(); ctx.moveTo(0, -rHalf + 3); ctx.lineTo(-4, 4); ctx.lineTo(4, 4); ctx.closePath(); ctx.fill();
  ctx.restore();

  const activeSeg = segs[Math.min(state.sim.segIdx, Math.max(0, segs.length - 1))];
  const normHeading = (((Math.round(state.sim.robotH) % 360) + 360) % 360);
  const stats = state.sim.stats;
  const curSpd = activeSeg && activeSeg.speedCmPs > 0 ? `${activeSeg.speedCmPs.toFixed(1)} cm/s` : '0.0 cm/s';
  const curLabel = activeSeg ? `Step ${Math.min(state.sim.segIdx + 1, segs.length)}/${segs.length}: ${activeSeg.label} · ${curSpd}` : `Ready · ${curSpd}`;
  const elapsedSec = state.sim.elapsedMs / 1000;

  const teleStep = document.getElementById('teleStep');
  const telePose = document.getElementById('telePose');
  const teleClock = document.getElementById('teleClock');
  if (teleStep) teleStep.textContent = curLabel;
  if (telePose) telePose.textContent = `${state.sim.robotX.toFixed(1)}, ${state.sim.robotY.toFixed(1)} cm · ${normHeading}°`;
  if (teleClock) teleClock.textContent = `${stats.calibratedCm.toFixed(1)} cm (${stats.totalTicks} t) · ${elapsedSec.toFixed(2)}s / ${stats.estSec.toFixed(2)}s`;
}
