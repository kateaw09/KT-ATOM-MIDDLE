'use strict';

import { intLit, floatLit, charLit, boolLit, exprToCode } from './expressionAst.js';

export const MISSION_DEFS = [
  { file: 'RunMode1.ino', fn: 'runMode1()', title: 'Mission 1', sub: 'RunMode1.ino (Default)', bg: '#0f766e', dark: '#115e59', defaultX: 28, defaultY: 28 },
  { file: 'RunMode2.ino', fn: 'runMode2()', title: 'Mission 2', sub: 'RunMode2.ino (Btn B x1)', bg: '#0369a1', dark: '#075985', defaultX: 528, defaultY: 28 },
  { file: 'RunMode3.ino', fn: 'runMode3()', title: 'Mission 3', sub: 'RunMode3.ino (Btn B x2)', bg: '#1d4ed8', dark: '#1e3a8a', defaultX: 1028, defaultY: 28 }
];

export const MISSION_MAP = Object.fromEntries(MISSION_DEFS.map((m) => [m.file, m]));

export const MISSION_SECTIONS = [
  { id: 'Box1', label: 'Box 1', accent: '#0ea5e9' },
  { id: 'Box2', label: 'Box 2', accent: '#10b981' },
  { id: 'Box3', label: 'Box 3', accent: '#f59e0b' },
  { id: 'Box4', label: 'Box 4', accent: '#a855f7' },
  { id: 'EndMission', label: 'EndMission', accent: '#f43f5e' }
];

export function getMissionSectionFnName(filename, sectionId) {
  const modeNum = filename.match(/RunMode(\d)/)?.[1] || '1';
  return modeNum === '1' ? sectionId : `M${modeNum}_${sectionId}`;
}

export const CATEGORIES = [
  { id: 'all', label: 'All Blocks', icon: 'blocks', color: '#38bdf8' },
  { id: 'mission', label: 'Missions', icon: 'play', color: '#0f766e' },
  { id: 'vars', label: 'Variables', icon: 'code', color: '#b45309' },
  { id: 'math', label: 'Math', icon: 'calc', color: '#0284c7' },
  { id: 'logic', label: 'Logic', icon: 'logic', color: '#059669' },
  { id: 'enc', label: 'Encoder Move', icon: 'move', color: '#0369a1' },
  { id: 'spin', label: 'Gyro Spin', icon: 'turn', color: '#1e40af' },
  { id: 'curve', label: 'Curve Encoder', icon: 'turn', color: '#0f766e' },
  { id: 'time', label: 'Time Move', icon: 'gauge', color: '#0e7490' },
  { id: 'path', label: 'Path & EKF', icon: 'move', color: '#7c3aed' },
  { id: 'line', label: 'Line & Drop', icon: 'line', color: '#15803d' },
  { id: 'ctrl', label: 'Control', icon: 'settings', color: '#be123c' }
];

export const CAT_COLORS = {
  vars: { bg: '#b45309', dark: '#92400e' },
  math: { bg: '#0284c7', dark: '#0369a1' },
  logic: { bg: '#059669', dark: '#047857' },
  enc: { bg: '#0369a1', dark: '#075985' },
  spin: { bg: '#1e40af', dark: '#1e3a8a' },
  curve: { bg: '#0f766e', dark: '#115e59' },
  time: { bg: '#0e7490', dark: '#155e75' },
  path: { bg: '#7c3aed', dark: '#6d28d9' },
  line: { bg: '#15803d', dark: '#166534' },
  ctrl: { bg: '#be123c', dark: '#9f1239' }
};

export function parseWaypointListText(rawText) {
  const parts = String(rawText || '')
    .split(/[;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const pts = [];
  for (const part of parts) {
    const nums = part.split(',').map((s) => parseFloat(s.trim()));
    if (nums.length >= 2 && Number.isFinite(nums[0]) && Number.isFinite(nums[1])) {
      pts.push({ x: nums[0], y: nums[1] });
    }
  }
  return pts;
}

export function buildCommandDefs(getVariables) {
  return [
    {
      type: 'FC_SIMPLE',
      cat: 'enc',
      title: 'FC',
      sig: 'FC(speed, cm)',
      desc: 'เดินหน้าตามระยะทาง (cm)',
      defaults: { speed: 60, cm: 30, stop: true },
      fields: [
        { key: 'speed', label: 'spd', type: 'number' },
        { key: 'cm', label: 'cm', type: 'number' },
        { key: 'stop', label: 'stop', type: 'bool' }
      ],
      toCode: (p) => (p.stop === true || p.stop === 'true'
        ? `FC(${intLit(p.speed)}, ${floatLit(p.cm)});`
        : `FC(${intLit(p.speed)}, ${floatLit(p.cm)}, ${boolLit(p.stop)});`)
    },
    {
      type: 'BC_SIMPLE',
      cat: 'enc',
      title: 'BC',
      sig: 'BC(speed, cm)',
      desc: 'ถอยหลังตามระยะทาง (cm)',
      defaults: { speed: 50, cm: 30, stop: true },
      fields: [
        { key: 'speed', label: 'spd', type: 'number' },
        { key: 'cm', label: 'cm', type: 'number' },
        { key: 'stop', label: 'stop', type: 'bool' }
      ],
      toCode: (p) => (p.stop === true || p.stop === 'true'
        ? `BC(${intLit(p.speed)}, ${floatLit(p.cm)});`
        : `BC(${intLit(p.speed)}, ${floatLit(p.cm)}, ${boolLit(p.stop)});`)
    },
    {
      type: 'FC_DIR',
      cat: 'enc',
      title: 'FC',
      sig: "FC(speed, cm, 'R')",
      desc: "เดินหน้าแล้วเลี้ยว/หมุน 90° ('L'/'R'=Swing ไม่หยุด, 'l'/'r'=หยุดหมุน Spin)",
      defaults: { speed: 80, cm: 30, dir: 'R' },
      fields: [
        { key: 'speed', label: 'spd', type: 'number' },
        { key: 'cm', label: 'cm', type: 'number' },
        { key: 'dir', label: 'dir', type: 'dirTurn90' }
      ],
      toCode: (p) => `FC(${intLit(p.speed)}, ${floatLit(p.cm)}, ${charLit(p.dir)});`
    },
    {
      type: 'BC_DIR',
      cat: 'enc',
      title: 'BC',
      sig: "BC(speed, cm, 'L')",
      desc: "ถอยหลังแล้วเลี้ยว/หมุน 90° ('L'/'R'=Swing ไม่หยุด, 'l'/'r'=หยุดหมุน Spin)",
      defaults: { speed: 60, cm: 30, dir: 'L' },
      fields: [
        { key: 'speed', label: 'spd', type: 'number' },
        { key: 'cm', label: 'cm', type: 'number' },
        { key: 'dir', label: 'dir', type: 'dirTurn90' }
      ],
      toCode: (p) => `BC(${intLit(p.speed)}, ${floatLit(p.cm)}, ${charLit(p.dir)});`
    },
    {
      type: 'FC4',
      cat: 'enc',
      title: 'FC4',
      sig: "FC4(speed, cm, 'R')",
      desc: "เดินหน้าแล้วเลี้ยว/หมุน 45° ('L'/'R'=Swing ไม่หยุด, 'l'/'r'=หยุดหมุน Spin)",
      defaults: { speed: 60, cm: 30, dir: 'R' },
      fields: [
        { key: 'speed', label: 'spd', type: 'number' },
        { key: 'cm', label: 'cm', type: 'number' },
        { key: 'dir', label: 'dir', type: 'dirTurn45' }
      ],
      toCode: (p) => `FC4(${intLit(p.speed)}, ${floatLit(p.cm)}, ${charLit(p.dir)});`
    },
    {
      type: 'BC4',
      cat: 'enc',
      title: 'BC4',
      sig: "BC4(speed, cm, 'L')",
      desc: "ถอยหลังแล้วเลี้ยว/หมุน 45° ('L'/'R'=Swing ไม่หยุด, 'l'/'r'=หยุดหมุน Spin)",
      defaults: { speed: 50, cm: 20, dir: 'L' },
      fields: [
        { key: 'speed', label: 'spd', type: 'number' },
        { key: 'cm', label: 'cm', type: 'number' },
        { key: 'dir', label: 'dir', type: 'dirTurn45' }
      ],
      toCode: (p) => `BC4(${intLit(p.speed)}, ${floatLit(p.cm)}, ${charLit(p.dir)});`
    },
    {
      type: 'FC_BOX_SIMPLE',
      cat: 'enc',
      title: 'FC_BOX',
      sig: 'FC_BOX(speed, boxes)',
      desc: 'เดินหน้าตามจำนวนช่อง (1–8 ช่อง ใช้ตาราง Box Calibration)',
      defaults: { speed: 65, boxes: 1, stop: true },
      fields: [
        { key: 'speed', label: 'spd', type: 'number' },
        { key: 'boxes', label: 'box', type: 'number' },
        { key: 'stop', label: 'stop', type: 'bool' }
      ],
      toCode: (p) => (p.stop === true || p.stop === 'true'
        ? `FC_BOX(${intLit(p.speed)}, ${floatLit(p.boxes)});`
        : `FC_BOX(${intLit(p.speed)}, ${floatLit(p.boxes)}, ${boolLit(p.stop)});`)
    },
    {
      type: 'BC_BOX_SIMPLE',
      cat: 'enc',
      title: 'BC_BOX',
      sig: 'BC_BOX(speed, boxes)',
      desc: 'ถอยหลังตามจำนวนช่อง (1–8 ช่อง ใช้ตาราง Box Calibration)',
      defaults: { speed: 50, boxes: 1, stop: true },
      fields: [
        { key: 'speed', label: 'spd', type: 'number' },
        { key: 'boxes', label: 'box', type: 'number' },
        { key: 'stop', label: 'stop', type: 'bool' }
      ],
      toCode: (p) => (p.stop === true || p.stop === 'true'
        ? `BC_BOX(${intLit(p.speed)}, ${floatLit(p.boxes)});`
        : `BC_BOX(${intLit(p.speed)}, ${floatLit(p.boxes)}, ${boolLit(p.stop)});`)
    },
    {
      type: 'FC_BOX_DIR',
      cat: 'enc',
      title: 'FC_BOX',
      sig: "FC_BOX(speed, boxes, 'R')",
      desc: "เดินหน้าตามจำนวนช่องแล้วเลี้ยว/หมุน 90° ('L'/'R'=Swing, 'l'/'r'=Spin)",
      defaults: { speed: 65, boxes: 1, dir: 'R' },
      fields: [
        { key: 'speed', label: 'spd', type: 'number' },
        { key: 'boxes', label: 'box', type: 'number' },
        { key: 'dir', label: 'dir', type: 'dirTurn90' }
      ],
      toCode: (p) => `FC_BOX(${intLit(p.speed)}, ${floatLit(p.boxes)}, ${charLit(p.dir)});`
    },
    {
      type: 'BC_BOX_DIR',
      cat: 'enc',
      title: 'BC_BOX',
      sig: "BC_BOX(speed, boxes, 'L')",
      desc: "ถอยหลังตามจำนวนช่องแล้วเลี้ยว/หมุน 90° ('L'/'R'=Swing, 'l'/'r'=Spin)",
      defaults: { speed: 50, boxes: 1, dir: 'L' },
      fields: [
        { key: 'speed', label: 'spd', type: 'number' },
        { key: 'boxes', label: 'box', type: 'number' },
        { key: 'dir', label: 'dir', type: 'dirTurn90' }
      ],
      toCode: (p) => `BC_BOX(${intLit(p.speed)}, ${floatLit(p.boxes)}, ${charLit(p.dir)});`
    },
    {
      type: 'SPIN',
      cat: 'spin',
      title: 'SpinDegree',
      sig: 'SpinDegree(deg)',
      desc: 'หมุนอยู่กับที่ (+ ขวา, - ซ้าย)',
      defaults: { deg: 90 },
      fields: [{ key: 'deg', label: 'deg', type: 'number' }],
      toCode: (p) => `SpinDegree(${floatLit(p.deg)});`
    },
    {
      type: 'TURN_F',
      cat: 'spin',
      title: 'TrunDegreeFront',
      sig: 'TrunDegreeFront(deg)',
      desc: 'เทิร์นล้อหน้า (+ ขวา, - ซ้าย)',
      defaults: { deg: 90 },
      fields: [{ key: 'deg', label: 'deg', type: 'number' }],
      toCode: (p) => `TrunDegreeFront(${floatLit(p.deg)});`
    },
    {
      type: 'TURN_B',
      cat: 'spin',
      title: 'TrunDegreeBack',
      sig: 'TrunDegreeBack(deg)',
      desc: 'เทิร์นล้อหลัง (+ ขวา, - ซ้าย)',
      defaults: { deg: 90 },
      fields: [{ key: 'deg', label: 'deg', type: 'number' }],
      toCode: (p) => `TrunDegreeBack(${floatLit(p.deg)});`
    },
    {
      type: 'TTF90',
      cat: 'curve',
      title: 'TTF90',
      sig: 'TTF90(L, R, cm)',
      desc: 'ตีโค้งหน้า 90° ด้วย Encoder',
      defaults: { spdL: 80, spdR: 25, cm: 33 },
      fields: [
        { key: 'spdL', label: 'L', type: 'number' },
        { key: 'spdR', label: 'R', type: 'number' },
        { key: 'cm', label: 'cm', type: 'number' }
      ],
      toCode: (p) => `TTF90(${intLit(p.spdL)}, ${intLit(p.spdR)}, ${intLit(p.cm)});`
    },
    {
      type: 'TTF45',
      cat: 'curve',
      title: 'TTF45',
      sig: 'TTF45(L, R, cm)',
      desc: 'ตีโค้งหน้า 45° ด้วย Encoder',
      defaults: { spdL: 80, spdR: 25, cm: 17 },
      fields: [
        { key: 'spdL', label: 'L', type: 'number' },
        { key: 'spdR', label: 'R', type: 'number' },
        { key: 'cm', label: 'cm', type: 'number' }
      ],
      toCode: (p) => `TTF45(${intLit(p.spdL)}, ${intLit(p.spdR)}, ${intLit(p.cm)});`
    },
    {
      type: 'TTB90',
      cat: 'curve',
      title: 'TTB90',
      sig: 'TTB90(L, R, cm)',
      desc: 'ตีโค้งถอยหลัง 90° ด้วย Encoder',
      defaults: { spdL: 25, spdR: 80, cm: 33 },
      fields: [
        { key: 'spdL', label: 'L', type: 'number' },
        { key: 'spdR', label: 'R', type: 'number' },
        { key: 'cm', label: 'cm', type: 'number' }
      ],
      toCode: (p) => `TTB90(${intLit(p.spdL)}, ${intLit(p.spdR)}, ${intLit(p.cm)});`
    },
    {
      type: 'TTB45',
      cat: 'curve',
      title: 'TTB45',
      sig: 'TTB45(L, R, cm)',
      desc: 'ตีโค้งถอยหลัง 45° ด้วย Encoder',
      defaults: { spdL: 25, spdR: 80, cm: 17 },
      fields: [
        { key: 'spdL', label: 'L', type: 'number' },
        { key: 'spdR', label: 'R', type: 'number' },
        { key: 'cm', label: 'cm', type: 'number' }
      ],
      toCode: (p) => `TTB45(${intLit(p.spdL)}, ${intLit(p.spdR)}, ${intLit(p.cm)});`
    },
    {
      type: 'FF_TIME',
      cat: 'time',
      title: 'FF',
      sig: 'FF(speed, ms)',
      desc: 'เดินหน้าจับเวลา ms (ข้ามสิ่งกีดขวาง)',
      defaults: { speed: 60, ms: 400 },
      fields: [
        { key: 'speed', label: 'spd', type: 'number' },
        { key: 'ms', label: 'ms', type: 'number' }
      ],
      toCode: (p) => `FF(${intLit(p.speed)}, ${intLit(p.ms)});`
    },
    {
      type: 'BB_TIME',
      cat: 'time',
      title: 'BB',
      sig: 'BB(speed, ms)',
      desc: 'ถอยหลังจับเวลา ms',
      defaults: { speed: 50, ms: 400 },
      fields: [
        { key: 'speed', label: 'spd', type: 'number' },
        { key: 'ms', label: 'ms', type: 'number' }
      ],
      toCode: (p) => `BB(${intLit(p.speed)}, ${intLit(p.ms)});`
    },
    {
      type: 'EKF_RESET',
      cat: 'path',
      title: 'ekfReset',
      sig: 'ekfReset(x, y, headingDeg)',
      desc: 'รีเซ็ตพิกัด PoseEKF (x, y ซม., มุมองศา)',
      defaults: { x: 0, y: 0, deg: 0 },
      fields: [
        { key: 'x', label: 'x', type: 'number' },
        { key: 'y', label: 'y', type: 'number' },
        { key: 'deg', label: 'deg', type: 'number' }
      ],
      toCode: (p) => `ekfReset(${floatLit(p.x)}, ${floatLit(p.y)}, ${floatLit(p.deg)});`
    },
    {
      type: 'FOLLOW_PATH',
      cat: 'path',
      title: 'followPath',
      sig: 'followPath(pts, maxCmPs, stop)',
      desc: 'วิ่งตามเส้นทาง Pure Pursuit (ใส่จุด x,y คั่นด้วย ; เช่น 30,0; 60,0; 60,30)',
      defaults: { points: '30,0; 60,0; 60,30', speed: 50, stop: true },
      fields: [
        { key: 'points', label: 'pts', type: 'text' },
        { key: 'speed', label: 'cm/s', type: 'number' },
        { key: 'stop', label: 'stop', type: 'bool' }
      ],
      toCode: (p) => {
        const pts = parseWaypointListText(p.points);
        const list = (pts.length >= 2 ? pts : [{ x: 30, y: 0 }, { x: 60, y: 30 }])
          .map((pt) => `{${floatLit(pt.x)}, ${floatLit(pt.y)}}`)
          .join(', ');
        const cnt = Math.max(2, pts.length);
        return `{ Waypoint _p[] = {${list}}; followPath(_p, ${cnt}, ${floatLit(p.speed)}, ${boolLit(p.stop)}); }`;
      }
    },
    {
      type: 'VEL_DRIVE',
      cat: 'path',
      title: 'driveVel',
      sig: 'driveWheelVelocitiesCmPs(vL, vR)',
      desc: 'คุมความเร็วล้อซ้าย-ขวาหน่วย cm/s ด้วย Velocity PID+FF',
      defaults: { vL: 40, vR: 40 },
      fields: [
        { key: 'vL', label: 'vL', type: 'number' },
        { key: 'vR', label: 'vR', type: 'number' }
      ],
      toCode: (p) => `driveWheelVelocitiesCmPs(${floatLit(p.vL)}, ${floatLit(p.vR)});`
    },
    {
      type: 'SETF',
      cat: 'line',
      title: 'SetF',
      sig: 'SetF(speed)',
      desc: 'จัดแนวเส้นหน้า + รีเซ็ต Yaw = 0',
      defaults: { speed: 25 },
      fields: [{ key: 'speed', label: 'spd', type: 'number' }],
      toCode: (p) => `SetF(${intLit(p.speed)});`
    },
    {
      type: 'SETF_BACK',
      cat: 'line',
      title: 'SetF',
      sig: 'SetF(speed, backCm)',
      desc: 'จัดเส้นหน้าแล้วถอยออกตาม cm',
      defaults: { speed: 25, cm: 10 },
      fields: [
        { key: 'speed', label: 'spd', type: 'number' },
        { key: 'cm', label: 'back', type: 'number' }
      ],
      toCode: (p) => `SetF(${intLit(p.speed)}, ${floatLit(p.cm)});`
    },
    {
      type: 'SETF_DIR',
      cat: 'line',
      title: 'SetF',
      sig: "SetF(speed, backCm, 'R')",
      desc: 'จัดเส้นหน้า -> ถอย -> หมุน Spin 90°',
      defaults: { speed: 25, cm: 10, dir: 'R' },
      fields: [
        { key: 'speed', label: 'spd', type: 'number' },
        { key: 'cm', label: 'back', type: 'number' },
        { key: 'dir', label: 'dir', type: 'dir' }
      ],
      toCode: (p) => `SetF(${intLit(p.speed)}, ${floatLit(p.cm)}, ${charLit(p.dir)});`
    },
    {
      type: 'SETB',
      cat: 'line',
      title: 'SetB',
      sig: 'SetB(speed)',
      desc: 'ถอยจัดแนวเส้นหลัง + รีเซ็ต Yaw = 0',
      defaults: { speed: 25 },
      fields: [{ key: 'speed', label: 'spd', type: 'number' }],
      toCode: (p) => `SetB(${intLit(p.speed)});`
    },
    {
      type: 'SETB_FWD',
      cat: 'line',
      title: 'SetB',
      sig: 'SetB(speed, fwdCm)',
      desc: 'จัดเส้นหลังแล้วเดินหน้าออกตาม cm',
      defaults: { speed: 25, cm: 10 },
      fields: [
        { key: 'speed', label: 'spd', type: 'number' },
        { key: 'cm', label: 'fwd', type: 'number' }
      ],
      toCode: (p) => `SetB(${intLit(p.speed)}, ${floatLit(p.cm)});`
    },
    {
      type: 'SETB_DIR',
      cat: 'line',
      title: 'SetB',
      sig: "SetB(speed, fwdCm, 'L')",
      desc: 'จัดเส้นหลัง -> เดินออก -> หมุน Spin 90°',
      defaults: { speed: 25, cm: 10, dir: 'L' },
      fields: [
        { key: 'speed', label: 'spd', type: 'number' },
        { key: 'cm', label: 'fwd', type: 'number' },
        { key: 'dir', label: 'dir', type: 'dir' }
      ],
      toCode: (p) => `SetB(${intLit(p.speed)}, ${floatLit(p.cm)}, ${charLit(p.dir)});`
    },
    {
      type: 'DROPF_SPD',
      cat: 'line',
      title: 'DropF',
      sig: 'DropF(speed)',
      desc: 'วิ่งเข้าเส้นหน้า (Align Front) -> ปล่อยลูกบาศก์หน้า',
      defaults: { speed: 30 },
      fields: [{ key: 'speed', label: 'spd', type: 'number' }],
      toCode: (p) => `DropF(${intLit(p.speed)});`
    },
    {
      type: 'DROPB_SPD',
      cat: 'line',
      title: 'DropB',
      sig: 'DropB(speed)',
      desc: 'ถอยเข้าเส้นหลัง (Align Back) -> ปล่อยลูกบาศก์หลัง',
      defaults: { speed: 30 },
      fields: [{ key: 'speed', label: 'spd', type: 'number' }],
      toCode: (p) => `DropB(${intLit(p.speed)});`
    },
    {
      type: 'DROPF',
      cat: 'line',
      title: 'DropF',
      sig: 'DropF()',
      desc: 'ปล่อยลูกบาศก์ด้านหน้าทันที',
      defaults: {},
      fields: [],
      toCode: () => 'DropF();'
    },
    {
      type: 'DROPB',
      cat: 'line',
      title: 'DropB',
      sig: 'DropB()',
      desc: 'ปล่อยลูกบาศก์ด้านหลังทันที',
      defaults: {},
      fields: [],
      toCode: () => 'DropB();'
    },
    {
      type: 'SET_VAR',
      cat: 'vars',
      title: 'set var',
      sig: 'var = expr;',
      desc: 'กำหนดค่า/สูตรให้ตัวแปรใน Variables.ino',
      defaults: { name: 'spdNorm', value: 60 },
      fields: [
        { key: 'name', label: 'var', type: 'var_name' },
        { key: 'value', label: '=', type: 'number' }
      ],
      toCode: (p) => {
        const vObj = (getVariables() || []).find((v) => v.name === p.name);
        if (vObj && vObj.type === 'float') return `${p.name} = ${floatLit(p.value)};`;
        if (vObj && vObj.type === 'char') return `${p.name} = ${charLit(p.value)};`;
        if (vObj && vObj.type === 'bool') return `${p.name} = ${boolLit(p.value)};`;
        return `${p.name} = ${intLit(p.value)};`;
      }
    },
    {
      type: 'IF_INLINE',
      cat: 'ctrl',
      title: 'if',
      sig: 'if (cond) { stmt; }',
      desc: 'ทำคำสั่งเมื่อเงื่อนไขตรรกศาสตร์เป็นจริง',
      defaults: { cond: { kind: 'expr', op: 'LOGIC_GT', args: { a: { kind: 'var', name: 'spdNorm' }, b: 40 } }, stmt: 'FC(80, 30.0f);' },
      fields: [
        { key: 'cond', label: 'if', type: 'number' },
        { key: 'stmt', label: 'do', type: 'text' }
      ],
      toCode: (p) => `if (${exprToCode(p.cond, 'raw')}) { ${String(p.stmt || '').trim()} }`
    },
    {
      type: 'STOP',
      cat: 'ctrl',
      title: 'STOP',
      sig: 'STOP()',
      desc: 'หยุดรอผู้ใช้กดปุ่ม A/B แล้วรีเซ็ต Yaw',
      defaults: {},
      fields: [],
      toCode: () => 'STOP();'
    },
    {
      type: 'DELAY',
      cat: 'ctrl',
      title: 'delay',
      sig: 'delay(ms)',
      desc: 'หน่วงเวลา (มิลลิวินาที)',
      defaults: { ms: 300 },
      fields: [{ key: 'ms', label: 'ms', type: 'number' }],
      toCode: (p) => `delay(${intLit(p.ms)});`
    },
    {
      type: 'RAW',
      cat: 'ctrl',
      title: 'C++',
      sig: 'Raw C++',
      desc: 'แทรกคำสั่ง C++ อิสระ 1 บรรทัด',
      defaults: { raw: '// custom command' },
      fields: [{ key: 'raw', label: 'C++', type: 'text' }],
      toCode: (p) => String(p.raw || '').trim()
    }
  ];
}

export const DEFAULT_MOTION_CONFIG = {
  useCodeMotionDefaults: true,
  enableBoxDistCal: true,
  distOffsetCm: -2.0,
  boxTileCm: 30.0,
  box1Cm: 30.0,
  box2Cm: 60.0,
  box3Cm: 90.0,
  box4Cm: 120.0,
  box5Cm: 150.0,
  box6Cm: 180.0,
  box7Cm: 210.0,
  box8Cm: 240.0,
  enableSpeedInvariantDist: true,
  moveAccelRate: 260.0,
  moveDecelRate: 260.0,
  moveArriveSpeed: 15,
  motorMinMoveSpeed: 12,
  enableEndPositionTrim: false,
  fwdKp: 1.2,
  fwdKd: 15.0,
  bwdKp: 1.2,
  bwdKd: 15.0,
  kp_turn: 1.5,
  kd_turn: 15.0,
  Set_kp: 2.0,
  Set_kd: 15.0,
  kp_time: 1.8,
  kd_time: 15.0,
  spinKp: 2.0,
  spinKd: 0.16,
  spinMinSpeed: 24,
  spinMaxSpeed: 100,
  turnFrontKp: 2.5,
  turnFrontKd: 0.16,
  turnFrontMinSpeed: 28,
  turnFrontMaxSpeed: 100,
  turnBackKp: 2.5,
  turnBackKd: 0.16,
  turnBackMinSpeed: 28,
  turnBackMaxSpeed: 100,
  threshold_spinDegree: 1.5,
  spinLeftOffsetDeg: 0.0,
  smallAngle_threshold: 30.0,
  smallAngle_turnDegree: 1.5,
  turnRightOffsetDeg: 0.0,
  enableTurnDistComp: true,
  turnEntryCompCm: 10.0,
  turnExitRadiusCm: 2.8,
  servoDropDelayMs: 200,
  effectiveTrackCm: 11.5,
  motorI2cDedupMs: 12,
  velKs: 8.0,
  velKv: 0.83,
  velKp: 0.9,
  velKi: 2.5,
  velKd: 0.02,
  velIntegralLimit: 25.0,
  velEmaAlpha: 0.38,
  ekfQPos: 0.02,
  ekfQHeadingBase: 0.002,
  ekfQHeadingTurn: 0.06,
  ekfRImuYaw: 0.0015,
  ppLookaheadMinCm: 12.0,
  ppLookaheadMaxCm: 28.0,
  ppLookaheadGain: 0.25,
  ppMaxLatAccel: 120.0,
  ppGoalToleranceCm: 3.0,
  ppWaypointSpacingCm: 4.0
};

export const CONFIG_SECTIONS = [
  { id: 'mode', title: 'โหมดการทำงานเริ่มต้น (Boot & Run Mode)' },
  { id: 'boxDist', title: 'ตารางระยะเดินตามช่อง 1–8 ช่อง (Box Distance Calibration)' },
  { id: 'speedInvariant', title: 'คุมระยะคงที่ทุกความเร็ว 1–100 (Speed-Invariant Motion)' },
  { id: 'pd', title: 'จูนความตรง Gyro PD (เดินหน้า / ถอยหลัง / Time)' },
  { id: 'spin', title: 'จูนการหมุนอยู่กับที่และเลี้ยว Pivot (Gyro Spin & Turn)' },
  { id: 'turnComp', title: 'ชดเชยระยะเข้า-ออกโค้งอัตโนมัติ (Swing Turn Distance Comp)' },
  { id: 'velPid', title: 'จูน Velocity PID + Feedforward & I2C Bus (Motor.ino)' },
  { id: 'ekf', title: 'จูน Sensor Fusion PoseEKF (Encoder 4 ล้อ + IMU Yaw)' },
  { id: 'purePursuit', title: 'จูน Pure Pursuit Path Control (PathControl.ino)' },
  { id: 'servo', title: 'เวลาหน่วงเซอร์โว (Servo Timing)' },
  { id: 'overwrite', title: 'เขียนทับค่า Flash สำรอง (ใช้เมื่อจอเสีย / อ่านค่าผ่านจอไม่ได้)' }
];

export const CONFIG_FIELDS = [
  { section: 'mode', key: 'enableMultiMode', label: 'enableMultiMode', hint: 'เปิดให้กดปุ่ม B สลับโหมด RunMode 1-3 บนตัวหุ่น', type: 'bool', default: true },
  { section: 'mode', key: 'currentRunMode', label: 'currentRunMode', hint: 'โหมดภารกิจเริ่มต้นเมื่อเปิดเครื่อง (1 - 3)', type: 'number', min: 1, max: 3, default: 1 },
  { section: 'mode', key: 'useCodeMotionDefaults', label: 'useCodeMotionDefaults', hint: 'ใช้ค่าเริ่มต้นจากโค้ด Config.ino (ซิงค์กับ enableCodeMotionDefaults() ใน setup()) และล็อก Auto Tune ใน Assembly', type: 'bool', default: DEFAULT_MOTION_CONFIG.useCodeMotionDefaults },
  { section: 'boxDist', key: 'enableBoxDistCal', label: 'enableBoxDistCal', hint: 'เปิดใช้ตารางแปลงระยะ 1–8 ช่องบนตัวหุ่น (Simulator ยังเดินตามระยะสนามจริงเสมอ)', type: 'bool', default: DEFAULT_MOTION_CONFIG.enableBoxDistCal },
  { section: 'boxDist', key: 'distOffsetCm', label: 'distOffsetCm', hint: 'ชดเชยระยะเดินตรงรวมทุกช่อง (+/- ซม.) — เดินเกินใส่ค่าลบ (เช่น -2.0), เดินขาดใส่ค่าบวก (ปรับได้ -10 ถึง +10)', type: 'number', min: -10, max: 10, step: 0.1, default: DEFAULT_MOTION_CONFIG.distOffsetCm },
  { section: 'boxDist', key: 'boxTileCm', label: 'boxTileCm', hint: 'ความยาวมาตรฐาน 1 ช่องสนามสำหรับอ้างอิงและ BOX(n) (ซม.)', type: 'number', min: 5, max: 200, step: 0.5, default: DEFAULT_MOTION_CONFIG.boxTileCm },
  { section: 'boxDist', boxNum: 1, key: 'box1Cm', label: 'box1Cm', hint: '1 ช่อง (สนาม 30 cm)', type: 'number', min: 1, max: 500, step: 0.1, default: DEFAULT_MOTION_CONFIG.box1Cm },
  { section: 'boxDist', boxNum: 2, key: 'box2Cm', label: 'box2Cm', hint: '2 ช่อง (สนาม 60 cm)', type: 'number', min: 1, max: 500, step: 0.1, default: DEFAULT_MOTION_CONFIG.box2Cm },
  { section: 'boxDist', boxNum: 3, key: 'box3Cm', label: 'box3Cm', hint: '3 ช่อง (สนาม 90 cm)', type: 'number', min: 1, max: 500, step: 0.1, default: DEFAULT_MOTION_CONFIG.box3Cm },
  { section: 'boxDist', boxNum: 4, key: 'box4Cm', label: 'box4Cm', hint: '4 ช่อง (สนาม 120 cm)', type: 'number', min: 1, max: 500, step: 0.1, default: DEFAULT_MOTION_CONFIG.box4Cm },
  { section: 'boxDist', boxNum: 5, key: 'box5Cm', label: 'box5Cm', hint: '5 ช่อง (สนาม 150 cm)', type: 'number', min: 1, max: 500, step: 0.1, default: DEFAULT_MOTION_CONFIG.box5Cm },
  { section: 'boxDist', boxNum: 6, key: 'box6Cm', label: 'box6Cm', hint: '6 ช่อง (สนาม 180 cm)', type: 'number', min: 1, max: 500, step: 0.1, default: DEFAULT_MOTION_CONFIG.box6Cm },
  { section: 'boxDist', boxNum: 7, key: 'box7Cm', label: 'box7Cm', hint: '7 ช่อง (สนาม 210 cm)', type: 'number', min: 1, max: 500, step: 0.1, default: DEFAULT_MOTION_CONFIG.box7Cm },
  { section: 'boxDist', boxNum: 8, key: 'box8Cm', label: 'box8Cm', hint: '8 ช่อง (สนาม 240 cm)', type: 'number', min: 1, max: 500, step: 0.1, default: DEFAULT_MOTION_CONFIG.box8Cm },
  { section: 'speedInvariant', key: 'enableSpeedInvariantDist', label: 'enableSpeedInvariantDist', hint: 'คุมระยะให้เท่ากันทุกความเร็ว 1–100 (โค้งเร่ง/ชะลอ + Anti-Stall + Active Brake)', type: 'bool', default: DEFAULT_MOTION_CONFIG.enableSpeedInvariantDist },
  { section: 'speedInvariant', key: 'moveAccelRate', label: 'moveAccelRate', hint: 'อัตราเร่งออกตัวลดล้อฟรี (speed²/cm)', type: 'number', min: 50, max: 2000, step: 10, default: DEFAULT_MOTION_CONFIG.moveAccelRate },
  { section: 'speedInvariant', key: 'moveDecelRate', label: 'moveDecelRate', hint: 'อัตราหน่วงชะลอเข้าเป้า (speed²/cm) — ยิ่งน้อยยิ่งเริ่มชะลอเร็วและหยุดนิ่งขึ้น', type: 'number', min: 50, max: 2000, step: 10, default: DEFAULT_MOTION_CONFIG.moveDecelRate },
  { section: 'speedInvariant', key: 'moveArriveSpeed', label: 'moveArriveSpeed', hint: 'ความเร็วเข้าเป้าก่อนเบรก (1–40) — ทุกความเร็วจะลดมาเท่านี้ก่อนหยุด', type: 'number', min: 1, max: 60, step: 1, default: DEFAULT_MOTION_CONFIG.moveArriveSpeed },
  { section: 'speedInvariant', key: 'motorMinMoveSpeed', label: 'motorMinMoveSpeed', hint: 'ความเร็วขั้นต่ำที่ล้อเริ่มหมุนจริง (Anti-Stall สำหรับสั่งความเร็ว 1–15)', type: 'number', min: 1, max: 40, step: 1, default: DEFAULT_MOTION_CONFIG.motorMinMoveSpeed },
  { section: 'speedInvariant', key: 'enableEndPositionTrim', label: 'enableEndPositionTrim', hint: 'เติมระยะเดินหน้าเพิ่มด้วย Encoder เฉพาะกรณีหยุดขาด (ไม่ถอยหลัง)', type: 'bool', default: DEFAULT_MOTION_CONFIG.enableEndPositionTrim },
  { section: 'pd', key: 'fwdKp', label: 'fwdKp', hint: 'สัดส่วนชดเชยความเอียงเดินหน้า (Kp)', type: 'number', step: 0.05, default: DEFAULT_MOTION_CONFIG.fwdKp },
  { section: 'pd', key: 'fwdKd', label: 'fwdKd', hint: 'ตัวหน่วงลดส่ายเดินหน้า (Kd)', type: 'number', step: 0.1, default: DEFAULT_MOTION_CONFIG.fwdKd },
  { section: 'pd', key: 'bwdKp', label: 'bwdKp', hint: 'สัดส่วนชดเชยความเอียงถอยหลัง (Kp)', type: 'number', step: 0.05, default: DEFAULT_MOTION_CONFIG.bwdKp },
  { section: 'pd', key: 'bwdKd', label: 'bwdKd', hint: 'ตัวหน่วงลดส่ายถอยหลัง (Kd)', type: 'number', step: 0.1, default: DEFAULT_MOTION_CONFIG.bwdKd },
  { section: 'pd', key: 'kp_turn', label: 'kp_turn', hint: 'ความไวเดินตรง FC / BC / FC4 / BC4 (Kp)', type: 'number', step: 0.05, default: DEFAULT_MOTION_CONFIG.kp_turn },
  { section: 'pd', key: 'kd_turn', label: 'kd_turn', hint: 'ตัวหน่วงเดินตรง FC / BC / FC4 / BC4 (Kd)', type: 'number', step: 0.1, default: DEFAULT_MOTION_CONFIG.kd_turn },
  { section: 'pd', key: 'Set_kp', label: 'Set_kp', hint: 'ความไวจัดแนวเข้าเส้น SetF / SetB (Kp)', type: 'number', step: 0.05, default: DEFAULT_MOTION_CONFIG.Set_kp },
  { section: 'pd', key: 'Set_kd', label: 'Set_kd', hint: 'ตัวหน่วงจัดแนวเข้าเส้น SetF / SetB (Kd)', type: 'number', step: 0.1, default: DEFAULT_MOTION_CONFIG.Set_kd },
  { section: 'pd', key: 'kp_time', label: 'kp_time', hint: 'ความไวเดินจับเวลา FF / BB (Kp)', type: 'number', step: 0.05, default: DEFAULT_MOTION_CONFIG.kp_time },
  { section: 'pd', key: 'kd_time', label: 'kd_time', hint: 'ตัวหน่วงเดินจับเวลา FF / BB (Kd)', type: 'number', step: 0.1, default: DEFAULT_MOTION_CONFIG.kd_time },
  { section: 'spin', key: 'spinKp', label: 'spinKp', hint: 'ความไวหมุนอยู่กับที่ SpinDegree Kp', type: 'number', step: 0.05, default: DEFAULT_MOTION_CONFIG.spinKp },
  { section: 'spin', key: 'spinKd', label: 'spinKd', hint: 'ตัวหน่วงลดดีดกลับ SpinDegree Kd', type: 'number', step: 0.05, default: DEFAULT_MOTION_CONFIG.spinKd },
  { section: 'spin', key: 'spinMinSpeed', label: 'spinMinSpeed', hint: 'ความเร็วขั้นต่ำขณะ Spin', type: 'number', min: 10, max: 100, default: DEFAULT_MOTION_CONFIG.spinMinSpeed },
  { section: 'spin', key: 'spinMaxSpeed', label: 'spinMaxSpeed', hint: 'ความเร็วสูงสุดขณะ Spin', type: 'number', min: 15, max: 100, default: DEFAULT_MOTION_CONFIG.spinMaxSpeed },
  { section: 'spin', key: 'turnFrontKp', label: 'turnFrontKp', hint: 'Pivot ล้อหน้า TrunDegreeFront Kp', type: 'number', step: 0.05, default: DEFAULT_MOTION_CONFIG.turnFrontKp },
  { section: 'spin', key: 'turnFrontKd', label: 'turnFrontKd', hint: 'Pivot ล้อหน้า Kd', type: 'number', step: 0.05, default: DEFAULT_MOTION_CONFIG.turnFrontKd },
  { section: 'spin', key: 'turnFrontMinSpeed', label: 'turnFrontMinSpeed', hint: 'ความเร็วต่ำสุดล้อหน้า', type: 'number', min: 10, max: 100, default: DEFAULT_MOTION_CONFIG.turnFrontMinSpeed },
  { section: 'spin', key: 'turnFrontMaxSpeed', label: 'turnFrontMaxSpeed', hint: 'ความเร็วสูงสุดล้อหน้า', type: 'number', min: 15, max: 100, default: DEFAULT_MOTION_CONFIG.turnFrontMaxSpeed },
  { section: 'spin', key: 'turnBackKp', label: 'turnBackKp', hint: 'Pivot ล้อหลัง TrunDegreeBack Kp', type: 'number', step: 0.05, default: DEFAULT_MOTION_CONFIG.turnBackKp },
  { section: 'spin', key: 'turnBackKd', label: 'turnBackKd', hint: 'Pivot ล้อหลัง Kd', type: 'number', step: 0.05, default: DEFAULT_MOTION_CONFIG.turnBackKd },
  { section: 'spin', key: 'turnBackMinSpeed', label: 'turnBackMinSpeed', hint: 'ความเร็วต่ำสุดล้อหลัง', type: 'number', min: 10, max: 100, default: DEFAULT_MOTION_CONFIG.turnBackMinSpeed },
  { section: 'spin', key: 'turnBackMaxSpeed', label: 'turnBackMaxSpeed', hint: 'ความเร็วสูงสุดล้อหลัง', type: 'number', min: 15, max: 100, default: DEFAULT_MOTION_CONFIG.turnBackMaxSpeed },
  { section: 'spin', key: 'threshold_spinDegree', label: 'threshold_spinDegree', hint: 'ระยะองศาหยุดเข้าเป้า Spin (แนะนำ 1.5–3.0°)', type: 'number', step: 0.1, default: DEFAULT_MOTION_CONFIG.threshold_spinDegree },
  { section: 'spin', key: 'smallAngle_threshold', label: 'smallAngle_threshold', hint: 'องศาที่เริ่มชะลอความเร็วหมุน', type: 'number', step: 1, default: DEFAULT_MOTION_CONFIG.smallAngle_threshold },
  { section: 'spin', key: 'smallAngle_turnDegree', label: 'smallAngle_turnDegree', hint: 'ความละเอียดหยุด Pivot (แนะนำ 1.5–3.0°)', type: 'number', step: 0.1, default: DEFAULT_MOTION_CONFIG.smallAngle_turnDegree },
  { section: 'turnComp', key: 'enableTurnDistComp', label: 'enableTurnDistComp', hint: 'เปิดชดเชยระยะก่อนเข้าโค้งและหลังออกโค้ง Swing Turn อัตโนมัติ (FC/BC/FC4/BC4)', type: 'bool', default: DEFAULT_MOTION_CONFIG.enableTurnDistComp },
  { section: 'turnComp', key: 'turnEntryCompCm', label: 'turnEntryCompCm', hint: 'ระยะลดก่อนเริ่มเลี้ยว Swing 90° (ซม.) — สเกลอัตโนมัติสำหรับ 45° (x0.414)', type: 'number', min: 0, max: 18, step: 0.1, default: DEFAULT_MOTION_CONFIG.turnEntryCompCm },
  { section: 'turnComp', key: 'turnExitRadiusCm', label: 'turnExitRadiusCm', hint: 'ระยะชดเชยหลังออกโค้ง Swing 90° (ซม.) ที่หักออกจากคำสั่งถัดไป — จุดหมุนแถวล้อหน้าแนะนำ 2.0–3.0 (ตั้ง 0 ได้)', type: 'number', min: 0, max: 18, step: 0.1, default: DEFAULT_MOTION_CONFIG.turnExitRadiusCm },
  { section: 'velPid', key: 'effectiveTrackCm', label: 'effectiveTrackCm', hint: 'ความกว้างฐานล้อเสมือนจริงสำหรับ Skid-Steer 4 ล้อ (ซม.)', type: 'number', min: 5, max: 40, step: 0.1, default: DEFAULT_MOTION_CONFIG.effectiveTrackCm },
  { section: 'velPid', key: 'motorI2cDedupMs', label: 'motorI2cDedupMs', hint: 'ช่วงกรองส่งคำสั่ง I2C มอเตอร์ซ้ำ (ms, แนะนำ 12 ms สำหรับ 50–100 Hz)', type: 'number', min: 1, max: 50, step: 1, default: DEFAULT_MOTION_CONFIG.motorI2cDedupMs },
  { section: 'velPid', key: 'velKs', label: 'velKs', hint: 'Static Friction Feedforward (กำลังขั้นต่ำที่ล้อเริ่มหมุน)', type: 'number', min: 0, max: 40, step: 0.5, default: DEFAULT_MOTION_CONFIG.velKs },
  { section: 'velPid', key: 'velKv', label: 'velKv', hint: 'Velocity Feedforward Gain (คำสั่งต่อ 1 cm/s)', type: 'number', min: 0, max: 5, step: 0.01, default: DEFAULT_MOTION_CONFIG.velKv },
  { section: 'velPid', key: 'velKp', label: 'velKp', hint: 'Velocity PID Proportional Gain', type: 'number', min: 0, max: 10, step: 0.05, default: DEFAULT_MOTION_CONFIG.velKp },
  { section: 'velPid', key: 'velKi', label: 'velKi', hint: 'Velocity PID Integral Gain', type: 'number', min: 0, max: 20, step: 0.1, default: DEFAULT_MOTION_CONFIG.velKi },
  { section: 'velPid', key: 'velKd', label: 'velKd', hint: 'Velocity PID Derivative Gain', type: 'number', min: 0, max: 2, step: 0.005, default: DEFAULT_MOTION_CONFIG.velKd },
  { section: 'velPid', key: 'velIntegralLimit', label: 'velIntegralLimit', hint: 'จำกัดเทอม Integral ของ Velocity PID (+/-)', type: 'number', min: 0, max: 60, step: 1, default: DEFAULT_MOTION_CONFIG.velIntegralLimit },
  { section: 'velPid', key: 'velEmaAlpha', label: 'velEmaAlpha', hint: 'ค่ากรองความเร็วล้อ EMA (0.1–1.0)', type: 'number', min: 0.05, max: 1, step: 0.02, default: DEFAULT_MOTION_CONFIG.velEmaAlpha },
  { section: 'ekf', key: 'ekfQPos', label: 'ekfQPos', hint: 'Process Noise ตำแหน่ง X/Y (cm²)', type: 'number', min: 0.0001, max: 5, step: 0.005, default: DEFAULT_MOTION_CONFIG.ekfQPos },
  { section: 'ekf', key: 'ekfQHeadingBase', label: 'ekfQHeadingBase', hint: 'Process Noise มุมขณะวิ่งตรง (rad²)', type: 'number', min: 0.0001, max: 1, step: 0.0005, default: DEFAULT_MOTION_CONFIG.ekfQHeadingBase },
  { section: 'ekf', key: 'ekfQHeadingTurn', label: 'ekfQHeadingTurn', hint: 'Process Noise มุมขณะเลี้ยว/ล้อไถล (rad² — สูงเพื่อให้เชื่อ IMU มากขึ้น)', type: 'number', min: 0.001, max: 1, step: 0.005, default: DEFAULT_MOTION_CONFIG.ekfQHeadingTurn },
  { section: 'ekf', key: 'ekfRImuYaw', label: 'ekfRImuYaw', hint: 'Measurement Noise ของ IMU Yaw (rad²)', type: 'number', min: 0.0001, max: 1, step: 0.0005, default: DEFAULT_MOTION_CONFIG.ekfRImuYaw },
  { section: 'purePursuit', key: 'ppLookaheadMinCm', label: 'ppLookaheadMinCm', hint: 'ระยะมองล่วงหน้าต่ำสุด Lookahead (แนะนำ 10–14 cm)', type: 'number', min: 4, max: 50, step: 0.5, default: DEFAULT_MOTION_CONFIG.ppLookaheadMinCm },
  { section: 'purePursuit', key: 'ppLookaheadMaxCm', label: 'ppLookaheadMaxCm', hint: 'ระยะมองล่วงหน้าสูงสุด Lookahead (cm)', type: 'number', min: 6, max: 80, step: 0.5, default: DEFAULT_MOTION_CONFIG.ppLookaheadMaxCm },
  { section: 'purePursuit', key: 'ppLookaheadGain', label: 'ppLookaheadGain', hint: 'สัดส่วนเพิ่ม Lookahead ตามความเร็ว (k_ld)', type: 'number', min: 0, max: 2, step: 0.02, default: DEFAULT_MOTION_CONFIG.ppLookaheadGain },
  { section: 'purePursuit', key: 'ppMaxLatAccel', label: 'ppMaxLatAccel', hint: 'ความเร่งด้านข้างสูงสุดขณะเข้าโค้ง (cm/s²)', type: 'number', min: 20, max: 500, step: 5, default: DEFAULT_MOTION_CONFIG.ppMaxLatAccel },
  { section: 'purePursuit', key: 'ppGoalToleranceCm', label: 'ppGoalToleranceCm', hint: 'รัศมีเข้าเป้าจุดสุดท้าย (cm)', type: 'number', min: 1, max: 15, step: 0.5, default: DEFAULT_MOTION_CONFIG.ppGoalToleranceCm },
  { section: 'purePursuit', key: 'ppWaypointSpacingCm', label: 'ppWaypointSpacingCm', hint: 'ระยะห่างในการแทรก Waypoint (cm)', type: 'number', min: 1.5, max: 15, step: 0.5, default: DEFAULT_MOTION_CONFIG.ppWaypointSpacingCm },
  { section: 'servo', key: 'servoDropDelayMs', label: 'servoDropDelayMs', hint: 'เวลาหน่วงรอหลังสั่งปล่อยเซอร์โว (ms)', type: 'number', min: 50, max: 2000, default: DEFAULT_MOTION_CONFIG.servoDropDelayMs },
  { section: 'overwrite', isToggle: true, key: 'forceOverwriteFlashFromCode', label: 'forceOverwriteFlashFromCode', hint: 'เปิด true เฉพาะเมื่อต้องการเขียนทับค่าใน Flash จากรายการสำรองด้านล่างนี้', type: 'bool' },
  { section: 'overwrite', requiresOverwrite: true, key: 'ticksPerCm', label: 'ticksPerCm', hint: 'จำนวน Ticks ต่อ 1 cm (จากการเข็น 30cm)', type: 'number', step: 0.01 },
  { section: 'overwrite', requiresOverwrite: true, key: 'distTuneMm', label: 'distTuneMm', hint: 'ค่าชดเชยระยะเดิน +/- mm ต่อ 30cm', type: 'number', min: -150, max: 150 },
  { section: 'overwrite', requiresOverwrite: true, key: 'calRun30cmMs', label: 'calRun30cmMs', hint: 'เวลาวิ่งจริง 30cm ที่ความเร็ว 45 (ms)', type: 'number', min: 150, max: 15000 },
  { section: 'overwrite', requiresOverwrite: true, key: 'motorTrim', label: 'motorTrim', hint: 'ชดเชยซ้าย/ขวา (- ลดซ้าย / + เพิ่มขวา)', type: 'number', min: -25, max: 25 },
  { section: 'overwrite', requiresOverwrite: true, key: 'frontLock', label: 'frontLock', hint: 'องศาล็อคเซอร์โวหน้า', type: 'number', min: 0, max: 180 },
  { section: 'overwrite', requiresOverwrite: true, key: 'frontDrop', label: 'frontDrop', hint: 'องศาปล่อยเซอร์โวหน้า', type: 'number', min: 0, max: 180 },
  { section: 'overwrite', requiresOverwrite: true, key: 'backLock', label: 'backLock', hint: 'องศาล็อคเซอร์โวหลัง', type: 'number', min: 0, max: 180 },
  { section: 'overwrite', requiresOverwrite: true, key: 'backDrop', label: 'backDrop', hint: 'องศาปล่อยเซอร์โวหลัง', type: 'number', min: 0, max: 180 },
  { section: 'overwrite', requiresOverwrite: true, key: 'showCmdOnRun', label: 'showCmdOnRun', hint: 'แสดงคำสั่งและเวลาบนจอ LCD ขณะวิ่ง', type: 'bool' },
  { section: 'overwrite', requiresOverwrite: true, key: 'beepOnCmd', label: 'beepOnCmd', hint: 'ส่งเสียง Beep เมื่อเริ่มคำสั่ง', type: 'bool' }
];

export const SNIPPETS = [
  { code: "FC_BOX(65, 2.0f, 'R');", desc: 'เดินหน้า 2 ช่อง (ใช้ตาราง 1-8 ช่อง) แล้ว Swing ขวา 90°' },
  { code: 'FC_BOX(65, 3.0f);', desc: 'เดินหน้า 3 ช่องแล้วหยุด (ปรับระยะใน Config)' },
  { code: 'BC_BOX(50, 1.0f);', desc: 'ถอยหลัง 1 ช่องแล้วหยุด' },
  { code: "FC(65, BOX(2), 'R');", desc: 'เดินหน้า 2 ช่องด้วย BOX(2) แล้ว Swing ขวา 90°' },
  { code: "FC(80, 30.0f, 'R');", desc: 'เดินหน้า 30 cm แล้ว Swing ขวา 90° (ไม่หยุด)' },
  { code: "FC(80, 30.0f, 'L');", desc: 'เดินหน้า 30 cm แล้ว Swing ซ้าย 90° (ไม่หยุด)' },
  { code: "FC(80, 30.0f, 'r');", desc: 'เดินหน้า 30 cm แล้วหยุดหมุน Spin ขวา 90°' },
  { code: "FC4(60, 30.0f, 'R');", desc: 'เดินหน้า 30 cm แล้ว Swing ขวา 45° (ไม่หยุด)' },
  { code: "BC4(50, 20.0f, 'r');", desc: 'ถอย 20 cm แล้วหยุดหมุน Spin ขวา 45°' },
  { code: 'SpinDegree(90.0f);', desc: 'หมุนขวาอยู่กับที่ 90°' },
  { code: 'TrunDegreeFront(-90.0f);', desc: 'Pivot ล้อหน้าซ้าย 90°' },
  { code: 'TTF90(80, 25, 33);', desc: 'ตีโค้งหน้า 90° ด้วย Encoder' },
  { code: 'TTB90(25, 80, 33);', desc: 'ตีโค้งถอยหลัง 90° ด้วย Encoder' },
  { code: 'FF(60, 400);', desc: 'เดินหน้าจับเวลา 400 ms' },
  { code: 'BB(50, 400);', desc: 'ถอยหลังจับเวลา 400 ms' },
  { code: 'ekfReset(0.0f, 0.0f, 0.0f);', desc: 'รีเซ็ตพิกัด PoseEKF เป็นจุดเริ่มต้น (0, 0, 0°)' },
  { code: '{ Waypoint _p[] = {{30.0f, 0.0f}, {60.0f, 30.0f}}; followPath(_p, 2, 50.0f, true); }', desc: 'วิ่งตามเส้นทางโค้ง Pure Pursuit' },
  { code: 'driveWheelVelocitiesCmPs(40.0f, 40.0f);', desc: 'คุมความเร็วล้อซ้าย-ขวาหน่วย cm/s (Velocity PID+FF)' },
  { code: 'SetF(25, 10.0f);', desc: 'จัดแนวเส้นหน้าแล้วถอย 10 cm' },
  { code: 'DropF(30);', desc: 'เข้าเส้นหน้า -> ปล่อยลูกบาศก์หน้า' },
  { code: 'DropB(30);', desc: 'เข้าเส้นหลัง -> ปล่อยลูกบาศก์หลัง' },
  { code: 'STOP();', desc: 'หยุดรอปุ่ม A/B แล้วรีเซ็ต Yaw & EKF' }
];
