'use strict';

export const PAPER_SPECS = {
  A4: { key: 'A4', label: 'A4 (297 × 210 mm)', widthMm: 297, heightMm: 210 },
  A3: { key: 'A3', label: 'A3 (420 × 297 mm)', widthMm: 420, heightMm: 297 },
  Letter: { key: 'Letter', label: 'Letter (279.4 × 215.9 mm)', widthMm: 279.4, heightMm: 215.9 }
};

export const CUBE_COLOR_META = {
  green: { hex: '#16a34a', light: '#22c55e', dark: '#14532d', nameTh: 'เขียว' },
  blue: { hex: '#2563eb', light: '#3b82f6', dark: '#1e3a8a', nameTh: 'น้ำเงิน' },
  red: { hex: '#dc2626', light: '#ef4444', dark: '#7f1d1d', nameTh: 'แดง' },
  yellow: { hex: '#eab308', light: '#facc15', dark: '#854d0e', nameTh: 'เหลือง' }
};

export const TILE_MARKER_PAD_RATIO = 0.03;
export const TILE_MARKER_SIZE_RATIO = 0.36;
export const TILE_MARKER_CENTER_RATIO = TILE_MARKER_PAD_RATIO + TILE_MARKER_SIZE_RATIO * 0.5;

export const TILE_CATEGORIES = [
  { id: 'all', label: 'ทั้งหมด (29)' },
  { id: 'lines', label: 'เส้นขอบ & ทางเดิน' },
  { id: 'checkpoint', label: 'Check Point' },
  { id: 'obstacles', label: 'อุปสรรค & สะพาน' },
  { id: 'cubes', label: 'จุดทิ้งลูกบาศก์' },
  { id: 'special', label: 'START / FINISH / พิเศษ' }
];

const ELEVATED_WALL_DEF = { top: true, left: true, right: true };

export const STANDARD_TILES = [
  {
    id: 1,
    name: 'พื้นขาวโล่ง',
    shortName: 'โล่ง',
    category: 'lines',
    spanCols: 1,
    spanRows: 1,
    walls: {},
    cornerDots: {},
    baseRule: 'พื้นขาวหนา 5mm วิ่งผ่านได้อิสระทุกทิศทาง'
  },
  {
    id: 2,
    name: 'เส้นขอบดำ 1 ด้าน (ล่าง)',
    shortName: 'ขอบ 1 ด้าน',
    category: 'lines',
    spanCols: 1,
    spanRows: 1,
    walls: { bottom: true },
    cornerDots: {},
    baseRule: 'ห้ามข้ามเส้นขอบดำด้านที่กำหนด แต่เข้าเช็คเส้น/เทียบตัวตรงได้'
  },
  {
    id: 3,
    name: 'มุมขอบดำ 2 ด้าน (ซ้าย-บน)',
    shortName: 'มุม 2 ด้าน',
    category: 'lines',
    spanCols: 1,
    spanRows: 1,
    walls: { top: true, left: true },
    cornerDots: {},
    baseRule: 'มุมขอบดำ 2 ด้าน ห้ามข้ามเส้น แต่เข้าเทียบมุมเช็คเส้นได้'
  },
  {
    id: 4,
    name: 'ขอบดำ 3 ด้าน (ทางตัน)',
    shortName: 'ขอบ 3 ด้าน',
    category: 'lines',
    spanCols: 1,
    spanRows: 1,
    walls: { top: true, left: true, right: true },
    cornerDots: {},
    baseRule: 'ขอบดำล้อม 3 ด้าน เปิดทางเข้า-ออกด้านเดียว'
  },
  {
    id: 6,
    name: 'จุดทิ้งลูกบาศก์สีเขียว (ล้อม 3 ด้าน)',
    shortName: 'เขียว 3 ด้าน',
    category: 'cubes',
    spanCols: 1,
    spanRows: 1,
    walls: { top: true, left: true, right: true },
    cornerDots: {},
    cubeDrop: { color: 'green', style: 'enclosed3', side: 'top' },
    baseRule: 'จุดทิ้งลูกบาศก์สีเขียวระดับพื้น 5mm ล้อมขอบดำ 3 ด้าน'
  },
  {
    id: 7,
    name: 'ทางตรงขอบดำ 2 ด้าน',
    shortName: 'ทางตรง',
    category: 'lines',
    spanCols: 1,
    spanRows: 1,
    walls: { top: true, bottom: true },
    cornerDots: {},
    baseRule: 'ทางตรงบังคับเดินระหว่างเส้นขอบดำ 2 ด้านขนานกัน'
  },
  {
    id: 12,
    name: 'จุดทิ้งลูกบาศก์สีเขียว (ขอบล่าง)',
    shortName: 'เขียว ขอบล่าง',
    category: 'cubes',
    spanCols: 1,
    spanRows: 1,
    walls: { bottom: true },
    cornerDots: {},
    cubeDrop: { color: 'green', style: 'bottom_edge', side: 'bottom' },
    baseRule: 'จุดทิ้งลูกบาศก์สีเขียวระดับพื้น 5mm ติดเส้นขอบดำ 1 ด้าน'
  },
  {
    id: 13,
    name: 'Check Point (โล่ง)',
    shortName: 'CP โล่ง',
    category: 'checkpoint',
    spanCols: 1,
    spanRows: 1,
    walls: {},
    cornerDots: {},
    checkpoint: { diameterRatio: 0.25 },
    baseRule: 'จุด Check Point วงกลมสีเหลือง 25% ตรงกลางแผ่น (ไม่มีขอบดำ)'
  },
  {
    id: 14,
    name: 'Check Point (ขอบล่าง)',
    shortName: 'CP ขอบ 1',
    category: 'checkpoint',
    spanCols: 1,
    spanRows: 1,
    walls: { bottom: true },
    cornerDots: {},
    checkpoint: { diameterRatio: 0.25 },
    baseRule: 'จุด Check Point วงกลมสีเหลือง 25% พร้อมเส้นขอบดำ 1 ด้าน'
  },
  {
    id: 15,
    name: 'Check Point (มุมซ้ายบน)',
    shortName: 'CP มุม 2',
    category: 'checkpoint',
    spanCols: 1,
    spanRows: 1,
    walls: { top: true, left: true },
    cornerDots: {},
    checkpoint: { diameterRatio: 0.25 },
    baseRule: 'จุด Check Point วงกลมสีเหลือง 25% พร้อมมุมขอบดำ 2 ด้าน'
  },
  {
    id: 16,
    name: 'Check Point (ทางตรง)',
    shortName: 'CP ทางตรง',
    category: 'checkpoint',
    spanCols: 1,
    spanRows: 1,
    walls: { top: true, bottom: true },
    cornerDots: {},
    checkpoint: { diameterRatio: 0.25 },
    baseRule: 'จุด Check Point วงกลมสีเหลือง 25% บนทางตรงขอบดำ 2 ด้าน'
  },
  {
    id: 17,
    name: 'ลูกระนาด (ตะเกียบ 7 แท่ง)',
    shortName: 'ลูกระนาด',
    category: 'obstacles',
    spanCols: 1,
    spanRows: 1,
    walls: {},
    cornerDots: {},
    chopsticks: { count: 7, heightMm: 5.5, diameterMm: 5 },
    baseRule: 'แท่งตะเกียบ 7 แท่งวางขวาง นูนสูงจากพื้น +5.5mm (Ø ≈ 5mm)'
  },
  {
    id: 18,
    name: 'พื้นที่ดำห้ามผ่านตรงกลาง (56%)',
    shortName: 'แถบดำ 56%',
    category: 'obstacles',
    spanCols: 1,
    spanRows: 1,
    walls: {},
    cornerDots: {},
    centerBlackBand: { widthRatio: 0.56 },
    baseRule: 'แถบสีดำทึบตรงกลางขนาด 56% ห้ามหุ่นยนต์วิ่งข้ามผ่าน'
  },
  {
    id: 19,
    name: 'ทางลาดขึ้นสะพาน (5→50mm)',
    shortName: 'ทางลาดสะพาน',
    category: 'obstacles',
    spanCols: 1,
    spanRows: 1,
    walls: {},
    cornerDots: {},
    bridgeRamp: { startMm: 5, endMm: 50 },
    baseRule: 'ทางลาดเอียงขึ้นสะพาน จากฝั่งต่ำ 5mm ถึงฝั่งปลายสูง 50mm (ไม่มีขอบดำข้าง)'
  },
  {
    id: 20,
    name: 'พื้นสะพานยกสูง (50mm)',
    shortName: 'พื้นสะพาน',
    category: 'obstacles',
    spanCols: 1,
    spanRows: 1,
    walls: {},
    cornerDots: {},
    bridgeDeck: { heightMm: 50 },
    baseRule: 'พื้นสะพานราบยกสูงคงที่ 50mm ทั้งแผ่น (ไม่มีเส้นขอบดำข้าง)'
  },
  {
    id: 21,
    name: 'จุดทิ้งลูกบาศก์สีน้ำเงิน (ล้อม 3 ด้าน)',
    shortName: 'น้ำเงิน 3 ด้าน',
    category: 'cubes',
    spanCols: 1,
    spanRows: 1,
    walls: { top: true, left: true, right: true },
    cornerDots: {},
    cubeDrop: { color: 'blue', style: 'enclosed3', side: 'top' },
    baseRule: 'จุดทิ้งลูกบาศก์สีน้ำเงินระดับพื้น 5mm ล้อมขอบดำ 3 ด้าน'
  },
  {
    id: 22,
    name: 'จุดทิ้งลูกบาศก์สีน้ำเงิน (ขอบล่าง)',
    shortName: 'น้ำเงิน ขอบล่าง',
    category: 'cubes',
    spanCols: 1,
    spanRows: 1,
    walls: { bottom: true },
    cornerDots: {},
    cubeDrop: { color: 'blue', style: 'bottom_edge', side: 'bottom' },
    baseRule: 'จุดทิ้งลูกบาศก์สีน้ำเงินระดับพื้น 5mm ติดเส้นขอบดำ 1 ด้าน'
  },
  {
    id: 23,
    name: 'จุดทิ้งลูกบาศก์สีแดง (ล้อม 3 ด้าน)',
    shortName: 'แดง 3 ด้าน',
    category: 'cubes',
    spanCols: 1,
    spanRows: 1,
    walls: { top: true, left: true, right: true },
    cornerDots: {},
    cubeDrop: { color: 'red', style: 'enclosed3', side: 'top' },
    baseRule: 'จุดทิ้งลูกบาศก์สีแดงระดับพื้น 5mm ล้อมขอบดำ 3 ด้าน'
  },
  {
    id: 24,
    name: 'จุดทิ้งลูกบาศก์สีแดง (ขอบล่าง)',
    shortName: 'แดง ขอบล่าง',
    category: 'cubes',
    spanCols: 1,
    spanRows: 1,
    walls: { bottom: true },
    cornerDots: {},
    cubeDrop: { color: 'red', style: 'bottom_edge', side: 'bottom' },
    baseRule: 'จุดทิ้งลูกบาศก์สีแดงระดับพื้น 5mm ติดเส้นขอบดำ 1 ด้าน'
  },
  {
    id: 25,
    name: 'จุดทิ้งลูกบาศก์สีเหลือง (ล้อม 3 ด้าน)',
    shortName: 'เหลือง 3 ด้าน',
    category: 'cubes',
    spanCols: 1,
    spanRows: 1,
    walls: { top: true, left: true, right: true },
    cornerDots: {},
    cubeDrop: { color: 'yellow', style: 'enclosed3', side: 'top' },
    baseRule: 'จุดทิ้งลูกบาศก์สีเหลืองระดับพื้น 5mm ล้อมขอบดำ 3 ด้าน'
  },
  {
    id: 26,
    name: 'จุดทิ้งลูกบาศก์สีเหลือง (ขอบล่าง)',
    shortName: 'เหลือง ขอบล่าง',
    category: 'cubes',
    spanCols: 1,
    spanRows: 1,
    walls: { bottom: true },
    cornerDots: {},
    cubeDrop: { color: 'yellow', style: 'bottom_edge', side: 'bottom' },
    baseRule: 'จุดทิ้งลูกบาศก์สีเหลืองระดับพื้น 5mm ติดเส้นขอบดำ 1 ด้าน'
  },
  {
    id: 27,
    name: 'แท่นทิ้งลูกบาศก์ยกสูง 50mm (เขียว)',
    shortName: 'แท่นเขียว 50mm',
    category: 'cubes',
    spanCols: 1,
    spanRows: 1,
    walls: { ...ELEVATED_WALL_DEF },
    cornerDots: {},
    elevatedCube: {
      color: 'green',
      deckHeightMm: 50,
      wallHeightMm: 50,
      totalHeightMm: 100,
      wallThicknessMm: 2,
      zoneWidthCm: 30,
      zoneDepthCm: 15,
      openSide: 'bottom'
    },
    baseRule: 'แท่นสูง 50mm โซนสีเขียว 15×30cm กำแพง 2mm สูงรวม 100mm เปิดโล่งด้านหน้า'
  },
  {
    id: 28,
    name: 'แท่นทิ้งลูกบาศก์ยกสูง 50mm (น้ำเงิน)',
    shortName: 'แท่นน้ำเงิน 50mm',
    category: 'cubes',
    spanCols: 1,
    spanRows: 1,
    walls: { ...ELEVATED_WALL_DEF },
    cornerDots: {},
    elevatedCube: {
      color: 'blue',
      deckHeightMm: 50,
      wallHeightMm: 50,
      totalHeightMm: 100,
      wallThicknessMm: 2,
      zoneWidthCm: 30,
      zoneDepthCm: 15,
      openSide: 'bottom'
    },
    baseRule: 'แท่นสูง 50mm โซนสีน้ำเงิน 15×30cm กำแพง 2mm สูงรวม 100mm เปิดโล่งด้านหน้า'
  },
  {
    id: 29,
    name: 'แท่นทิ้งลูกบาศก์ยกสูง 50mm (แดง)',
    shortName: 'แท่นแดง 50mm',
    category: 'cubes',
    spanCols: 1,
    spanRows: 1,
    walls: { ...ELEVATED_WALL_DEF },
    cornerDots: {},
    elevatedCube: {
      color: 'red',
      deckHeightMm: 50,
      wallHeightMm: 50,
      totalHeightMm: 100,
      wallThicknessMm: 2,
      zoneWidthCm: 30,
      zoneDepthCm: 15,
      openSide: 'bottom'
    },
    baseRule: 'แท่นสูง 50mm โซนสีแดง 15×30cm กำแพง 2mm สูงรวม 100mm เปิดโล่งด้านหน้า'
  },
  {
    id: 30,
    name: 'แท่นทิ้งลูกบาศก์ยกสูง 50mm (เหลือง)',
    shortName: 'แท่นเหลือง 50mm',
    category: 'cubes',
    spanCols: 1,
    spanRows: 1,
    walls: { ...ELEVATED_WALL_DEF },
    cornerDots: {},
    elevatedCube: {
      color: 'yellow',
      deckHeightMm: 50,
      wallHeightMm: 50,
      totalHeightMm: 100,
      wallThicknessMm: 2,
      zoneWidthCm: 30,
      zoneDepthCm: 15,
      openSide: 'bottom'
    },
    baseRule: 'แท่นสูง 50mm โซนสีเหลือง 15×30cm กำแพง 2mm สูงรวม 100mm เปิดโล่งด้านหน้า'
  },
  {
    id: 31,
    name: 'จุดเริ่มต้น (START)',
    shortName: 'START',
    category: 'special',
    spanCols: 1,
    spanRows: 1,
    walls: {},
    cornerDots: {},
    special: 'start',
    baseRule: 'จุดเริ่มต้น START พื้นสีแดงเต็มแผ่น 30×30cm'
  },
  {
    id: 32,
    name: 'จุดเส้นชัย (FINISH)',
    shortName: 'FINISH',
    category: 'special',
    spanCols: 1,
    spanRows: 1,
    walls: {},
    cornerDots: {},
    special: 'finish',
    baseRule: 'จุดเส้นชัย FINISH พื้นสีฟ้าเต็มแผ่น 30×30cm'
  },
  {
    id: 33,
    name: 'อุโมงค์ (Tunnel 300×600×300mm)',
    shortName: 'อุโมงค์ 2×1',
    category: 'special',
    spanCols: 2,
    spanRows: 1,
    walls: {},
    cornerDots: {},
    tunnel: {
      widthMm: 600,
      depthMm: 300,
      heightMm: 300,
      entryPortal: 'front-right',
      exitPortal: 'back-left'
    },
    baseRule: 'โมดูลอุโมงค์ 2×1 (600×300×300mm) หลังคาปิดทึบ เข้าหน้าขวา ออกหลังซ้าย'
  },
  {
    id: 34,
    name: 'ไม้กระดก (Seesaw 300×300mm)',
    shortName: 'ไม้กระดก 12°',
    category: 'obstacles',
    spanCols: 1,
    spanRows: 1,
    walls: {},
    cornerDots: {},
    seesaw: {
      boardLengthMm: 300,
      boardWidthMm: 300,
      boardThicknessMm: 3,
      railHeightMm: 20,
      railThicknessMm: 3,
      railBaseMm: 13,
      pivotDiameterMm: 15,
      pivotHeightMm: 40,
      tiltDeg: 12,
      highEndMm: 70,
      lowEndMm: 0
    },
    baseRule: 'ไม้กระดก 300×300mm หนา 3mm ขอบน้ำเงิน 20mm แกน Ø15mm สูง 40mm เอียง 12° (0→70mm)'
  }
];

export const TILE_BY_ID = Object.fromEntries(STANDARD_TILES.map((t) => [t.id, t]));

export function normalizeRot(rotDeg) {
  const r = Math.round(Number(rotDeg) || 0);
  return (((r % 360) + 360) % 360);
}

export function getTileSpan(tileId, rotDeg = 0) {
  const tile = TILE_BY_ID[Number(tileId)];
  if (!tile) return { rowSpan: 1, colSpan: 1 };
  const rot = normalizeRot(rotDeg);
  if (tile.spanCols === 2 || tile.spanRows === 2) {
    return rot === 90 || rot === 270
      ? { rowSpan: tile.spanCols, colSpan: tile.spanRows }
      : { rowSpan: tile.spanRows, colSpan: tile.spanCols };
  }
  return { rowSpan: 1, colSpan: 1 };
}

export function getCellOccupancyMap(gridData) {
  const occ = Object.create(null);
  if (!Array.isArray(gridData)) return occ;
  const rows = gridData.length;
  const cols = rows > 0 && Array.isArray(gridData[0]) ? gridData[0].length : 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = gridData[r][c];
      if (!cell || !TILE_BY_ID[cell.tileId]) continue;
      const rot = normalizeRot(cell.rot);
      const { rowSpan, colSpan } = getTileSpan(cell.tileId, rot);
      for (let dr = 0; dr < rowSpan; dr++) {
        for (let dc = 0; dc < colSpan; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= rows || cc >= cols) continue;
          occ[`${rr},${cc}`] = {
            anchorR: r,
            anchorC: c,
            isAnchor: dr === 0 && dc === 0,
            cell: { tileId: cell.tileId, rot },
            rowSpan,
            colSpan,
            dr,
            dc
          };
        }
      }
    }
  }
  return occ;
}

export function canPlaceTileAt(gridData, r, c, tileId, rotDeg = 0, ignoreAnchor = null) {
  if (!Array.isArray(gridData) || gridData.length === 0) return false;
  const rows = gridData.length;
  const cols = gridData[0]?.length || 0;
  const { rowSpan, colSpan } = getTileSpan(tileId, rotDeg);

  if (r < 0 || c < 0 || r + rowSpan > rows || c + colSpan > cols) return false;

  const occ = getCellOccupancyMap(gridData);
  for (let dr = 0; dr < rowSpan; dr++) {
    for (let dc = 0; dc < colSpan; dc++) {
      const info = occ[`${r + dr},${c + dc}`];
      if (info) {
        if (ignoreAnchor && info.anchorR === ignoreAnchor.r && info.anchorC === ignoreAnchor.c) {
          continue;
        }
        return false;
      }
    }
  }
  return true;
}

const SIDE_ORDER = ['top', 'right', 'bottom', 'left'];
const CORNER_ORDER = ['tl', 'tr', 'br', 'bl'];

export function rotateSide(side, rotDeg) {
  if (!side) return side;
  const idx = SIDE_ORDER.indexOf(side);
  if (idx < 0) return side;
  const steps = Math.round(normalizeRot(rotDeg) / 90) % 4;
  return SIDE_ORDER[(idx + steps) % 4];
}

export function rotateWalls(walls, rotDeg) {
  const src = walls || {};
  const steps = Math.round(normalizeRot(rotDeg) / 90) % 4;
  const out = { top: false, right: false, bottom: false, left: false };
  for (let i = 0; i < 4; i++) {
    if (src[SIDE_ORDER[i]]) {
      out[SIDE_ORDER[(i + steps) % 4]] = true;
    }
  }
  return out;
}

export function rotateCornerDots(dots, rotDeg) {
  const src = dots || {};
  const steps = Math.round(normalizeRot(rotDeg) / 90) % 4;
  const out = { tl: false, tr: false, br: false, bl: false };
  for (let i = 0; i < 4; i++) {
    if (src[CORNER_ORDER[i]]) {
      out[CORNER_ORDER[(i + steps) % 4]] = true;
    }
  }
  return out;
}

function rotateHeights(baseHeights, rotDeg) {
  const steps = Math.round(normalizeRot(rotDeg) / 90) % 4;
  const out = { top: 5, right: 5, bottom: 5, left: 5 };
  for (let i = 0; i < 4; i++) {
    out[SIDE_ORDER[(i + steps) % 4]] = baseHeights[SIDE_ORDER[i]];
  }
  return out;
}

export function resolveTileSemantics(tileId, rotDeg = 0) {
  const tile = TILE_BY_ID[Number(tileId)] || TILE_BY_ID[1];
  const rot = normalizeRot(rotDeg);
  const span = getTileSpan(tile.id, rot);
  const rotatedWalls = tile.elevatedCube ? { top: false, right: false, bottom: false, left: false } : rotateWalls(tile.walls, rot);
  const rotatedDots = rotateCornerDots(tile.cornerDots, rot);

  const edgeHeights = tile.bridgeRamp
    ? rotateHeights({ top: tile.bridgeRamp.endMm, right: 27.5, bottom: tile.bridgeRamp.startMm, left: 27.5 }, rot)
    : tile.bridgeDeck
      ? { top: 50, right: 50, bottom: 50, left: 50 }
      : tile.elevatedCube
        ? { top: 50, right: 50, bottom: 50, left: 50 }
        : tile.seesaw
          ? rotateHeights({ top: 70, right: 35, bottom: 0, left: 35 }, rot)
          : { top: 5, right: 5, bottom: 5, left: 5 };

  let cubeDrop = null;
  if (tile.cubeDrop) {
    cubeDrop = {
      color: tile.cubeDrop.color,
      color_th: CUBE_COLOR_META[tile.cubeDrop.color]?.nameTh || tile.cubeDrop.color,
      style: tile.cubeDrop.style,
      side: rotateSide(tile.cubeDrop.side, rot),
      elevated_mm: 5
    };
  } else if (tile.elevatedCube) {
    cubeDrop = {
      color: tile.elevatedCube.color,
      color_th: CUBE_COLOR_META[tile.elevatedCube.color]?.nameTh || tile.elevatedCube.color,
      style: 'elevated_50mm_enclosure',
      side: rotateSide('top', rot),
      open_side: rotateSide(tile.elevatedCube.openSide, rot),
      elevated_mm: 50
    };
  }

  let elevatedCubeEnclosure = null;
  if (tile.elevatedCube) {
    const wallSides = rotateWalls(ELEVATED_WALL_DEF, rot);
    elevatedCubeEnclosure = {
      color: tile.elevatedCube.color,
      deck_height_mm: tile.elevatedCube.deckHeightMm,
      wall_height_above_deck_mm: tile.elevatedCube.wallHeightMm,
      total_height_mm: tile.elevatedCube.totalHeightMm,
      wall_thickness_mm: tile.elevatedCube.wallThicknessMm,
      zone_size_cm: [tile.elevatedCube.zoneWidthCm, tile.elevatedCube.zoneDepthCm],
      open_side: rotateSide(tile.elevatedCube.openSide, rot),
      enclosed_walls: wallSides
    };
  }

  let tunnelSpec = null;
  if (tile.tunnel) {
    tunnelSpec = {
      dimensions_mm: {
        width: span.colSpan * 300,
        depth: span.rowSpan * 300,
        height: tile.tunnel.heightMm
      },
      closed_roof: true,
      entry_portal: tile.tunnel.entryPortal,
      exit_portal: tile.tunnel.exitPortal,
      rotation_deg: rot
    };
  }

  let seesawSpec = null;
  if (tile.seesaw) {
    seesawSpec = {
      ...tile.seesaw,
      high_side: rotateSide('top', rot),
      low_side: rotateSide('bottom', rot),
      rail_sides: [rotateSide('left', rot), rotateSide('right', rot)]
    };
  }

  const slopeDir = tile.bridgeRamp ? rot : tile.seesaw ? rot : null;

  return {
    id: tile.id,
    name: tile.name,
    rotation_deg: rot,
    grid_span: span,
    walls_impassable_line_check: {
      ...rotatedWalls,
      corner_dots: rotatedDots
    },
    checkpoint: tile.checkpoint ? { enabled: true, diameter_ratio: tile.checkpoint.diameterRatio } : null,
    center_impassable_black_zone: tile.centerBlackBand
      ? { enabled: true, width_ratio: tile.centerBlackBand.widthRatio, orientation: rot === 90 || rot === 270 ? 'vertical' : 'horizontal' }
      : null,
    cube_drop: cubeDrop,
    special: tile.special || null,
    elevation_3d: {
      base_thickness_mm: 5,
      edge_heights_mm: edgeHeights,
      slope_direction_deg: slopeDir,
      elevated_cube_enclosure: elevatedCubeEnclosure,
      chopsticks_3d: tile.chopsticks
        ? {
            count: tile.chopsticks.count,
            height_above_base_mm: tile.chopsticks.heightMm,
            diameter_mm: tile.chopsticks.diameterMm,
            orientation: rot === 90 || rot === 270 ? 'vertical' : 'horizontal'
          }
        : null,
      tunnel_spec: tunnelSpec,
      seesaw_spec: seesawSpec
    },
    robot_rules: tile.baseRule
  };
}

export function getElevationAtCm(gridData, xCm, yCm, tileWidthCm = 30) {
  if (!Array.isArray(gridData) || gridData.length === 0 || tileWidthCm <= 0) return 5;
  const rows = gridData.length;
  const cols = gridData[0]?.length || 0;
  const c = Math.max(0, Math.min(cols - 1, Math.floor(xCm / tileWidthCm)));
  const r = Math.max(0, Math.min(rows - 1, Math.floor(yCm / tileWidthCm)));

  const occ = getCellOccupancyMap(gridData);
  const info = occ[`${r},${c}`];
  if (!info) return 5;

  const tile = TILE_BY_ID[info.cell.tileId];
  if (!tile) return 5;
  const rot = info.cell.rot;
  const u = Math.max(0, Math.min(1, (xCm - c * tileWidthCm) / tileWidthCm));
  const v = Math.max(0, Math.min(1, (yCm - r * tileWidthCm) / tileWidthCm));

  const rampFactor = rot === 0 ? 1 - v : rot === 90 ? u : rot === 180 ? v : 1 - u;

  if (tile.bridgeRamp) {
    return tile.bridgeRamp.startMm + rampFactor * (tile.bridgeRamp.endMm - tile.bridgeRamp.startMm);
  }
  if (tile.bridgeDeck) {
    return tile.bridgeDeck.heightMm;
  }
  if (tile.elevatedCube) {
    return tile.elevatedCube.deckHeightMm;
  }
  if (tile.seesaw) {
    return rampFactor * tile.seesaw.highEndMm;
  }
  return 5;
}
