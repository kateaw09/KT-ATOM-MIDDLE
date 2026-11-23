'use strict';

import {
  STANDARD_TILES,
  TILE_BY_ID,
  normalizeRot,
  getTileSpan,
  canPlaceTileAt,
  getCellOccupancyMap,
  resolveTileSemantics
} from './fieldTiles.js';

export function createEmptyGrid(rows = 7, cols = 7) {
  const rCount = Math.max(2, Math.min(24, Number(rows) || 7));
  const cCount = Math.max(2, Math.min(24, Number(cols) || 7));
  return Array.from({ length: rCount }, () => Array.from({ length: cCount }, () => null));
}

export function cloneGridData(gridData) {
  if (!Array.isArray(gridData)) return createEmptyGrid(7, 7);
  return gridData.map((row) =>
    Array.isArray(row) ? row.map((cell) => (cell ? { tileId: Number(cell.tileId), rot: normalizeRot(cell.rot) } : null)) : []
  );
}

export function resizeGridData(oldGrid, newRows, newCols) {
  const next = createEmptyGrid(newRows, newCols);
  if (!Array.isArray(oldGrid)) return next;

  for (let r = 0; r < oldGrid.length && r < newRows; r++) {
    for (let c = 0; c < (oldGrid[r]?.length || 0) && c < newCols; c++) {
      const cell = oldGrid[r][c];
      if (!cell || !TILE_BY_ID[cell.tileId]) continue;
      const rot = normalizeRot(cell.rot);
      if (canPlaceTileAt(next, r, c, cell.tileId, rot)) {
        next[r][c] = { tileId: Number(cell.tileId), rot };
      }
    }
  }
  return next;
}

export function countTilesInGrid(gridData) {
  const counts = Object.create(null);
  for (const tile of STANDARD_TILES) counts[tile.id] = 0;
  if (!Array.isArray(gridData)) return counts;

  for (let r = 0; r < gridData.length; r++) {
    for (let c = 0; c < (gridData[r]?.length || 0); c++) {
      const cell = gridData[r][c];
      if (cell && TILE_BY_ID[cell.tileId]) {
        counts[cell.tileId] = (counts[cell.tileId] || 0) + 1;
      }
    }
  }
  return counts;
}

export function findStartTileCell(gridData) {
  if (!Array.isArray(gridData)) return null;
  for (let r = 0; r < gridData.length; r++) {
    for (let c = 0; c < (gridData[r]?.length || 0); c++) {
      if (gridData[r][c]?.tileId === 31) {
        return { row: r, col: c, rot: normalizeRot(gridData[r][c].rot) };
      }
    }
  }
  return null;
}

export function buildCompactGrid(gridData) {
  if (!Array.isArray(gridData)) return [];
  return gridData.map((row) =>
    row.map((cell) => (cell && TILE_BY_ID[cell.tileId] ? `${cell.tileId}@${normalizeRot(cell.rot)}` : ''))
  );
}

export function parseCompactGrid(compactGrid, rows, cols) {
  const rCount = Math.max(2, Math.min(24, Number(rows) || compactGrid?.length || 7));
  const cCount = Math.max(2, Math.min(24, Number(cols) || compactGrid?.[0]?.length || 7));
  const grid = createEmptyGrid(rCount, cCount);
  if (!Array.isArray(compactGrid)) return grid;

  for (let r = 0; r < rCount && r < compactGrid.length; r++) {
    const rowArr = compactGrid[r];
    if (!Array.isArray(rowArr)) continue;
    for (let c = 0; c < cCount && c < rowArr.length; c++) {
      const token = rowArr[c];
      if (!token) continue;
      let tileId = 0;
      let rot = 0;
      if (typeof token === 'string') {
        const parts = token.split('@');
        tileId = parseInt(parts[0], 10);
        rot = normalizeRot(parseInt(parts[1], 10) || 0);
      } else if (typeof token === 'object') {
        tileId = Number(token.tileId || token.id);
        rot = normalizeRot(token.rot || token.rotation_deg || 0);
      }
      if (TILE_BY_ID[tileId] && canPlaceTileAt(grid, r, c, tileId, rot)) {
        grid[r][c] = { tileId, rot };
      }
    }
  }
  return grid;
}

export function loadRescueMiddlePreset(rows = 7, cols = 7) {
  const rCount = Math.max(2, Math.min(24, Number(rows) || 7));
  const cCount = Math.max(2, Math.min(24, Number(cols) || 7));
  const grid = createEmptyGrid(rCount, cCount);

  const tryPlace = (r, c, tileId, rot = 0) => {
    if (canPlaceTileAt(grid, r, c, tileId, rot)) {
      grid[r][c] = { tileId, rot };
    }
  };

  // Standard 7x7 Rescue Middle Competition Layout
  // Row 0: Tunnel 2x1 (33), Elevated Green Cube (27), Elevated Blue (28), FINISH (32)
  tryPlace(0, 0, 3, 0);
  tryPlace(0, 1, 33, 0); // spans (0,1)-(0,2)
  tryPlace(0, 3, 27, 0);
  tryPlace(0, 4, 13, 0); // Check Point open
  tryPlace(0, 5, 28, 0);
  tryPlace(0, 6, 32, 0); // FINISH

  // Row 1: Vertical corridor + Bridge Ramp -> Deck -> Ramp + Elevated Red (29)
  tryPlace(1, 0, 7, 90);
  tryPlace(1, 1, 14, 180); // Check Point + top wall
  tryPlace(1, 2, 19, 90);  // Ramp up East (5->50mm)
  tryPlace(1, 3, 20, 0);   // Bridge Deck 50mm
  tryPlace(1, 4, 19, 270); // Ramp down East (50->5mm)
  tryPlace(1, 5, 1, 0);    // Open intersection
  tryPlace(1, 6, 29, 90);  // Elevated Red 50mm

  // Row 2: Chopsticks (17), Center black band (18), Seesaw 12 deg (34)
  tryPlace(2, 0, 3, 270);
  tryPlace(2, 1, 17, 0);   // 7 Chopsticks
  tryPlace(2, 2, 1, 0);
  tryPlace(2, 3, 34, 90);  // Seesaw 12 deg (0->70mm)
  tryPlace(2, 4, 1, 0);
  tryPlace(2, 5, 18, 90);  // Center 56% black band
  tryPlace(2, 6, 7, 90);

  // Row 3: Ground cube drop + intersections + Check Point
  tryPlace(3, 0, 7, 90);
  tryPlace(3, 1, 2, 90);
  tryPlace(3, 2, 16, 0);   // Check Point corridor
  tryPlace(3, 3, 7, 0);
  tryPlace(3, 4, 3, 90);
  tryPlace(3, 5, 6, 90);   // Green ground cube drop
  tryPlace(3, 6, 30, 90);  // Elevated Yellow 50mm

  // Row 4: Approach paths + Blue ground drop + Check Point
  tryPlace(4, 0, 7, 90);
  tryPlace(4, 1, 1, 0);
  tryPlace(4, 2, 1, 0);
  tryPlace(4, 3, 21, 180); // Blue ground cube drop
  tryPlace(4, 4, 1, 0);
  tryPlace(4, 5, 15, 180); // Check Point corner
  tryPlace(4, 6, 7, 90);

  // Row 5: START at (5, 1) matching default IDE Start X=1, Start Y=5
  tryPlace(5, 0, 2, 90);
  tryPlace(5, 1, 31, 0);   // START
  tryPlace(5, 2, 1, 0);
  tryPlace(5, 3, 2, 0);
  tryPlace(5, 4, 23, 0);   // Red ground cube drop
  tryPlace(5, 5, 1, 0);
  tryPlace(5, 6, 7, 90);

  // Row 6: Bottom border line-check perimeter
  tryPlace(6, 0, 3, 270);
  tryPlace(6, 1, 2, 0);
  tryPlace(6, 2, 2, 0);
  tryPlace(6, 3, 12, 0);   // Green bottom-edge cube drop
  tryPlace(6, 4, 2, 0);
  tryPlace(6, 5, 25, 180); // Yellow ground cube drop
  tryPlace(6, 6, 3, 180);

  // Fill any remaining empty cells (especially if resized > 7x7) with white plain tiles
  for (let r = 0; r < rCount; r++) {
    for (let c = 0; c < cCount; c++) {
      const occ = getCellOccupancyMap(grid);
      if (!occ[`${r},${c}`]) {
        grid[r][c] = { tileId: 1, rot: 0 };
      }
    }
  }

  return grid;
}

export function buildExportJsonPayload({ rows = 7, cols = 7, tileWidthCm = 30, gridData, startPose = null } = {}) {
  const rCount = gridData?.length || rows;
  const cCount = gridData?.[0]?.length || cols;
  const resolvedStart = startPose || findStartTileCell(gridData);
  const cells3d = [];

  for (let r = 0; r < rCount; r++) {
    for (let c = 0; c < cCount; c++) {
      const cell = gridData[r]?.[c];
      if (!cell || !TILE_BY_ID[cell.tileId]) continue;
      const rot = normalizeRot(cell.rot);
      const span = getTileSpan(cell.tileId, rot);
      const sem = resolveTileSemantics(cell.tileId, rot);
      cells3d.push({
        row: r,
        col: c,
        bounds_cm: {
          x_min: Number((c * tileWidthCm).toFixed(2)),
          x_max: Number(((c + span.colSpan) * tileWidthCm).toFixed(2)),
          y_min: Number((r * tileWidthCm).toFixed(2)),
          y_max: Number(((r + span.rowSpan) * tileWidthCm).toFixed(2))
        },
        ...sem
      });
    }
  }

  return {
    schema: '3.0-robotics-3d-modular-field',
    generated_at: new Date().toISOString(),
    generator: 'KT_ATOM_Middle - [MAP MANAGER]',
    field_config: {
      rows: rCount,
      cols: cCount,
      tile_width_cm: tileWidthCm,
      base_thickness_mm: 5,
      total_width_cm: Number((cCount * tileWidthCm).toFixed(2)),
      total_depth_cm: Number((rCount * tileWidthCm).toFixed(2)),
      start_pose: resolvedStart
    },
    compact_grid: buildCompactGrid(gridData),
    cells_3d: cells3d
  };
}

export function parseImportJsonPayload(rawJson) {
  const data = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
  if (!data || typeof data !== 'object') {
    throw new Error('รูปแบบไฟล์ JSON ไม่ถูกต้อง');
  }
  if (data.schema && data.schema !== '3.0-robotics-3d-modular-field') {
    throw new Error(`ไม่รองรับ schema "${data.schema}" (ต้องเป็น 3.0-robotics-3d-modular-field)`);
  }

  const cfg = data.field_config || {};
  const rows = Math.max(2, Math.min(24, Number(cfg.rows) || data.compact_grid?.length || 7));
  const cols = Math.max(2, Math.min(24, Number(cfg.cols) || data.compact_grid?.[0]?.length || 7));
  const tileWidthCm = Math.max(5, Math.min(200, Number(cfg.tile_width_cm) || 30));

  let gridData;
  if (Array.isArray(data.compact_grid)) {
    gridData = parseCompactGrid(data.compact_grid, rows, cols);
  } else if (Array.isArray(data.cells_3d)) {
    gridData = createEmptyGrid(rows, cols);
    for (const item of data.cells_3d) {
      const r = Number(item.row);
      const c = Number(item.col);
      const id = Number(item.id);
      const rot = normalizeRot(item.rotation_deg || 0);
      if (TILE_BY_ID[id] && canPlaceTileAt(gridData, r, c, id, rot)) {
        gridData[r][c] = { tileId: id, rot };
      }
    }
  } else {
    throw new Error('ไม่พบข้อมูล compact_grid หรือ cells_3d ในไฟล์ JSON');
  }

  const printQuantities = countTilesInGrid(gridData);
  const startPose = cfg.start_pose || findStartTileCell(gridData);

  return {
    rows,
    cols,
    tileWidthCm,
    gridData,
    printQuantities,
    startPose
  };
}
