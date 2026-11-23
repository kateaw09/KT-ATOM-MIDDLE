'use strict';

import { PAPER_SPECS, STANDARD_TILES, TILE_BY_ID, getCellOccupancyMap, getTileSpan } from './fieldTiles.js';
import { drawArUcoMarker } from './aruco.js';
import { drawStandardTileGraphic, drawTunnel2x1Graphic } from './fieldRenderer.js';

export function computeExact1to1Metrics({
  paperKey = 'A4',
  orientation = 'landscape',
  rows = 7,
  cols = 7
} = {}) {
  const spec = PAPER_SPECS[paperKey] || PAPER_SPECS.A4;
  const rawW = spec.widthMm;
  const rawH = spec.heightMm;
  const paperW = orientation === 'portrait' ? Math.min(rawW, rawH) : Math.max(rawW, rawH);
  const paperH = orientation === 'portrait' ? Math.max(rawW, rawH) : Math.min(rawW, rawH);

  const pageMarginMm = 10;
  const headerHmm = 14;
  const markerSizeMm = 18;
  const markerGapMm = 4;

  const sideReserveMm = markerSizeMm + markerGapMm;
  const availW = Math.max(20, paperW - pageMarginMm * 2 - sideReserveMm * 2);
  const availH = Math.max(20, paperH - pageMarginMm * 2 - headerHmm - 8);

  const cellSizeMm = Math.floor(Math.min(availW / cols, availH / rows) * 10) / 10;
  const gridWmm = cellSizeMm * cols;
  const gridHmm = cellSizeMm * rows;

  const gridOriginX = (paperW - gridWmm) * 0.5;
  const gridOriginY = pageMarginMm + headerHmm + (paperH - pageMarginMm * 2 - headerHmm - gridHmm) * 0.5;

  const leftMarkerX = gridOriginX - markerGapMm - markerSizeMm;
  const rightMarkerX = gridOriginX + gridWmm + markerGapMm;
  const topMarkerY = gridOriginY;
  const botMarkerY = gridOriginY + gridHmm - markerSizeMm;

  const cornersMm = {
    101: { x: leftMarkerX + markerSizeMm * 0.5, y: topMarkerY + markerSizeMm * 0.5, topX: leftMarkerX, topY: topMarkerY },
    102: { x: rightMarkerX + markerSizeMm * 0.5, y: topMarkerY + markerSizeMm * 0.5, topX: rightMarkerX, topY: topMarkerY },
    103: { x: leftMarkerX + markerSizeMm * 0.5, y: botMarkerY + markerSizeMm * 0.5, topX: leftMarkerX, topY: botMarkerY },
    104: { x: rightMarkerX + markerSizeMm * 0.5, y: botMarkerY + markerSizeMm * 0.5, topX: rightMarkerX, topY: botMarkerY }
  };

  return {
    paperKey: spec.key,
    orientation,
    paperW,
    paperH,
    pageMarginMm,
    headerHmm,
    markerSizeMm,
    markerGapMm,
    rows,
    cols,
    tilePrintWmm: cellSizeMm,
    tilePrintHmm: cellSizeMm,
    gridOriginMm: { x: gridOriginX, y: gridOriginY },
    gridWmm,
    gridHmm,
    cornersMm
  };
}

function createSheetCanvas(paperW, paperH, pxPerMm) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(paperW * pxPerMm);
  canvas.height = Math.round(paperH * pxPerMm);
  canvas.style.width = `${paperW}mm`;
  canvas.style.height = `${paperH}mm`;
  return canvas;
}

export function renderBaseBoardCanvas(
  metrics,
  { rows = metrics.rows, cols = metrics.cols, tileWidthCm = 30, pxPerMm = 5, placedGridData = null } = {}
) {
  const canvas = createSheetCanvas(metrics.paperW, metrics.paperH, pxPerMm);
  const ctx = canvas.getContext('2d');
  const s = pxPerMm;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header
  const mx = metrics.pageMarginMm * s;
  const my = metrics.pageMarginMm * s;
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 ${Math.round(4.2 * s)}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('KT_ATOM_Middle - [MAP MANAGER] | Base Board (1:1)', mx, my);

  ctx.fillStyle = '#475569';
  ctx.font = `500 ${Math.round(2.9 * s)}px monospace`;
  ctx.fillText(
    `${metrics.paperKey} ${metrics.orientation} | Grid ${cols}×${rows} | Cell ${metrics.tilePrintWmm.toFixed(1)}×${metrics.tilePrintHmm.toFixed(1)}mm | Real Tile ${tileWidthCm}cm`,
    mx,
    my + 5.6 * s
  );

  // 50mm Calibration Ruler at top-right
  const rulerW = 50 * s;
  const rulerX = (metrics.paperW - metrics.pageMarginMm) * s - rulerW;
  const rulerY = my + 2.5 * s;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = Math.max(1, 0.35 * s);
  ctx.beginPath();
  ctx.moveTo(rulerX, rulerY);
  ctx.lineTo(rulerX + rulerW, rulerY);
  for (let mm = 0; mm <= 50; mm += 10) {
    const tx = rulerX + mm * s;
    ctx.moveTo(tx, rulerY - 1.5 * s);
    ctx.lineTo(tx, rulerY + 1.5 * s);
  }
  ctx.stroke();
  ctx.fillStyle = '#334155';
  ctx.font = `700 ${Math.round(2.4 * s)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('1:1 Scale Check = 50 mm', rulerX + rulerW * 0.5, rulerY + 2.6 * s);

  // 4 Corner Registration Markers (101, 102, 103, 104)
  for (const id of [101, 102, 103, 104]) {
    const cm = metrics.cornersMm[id];
    drawArUcoMarker(ctx, id, cm.topX * s, cm.topY * s, metrics.markerSizeMm * s);
    ctx.fillStyle = '#334155';
    ctx.font = `700 ${Math.round(2.6 * s)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`#${id}`, cm.x * s, (cm.topY + metrics.markerSizeMm + 0.8) * s);
  }

  // Exact 1:1 Base Grid
  const gx = metrics.gridOriginMm.x * s;
  const gy = metrics.gridOriginMm.y * s;
  const cw = metrics.tilePrintWmm * s;
  const ch = metrics.tilePrintHmm * s;

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = Math.max(1, 0.25 * s);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = gx + c * cw;
      const cy = gy + r * ch;
      ctx.strokeRect(cx, cy, cw, ch);
      if (!placedGridData) {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = `600 ${Math.round(2.4 * s)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${r},${c}`, cx + cw * 0.5, cy + ch * 0.5);
      }
    }
  }

  if (placedGridData) {
    const occ = getCellOccupancyMap(placedGridData);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const info = occ[`${r},${c}`];
        if (!info || !info.isAnchor) continue;
        const cx = gx + c * cw;
        const cy = gy + r * ch;
        if (info.rowSpan > 1 || info.colSpan > 1) {
          drawTunnel2x1Graphic(ctx, cx, cy, info.colSpan * cw, info.rowSpan * ch, info.cell.rot, {
            showMarker: true,
            forPrint: true,
            showIdBadge: true
          });
        } else {
          drawStandardTileGraphic(ctx, info.cell.tileId, cx, cy, cw, info.cell.rot, {
            showMarker: true,
            forPrint: true,
            showIdBadge: true
          });
        }
      }
    }
  }

  // Outer strong grid border
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = Math.max(1.5, 0.45 * s);
  ctx.strokeRect(gx, gy, metrics.gridWmm * s, metrics.gridHmm * s);

  return canvas;
}

export function renderPrintSheets(
  containerEl,
  {
    paperKey = 'A4',
    orientation = 'landscape',
    rows = 7,
    cols = 7,
    tileWidthCm = 30,
    printQuantities = {},
    printEnabled = null
  } = {}
) {
  const metrics = computeExact1to1Metrics({ paperKey, orientation, rows, cols });
  if (!containerEl) return { metrics, sheetCount: 0, totalCutouts: 0, selectedTypesCount: 0 };

  containerEl.innerHTML = '';
  const pxPerMm = 5;

  // Sheet 1: Base Board
  const sheet1Wrap = document.createElement('div');
  sheet1Wrap.className = 'paper-sheet';
  sheet1Wrap.style.width = `${metrics.paperW}mm`;
  sheet1Wrap.style.height = `${metrics.paperH}mm`;
  const baseCanvas = renderBaseBoardCanvas(metrics, { rows, cols, tileWidthCm, pxPerMm });
  sheet1Wrap.appendChild(baseCanvas);
  containerEl.appendChild(sheet1Wrap);

  // Build ordered list of cutout pieces
  const pieces = [];
  let selectedTypesCount = 0;
  for (const tile of STANDARD_TILES) {
    const id = tile.id;
    if (printEnabled && printEnabled[id] === false) continue;
    const qty = Math.max(0, Math.min(99, parseInt(printQuantities[id], 10) || 0));
    if (qty <= 0) continue;
    selectedTypesCount++;
    const span = getTileSpan(id, 0);
    for (let k = 0; k < qty; k++) {
      pieces.push({
        id,
        wMm: span.colSpan * metrics.tilePrintWmm,
        hMm: span.rowSpan * metrics.tilePrintHmm,
        isTunnel: !!tile.tunnel
      });
    }
  }

  // Pack pieces onto Cutout Sheets (Sheet 2+)
  const margin = metrics.pageMarginMm;
  const headerH = 12;
  const gapMm = 3;
  const usableW = metrics.paperW - margin * 2;
  const usableH = metrics.paperH - margin * 2 - headerH;

  let sheetIndex = 2;
  let idx = 0;

  while (idx < pieces.length) {
    const sheetCanvas = createSheetCanvas(metrics.paperW, metrics.paperH, pxPerMm);
    const ctx = sheetCanvas.getContext('2d');
    const s = pxPerMm;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);

    ctx.fillStyle = '#0f172a';
    ctx.font = `700 ${Math.round(3.8 * s)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `KT_ATOM_Middle - [MAP MANAGER] | Cutout Tiles Sheet #${sheetIndex - 1} (Exact 1:1 Cutouts)`,
      margin * s,
      margin * s
    );
    ctx.fillStyle = '#475569';
    ctx.font = `500 ${Math.round(2.6 * s)}px monospace`;
    ctx.fillText(
      `Cut along dashed lines — 1×1 = ${metrics.tilePrintWmm.toFixed(1)}×${metrics.tilePrintHmm.toFixed(1)}mm | 2×1 = ${(metrics.tilePrintWmm * 2).toFixed(1)}×${metrics.tilePrintHmm.toFixed(1)}mm`,
      margin * s,
      (margin + 5) * s
    );

    let cursorX = margin;
    let cursorY = margin + headerH;
    let rowMaxH = 0;
    let placedOnSheet = 0;

    while (idx < pieces.length) {
      const p = pieces[idx];
      if (cursorX + p.wMm > margin + usableW + 0.01) {
        cursorX = margin;
        cursorY += rowMaxH + gapMm;
        rowMaxH = 0;
      }
      if (cursorY + p.hMm > margin + headerH + usableH + 0.01) {
        if (placedOnSheet === 0) {
          // Force place if single piece barely exceeds area
        } else {
          break;
        }
      }

      const px = cursorX * s;
      const py = cursorY * s;
      const pw = p.wMm * s;
      const ph = p.hMm * s;

      if (p.isTunnel) {
        drawTunnel2x1Graphic(ctx, px, py, pw, ph, 0, {
          showMarker: true,
          forPrint: true,
          showIdBadge: true
        });
      } else {
        drawStandardTileGraphic(ctx, p.id, px, py, pw, 0, {
          showMarker: true,
          forPrint: true,
          showIdBadge: true
        });
      }

      // Dashed outer cut line
      ctx.save();
      ctx.setLineDash([1.6 * s, 1.4 * s]);
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = Math.max(1, 0.28 * s);
      ctx.strokeRect(px, py, pw, ph);
      ctx.restore();

      cursorX += p.wMm + gapMm;
      rowMaxH = Math.max(rowMaxH, p.hMm);
      placedOnSheet++;
      idx++;
    }

    const wrap = document.createElement('div');
    wrap.className = 'paper-sheet';
    wrap.style.width = `${metrics.paperW}mm`;
    wrap.style.height = `${metrics.paperH}mm`;
    wrap.appendChild(sheetCanvas);
    containerEl.appendChild(wrap);
    sheetIndex++;
  }

  return {
    metrics,
    sheetCount: sheetIndex - 1,
    totalCutouts: pieces.length,
    selectedTypesCount
  };
}
