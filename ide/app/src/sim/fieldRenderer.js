'use strict';

import {
  TILE_BY_ID,
  CUBE_COLOR_META,
  TILE_MARKER_PAD_RATIO,
  TILE_MARKER_SIZE_RATIO,
  normalizeRot,
  getTileSpan,
  getCellOccupancyMap,
  getElevationAtCm
} from './fieldTiles.js';
import { drawArUcoMarker } from './aruco.js';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function getCameraTransformFn(cameraRotDeg, rows, cols) {
  const cam = normalizeRot(cameraRotDeg);
  if (cam === 90) {
    return { vRows: cols, vCols: rows, toVisual: (r, c) => ({ vr: c, vc: rows - 1 - r }) };
  }
  if (cam === 180) {
    return { vRows: rows, vCols: cols, toVisual: (r, c) => ({ vr: rows - 1 - r, vc: cols - 1 - c }) };
  }
  if (cam === 270) {
    return { vRows: cols, vCols: rows, toVisual: (r, c) => ({ vr: cols - 1 - c, vc: r }) };
  }
  return { vRows: rows, vCols: cols, toVisual: (r, c) => ({ vr: r, vc: c }) };
}

function drawLabeledArrow(ctx, x1, y1, x2, y2, color = '#0284c7', lineWidth = 2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;
  const ux = dx / len;
  const uy = dy / len;
  const head = Math.max(4, Math.min(10, len * 0.25));

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ux * head - uy * head * 0.55, y2 - uy * head + ux * head * 0.55);
  ctx.lineTo(x2 - ux * head + uy * head * 0.55, y2 - uy * head - ux * head * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawTunnel2x1Graphic(ctx, x, y, boxW, boxH, rotDeg = 0, options = {}) {
  const rot = normalizeRot(rotDeg);
  const { showMarker = false, forPrint = false, showIdBadge = true } = options;
  const cellS = Math.min(boxW, boxH);
  const w0 = cellS * 2;
  const h0 = cellS;
  const halfW = w0 / 2;
  const halfH = h0 / 2;
  const wallT = Math.max(2, cellS * 0.08);

  ctx.save();
  ctx.translate(x + boxW / 2, y + boxH / 2);
  ctx.rotate((rot * Math.PI) / 180);

  // Base floor inside bounding footprint
  ctx.fillStyle = forPrint ? '#f8fafc' : '#1e293b';
  ctx.fillRect(-halfW, -halfH, w0, h0);

  // Diagonal guide path from Front-Right to Back-Left
  ctx.save();
  ctx.setLineDash([Math.max(3, cellS * 0.05), Math.max(3, cellS * 0.04)]);
  ctx.strokeStyle = forPrint ? '#475569' : '#38bdf8';
  ctx.lineWidth = Math.max(1.2, cellS * 0.025);
  ctx.beginPath();
  ctx.moveTo(halfW * 0.5, halfH * 0.72);
  ctx.lineTo(-halfW * 0.5, -halfH * 0.72);
  ctx.stroke();
  ctx.restore();

  // Roof shading (closed top surface 300x600mm)
  ctx.fillStyle = forPrint ? 'rgba(203, 213, 225, 0.55)' : 'rgba(51, 65, 85, 0.78)';
  ctx.fillRect(-halfW, -halfH, w0, h0);

  // Outer closed side walls & half-closed portals
  ctx.fillStyle = forPrint ? '#0f172a' : '#0b1220';
  ctx.strokeStyle = forPrint ? '#000000' : '#64748b';
  ctx.lineWidth = Math.max(1, cellS * 0.015);
  // Left closed wall
  ctx.fillRect(-halfW, -halfH, wallT, h0);
  // Right closed wall
  ctx.fillRect(halfW - wallT, -halfH, wallT, h0);
  // Back-right closed wall (u in [halfW..w0])
  ctx.fillRect(0, -halfH, halfW, wallT);
  // Front-left closed wall (u in [0..halfW])
  ctx.fillRect(-halfW, halfH - wallT, halfW, wallT);

  // Portal indicators: Front-Right Entry, Back-Left Exit
  ctx.fillStyle = '#10b981';
  ctx.fillRect(0, halfH - wallT * 0.75, halfW - wallT, wallT * 0.75);
  drawLabeledArrow(ctx, halfW * 0.5, halfH * 0.92, halfW * 0.5, halfH * 0.42, '#10b981', Math.max(1.5, cellS * 0.03));

  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(-halfW + wallT, -halfH, halfW - wallT, wallT * 0.75);
  drawLabeledArrow(ctx, -halfW * 0.5, -halfH * 0.42, -halfW * 0.5, -halfH * 0.92, '#f59e0b', Math.max(1.5, cellS * 0.03));

  if (cellS >= 38) {
    ctx.fillStyle = forPrint ? '#0f172a' : '#e2e8f0';
    ctx.font = `700 ${Math.max(8, Math.round(cellS * 0.11))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TUNNEL 2×1', 0, -cellS * 0.06);
    ctx.font = `600 ${Math.max(7, Math.round(cellS * 0.085))}px sans-serif`;
    ctx.fillStyle = forPrint ? '#334155' : '#94a3b8';
    ctx.fillText('เข้าหน้าขวา → ออกหลังซ้าย', 0, cellS * 0.12);
  }

  // Border outline
  ctx.strokeStyle = forPrint ? '#000000' : '#94a3b8';
  ctx.lineWidth = Math.max(1, cellS * 0.02);
  ctx.strokeRect(-halfW, -halfH, w0, h0);

  if (showMarker) {
    const mSize = cellS * TILE_MARKER_SIZE_RATIO;
    const mPad = cellS * TILE_MARKER_PAD_RATIO;
    drawArUcoMarker(ctx, 33, -halfW + mPad, -halfH + mPad, mSize);
  }

  if (showIdBadge && cellS >= 28) {
    const fs = Math.max(7, Math.round(cellS * 0.11));
    ctx.font = `700 ${fs}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = forPrint ? '#0f172a' : '#cbd5e1';
    ctx.fillText('#33', -halfW + wallT + cellS * 0.03, halfH - wallT - cellS * 0.02);
  }

  ctx.restore();
}

export function drawStandardTileGraphic(ctx, tileId, x, y, size, rotDeg = 0, options = {}) {
  const tile = TILE_BY_ID[Number(tileId)];
  if (!tile || size <= 0) return;
  const rot = normalizeRot(rotDeg);
  const {
    showMarker = false,
    forPrint = false,
    showIdBadge = true,
    isCatalogPreview = false
  } = options;

  if (tile.tunnel && !isCatalogPreview && options.span2Box) {
    drawTunnel2x1Graphic(ctx, x, y, options.span2Box.w, options.span2Box.h, rot, options);
    return;
  }

  const half = size / 2;
  const wallW = Math.max(2, size * 0.1);
  const cornerSz = size * 0.14;

  ctx.save();
  ctx.translate(x + half, y + half);
  ctx.rotate((rot * Math.PI) / 180);

  // 1. Base surface
  if (tile.special === 'start') {
    ctx.fillStyle = '#dc2626';
  } else if (tile.special === 'finish') {
    ctx.fillStyle = '#0284c7';
  } else if (tile.bridgeDeck) {
    ctx.fillStyle = forPrint ? '#f1f5f9' : '#e2e8f0';
  } else if (tile.seesaw) {
    ctx.fillStyle = forPrint ? '#f8fafc' : '#e2e8f0';
  } else {
    ctx.fillStyle = '#ffffff';
  }
  ctx.fillRect(-half, -half, size, size);

  // 2. Special feature layers
  if (tile.bridgeRamp) {
    const grad = ctx.createLinearGradient(0, half, 0, -half);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = grad;
    ctx.fillRect(-half, -half, size, size);
    drawLabeledArrow(ctx, 0, half * 0.55, 0, -half * 0.55, '#0284c7', Math.max(1.5, size * 0.04));
    if (size >= 36) {
      ctx.fillStyle = '#0f172a';
      ctx.font = `700 ${Math.max(7, Math.round(size * 0.1))}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('50mm', 0, -half + size * 0.2);
      ctx.textBaseline = 'top';
      ctx.fillText('5mm', 0, half - size * 0.2);
    }
  }

  if (tile.bridgeDeck) {
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.strokeRect(-half + size * 0.08, -half + size * 0.08, size * 0.84, size * 0.84);
    if (size >= 36) {
      ctx.fillStyle = '#334155';
      ctx.font = `700 ${Math.max(7, Math.round(size * 0.11))}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('50mm', 0, 0);
    }
  }

  if (tile.chopsticks) {
    const count = tile.chopsticks.count;
    const step = (size * 0.72) / (count - 1);
    const barH = Math.max(1.5, size * 0.038);
    for (let i = 0; i < count; i++) {
      const cy = -size * 0.36 + i * step;
      ctx.fillStyle = '#b45309';
      ctx.fillRect(-half + size * 0.08, cy - barH / 2, size * 0.84, barH);
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(-half + size * 0.08, cy - barH / 2, size * 0.84, barH * 0.35);
    }
  }

  if (tile.centerBlackBand) {
    const bandW = size * tile.centerBlackBand.widthRatio;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-bandW / 2, -half, bandW, size);
  }

  if (tile.cubeDrop) {
    const meta = CUBE_COLOR_META[tile.cubeDrop.color] || CUBE_COLOR_META.green;
    ctx.fillStyle = meta.hex;
    if (tile.cubeDrop.style === 'enclosed3') {
      ctx.fillRect(-half, -half, size, wallW + size * 0.45);
    } else {
      const zoneH = size * 0.4;
      ctx.fillRect(-half, half - wallW - zoneH, size, zoneH + wallW);
    }
  }

  if (tile.elevatedCube) {
    const meta = CUBE_COLOR_META[tile.elevatedCube.color] || CUBE_COLOR_META.green;
    // Upper 15x30cm color half
    ctx.fillStyle = meta.hex;
    ctx.fillRect(-half, -half, size, half);
    // Thin 2mm scaled enclosure walls on top, left, right (3 sides)
    const encT = Math.max(2, size * 0.055);
    ctx.fillStyle = meta.dark;
    ctx.fillRect(-half, -half, size, encT);
    ctx.fillRect(-half, -half, encT, half);
    ctx.fillRect(half - encT, -half, encT, half);
    if (size >= 36) {
      ctx.fillStyle = '#0f172a';
      ctx.font = `700 ${Math.max(7, Math.round(size * 0.095))}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('50mm', 0, size * 0.22);
    }
  }

  if (tile.seesaw) {
    const grad = ctx.createLinearGradient(0, half, 0, -half);
    grad.addColorStop(0, '#f8fafc');
    grad.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = grad;
    ctx.fillRect(-half, -half, size, size);
    // Blue side rails
    const railW = Math.max(2, size * 0.07);
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(-half, -half, railW, size);
    ctx.fillRect(half - railW, -half, railW, size);
    // Pivot line across center
    ctx.fillStyle = '#334155';
    ctx.fillRect(-half + railW, -size * 0.025, size - railW * 2, size * 0.05);
    drawLabeledArrow(ctx, 0, half * 0.55, 0, -half * 0.55, '#1d4ed8', Math.max(1.5, size * 0.035));
    if (size >= 36) {
      ctx.fillStyle = '#1e3a8a';
      ctx.font = `700 ${Math.max(7, Math.round(size * 0.095))}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('12° 70mm', 0, -half + size * 0.22);
    }
  }

  if (tile.tunnel && isCatalogPreview) {
    // Compact 2:1 graphic inside 1x1 catalog thumbnail
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-half + size * 0.08, -size * 0.26, size * 0.84, size * 0.52);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = Math.max(1, size * 0.025);
    ctx.strokeRect(-half + size * 0.08, -size * 0.26, size * 0.84, size * 0.52);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(0, size * 0.2, size * 0.4, size * 0.06);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-size * 0.4, -size * 0.26, size * 0.4, size * 0.06);
    ctx.fillStyle = '#f1f5f9';
    ctx.font = `700 ${Math.max(7, Math.round(size * 0.13))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('2×1 TUNNEL', 0, 0);
  }

  // 3. Black walls (impassable line-check borders)
  if (!tile.elevatedCube) {
    ctx.fillStyle = '#000000';
    if (tile.walls?.top) ctx.fillRect(-half, -half, size, wallW);
    if (tile.walls?.bottom) ctx.fillRect(-half, half - wallW, size, wallW);
    if (tile.walls?.left) ctx.fillRect(-half, -half, wallW, size);
    if (tile.walls?.right) ctx.fillRect(half - wallW, -half, wallW, size);
  }

  // 4. Inner corner squares
  ctx.fillStyle = '#000000';
  if (tile.cornerDots?.tl) ctx.fillRect(-half, -half, cornerSz, cornerSz);
  if (tile.cornerDots?.tr) ctx.fillRect(half - cornerSz, -half, cornerSz, cornerSz);
  if (tile.cornerDots?.br) ctx.fillRect(half - cornerSz, half - cornerSz, cornerSz, cornerSz);
  if (tile.cornerDots?.bl) ctx.fillRect(-half, half - cornerSz, cornerSz, cornerSz);

  // 5. Yellow Check Point (25% circle)
  if (tile.checkpoint) {
    const r = size * (tile.checkpoint.diameterRatio || 0.25) * 0.5;
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = Math.max(1, size * 0.02);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // 6. START / FINISH text
  if (tile.special === 'start' || tile.special === 'finish') {
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.max(8, Math.round(size * 0.17))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tile.special === 'start' ? 'START' : 'FINISH', 0, 0);
  }

  // 7. Outer hairline grid border
  ctx.strokeStyle = forPrint ? '#94a3b8' : 'rgba(15, 23, 42, 0.35)';
  ctx.lineWidth = Math.max(0.75, size * 0.012);
  ctx.strokeRect(-half, -half, size, size);

  // 8. Top-Left ArUco Marker (avoids center checkpoint & bottom-left #ID)
  if (showMarker && !isCatalogPreview) {
    const mSize = size * TILE_MARKER_SIZE_RATIO;
    const mPad = size * TILE_MARKER_PAD_RATIO;
    drawArUcoMarker(ctx, tile.id, -half + mPad, -half + mPad, mSize);
  }

  // 9. Bottom-left #ID badge
  if (showIdBadge && size >= 26 && !isCatalogPreview) {
    const fs = Math.max(7, Math.round(size * 0.11));
    ctx.font = `700 ${fs}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = tile.special ? '#ffffff' : tile.centerBlackBand ? '#cbd5e1' : '#334155';
    ctx.fillText(`#${tile.id}`, -half + size * 0.06, half - size * 0.05);
  }

  ctx.restore();
}

function sampleSegmentPoints(seg, tMax = 1) {
  const tEnd = Math.max(0, Math.min(1, Number(tMax) || 0));
  if (!seg.arc || tEnd <= 0) {
    return [
      { x: seg.fx, y: seg.fy },
      { x: seg.fx + (seg.tx - seg.fx) * tEnd, y: seg.fy + (seg.ty - seg.fy) * tEnd }
    ];
  }
  const sweepDeg = (seg.th - seg.fh) * tEnd;
  const steps = Math.max(6, Math.ceil(Math.abs(sweepDeg) / 5));
  const pts = [{ x: seg.fx, y: seg.fy }];
  for (let i = 1; i <= steps; i++) {
    const h = seg.fh + sweepDeg * (i / steps);
    const rad = (h * Math.PI) / 180;
    pts.push({
      x: seg.arc.cx - seg.arc.s * seg.arc.r * Math.cos(rad),
      y: seg.arc.cy - seg.arc.s * seg.arc.r * Math.sin(rad)
    });
  }
  return pts;
}

export function render2DFieldGrid(canvas, gridData, options = {}) {
  if (!canvas || !Array.isArray(gridData) || gridData.length === 0) return null;
  const ctx = canvas.getContext('2d');
  const rows = gridData.length;
  const cols = gridData[0]?.length || 1;
  const {
    showMarkers = false,
    hoverCell = null,
    hoverTileId = null,
    hoverRot = 0,
    hoverValid = true,
    selectedCell = null,
    simOverlay = null,
    cameraFollowRobot = false,
    padding = 26,
    bgColor = '#070b14'
  } = options;

  const W = canvas.width;
  const H = canvas.height;
  const followCam = Boolean(
    cameraFollowRobot &&
    simOverlay &&
    Number.isFinite(simOverlay.robotX) &&
    Number.isFinite(simOverlay.robotY)
  );
  const baseCellPx = Math.min((W - padding * 2) / cols, (H - padding * 2) / rows);
  const cellPx = followCam
    ? Math.max(baseCellPx * 1.4, Math.min(92, Math.min(W, H) / 4.2))
    : baseCellPx;
  const gridW = cols * cellPx;
  const gridH = rows * cellPx;
  const offX = followCam ? 0 : (W - gridW) * 0.5;
  const offY = followCam ? 0 : (H - gridH) * 0.5;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  if (followCam) {
    const pxPerCmCam = cellPx / (simOverlay.tileWidthCm || 30);
    const rxWorld = simOverlay.robotX * pxPerCmCam;
    const ryWorld = simOverlay.robotY * pxPerCmCam;
    const camRad = ((simOverlay.robotH || 0) * Math.PI) / 180;
    ctx.translate(W * 0.5, H * 0.5);
    ctx.rotate(-camRad);
    ctx.translate(-rxWorld, -ryWorld);
  }

  ctx.fillStyle = '#0c1322';
  ctx.fillRect(offX, offY, gridW, gridH);

  const occ = getCellOccupancyMap(gridData);

  // Empty cell backgrounds first
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!occ[`${r},${c}`]) {
        const cx = offX + c * cellPx;
        const cy = offY + r * cellPx;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(cx, cy, cellPx, cellPx);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, cy, cellPx, cellPx);
      }
    }
  }

  // Placed tiles (anchors draw full 1x1 or 2x1 footprint)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const info = occ[`${r},${c}`];
      if (!info || !info.isAnchor) continue;
      const cx = offX + c * cellPx;
      const cy = offY + r * cellPx;
      if (info.rowSpan > 1 || info.colSpan > 1) {
        drawTunnel2x1Graphic(ctx, cx, cy, info.colSpan * cellPx, info.rowSpan * cellPx, info.cell.rot, {
          showMarker: showMarkers,
          forPrint: false,
          showIdBadge: cellPx >= 32
        });
      } else {
        drawStandardTileGraphic(ctx, info.cell.tileId, cx, cy, cellPx, info.cell.rot, {
          showMarker: showMarkers,
          forPrint: false,
          showIdBadge: cellPx >= 28
        });
      }
    }
  }

  // Hover ghost preview
  if (hoverCell && hoverTileId && hoverCell.r >= 0 && hoverCell.c >= 0 && hoverCell.r < rows && hoverCell.c < cols) {
    const span = getTileSpan(hoverTileId, hoverRot);
    const gx = offX + hoverCell.c * cellPx;
    const gy = offY + hoverCell.r * cellPx;
    const gw = span.colSpan * cellPx;
    const gh = span.rowSpan * cellPx;
    ctx.save();
    ctx.globalAlpha = 0.65;
    if (span.rowSpan > 1 || span.colSpan > 1) {
      drawTunnel2x1Graphic(ctx, gx, gy, gw, gh, hoverRot, { showMarker: false, showIdBadge: false });
    } else {
      drawStandardTileGraphic(ctx, hoverTileId, gx, gy, cellPx, hoverRot, { showMarker: false, showIdBadge: false });
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = hoverValid ? '#10b981' : '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(gx + 1, gy + 1, gw - 2, gh - 2);
    ctx.restore();
  }

  // Selected cell highlight
  if (selectedCell) {
    const info = occ[`${selectedCell.r},${selectedCell.c}`];
    const ar = info ? info.anchorR : selectedCell.r;
    const ac = info ? info.anchorC : selectedCell.c;
    const sw = info ? info.colSpan * cellPx : cellPx;
    const sh = info ? info.rowSpan * cellPx : cellPx;
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(offX + ac * cellPx + 1, offY + ar * cellPx + 1, sw - 2, sh - 2);
    ctx.restore();
  }

  // Grid indices & outer frame
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  for (let c = 0; c < cols; c++) {
    ctx.fillText(String(c), offX + c * cellPx + 4, offY - 4);
  }
  ctx.textBaseline = 'top';
  for (let r = 0; r < rows; r++) {
    ctx.fillText(String(r), offX - 16, offY + r * cellPx + 4);
  }

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.6;
  ctx.strokeRect(offX, offY, gridW, gridH);

  // Optional simulation path + robot overlay
  if (simOverlay) {
    const { tileWidthCm = 30, segments = [], segIdx = 0, segProgress = 0, robotX, robotY, robotH } = simOverlay;
    const pxPerCm = cellPx / tileWidthCm;
    const toPxX = (cm) => offX + cm * pxPerCm;
    const toPxY = (cm) => offY + cm * pxPerCm;

    if (segments.length > 0) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(toPxX(segments[0].fx), toPxY(segments[0].fy));
      for (const seg of segments) {
        const pts = sampleSegmentPoints(seg, 1);
        for (let k = 1; k < pts.length; k++) {
          ctx.lineTo(toPxX(pts[k].x), toPxY(pts[k].y));
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    for (let i = 0; i <= segIdx && i < segments.length; i++) {
      const seg = segments[i];
      const t = i === segIdx ? segProgress : 1;
      const pts = sampleSegmentPoints(seg, t);
      ctx.strokeStyle = seg.marker === 'line' ? '#34d399' : (seg.arc ? '#38bdf8' : '#0284c7');
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(toPxX(pts[0].x), toPxY(pts[0].y));
      for (let k = 1; k < pts.length; k++) {
        ctx.lineTo(toPxX(pts[k].x), toPxY(pts[k].y));
      }
      ctx.stroke();

      if (t >= 0.99 && seg.marker === 'drop') {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(toPxX(seg.tx), toPxY(seg.ty), 5.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (t >= 0.99 && seg.marker === 'line') {
        ctx.fillStyle = '#10b981';
        ctx.fillRect(toPxX(seg.tx) - 4, toPxY(seg.ty) - 4, 8, 8);
      }
    }

    // Close follow-cam world transform before drawing screen-locked robot
    ctx.restore();

    if (Number.isFinite(robotX) && Number.isFinite(robotY)) {
      const rx = followCam ? W * 0.5 : toPxX(robotX);
      const ry = followCam ? H * 0.5 : toPxY(robotY);
      const rad = followCam ? 0 : ((robotH || 0) * Math.PI) / 180;
      const rHalf = Math.max(7, Math.min(20, 7.5 * pxPerCm));

      if (followCam) {
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(rx, ry, rHalf + 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(rad);
      ctx.fillStyle = '#334155';
      ctx.fillRect(-rHalf - 3, -rHalf + 2, 3, rHalf * 2 - 4);
      ctx.fillRect(rHalf, -rHalf + 2, 3, rHalf * 2 - 4);
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-rHalf, -rHalf, rHalf * 2, rHalf * 2, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#10b981';
      ctx.fillRect(-rHalf + 2, -rHalf - 2, rHalf * 2 - 4, 3);
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.moveTo(0, -rHalf + 3);
      ctx.lineTo(-4, 4);
      ctx.lineTo(4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  } else {
    ctx.restore();
  }

  if (followCam) {
    drawFollowCamHud(ctx, W, simOverlay?.robotH || 0);
  }

  return { offX, offY, cellPx, gridW, gridH };
}

function drawFollowCamHud(ctx, canvasWidth, headingDeg = 0) {
  const cx = canvasWidth - 36;
  const cy = 30;
  const rad = (-((headingDeg || 0) * Math.PI)) / 180;

  ctx.save();
  // Translucent backdrop circle + LOCK pill
  ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // North tick rotates opposite to robot heading so North stays accurate on screen
  const nx = cx + Math.sin(rad) * 11;
  const ny = cy - Math.cos(rad) * 11;
  const sx = cx - Math.sin(rad) * 9;
  const sy = cy + Math.cos(rad) * 9;
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(sx, sy);
  ctx.stroke();

  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(nx, ny);
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 8px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', nx + Math.sin(rad) * 4.5, ny - Math.cos(rad) * 4.5);

  ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.65)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(cx - 21, cy + 21, 42, 14, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#34d399';
  ctx.font = '700 8px "JetBrains Mono", monospace';
  ctx.fillText('LOCK', cx, cy + 28.5);
  ctx.restore();
}

// ============================================================================
// 3D Isometric Projection Engine (1:1 Physical Millimeter Proportions)
// ============================================================================
function fillPoly(ctx, pts, fill, stroke = null, lineWidth = 0.8) {
  if (!pts || pts.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawIsoBox(ctx, proj, vc0, vr0, vc1, vr1, z0, z1, colors) {
  const b00 = proj(vc0, vr0, z0);
  const b10 = proj(vc1, vr0, z0);
  const b11 = proj(vc1, vr1, z0);
  const b01 = proj(vc0, vr1, z0);

  const t00 = proj(vc0, vr0, z1);
  const t10 = proj(vc1, vr0, z1);
  const t11 = proj(vc1, vr1, z1);
  const t01 = proj(vc0, vr1, z1);

  const edge = colors.stroke || 'rgba(15, 23, 42, 0.35)';
  // Front-left face (vr = vr1)
  fillPoly(ctx, [t01, t11, b11, b01], colors.left || '#94a3b8', edge);
  // Front-right face (vc = vc1)
  fillPoly(ctx, [t10, t11, b11, b10], colors.right || '#64748b', edge);
  // Top face (z = z1)
  fillPoly(ctx, [t00, t10, t11, t01], colors.top || '#f8fafc', edge);
}

function rotatePointInUnit(u, v, rotDeg) {
  const r = normalizeRot(rotDeg);
  if (r === 90) return { u: 1 - v, v: u };
  if (r === 180) return { u: 1 - u, v: 1 - v };
  if (r === 270) return { u: v, v: 1 - u };
  return { u, v };
}

function drawIsoUnitRect(ctx, proj, vc, vr, u0, v0, u1, v1, zMm, rotDeg, fill, stroke = null) {
  const p00 = rotatePointInUnit(u0, v0, rotDeg);
  const p10 = rotatePointInUnit(u1, v0, rotDeg);
  const p11 = rotatePointInUnit(u1, v1, rotDeg);
  const p01 = rotatePointInUnit(u0, v1, rotDeg);
  fillPoly(
    ctx,
    [
      proj(vc + p00.u, vr + p00.v, zMm),
      proj(vc + p10.u, vr + p10.v, zMm),
      proj(vc + p11.u, vr + p11.v, zMm),
      proj(vc + p01.u, vr + p01.v, zMm)
    ],
    fill,
    stroke
  );
}

function drawIsoStandardTopSurface(ctx, proj, tile, vc, vr, zTop, effRot) {
  // Draw walls (impassable lines)
  if (!tile.elevatedCube && tile.walls) {
    const w = 0.1;
    if (tile.walls.top) drawIsoUnitRect(ctx, proj, vc, vr, 0, 0, 1, w, zTop, effRot, '#0f172a');
    if (tile.walls.bottom) drawIsoUnitRect(ctx, proj, vc, vr, 0, 1 - w, 1, 1, zTop, effRot, '#0f172a');
    if (tile.walls.left) drawIsoUnitRect(ctx, proj, vc, vr, 0, 0, w, 1, zTop, effRot, '#0f172a');
    if (tile.walls.right) drawIsoUnitRect(ctx, proj, vc, vr, 1 - w, 0, 1, 1, zTop, effRot, '#0f172a');
  }

  // Corner dots
  if (tile.cornerDots) {
    const cs = 0.14;
    if (tile.cornerDots.tl) drawIsoUnitRect(ctx, proj, vc, vr, 0, 0, cs, cs, zTop, effRot, '#0f172a');
    if (tile.cornerDots.tr) drawIsoUnitRect(ctx, proj, vc, vr, 1 - cs, 0, 1, cs, zTop, effRot, '#0f172a');
    if (tile.cornerDots.br) drawIsoUnitRect(ctx, proj, vc, vr, 1 - cs, 1 - cs, 1, 1, zTop, effRot, '#0f172a');
    if (tile.cornerDots.bl) drawIsoUnitRect(ctx, proj, vc, vr, 0, 1 - cs, cs, 1, zTop, effRot, '#0f172a');
  }

  // Center black band (56%)
  if (tile.centerBlackBand) {
    const bw = tile.centerBlackBand.widthRatio;
    drawIsoUnitRect(ctx, proj, vc, vr, 0.5 - bw / 2, 0, 0.5 + bw / 2, 1, zTop, effRot, '#0f172a');
  }

  // Ground cube drop
  if (tile.cubeDrop) {
    const meta = CUBE_COLOR_META[tile.cubeDrop.color] || CUBE_COLOR_META.green;
    if (tile.cubeDrop.style === 'enclosed3') {
      drawIsoUnitRect(ctx, proj, vc, vr, 0.1, 0.1, 0.9, 0.55, zTop, effRot, meta.hex);
    } else {
      drawIsoUnitRect(ctx, proj, vc, vr, 0, 0.5, 1, 0.9, zTop, effRot, meta.hex);
    }
  }

  // Yellow checkpoint circle (projected ellipse approximation)
  if (tile.checkpoint) {
    const r = (tile.checkpoint.diameterRatio || 0.25) * 0.5;
    const pts = [];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      pts.push(proj(vc + 0.5 + Math.cos(a) * r, vr + 0.5 + Math.sin(a) * r, zTop));
    }
    fillPoly(ctx, pts, '#facc15', '#ca8a04', 1);
  }

  // Chopsticks (7 raised 3D bars +5.5mm)
  if (tile.chopsticks) {
    const count = tile.chopsticks.count;
    const bars = [];
    for (let i = 0; i < count; i++) {
      const vBar = 0.14 + (i / (count - 1)) * 0.72;
      const mid = rotatePointInUnit(0.5, vBar, effRot);
      bars.push({ vBar, depth: mid.u + mid.v });
    }
    bars.sort((a, b) => a.depth - b.depth);
    for (const bar of bars) {
      const a0 = rotatePointInUnit(0.08, bar.vBar - 0.018, effRot);
      const a1 = rotatePointInUnit(0.92, bar.vBar + 0.018, effRot);
      const minU = Math.min(a0.u, a1.u);
      const maxU = Math.max(a0.u, a1.u);
      const minV = Math.min(a0.v, a1.v);
      const maxV = Math.max(a0.v, a1.v);
      drawIsoBox(ctx, proj, vc + minU, vr + minV, vc + maxU, vr + maxV, zTop, zTop + tile.chopsticks.heightMm, {
        top: '#fde68a',
        left: '#d97706',
        right: '#b45309',
        stroke: '#78350f'
      });
    }
  }

  // START / FINISH text label
  if (tile.special === 'start' || tile.special === 'finish') {
    const c = proj(vc + 0.5, vr + 0.5, zTop + 1);
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tile.special === 'start' ? 'START' : 'FINISH', c.x, c.y);
    ctx.restore();
  }
}

function drawIsoBridgeRamp(ctx, proj, vc, vr, effRot) {
  const zLow = 5;
  const zHigh = 50;
  // Map unit corners at effRot=0: bottom(v=1) is zLow, top(v=0) is zHigh
  const heightAt = (u0, v0) => zHigh - v0 * (zHigh - zLow);

  const p00 = rotatePointInUnit(0, 0, effRot);
  const p10 = rotatePointInUnit(1, 0, effRot);
  const p11 = rotatePointInUnit(1, 1, effRot);
  const p01 = rotatePointInUnit(0, 1, effRot);

  const z00 = heightAt(0, 0);
  const z10 = heightAt(1, 0);
  const z11 = heightAt(1, 1);
  const z01 = heightAt(0, 1);

  const corners = [
    { ...p00, z: z00 },
    { ...p10, z: z10 },
    { ...p11, z: z11 },
    { ...p01, z: z01 }
  ];

  // Draw visible side faces (front edges with larger vc+vr)
  const edges = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]]
  ];
  edges.sort((a, b) => (a[0].u + a[0].v + a[1].u + a[1].v) - (b[0].u + b[0].v + b[1].u + b[1].v));

  for (const [e0, e1] of edges) {
    const midDepth = (e0.u + e0.v + e1.u + e1.v) * 0.5;
    if (midDepth >= 0.99) {
      fillPoly(
        ctx,
        [
          proj(vc + e0.u, vr + e0.v, e0.z),
          proj(vc + e1.u, vr + e1.v, e1.z),
          proj(vc + e1.u, vr + e1.v, 0),
          proj(vc + e0.u, vr + e0.v, 0)
        ],
        Math.abs(e0.u - e1.u) > Math.abs(e0.v - e1.v) ? '#94a3b8' : '#64748b',
        'rgba(15,23,42,0.4)'
      );
    }
  }

  // Ramp top surface
  fillPoly(
    ctx,
    corners.map((pt) => proj(vc + pt.u, vr + pt.v, pt.z)),
    '#e2e8f0',
    'rgba(15,23,42,0.45)'
  );
  // Directional accent line on ramp
  const sPt = rotatePointInUnit(0.5, 0.82, effRot);
  const ePt = rotatePointInUnit(0.5, 0.18, effRot);
  const sp = proj(vc + sPt.u, vr + sPt.v, zLow + 0.18 * (zHigh - zLow));
  const ep = proj(vc + ePt.u, vr + ePt.v, zLow + 0.82 * (zHigh - zLow));
  drawLabeledArrow(ctx, sp.x, sp.y, ep.x, ep.y, '#0284c7', 1.8);
}

function drawIsoElevatedCubePlatform(ctx, proj, tile, vc, vr, effRot) {
  const meta = CUBE_COLOR_META[tile.elevatedCube.color] || CUBE_COLOR_META.green;
  const deckZ = tile.elevatedCube.deckHeightMm; // 50mm
  const totalZ = tile.elevatedCube.totalHeightMm; // 100mm

  // 1. Raised 50mm solid deck
  drawIsoBox(ctx, proj, vc, vr, vc + 1, vr + 1, 0, deckZ, {
    top: '#ffffff',
    left: '#94a3b8',
    right: '#64748b'
  });

  // 2. Colored 15x30cm drop half on the deck
  drawIsoUnitRect(ctx, proj, vc, vr, 0, 0, 1, 0.5, deckZ, effRot, meta.hex);

  // 3. 3 enclosing thin walls (2mm scaled cleanly to visible wall) rising +50mm to 100mm
  const t = 0.04;
  const wallBoxes = [
    { name: 'top', u0: 0, v0: 0, u1: 1, v1: t },
    { name: 'left', u0: 0, v0: 0, u1: t, v1: 0.5 },
    { name: 'right', u0: 1 - t, v0: 0, u1: 1, v1: 0.5 }
  ].map((wb) => {
    const pA = rotatePointInUnit(wb.u0, wb.v0, effRot);
    const pB = rotatePointInUnit(wb.u1, wb.v1, effRot);
    const minU = Math.min(pA.u, pB.u);
    const maxU = Math.max(pA.u, pB.u);
    const minV = Math.min(pA.v, pB.v);
    const maxV = Math.max(pA.v, pB.v);
    return { minU, maxU, minV, maxV, depth: (minU + maxU + minV + maxV) * 0.5 };
  });

  wallBoxes.sort((a, b) => a.depth - b.depth);
  for (const w of wallBoxes) {
    drawIsoBox(ctx, proj, vc + w.minU, vr + w.minV, vc + w.maxU, vr + w.maxV, deckZ, totalZ, {
      top: meta.light,
      left: meta.hex,
      right: meta.dark,
      stroke: 'rgba(15,23,42,0.55)'
    });
  }
}

function drawIsoSeesaw(ctx, proj, tile, vc, vr, effRot) {
  const s = tile.seesaw;
  // Base contact plate
  drawIsoBox(ctx, proj, vc, vr, vc + 1, vr + 1, 0, 3, {
    top: '#334155',
    left: '#1e293b',
    right: '#0f172a'
  });

  // Cylindrical pivot rod Ø15mm at z=40mm
  const pivL = rotatePointInUnit(0.08, 0.5, effRot);
  const pivR = rotatePointInUnit(0.92, 0.5, effRot);
  const p0 = proj(vc + pivL.u, vr + pivL.v, s.pivotHeightMm);
  const p1 = proj(vc + pivR.u, vr + pivR.v, s.pivotHeightMm);
  const p0Base = proj(vc + 0.5, vr + 0.5, 3);
  const p0Top = proj(vc + 0.5, vr + 0.5, s.pivotHeightMm);
  ctx.save();
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(p0Base.x, p0Base.y);
  ctx.lineTo(p0Top.x, p0Top.y);
  ctx.stroke();
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.stroke();
  ctx.restore();

  // Tilted 3mm board from 0mm (v=1) to 70mm (v=0)
  const zAt = (v0) => s.lowEndMm + (1 - v0) * (s.highEndMm - s.lowEndMm);
  const corners = [
    { ...rotatePointInUnit(0, 0, effRot), z: zAt(0) },
    { ...rotatePointInUnit(1, 0, effRot), z: zAt(0) },
    { ...rotatePointInUnit(1, 1, effRot), z: zAt(1) },
    { ...rotatePointInUnit(0, 1, effRot), z: zAt(1) }
  ];
  fillPoly(
    ctx,
    corners.map((c) => proj(vc + c.u, vr + c.v, c.z)),
    '#e2e8f0',
    'rgba(15,23,42,0.55)'
  );

  // Two blue side rails (20mm tall above board) sorted back-to-front
  const rails = [
    { u0: 0, u1: 0.045 },
    { u0: 0.955, u1: 1 }
  ].map((rb) => {
    const mid = rotatePointInUnit((rb.u0 + rb.u1) * 0.5, 0.5, effRot);
    return { ...rb, depth: mid.u + mid.v };
  });
  rails.sort((a, b) => a.depth - b.depth);

  for (const rb of rails) {
    const a = rotatePointInUnit(rb.u0, 0, effRot);
    const b = rotatePointInUnit(rb.u1, 0, effRot);
    const c = rotatePointInUnit(rb.u1, 1, effRot);
    const d = rotatePointInUnit(rb.u0, 1, effRot);
    const zH = zAt(0);
    const zL = zAt(1);
    const rH = s.railHeightMm;

    const railSides = [
      { p0: a, p1: d, z0: zH, z1: zL, color: '#1d4ed8' },
      { p0: b, p1: c, z0: zH, z1: zL, color: '#1e40af' },
      { p0: c, p1: d, z0: zL, z1: zL, color: '#1d4ed8' },
      { p0: a, p1: b, z0: zH, z1: zH, color: '#1e40af' }
    ].map((sf) => ({
      ...sf,
      depth: (sf.p0.u + sf.p0.v + sf.p1.u + sf.p1.v) * 0.5
    }));
    railSides.sort((x, y) => x.depth - y.depth);

    for (const sf of railSides) {
      fillPoly(
        ctx,
        [
          proj(vc + sf.p0.u, vr + sf.p0.v, sf.z0 + rH),
          proj(vc + sf.p1.u, vr + sf.p1.v, sf.z1 + rH),
          proj(vc + sf.p1.u, vr + sf.p1.v, sf.z1),
          proj(vc + sf.p0.u, vr + sf.p0.v, sf.z0)
        ],
        sf.color,
        '#1e3a8a'
      );
    }

    fillPoly(
      ctx,
      [
        proj(vc + a.u, vr + a.v, zH + rH),
        proj(vc + b.u, vr + b.v, zH + rH),
        proj(vc + c.u, vr + c.v, zL + rH),
        proj(vc + d.u, vr + d.v, zL + rH)
      ],
      '#3b82f6',
      '#1e3a8a'
    );
  }
}

function mapTunnelPt(u0, v0, effRot) {
  const r = normalizeRot(effRot);
  if (r === 90) return { vcL: 1 - v0, vrL: u0 };
  if (r === 180) return { vcL: 2 - u0, vrL: 1 - v0 };
  if (r === 270) return { vcL: v0, vrL: 2 - u0 };
  return { vcL: u0, vrL: v0 };
}

function drawTunnel3D(ctx, proj, originC, originR, rot, tunnelTransparent, calcDepth) {
  const H = 300; // 300mm real height
  const baseZ = 5;

  // Floor inside tunnel
  const fl0 = mapTunnelPt(0, 0, rot);
  const fl1 = mapTunnelPt(2, 0, rot);
  const fl2 = mapTunnelPt(2, 1, rot);
  const fl3 = mapTunnelPt(0, 1, rot);
  fillPoly(
    ctx,
    [
      proj(originC + fl0.vcL, originR + fl0.vrL, baseZ),
      proj(originC + fl1.vcL, originR + fl1.vrL, baseZ),
      proj(originC + fl2.vcL, originR + fl2.vrL, baseZ),
      proj(originC + fl3.vcL, originR + fl3.vrL, baseZ)
    ],
    '#cbd5e1',
    '#475569'
  );

  // Diagonal entry (Front-Right) -> exit (Back-Left) guide line on floor
  const eIn = mapTunnelPt(1.5, 0.9, rot);
  const eOut = mapTunnelPt(0.5, 0.1, rot);
  const pi = proj(originC + eIn.vcL, originR + eIn.vrL, baseZ + 2);
  const po = proj(originC + eOut.vcL, originR + eOut.vrL, baseZ + 2);
  drawLabeledArrow(ctx, pi.x, pi.y, po.x, po.y, '#10b981', 2.2);

  // Solid walls & portal header lintels (leaving Front-Right [1..2, v=1] and Back-Left [0..1, v=0] open)
  const wallFaces = [
    { name: 'left', p0: [0, 0], p1: [0, 1], z0: baseZ, z1: H, color: '#334155', stroke: 'rgba(15,23,42,0.65)', lw: 1.1 },
    { name: 'right', p0: [2, 0], p1: [2, 1], z0: baseZ, z1: H, color: '#475569', stroke: 'rgba(15,23,42,0.65)', lw: 1.1 },
    { name: 'back-right', p0: [1, 0], p1: [2, 0], z0: baseZ, z1: H, color: '#1e293b', stroke: 'rgba(15,23,42,0.65)', lw: 1.1 },
    { name: 'front-left', p0: [0, 1], p1: [1, 1], z0: baseZ, z1: H, color: '#334155', stroke: 'rgba(15,23,42,0.65)', lw: 1.1 },
    // Portal header lintels: Front-Right entry (green), Back-Left exit (amber)
    { name: 'portal-entry', p0: [1, 1], p1: [2, 1], z0: H - 22, z1: H, color: '#10b981', stroke: '#0f172a', lw: 0.9 },
    { name: 'portal-exit', p0: [0, 0], p1: [1, 0], z0: H - 22, z1: H, color: '#f59e0b', stroke: '#0f172a', lw: 0.9 }
  ].map((f) => {
    const m0 = mapTunnelPt(f.p0[0], f.p0[1], rot);
    const m1 = mapTunnelPt(f.p1[0], f.p1[1], rot);
    return {
      ...f,
      m0,
      m1,
      depth: calcDepth(m0, m1)
    };
  });

  // Sort back-to-front so front walls occlude rear walls and lintels cleanly from every camera angle
  wallFaces.sort((a, b) => a.depth - b.depth);

  ctx.save();
  if (tunnelTransparent) ctx.globalAlpha = 0.55;
  for (const w of wallFaces) {
    fillPoly(
      ctx,
      [
        proj(originC + w.m0.vcL, originR + w.m0.vrL, w.z1),
        proj(originC + w.m1.vcL, originR + w.m1.vrL, w.z1),
        proj(originC + w.m1.vcL, originR + w.m1.vrL, w.z0),
        proj(originC + w.m0.vcL, originR + w.m0.vrL, w.z0)
      ],
      w.color,
      w.stroke,
      w.lw
    );
  }

  // Closed roof slab at z=300mm
  fillPoly(
    ctx,
    [
      proj(originC + fl0.vcL, originR + fl0.vrL, H),
      proj(originC + fl1.vcL, originR + fl1.vrL, H),
      proj(originC + fl2.vcL, originR + fl2.vrL, H),
      proj(originC + fl3.vcL, originR + fl3.vrL, H)
    ],
    '#475569',
    '#94a3b8',
    1.2
  );

  const roofCenter = mapTunnelPt(1, 0.5, rot);
  const rc = proj(originC + roofCenter.vcL, originR + roofCenter.vrL, H + 4);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 9px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TUNNEL 300×600×300', rc.x, rc.y);
  ctx.restore();
}

function drawIsoTunnelUnified(ctx, proj, vc0, vr0, effRot, tunnelTransparent = false) {
  drawTunnel3D(
    ctx,
    proj,
    vc0,
    vr0,
    effRot,
    tunnelTransparent,
    (m0, m1) => (m0.vcL + m0.vrL + m1.vcL + m1.vrL) * 0.5
  );
}

function drawContBox(ctx, proj, camBasis, u0, v0, u1, v1, z0, z1, colors) {
  const b00 = proj(u0, v0, z0);
  const b10 = proj(u1, v0, z0);
  const b11 = proj(u1, v1, z0);
  const b01 = proj(u0, v1, z0);

  const t00 = proj(u0, v0, z1);
  const t10 = proj(u1, v0, z1);
  const t11 = proj(u1, v1, z1);
  const t01 = proj(u0, v1, z1);

  const edge = colors.stroke || 'rgba(15, 23, 42, 0.35)';
  const { sinH, cosH } = camBasis;
  // Outward wall normals paired with top/bottom corner indices
  const walls = [
    { nx: 0, ny: -1, topA: t00, topB: t10, botA: b00, botB: b10 },
    { nx: 1, ny: 0, topA: t10, topB: t11, botA: b10, botB: b11 },
    { nx: 0, ny: 1, topA: t11, topB: t01, botA: b11, botB: b01 },
    { nx: -1, ny: 0, topA: t01, topB: t00, botA: b01, botB: b00 }
  ];

  for (const w of walls) {
    // Only draw faces pointing toward the camera (+cy world vector = (-sinH, cosH))
    const camDot = w.nx * (-sinH) + w.ny * cosH;
    if (camDot <= 0.001) continue;
    const rightDot = w.nx * cosH + w.ny * sinH;
    const fill = rightDot < 0 ? colors.left || '#94a3b8' : colors.right || '#64748b';
    fillPoly(ctx, [w.topA, w.topB, w.botB, w.botA], fill, edge);
  }

  fillPoly(ctx, [t00, t10, t11, t01], colors.top || '#f8fafc', edge);
}

function drawContTunnel(ctx, proj, toCam, anchorC, anchorR, worldRot, tunnelTransparent = false) {
  drawTunnel3D(ctx, proj, anchorC, anchorR, worldRot, tunnelTransparent, (m0, m1) => {
    const c0 = toCam(anchorC + m0.vcL, anchorR + m0.vrL);
    const c1 = toCam(anchorC + m1.vcL, anchorR + m1.vrL);
    return (c0.cy + c1.cy) * 0.5;
  });
}

function drawContRampOrSeesaw(ctx, gridData, proj, toCam, camBasis, c, r, tileWidthCm, isSeesaw) {
  const q = (du, dv) => getElevationAtCm(gridData, (c + du) * tileWidthCm, (r + dv) * tileWidthCm, tileWidthCm);
  const z00 = q(0.03, 0.03);
  const z10 = q(0.97, 0.03);
  const z11 = q(0.97, 0.97);
  const z01 = q(0.03, 0.97);

  if (isSeesaw) {
    drawContBox(ctx, proj, camBasis, c, r, c + 1, r + 1, 0, 5, {
      top: '#ffffff',
      left: '#cbd5e1',
      right: '#94a3b8',
      stroke: 'rgba(15, 23, 42, 0.32)'
    });
    drawContBox(ctx, proj, camBasis, c + 0.36, r + 0.36, c + 0.64, r + 0.64, 5, 26, {
      top: '#64748b',
      left: '#475569',
      right: '#334155',
      stroke: '#0f172a'
    });
    const t00 = proj(c + 0.04, r + 0.04, z00 + 2);
    const t10 = proj(c + 0.96, r + 0.04, z10 + 2);
    const t11 = proj(c + 0.96, r + 0.96, z11 + 2);
    const t01 = proj(c + 0.04, r + 0.96, z01 + 2);
    fillPoly(ctx, [t00, t10, t11, t01], '#3b82f6', '#1e3a8a', 1.1);
    return;
  }

  drawContBox(ctx, proj, camBasis, c, r, c + 1, r + 1, 0, 5, {
    top: '#cbd5e1',
    left: '#94a3b8',
    right: '#64748b',
    stroke: 'rgba(15, 23, 42, 0.32)'
  });

  const { sinH, cosH } = camBasis;
  const corners = [
    { u: c, v: r, z: z00 },
    { u: c + 1, v: r, z: z10 },
    { u: c + 1, v: r + 1, z: z11 },
    { u: c, v: r + 1, z: z01 }
  ];
  const wallNormals = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0]
  ];
  for (let i = 0; i < 4; i++) {
    const [nx, ny] = wallNormals[i];
    const camDot = nx * (-sinH) + ny * cosH;
    if (camDot <= 0.001) continue;
    const j = (i + 1) % 4;
    const rightDot = nx * cosH + ny * sinH;
    const fill = rightDot < 0 ? '#94a3b8' : '#64748b';
    fillPoly(
      ctx,
      [
        proj(corners[i].u, corners[i].v, corners[i].z),
        proj(corners[j].u, corners[j].v, corners[j].z),
        proj(corners[j].u, corners[j].v, 5),
        proj(corners[i].u, corners[i].v, 5)
      ],
      fill,
      'rgba(15, 23, 42, 0.35)'
    );
  }
  const slopePoly = corners.map((pt) => proj(pt.u, pt.v, pt.z));
  fillPoly(ctx, slopePoly, '#e2e8f0', '#475569', 1.0);
}

function renderIsometricFollowCam(canvas, gridData, options = {}) {
  const ctx = canvas.getContext('2d');
  const rows = gridData.length;
  const cols = gridData[0]?.length || 1;
  const {
    tileWidthCm = 30,
    selectedCell = null,
    simOverlay = null,
    bgColor = '#070b14'
  } = options;

  const W = canvas.width;
  const H = canvas.height;
  const occ = getCellOccupancyMap(gridData);
  const tileMm = Math.max(50, tileWidthCm * 10);
  const tilePx = Math.min(92, Math.max(48, Math.min(W, H) / 4.5));
  const mmToPx = tilePx / tileMm;
  const scaleX = tilePx * 1.12;
  const scaleY = tilePx * 0.68;

  const rxCm = simOverlay.robotX;
  const ryCm = simOverlay.robotY;
  const ru = rxCm / tileWidthCm;
  const rv = ryCm / tileWidthCm;
  const rad = ((simOverlay.robotH || 0) * Math.PI) / 180;
  const sinH = Math.sin(rad);
  const cosH = Math.cos(rad);
  const camBasis = { sinH, cosH };
  const zFocus = getElevationAtCm(gridData, rxCm, ryCm, tileWidthCm);
  const centerX = W * 0.5;
  const centerY = H * 0.56;

  const toCam = (u, v) => {
    const du = u - ru;
    const dv = v - rv;
    return {
      cx: du * cosH + dv * sinH,
      cy: -du * sinH + dv * cosH
    };
  };

  const projCam = (cx, cy, zMm = 0) => ({
    x: centerX + cx * scaleX,
    y: centerY + cy * scaleY - (zMm - zFocus) * mmToPx
  });

  const proj = (u, v, zMm = 0) => {
    const cp = toCam(u, v);
    return projCam(cp.cx, cp.cy, zMm);
  };

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);

  // Detect if robot sits inside a tunnel so tunnel roof draws translucent over robot
  let robotTunnelKey = null;
  const rcCell = Math.floor(rxCm / tileWidthCm);
  const rrCell = Math.floor(ryCm / tileWidthCm);
  const rOcc = occ[`${rrCell},${rcCell}`];
  if (rOcc && rOcc.cell.tileId === 33) {
    robotTunnelKey = `${rOcc.anchorR},${rOcc.anchorC}`;
  }

  // Group 2x1 tunnels
  const tunnelGroups = new Map();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const info = occ[`${r},${c}`];
      if (!info || (info.rowSpan === 1 && info.colSpan === 1)) continue;
      const key = `${info.anchorR},${info.anchorC}`;
      if (!tunnelGroups.has(key)) {
        tunnelGroups.set(key, {
          key,
          anchorR: info.anchorR,
          anchorC: info.anchorC,
          rot: info.cell.rot,
          depths: []
        });
      }
      tunnelGroups.get(key).depths.push(toCam(c + 0.5, r + 0.5).cy);
    }
  }

  // Collect renderable items sorted back-to-front by camera cy depth
  const drawItems = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const info = occ[`${r},${c}`];
      if (info && (info.rowSpan > 1 || info.colSpan > 1)) continue;
      drawItems.push({
        kind: 'cell',
        r,
        c,
        info: info || null,
        depth: toCam(c + 0.5, r + 0.5).cy
      });
    }
  }
  for (const grp of tunnelGroups.values()) {
    const maxCellDepth = Math.max(...grp.depths);
    drawItems.push({
      kind: 'tunnel',
      grp,
      depth: grp.key === robotTunnelKey ? Math.max(maxCellDepth, 0.45) : maxCellDepth
    });
  }
  drawItems.sort((a, b) => a.depth - b.depth);

  let robotDrawn = false;
  const drawCenteredRobotAndPath = () => {
    if (robotDrawn) return;
    robotDrawn = true;

    const { segments = [], segIdx = 0, segProgress = 0 } = simOverlay;
    const projectWorldCm = (xCm, yCm, zExtra = 4) => {
      const z = getElevationAtCm(gridData, xCm, yCm, tileWidthCm) + zExtra;
      return proj(xCm / tileWidthCm, yCm / tileWidthCm, z);
    };

    if (segments.length > 0) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const s0 = projectWorldCm(segments[0].fx, segments[0].fy);
      ctx.moveTo(s0.x, s0.y);
      for (const seg of segments) {
        const pts = sampleSegmentPoints(seg, 1);
        for (let k = 1; k < pts.length; k++) {
          const p = projectWorldCm(pts[k].x, pts[k].y);
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    for (let i = 0; i <= segIdx && i < segments.length; i++) {
      const seg = segments[i];
      const t = i === segIdx ? segProgress : 1;
      const pts = sampleSegmentPoints(seg, t);
      ctx.strokeStyle = seg.marker === 'line' ? '#34d399' : (seg.arc ? '#22d3ee' : '#38bdf8');
      ctx.lineWidth = 3;
      ctx.beginPath();
      const p0 = projectWorldCm(pts[0].x, pts[0].y, 6);
      ctx.moveTo(p0.x, p0.y);
      for (let k = 1; k < pts.length; k++) {
        const pk = projectWorldCm(pts[k].x, pts[k].y, 6);
        ctx.lineTo(pk.x, pk.y);
      }
      ctx.stroke();
    }

    // Draw fixed screen-centered 3D robot chassis pointing straight UP (-cy)
    const halfU = 7.2 / tileWidthCm;
    const zBase = zFocus + 2;
    const zTop = zBase + 38;
    const ringC = projCam(0, 0, zBase);

    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.ellipse(ringC.x, ringC.y, halfU * 1.65 * scaleX, halfU * 1.65 * scaleY, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Tank tracks left/right
    const drawFixedBoxCam = (x0, y0, x1, y1, zb, zt, topFill, rearFill, strokeCol = '#38bdf8') => {
      const fb00 = projCam(x0, y0, zb);
      const fb10 = projCam(x1, y0, zb);
      const fb11 = projCam(x1, y1, zb);
      const fb01 = projCam(x0, y1, zb);
      const ft00 = projCam(x0, y0, zt);
      const ft10 = projCam(x1, y0, zt);
      const ft11 = projCam(x1, y1, zt);
      const ft01 = projCam(x0, y1, zt);
      // Rear face (+cy toward camera)
      fillPoly(ctx, [ft01, ft11, fb11, fb01], rearFill, strokeCol, 1.1);
      // Left/right bevel visibility for narrow track sides
      if (Math.abs(fb00.x - fb01.x) > 0.5) {
        fillPoly(ctx, [ft00, ft01, fb01, fb00], rearFill, strokeCol, 0.9);
      }
      if (Math.abs(fb10.x - fb11.x) > 0.5) {
        fillPoly(ctx, [ft10, ft11, fb11, fb10], rearFill, strokeCol, 0.9);
      }
      fillPoly(ctx, [ft00, ft10, ft11, ft01], topFill, strokeCol, 1.3);
    };

    drawFixedBoxCam(-halfU * 1.14, -halfU * 0.88, -halfU * 0.94, halfU * 0.88, zBase, zBase + 16, '#334155', '#1e293b', '#475569');
    drawFixedBoxCam(halfU * 0.94, -halfU * 0.88, halfU * 1.14, halfU * 0.88, zBase, zBase + 16, '#334155', '#1e293b', '#475569');
    // Front emerald bumper bar sticking forward (-cy UP)
    drawFixedBoxCam(-halfU * 0.88, -halfU * 1.14, halfU * 0.88, -halfU * 0.92, zBase + 4, zBase + 18, '#10b981', '#059669', '#0f172a');
    // Main chassis body
    drawFixedBoxCam(-halfU, -halfU, halfU, halfU, zBase, zTop, '#0f172a', '#1e293b', '#38bdf8');

    // Crisp heading arrow pointing straight UP on top plate
    const aTip = projCam(0, -halfU * 0.62, zTop + 2);
    const aL = projCam(-halfU * 0.44, halfU * 0.34, zTop + 2);
    const aR = projCam(halfU * 0.44, halfU * 0.34, zTop + 2);
    fillPoly(ctx, [aTip, aL, aR], '#fde047', '#0f172a', 0.8);
  };

  for (const item of drawItems) {
    if (!robotDrawn && item.depth > 0.35) {
      drawCenteredRobotAndPath();
    }

    if (item.kind === 'tunnel') {
      const grp = item.grp;
      drawContTunnel(ctx, proj, toCam, grp.anchorC, grp.anchorR, grp.rot, robotTunnelKey === grp.key);
      continue;
    }

    const { r, c, info } = item;
    if (!info) {
      drawContBox(ctx, proj, camBasis, c, r, c + 1, r + 1, 0, 5, {
        top: '#111827',
        left: '#1e293b',
        right: '#0f172a',
        stroke: 'rgba(148, 163, 184, 0.22)'
      });
    } else {
      const tile = TILE_BY_ID[info.cell.tileId] || TILE_BY_ID[1];
      const worldRot = normalizeRot(info.cell.rot);

      if (tile.bridgeRamp) {
        drawContRampOrSeesaw(ctx, gridData, proj, toCam, camBasis, c, r, tileWidthCm, false);
      } else if (tile.bridgeDeck) {
        drawContBox(ctx, proj, camBasis, c, r, c + 1, r + 1, 0, tile.bridgeDeck.heightMm || 100, {
          top: '#e2e8f0',
          left: '#94a3b8',
          right: '#64748b',
          stroke: 'rgba(15, 23, 42, 0.32)'
        });
      } else if (tile.elevatedCube) {
        const zPlat = getElevationAtCm(gridData, (c + 0.5) * tileWidthCm, (r + 0.5) * tileWidthCm, tileWidthCm);
        drawContBox(ctx, proj, camBasis, c, r, c + 1, r + 1, 0, zPlat, {
          top: '#e2e8f0',
          left: '#94a3b8',
          right: '#64748b',
          stroke: 'rgba(15, 23, 42, 0.35)'
        });
        const cubeColor =
          CUBE_COLOR_META?.[tile.elevatedCube?.cube]?.fill ||
          CUBE_COLOR_META?.[tile.dropZone?.color]?.fill ||
          '#22c55e';
        drawContBox(ctx, proj, camBasis, c + 0.3, r + 0.3, c + 0.7, r + 0.7, zPlat, zPlat + 24, {
          top: cubeColor,
          left: cubeColor,
          right: '#1e293b',
          stroke: '#0f172a'
        });
      } else if (tile.seesaw) {
        drawContRampOrSeesaw(ctx, gridData, proj, toCam, camBasis, c, r, tileWidthCm, true);
      } else {
        const topColor =
          tile.special === 'start' ? '#dc2626' : tile.special === 'finish' ? '#0284c7' : '#ffffff';
        drawContBox(ctx, proj, camBasis, c, r, c + 1, r + 1, 0, 5, {
          top: topColor,
          left: '#cbd5e1',
          right: '#94a3b8',
          stroke: 'rgba(15, 23, 42, 0.32)'
        });
        drawIsoStandardTopSurface(ctx, proj, tile, c, r, 5, worldRot);
      }
    }

    if (selectedCell && selectedCell.r === r && selectedCell.c === c) {
      fillPoly(
        ctx,
        [proj(c, r, 6), proj(c + 1, r, 6), proj(c + 1, r + 1, 6), proj(c, r + 1, 6)],
        'rgba(56, 189, 248, 0.22)',
        '#38bdf8',
        2
      );
    }
  }

  if (!robotDrawn) {
    drawCenteredRobotAndPath();
  }

  drawFollowCamHud(ctx, W, simOverlay?.robotH || 0);

  return { tilePx, mmToPx, originX: centerX, originY: centerY, vRows: rows, vCols: cols };
}

export function renderIsometricGrid(canvas, gridData, options = {}) {
  if (!canvas || !Array.isArray(gridData) || gridData.length === 0) return null;
  if (
    options.cameraFollowRobot &&
    options.simOverlay &&
    Number.isFinite(options.simOverlay.robotX) &&
    Number.isFinite(options.simOverlay.robotY)
  ) {
    return renderIsometricFollowCam(canvas, gridData, options);
  }
  const ctx = canvas.getContext('2d');
  const rows = gridData.length;
  const cols = gridData[0]?.length || 1;
  const {
    cameraRotDeg = 0,
    tileWidthCm = 30,
    selectedCell = null,
    simOverlay = null,
    bgColor = '#070b14'
  } = options;

  const { vRows, vCols, toVisual } = getCameraTransformFn(cameraRotDeg, rows, cols);
  const W = canvas.width;
  const H = canvas.height;
  const occ = getCellOccupancyMap(gridData);

  // Check max height in scene so tunnel (300mm) never clips off the top
  let maxZMm = 110;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (gridData[r][c]?.tileId === 33) maxZMm = 310;
    }
  }

  const cos30 = 0.8660254;
  const sin30 = 0.5;
  const tileMm = Math.max(50, tileWidthCm * 10);
  const padX = 24;
  const padY = 24;
  const maxIsoW = (vCols + vRows) * cos30;
  const maxIsoH = (vCols + vRows) * sin30 + maxZMm / tileMm;
  const tilePx = Math.min((W - padX * 2) / maxIsoW, (H - padY * 2) / maxIsoH);
  const mmToPx = tilePx / tileMm;

  const sceneW = maxIsoW * tilePx;
  const sceneH = maxIsoH * tilePx;
  const originX = (W - sceneW) * 0.5 + vRows * cos30 * tilePx;
  const originY = (H - sceneH) * 0.5 + maxZMm * mmToPx;

  const proj = (vc, vr, zMm = 0) => ({
    x: originX + (vc - vr) * cos30 * tilePx,
    y: originY + (vc + vr) * sin30 * tilePx - zMm * mmToPx
  });

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);

  // Group 2x1 tunnel visual cells so each tunnel renders once when sum === maxSum
  const tunnelGroups = new Map();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const info = occ[`${r},${c}`];
      if (!info || (info.rowSpan === 1 && info.colSpan === 1)) continue;
      const key = `${info.anchorR},${info.anchorC}`;
      if (!tunnelGroups.has(key)) {
        tunnelGroups.set(key, {
          anchorR: info.anchorR,
          anchorC: info.anchorC,
          rot: info.cell.rot,
          vCells: []
        });
      }
      const vPos = toVisual(r, c);
      tunnelGroups.get(key).vCells.push({ ...vPos, sum: vPos.vr + vPos.vc });
    }
  }
  for (const grp of tunnelGroups.values()) {
    grp.minVc = Math.min(...grp.vCells.map((p) => p.vc));
    grp.minVr = Math.min(...grp.vCells.map((p) => p.vr));
    grp.maxSum = Math.max(...grp.vCells.map((p) => p.sum));
  }

  // Check if robot is inside a tunnel to make tunnel slightly translucent during sim
  let robotTunnelKey = null;
  if (simOverlay && Number.isFinite(simOverlay.robotX) && Number.isFinite(simOverlay.robotY)) {
    const rc = Math.floor(simOverlay.robotX / tileWidthCm);
    const rr = Math.floor(simOverlay.robotY / tileWidthCm);
    const rInfo = occ[`${rr},${rc}`];
    if (rInfo && rInfo.cell.tileId === 33) {
      robotTunnelKey = `${rInfo.anchorR},${rInfo.anchorC}`;
    }
  }

  // Lookup map from visual (vr, vc) back to original (r, c)
  const visualCellMap = Object.create(null);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const vp = toVisual(r, c);
      visualCellMap[`${vp.vr},${vp.vc}`] = { r, c };
    }
  }

  // Painter's Algorithm: back-to-front by (vr + vc)
  const maxSum = vRows + vCols - 2;
  for (let sum = 0; sum <= maxSum; sum++) {
    for (let vr = 0; vr < vRows; vr++) {
      const vc = sum - vr;
      if (vc < 0 || vc >= vCols) continue;
      const orig = visualCellMap[`${vr},${vc}`];
      if (!orig) continue;
      const { r, c } = orig;
      const info = occ[`${r},${c}`];

      if (!info) {
        // Empty 5mm base grid slot
        drawIsoBox(ctx, proj, vc, vr, vc + 1, vr + 1, 0, 5, {
          top: '#111827',
          left: '#1e293b',
          right: '#0f172a',
          stroke: 'rgba(148, 163, 184, 0.22)'
        });
      } else if (info.rowSpan > 1 || info.colSpan > 1) {
        const key = `${info.anchorR},${info.anchorC}`;
        const grp = tunnelGroups.get(key);
        if (grp && sum === grp.maxSum) {
          const effRot = normalizeRot(grp.rot + cameraRotDeg);
          drawIsoTunnelUnified(ctx, proj, grp.minVc, grp.minVr, effRot, robotTunnelKey === key);
        }
      } else {
        const tile = TILE_BY_ID[info.cell.tileId] || TILE_BY_ID[1];
        const effRot = normalizeRot(info.cell.rot + cameraRotDeg);

        if (tile.bridgeRamp) {
          drawIsoBridgeRamp(ctx, proj, vc, vr, effRot);
        } else if (tile.bridgeDeck) {
          drawIsoBox(ctx, proj, vc, vr, vc + 1, vr + 1, 0, tile.bridgeDeck.heightMm, {
            top: '#e2e8f0',
            left: '#94a3b8',
            right: '#64748b'
          });
        } else if (tile.elevatedCube) {
          drawIsoElevatedCubePlatform(ctx, proj, tile, vc, vr, effRot);
        } else if (tile.seesaw) {
          drawIsoSeesaw(ctx, proj, tile, vc, vr, effRot);
        } else {
          const topColor =
            tile.special === 'start' ? '#dc2626' : tile.special === 'finish' ? '#0284c7' : '#ffffff';
          drawIsoBox(ctx, proj, vc, vr, vc + 1, vr + 1, 0, 5, {
            top: topColor,
            left: '#cbd5e1',
            right: '#94a3b8',
            stroke: 'rgba(15, 23, 42, 0.32)'
          });
          drawIsoStandardTopSurface(ctx, proj, tile, vc, vr, 5, effRot);
        }
      }

      if (selectedCell && selectedCell.r === r && selectedCell.c === c) {
        fillPoly(
          ctx,
          [proj(vc, vr, 6), proj(vc + 1, vr, 6), proj(vc + 1, vr + 1, 6), proj(vc, vr + 1, 6)],
          'rgba(56, 189, 248, 0.22)',
          '#38bdf8',
          2
        );
      }
    }
  }

  // Optional 3D Simulation Trajectory + 3D Robot Chassis at true Z elevation
  if (simOverlay) {
    const { segments = [], segIdx = 0, segProgress = 0, robotX, robotY, robotH } = simOverlay;
    const cmToVisual = (xCm, yCm) => {
      const uRaw = xCm / tileWidthCm;
      const vRaw = yCm / tileWidthCm;
      const cam = normalizeRot(cameraRotDeg);
      if (cam === 90) return { vc: rows - vRaw, vr: uRaw };
      if (cam === 180) return { vc: cols - uRaw, vr: rows - vRaw };
      if (cam === 270) return { vc: vRaw, vr: cols - uRaw };
      return { vc: uRaw, vr: vRaw };
    };

    const projectWorldCm = (xCm, yCm, zExtra = 4) => {
      const vp = cmToVisual(xCm, yCm);
      const z = getElevationAtCm(gridData, xCm, yCm, tileWidthCm) + zExtra;
      return proj(vp.vc, vp.vr, z);
    };

    if (segments.length > 0) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const s0 = projectWorldCm(segments[0].fx, segments[0].fy);
      ctx.moveTo(s0.x, s0.y);
      for (const seg of segments) {
        const pts = sampleSegmentPoints(seg, 1);
        for (let k = 1; k < pts.length; k++) {
          const p = projectWorldCm(pts[k].x, pts[k].y);
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    for (let i = 0; i <= segIdx && i < segments.length; i++) {
      const seg = segments[i];
      const t = i === segIdx ? segProgress : 1;
      const pts = sampleSegmentPoints(seg, t);
      ctx.strokeStyle = seg.marker === 'line' ? '#34d399' : (seg.arc ? '#22d3ee' : '#38bdf8');
      ctx.lineWidth = 3;
      ctx.beginPath();
      const p0 = projectWorldCm(pts[0].x, pts[0].y, 6);
      ctx.moveTo(p0.x, p0.y);
      for (let k = 1; k < pts.length; k++) {
        const pk = projectWorldCm(pts[k].x, pts[k].y, 6);
        ctx.lineTo(pk.x, pk.y);
      }
      ctx.stroke();
    }

    if (Number.isFinite(robotX) && Number.isFinite(robotY)) {
      const halfCm = 7.2;
      const rad = ((robotH || 0) * Math.PI) / 180;
      const fwdX = Math.sin(rad);
      const fwdY = -Math.cos(rad);
      const rightX = Math.cos(rad);
      const rightY = Math.sin(rad);
      const zBase = getElevationAtCm(gridData, robotX, robotY, tileWidthCm) + 2;
      const zTop = zBase + 38;

      const worldCorners = [
        { x: robotX + (fwdX - rightX) * halfCm, y: robotY + (fwdY - rightY) * halfCm },
        { x: robotX + (fwdX + rightX) * halfCm, y: robotY + (fwdY + rightY) * halfCm },
        { x: robotX + (-fwdX + rightX) * halfCm, y: robotY + (-fwdY + rightY) * halfCm },
        { x: robotX + (-fwdX - rightX) * halfCm, y: robotY + (-fwdY - rightY) * halfCm }
      ].map((pt) => cmToVisual(pt.x, pt.y));

      const botPts = worldCorners.map((p) => proj(p.vc, p.vr, zBase));
      const topPts = worldCorners.map((p) => proj(p.vc, p.vr, zTop));

      // Draw back-to-front faces of robot prism
      const faces = [0, 1, 2, 3].map((i) => {
        const j = (i + 1) % 4;
        const depth =
          (worldCorners[i].vc + worldCorners[i].vr + worldCorners[j].vc + worldCorners[j].vr) * 0.5;
        return { i, j, depth, isFront: i === 0 };
      });
      faces.sort((a, b) => a.depth - b.depth);

      for (const f of faces) {
        fillPoly(
          ctx,
          [topPts[f.i], topPts[f.j], botPts[f.j], botPts[f.i]],
          f.isFront ? '#10b981' : '#1e293b',
          '#38bdf8',
          1.2
        );
      }
      fillPoly(ctx, topPts, '#0f172a', '#38bdf8', 1.4);

      const frontTip = cmToVisual(robotX + fwdX * (halfCm * 0.65), robotY + fwdY * (halfCm * 0.65));
      const tipP = proj(frontTip.vc, frontTip.vr, zTop + 2);
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(tipP.x, tipP.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return { tilePx, mmToPx, originX, originY, vRows, vCols };
}
