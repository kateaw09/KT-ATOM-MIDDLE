'use strict';

import {
  STANDARD_TILES,
  TILE_BY_ID,
  TILE_CATEGORIES,
  normalizeRot,
  getTileSpan,
  getCellOccupancyMap,
  canPlaceTileAt,
  resolveTileSemantics
} from './fieldTiles.js';
import {
  drawStandardTileGraphic,
  render2DFieldGrid,
  renderIsometricGrid
} from './fieldRenderer.js';
import { computeExact1to1Metrics, renderPrintSheets } from './printGenerator.js';
import { scanBoardFromCanvasFrame, renderSyntheticTestBoard } from './visionScanner.js';
import {
  createEmptyGrid,
  cloneGridData,
  resizeGridData,
  countTilesInGrid,
  loadRescueMiddlePreset,
  buildExportJsonPayload,
  parseImportJsonPayload
} from './fieldJson.js';

export function createMapManagerController({
  getFieldState,
  setFieldState,
  getSimContext,
  onFieldChanged,
  onBackToSim,
  appendConsole
}) {
  const $ = (id) => document.getElementById(id);

  const ui = {
    activeTab: 'design',
    selectedTileId: 1,
    placeRot: 0,
    tool: 'place', // 'place' | 'erase'
    categoryFilter: 'all',
    designViewMode: '2d', // '2d' | 'iso'
    cameraRot: 0,
    showMarkers: true,
    showRobotPath: true,
    hoverCell: null,
    selectedCell: null,
    lastLayout2D: null,

    paperKey: 'A4',
    orientation: 'landscape',
    defaultPrintQty: 5,
    printQuantities: {},
    printEnabled: Object.create(null),
    printSelectMode: false,

    stream: null,
    rafId: null,
    isMirrored: true,
    autoCountdown: true,
    countdownActive: false,
    countdownStartTs: 0,
    bestScannedGrid: null,
    bestScannedCount: -1,
    latestDetectedGrid: null,
    lastScanStats: null
  };

  function getField() {
    return getFieldState();
  }

  function applyCountsToPrintState(counts) {
    for (const tile of STANDARD_TILES) {
      const cnt = Math.max(0, parseInt(counts?.[tile.id], 10) || 0);
      if (cnt > 0) {
        ui.printQuantities[tile.id] = cnt;
        ui.printEnabled[tile.id] = true;
      } else {
        ui.printEnabled[tile.id] = false;
        if (!(ui.printQuantities[tile.id] > 0)) {
          ui.printQuantities[tile.id] = ui.defaultPrintQty;
        }
      }
    }
  }

  function syncQuantitiesFromField(renderNow = true) {
    const f = getField();
    applyCountsToPrintState(countTilesInGrid(f.gridData));
    if (renderNow) {
      renderPrintQuantitySelector();
      updatePrintPreview();
    }
  }

  function setActiveMapTab(tabName) {
    if (ui.activeTab === 'scan' && tabName !== 'scan') {
      stopWebcam();
    }
    ui.activeTab = tabName;

    document.querySelectorAll('.map-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mapTab === tabName);
    });
    ['design', 'print', 'scan'].forEach((t) => {
      const panel = $(`tab-${t}`);
      if (panel) panel.classList.toggle('active', t === tabName);
    });

    if (tabName === 'design') {
      renderDesignCanvas();
    } else if (tabName === 'print') {
      renderPrintQuantitySelector();
      updatePrintPreview();
    } else if (tabName === 'scan') {
      refreshJsonPreview();
    }
  }

  // ============================================================================
  // Module 1: Modular Field Designer & 3D Isometric Engine (#tab-design)
  // ============================================================================
  function renderCategoryFilters() {
    const wrap = $('mapCategoryFilters');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (const cat of TILE_CATEGORIES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `map-cat-btn${ui.categoryFilter === cat.id ? ' active' : ''}`;
      btn.textContent = cat.label;
      btn.onclick = () => {
        ui.categoryFilter = cat.id;
        renderCategoryFilters();
        renderStandardCatalog();
      };
      wrap.appendChild(btn);
    }
  }

  function renderStandardCatalog() {
    const container = $('mapTileCatalog');
    if (!container) return;
    container.innerHTML = '';

    const tiles = STANDARD_TILES.filter(
      (t) => ui.categoryFilter === 'all' || t.category === ui.categoryFilter
    );

    for (const tile of tiles) {
      const card = document.createElement('button');
      card.type = 'button';
      const isSelected = ui.tool === 'place' && ui.selectedTileId === tile.id;
      card.className = `tile-card${tile.spanCols === 2 ? ' span-2' : ''}${isSelected ? ' selected' : ''}`;
      card.title = `${tile.id}: ${tile.name}\n${tile.baseRule}`;

      const thumb = document.createElement('canvas');
      thumb.width = tile.spanCols === 2 ? 128 : 64;
      thumb.height = 64;
      const tctx = thumb.getContext('2d');
      tctx.fillStyle = '#0f172a';
      tctx.fillRect(0, 0, thumb.width, thumb.height);

      if (tile.tunnel) {
        drawStandardTileGraphic(tctx, tile.id, 4, 4, 56, 0, {
          span2Box: { w: 120, h: 56 },
          showMarker: false,
          showIdBadge: false
        });
      } else {
        drawStandardTileGraphic(tctx, tile.id, 4, 4, 56, 0, {
          showMarker: false,
          showIdBadge: false,
          isCatalogPreview: true
        });
      }

      const meta = document.createElement('div');
      meta.className = 'tile-card-meta';
      meta.innerHTML = `<span class="tile-id">#${tile.id}</span><span class="tile-name">${tile.shortName}</span>`;

      card.append(thumb, meta);
      card.onclick = () => {
        ui.tool = 'place';
        ui.selectedTileId = tile.id;
        syncToolButtons();
        renderStandardCatalog();
        renderDesignCanvas();
      };
      container.appendChild(card);
    }
  }

  function syncToolButtons() {
    if ($('mapToolPlace')) $('mapToolPlace').classList.toggle('active', ui.tool === 'place');
    if ($('mapToolErase')) $('mapToolErase').classList.toggle('active', ui.tool === 'erase');
    if ($('mapPlaceRotBtn')) {
      const lbl = $('mapPlaceRotBtn').querySelector('span');
      if (lbl) lbl.textContent = `หมุน ${ui.placeRot}°`;
    }
    if ($('mapViewMode2D')) $('mapViewMode2D').classList.toggle('active', ui.designViewMode === '2d');
    if ($('mapViewModeIso')) $('mapViewModeIso').classList.toggle('active', ui.designViewMode === 'iso');
    if ($('mapCamRotBtn')) {
      const lbl = $('mapCamRotBtn').querySelector('span');
      if (lbl) lbl.textContent = `กล้อง ${ui.cameraRot}°`;
      $('mapCamRotBtn').disabled = ui.designViewMode !== 'iso';
    }
    if ($('mapShowMarkersChk')) $('mapShowMarkersChk').checked = ui.showMarkers;
    if ($('mapShowRobotPathChk')) $('mapShowRobotPathChk').checked = ui.showRobotPath;
  }

  function updateInspectorBar(cellCoord) {
    const f = getField();
    const coordEl = $('inspCoord');
    const titleEl = $('inspTileTitle');
    const elevEl = $('inspElevation');
    const cubeEl = $('inspCube');
    const rulesEl = $('inspRules');

    if (!cellCoord) {
      if (coordEl) coordEl.textContent = '(-, -)';
      if (titleEl) titleEl.textContent = 'คลิกซ้ายวาง/ลบ · คลิกขวาหมุน 90°';
      if (elevEl) elevEl.textContent = 'ฐาน 5mm';
      if (cubeEl) cubeEl.textContent = '-';
      if (rulesEl) rulesEl.textContent = 'เลื่อนเมาส์เหนือตารางเพื่อตรวจสอบกติกาและเรขาคณิต 3D ของแผ่นสนาม';
      return;
    }

    const occ = getCellOccupancyMap(f.gridData);
    const info = occ[`${cellCoord.r},${cellCoord.c}`];
    if (coordEl) coordEl.textContent = `(R${cellCoord.r}, C${cellCoord.c})`;

    if (!info) {
      if (titleEl) titleEl.textContent = 'ช่องว่าง (Empty Slot)';
      if (elevEl) elevEl.textContent = 'ระดับฐาน: 5mm';
      if (cubeEl) cubeEl.textContent = '-';
      if (rulesEl) rulesEl.textContent = 'คลิกซ้ายเพื่อวางแผ่นสนามที่เลือกจากคลังด้านซ้าย';
      return;
    }

    const sem = resolveTileSemantics(info.cell.tileId, info.cell.rot);
    const eh = sem.elevation_3d.edge_heights_mm;
    if (titleEl) {
      const spanTag = sem.grid_span.colSpan > 1 || sem.grid_span.rowSpan > 1 ? ` [${sem.grid_span.colSpan}×${sem.grid_span.rowSpan}]` : '';
      titleEl.textContent = `#${sem.id} ${sem.name} @${sem.rotation_deg}°${spanTag}`;
    }
    if (elevEl) {
      if (sem.elevation_3d.tunnel_spec) {
        elevEl.textContent = `สูง ${sem.elevation_3d.tunnel_spec.dimensions_mm.height}mm (600×300mm)`;
      } else if (sem.elevation_3d.seesaw_spec) {
        elevEl.textContent = `เอียง ${sem.elevation_3d.seesaw_spec.tiltDeg}° (${sem.elevation_3d.seesaw_spec.lowEndMm}→${sem.elevation_3d.seesaw_spec.highEndMm}mm)`;
      } else if (sem.elevation_3d.elevated_cube_enclosure) {
        elevEl.textContent = `แท่น 50mm / กำแพง 100mm`;
      } else {
        elevEl.textContent = `T:${eh.top} R:${eh.right} B:${eh.bottom} L:${eh.left} mm`;
      }
    }
    if (cubeEl) {
      cubeEl.textContent = sem.cube_drop
        ? `${sem.cube_drop.color_th} (${sem.cube_drop.elevated_mm}mm)`
        : sem.checkpoint
          ? 'Check Point'
          : sem.special
            ? sem.special.toUpperCase()
            : '-';
    }
    if (rulesEl) rulesEl.textContent = sem.robot_rules;
  }

  function renderDesignCanvas() {
    const canvas = $('mapDesignCanvas');
    if (!canvas) return;
    const f = getField();
    const simCtx = ui.showRobotPath && getSimContext ? getSimContext() : null;

    if (ui.designViewMode === 'iso') {
      ui.lastLayout2D = null;
      renderIsometricGrid(canvas, f.gridData, {
        cameraRotDeg: ui.cameraRot,
        tileWidthCm: f.tileWidthCm,
        selectedCell: ui.selectedCell || ui.hoverCell,
        simOverlay: simCtx ? { ...simCtx, tileWidthCm: f.tileWidthCm } : null
      });
    } else {
      let hoverValid = true;
      if (ui.hoverCell && ui.tool === 'place') {
        const occ = getCellOccupancyMap(f.gridData);
        const existing = occ[`${ui.hoverCell.r},${ui.hoverCell.c}`];
        hoverValid = canPlaceTileAt(
          f.gridData,
          ui.hoverCell.r,
          ui.hoverCell.c,
          ui.selectedTileId,
          ui.placeRot,
          existing ? { r: existing.anchorR, c: existing.anchorC } : null
        );
      }
      ui.lastLayout2D = render2DFieldGrid(canvas, f.gridData, {
        showMarkers: ui.showMarkers,
        hoverCell: ui.tool === 'place' ? ui.hoverCell : null,
        hoverTileId: ui.selectedTileId,
        hoverRot: ui.placeRot,
        hoverValid,
        selectedCell: ui.selectedCell,
        simOverlay: simCtx ? { ...simCtx, tileWidthCm: f.tileWidthCm } : null
      });
    }
  }

  function getCellFromCanvasPointer(canvas, clientX, clientY) {
    const layout = ui.lastLayout2D;
    if (!layout) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    const px = (clientX - rect.left) * scaleX;
    const py = (clientY - rect.top) * scaleY;
    const c = Math.floor((px - layout.offX) / layout.cellPx);
    const r = Math.floor((py - layout.offY) / layout.cellPx);
    const f = getField();
    if (r < 0 || c < 0 || r >= f.rows || c >= f.cols) return null;
    return { r, c };
  }

  function commitFieldMutation(newGrid, syncStart = false) {
    const f = getField();
    setFieldState({ ...f, gridData: newGrid });
    syncQuantitiesFromField(ui.activeTab === 'print');
    renderDesignCanvas();
    if (ui.activeTab === 'scan') refreshJsonPreview();
    if (onFieldChanged) onFieldChanged({ syncStart });
  }

  function setupDesignCanvasEvents() {
    const canvas = $('mapDesignCanvas');
    if (!canvas) return;

    canvas.addEventListener('mousemove', (e) => {
      if (ui.designViewMode !== '2d') return;
      const cell = getCellFromCanvasPointer(canvas, e.clientX, e.clientY);
      const changed =
        (!cell && ui.hoverCell) ||
        (cell && !ui.hoverCell) ||
        (cell && ui.hoverCell && (cell.r !== ui.hoverCell.r || cell.c !== ui.hoverCell.c));
      if (changed) {
        ui.hoverCell = cell;
        updateInspectorBar(cell || ui.selectedCell);
        renderDesignCanvas();
      }
    });

    canvas.addEventListener('mouseleave', () => {
      ui.hoverCell = null;
      updateInspectorBar(ui.selectedCell);
      renderDesignCanvas();
    });

    canvas.addEventListener('click', (e) => {
      if (ui.designViewMode !== '2d') {
        if (appendConsole) appendConsole('[INFO] สลับเป็นมุมมอง 2D Top-Down เพื่อคลิกวาง/ลบแผ่นสนาม');
        return;
      }
      const pos = getCellFromCanvasPointer(canvas, e.clientX, e.clientY);
      if (!pos) return;
      ui.selectedCell = pos;

      const f = getField();
      const nextGrid = cloneGridData(f.gridData);
      const occ = getCellOccupancyMap(nextGrid);
      const existing = occ[`${pos.r},${pos.c}`];

      if (ui.tool === 'erase') {
        if (existing) {
          nextGrid[existing.anchorR][existing.anchorC] = null;
          commitFieldMutation(nextGrid);
          updateInspectorBar(pos);
        }
        return;
      }

      // Clicking exact same 1x1 tile + rotation toggles it off to white/empty if desired, or replaces
      if (
        existing &&
        existing.isAnchor &&
        existing.cell.tileId === ui.selectedTileId &&
        existing.cell.rot === ui.placeRot
      ) {
        nextGrid[existing.anchorR][existing.anchorC] = null;
        commitFieldMutation(nextGrid);
        updateInspectorBar(pos);
        return;
      }

      const ignoreAnchor = existing ? { r: existing.anchorR, c: existing.anchorC } : null;
      if (!canPlaceTileAt(nextGrid, pos.r, pos.c, ui.selectedTileId, ui.placeRot, ignoreAnchor)) {
        if (appendConsole) {
          appendConsole(`[WARN] พื้นที่ไม่พอวางแผ่น #${ui.selectedTileId} (${ui.placeRot}°) ที่ (${pos.r}, ${pos.c})`);
        }
        return;
      }

      if (existing) nextGrid[existing.anchorR][existing.anchorC] = null;
      nextGrid[pos.r][pos.c] = { tileId: ui.selectedTileId, rot: ui.placeRot };
      commitFieldMutation(nextGrid);
      updateInspectorBar(pos);
    });

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (ui.designViewMode !== '2d') {
        ui.cameraRot = normalizeRot(ui.cameraRot + 90);
        syncToolButtons();
        renderDesignCanvas();
        return;
      }

      const pos = getCellFromCanvasPointer(canvas, e.clientX, e.clientY);
      if (!pos) return;
      ui.selectedCell = pos;

      const f = getField();
      const nextGrid = cloneGridData(f.gridData);
      const occ = getCellOccupancyMap(nextGrid);
      const existing = occ[`${pos.r},${pos.c}`];
      if (!existing) return;

      const nextRot = normalizeRot(existing.cell.rot + 90);
      const ignore = { r: existing.anchorR, c: existing.anchorC };
      const candidates = [
        [existing.anchorR, existing.anchorC],
        [existing.anchorR, Math.max(0, existing.anchorC - 1)],
        [Math.max(0, existing.anchorR - 1), existing.anchorC]
      ];

      let rotated = false;
      for (const [tr, tc] of candidates) {
        if (canPlaceTileAt(nextGrid, tr, tc, existing.cell.tileId, nextRot, ignore)) {
          nextGrid[existing.anchorR][existing.anchorC] = null;
          nextGrid[tr][tc] = { tileId: existing.cell.tileId, rot: nextRot };
          rotated = true;
          break;
        }
      }

      if (!rotated) {
        if (appendConsole) {
          appendConsole(`[WARN] ไม่สามารถหมุนแผ่น #${existing.cell.tileId} เป็น ${nextRot}° ได้เนื่องจากติดขอบหรือแผ่นข้างเคียง`);
        }
        return;
      }

      commitFieldMutation(nextGrid);
      updateInspectorBar(pos);
    });
  }

  // ============================================================================
  // Module 2: Exact 1:1 Print & Cutout Sheet Generator (#tab-print)
  // ============================================================================
  function renderPrintQuantitySelector() {
    const grid = $('printQtyGrid');
    if (!grid) return;
    grid.innerHTML = '';
    grid.classList.toggle('select-mode', !!ui.printSelectMode);

    if ($('printSelectModeToggle')) {
      $('printSelectModeToggle').classList.toggle('active', !!ui.printSelectMode);
      const lbl = $('printSelectModeToggle').querySelector('span');
      if (lbl) lbl.textContent = ui.printSelectMode ? 'โหมดติ๊กเลือกเร็ว: เปิด' : 'โหมดติ๊กเลือกเร็ว';
    }
    if ($('printBtnApplyDefaultQty')) {
      const lbl = $('printBtnApplyDefaultQty').querySelector('span');
      if (lbl) lbl.textContent = `ตั้งค่าทุกแบบเป็น ${ui.defaultPrintQty} ชิ้น`;
    }

    for (const tile of STANDARD_TILES) {
      const qty = Math.max(0, parseInt(ui.printQuantities[tile.id], 10) || 0);
      const enabled = ui.printEnabled[tile.id] !== false;
      const card = document.createElement('div');
      card.className = `print-qty-card${enabled && qty > 0 ? ' active' : ''}${!enabled ? ' unchecked' : ''}`;

      const topRow = document.createElement('div');
      topRow.className = 'print-qty-top';
      const chkLabel = document.createElement('label');
      chkLabel.className = 'print-qty-chk-wrap';
      chkLabel.title = 'ติ๊กเลือก / ไม่เลือกพิมพ์แผ่นนี้ (คงจำนวนเดิมไว้)';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = enabled;
      chk.onchange = () => {
        ui.printEnabled[tile.id] = chk.checked;
        if (chk.checked && (ui.printQuantities[tile.id] || 0) <= 0) {
          ui.printQuantities[tile.id] = ui.defaultPrintQty;
        }
        renderPrintQuantitySelector();
        updatePrintPreview();
      };
      const idSpan = document.createElement('span');
      idSpan.textContent = `#${tile.id}`;
      chkLabel.append(chk, idSpan);
      topRow.appendChild(chkLabel);

      const thumb = document.createElement('canvas');
      thumb.width = tile.spanCols === 2 ? 96 : 56;
      thumb.height = 56;
      const tctx = thumb.getContext('2d');
      tctx.fillStyle = '#0f172a';
      tctx.fillRect(0, 0, thumb.width, thumb.height);
      if (tile.tunnel) {
        drawStandardTileGraphic(tctx, tile.id, 4, 4, 48, 0, {
          span2Box: { w: 88, h: 48 },
          showMarker: false,
          showIdBadge: false
        });
      } else {
        drawStandardTileGraphic(tctx, tile.id, 4, 4, 48, 0, {
          showMarker: false,
          showIdBadge: false,
          isCatalogPreview: true
        });
      }

      const title = document.createElement('div');
      title.className = 'print-qty-title';
      title.textContent = tile.shortName;

      const stepper = document.createElement('div');
      stepper.className = 'print-qty-stepper';

      const btnMinus = document.createElement('button');
      btnMinus.type = 'button';
      btnMinus.className = 'qty-step-btn';
      btnMinus.textContent = '-';
      btnMinus.onclick = (e) => {
        e.stopPropagation();
        const curQty = Math.max(0, parseInt(ui.printQuantities[tile.id], 10) || 0);
        const minQty = ui.printEnabled[tile.id] === false ? 1 : 0;
        const nextQty = Math.max(minQty, curQty - 1);
        ui.printQuantities[tile.id] = nextQty;
        if (nextQty === 0) ui.printEnabled[tile.id] = false;
        renderPrintQuantitySelector();
        updatePrintPreview();
      };

      const countSpan = document.createElement('span');
      countSpan.className = 'qty-step-val';
      countSpan.textContent = String(qty);

      const btnPlus = document.createElement('button');
      btnPlus.type = 'button';
      btnPlus.className = 'qty-step-btn';
      btnPlus.textContent = '+';
      btnPlus.onclick = (e) => {
        e.stopPropagation();
        ui.printQuantities[tile.id] = Math.min(99, (ui.printQuantities[tile.id] || 0) + 1);
        ui.printEnabled[tile.id] = true;
        renderPrintQuantitySelector();
        updatePrintPreview();
      };

      if (ui.printSelectMode) {
        card.onclick = (e) => {
          if (e.target.closest('.qty-step-btn, .print-qty-chk-wrap')) return;
          const next = ui.printEnabled[tile.id] === false;
          ui.printEnabled[tile.id] = next;
          if (next && (ui.printQuantities[tile.id] || 0) <= 0) {
            ui.printQuantities[tile.id] = ui.defaultPrintQty;
          }
          renderPrintQuantitySelector();
          updatePrintPreview();
        };
      }

      stepper.append(btnMinus, countSpan, btnPlus);
      card.append(topRow, thumb, title, stepper);
      grid.appendChild(card);
    }
  }

  function updatePrintPreview() {
    const f = getField();
    const container = $('printSheetsContainer');
    const summary = renderPrintSheets(container, {
      paperKey: ui.paperKey,
      orientation: ui.orientation,
      rows: f.rows,
      cols: f.cols,
      tileWidthCm: f.tileWidthCm,
      printQuantities: ui.printQuantities,
      printEnabled: ui.printEnabled
    });

    if ($('printMetricsText')) {
      const w = summary.metrics.tilePrintWmm.toFixed(1);
      const h = summary.metrics.tilePrintHmm.toFixed(1);
      $('printMetricsText').textContent =
        `เลือกพิมพ์ ${summary.selectedTypesCount}/${STANDARD_TILES.length} แบบ · 1:1 = ${w}×${h} mm (2×1 = ${(summary.metrics.tilePrintWmm * 2).toFixed(1)}×${h} mm) · ชิ้นตัด ${summary.totalCutouts} ชิ้น · รวม ${summary.sheetCount} หน้า`;
    }
  }

  function getPrintMetrics() {
    const f = getField();
    return computeExact1to1Metrics({
      paperKey: ui.paperKey,
      orientation: ui.orientation,
      rows: f.rows,
      cols: f.cols
    });
  }

  // ============================================================================
  // Module 3: Offline Computer Vision Webcam Scanner & 3D JSON Pipeline (#tab-scan)
  // ============================================================================
  function updateScanStatus(msg, tone = 'neutral') {
    const el = $('scanStatusText');
    if (!el) return;
    el.textContent = msg;
    el.dataset.tone = tone;
  }

  function toggleMirrorWebcam() {
    ui.isMirrored = !ui.isMirrored;
    const canvas = $('scanCanvas');
    if (canvas) canvas.classList.toggle('mirrored', ui.isMirrored);
    const btn = $('scanBtnMirrorCam');
    if (btn) {
      btn.classList.toggle('active', ui.isMirrored);
      const lbl = btn.querySelector('span');
      if (lbl) lbl.textContent = ui.isMirrored ? 'กลับด้านภาพ: เปิด' : 'กลับด้านภาพ: ปิด';
    }
  }

  function hideCountdownOverlay() {
    ui.countdownActive = false;
    const ov = $('scanCountdownOverlay');
    if (ov) ov.hidden = true;
  }

  function showScanResults(gridData, stats) {
    ui.latestDetectedGrid = cloneGridData(gridData);
    ui.lastScanStats = stats;

    const panel = $('scanResultPanel');
    if (panel) panel.hidden = false;
    if ($('scanResultSummary')) {
      const recoverNote = stats.recoveredCorner ? ` (กู้คืนมุม #${stats.recoveredCorner})` : '';
      $('scanResultSummary').textContent =
        `ตรวจพบกระดานครบ ${stats.cornersFound}/4 มุม${recoverNote} · อ่านแผ่นสนามได้ ${stats.tileCount} ชิ้น`;
    }

    const p2d = $('scanResultPreview2D');
    if (p2d) {
      render2DFieldGrid(p2d, ui.latestDetectedGrid, { showMarkers: true, padding: 14 });
    }
    const p3d = $('scanResultPreview3D');
    if (p3d) {
      const f = getField();
      renderIsometricGrid(p3d, ui.latestDetectedGrid, {
        cameraRotDeg: ui.cameraRot,
        tileWidthCm: f.tileWidthCm
      });
    }

    refreshJsonPreview(ui.latestDetectedGrid);
  }

  function finishScanCountdown(fallbackGrid, fallbackStats) {
    hideCountdownOverlay();
    const chosenGrid = ui.bestScannedGrid || fallbackGrid;
    const finalStats = {
      ...(fallbackStats || {}),
      tileCount: ui.bestScannedCount >= 0 ? ui.bestScannedCount : fallbackStats?.tileCount || 0
    };
    stopWebcam(false);
    showScanResults(chosenGrid, finalStats);
    updateScanStatus(
      `สแกนสำเร็จ! ตรวจพบ ${finalStats.tileCount} ชิ้น — ตรวจสอบผลลัพธ์ด้านล่างหรือกด "ใช้สนามนี้ทันที"`,
      'ok'
    );
  }

  function startScanCountdown() {
    ui.countdownActive = true;
    ui.countdownStartTs = performance.now();
    ui.bestScannedGrid = null;
    ui.bestScannedCount = -1;
    const ov = $('scanCountdownOverlay');
    if (ov) ov.hidden = false;
  }

  function processWebcamFrame(nowTs) {
    if (!ui.stream) return;
    const video = $('scanVideo');
    const canvas = $('scanCanvas');
    if (!video || !canvas) return;

    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const f = getField();
      const metrics = getPrintMetrics();
      const scanRes = scanBoardFromCanvasFrame(canvas, true, {
        metrics,
        rows: f.rows,
        cols: f.cols
      });

      if (scanRes.boardFound) {
        if (ui.autoCountdown && !ui.countdownActive) {
          startScanCountdown();
        }
        if (ui.countdownActive) {
          if (scanRes.tileCount >= ui.bestScannedCount) {
            ui.bestScannedCount = scanRes.tileCount;
            ui.bestScannedGrid = cloneGridData(scanRes.detectedGrid);
          }
          const elapsed = nowTs - ui.countdownStartTs;
          const remaining = Math.max(1, Math.ceil((3000 - elapsed) / 1000));
          if ($('scanCountdownNum')) $('scanCountdownNum').textContent = String(remaining);
          updateScanStatus(
            `พบกระดาน (${scanRes.cornersFound}/4 มุม) · พบ ${scanRes.tileCount} แผ่น · กำลังบันทึกใน ${remaining} วินาที...`,
            'warn'
          );
          if (elapsed >= 3000) {
            finishScanCountdown(scanRes.detectedGrid, scanRes);
            return;
          }
        } else {
          updateScanStatus(
            `พร้อมสแกน: พบกระดาน ${scanRes.cornersFound}/4 มุม · แผ่น ${scanRes.tileCount} ชิ้น`,
            'ok'
          );
        }
      } else {
        if (ui.countdownActive) hideCountdownOverlay();
        updateScanStatus(
          `กำลังค้นหามุมกระดาน #101–#104 (พบ ${scanRes.cornersFound}/4 มุม, Marker รวม ${scanRes.rawMarkerCount})`,
          'neutral'
        );
      }
    }

    ui.rafId = requestAnimationFrame(processWebcamFrame);
  }

  async function startWebcam() {
    stopWebcam(false);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      updateScanStatus('เบราว์เซอร์นี้ไม่รองรับ Webcam API — ใช้ปุ่มอัปโหลดรูปหรือ Demo Board แทนได้', 'err');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      ui.stream = stream;
      const video = $('scanVideo');
      const canvas = $('scanCanvas');
      if (canvas) canvas.classList.toggle('mirrored', ui.isMirrored);
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      if ($('scanBtnStartCam')) $('scanBtnStartCam').disabled = true;
      if ($('scanBtnStopCam')) $('scanBtnStopCam').disabled = false;
      if ($('scanBtnManualSnap')) $('scanBtnManualSnap').disabled = false;
      if ($('scanResultPanel')) $('scanResultPanel').hidden = true;
      updateScanStatus('กล้องทำงานแล้ว — ส่องกระดานฐานที่มี Marker #101–#104 ให้ครบมุม', 'neutral');
      ui.rafId = requestAnimationFrame(processWebcamFrame);
    } catch (err) {
      updateScanStatus(`เปิดกล้องไม่สำเร็จ: ${err.message}`, 'err');
    }
  }

  function stopWebcam(updateMsg = true) {
    if (ui.rafId) {
      cancelAnimationFrame(ui.rafId);
      ui.rafId = null;
    }
    hideCountdownOverlay();
    if (ui.stream) {
      for (const track of ui.stream.getTracks()) {
        try { track.stop(); } catch (_) {}
      }
      ui.stream = null;
    }
    const video = $('scanVideo');
    if (video) video.srcObject = null;
    if ($('scanBtnStartCam')) $('scanBtnStartCam').disabled = false;
    if ($('scanBtnStopCam')) $('scanBtnStopCam').disabled = true;
    if ($('scanBtnManualSnap')) $('scanBtnManualSnap').disabled = true;
    if (updateMsg) updateScanStatus('ปิดกล้องแล้ว', 'neutral');
  }

  function runStaticCanvasScan(canvas, label = 'ภาพนิ่ง') {
    const f = getField();
    const metrics = getPrintMetrics();
    const res = scanBoardFromCanvasFrame(canvas, true, { metrics, rows: f.rows, cols: f.cols });
    if (res.boardFound) {
      showScanResults(res.detectedGrid, res);
      updateScanStatus(
        `${label}: ถอดรหัสสำเร็จ ${res.tileCount} แผ่น (มุมกระดาน ${res.cornersFound}/4${res.recoveredCorner ? `, กู้คืน #${res.recoveredCorner}` : ''})`,
        'ok'
      );
    } else {
      updateScanStatus(
        `${label}: พบมุมกระดานเพียง ${res.cornersFound}/4 (ต้องพบอย่างน้อย 3 มุมจาก #101–#104)`,
        'err'
      );
    }
    return res;
  }

  function handleScanPhotoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    stopWebcam(false);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = $('scanCanvas');
        if (!canvas) return;
        const maxW = 1280;
        const scale = Math.min(1, maxW / Math.max(1, img.width));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.classList.remove('mirrored');
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        runStaticCanvasScan(canvas, 'รูปภาพที่อัปโหลด');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  function runSyntheticDemoScan() {
    stopWebcam(false);
    const canvas = $('scanCanvas');
    if (!canvas) return;
    canvas.classList.remove('mirrored');
    const f = getField();
    renderSyntheticTestBoard(canvas, f.gridData, {
      paperKey: ui.paperKey,
      orientation: ui.orientation,
      rows: f.rows,
      cols: f.cols,
      tileWidthCm: f.tileWidthCm
    });
    runStaticCanvasScan(canvas, 'ทดสอบสแกนจำลอง Offline CV');
  }

  // ============================================================================
  // 3D JSON Pipeline (Export & Import)
  // ============================================================================
  function getExportPayload(overrideGrid = null) {
    const f = getField();
    return buildExportJsonPayload({
      rows: f.rows,
      cols: f.cols,
      tileWidthCm: f.tileWidthCm,
      gridData: overrideGrid || f.gridData
    });
  }

  function refreshJsonPreview(overrideGrid = null) {
    const pre = $('mapJsonPreview');
    if (!pre) return;
    const payload = getExportPayload(overrideGrid);
    pre.textContent = JSON.stringify(payload, null, 2);
  }

  function downloadExportJson(overrideGrid = null) {
    const payload = getExportPayload(overrideGrid);
    const text = JSON.stringify(payload, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kt_field_3d_${payload.field_config.cols}x${payload.field_config.rows}.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (appendConsole) appendConsole('[OK] ส่งออกไฟล์ 3D JSON (3.0-robotics-3d-modular-field) เรียบร้อย');
  }

  function handleImportJsonFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = parseImportJsonPayload(reader.result);
        setFieldState({
          ...getField(),
          rows: imported.rows,
          cols: imported.cols,
          tileWidthCm: imported.tileWidthCm,
          gridData: imported.gridData
        });
        applyCountsToPrintState(imported.printQuantities);
        syncDimensionInputs();
        renderDesignCanvas();
        renderPrintQuantitySelector();
        updatePrintPreview();
        refreshJsonPreview();
        if (onFieldChanged) onFieldChanged({ syncStart: true });
        if (appendConsole) {
          appendConsole(`[OK] นำเข้าสนาม 3D JSON (${imported.cols}×${imported.rows}, ${imported.tileWidthCm}cm) สำเร็จ`);
        }
      } catch (err) {
        if (appendConsole) appendConsole(`[ERR] นำเข้า JSON ไม่สำเร็จ: ${err.message}`);
        updateScanStatus(`นำเข้า JSON ผิดพลาด: ${err.message}`, 'err');
      }
    };
    reader.readAsText(file, 'utf-8');
    event.target.value = '';
  }

  function syncDimensionInputs() {
    const f = getField();
    if ($('mapRowsInput')) $('mapRowsInput').value = String(f.rows);
    if ($('mapColsInput')) $('mapColsInput').value = String(f.cols);
    if ($('mapTileCmInput')) $('mapTileCmInput').value = String(f.tileWidthCm);
  }

  function bindEvents() {
    document.querySelectorAll('.map-tab-btn').forEach((btn) => {
      btn.onclick = () => setActiveMapTab(btn.dataset.mapTab);
    });

    if ($('btnMapBackToSim')) {
      $('btnMapBackToSim').onclick = () => {
        stopWebcam(false);
        if (onBackToSim) onBackToSim();
      };
    }

    const applyDimChange = () => {
      const f = getField();
      const newRows = Math.max(2, Math.min(24, parseInt($('mapRowsInput')?.value, 10) || f.rows));
      const newCols = Math.max(2, Math.min(24, parseInt($('mapColsInput')?.value, 10) || f.cols));
      const newCm = Math.max(5, Math.min(200, parseFloat($('mapTileCmInput')?.value) || f.tileWidthCm));
      const resized = resizeGridData(f.gridData, newRows, newCols);
      setFieldState({ ...f, rows: newRows, cols: newCols, tileWidthCm: newCm, gridData: resized });
      syncDimensionInputs();
      syncQuantitiesFromField(ui.activeTab === 'print');
      renderDesignCanvas();
      refreshJsonPreview();
      if (onFieldChanged) onFieldChanged({ syncStart: false });
    };
    ['mapRowsInput', 'mapColsInput', 'mapTileCmInput'].forEach((id) => {
      if ($(id)) $(id).onchange = applyDimChange;
    });

    if ($('mapToolPlace')) {
      $('mapToolPlace').onclick = () => {
        ui.tool = 'place';
        syncToolButtons();
        renderStandardCatalog();
      };
    }
    if ($('mapToolErase')) {
      $('mapToolErase').onclick = () => {
        ui.tool = 'erase';
        syncToolButtons();
        renderStandardCatalog();
      };
    }
    if ($('mapPlaceRotBtn')) {
      $('mapPlaceRotBtn').onclick = () => {
        ui.placeRot = normalizeRot(ui.placeRot + 90);
        syncToolButtons();
        renderDesignCanvas();
      };
    }
    if ($('mapShowMarkersChk')) {
      $('mapShowMarkersChk').onchange = (e) => {
        ui.showMarkers = !!e.target.checked;
        renderDesignCanvas();
      };
    }
    if ($('mapShowRobotPathChk')) {
      $('mapShowRobotPathChk').onchange = (e) => {
        ui.showRobotPath = !!e.target.checked;
        renderDesignCanvas();
      };
    }
    if ($('mapViewMode2D')) {
      $('mapViewMode2D').onclick = () => {
        ui.designViewMode = '2d';
        syncToolButtons();
        renderDesignCanvas();
      };
    }
    if ($('mapViewModeIso')) {
      $('mapViewModeIso').onclick = () => {
        ui.designViewMode = 'iso';
        syncToolButtons();
        renderDesignCanvas();
      };
    }
    if ($('mapCamRotBtn')) {
      $('mapCamRotBtn').onclick = () => {
        ui.cameraRot = normalizeRot(ui.cameraRot + 90);
        syncToolButtons();
        renderDesignCanvas();
      };
    }
    if ($('mapBtnPreset')) {
      $('mapBtnPreset').onclick = () => {
        const f = getField();
        const preset = loadRescueMiddlePreset(f.rows, f.cols);
        commitFieldMutation(preset, true);
        if (appendConsole) appendConsole('[OK] โหลดสนามจำลองมาตรฐาน Rescue Middle สำเร็จ');
      };
    }
    if ($('mapBtnClear')) {
      $('mapBtnClear').onclick = () => {
        if (!confirm('ล้างแผ่นสนามทั้งหมดเป็นตารางว่างหรือไม่?')) return;
        const f = getField();
        commitFieldMutation(createEmptyGrid(f.rows, f.cols), false);
      };
    }

    if ($('mapBtnExportJsonDesign')) $('mapBtnExportJsonDesign').onclick = () => downloadExportJson();
    if ($('mapBtnImportJsonDesign')) $('mapBtnImportJsonDesign').onclick = () => $('mapImportJsonInput')?.click();
    if ($('mapImportJsonInput')) $('mapImportJsonInput').onchange = handleImportJsonFile;

    // Print controls
    if ($('printPaperSelect')) {
      $('printPaperSelect').onchange = (e) => {
        ui.paperKey = e.target.value;
        updatePrintPreview();
      };
    }
    if ($('printOrientSelect')) {
      $('printOrientSelect').onchange = (e) => {
        ui.orientation = e.target.value;
        updatePrintPreview();
      };
    }
    if ($('printDefaultQtyInput')) {
      $('printDefaultQtyInput').onchange = (e) => {
        ui.defaultPrintQty = Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 5));
        e.target.value = String(ui.defaultPrintQty);
        renderPrintQuantitySelector();
      };
    }
    if ($('printBtnApplyDefaultQty')) {
      $('printBtnApplyDefaultQty').onclick = () => {
        const qty = Math.max(1, Math.min(99, parseInt($('printDefaultQtyInput')?.value, 10) || ui.defaultPrintQty));
        ui.defaultPrintQty = qty;
        for (const tile of STANDARD_TILES) {
          ui.printQuantities[tile.id] = qty;
        }
        renderPrintQuantitySelector();
        updatePrintPreview();
      };
    }
    if ($('printSelectModeToggle')) {
      $('printSelectModeToggle').onclick = () => {
        ui.printSelectMode = !ui.printSelectMode;
        renderPrintQuantitySelector();
      };
    }
    if ($('printBtnSelectAll')) {
      $('printBtnSelectAll').onclick = () => {
        for (const tile of STANDARD_TILES) {
          ui.printEnabled[tile.id] = true;
          if ((ui.printQuantities[tile.id] || 0) <= 0) {
            ui.printQuantities[tile.id] = ui.defaultPrintQty;
          }
        }
        renderPrintQuantitySelector();
        updatePrintPreview();
      };
    }
    if ($('printBtnDeselectAll')) {
      $('printBtnDeselectAll').onclick = () => {
        for (const tile of STANDARD_TILES) {
          ui.printEnabled[tile.id] = false;
        }
        renderPrintQuantitySelector();
        updatePrintPreview();
      };
    }
    if ($('printBtnSyncField')) {
      $('printBtnSyncField').onclick = () => syncQuantitiesFromField(true);
    }
    if ($('printBtnClearAll')) {
      $('printBtnClearAll').onclick = () => {
        for (const tile of STANDARD_TILES) {
          ui.printQuantities[tile.id] = 0;
          ui.printEnabled[tile.id] = false;
        }
        renderPrintQuantitySelector();
        updatePrintPreview();
      };
    }
    if ($('printBtnExecute')) {
      $('printBtnExecute').onclick = () => {
        updatePrintPreview();
        window.print();
      };
    }

    // Scan controls
    if ($('scanBtnStartCam')) $('scanBtnStartCam').onclick = startWebcam;
    if ($('scanBtnStopCam')) $('scanBtnStopCam').onclick = () => stopWebcam(true);
    if ($('scanBtnMirrorCam')) $('scanBtnMirrorCam').onclick = toggleMirrorWebcam;
    if ($('scanAutoCountdownChk')) {
      $('scanAutoCountdownChk').onchange = (e) => {
        ui.autoCountdown = !!e.target.checked;
        if (!ui.autoCountdown) hideCountdownOverlay();
      };
    }
    if ($('scanBtnManualSnap')) {
      $('scanBtnManualSnap').onclick = () => {
        const canvas = $('scanCanvas');
        if (canvas && canvas.width > 0) {
          finishScanCountdown(ui.bestScannedGrid || getField().gridData, {
            boardFound: true,
            cornersFound: 4,
            tileCount: Math.max(0, ui.bestScannedCount)
          });
        }
      };
    }
    if ($('scanBtnUploadPhoto')) $('scanBtnUploadPhoto').onclick = () => $('scanPhotoInput')?.click();
    if ($('scanPhotoInput')) $('scanPhotoInput').onchange = handleScanPhotoUpload;
    if ($('scanBtnDemoBoard')) $('scanBtnDemoBoard').onclick = runSyntheticDemoScan;

    if ($('scanBtnApplyToField')) {
      $('scanBtnApplyToField').onclick = () => {
        if (!ui.latestDetectedGrid) return;
        commitFieldMutation(cloneGridData(ui.latestDetectedGrid), true);
        setActiveMapTab('design');
        if (appendConsole) appendConsole('[OK] นำเข้าผลสแกนสนามลงผังออกแบบและ Simulator เรียบร้อย');
      };
    }
    if ($('scanBtnRescan')) {
      $('scanBtnRescan').onclick = () => {
        if ($('scanResultPanel')) $('scanResultPanel').hidden = true;
        startWebcam();
      };
    }
    if ($('scanBtnExportScannedJson')) {
      $('scanBtnExportScannedJson').onclick = () => downloadExportJson(ui.latestDetectedGrid);
    }

    // JSON Pipeline buttons
    if ($('jsonBtnCopy')) {
      $('jsonBtnCopy').onclick = async () => {
        const text = JSON.stringify(getExportPayload(ui.latestDetectedGrid), null, 2);
        try {
          await navigator.clipboard.writeText(text);
          if (appendConsole) appendConsole('[OK] คัดลอก 3D JSON ลงคลิปบอร์ดแล้ว');
        } catch (_) {}
      };
    }
    if ($('jsonBtnDownload')) $('jsonBtnDownload').onclick = () => downloadExportJson(ui.latestDetectedGrid);
    if ($('jsonBtnImport')) $('jsonBtnImport').onclick = () => $('mapImportJsonInput')?.click();

    setupDesignCanvasEvents();
  }

  function init() {
    syncDimensionInputs();
    renderCategoryFilters();
    renderStandardCatalog();
    syncToolButtons();
    syncQuantitiesFromField(false);
    bindEvents();
    updateInspectorBar(null);
    renderDesignCanvas();
  }

  function activate() {
    syncDimensionInputs();
    syncQuantitiesFromField(ui.activeTab === 'print');
    renderDesignCanvas();
    if (ui.activeTab === 'scan') refreshJsonPreview();
  }

  function deactivate() {
    stopWebcam(false);
  }

  function refreshFromExternal() {
    syncDimensionInputs();
    syncQuantitiesFromField(ui.activeTab === 'print');
    renderDesignCanvas();
    if (ui.activeTab === 'scan') refreshJsonPreview();
  }

  return {
    init,
    activate,
    deactivate,
    refreshFromExternal,
    getPrintMetrics,
    setActiveMapTab
  };
}
