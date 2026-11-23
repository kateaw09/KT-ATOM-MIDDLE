'use strict';

import {
  TILE_BY_ID,
  TILE_MARKER_CENTER_RATIO,
  getTileSpan,
  canPlaceTileAt,
  normalizeRot
} from './fieldTiles.js';
import { decodeMarkerBits } from './aruco.js';
import { computeExact1to1Metrics, renderBaseBoardCanvas } from './printGenerator.js';

export function computeHomography(srcPts, dstPts) {
  if (!srcPts || !dstPts || srcPts.length < 4 || dstPts.length < 4) return null;
  // Build 8x9 augmented matrix for DLT (h8 = 1)
  const A = Array.from({ length: 8 }, () => new Float64Array(9));
  for (let i = 0; i < 4; i++) {
    const x = srcPts[i].x;
    const y = srcPts[i].y;
    const u = dstPts[i].x;
    const v = dstPts[i].y;
    const r0 = i * 2;
    const r1 = i * 2 + 1;

    A[r0][0] = x; A[r0][1] = y; A[r0][2] = 1;
    A[r0][3] = 0; A[r0][4] = 0; A[r0][5] = 0;
    A[r0][6] = -u * x; A[r0][7] = -u * y; A[r0][8] = u;

    A[r1][0] = 0; A[r1][1] = 0; A[r1][2] = 0;
    A[r1][3] = x; A[r1][4] = y; A[r1][5] = 1;
    A[r1][6] = -v * x; A[r1][7] = -v * y; A[r1][8] = v;
  }

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < 8; col++) {
    let pivotRow = col;
    let maxAbs = Math.abs(A[col][col]);
    for (let row = col + 1; row < 8; row++) {
      const val = Math.abs(A[row][col]);
      if (val > maxAbs) {
        maxAbs = val;
        pivotRow = row;
      }
    }
    if (maxAbs < 1e-10) return null;
    if (pivotRow !== col) {
      const tmp = A[col];
      A[col] = A[pivotRow];
      A[pivotRow] = tmp;
    }

    const diag = A[col][col];
    for (let j = col; j < 9; j++) A[col][j] /= diag;

    for (let row = 0; row < 8; row++) {
      if (row === col) continue;
      const factor = A[row][col];
      if (factor === 0) continue;
      for (let j = col; j < 9; j++) {
        A[row][j] -= factor * A[col][j];
      }
    }
  }

  const H = new Float64Array(9);
  for (let i = 0; i < 8; i++) H[i] = A[i][8];
  H[8] = 1;
  return H;
}

export function applyHomography(H, pt) {
  if (!H || !pt) return null;
  const w = H[6] * pt.x + H[7] * pt.y + H[8];
  if (Math.abs(w) < 1e-9) return null;
  return {
    x: (H[0] * pt.x + H[1] * pt.y + H[2]) / w,
    y: (H[3] * pt.x + H[4] * pt.y + H[5]) / w
  };
}

export function buildIntegralImage(gray, w, h) {
  const stride = w + 1;
  const sat = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    const rowOff = y * w;
    const curRow = (y + 1) * stride;
    const prevRow = y * stride;
    for (let x = 0; x < w; x++) {
      rowSum += gray[rowOff + x];
      sat[curRow + x + 1] = sat[prevRow + x + 1] + rowSum;
    }
  }
  return sat;
}

function quadSignedArea(pts) {
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    area += a.x * b.y - b.x * a.y;
  }
  return area * 0.5;
}

function isConvexQuad(pts) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    const c = pts[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-4) return false;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (sign !== s) return false;
  }
  return true;
}

function orderCornersCW(raw) {
  // Sort around centroid by angle in screen coords (clockwise: top-left -> top-right -> bottom-right -> bottom-left)
  let cx = 0;
  let cy = 0;
  for (const p of raw) {
    cx += p.x;
    cy += p.y;
  }
  cx /= raw.length;
  cy /= raw.length;

  const sorted = [...raw].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  // Rotate array so corner closest to top-left (min x+y) is index 0
  let bestIdx = 0;
  let bestSum = Infinity;
  for (let i = 0; i < 4; i++) {
    const s = sorted[i].x + sorted[i].y;
    if (s < bestSum) {
      bestSum = s;
      bestIdx = i;
    }
  }
  return [
    sorted[bestIdx],
    sorted[(bestIdx + 1) % 4],
    sorted[(bestIdx + 2) % 4],
    sorted[(bestIdx + 3) % 4]
  ];
}

function extractQuadCornersFromPixels(xs, ys, count) {
  let tl = { x: 0, y: 0 };
  let tr = { x: 0, y: 0 };
  let br = { x: 0, y: 0 };
  let bl = { x: 0, y: 0 };
  let minSum = Infinity;
  let maxSum = -Infinity;
  let minDiff = Infinity;
  let maxDiff = -Infinity;

  for (let i = 0; i < count; i++) {
    const x = xs[i];
    const y = ys[i];
    const sum = x + y;
    const diff = x - y;
    if (sum < minSum) { minSum = sum; tl = { x, y }; }
    if (sum > maxSum) { maxSum = sum; br = { x, y }; }
    if (diff > maxDiff) { maxDiff = diff; tr = { x, y }; }
    if (diff < minDiff) { minDiff = diff; bl = { x, y }; }
  }

  let quad = orderCornersCW([tl, tr, br, bl]);
  if (Math.abs(quadSignedArea(quad)) > 60 && isConvexQuad(quad)) return quad;

  // Fallback for ~45° rotated squares using axis extrema
  let top = { x: 0, y: Infinity };
  let right = { x: -Infinity, y: 0 };
  let bottom = { x: 0, y: -Infinity };
  let left = { x: Infinity, y: 0 };
  for (let i = 0; i < count; i++) {
    const x = xs[i];
    const y = ys[i];
    if (y < top.y) top = { x, y };
    if (x > right.x) right = { x, y };
    if (y > bottom.y) bottom = { x, y };
    if (x < left.x) left = { x, y };
  }
  quad = orderCornersCW([top, right, bottom, left]);
  if (Math.abs(quadSignedArea(quad)) > 60 && isConvexQuad(quad)) return quad;
  return null;
}

function sampleGrayBilinear(gray, w, h, fx, fy) {
  const x0 = Math.max(0, Math.min(w - 2, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(h - 2, Math.floor(fy)));
  const dx = fx - x0;
  const dy = fy - y0;
  const idx = y0 * w + x0;
  const v00 = gray[idx];
  const v10 = gray[idx + 1];
  const v01 = gray[idx + w];
  const v11 = gray[idx + w + 1];
  return (v00 * (1 - dx) + v10 * dx) * (1 - dy) + (v01 * (1 - dx) + v11 * dx) * dy;
}

function tryDecodeMarkerQuad(gray, w, h, corners) {
  const gridRect = [
    { x: 0, y: 0 },
    { x: 7, y: 0 },
    { x: 7, y: 7 },
    { x: 0, y: 7 }
  ];
  const H = computeHomography(gridRect, corners);
  if (!H) return null;

  const samples = new Float64Array(49);
  const borderVals = [];
  const innerVals = [];

  for (let gr = 0; gr < 7; gr++) {
    for (let gc = 0; gc < 7; gc++) {
      let acc = 0;
      for (let sy = -1; sy <= 1; sy++) {
        for (let sx = -1; sx <= 1; sx++) {
          const p = applyHomography(H, { x: gc + 0.5 + sx * 0.16, y: gr + 0.5 + sy * 0.16 });
          if (!p || p.x < 0 || p.x >= w - 1 || p.y < 0 || p.y >= h - 1) return null;
          acc += sampleGrayBilinear(gray, w, h, p.x, p.y);
        }
      }
      const mean = acc / 9;
      samples[gr * 7 + gc] = mean;
      if (gr === 0 || gr === 6 || gc === 0 || gc === 6) borderVals.push(mean);
      else innerVals.push(mean);
    }
  }

  let borderSum = 0;
  for (let i = 0; i < borderVals.length; i++) borderSum += borderVals[i];
  const darkMean = borderSum / borderVals.length;

  const sortedInner = [...innerVals].sort((a, b) => b - a);
  let brightSum = 0;
  const topN = 8;
  for (let i = 0; i < topN; i++) brightSum += sortedInner[i];
  const brightMean = brightSum / topN;

  const contrast = brightMean - darkMean;
  if (contrast < 18) return null;

  const thresh = (darkMean + brightMean) * 0.5;
  let darkBorderOk = 0;
  for (let i = 0; i < borderVals.length; i++) {
    if (borderVals[i] < thresh + contrast * 0.1) darkBorderOk++;
  }
  if (darkBorderOk < 21) return null;

  let bits = '';
  for (let r = 1; r <= 5; r++) {
    for (let c = 1; c <= 5; c++) {
      bits += samples[r * 7 + c] > thresh ? '1' : '0';
    }
  }

  const decoded = decodeMarkerBits(bits, 1);
  if (!decoded) return null;

  const center = applyHomography(H, { x: 3.5, y: 3.5 }) || {
    x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) * 0.25,
    y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) * 0.25
  };

  // True 0-deg top-left & top-right corners in image space
  const k = Math.round(decoded.rot / 90) % 4;
  const trueTL = corners[k];
  const trueTR = corners[(k + 1) % 4];

  return {
    id: decoded.id,
    quadRot: decoded.rot,
    dist: decoded.dist,
    corners,
    trueTL,
    trueTR,
    center
  };
}

function detectMarkersForBias(gray, sat, w, h, bias, scratch) {
  const { bin, visited, qx, qy, compX, compY } = scratch;
  const radius = Math.max(7, Math.min(22, Math.round(Math.min(w, h) * 0.025)));
  const stride = w + 1;

  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h - 1, y + radius);
    const rowOff = y * w;
    const sTop = y0 * stride;
    const sBot = (y1 + 1) * stride;
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = sat[sBot + x1 + 1] - sat[sTop + x1 + 1] - sat[sBot + x0] + sat[sTop + x0];
      const idx = rowOff + x;
      bin[idx] = gray[idx] * area < sum - bias * area ? 1 : 0;
      visited[idx] = 0;
    }
  }

  const maxSpan = Math.min(w, h) * 0.65;
  const results = [];
  const total = w * h;

  for (let start = 0; start < total; start++) {
    if (!bin[start] || visited[start]) continue;

    let head = 0;
    let tail = 0;
    visited[start] = 1;
    qx[tail] = start % w;
    qy[tail] = (start / w) | 0;
    tail++;

    let minX = qx[0];
    let maxX = qx[0];
    let minY = qy[0];
    let maxY = qy[0];

    while (head < tail) {
      const cx = qx[head];
      const cy = qy[head];
      compX[head] = cx;
      compY[head] = cy;
      head++;

      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      if (cx + 1 < w) {
        const n = cy * w + cx + 1;
        if (bin[n] && !visited[n]) { visited[n] = 1; qx[tail] = cx + 1; qy[tail] = cy; tail++; }
      }
      if (cx - 1 >= 0) {
        const n = cy * w + cx - 1;
        if (bin[n] && !visited[n]) { visited[n] = 1; qx[tail] = cx - 1; qy[tail] = cy; tail++; }
      }
      if (cy + 1 < h) {
        const n = (cy + 1) * w + cx;
        if (bin[n] && !visited[n]) { visited[n] = 1; qx[tail] = cx; qy[tail] = cy + 1; tail++; }
      }
      if (cy - 1 >= 0) {
        const n = (cy - 1) * w + cx;
        if (bin[n] && !visited[n]) { visited[n] = 1; qx[tail] = cx; qy[tail] = cy - 1; tail++; }
      }
    }

    if (tail < 45) continue;
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    if (bw < 12 || bh < 12 || bw > maxSpan || bh > maxSpan) continue;
    const aspect = Math.min(bw, bh) / Math.max(bw, bh);
    if (aspect < 0.35) continue;
    const fill = tail / (bw * bh);
    if (fill < 0.22 || fill > 0.92) continue;

    const corners = extractQuadCornersFromPixels(compX, compY, tail);
    if (!corners) continue;

    const decoded = tryDecodeMarkerQuad(gray, w, h, corners);
    if (decoded) results.push(decoded);
  }

  return results;
}

export function recoverFourthCornerParallelogram(cornersMap) {
  const p101 = cornersMap[101]?.center || null;
  const p102 = cornersMap[102]?.center || null;
  const p103 = cornersMap[103]?.center || null;
  const p104 = cornersMap[104]?.center || null;

  const foundCount = [p101, p102, p103, p104].filter(Boolean).length;
  if (foundCount === 4) {
    return { p101, p102, p103, p104, cornersFound: 4, recoveredCorner: null };
  }
  if (foundCount < 3) {
    return { p101, p102, p103, p104, cornersFound: foundCount, recoveredCorner: null };
  }

  if (!p104) {
    return {
      p101, p102, p103,
      p104: { x: p102.x + p103.x - p101.x, y: p102.y + p103.y - p101.y },
      cornersFound: 3, recoveredCorner: 104
    };
  }
  if (!p103) {
    return {
      p101, p102,
      p103: { x: p101.x + p104.x - p102.x, y: p101.y + p104.y - p102.y },
      p104, cornersFound: 3, recoveredCorner: 103
    };
  }
  if (!p102) {
    return {
      p101,
      p102: { x: p101.x + p104.x - p103.x, y: p101.y + p104.y - p103.y },
      p103, p104, cornersFound: 3, recoveredCorner: 102
    };
  }
  return {
    p101: { x: p102.x + p103.x - p104.x, y: p102.y + p103.y - p104.y },
    p102, p103, p104, cornersFound: 3, recoveredCorner: 101
  };
}

function rotateVecCW(vx, vy, rotDeg) {
  const r = normalizeRot(rotDeg);
  if (r === 90) return { x: -vy, y: vx };
  if (r === 180) return { x: -vx, y: -vy };
  if (r === 270) return { x: vy, y: -vx };
  return { x: vx, y: vy };
}

export function scanBoardFromCanvasFrame(canvas, drawOverlay = true, options = {}) {
  const rows = Math.max(2, Math.min(24, Number(options.rows) || 7));
  const cols = Math.max(2, Math.min(24, Number(options.cols) || 7));
  const metrics = options.metrics || computeExact1to1Metrics({
    paperKey: options.paperKey || 'A4',
    orientation: options.orientation || 'landscape',
    rows,
    cols
  });

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const rgba = imgData.data;

  const total = w * h;
  const gray = new Uint8Array(total);
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    gray[i] = (77 * rgba[p] + 150 * rgba[p + 1] + 29 * rgba[p + 2]) >> 8;
  }

  const sat = buildIntegralImage(gray, w, h);
  const scratch = {
    bin: new Uint8Array(total),
    visited: new Uint8Array(total),
    qx: new Int32Array(total),
    qy: new Int32Array(total),
    compX: new Int32Array(total),
    compY: new Int32Array(total)
  };

  const detectedByKey = [];
  for (const bias of [12, 24]) {
    const passMarkers = detectMarkersForBias(gray, sat, w, h, bias, scratch);
    for (const m of passMarkers) {
      const dup = detectedByKey.find(
        (prev) => prev.id === m.id && Math.hypot(prev.center.x - m.center.x, prev.center.y - m.center.y) < 18
      );
      if (!dup) {
        detectedByKey.push(m);
      } else if (m.dist < dup.dist) {
        Object.assign(dup, m);
      }
    }
  }

  const cornerMap = Object.create(null);
  const tileMarkers = [];
  for (const m of detectedByKey) {
    if (m.id >= 101 && m.id <= 104) {
      if (!cornerMap[m.id] || m.dist < cornerMap[m.id].dist) cornerMap[m.id] = m;
    } else if (TILE_BY_ID[m.id]) {
      tileMarkers.push(m);
    }
  }

  const cornerInfo = recoverFourthCornerParallelogram(cornerMap);
  const boardFound = cornerInfo.cornersFound >= 3;
  const detectedGrid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
  const placedTiles = [];

  let H_board = null;
  let H_boardInv = null;

  if (boardFound) {
    const srcBoardPts = [cornerInfo.p101, cornerInfo.p102, cornerInfo.p103, cornerInfo.p104];
    const dstBoardPts = [
      metrics.cornersMm[101],
      metrics.cornersMm[102],
      metrics.cornersMm[103],
      metrics.cornersMm[104]
    ];
    H_board = computeHomography(srcBoardPts, dstBoardPts);
    H_boardInv = computeHomography(dstBoardPts, srcBoardPts);

    if (H_board) {
      const tileW = metrics.tilePrintWmm;
      const tileH = metrics.tilePrintHmm;

      for (const m of tileMarkers) {
        const mCenterMm = applyHomography(H_board, m.center);
        const bTL = applyHomography(H_board, m.trueTL);
        const bTR = applyHomography(H_board, m.trueTR);
        if (!mCenterMm || !bTL || !bTR) continue;

        const angDeg = (Math.atan2(bTR.y - bTL.y, bTR.x - bTL.x) * 180) / Math.PI;
        const relRot = normalizeRot(Math.round(angDeg / 90) * 90);

        const span0 = getTileSpan(m.id, 0);
        const spanRot = getTileSpan(m.id, relRot);

        // Marker center offset from canonical 0-deg tile bounding-box center
        const v0x = -(span0.colSpan * 0.5 - TILE_MARKER_CENTER_RATIO) * tileW;
        const v0y = -(span0.rowSpan * 0.5 - TILE_MARKER_CENTER_RATIO) * tileH;
        const vRot = rotateVecCW(v0x, v0y, relRot);

        const bboxCenterMmX = mCenterMm.x - vRot.x;
        const bboxCenterMmY = mCenterMm.y - vRot.y;

        const anchorTopLeftX = bboxCenterMmX - spanRot.colSpan * 0.5 * tileW;
        const anchorTopLeftY = bboxCenterMmY - spanRot.rowSpan * 0.5 * tileH;

        const colIdx = Math.round((anchorTopLeftX - metrics.gridOriginMm.x) / tileW);
        const rowIdx = Math.round((anchorTopLeftY - metrics.gridOriginMm.y) / tileH);

        m.relRot = relRot;
        m.rowIdx = rowIdx;
        m.colIdx = colIdx;

        if (canPlaceTileAt(detectedGrid, rowIdx, colIdx, m.id, relRot)) {
          detectedGrid[rowIdx][colIdx] = { tileId: m.id, rot: relRot };
          placedTiles.push({ id: m.id, rot: relRot, row: rowIdx, col: colIdx });
        }
      }
    }
  }

  if (drawOverlay) {
    ctx.save();
    // Draw projected board grid lines if board is locked
    if (boardFound && H_boardInv) {
      ctx.strokeStyle = cornerInfo.recoveredCorner ? 'rgba(245, 158, 11, 0.72)' : 'rgba(16, 185, 129, 0.78)';
      ctx.lineWidth = 1.5;
      const gx = metrics.gridOriginMm.x;
      const gy = metrics.gridOriginMm.y;
      for (let r = 0; r <= rows; r++) {
        const a = applyHomography(H_boardInv, { x: gx, y: gy + r * metrics.tilePrintHmm });
        const b = applyHomography(H_boardInv, { x: gx + metrics.gridWmm, y: gy + r * metrics.tilePrintHmm });
        if (a && b) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      for (let c = 0; c <= cols; c++) {
        const a = applyHomography(H_boardInv, { x: gx + c * metrics.tilePrintWmm, y: gy });
        const b = applyHomography(H_boardInv, { x: gx + c * metrics.tilePrintWmm, y: gy + metrics.gridHmm });
        if (a && b) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      if (cornerInfo.recoveredCorner) {
        const rp = cornerInfo[`p${cornerInfo.recoveredCorner}`];
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, 14, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Draw detected marker quads & IDs
    for (const m of detectedByKey) {
      const isCorner = m.id >= 101;
      ctx.strokeStyle = isCorner ? '#38bdf8' : '#22c55e';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(m.corners[0].x, m.corners[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(m.corners[i].x, m.corners[i].y);
      ctx.closePath();
      ctx.stroke();

      const lbl = isCorner ? `#${m.id}` : `#${m.id} @${m.relRot ?? m.quadRot}°`;
      ctx.font = '700 11px monospace';
      const tw = ctx.measureText(lbl).width + 8;
      ctx.fillStyle = isCorner ? 'rgba(2, 132, 199, 0.9)' : 'rgba(16, 185, 129, 0.92)';
      ctx.fillRect(m.center.x - tw * 0.5, m.center.y - 9, tw, 18);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lbl, m.center.x, m.center.y);
    }
    ctx.restore();
  }

  return {
    boardFound,
    cornersFound: cornerInfo.cornersFound,
    recoveredCorner: cornerInfo.recoveredCorner,
    tileCount: placedTiles.length,
    detectedTiles: placedTiles,
    detectedGrid,
    rawMarkerCount: detectedByKey.length
  };
}

export function renderSyntheticTestBoard(
  targetCanvas,
  gridData,
  { paperKey = 'A4', orientation = 'landscape', rows = 7, cols = 7, tileWidthCm = 30 } = {}
) {
  const metrics = computeExact1to1Metrics({ paperKey, orientation, rows, cols });
  const srcCanvas = renderBaseBoardCanvas(metrics, {
    rows,
    cols,
    tileWidthCm,
    pxPerMm: 4,
    placedGridData: gridData
  });

  const sw = srcCanvas.width;
  const sh = srcCanvas.height;
  const dw = Math.max(1280, targetCanvas.width || 1280);
  const dh = Math.max(900, targetCanvas.height || 900);
  targetCanvas.width = dw;
  targetCanvas.height = dh;

  const srcPts = [
    { x: 0, y: 0 },
    { x: sw, y: 0 },
    { x: sw, y: sh },
    { x: 0, y: sh }
  ];
  const dstPts = [
    { x: dw * 0.1, y: dh * 0.08 },
    { x: dw * 0.92, y: dh * 0.12 },
    { x: dw * 0.88, y: dh * 0.91 },
    { x: dw * 0.06, y: dh * 0.88 }
  ];

  // Inverse homography from output canvas -> source print board
  const H_inv = computeHomography(dstPts, srcPts);
  const sCtx = srcCanvas.getContext('2d');
  const sData = sCtx.getImageData(0, 0, sw, sh).data;
  const dCtx = targetCanvas.getContext('2d');
  const outImg = dCtx.createImageData(dw, dh);
  const dData = outImg.data;

  // Desk dark backdrop + projected sheet
  for (let y = 0; y < dh; y++) {
    const shade = 0.92 + 0.08 * (1 - y / dh);
    for (let x = 0; x < dw; x++) {
      const idx = (y * dw + x) * 4;
      const sp = applyHomography(H_inv, { x, y });
      if (sp && sp.x >= 0 && sp.x < sw - 1 && sp.y >= 0 && sp.y < sh - 1) {
        const sx0 = sp.x | 0;
        const sy0 = sp.y | 0;
        const fx = sp.x - sx0;
        const fy = sp.y - sy0;
        const i00 = (sy0 * sw + sx0) * 4;
        const i10 = i00 + 4;
        const i01 = i00 + sw * 4;
        const i11 = i01 + 4;
        for (let ch = 0; ch < 3; ch++) {
          const val =
            (sData[i00 + ch] * (1 - fx) + sData[i10 + ch] * fx) * (1 - fy) +
            (sData[i01 + ch] * (1 - fx) + sData[i11 + ch] * fx) * fy;
          dData[idx + ch] = Math.min(255, Math.max(0, (val * shade) | 0));
        }
        dData[idx + 3] = 255;
      } else {
        dData[idx] = 24;
        dData[idx + 1] = 32;
        dData[idx + 2] = 48;
        dData[idx + 3] = 255;
      }
    }
  }
  dCtx.putImageData(outImg, 0, 0);
  return { metrics };
}
