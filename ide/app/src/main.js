'use strict';

import './styles/main.css';
import {
  REPORTER_DEFS,
  REPORTER_MAP,
  isPlainNumber,
  isReporterNode,
  createDefaultReporterNode,
  exprToCode,
  splitTopLevelArgs,
  parseCodeArgToAst,
  evalExpression
} from './blocks/expressionAst.js';
import {
  MISSION_DEFS,
  MISSION_MAP,
  CATEGORIES,
  CAT_COLORS,
  buildCommandDefs,
  MISSION_SECTIONS,
  getMissionSectionFnName,
  DEFAULT_MOTION_CONFIG,
  CONFIG_SECTIONS,
  CONFIG_FIELDS,
  SNIPPETS
} from './blocks/definitions.js';
import { createCodeIdeController } from './editor/codeIde.js';
import { buildSimSegments, evalSegmentPose, drawSimulator } from './sim/simulator.js';
import { render2DFieldGrid, renderIsometricGrid } from './sim/fieldRenderer.js';
import { createMapManagerController } from './sim/mapManager.js';
import {
  loadRescueMiddlePreset,
  resizeGridData,
  buildCompactGrid,
  parseCompactGrid,
  findStartTileCell
} from './sim/fieldJson.js';

// ============================================================================
// Pure SVG Helper (Zero Emojis Anywhere)
// ============================================================================
const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function svgIcon(name, sizeClass = '') {
  const cls = sizeClass ? `svg-ico ${sizeClass}` : 'svg-ico';
  return `<svg class="${cls}" aria-hidden="true"><use href="#ico-${name}"></use></svg>`;
}

function setBtnContent(btn, iconName, labelText, sizeClass = '') {
  if (!btn) return;
  btn.innerHTML = `${svgIcon(iconName, sizeClass)}<span>${escapeHtml(labelText)}</span>`;
}

// ============================================================================
// Storage Keys & Panel Preferences
// ============================================================================
const LAYOUT_STORAGE_KEY = 'kt_middle_ide_canvas_v2';
const PANEL_STORAGE_KEY = 'kt_middle_ide_panels_v1';
const AUTOSAVE_STORAGE_KEY = 'kt_middle_ide_autosave_v1';
const FIELD_MAP_STORAGE_KEY = 'kt_middle_ide_field_map_v3';

const DEFAULT_PANEL_PREFS = {
  toolboxW: 318,
  simW: 370,
  codeSimW: 340,
  previewH: 136,
  drawerH: 138,
  codeSidebarW: 250,
  toolboxCollapsed: false,
  simCollapsed: false,
  codeSimCollapsed: false,
  previewCollapsed: false,
  drawerCollapsed: false,
  drawerMaximized: false,
  codeSidebarCollapsed: false,
  simConfigCollapsed: false,
  simWide: false
};

// ============================================================================
// Mission Section Structure Helpers (Box1 - Box4 & EndMission)
// ============================================================================
function createEmptyMissionSections() {
  return Object.fromEntries(MISSION_SECTIONS.map((s) => [s.id, []]));
}

function ensureMissionStructure(m) {
  if (!m) return null;
  if (!m.sections || typeof m.sections !== 'object') {
    const legacyBlocks = Array.isArray(m.blocks) ? m.blocks : [];
    m.sections = createEmptyMissionSections();
    m.sections.Box1 = legacyBlocks;
  } else {
    for (const sec of MISSION_SECTIONS) {
      if (!Array.isArray(m.sections[sec.id])) m.sections[sec.id] = [];
    }
  }
  delete m.blocks;
  if (!m.activeSection || !m.sections[m.activeSection]) m.activeSection = 'Box1';
  if (!m.foldedSections || typeof m.foldedSections !== 'object') m.foldedSections = {};
  if (!m.disabledSections || typeof m.disabledSections !== 'object') m.disabledSections = {};
  if (typeof m.extraFunctionsCode !== 'string') m.extraFunctionsCode = '';
  if (!m.extraFunctionsBlocks || typeof m.extraFunctionsBlocks !== 'object') m.extraFunctionsBlocks = {};
  return m;
}

function getMissionTotalCount(m) {
  if (!m) return 0;
  ensureMissionStructure(m);
  return MISSION_SECTIONS.reduce((sum, sec) => sum + (m.sections[sec.id]?.length || 0), 0);
}

function getMissionActiveCount(m) {
  if (!m) return 0;
  ensureMissionStructure(m);
  return MISSION_SECTIONS.reduce((sum, sec) => {
    if (m.disabledSections?.[sec.id]) return sum;
    return sum + (m.sections[sec.id] || []).filter((b) => !b?.disabled).length;
  }, 0);
}

// ============================================================================
// Application State
// ============================================================================
const state = {
  mode: 'visual',
  activeCategory: 'all',
  activeMissionFile: 'RunMode1.ino',
  activeCodeFile: 'RunMode1.ino',
  files: {},
  savedFiles: {},
  config: {},
  variables: [],
  calibration: {
    source: 'Config.ino',
    isLive: false,
    tpcm: 15.0,
    distmm: 0,
    calms: 1150,
    cmps: 26.09,
    trim: 0,
    smin: null,
    smax: null,
    sthr: null,
    flock: 90,
    fdrop: 140,
    block: 90,
    bdrop: 140,
    showcmd: true,
    beepcmd: true,
    spinkp: 0.9,
    spinkd: 0.65,
    tfkp: 1.4,
    tfkd: 0.55,
    tbkp: 1.4,
    tbkd: 0.55,
    tspin: 2.5,
    slofs: 0.0,
    tturn: 4.0,
    trofs: 0.0,
    sathr: 55.0,
    smaxs: 85,
    tfmax: 80,
    tbmax: 80
  },
  missions: {
    'RunMode1.ino': { placed: true, x: 28, y: 28, folded: false, activeSection: 'Box1', foldedSections: {}, disabledSections: {}, sections: createEmptyMissionSections() },
    'RunMode2.ino': { placed: true, x: 528, y: 28, folded: false, activeSection: 'Box1', foldedSections: {}, disabledSections: {}, sections: createEmptyMissionSections() },
    'RunMode3.ino': { placed: false, x: 1028, y: 28, folded: false, activeSection: 'Box1', foldedSections: {}, disabledSections: {}, sections: createEmptyMissionSections() }
  },
  looseBlocks: [],
  nextLooseZ: 30,
  lastDuplicatedStackId: -1,
  nextBlockId: 1,
  zoomPct: 100,
  panelPrefs: { ...DEFAULT_PANEL_PREFS },
  drawerStateBeforeMap: null,
  blockHistory: { past: [], future: [], lastSig: '' },
  autoSave: true,
  autoSaveTimer: null,
  versions: [],
  versionsDir: '',
  activeVersionId: null,
  activeSubVersionId: null,
  editingVersionId: null,
  verCoverMode: '2d',
  verPendingCover: null,
  verExpandedSubs: {},
  compiling: false,
  uploading: false,
  artifacts: [],
  sim: {
    playing: false,
    segments: [],
    stats: { nominalCm: 0, calibratedCm: 0, totalTicks: 0, estSec: 0 },
    segIdx: 0,
    segProgress: 0,
    elapsedMs: 0,
    rafId: null,
    lastTs: 0,
    robotX: 45,
    robotY: 165,
    robotH: 0,
    activeBlockIndex: -1,
    cameraFollowRobot: false
  },
  fieldMap: {
    rows: 7,
    cols: 7,
    tileWidthCm: 30,
    gridData: loadRescueMiddlePreset(7, 7),
    simViewMode: '2d',
    simCameraRot: 0,
    showMarkers: false
  },
  plugins: {
    list: [],
    connectedIds: [],
    primaryPluginId: null,
    pluginsDir: ''
  },
  serialPort: null,
  serialReader: null,
  serialKeepReading: false,
  serialLineBuf: '',
  serialCalWaiter: null
};

const COMMAND_DEFS = buildCommandDefs(() => state.variables);
const DEF_MAP = Object.fromEntries(COMMAND_DEFS.map((d) => [d.type, d]));

// Slot registry for draggable Variable / Math / Logic reporter drops
const slotMetaMap = new WeakMap();
let focusedSlotEl = null;

// ============================================================================
// Console & HTTP Helpers
// ============================================================================
function updateDocumentTitle() {
  if (state.mode === 'map') {
    document.title = 'KT Middle IDE - Map Manager';
    return;
  }
  const activeFile = state.mode === 'code' ? state.activeCodeFile : state.activeMissionFile;
  document.title = `KT Middle IDE - ${activeFile || 'RunMode1.ino'}`;
}

function appendConsole(text, clear = false) {
  const el = $('consoleLog');
  if (!el) return;
  el.textContent = clear ? text : `${el.textContent}\n${text}`;
  el.scrollTop = el.scrollHeight;
}

function appendSerial(text) {
  const el = $('serialLog');
  if (!el) return;
  el.textContent += text;
  if (el.textContent.length > 40000) el.textContent = el.textContent.slice(-30000);
  el.scrollTop = el.scrollHeight;
}

async function apiJson(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const hasBody = options.body !== undefined && options.body !== null;
  const headers = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };
  const reqInit = { ...options, method, headers };

  const maxAttempts = method === 'GET' ? 2 : 1;
  let lastErr = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, reqInit);
      const text = await res.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (_) {
          data = { error: text };
        }
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    } catch (err) {
      lastErr = err;
      if (err instanceof TypeError && attempt + 1 < maxAttempts) {
        await new Promise((r) => setTimeout(r, 180));
        continue;
      }
      if (err instanceof TypeError || /Failed to fetch/i.test(String(err?.message || ''))) {
        throw new Error('เชื่อมต่อเซิร์ฟเวอร์ IDE ไม่ได้ (Failed to fetch) — กรุณาตรวจสอบว่าเซิร์ฟเวอร์ IDE ยังทำงานอยู่');
      }
      throw err;
    }
  }
  throw lastErr;
}

// ============================================================================
// Code IDE Controller Integration
// ============================================================================
const codeIde = createCodeIdeController({
  getActiveFile: () => state.activeCodeFile,
  setActiveFileContent: (file, content) => { state.files[file] = content; },
  getVariables: () => state.variables,
  getConfigKeys: () => CONFIG_FIELDS.map((f) => f.key),
  onFilesUpdated: () => {
    updateDirtyIndicator();
    scheduleAutoSave();
    if (state.activeCodeFile === 'Variables.ino') {
      parseVariablesFile();
      renderPalette();
      renderCanvas();
      rebuildSimAndDraw(false);
    } else if (state.missions[state.activeCodeFile]) {
      parseMissionFile(state.activeCodeFile);
      if (state.activeCodeFile === state.activeMissionFile) {
        renderVisualCodePreview(state.files[state.activeMissionFile], state.activeMissionFile);
        rebuildSimAndDraw(false);
      }
      renderCanvas();
    }
  },
  onCursorLineChange: ({ file, lineNumber, code }) => {
    seekSimulationToCodeLine(file, code, lineNumber);
  },
  onSettingsChanged: (s) => {
    state.sim.cameraFollowRobot = !!s.cameraFollowRobot;
    if (!s.clickToSeekSim && !state.sim.playing) {
      state.sim.activeBlockIndex = -1;
      updateSimActiveVisuals();
      if ($('codeSimHint')) {
        $('codeSimHint').textContent = 'Click-to-Seek ปิดอยู่ (เปิดได้ที่ IDE Settings)';
      }
    } else if (s.clickToSeekSim && $('codeSimHint')) {
      $('codeSimHint').textContent = 'คลิกบรรทัดใน RunMode1–3.ino เพื่อย้ายจุดจำลอง';
    }
    syncSimViewButtons();
    drawSimulator(state);
  },
  appendConsole
});

// ============================================================================
// Calibration Helpers
// ============================================================================
function syncCalibrationFromConfig(forceReset = false) {
  if (state.calibration.isLive && !forceReset) return;
  const cfg = state.config || {};
  const calms = Math.max(150, Number(cfg.calRun30cmMs) || 1150);
  state.calibration = {
    ...state.calibration,
    source: 'Config.ino',
    isLive: false,
    tpcm: Number.isFinite(cfg.ticksPerCm) ? cfg.ticksPerCm : 15.0,
    distmm: Number.isFinite(cfg.distTuneMm) ? cfg.distTuneMm : 0,
    calms,
    cmps: 30000.0 / calms,
    trim: Number.isFinite(cfg.motorTrim) ? cfg.motorTrim : 0,
    flock: Number.isFinite(cfg.frontLock) ? cfg.frontLock : 90,
    fdrop: Number.isFinite(cfg.frontDrop) ? cfg.frontDrop : 140,
    block: Number.isFinite(cfg.backLock) ? cfg.backLock : 90,
    bdrop: Number.isFinite(cfg.backDrop) ? cfg.backDrop : 140,
    showcmd: cfg.showCmdOnRun !== undefined ? !!cfg.showCmdOnRun : true,
    beepcmd: cfg.beepOnCmd !== undefined ? !!cfg.beepOnCmd : true,
    smin: Array.isArray(cfg.senMin) ? cfg.senMin : state.calibration.smin,
    smax: Array.isArray(cfg.senMax) ? cfg.senMax : state.calibration.smax,
    sthr: Array.isArray(cfg.senThresh) ? cfg.senThresh : state.calibration.sthr,
    spinkp: Number.isFinite(cfg.spinKp) ? cfg.spinKp : DEFAULT_MOTION_CONFIG.spinKp,
    spinkd: Number.isFinite(cfg.spinKd) ? cfg.spinKd : DEFAULT_MOTION_CONFIG.spinKd,
    tfkp: Number.isFinite(cfg.turnFrontKp) ? cfg.turnFrontKp : DEFAULT_MOTION_CONFIG.turnFrontKp,
    tfkd: Number.isFinite(cfg.turnFrontKd) ? cfg.turnFrontKd : DEFAULT_MOTION_CONFIG.turnFrontKd,
    tbkp: Number.isFinite(cfg.turnBackKp) ? cfg.turnBackKp : DEFAULT_MOTION_CONFIG.turnBackKp,
    tbkd: Number.isFinite(cfg.turnBackKd) ? cfg.turnBackKd : DEFAULT_MOTION_CONFIG.turnBackKd,
    tspin: Number.isFinite(cfg.threshold_spinDegree) ? cfg.threshold_spinDegree : DEFAULT_MOTION_CONFIG.threshold_spinDegree,
    slofs: Number.isFinite(cfg.spinLeftOffsetDeg) ? cfg.spinLeftOffsetDeg : DEFAULT_MOTION_CONFIG.spinLeftOffsetDeg,
    tturn: Number.isFinite(cfg.smallAngle_turnDegree) ? cfg.smallAngle_turnDegree : DEFAULT_MOTION_CONFIG.smallAngle_turnDegree,
    trofs: Number.isFinite(cfg.turnRightOffsetDeg) ? cfg.turnRightOffsetDeg : DEFAULT_MOTION_CONFIG.turnRightOffsetDeg,
    sathr: Number.isFinite(cfg.smallAngle_threshold) ? cfg.smallAngle_threshold : DEFAULT_MOTION_CONFIG.smallAngle_threshold,
    smaxs: Number.isFinite(cfg.spinMaxSpeed) ? cfg.spinMaxSpeed : DEFAULT_MOTION_CONFIG.spinMaxSpeed,
    tfmax: Number.isFinite(cfg.turnFrontMaxSpeed) ? cfg.turnFrontMaxSpeed : DEFAULT_MOTION_CONFIG.turnFrontMaxSpeed,
    tbmax: Number.isFinite(cfg.turnBackMaxSpeed) ? cfg.turnBackMaxSpeed : DEFAULT_MOTION_CONFIG.turnBackMaxSpeed
  };
  renderCalibrationCard();
}

function applyLiveCalibration(calObj, sourceLabel) {
  if (!calObj || typeof calObj !== 'object') return;
  const calms = Math.max(150, Number(calObj.calms ?? state.calibration.calms) || 1150);
  const next = {
    ...state.calibration,
    source: sourceLabel,
    isLive: true,
    tpcm: Number(calObj.tpcm ?? state.calibration.tpcm),
    distmm: Number(calObj.distmm ?? state.calibration.distmm),
    calms,
    cmps: Number(calObj.cmps ?? (30000.0 / calms)),
    trim: Number(calObj.trim ?? state.calibration.trim),
    smin: Array.isArray(calObj.smin) ? calObj.smin : state.calibration.smin,
    smax: Array.isArray(calObj.smax) ? calObj.smax : state.calibration.smax,
    sthr: Array.isArray(calObj.sthr) ? calObj.sthr : state.calibration.sthr,
    flock: calObj.flock !== undefined ? Number(calObj.flock) : state.calibration.flock,
    fdrop: calObj.fdrop !== undefined ? Number(calObj.fdrop) : state.calibration.fdrop,
    block: calObj.block !== undefined ? Number(calObj.block) : state.calibration.block,
    bdrop: calObj.bdrop !== undefined ? Number(calObj.bdrop) : state.calibration.bdrop,
    showcmd: calObj.showcmd !== undefined ? !!calObj.showcmd : state.calibration.showcmd,
    beepcmd: calObj.beepcmd !== undefined ? !!calObj.beepcmd : state.calibration.beepcmd,
    spinkp: calObj.spinkp !== undefined ? Number(calObj.spinkp) : state.calibration.spinkp,
    spinkd: calObj.spinkd !== undefined ? Number(calObj.spinkd) : state.calibration.spinkd,
    tfkp: calObj.tfkp !== undefined ? Number(calObj.tfkp) : state.calibration.tfkp,
    tfkd: calObj.tfkd !== undefined ? Number(calObj.tfkd) : state.calibration.tfkd,
    tbkp: calObj.tbkp !== undefined ? Number(calObj.tbkp) : state.calibration.tbkp,
    tbkd: calObj.tbkd !== undefined ? Number(calObj.tbkd) : state.calibration.tbkd,
    tspin: calObj.tspin !== undefined ? Number(calObj.tspin) : state.calibration.tspin,
    slofs: calObj.slofs !== undefined ? Number(calObj.slofs) : state.calibration.slofs,
    tturn: calObj.tturn !== undefined ? Number(calObj.tturn) : state.calibration.tturn,
    trofs: calObj.trofs !== undefined ? Number(calObj.trofs) : state.calibration.trofs,
    sathr: calObj.sathr !== undefined ? Number(calObj.sathr) : state.calibration.sathr,
    smaxs: calObj.smaxs !== undefined ? Number(calObj.smaxs) : state.calibration.smaxs,
    tfmax: calObj.tfmax !== undefined ? Number(calObj.tfmax) : state.calibration.tfmax,
    tbmax: calObj.tbmax !== undefined ? Number(calObj.tbmax) : state.calibration.tbmax
  };
  state.calibration = next;

  const syncedConfig = {
    ...(state.config || {}),
    ...(calObj.cdef !== undefined ? { useCodeMotionDefaults: !!calObj.cdef } : {}),
    ticksPerCm: next.tpcm,
    distTuneMm: next.distmm,
    calRun30cmMs: next.calms,
    motorTrim: next.trim,
    frontLock: next.flock,
    frontDrop: next.fdrop,
    backLock: next.block,
    backDrop: next.bdrop,
    showCmdOnRun: next.showcmd,
    beepOnCmd: next.beepcmd,
    spinKp: next.spinkp,
    spinKd: next.spinkd,
    turnFrontKp: next.tfkp,
    turnFrontKd: next.tfkd,
    turnBackKp: next.tbkp,
    turnBackKd: next.tbkd,
    threshold_spinDegree: next.tspin,
    spinLeftOffsetDeg: next.slofs,
    smallAngle_turnDegree: next.tturn,
    turnRightOffsetDeg: next.trofs,
    smallAngle_threshold: next.sathr,
    spinMaxSpeed: next.smaxs,
    turnFrontMaxSpeed: next.tfmax,
    turnBackMaxSpeed: next.tbmax
  };
  if (Array.isArray(next.smin)) syncedConfig.senMin = next.smin;
  if (Array.isArray(next.smax)) syncedConfig.senMax = next.smax;
  if (Array.isArray(next.sthr)) syncedConfig.senThresh = next.sthr;
  state.config = syncedConfig;

  if (!$('configModal')?.hidden) {
    for (const [k, v] of Object.entries(syncedConfig)) {
      const el = document.querySelector(`#configFormGrid [data-cfg-key="${k}"]`);
      if (!el) continue;
      if (el.getAttribute('role') === 'switch') {
        el.setAttribute('aria-checked', v ? 'true' : 'false');
        const lbl = el.querySelector('.m-switch-lbl');
        if (lbl) lbl.textContent = v ? 'เปิด (true)' : 'ปิด (false)';
      } else {
        el.value = v;
      }
    }
  }

  renderCalibrationCard();
  rebuildSimAndDraw(true);
  if (typeof publishPluginBridgeState === 'function') publishPluginBridgeState('calibration');
}

function renderCalibrationCard() {
  const cal = state.calibration;
  const cmps = (30000.0 / Math.max(150, Number(cal.calms) || 1150)).toFixed(1);
  const badge = $('calSourceBadge');
  if (badge) {
    badge.textContent = cal.source;
    badge.classList.toggle('live', !!cal.isLive);
  }
  if ($('calValTpcm')) $('calValTpcm').textContent = (Number(cal.tpcm) || 0).toFixed(2);
  if ($('calValDist')) {
    const mm = Number(cal.distmm) || 0;
    $('calValDist').textContent = `${mm > 0 ? '+' : ''}${mm} mm`;
  }
  if ($('calValTime')) $('calValTime').textContent = `${Math.round(cal.calms || 1150)} ms · ${cmps} cm/s`;
  if ($('calValTrim')) {
    const tr = Number(cal.trim) || 0;
    $('calValTrim').textContent = `${tr > 0 ? '+' : ''}${tr}`;
  }
  if ($('calValThresholds')) {
    const tspin = Number.isFinite(Number(cal.tspin)) ? Number(cal.tspin) : DEFAULT_MOTION_CONFIG.threshold_spinDegree;
    const tturn = Number.isFinite(Number(cal.tturn)) ? Number(cal.tturn) : DEFAULT_MOTION_CONFIG.smallAngle_turnDegree;
    $('calValThresholds').textContent = `${tspin.toFixed(1)}° / ${tturn.toFixed(1)}°`;
  }
  if ($('calValSpinPd')) {
    const skp = Number.isFinite(Number(cal.spinkp)) ? Number(cal.spinkp) : DEFAULT_MOTION_CONFIG.spinKp;
    const skd = Number.isFinite(Number(cal.spinkd)) ? Number(cal.spinkd) : DEFAULT_MOTION_CONFIG.spinKd;
    $('calValSpinPd').textContent = `${skp.toFixed(2)} / ${skd.toFixed(2)}`;
  }
  if ($('calValTurnPd')) {
    const tfkp = Number.isFinite(Number(cal.tfkp)) ? Number(cal.tfkp) : DEFAULT_MOTION_CONFIG.turnFrontKp;
    const tfkd = Number.isFinite(Number(cal.tfkd)) ? Number(cal.tfkd) : DEFAULT_MOTION_CONFIG.turnFrontKd;
    $('calValTurnPd').textContent = `${tfkp.toFixed(2)} / ${tfkd.toFixed(2)}`;
  }
  if ($('calValLineThr')) {
    const st = Array.isArray(cal.sthr) ? cal.sthr : [320, 320, 320, 320];
    $('calValLineThr').textContent = st.join(', ');
  }
  if ($('simCalSummaryText')) {
    $('simCalSummaryText').textContent = `Cal (${cal.source}): ${(Number(cal.tpcm) || 125.4).toFixed(1)} t/cm · ${Math.round(cal.calms || 1150)}ms/30cm (${cmps} cm/s)`;
  }
}

// ============================================================================
// Variables.ino Parsing & Serialization
// ============================================================================
function parseVariablesFile() {
  const code = state.files['Variables.ino'] || '';
  const vars = [];
  for (const rawLine of code.split(/\r?\n/)) {
    const m = rawLine.match(/^\s*(int|float|char|bool)\s+([A-Za-z_]\w*)\s*=\s*([^;]+);\s*(?:\/\/\s*(.*))?$/);
    if (!m) continue;
    let val = m[3].trim();
    if (m[1] === 'float') val = val.replace(/f$/i, '');
    if (m[1] === 'char') val = val.replace(/^'([A-Za-z])'$/, '$1');
    vars.push({ type: m[1], name: m[2], value: val, comment: (m[4] || '').trim() });
  }
  state.variables = vars;
}

function serializeVariablesToFile(recordUndo = true) {
  const lines = [
    '// ============================================================================',
    '// Variables.ino — ตัวแปรกลางสำหรับใช้งานในบล็อกและภารกิจ (KT Middle IDE)',
    '// ============================================================================',
    ''
  ];
  for (const v of state.variables) {
    let rhs = String(v.value ?? '0').trim();
    if (v.type === 'float') rhs = exprToCode(rhs, 'float');
    else if (v.type === 'int') rhs = exprToCode(rhs, 'int');
    else if (v.type === 'char') rhs = exprToCode(rhs, 'char');
    else if (v.type === 'bool') rhs = exprToCode(rhs, 'bool');
    lines.push(`${v.type.padEnd(5, ' ')} ${v.name.padEnd(8, ' ')} = ${rhs};${v.comment ? `  // ${v.comment}` : ''}`);
  }
  lines.push('');

  state.files['Variables.ino'] = lines.join('\n');
  if (state.activeCodeFile === 'Variables.ino') {
    codeIde.loadFileIntoEditor('Variables.ino', state.files['Variables.ino']);
  }
  for (const def of MISSION_DEFS) syncMissionToFile(def.file, false);
  updateDirtyIndicator();
  if (recordUndo) pushBlockSnapshot();
  scheduleAutoSave();
  renderCanvas();
  rebuildSimAndDraw(false);
}

// ============================================================================
// Mission <-> C++ Bidirectional AST Parser & Code Generator
// ============================================================================
function countNewlinesBefore(text, idx) {
  let count = 0;
  for (let i = 0; i < idx; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  return count;
}

function extractTopLevelVoidFunctionsWithLines(code) {
  const funcs = {};
  const text = String(code || '');
  const sigRe = /\bvoid\s+([A-Za-z_]\w*)\s*\(\s*\)\s*\{/g;
  let match;
  while ((match = sigRe.exec(text)) !== null) {
    const fnName = match[1];
    const fnStartLine = countNewlinesBefore(text, match.index) + 1;
    const bodyStart = sigRe.lastIndex;
    const bodyStartLine = countNewlinesBefore(text, bodyStart) + 1;
    let depth = 1;
    let i = bodyStart;
    let inLineComment = false;
    let inBlockComment = false;
    let inString = false;
    let inChar = false;

    while (i < text.length && depth > 0) {
      const ch = text[i];
      const next = text[i + 1];
      if (inLineComment) {
        if (ch === '\n') inLineComment = false;
      } else if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false;
          i++;
        }
      } else if (inString) {
        if (ch === '\\') i++;
        else if (ch === '"') inString = false;
      } else if (inChar) {
        if (ch === '\\') i++;
        else if (ch === "'") inChar = false;
      } else {
        if (ch === '/' && next === '/') {
          inLineComment = true;
          i++;
        } else if (ch === '/' && next === '*') {
          inBlockComment = true;
          i++;
        } else if (ch === '"') {
          inString = true;
        } else if (ch === "'") {
          inChar = true;
        } else if (ch === '{') {
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0) {
            funcs[fnName] = {
              body: text.slice(bodyStart, i),
              fullText: text.slice(match.index, i + 1),
              fnStartLine,
              bodyStartLine,
              fnEndLine: countNewlinesBefore(text, i) + 1
            };
            sigRe.lastIndex = i + 1;
            break;
          }
        }
      }
      i++;
    }
  }
  return funcs;
}

function extractTopLevelVoidFunctions(code) {
  const withLines = extractTopLevelVoidFunctionsWithLines(code);
  const out = {};
  for (const [k, v] of Object.entries(withLines)) out[k] = v.body;
  return out;
}

function buildMissionLineIndex(filename, code) {
  const modeNum = filename.match(/RunMode(\d)/)?.[1] || '1';
  const funcs = extractTopLevelVoidFunctionsWithLines(code);
  const funcMapLower = {};
  for (const [k, v] of Object.entries(funcs)) funcMapLower[k.toLowerCase()] = v;

  const lineToBlock = new Map();
  const blockToLine = new Map();
  const sectionRanges = [];
  const mainCallLineToSection = new Map();

  const hasStructuredSections = MISSION_SECTIONS.some((sec) => {
    const targetFn = getMissionSectionFnName(filename, sec.id);
    return targetFn.toLowerCase() in funcMapLower;
  });

  let globalIdx = 0;
  let cumLastBlockIdx = -1;

  const indexFnBody = (fnInfo, sectionId, skipSectionCalls) => {
    const bodyLines = String(fnInfo.body || '').split(/\r?\n/);
    let stackIdx = 0;
    let firstBlockIdx = -1;
    let lastBlockIdx = -1;
    for (let i = 0; i < bodyLines.length; i++) {
      const trimmed = bodyLines[i].trim();
      if (!trimmed || trimmed.startsWith('extern ')) continue;
      if (trimmed.startsWith('//')) {
        const disabledBlk = parseDisabledCommentLine(trimmed, skipSectionCalls);
        if (!disabledBlk) continue;
      } else if (skipSectionCalls && /^(?:M[23]_)?(?:Box[1-4]|EndMission|Endmission)\s*\(\s*\)\s*;?$/i.test(trimmed)) {
        continue;
      }
      const lineNum = fnInfo.bodyStartLine + i;
      const gIdx = globalIdx++;
      lineToBlock.set(lineNum, { globalBlockIdx: gIdx, sectionId, stackIdx });
      blockToLine.set(gIdx, lineNum);
      if (firstBlockIdx < 0) firstBlockIdx = gIdx;
      lastBlockIdx = gIdx;
      stackIdx++;
    }
    if (lastBlockIdx >= 0) cumLastBlockIdx = lastBlockIdx;
    sectionRanges.push({
      sectionId,
      fnStartLine: fnInfo.fnStartLine,
      fnEndLine: fnInfo.fnEndLine,
      firstBlockIdx,
      lastBlockIdx,
      cumLastBlockIdx
    });
  };

  if (hasStructuredSections) {
    const mainInfo = funcMapLower[`runmode${modeNum}`];
    if (mainInfo) {
      const callNames = Object.fromEntries(
        MISSION_SECTIONS.map((s) => [getMissionSectionFnName(filename, s.id).toLowerCase(), s.id])
      );
      const mainLines = String(mainInfo.body || '').split(/\r?\n/);
      for (let i = 0; i < mainLines.length; i++) {
        const m = mainLines[i].trim().match(/^(?:\/\/\s*(?:\[OFF\]\s*)?)?([A-Za-z_]\w*)\s*\(\s*\)\s*;?/);
        if (m && callNames[m[1].toLowerCase()]) {
          mainCallLineToSection.set(mainInfo.bodyStartLine + i, callNames[m[1].toLowerCase()]);
        }
      }
    }

    for (const sec of MISSION_SECTIONS) {
      const fnInfo = funcMapLower[getMissionSectionFnName(filename, sec.id).toLowerCase()];
      if (fnInfo) {
        indexFnBody(fnInfo, sec.id, false);
      } else {
        sectionRanges.push({
          sectionId: sec.id,
          fnStartLine: -1,
          fnEndLine: -1,
          firstBlockIdx: -1,
          lastBlockIdx: -1,
          cumLastBlockIdx
        });
      }
    }
  } else {
    const mainInfo = funcMapLower[`runmode${modeNum}`];
    if (mainInfo) {
      indexFnBody(mainInfo, 'Box1', true);
    } else {
      const allLines = String(code || '').split(/\r?\n/);
      indexFnBody({ body: allLines.join('\n'), fnStartLine: 1, bodyStartLine: 1, fnEndLine: allLines.length }, 'Box1', true);
    }
  }

  return { lineToBlock, blockToLine, sectionRanges, mainCallLineToSection };
}

function resolveBlockIndexForCodeLine(filename, code, lineNumber) {
  const index = buildMissionLineIndex(filename, code);
  const exact = index.lineToBlock.get(lineNumber);
  if (exact) {
    return { globalBlockIdx: exact.globalBlockIdx, matchedLine: lineNumber, mode: 'line', index };
  }

  const callSec = index.mainCallLineToSection.get(lineNumber);
  if (callSec) {
    const secRange = index.sectionRanges.find((r) => r.sectionId === callSec);
    return {
      globalBlockIdx: secRange ? secRange.cumLastBlockIdx : -1,
      matchedLine: lineNumber,
      mode: 'section-call',
      index
    };
  }

  for (let i = 0; i < index.sectionRanges.length; i++) {
    const r = index.sectionRanges[i];
    if (r.fnStartLine > 0 && lineNumber >= r.fnStartLine && lineNumber <= r.fnEndLine) {
      let bestLine = -1;
      let bestIdx = i > 0 ? index.sectionRanges[i - 1].cumLastBlockIdx : -1;
      for (const [ln, info] of index.lineToBlock.entries()) {
        if (ln >= r.fnStartLine && ln <= lineNumber && ln > bestLine) {
          bestLine = ln;
          bestIdx = info.globalBlockIdx;
        }
      }
      return { globalBlockIdx: bestIdx, matchedLine: bestLine > 0 ? bestLine : lineNumber, mode: 'section-nearby', index };
    }
  }

  const firstSecLine = index.sectionRanges.find((r) => r.fnStartLine > 0)?.fnStartLine ?? Infinity;
  if (lineNumber < firstSecLine) {
    return { globalBlockIdx: -1, matchedLine: lineNumber, mode: 'start', index };
  }

  let bestLine = -1;
  let bestIdx = -1;
  for (const [ln, info] of index.lineToBlock.entries()) {
    if (ln <= lineNumber && ln > bestLine) {
      bestLine = ln;
      bestIdx = info.globalBlockIdx;
    }
  }
  return { globalBlockIdx: bestIdx, matchedLine: bestLine > 0 ? bestLine : lineNumber, mode: 'after', index };
}

function parseLineToBlock(line) {
  const varNames = state.variables.map((v) => v.name);
  const parseArg = (arg, defFb = 0) => (arg === undefined ? defFb : parseCodeArgToAst(arg, varNames));

  const ifMatch = line.match(/^if\s*\((.+)\)\s*\{\s*(.+?)\s*\}$/);
  if (ifMatch) {
    return {
      type: 'IF_INLINE',
      params: { cond: parseCodeArgToAst(ifMatch[1], varNames), stmt: ifMatch[2].trim() }
    };
  }

  const assignMatch = line.match(/^([A-Za-z_]\w*)\s*=\s*([^;]+);(?:\s*\/\/(.*))?$/);
  if (assignMatch) {
    return {
      type: 'SET_VAR',
      params: { name: assignMatch[1], value: parseArg(assignMatch[2], 0) }
    };
  }

  const m = line.match(/^([A-Za-z_]\w*)\s*\(([^;]*)\)\s*;(?:\s*\/\/(.*))?$/);
  if (!m) return { type: 'RAW', params: { raw: line } };
  const fn = m[1];
  const args = m[2].trim() ? splitTopLevelArgs(m[2]) : [];

  if (fn === 'FC' && args.length === 2) return { type: 'FC_SIMPLE', params: { speed: parseArg(args[0], 60), cm: parseArg(args[1], 30), stop: true } };
  if (fn === 'FC' && args.length === 3 && (args[2] === 'true' || args[2] === 'false' || args[2].includes('&&') || args[2].includes('||') || args[2].includes('==') || state.variables.some((v) => v.type === 'bool' && v.name === args[2]))) {
    return { type: 'FC_SIMPLE', params: { speed: parseArg(args[0], 60), cm: parseArg(args[1], 30), stop: parseArg(args[2], true) } };
  }
  const normalizeTurnDir = (dirVal, stopStr) => {
    if (typeof dirVal !== 'string') return dirVal;
    if (stopStr === 'true') return dirVal.toLowerCase();
    if (stopStr === 'false') return dirVal.toUpperCase();
    return dirVal;
  };
  if (fn === 'FC' && (args.length === 3 || args.length === 4)) {
    const dirVal = normalizeTurnDir(parseArg(args[2], 'R'), args[3]?.trim());
    return { type: 'FC_DIR', params: { speed: parseArg(args[0], 80), cm: parseArg(args[1], 30), dir: dirVal } };
  }

  if (fn === 'BC' && args.length === 2) return { type: 'BC_SIMPLE', params: { speed: parseArg(args[0], 50), cm: parseArg(args[1], 30), stop: true } };
  if (fn === 'BC' && args.length === 3 && (args[2] === 'true' || args[2] === 'false' || args[2].includes('&&') || args[2].includes('||') || args[2].includes('==') || state.variables.some((v) => v.type === 'bool' && v.name === args[2]))) {
    return { type: 'BC_SIMPLE', params: { speed: parseArg(args[0], 50), cm: parseArg(args[1], 30), stop: parseArg(args[2], true) } };
  }
  if (fn === 'BC' && (args.length === 3 || args.length === 4)) {
    const dirVal = normalizeTurnDir(parseArg(args[2], 'L'), args[3]?.trim());
    return { type: 'BC_DIR', params: { speed: parseArg(args[0], 60), cm: parseArg(args[1], 30), dir: dirVal } };
  }

  if (fn === 'FC4' && (args.length === 3 || args.length === 4)) {
    const dirVal = normalizeTurnDir(parseArg(args[2], 'R'), args[3]?.trim());
    return { type: 'FC4', params: { speed: parseArg(args[0], 60), cm: parseArg(args[1], 30), dir: dirVal } };
  }
  if (fn === 'BC4' && (args.length === 3 || args.length === 4)) {
    const dirVal = normalizeTurnDir(parseArg(args[2], 'L'), args[3]?.trim());
    return { type: 'BC4', params: { speed: parseArg(args[0], 50), cm: parseArg(args[1], 20), dir: dirVal } };
  }

  if ((fn === 'SpinDegree' || fn === 'spinDegree') && args.length === 1) return { type: 'SPIN', params: { deg: parseArg(args[0], 90) } };
  if ((fn === 'TrunDegreeFront' || fn === 'turnDegreeFront') && args.length === 1) return { type: 'TURN_F', params: { deg: parseArg(args[0], 90) } };
  if ((fn === 'TrunDegreeBack' || fn === 'turnDegreeBack') && args.length === 1) return { type: 'TURN_B', params: { deg: parseArg(args[0], 90) } };

  if (fn === 'TTF90' && args.length === 3) return { type: 'TTF90', params: { spdL: parseArg(args[0], 80), spdR: parseArg(args[1], 25), cm: parseArg(args[2], 33) } };
  if (fn === 'TTF45' && args.length === 3) return { type: 'TTF45', params: { spdL: parseArg(args[0], 80), spdR: parseArg(args[1], 25), cm: parseArg(args[2], 17) } };
  if (fn === 'TTB90' && args.length === 3) return { type: 'TTB90', params: { spdL: parseArg(args[0], 25), spdR: parseArg(args[1], 80), cm: parseArg(args[2], 33) } };
  if (fn === 'TTB45' && args.length === 3) return { type: 'TTB45', params: { spdL: parseArg(args[0], 25), spdR: parseArg(args[1], 80), cm: parseArg(args[2], 17) } };

  if (fn === 'FF' && args.length === 2) return { type: 'FF_TIME', params: { speed: parseArg(args[0], 60), ms: parseArg(args[1], 400) } };
  if (fn === 'BB' && args.length === 2) return { type: 'BB_TIME', params: { speed: parseArg(args[0], 50), ms: parseArg(args[1], 400) } };

  if ((fn === 'SetF' || fn === 'SetFront_Yaw') && args.length === 1) return { type: 'SETF', params: { speed: parseArg(args[0], 25) } };
  if ((fn === 'SetF' || fn === 'SetFront_Yaw') && args.length === 2) return { type: 'SETF_BACK', params: { speed: parseArg(args[0], 25), cm: parseArg(args[1], 10) } };
  if ((fn === 'SetF' || fn === 'SetFront_Yaw') && args.length === 3) {
    const rawDir = parseArg(args[2], 'R');
    const dir = rawDir === 'r' ? 'R' : rawDir === 'l' ? 'L' : rawDir;
    return { type: 'SETF_DIR', params: { speed: parseArg(args[0], 25), cm: parseArg(args[1], 10), dir } };
  }

  if ((fn === 'SetB' || fn === 'SetBack_Yaw') && args.length === 1) return { type: 'SETB', params: { speed: parseArg(args[0], 25) } };
  if ((fn === 'SetB' || fn === 'SetBack_Yaw') && args.length === 2) return { type: 'SETB_FWD', params: { speed: parseArg(args[0], 25), cm: parseArg(args[1], 10) } };
  if ((fn === 'SetB' || fn === 'SetBack_Yaw') && args.length === 3) {
    const rawDir = parseArg(args[2], 'L');
    const dir = rawDir === 'r' ? 'R' : rawDir === 'l' ? 'L' : rawDir;
    return { type: 'SETB_DIR', params: { speed: parseArg(args[0], 25), cm: parseArg(args[1], 10), dir } };
  }

  if (fn === 'DropF' && args.length === 0) return { type: 'DROPF', params: {} };
  if (fn === 'DropF' && args.length === 1) return { type: 'DROPF_SPD', params: { speed: parseArg(args[0], 30) } };
  if (fn === 'DropB' && args.length === 0) return { type: 'DROPB', params: {} };
  if (fn === 'DropB' && args.length === 1) return { type: 'DROPB_SPD', params: { speed: parseArg(args[0], 30) } };

  if (fn === 'STOP' && args.length === 0) return { type: 'STOP', params: {} };
  if (fn === 'delay' && args.length === 1) return { type: 'DELAY', params: { ms: parseArg(args[0], 300) } };

  return { type: 'RAW', params: { raw: line } };
}

function parseDisabledCommentLine(trimmed, skipSectionCalls = false) {
  if (!trimmed || !trimmed.startsWith('//')) return null;
  let body = trimmed.replace(/^\/\/+\s*/, '').trim();
  if (!body) return null;

  const hasOffTag = /^\[OFF\]\s*/i.test(body);
  if (hasOffTag) {
    body = body.replace(/^\[OFF\]\s*/i, '').trim();
    if (!body) return null;
  }

  if (skipSectionCalls && /^(?:M[23]_)?(?:Box[1-4]|EndMission|Endmission)\s*\(\s*\)\s*;?/i.test(body)) {
    return null;
  }

  const parsed = parseLineToBlock(body);
  if (parsed.type !== 'RAW') {
    return { ...parsed, disabled: true };
  }
  if (hasOffTag || /^[A-Za-z_]\w*\s*\([^;]*\)\s*;(?:\s*\/\/.*)?$/.test(body)) {
    return { ...parsed, disabled: true };
  }
  return null;
}

function parseBodyLinesToBlocks(bodyText, skipSectionCalls = false) {
  const blocks = [];
  for (const rawLine of String(bodyText || '').split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('extern ')) continue;
    if (trimmed.startsWith('//')) {
      const disabledBlk = parseDisabledCommentLine(trimmed, skipSectionCalls);
      if (disabledBlk) {
        blocks.push({ id: state.nextBlockId++, ...disabledBlk });
      }
      continue;
    }
    if (skipSectionCalls && /^(?:M[23]_)?(?:Box[1-4]|EndMission|Endmission)\s*\(\s*\)\s*;?$/i.test(trimmed)) {
      continue;
    }
    blocks.push({ id: state.nextBlockId++, ...parseLineToBlock(trimmed) });
  }
  return blocks;
}

function parseMissionFile(filename) {
  const code = state.files[filename] || '';
  const modeNum = filename.match(/RunMode(\d)/)?.[1] || '1';
  const funcsWithLines = extractTopLevelVoidFunctionsWithLines(code);
  const funcMapLower = {};
  for (const [k, v] of Object.entries(funcsWithLines)) {
    funcMapLower[k.toLowerCase()] = v.body;
  }

  const standardFnNames = new Set([
    `runmode${modeNum}`,
    ...MISSION_SECTIONS.map((sec) => getMissionSectionFnName(filename, sec.id).toLowerCase())
  ]);
  const extraFnTexts = [];
  const extraFnBlocks = {};
  for (const [k, v] of Object.entries(funcsWithLines)) {
    if (standardFnNames.has(k.toLowerCase())) continue;
    extraFnTexts.push(v.fullText || `void ${k}() {\n${v.body}\n}`);
    extraFnBlocks[k] = parseBodyLinesToBlocks(v.body, false);
  }

  const hasStructuredSections = MISSION_SECTIONS.some((sec) => {
    const targetFn = getMissionSectionFnName(filename, sec.id);
    return targetFn.toLowerCase() in funcMapLower;
  });

  const sections = createEmptyMissionSections();
  const disabledSections = {};
  if (hasStructuredSections) {
    const runBodyLines = String(funcMapLower[`runmode${modeNum}`] || '').split(/\r?\n/).map((l) => l.trim());
    for (const sec of MISSION_SECTIONS) {
      const targetFn = getMissionSectionFnName(filename, sec.id);
      const body = funcMapLower[targetFn.toLowerCase()] ?? '';
      sections[sec.id] = parseBodyLinesToBlocks(body, false);

      const escapedFn = escapeRegExp(targetFn);
      const activeRe = new RegExp(`^${escapedFn}\\s*\\(\\s*\\)\\s*;`, 'i');
      const commentedRe = new RegExp(`^//\\s*(?:\\[OFF\\]\\s*)?${escapedFn}\\s*\\(\\s*\\)\\s*;`, 'i');
      const hasActiveCall = runBodyLines.some((l) => activeRe.test(l));
      const hasCommentedCall = runBodyLines.some((l) => commentedRe.test(l));
      if (hasCommentedCall && !hasActiveCall) {
        disabledSections[sec.id] = true;
      }
    }
  } else {
    const runBody = funcMapLower[`runmode${modeNum}`] ?? code;
    sections.Box1 = parseBodyLinesToBlocks(runBody, true);
  }

  const m = ensureMissionStructure(state.missions[filename]);
  if (m) {
    m.sections = sections;
    m.disabledSections = disabledSections;
    m.extraFunctionsCode = extraFnTexts.join('\n\n');
    m.extraFunctionsBlocks = extraFnBlocks;
  }
}

function parseAllMissionsFromFiles() {
  parseVariablesFile();
  for (const def of MISSION_DEFS) parseMissionFile(def.file);
}

function blocksToMissionCode(filename, missionOrSections) {
  const modeNum = filename.match(/RunMode(\d)/)?.[1] || '1';
  const externLines = state.variables.map((v) => `extern ${v.type} ${v.name};`);
  const isMissionObj = missionOrSections && typeof missionOrSections === 'object' && !Array.isArray(missionOrSections);
  const sections = isMissionObj
    ? (missionOrSections.sections || missionOrSections)
    : { ...createEmptyMissionSections(), Box1: Array.isArray(missionOrSections) ? missionOrSections : [] };
  const disabledSections = isMissionObj && missionOrSections.disabledSections && typeof missionOrSections.disabledSections === 'object'
    ? missionOrSections.disabledSections
    : {};
  const extraFunctionsCode = isMissionObj && typeof missionOrSections.extraFunctionsCode === 'string'
    ? missionOrSections.extraFunctionsCode.trim()
    : '';

  const mainCalls = MISSION_SECTIONS.map((sec) => {
    const fn = getMissionSectionFnName(filename, sec.id);
    return disabledSections[sec.id] ? `    // ${fn}();` : `    ${fn}();`;
  });
  const subFnBlocks = [];
  for (const sec of MISSION_SECTIONS) {
    const fnName = getMissionSectionFnName(filename, sec.id);
    const secBlocks = Array.isArray(sections[sec.id]) ? sections[sec.id] : [];
    const lines = secBlocks
      .map((b) => {
        const def = DEF_MAP[b.type];
        const rawLine = def ? def.toCode(b.params) : String(b.params.raw || '');
        if (!rawLine) return '';
        if (b.disabled) {
          const isRawCall = /^[A-Za-z_]\w*\s*\([^;]*\)\s*;(?:\s*\/\/.*)?$/.test(rawLine.trim());
          const needsTag = b.type === 'RAW' && !isRawCall;
          return needsTag ? `// [OFF] ${rawLine}` : `// ${rawLine}`;
        }
        return rawLine;
      })
      .filter(Boolean)
      .map((line) => `    ${line}`);
    subFnBlocks.push('', `void ${fnName}() {`, ...lines, '}');
  }

  const outLines = [
    '// ============================================================================',
    `// ${filename} — ภารกิจโหมดที่ ${modeNum} (สร้างจาก KT Middle IDE)`,
    '// ============================================================================',
    ...(externLines.length > 0 ? ['', ...externLines] : []),
    '',
    `void runMode${modeNum}() {`,
    ...mainCalls,
    '}',
    ...subFnBlocks
  ];
  if (extraFunctionsCode) {
    outLines.push('', '// --- Extension / Custom Sub-Functions ---', extraFunctionsCode);
  }
  outLines.push('');
  return outLines.join('\n');
}

function syncMissionToFile(filename, recordUndo = true) {
  const m = ensureMissionStructure(state.missions[filename]);
  if (!m) return;
  const code = blocksToMissionCode(filename, m);
  state.files[filename] = code;
  if (filename === state.activeMissionFile) {
    renderVisualCodePreview(code, filename);
    updateMissionChrome();
    rebuildSimAndDraw(false);
  }
  if (state.activeCodeFile === filename) {
    codeIde.loadFileIntoEditor(filename, code);
  }
  updateDirtyIndicator();
  if (recordUndo) pushBlockSnapshot();
  scheduleAutoSave();
}

// ============================================================================
// Floating Loose-Stack Helpers & Block Undo / Redo Persistence
// ============================================================================
function allocateTopLooseZ() {
  if (state.nextLooseZ >= 5000) {
    const sorted = [...state.looseBlocks].sort((a, b) => (a.z || 30) - (b.z || 30));
    sorted.forEach((s, idx) => { s.z = 30 + idx; });
    state.nextLooseZ = 30 + sorted.length;
  }
  return ++state.nextLooseZ;
}

function cloneBlockForDuplicate(blk) {
  return {
    id: state.nextBlockId++,
    type: blk.type,
    ...(blk.disabled ? { disabled: true } : {}),
    params: JSON.parse(JSON.stringify(blk.params || {}))
  };
}

function normalizeLooseStacks(rawList) {
  if (!Array.isArray(rawList)) return [];
  const out = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const x = Number.isFinite(Number(item.x)) ? Number(item.x) : 60;
    const y = Number.isFinite(Number(item.y)) ? Number(item.y) : 400;
    const z = Math.max(30, Number.isFinite(Number(item.z)) ? Number(item.z) : 30);
    state.nextLooseZ = Math.max(state.nextLooseZ, z);

    let blocks = [];
    if (Array.isArray(item.blocks)) {
      blocks = item.blocks
        .filter((b) => b && b.type)
        .map((b) => cloneBlockForDuplicate(b));
    } else if (item.type) {
      blocks = [cloneBlockForDuplicate(item)];
    }
    if (blocks.length === 0) continue;
    out.push({ id: state.nextBlockId++, x, y, z, blocks });
  }
  return out;
}

function spawnDuplicatedLooseStack(blocksToCopy, canvasPt) {
  const cloned = (blocksToCopy || [])
    .filter((b) => b && b.type)
    .map((b) => cloneBlockForDuplicate(b));
  if (cloned.length === 0) return;

  let x = Math.max(12, Math.round((canvasPt?.x ?? 80) - 28));
  let y = Math.max(12, Math.round((canvasPt?.y ?? 80) - 16));
  for (let step = 0; step < 10; step++) {
    const overlaps = state.looseBlocks.some(
      (s) => Math.abs((s.x ?? 0) - x) < 14 && Math.abs((s.y ?? 0) - y) < 14
    );
    if (!overlaps) break;
    x += 18;
    y += 18;
  }

  const stack = {
    id: state.nextBlockId++,
    x,
    y,
    z: allocateTopLooseZ(),
    blocks: cloned
  };
  state.looseBlocks.push(stack);
  state.lastDuplicatedStackId = stack.id;
  renderCanvas();
  saveCanvasLayout();
  pushBlockSnapshot();
}

function getBlockSnapshotPayload() {
  return {
    v: JSON.parse(JSON.stringify(state.variables)),
    m: Object.fromEntries(MISSION_DEFS.map((d) => [d.file, JSON.parse(JSON.stringify(state.missions[d.file]))])),
    l: JSON.parse(JSON.stringify(state.looseBlocks))
  };
}

function pushBlockSnapshot(force = false) {
  const snap = getBlockSnapshotPayload();
  const sig = JSON.stringify(snap);
  if (!force && sig === state.blockHistory.lastSig) return;
  if (state.blockHistory.lastSig) {
    state.blockHistory.past.push(JSON.parse(state.blockHistory.lastSig));
    if (state.blockHistory.past.length > 60) state.blockHistory.past.shift();
  }
  state.blockHistory.lastSig = sig;
  state.blockHistory.future = [];
  updateBlockUndoButtons();
}

function applyBlockSnapshot(rawSnap) {
  if (!rawSnap) return;
  if (Array.isArray(rawSnap.v)) {
    state.variables = rawSnap.v;
    serializeVariablesToFile(false);
  }
  if (rawSnap.m) {
    for (const d of MISSION_DEFS) {
      if (rawSnap.m[d.file]) state.missions[d.file] = ensureMissionStructure(rawSnap.m[d.file]);
    }
  }
  if (Array.isArray(rawSnap.l)) state.looseBlocks = normalizeLooseStacks(rawSnap.l);
  for (const d of MISSION_DEFS) syncMissionToFile(d.file, false);
  renderPalette();
  renderCanvas();
  saveCanvasLayout();
  rebuildSimAndDraw(true);
  updateBlockUndoButtons();
}

function undoBlocks() {
  if (!state.blockHistory.past.length) return;
  const cur = state.blockHistory.lastSig ? JSON.parse(state.blockHistory.lastSig) : null;
  const prev = state.blockHistory.past.pop();
  if (cur) state.blockHistory.future.push(cur);
  state.blockHistory.lastSig = JSON.stringify(prev);
  applyBlockSnapshot(prev);
}

function redoBlocks() {
  if (!state.blockHistory.future.length) return;
  const cur = state.blockHistory.lastSig ? JSON.parse(state.blockHistory.lastSig) : null;
  const next = state.blockHistory.future.pop();
  if (cur) state.blockHistory.past.push(cur);
  state.blockHistory.lastSig = JSON.stringify(next);
  applyBlockSnapshot(next);
}

function updateBlockUndoButtons() {
  if ($('btnBlockUndo')) $('btnBlockUndo').disabled = state.blockHistory.past.length === 0;
  if ($('btnBlockRedo')) $('btnBlockRedo').disabled = state.blockHistory.future.length === 0;
}

function ensureNonOverlappingMissions() {
  const placed = MISSION_DEFS.filter((d) => state.missions[d.file]?.placed);
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const m1 = state.missions[placed[i].file];
      const m2 = state.missions[placed[j].file];
      if (Math.abs(m1.x - m2.x) < 360 && Math.abs(m1.y - m2.y) < 120) m2.x = m1.x + 500;
    }
  }
}

function saveCanvasLayout() {
  try {
    const payload = {
      activeMissionFile: state.activeMissionFile,
      zoomPct: state.zoomPct,
      missions: Object.fromEntries(MISSION_DEFS.map((d) => {
        const m = ensureMissionStructure(state.missions[d.file]);
        return [d.file, {
          placed: !!m.placed,
          x: Math.round(m.x),
          y: Math.round(m.y),
          folded: !!m.folded,
          activeSection: m.activeSection || 'Box1',
          foldedSections: m.foldedSections || {}
        }];
      })),
      looseBlocks: state.looseBlocks
    };
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {}
}

function loadCanvasLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) { ensureNonOverlappingMissions(); return; }
    const saved = JSON.parse(raw);
    if (saved.activeMissionFile && state.missions[saved.activeMissionFile]) {
      state.activeMissionFile = saved.activeMissionFile;
    }
    if (Number.isFinite(saved.zoomPct)) state.zoomPct = Math.max(60, Math.min(130, saved.zoomPct));
    if (saved.missions) {
      for (const def of MISSION_DEFS) {
        const sm = saved.missions[def.file];
        const m = ensureMissionStructure(state.missions[def.file]);
        if (sm && m) {
          m.placed = !!sm.placed;
          m.folded = !!sm.folded;
          if (Number.isFinite(sm.x)) m.x = sm.x;
          if (Number.isFinite(sm.y)) m.y = sm.y;
          if (sm.activeSection && MISSION_SECTIONS.some((s) => s.id === sm.activeSection)) {
            m.activeSection = sm.activeSection;
          }
          if (sm.foldedSections && typeof sm.foldedSections === 'object') {
            m.foldedSections = { ...sm.foldedSections };
          }
        }
      }
    }
    if (Array.isArray(saved.looseBlocks)) {
      state.looseBlocks = normalizeLooseStacks(saved.looseBlocks);
    }
    ensureNonOverlappingMissions();
  } catch (_) {}
}

function setActiveMission(filename, rebuildReset = true) {
  if (!state.missions[filename]) return;
  const m = ensureMissionStructure(state.missions[filename]);
  state.activeMissionFile = filename;
  if (state.mode === 'visual') updateDocumentTitle();
  renderVisualCodePreview(state.files[filename] || blocksToMissionCode(filename, m), filename);
  updateMissionChrome();
  renderCanvas();
  if (rebuildReset) rebuildSimAndDraw(true);
  saveCanvasLayout();
  if (typeof publishPluginBridgeState === 'function') publishPluginBridgeState('active-mission');
}

function renderMissionQuickBar() {
  const bar = $('missionQuickBar');
  if (!bar) return;
  bar.innerHTML = '';
  for (const def of MISSION_DEFS) {
    const m = state.missions[def.file];
    const isActive = state.activeMissionFile === def.file;
    const isPlaced = !!(m && m.placed);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `mission-quick-pill${isPlaced ? ' placed' : ''}${isActive ? ' active' : ''}`;
    btn.style.setProperty('--m-dot', def.bg);
    btn.title = isPlaced ? `โฟกัส ${def.title} (${def.file})` : `วางและเปิด ${def.title} (${def.file})`;
    btn.innerHTML = `<span class="mq-dot"></span><span>M${def.file.match(/\d/)?.[0] || ''}</span>`;
    btn.onclick = () => placeOrFocusMission(def.file);
    bar.appendChild(btn);
  }
}

function updateMissionChrome() {
  const m = state.missions[state.activeMissionFile];
  const count = getMissionTotalCount(m);
  if ($('canvasMissionTitle')) $('canvasMissionTitle').textContent = state.activeMissionFile;
  if ($('previewFilename')) $('previewFilename').textContent = state.activeMissionFile;
  if ($('blockCountBadge')) $('blockCountBadge').textContent = `${count} blocks`;
  if ($('paneCanvasCount')) $('paneCanvasCount').textContent = String(count);
  renderMissionQuickBar();
}

// ============================================================================
// Freeform 2D Drag-and-Drop Pointer System (Includes Reporter Drops into Params)
// ============================================================================
const dragCtx = {
  active: false,
  moved: false,
  kind: '',
  startX: 0,
  startY: 0,
  defType: null,
  reporterOp: null,
  reporterVarName: null,
  reporterAst: null,
  clearSourceFn: null,
  missionFile: null,
  sectionId: null,
  blockIndex: -1,
  looseIndex: -1,
  looseBlockIndex: -1,
  grabOffsetX: 40,
  grabOffsetY: 20,
  missionEl: null,
  originX: 0,
  originY: 0,
  panStartScrollL: 0,
  panStartScrollT: 0,
  ghostEl: null,
  hoveredSlot: null,
  hoveredParamSlot: null,
  overTrash: false
};

function clientToCanvasCoords(clientX, clientY) {
  const canvas = $('blockCanvas');
  const rect = canvas.getBoundingClientRect();
  const scale = state.zoomPct / 100;
  return {
    x: (clientX - rect.left + canvas.scrollLeft) / scale,
    y: (clientY - rect.top + canvas.scrollTop) / scale
  };
}

function isInsideElRect(el, clientX, clientY, pad = 10) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return clientX >= r.left - pad && clientX <= r.right + pad && clientY >= r.top - pad && clientY <= r.bottom + pad;
}

function findClosestDropSlot(clientX, clientY) {
  const slots = document.querySelectorAll('.drop-slot');
  let best = null;
  let bestDist = 48;
  for (const slot of slots) {
    if (dragCtx.kind === 'stack-cmd') {
      if (
        slot.dataset.mission === dragCtx.missionFile &&
        (slot.dataset.section || 'Box1') === (dragCtx.sectionId || 'Box1') &&
        parseInt(slot.dataset.insertIdx, 10) > dragCtx.blockIndex
      ) {
        continue;
      }
    } else if (dragCtx.kind === 'loose-cmd' && slot.dataset.looseIdx !== undefined) {
      if (
        parseInt(slot.dataset.looseIdx, 10) === dragCtx.looseIndex &&
        (dragCtx.looseBlockIndex === 0 || parseInt(slot.dataset.insertIdx, 10) >= dragCtx.looseBlockIndex)
      ) {
        continue;
      }
    }
    const r = slot.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cx = Math.max(r.left, Math.min(clientX, r.right));
    const cy = (r.top + r.bottom) * 0.5;
    const dist = Math.hypot(clientX - cx, clientY - cy);
    if (dist < bestDist) {
      bestDist = dist;
      best = slot;
    }
  }
  return best;
}

function findClosestParamSlot(clientX, clientY) {
  const all = document.querySelectorAll('.mc-param-slot');
  let best = null;
  let bestArea = Infinity;
  let bestDist = 26;
  for (const slot of all) {
    if (slot.closest('.drag-ghost')) continue;
    const r = slot.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const inside = clientX >= r.left - 8 && clientX <= r.right + 8 && clientY >= r.top - 8 && clientY <= r.bottom + 8;
    const cx = Math.max(r.left, Math.min(clientX, r.right));
    const cy = Math.max(r.top, Math.min(clientY, r.bottom));
    const dist = Math.hypot(clientX - cx, clientY - cy);
    const area = r.width * r.height;
    if (inside) {
      // Pick the innermost nested parameter slot under the pointer
      if (area < bestArea) {
        bestArea = area;
        best = slot;
        bestDist = dist;
      }
    } else if (!best && dist < bestDist) {
      bestDist = dist;
      best = slot;
    }
  }
  return best;
}

function spawnBlockGhost(title, colorBg, colorDark, clientX, clientY, sub = '', isPill = false) {
  const el = document.createElement('div');
  el.className = `mc-block drag-ghost${isPill ? ' palette-reporter' : ''}`;
  el.style.setProperty('--blk-bg', colorBg);
  el.style.setProperty('--blk-dark', colorDark);
  el.innerHTML = `
    <span class="mc-grip">${svgIcon('grip', 'sm')}</span>
    <span class="mc-label">${escapeHtml(title)}</span>
    ${sub ? `<span class="hat-pill">${escapeHtml(sub)}</span>` : ''}
  `;
  document.body.appendChild(el);
  el.style.left = `${clientX - 36}px`;
  el.style.top = `${clientY - 18}px`;
  return el;
}

function spawnStackGhost(blocks, clientX, clientY, grabOffX = 40, grabOffY = 20) {
  const wrap = document.createElement('div');
  wrap.className = 'drag-ghost-stack';
  const previewLimit = 6;
  const preview = (blocks || []).slice(0, previewLimit);
  for (const b of preview) {
    const def = DEF_MAP[b.type] || DEF_MAP.RAW;
    const c = CAT_COLORS[def.cat] || CAT_COLORS.enc;
    const row = document.createElement('div');
    row.className = 'mc-block';
    row.style.setProperty('--blk-bg', c.bg);
    row.style.setProperty('--blk-dark', c.dark);
    row.innerHTML = `
      <span class="mc-grip">${svgIcon('grip', 'sm')}</span>
      <span class="mc-label">${escapeHtml(def.title)}</span>
      <span class="hat-pill">${escapeHtml(def.toCode(b.params))}</span>
    `;
    wrap.appendChild(row);
  }
  if ((blocks?.length || 0) > previewLimit) {
    const more = document.createElement('div');
    more.className = 'drag-ghost-more';
    more.textContent = `+${blocks.length - previewLimit} บล็อก`;
    wrap.appendChild(more);
  }
  if ((blocks?.length || 0) > 1) {
    const badge = document.createElement('span');
    badge.className = 'drag-ghost-count';
    badge.textContent = `${blocks.length} บล็อก`;
    wrap.appendChild(badge);
  }
  const scale = state.zoomPct / 100;
  document.body.appendChild(wrap);
  wrap.style.left = `${clientX - grabOffX * scale}px`;
  wrap.style.top = `${clientY - grabOffY * scale}px`;
  return wrap;
}

function onGlobalPointerMove(e) {
  if (!dragCtx.active) return;
  const dx = e.clientX - dragCtx.startX;
  const dy = e.clientY - dragCtx.startY;
  if (!dragCtx.moved && Math.hypot(dx, dy) < 6) return;

  if (!dragCtx.moved) {
    dragCtx.moved = true;
    const trash = $('trashDropzone');
    if (dragCtx.kind === 'pan') {
      $('blockCanvas').classList.add('is-panning');
    } else if (dragCtx.kind === 'canvas-mission') {
      trash.classList.add('visible');
    } else if (dragCtx.kind === 'palette-mission') {
      dragCtx.grabOffsetX = 40;
      dragCtx.grabOffsetY = 20;
      const mDef = MISSION_MAP[dragCtx.missionFile];
      dragCtx.ghostEl = spawnBlockGhost(mDef.title, mDef.bg, mDef.dark, e.clientX, e.clientY, mDef.fn);
    } else if (dragCtx.kind === 'palette-cmd') {
      dragCtx.grabOffsetX = 40;
      dragCtx.grabOffsetY = 20;
      const def = DEF_MAP[dragCtx.defType];
      const c = CAT_COLORS[def.cat] || CAT_COLORS.enc;
      dragCtx.ghostEl = spawnBlockGhost(def.title, c.bg, c.dark, e.clientX, e.clientY, def.sig);
      trash.classList.add('visible');
    } else if (dragCtx.kind === 'palette-reporter') {
      dragCtx.grabOffsetX = 40;
      dragCtx.grabOffsetY = 20;
      if (dragCtx.reporterOp === 'VAR') {
        dragCtx.ghostEl = spawnBlockGhost(dragCtx.reporterVarName, CAT_COLORS.vars.bg, CAT_COLORS.vars.dark, e.clientX, e.clientY, 'var', true);
      } else {
        const repDef = REPORTER_MAP[dragCtx.reporterOp];
        const c = CAT_COLORS[repDef.cat] || CAT_COLORS.math;
        dragCtx.ghostEl = spawnBlockGhost(repDef.sig, c.bg, c.dark, e.clientX, e.clientY, repDef.cat.toUpperCase(), true);
      }
      trash.classList.add('visible');
    } else if (dragCtx.kind === 'move-reporter') {
      dragCtx.grabOffsetX = 40;
      dragCtx.grabOffsetY = 20;
      const ast = dragCtx.reporterAst;
      const cat = ast?.kind === 'var' ? 'vars' : (REPORTER_MAP[ast?.op]?.cat || 'math');
      const c = CAT_COLORS[cat] || CAT_COLORS.math;
      dragCtx.ghostEl = spawnBlockGhost(exprToCode(ast, 'raw'), c.bg, c.dark, e.clientX, e.clientY, '', true);
      trash.classList.add('visible');
    } else if (dragCtx.kind === 'stack-cmd') {
      const m = ensureMissionStructure(state.missions[dragCtx.missionFile]);
      const secBlocks = m?.sections?.[dragCtx.sectionId || 'Box1'] || [];
      const tail = secBlocks.slice(dragCtx.blockIndex);
      if (tail.length === 0) return;
      dragCtx.ghostEl = spawnStackGhost(tail, e.clientX, e.clientY, dragCtx.grabOffsetX, dragCtx.grabOffsetY);
      document.querySelectorAll('.mc-block[data-mission]').forEach((el) => {
        if (
          el.dataset.mission === dragCtx.missionFile &&
          (el.dataset.section || 'Box1') === (dragCtx.sectionId || 'Box1') &&
          parseInt(el.dataset.stackIdx, 10) >= dragCtx.blockIndex
        ) {
          el.classList.add('dragging-source');
        }
      });
      trash.classList.add('visible');
    } else if (dragCtx.kind === 'loose-cmd') {
      const stack = state.looseBlocks[dragCtx.looseIndex];
      const subIdx = Math.max(0, dragCtx.looseBlockIndex || 0);
      const tail = stack?.blocks ? stack.blocks.slice(subIdx) : [];
      if (tail.length === 0) return;
      dragCtx.ghostEl = spawnStackGhost(tail, e.clientX, e.clientY, dragCtx.grabOffsetX, dragCtx.grabOffsetY);
      document.querySelectorAll('.mc-block.loose-block').forEach((el) => {
        if (
          parseInt(el.dataset.looseIdx, 10) === dragCtx.looseIndex &&
          parseInt(el.dataset.looseBlockIdx, 10) >= subIdx
        ) {
          el.classList.add('dragging-source');
        }
      });
      trash.classList.add('visible');
    }
  }

  if (dragCtx.kind === 'pan') {
    const canvas = $('blockCanvas');
    canvas.scrollLeft = dragCtx.panStartScrollL - dx;
    canvas.scrollTop = dragCtx.panStartScrollT - dy;
    return;
  }

  if (dragCtx.kind === 'canvas-mission') {
    const scale = state.zoomPct / 100;
    const nx = Math.max(8, Math.round(dragCtx.originX + dx / scale));
    const ny = Math.max(8, Math.round(dragCtx.originY + dy / scale));
    state.missions[dragCtx.missionFile].x = nx;
    state.missions[dragCtx.missionFile].y = ny;
    if (dragCtx.missionEl) {
      dragCtx.missionEl.style.left = `${nx}px`;
      dragCtx.missionEl.style.top = `${ny}px`;
    }
  }

  if (dragCtx.ghostEl) {
    const scale = state.zoomPct / 100;
    dragCtx.ghostEl.style.left = `${e.clientX - dragCtx.grabOffsetX * scale}px`;
    dragCtx.ghostEl.style.top = `${e.clientY - dragCtx.grabOffsetY * scale}px`;
  }

  const trash = $('trashDropzone');
  const overTrash = trash.classList.contains('visible') && isInsideElRect(trash, e.clientX, e.clientY, 16);
  dragCtx.overTrash = overTrash;
  trash.classList.toggle('drag-over', overTrash);

  document.querySelectorAll('.drop-slot.active-hover').forEach((s) => s.classList.remove('active-hover'));
  document.querySelectorAll('.mc-param-slot.slot-drop-hover').forEach((s) => s.classList.remove('slot-drop-hover'));

  if (dragCtx.kind === 'palette-reporter' || dragCtx.kind === 'move-reporter') {
    dragCtx.hoveredParamSlot = overTrash ? null : findClosestParamSlot(e.clientX, e.clientY);
    if (dragCtx.hoveredParamSlot) dragCtx.hoveredParamSlot.classList.add('slot-drop-hover');
  } else if (dragCtx.kind === 'palette-cmd' || dragCtx.kind === 'stack-cmd' || dragCtx.kind === 'loose-cmd') {
    dragCtx.hoveredSlot = overTrash ? null : findClosestDropSlot(e.clientX, e.clientY);
    if (dragCtx.hoveredSlot) dragCtx.hoveredSlot.classList.add('active-hover');
  }
}

function insertReporterIntoFocusedOrHoveredSlot(slotEl, node) {
  const meta = slotEl ? slotMetaMap.get(slotEl) : null;
  if (!meta || !meta.setValue) return false;
  meta.setValue(JSON.parse(JSON.stringify(node)));
  return true;
}

function dropBlocksIntoHoveredSlot(slot, movedBlocks) {
  if (!slot || !Array.isArray(movedBlocks) || movedBlocks.length === 0) return;
  const tIdx = Math.max(0, parseInt(slot.dataset.insertIdx, 10) || 0);
  if (slot.dataset.looseIdx !== undefined) {
    const targetStack = state.looseBlocks[parseInt(slot.dataset.looseIdx, 10)];
    if (!targetStack) return;
    targetStack.blocks.splice(Math.min(tIdx, targetStack.blocks.length), 0, ...movedBlocks);
    targetStack.z = allocateTopLooseZ();
    return;
  }
  const tFile = slot.dataset.mission;
  const tSec = slot.dataset.section || 'Box1';
  const tm = ensureMissionStructure(state.missions[tFile]);
  if (!tm) return;
  tm.sections[tSec].splice(Math.min(tIdx, tm.sections[tSec].length), 0, ...movedBlocks);
  tm.activeSection = tSec;
  state.activeMissionFile = tFile;
  syncMissionToFile(tFile, false);
  updateDocumentTitle();
}

function onGlobalPointerUp(e) {
  if (!dragCtx.active) return;
  const wasMoved = dragCtx.moved;
  const kind = dragCtx.kind;

  if (dragCtx.ghostEl) { dragCtx.ghostEl.remove(); dragCtx.ghostEl = null; }
  $('blockCanvas')?.classList.remove('is-panning');
  $('trashDropzone')?.classList.remove('visible', 'drag-over');
  document.querySelectorAll('.drop-slot.active-hover').forEach((s) => s.classList.remove('active-hover'));
  document.querySelectorAll('.mc-param-slot.slot-drop-hover').forEach((s) => s.classList.remove('slot-drop-hover'));
  document.querySelectorAll('.mc-block.dragging-source').forEach((el) => el.classList.remove('dragging-source'));

  if (!wasMoved) {
    if (kind === 'palette-mission') {
      placeOrFocusMission(dragCtx.missionFile);
    } else if (kind === 'palette-cmd') {
      appendBlockToActiveMission(dragCtx.defType);
    } else if (kind === 'palette-reporter') {
      const node = createDefaultReporterNode(dragCtx.reporterOp, dragCtx.reporterVarName);
      if (focusedSlotEl && document.body.contains(focusedSlotEl)) {
        insertReporterIntoFocusedOrHoveredSlot(focusedSlotEl, node);
      } else if (dragCtx.reporterOp === 'VAR') {
        appendBlockToActiveMission('SET_VAR', { name: dragCtx.reporterVarName });
      } else {
        appendConsole('[INFO] ลากบล็อกตัวแปร / คณิต / ตรรกะ ไปวางในช่องพารามิเตอร์ของบล็อกคำสั่ง (หรือคลิกเลือกช่องก่อนกดบล็อก)');
      }
    } else if (kind === 'canvas-mission') {
      setActiveMission(dragCtx.missionFile);
    } else if (kind === 'stack-cmd') {
      if (isClickToSeekSimEnabled()) {
        seekSimulationToSectionBlock(dragCtx.missionFile, dragCtx.sectionId, dragCtx.blockIndex);
      }
    } else if (kind === 'move-reporter') {
      const blkEl = e.target?.closest?.('.mc-block[data-mission]');
      if (blkEl && isClickToSeekSimEnabled()) {
        seekSimulationToSectionBlock(blkEl.dataset.mission, blkEl.dataset.section, parseInt(blkEl.dataset.stackIdx, 10));
      }
    }
  } else {
    const canvas = $('blockCanvas');
    const overCanvas = isInsideElRect(canvas, e.clientX, e.clientY, 0);
    const pt = clientToCanvasCoords(e.clientX, e.clientY);

    if (kind === 'palette-mission' && overCanvas) {
      const m = state.missions[dragCtx.missionFile];
      m.placed = true;
      m.x = Math.max(12, Math.round(pt.x - 140));
      m.y = Math.max(12, Math.round(pt.y - 24));
      setActiveMission(dragCtx.missionFile);
      renderPalette();
      pushBlockSnapshot();
    } else if (kind === 'canvas-mission') {
      if (dragCtx.overTrash) removeMissionFromCanvas(dragCtx.missionFile);
      else saveCanvasLayout();
    } else if (kind === 'palette-reporter') {
      if (!dragCtx.overTrash && dragCtx.hoveredParamSlot) {
        const node = createDefaultReporterNode(dragCtx.reporterOp, dragCtx.reporterVarName);
        insertReporterIntoFocusedOrHoveredSlot(dragCtx.hoveredParamSlot, node);
      }
    } else if (kind === 'move-reporter') {
      if (dragCtx.overTrash) {
        if (dragCtx.clearSourceFn) dragCtx.clearSourceFn();
      } else if (dragCtx.hoveredParamSlot && dragCtx.reporterAst) {
        const cloned = JSON.parse(JSON.stringify(dragCtx.reporterAst));
        if (dragCtx.clearSourceFn) dragCtx.clearSourceFn(false);
        insertReporterIntoFocusedOrHoveredSlot(dragCtx.hoveredParamSlot, cloned);
      }
    } else if (kind === 'palette-cmd') {
      const def = DEF_MAP[dragCtx.defType];
      if (!dragCtx.overTrash && def) {
        const newBlock = { id: state.nextBlockId++, type: def.type, params: JSON.parse(JSON.stringify(def.defaults)) };
        if (newBlock.type === 'SET_VAR' && state.variables.length > 0) {
          newBlock.params.name = state.variables[0].name;
          newBlock.params.value = state.variables[0].value;
        }
        if (dragCtx.hoveredSlot) {
          dropBlocksIntoHoveredSlot(dragCtx.hoveredSlot, [newBlock]);
        } else if (overCanvas) {
          state.looseBlocks.push({
            id: state.nextBlockId++,
            x: Math.max(12, Math.round(pt.x - dragCtx.grabOffsetX)),
            y: Math.max(12, Math.round(pt.y - dragCtx.grabOffsetY)),
            z: allocateTopLooseZ(),
            blocks: [newBlock]
          });
        }
        renderCanvas();
        saveCanvasLayout();
        pushBlockSnapshot();
      }
    } else if (kind === 'stack-cmd') {
      const srcFile = dragCtx.missionFile;
      const srcSec = dragCtx.sectionId || 'Box1';
      const srcIdx = dragCtx.blockIndex;
      const srcMission = ensureMissionStructure(state.missions[srcFile]);
      const srcBlocks = srcMission?.sections?.[srcSec] || [];
      if (srcIdx >= 0 && srcIdx < srcBlocks.length) {
        if (dragCtx.overTrash) {
          srcBlocks.splice(srcIdx);
          syncMissionToFile(srcFile, false);
        } else if (dragCtx.hoveredSlot) {
          const movedBlocks = srcBlocks.splice(srcIdx);
          dropBlocksIntoHoveredSlot(dragCtx.hoveredSlot, movedBlocks);
          if (dragCtx.hoveredSlot.dataset.mission !== srcFile) {
            syncMissionToFile(srcFile, false);
          }
        } else if (overCanvas) {
          const movedBlocks = srcBlocks.splice(srcIdx);
          syncMissionToFile(srcFile, false);
          state.looseBlocks.push({
            id: state.nextBlockId++,
            x: Math.max(12, Math.round(pt.x - dragCtx.grabOffsetX)),
            y: Math.max(12, Math.round(pt.y - dragCtx.grabOffsetY)),
            z: allocateTopLooseZ(),
            blocks: movedBlocks
          });
        }
        renderCanvas();
        saveCanvasLayout();
        pushBlockSnapshot();
      }
    } else if (kind === 'loose-cmd') {
      const lIdx = dragCtx.looseIndex;
      const subIdx = Math.max(0, dragCtx.looseBlockIndex || 0);
      const srcStack = state.looseBlocks[lIdx];
      if (srcStack && Array.isArray(srcStack.blocks) && subIdx < srcStack.blocks.length) {
        const targetStackObj =
          dragCtx.hoveredSlot?.dataset?.looseIdx !== undefined
            ? state.looseBlocks[parseInt(dragCtx.hoveredSlot.dataset.looseIdx, 10)]
            : null;
        if (dragCtx.overTrash) {
          if (subIdx === 0) state.looseBlocks.splice(lIdx, 1);
          else srcStack.blocks.splice(subIdx);
        } else if (dragCtx.hoveredSlot) {
          const movedBlocks =
            subIdx === 0
              ? state.looseBlocks.splice(lIdx, 1)[0].blocks
              : srcStack.blocks.splice(subIdx);
          if (targetStackObj) {
            const tIdx = Math.max(0, parseInt(dragCtx.hoveredSlot.dataset.insertIdx, 10) || 0);
            targetStackObj.blocks.splice(Math.min(tIdx, targetStackObj.blocks.length), 0, ...movedBlocks);
            targetStackObj.z = allocateTopLooseZ();
          } else {
            dropBlocksIntoHoveredSlot(dragCtx.hoveredSlot, movedBlocks);
          }
        } else if (overCanvas) {
          const nx = Math.max(12, Math.round(pt.x - dragCtx.grabOffsetX));
          const ny = Math.max(12, Math.round(pt.y - dragCtx.grabOffsetY));
          if (subIdx === 0) {
            srcStack.x = nx;
            srcStack.y = ny;
            srcStack.z = allocateTopLooseZ();
          } else {
            const movedBlocks = srcStack.blocks.splice(subIdx);
            state.looseBlocks.push({
              id: state.nextBlockId++,
              x: nx,
              y: ny,
              z: allocateTopLooseZ(),
              blocks: movedBlocks
            });
          }
        }
        renderCanvas();
        saveCanvasLayout();
        pushBlockSnapshot();
      }
    }
  }

  dragCtx.active = false;
  dragCtx.moved = false;
  dragCtx.hoveredSlot = null;
  dragCtx.hoveredParamSlot = null;
  dragCtx.overTrash = false;
  dragCtx.missionEl = null;
  dragCtx.sectionId = null;
  dragCtx.looseIndex = -1;
  dragCtx.looseBlockIndex = -1;
  dragCtx.grabOffsetX = 40;
  dragCtx.grabOffsetY = 20;
  dragCtx.reporterAst = null;
  dragCtx.clearSourceFn = null;
}

window.addEventListener('pointermove', onGlobalPointerMove);
window.addEventListener('pointerup', onGlobalPointerUp);

function setActiveVisualPane(pane) {
  const view = $('viewVisual');
  if (view) view.dataset.pane = pane;
  document.querySelectorAll('.pane-tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.pane === pane));
  if (pane === 'simulator') drawSimulator(state);
}

function placeOrFocusMission(file) {
  const m = state.missions[file];
  if (!m) return;
  if (!m.placed) {
    const canvas = $('blockCanvas');
    const scale = state.zoomPct / 100;
    m.placed = true;
    m.x = Math.max(24, Math.round((canvas.scrollLeft + 40) / scale));
    m.y = Math.max(24, Math.round((canvas.scrollTop + 30) / scale));
  }
  setActiveMission(file);
  renderPalette();
  if (window.innerWidth <= 1120) setActiveVisualPane('canvas');
  const placedEl = document.querySelector(`.mission-container[data-mission="${file}"]`);
  if (placedEl) placedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
}

function removeMissionFromCanvas(file) {
  const m = state.missions[file];
  if (!m) return;
  m.placed = false;
  const remaining = MISSION_DEFS.find((d) => state.missions[d.file].placed);
  if (remaining && state.activeMissionFile === file) state.activeMissionFile = remaining.file;
  renderPalette();
  setActiveMission(state.activeMissionFile);
}

function appendBlockToActiveMission(defType, overrides = {}) {
  const def = DEF_MAP[defType];
  if (!def) return;
  if (!state.missions[state.activeMissionFile].placed) {
    const firstPlaced = MISSION_DEFS.find((d) => state.missions[d.file].placed);
    if (firstPlaced) state.activeMissionFile = firstPlaced.file;
    else state.missions[state.activeMissionFile].placed = true;
  }
  const m = ensureMissionStructure(state.missions[state.activeMissionFile]);
  const secId = m.activeSection || 'Box1';
  m.foldedSections[secId] = false;
  const params = { ...JSON.parse(JSON.stringify(def.defaults)), ...overrides };
  if (def.type === 'SET_VAR' && !overrides.name && state.variables.length > 0) {
    params.name = state.variables[0].name;
    params.value = state.variables[0].value;
  }
  m.sections[secId].push({ id: state.nextBlockId++, type: def.type, params });
  renderPalette();
  renderCanvas();
  syncMissionToFile(state.activeMissionFile);
  saveCanvasLayout();
  if (window.innerWidth <= 1120) setActiveVisualPane('canvas');
}

// ============================================================================
// Toolbox Rendering (Missions, Variables Manager + Reporters, Math, Logic, Commands)
// ============================================================================
function renderCategoryRail() {
  const rail = $('categoryRail');
  rail.innerHTML = '';
  for (const cat of CATEGORIES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `cat-item${state.activeCategory === cat.id ? ' active' : ''}`;
    btn.style.setProperty('--cat-color', cat.color);
    btn.innerHTML = `
      <div class="cat-item-top">
        ${svgIcon(cat.icon, 'sm')}
        <span class="cat-dot"></span>
      </div>
      <span>${escapeHtml(cat.label)}</span>
    `;
    btn.onclick = () => {
      state.activeCategory = cat.id;
      renderCategoryRail();
      renderPalette();
    };
    rail.appendChild(btn);
  }
}

function renderVariableManager(container) {
  const box = document.createElement('div');
  box.className = 'var-manager-box';
  box.innerHTML = `
    <div class="var-manager-title">Variables (Variables.ino)</div>
    <div class="var-form-grid">
      <input type="text" id="newVarName" placeholder="ชื่อตัวแปร (เช่น mySpd)" autocomplete="off" />
      <select id="newVarType">
        <option value="int">int</option>
        <option value="float">float</option>
        <option value="char">char</option>
        <option value="bool">bool</option>
      </select>
    </div>
    <div class="var-form-row">
      <input type="text" id="newVarVal" placeholder="ค่าเริ่มต้น (เช่น 75)" value="75" autocomplete="off" />
      <button class="btn btn-xs btn-primary" id="btnAddVar" type="button">
        ${svgIcon('plus', 'sm')}<span>สร้างตัวแปร</span>
      </button>
    </div>
    <div class="var-list" id="varChipList"></div>
  `;
  container.appendChild(box);

  const chipList = box.querySelector('#varChipList');
  state.variables.forEach((v, vIdx) => {
    const row = document.createElement('div');
    row.className = 'var-chip-row';
    row.innerHTML = `
      <span class="var-type-tag">${escapeHtml(v.type)}</span>
      <span class="var-name-tag" title="${escapeHtml(v.comment || v.name)}">${escapeHtml(v.name)}</span>
      <input type="text" class="var-val-edit" value="${escapeHtml(v.value)}" title="ค่าเริ่มต้น" />
      <button type="button" class="btn-icon xs" title="ลบตัวแปรนี้">${svgIcon('close', 'sm')}</button>
    `;
    const valInp = row.querySelector('.var-val-edit');
    valInp.onchange = () => {
      v.value = valInp.value.trim() || '0';
      serializeVariablesToFile();
    };
    row.querySelector('button').onclick = () => {
      state.variables.splice(vIdx, 1);
      serializeVariablesToFile();
      renderPalette();
    };
    chipList.appendChild(row);
  });

  box.querySelector('#btnAddVar').onclick = () => {
    const name = box.querySelector('#newVarName').value.trim();
    const type = box.querySelector('#newVarType').value;
    const val = box.querySelector('#newVarVal').value.trim() || '0';
    if (!/^[A-Za-z_]\w*$/.test(name)) {
      appendConsole('[ERR] ชื่อตัวแปรต้องขึ้นต้นด้วยตัวอักษรหรือ _ และห้ามมีเว้นวรรค (เช่น spdFast)');
      return;
    }
    if (state.variables.some((v) => v.name === name)) {
      appendConsole(`[ERR] มีตัวแปรชื่อ ${name} อยู่แล้ว`);
      return;
    }
    state.variables.push({ type, name, value: val, comment: 'ตัวแปรกำหนดเอง' });
    serializeVariablesToFile();
    renderPalette();
  };
}

function createPaletteReporterTile(title, desc, badgeText, colorObj, onPointerDown) {
  const item = document.createElement('div');
  item.className = 'palette-block palette-reporter';
  item.style.setProperty('--blk-bg', colorObj.bg);
  item.style.setProperty('--blk-dark', colorObj.dark);
  item.innerHTML = `
    <div class="blk-grip">${svgIcon('grip', 'sm')}</div>
    <div class="blk-meta">
      <div class="blk-title">${escapeHtml(title)}</div>
      <div class="blk-sub">${escapeHtml(desc)}</div>
    </div>
    <span class="reporter-badge">${escapeHtml(badgeText)}</span>
  `;
  item.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    onPointerDown(e);
  });
  return item;
}

function renderPalette() {
  const query = $('paletteSearch').value.trim().toLowerCase();
  const container = $('paletteList');
  container.innerHTML = '';

  const cat = state.activeCategory;
  const showMissions = cat === 'mission' || cat === 'all';
  const showVars = cat === 'vars' || (cat === 'all' && query.length > 0);
  const showReporters = cat === 'math' || cat === 'logic' || cat === 'all';
  let addedAny = false;

  if (cat === 'vars') {
    renderVariableManager(container);
    addedAny = true;
  }

  // Draggable Variable Reporter Blocks
  if (showVars) {
    for (const v of state.variables) {
      if (query && !`${v.name} ${v.type} var`.toLowerCase().includes(query)) continue;
      addedAny = true;
      container.appendChild(createPaletteReporterTile(
        `${v.name}`,
        `ตัวแปร (${v.type} = ${v.value}) — ลากใส่พารามิเตอร์`,
        'VAR',
        CAT_COLORS.vars,
        (e) => {
          dragCtx.active = true;
          dragCtx.moved = false;
          dragCtx.kind = 'palette-reporter';
          dragCtx.startX = e.clientX;
          dragCtx.startY = e.clientY;
          dragCtx.reporterOp = 'VAR';
          dragCtx.reporterVarName = v.name;
        }
      ));
    }
  }

  // Draggable Math & Logic Reporter Blocks
  if (showReporters) {
    for (const rep of REPORTER_DEFS) {
      const matchesCat = cat === 'all' ? !!query : rep.cat === cat;
      if (!matchesCat) continue;
      if (query && !`${rep.sig} ${rep.desc} ${rep.cat}`.toLowerCase().includes(query)) continue;
      addedAny = true;
      const colors = CAT_COLORS[rep.cat] || CAT_COLORS.math;
      container.appendChild(createPaletteReporterTile(
        rep.sig,
        rep.desc,
        rep.cat === 'math' ? 'MATH' : 'LOGIC',
        colors,
        (e) => {
          dragCtx.active = true;
          dragCtx.moved = false;
          dragCtx.kind = 'palette-reporter';
          dragCtx.startX = e.clientX;
          dragCtx.startY = e.clientY;
          dragCtx.reporterOp = rep.op;
          dragCtx.reporterVarName = '';
        }
      ));
    }
  }

  if (showMissions) {
    for (const mDef of MISSION_DEFS) {
      if (query && !`${mDef.title} ${mDef.file} ${mDef.fn}`.toLowerCase().includes(query)) continue;
      addedAny = true;
      const isPlaced = state.missions[mDef.file].placed;
      const tile = document.createElement('div');
      tile.className = 'palette-block is-mission-tile';
      tile.style.setProperty('--blk-bg', mDef.bg);
      tile.style.setProperty('--blk-dark', mDef.dark);
      tile.innerHTML = `
        <div class="blk-grip">${svgIcon('play', 'sm')}</div>
        <div class="blk-meta">
          <div class="blk-title">${escapeHtml(mDef.title)}</div>
          <div class="blk-sub">${escapeHtml(mDef.fn)}</div>
        </div>
        <span class="blk-status-chip">${isPlaced ? 'Active' : 'Drag +'}</span>
      `;
      tile.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        dragCtx.active = true;
        dragCtx.moved = false;
        dragCtx.kind = 'palette-mission';
        dragCtx.startX = e.clientX;
        dragCtx.startY = e.clientY;
        dragCtx.missionFile = mDef.file;
      });
      container.appendChild(tile);
    }
  }

  if (cat !== 'mission' && cat !== 'math' && cat !== 'logic') {
    const filtered = COMMAND_DEFS.filter((d) => {
      const catOk = cat === 'all' || d.cat === cat;
      if (!catOk) return false;
      if (!query) return true;
      return `${d.title} ${d.sig} ${d.desc}`.toLowerCase().includes(query);
    });

    for (const def of filtered) {
      addedAny = true;
      const colors = CAT_COLORS[def.cat] || CAT_COLORS.enc;
      const item = document.createElement('div');
      item.className = 'palette-block';
      item.style.setProperty('--blk-bg', colors.bg);
      item.style.setProperty('--blk-dark', colors.dark);
      item.innerHTML = `
        <div class="blk-grip">${svgIcon('grip', 'sm')}</div>
        <div class="blk-meta">
          <div class="blk-title">${escapeHtml(def.sig)}</div>
          <div class="blk-sub">${escapeHtml(def.desc)}</div>
        </div>
      `;
      item.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        dragCtx.active = true;
        dragCtx.moved = false;
        dragCtx.kind = 'palette-cmd';
        dragCtx.startX = e.clientX;
        dragCtx.startY = e.clientY;
        dragCtx.defType = def.type;
      });
      container.appendChild(item);
    }
  }

  if (!addedAny) {
    container.innerHTML = '<div class="muted" style="padding:12px;">ไม่พบบล็อกที่ตรงกับคำค้น</div>';
  }
}

// ============================================================================
// Recursive Reporter Pill & Variable-Aware Parameter Slot Rendering
// ============================================================================
function renderParameterSlotElement(currentVal, defaultVal, fieldType, onSetVal) {
  const slot = document.createElement('span');
  slot.className = 'mc-param-slot';
  slot.dataset.slotTarget = '1';
  slotMetaMap.set(slot, { setValue: onSetVal, defaultVal });

  slot.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.mc-param-slot.slot-focused').forEach((s) => s.classList.remove('slot-focused'));
    focusedSlotEl = slot;
    slot.classList.add('slot-focused');
  });

  if (isReporterNode(currentVal)) {
    const pill = document.createElement('span');
    const isVar = currentVal.kind === 'var';
    const repDef = isVar ? null : REPORTER_MAP[currentVal.op];
    const pillKindClass = isVar ? 'is-var' : (repDef?.cat === 'logic' ? 'is-logic' : 'is-math');
    pill.className = `mc-reporter-pill ${pillKindClass}`;

    pill.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('input, select, button')) return;
      e.preventDefault();
      e.stopPropagation();
      dragCtx.active = true;
      dragCtx.moved = false;
      dragCtx.kind = 'move-reporter';
      dragCtx.startX = e.clientX;
      dragCtx.startY = e.clientY;
      dragCtx.reporterAst = currentVal;
      dragCtx.clearSourceFn = (shouldSync = true) => onSetVal(defaultVal, shouldSync);
    });

    if (isVar) {
      const vSel = document.createElement('select');
      vSel.className = 'mc-pill-input';
      const names = state.variables.map((v) => v.name);
      if (currentVal.name && !names.includes(currentVal.name)) names.unshift(currentVal.name);
      for (const n of names) {
        const o = document.createElement('option');
        o.value = n;
        o.textContent = n;
        vSel.appendChild(o);
      }
      vSel.value = currentVal.name;
      vSel.onchange = () => onSetVal({ kind: 'var', name: vSel.value });
      pill.appendChild(vSel);
    } else if (repDef) {
      for (const sub of repDef.slots) {
        if (sub.label) {
          const opSpan = document.createElement('span');
          opSpan.className = 'mc-reporter-op';
          opSpan.textContent = sub.label;
          pill.appendChild(opSpan);
        }
        const subVal = currentVal.args?.[sub.key] ?? sub.default;
        if (sub.type === 'bool_lit') {
          const sel = document.createElement('select');
          sel.className = 'mc-pill-input';
          sel.innerHTML = '<option value="true">true</option><option value="false">false</option>';
          sel.value = subVal === false || subVal === 'false' ? 'false' : 'true';
          sel.onchange = () => {
            currentVal.args[sub.key] = sel.value === 'true';
            onSetVal(currentVal);
          };
          pill.appendChild(sel);
        } else {
          pill.appendChild(renderParameterSlotElement(subVal, sub.default, 'number', (nextSubVal, shouldRender = true) => {
            if (!currentVal.args) currentVal.args = {};
            currentVal.args[sub.key] = nextSubVal;
            onSetVal(currentVal, shouldRender);
          }));
        }
        if (sub.suffix) {
          const suf = document.createElement('span');
          suf.className = 'mc-reporter-op';
          suf.textContent = sub.suffix;
          pill.appendChild(suf);
        }
      }
    }

    const clr = document.createElement('button');
    clr.type = 'button';
    clr.className = 'mc-reporter-clear';
    clr.title = 'ถอดบล็อกพารามิเตอร์นี้ออก';
    clr.innerHTML = svgIcon('close', 'sm');
    clr.addEventListener('pointerdown', (e) => e.stopPropagation());
    clr.onclick = () => onSetVal(defaultVal);
    pill.appendChild(clr);

    slot.appendChild(pill);
    return slot;
  }

  // Literal / Direct Editable Input inside slot
  if (fieldType === 'bool') {
    const sel = document.createElement('select');
    sel.className = 'mc-pill-input';
    sel.innerHTML = '<option value="true">true</option><option value="false">false</option>';
    for (const v of state.variables.filter((item) => item.type === 'bool')) {
      const o = document.createElement('option');
      o.value = v.name;
      o.textContent = `var: ${v.name}`;
      sel.appendChild(o);
    }
    const strVal = String(currentVal === false ? 'false' : currentVal === true ? 'true' : currentVal);
    if (!Array.from(sel.options).some((o) => o.value === strVal)) {
      const o = document.createElement('option');
      o.value = strVal;
      o.textContent = strVal;
      sel.appendChild(o);
    }
    sel.value = strVal;
    sel.onchange = () => {
      const val = sel.value === 'true' ? true : sel.value === 'false' ? false : { kind: 'var', name: sel.value };
      onSetVal(val);
    };
    slot.appendChild(sel);
    return slot;
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'mc-pill-input';
  input.value = currentVal ?? defaultVal ?? 0;
  input.title = 'ใส่ตัวเลข พิมพ์สูตร หรือลาก ตัวแปร / คณิต / ตรรกะ มาวางใส่ช่องนี้';
  input.oninput = () => {
    const raw = input.value.trim();
    if (isPlainNumber(raw)) {
      const n = parseFloat(raw.replace(/f$/i, ''));
      onSetVal(Number.isFinite(n) ? n : 0, false, false);
    } else {
      onSetVal(raw, false, false);
    }
  };
  input.onblur = () => {
    const raw = input.value.trim();
    const ast = parseCodeArgToAst(raw, state.variables.map((v) => v.name));
    if (isReporterNode(ast)) {
      onSetVal(ast, true, true);
    }
  };
  slot.appendChild(input);

  const numericVars = state.variables.filter((v) => v.type === 'int' || v.type === 'float');
  if (numericVars.length > 0 && fieldType !== 'text') {
    const varPick = document.createElement('select');
    varPick.className = 'mc-var-select';
    varPick.title = 'เลือกตัวแปรมาใส่ช่องนี้';
    const defOpt = document.createElement('option');
    defOpt.value = '';
    defOpt.textContent = 'v';
    varPick.appendChild(defOpt);
    for (const v of numericVars) {
      const o = document.createElement('option');
      o.value = v.name;
      o.textContent = `${v.name} (${v.value})`;
      varPick.appendChild(o);
    }
    varPick.onchange = () => {
      if (!varPick.value) return;
      const picked = varPick.value;
      varPick.value = '';
      onSetVal({ kind: 'var', name: picked });
    };
    slot.appendChild(varPick);
  }
  return slot;
}

function buildFieldControl(field, block, def, onUpdate) {
  const wrap = document.createElement('div');
  wrap.className = 'mc-pill-field';
  wrap.addEventListener('pointerdown', (e) => e.stopPropagation());

  const lbl = document.createElement('span');
  lbl.className = 'mc-pill-lbl';
  lbl.textContent = field.label;
  wrap.appendChild(lbl);

  const curVal = block.params[field.key];
  const defVal = def.defaults[field.key] ?? 0;

  if (field.type === 'var_name') {
    const control = document.createElement('select');
    control.className = 'mc-pill-input';
    const names = state.variables.map((v) => v.name);
    if (curVal && !names.includes(curVal)) names.unshift(curVal);
    if (names.length === 0) names.push('spdNorm');
    for (const n of names) {
      const o = document.createElement('option');
      o.value = n;
      o.textContent = n;
      control.appendChild(o);
    }
    control.value = curVal ?? names[0];
    control.onchange = () => {
      block.params[field.key] = control.value;
      onUpdate(true, true);
    };
    wrap.classList.add('is-var');
    wrap.appendChild(control);
    return wrap;
  }

  if (field.type === 'dir' || field.type === 'dir45' || field.type === 'dirTurn90' || field.type === 'dirTurn45') {
    const slot = document.createElement('span');
    slot.className = 'mc-param-slot';
    const control = document.createElement('select');
    control.className = 'mc-pill-input';
    const opts = field.type === 'dirTurn90'
      ? [['R', "'R' Swing+90° (เลี้ยวไม่หยุด)"], ['L', "'L' Swing-90° (เลี้ยวไม่หยุด)"], ['r', "'r' Spin+90° (หยุดหมุน)"], ['l', "'l' Spin-90° (หยุดหมุน)"]]
      : field.type === 'dirTurn45'
      ? [['R', "'R' Swing+45° (เลี้ยวไม่หยุด)"], ['L', "'L' Swing-45° (เลี้ยวไม่หยุด)"], ['r', "'r' Spin+45° (หยุดหมุน)"], ['l', "'l' Spin-45° (หยุดหมุน)"]]
      : field.type === 'dir45'
      ? [['R', "'R' +90°"], ['L', "'L' -90°"], ['r', "'r' +45°"], ['l', "'l' -45°"]]
      : [['R', "'R' Spin+90° (หมุนขวา)"], ['L', "'L' Spin-90° (หมุนซ้าย)"]];
    for (const [v, t] of opts) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = t;
      control.appendChild(o);
    }
    for (const v of state.variables.filter((item) => item.type === 'char')) {
      const o = document.createElement('option');
      o.value = v.name;
      o.textContent = `var: ${v.name}`;
      control.appendChild(o);
    }
    const strCur = curVal && typeof curVal === 'object' ? curVal.name : String(curVal ?? opts[0][0]);
    if (strCur && !Array.from(control.options).some((o) => o.value === strCur)) {
      const o = document.createElement('option');
      o.value = strCur;
      o.textContent = strCur;
      control.appendChild(o);
    }
    control.value = strCur;
    slotMetaMap.set(slot, {
      setValue: (node) => {
        block.params[field.key] = node;
        onUpdate(true, true);
      },
      defaultVal: opts[0][0]
    });
    control.onchange = () => {
      const isCharVar = state.variables.some((v) => v.name === control.value);
      block.params[field.key] = isCharVar ? { kind: 'var', name: control.value } : control.value;
      onUpdate(true, true);
    };
    slot.appendChild(control);
    wrap.appendChild(slot);
    return wrap;
  }

  if (field.type === 'text') {
    const control = document.createElement('input');
    control.type = 'text';
    control.className = 'mc-pill-input';
    control.style.width = '140px';
    control.value = curVal ?? '';
    control.oninput = () => {
      block.params[field.key] = control.value;
      onUpdate(false, false);
    };
    wrap.appendChild(control);
    return wrap;
  }

  // Number / Expression / Boolean Parameter Slot (supports dropping Variable, Math, Logic blocks!)
  const slotEl = renderParameterSlotElement(curVal, defVal, field.type, (newVal, shouldSync = true, shouldRender = true) => {
    block.params[field.key] = newVal;
    onUpdate(shouldRender, shouldSync);
  });
  wrap.appendChild(slotEl);
  return wrap;
}

let activeBlockContextMenu = null;

function closeBlockContextMenu() {
  if (activeBlockContextMenu) {
    activeBlockContextMenu.remove();
    activeBlockContextMenu = null;
  }
}

function showBlockContextMenu(clientX, clientY, opts) {
  closeBlockContextMenu();
  const canvasPt = clientToCanvasCoords(clientX, clientY);
  const menu = document.createElement('div');
  menu.className = 'block-context-menu';

  const makeItem = (label, iconName, danger, handler) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `block-ctx-item${danger ? ' danger' : ''}`;
    btn.innerHTML = `${svgIcon(iconName, 'sm')}<span>${label}</span>`;
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.onclick = () => {
      closeBlockContextMenu();
      handler?.();
    };
    return btn;
  };

  if (typeof opts.onToggleDisable === 'function') {
    menu.appendChild(
      makeItem(
        opts.blockDisabled ? 'เปิดใช้งานบล็อก (Uncomment)' : 'ปิดใช้งานบล็อก (Comment //)',
        opts.blockDisabled ? 'eye' : 'eye-off',
        false,
        opts.onToggleDisable
      )
    );
  }
  if (typeof opts.onDuplicate === 'function') {
    menu.appendChild(makeItem('ทำซ้ำ (Duplicate)', 'copy', false, () => opts.onDuplicate(canvasPt)));
  }
  if (typeof opts.onDuplicateStack === 'function' && (opts.stackTailCount || 0) > 1) {
    menu.appendChild(
      makeItem(
        `ทำซ้ำพร้อมชุดด้านล่าง (${opts.stackTailCount} บล็อก)`,
        'copy',
        false,
        () => opts.onDuplicateStack(canvasPt)
      )
    );
  }
  if (typeof opts.onDelete === 'function') {
    menu.appendChild(makeItem('ลบ (Delete)', 'close', true, opts.onDelete));
  }
  if (!menu.children.length) return;

  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  const left = Math.min(clientX, Math.max(8, window.innerWidth - rect.width - 8));
  const top = Math.min(clientY, Math.max(8, window.innerHeight - rect.height - 8));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  activeBlockContextMenu = menu;
}

document.addEventListener('pointerdown', (e) => {
  if (activeBlockContextMenu && !e.target.closest('.block-context-menu')) {
    closeBlockContextMenu();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeBlockContextMenu();
});

function buildBlockElement(block, opts) {
  const def = DEF_MAP[block.type] || DEF_MAP.RAW;
  const colors = CAT_COLORS[def.cat] || CAT_COLORS.enc;
  const isDisabled = !!block.disabled;
  const el = document.createElement('div');
  el.className = `mc-block${opts.loose ? ' loose-block' : ''}${opts.simActive ? ' sim-active' : ''}${isDisabled ? ' is-disabled' : ''}${opts.sectionDisabled ? ' in-disabled-sec' : ''}`;
  el.style.setProperty('--blk-bg', colors.bg);
  el.style.setProperty('--blk-dark', colors.dark);
  if (opts.loose) {
    el.dataset.looseIdx = String(opts.looseIdx ?? 0);
    el.dataset.looseBlockIdx = String(opts.looseBlockIdx ?? 0);
  } else if (opts.missionFile) {
    el.dataset.mission = opts.missionFile;
    el.dataset.section = opts.sectionId || 'Box1';
    el.dataset.stackIdx = String(opts.stackIdx ?? 0);
    el.dataset.globalIdx = String(opts.globalIdx ?? -1);
    el.addEventListener('focusin', (e) => {
      if (e.target.closest('.mc-delete-btn, .mc-toggle-btn') || !isClickToSeekSimEnabled()) return;
      seekSimulationToSectionBlock(opts.missionFile, opts.sectionId || 'Box1', opts.stackIdx ?? 0);
    });
  }

  const grip = document.createElement('span');
  grip.className = 'mc-grip';
  grip.innerHTML = svgIcon('grip', 'sm');
  el.appendChild(grip);

  if (opts.indexLabel !== undefined) {
    const badge = document.createElement('span');
    badge.className = 'mc-index';
    badge.textContent = String(opts.indexLabel);
    el.appendChild(badge);
  }

  const title = document.createElement('span');
  title.className = 'mc-label';
  title.textContent = def.title;
  el.appendChild(title);

  if (isDisabled) {
    const offTag = document.createElement('span');
    offTag.className = 'mc-disabled-tag';
    offTag.textContent = '// OFF';
    offTag.title = 'บล็อกนี้ถูก Comment ปิดไว้ (โค้ดและ Simulator จะข้ามคำสั่งนี้)';
    el.appendChild(offTag);
  }

  if (def.fields.length > 0) {
    const pills = document.createElement('div');
    pills.className = 'mc-pills';
    for (const field of def.fields) {
      pills.appendChild(buildFieldControl(field, block, def, opts.onChange));
    }
    el.appendChild(pills);
  }

  const actions = document.createElement('div');
  actions.className = 'mc-actions';

  if (typeof opts.onToggleDisable === 'function') {
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = `mc-toggle-btn${isDisabled ? ' is-off' : ''}`;
    toggleBtn.title = isDisabled
      ? 'เปิดใช้งานบล็อกนี้ (ยกเลิก Comment)'
      : 'ปิดใช้งานบล็อกนี้ชั่วคราว (Comment ไว้ไม่ให้ทำงาน)';
    toggleBtn.setAttribute('aria-pressed', isDisabled ? 'true' : 'false');
    toggleBtn.innerHTML = svgIcon(isDisabled ? 'eye-off' : 'eye', 'sm');
    toggleBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    toggleBtn.onclick = opts.onToggleDisable;
    actions.appendChild(toggleBtn);
  }

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'mc-delete-btn';
  delBtn.title = 'ลบบล็อกนี้';
  delBtn.innerHTML = svgIcon('close', 'sm');
  delBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  delBtn.onclick = opts.onDelete;
  actions.appendChild(delBtn);

  el.appendChild(actions);

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('input, select, button, .mc-reporter-pill')) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = el.getBoundingClientRect();
    const scale = state.zoomPct / 100 || 1;
    dragCtx.active = true;
    dragCtx.moved = false;
    dragCtx.startX = e.clientX;
    dragCtx.startY = e.clientY;
    dragCtx.grabOffsetX = Math.max(8, (e.clientX - rect.left) / scale);
    dragCtx.grabOffsetY = Math.max(8, (e.clientY - rect.top) / scale);
    if (opts.loose) {
      dragCtx.kind = 'loose-cmd';
      dragCtx.looseIndex = opts.looseIdx;
      dragCtx.looseBlockIndex = opts.looseBlockIdx ?? 0;
    } else {
      dragCtx.kind = 'stack-cmd';
      dragCtx.missionFile = opts.missionFile;
      dragCtx.sectionId = opts.sectionId || 'Box1';
      dragCtx.blockIndex = opts.stackIdx;
    }
  });

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showBlockContextMenu(e.clientX, e.clientY, opts);
  });

  return el;
}

function createDropSlot(missionFile, sectionId, insertIdx, isEmpty = false, emptyLabel = '') {
  const slot = document.createElement('div');
  slot.className = isEmpty ? 'drop-slot empty-hint compact' : 'drop-slot';
  slot.dataset.mission = missionFile;
  slot.dataset.section = sectionId;
  slot.dataset.insertIdx = String(insertIdx);
  if (isEmpty) slot.textContent = emptyLabel || 'ลากบล็อกคำสั่งมาวางต่อในฟังก์ชันนี้';
  return slot;
}

function createLooseDropSlot(looseIdx, insertIdx, extraClass = '') {
  const slot = document.createElement('div');
  slot.className = `drop-slot loose-slot${extraClass ? ` ${extraClass}` : ''}`;
  slot.dataset.looseIdx = String(looseIdx);
  slot.dataset.insertIdx = String(insertIdx);
  return slot;
}

function renderCanvas() {
  const stage = $('canvasStage');
  stage.innerHTML = '';
  updateMissionChrome();

  let placedCount = 0;

  for (const mDef of MISSION_DEFS) {
    const m = ensureMissionStructure(state.missions[mDef.file]);
    if (!m || !m.placed) continue;
    placedCount++;

    const isActive = state.activeMissionFile === mDef.file;
    const totalSteps = getMissionTotalCount(m);
    const activeSteps = getMissionActiveCount(m);
    const stepSummary = activeSteps < totalSteps ? `${activeSteps}/${totalSteps} steps` : `${totalSteps} steps`;
    const container = document.createElement('div');
    container.className = `mission-container${isActive ? ' active' : ''}${m.folded ? ' folded' : ''}`;
    container.dataset.mission = mDef.file;
    container.style.left = `${m.x}px`;
    container.style.top = `${m.y}px`;
    container.style.setProperty('--blk-bg', mDef.bg);
    container.style.setProperty('--blk-dark', mDef.dark);

    const hat = document.createElement('div');
    hat.className = 'mission-hat-header';
    hat.innerHTML = `
      ${svgIcon('play', 'sm')}
      <span>${escapeHtml(mDef.title)}</span>
      <span class="hat-pill">${escapeHtml(mDef.fn)}</span>
      <span class="mission-count-pill">${stepSummary}</span>
    `;

    const foldBtn = document.createElement('button');
    foldBtn.type = 'button';
    foldBtn.className = 'mission-fold-btn';
    foldBtn.title = m.folded ? 'ขยายบล็อกภายใน Mission' : 'ย่อ/พับกล่อง Mission (ประหยัดพื้นที่)';
    foldBtn.innerHTML = svgIcon('chevron', 'sm');
    foldBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    foldBtn.onclick = () => { m.folded = !m.folded; renderCanvas(); saveCanvasLayout(); };
    hat.appendChild(foldBtn);

    hat.ondblclick = (e) => {
      if (e.target.closest('button')) return;
      m.folded = !m.folded;
      renderCanvas();
      saveCanvasLayout();
    };

    const rmBtn = document.createElement('button');
    rmBtn.type = 'button';
    rmBtn.className = 'mission-remove-btn';
    rmBtn.title = 'ซ่อนกล่อง Mission นี้ออกจาก Canvas (โค้ดในไฟล์ยังอยู่)';
    rmBtn.innerHTML = svgIcon('close', 'sm');
    rmBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    rmBtn.onclick = () => removeMissionFromCanvas(mDef.file);
    hat.appendChild(rmBtn);

    hat.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      e.preventDefault();
      e.stopPropagation();
      dragCtx.active = true;
      dragCtx.moved = false;
      dragCtx.kind = 'canvas-mission';
      dragCtx.missionFile = mDef.file;
      dragCtx.missionEl = container;
      dragCtx.originX = m.x;
      dragCtx.originY = m.y;
      dragCtx.startX = e.clientX;
      dragCtx.startY = e.clientY;
    });

    container.appendChild(hat);

    const body = document.createElement('div');
    body.className = 'mission-c-body';

    let globalIdx = 0;
    for (const sec of MISSION_SECTIONS) {
      const fnName = getMissionSectionFnName(mDef.file, sec.id);
      const secBlocks = m.sections[sec.id] || [];
      const isSecActive = isActive && (m.activeSection || 'Box1') === sec.id;
      const isSecFolded = !!m.foldedSections?.[sec.id];
      const isSecDisabled = !!m.disabledSections?.[sec.id];
      const secActiveCount = isSecDisabled ? 0 : secBlocks.filter((b) => !b?.disabled).length;
      const secCountLabel = isSecDisabled
        ? `0/${secBlocks.length} (//)`
        : secActiveCount < secBlocks.length
          ? `${secActiveCount}/${secBlocks.length} steps`
          : `${secBlocks.length} steps`;

      const subCard = document.createElement('div');
      subCard.className = `mission-subfn${isSecActive ? ' active-subfn' : ''}${isSecFolded ? ' folded' : ''}${isSecDisabled ? ' disabled-subfn' : ''}`;
      subCard.dataset.mission = mDef.file;
      subCard.dataset.section = sec.id;
      subCard.style.setProperty('--sub-accent', sec.accent);

      const subHdr = document.createElement('div');
      subHdr.className = 'mission-subfn-header';
      subHdr.title = `คลิกเพื่อเลือก ${fnName}() สำหรับวางบล็อก`;
      subHdr.innerHTML = `
        <span class="mission-subfn-dot"></span>
        <span class="mission-subfn-fn">${escapeHtml(fnName)}()</span>
        <span class="mission-subfn-count">${secCountLabel}</span>
      `;

      const subToggleBtn = document.createElement('button');
      subToggleBtn.type = 'button';
      subToggleBtn.className = `mission-subfn-toggle${isSecDisabled ? ' is-off' : ''}`;
      subToggleBtn.title = isSecDisabled
        ? `เปิดใช้งาน ${fnName}() (ยกเลิก // Comment ใน runMode)`
        : `ปิดใช้งาน ${fnName}() ชั่วคราว (Comment // ${fnName}(); ไม่ให้ทำงาน)`;
      subToggleBtn.setAttribute('aria-pressed', isSecDisabled ? 'true' : 'false');
      subToggleBtn.innerHTML = `${svgIcon(isSecDisabled ? 'eye-off' : 'eye', 'sm')}<span>${isSecDisabled ? 'ปิดอยู่' : 'เปิด'}</span>`;
      subToggleBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      subToggleBtn.onclick = () => {
        m.disabledSections[sec.id] = !m.disabledSections[sec.id];
        renderCanvas();
        syncMissionToFile(mDef.file, true);
        rebuildSimAndDraw(true);
        saveCanvasLayout();
      };
      subHdr.appendChild(subToggleBtn);

      const subFoldBtn = document.createElement('button');
      subFoldBtn.type = 'button';
      subFoldBtn.className = 'mission-subfn-fold';
      subFoldBtn.title = isSecFolded ? `ขยาย ${fnName}()` : `ย่อ/พับ ${fnName}()`;
      subFoldBtn.innerHTML = svgIcon('chevron', 'sm');
      subFoldBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      subFoldBtn.onclick = () => {
        m.foldedSections[sec.id] = !m.foldedSections[sec.id];
        renderCanvas();
        saveCanvasLayout();
      };
      subHdr.appendChild(subFoldBtn);

      subHdr.addEventListener('pointerdown', (e) => e.stopPropagation());
      subHdr.onclick = (e) => {
        if (e.target.closest('button')) return;
        const changedMission = state.activeMissionFile !== mDef.file;
        m.activeSection = sec.id;
        if (changedMission) setActiveMission(mDef.file);
        else {
          renderCanvas();
          saveCanvasLayout();
        }
      };

      subCard.appendChild(subHdr);

      const subBody = document.createElement('div');
      subBody.className = 'mission-subfn-body';
      const seq = document.createElement('div');
      seq.className = 'sequence-list';

      if (secBlocks.length === 0) {
        seq.appendChild(createDropSlot(mDef.file, sec.id, 0, true, `ลากบล็อกลง ${fnName}()`));
      } else {
        secBlocks.forEach((blk, idx) => {
          const myGlobalIdx = globalIdx++;
          seq.appendChild(createDropSlot(mDef.file, sec.id, idx, false));
          const blkEl = buildBlockElement(blk, {
            loose: false,
            missionFile: mDef.file,
            sectionId: sec.id,
            stackIdx: idx,
            globalIdx: myGlobalIdx,
            indexLabel: myGlobalIdx + 1,
            simActive: isActive && !blk.disabled && !isSecDisabled && myGlobalIdx === state.sim.activeBlockIndex,
            blockDisabled: !!blk.disabled,
            sectionDisabled: isSecDisabled,
            stackTailCount: secBlocks.length - idx,
            onChange: (shouldRender = false, recordUndo = true) => {
              syncMissionToFile(mDef.file, recordUndo);
              if (shouldRender) renderCanvas();
              saveCanvasLayout();
            },
            onToggleDisable: () => {
              blk.disabled = !blk.disabled;
              renderCanvas();
              syncMissionToFile(mDef.file, true);
              rebuildSimAndDraw(true);
              saveCanvasLayout();
            },
            onDuplicate: (canvasPt) => spawnDuplicatedLooseStack([blk], canvasPt),
            onDuplicateStack: (canvasPt) => spawnDuplicatedLooseStack(secBlocks.slice(idx), canvasPt),
            onDelete: () => {
              secBlocks.splice(idx, 1);
              renderCanvas();
              syncMissionToFile(mDef.file);
              saveCanvasLayout();
            }
          });
          seq.appendChild(blkEl);
        });
        seq.appendChild(createDropSlot(mDef.file, sec.id, secBlocks.length, false));
      }

      subBody.appendChild(seq);
      subCard.appendChild(subBody);
      body.appendChild(subCard);
    }

    container.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'mission-c-footer';
    footer.addEventListener('pointerdown', () => {
      if (state.activeMissionFile !== mDef.file) setActiveMission(mDef.file);
    });
    container.appendChild(footer);

    stage.appendChild(container);
  }

  state.looseBlocks.forEach((stack, lIdx) => {
    if (!stack || !Array.isArray(stack.blocks) || stack.blocks.length === 0) return;
    const stackEl = document.createElement('div');
    stackEl.className = `loose-stack${stack.id === state.lastDuplicatedStackId ? ' just-duplicated' : ''}`;
    stackEl.dataset.looseIdx = String(lIdx);
    stackEl.style.left = `${stack.x ?? 40}px`;
    stackEl.style.top = `${stack.y ?? 40}px`;
    stackEl.style.zIndex = String(stack.z || 30);

    // Bring any clicked or right-clicked loose stack to the topmost canvas layer
    stackEl.addEventListener('pointerdown', () => {
      stack.z = allocateTopLooseZ();
      stackEl.style.zIndex = String(stack.z);
    }, { capture: true });

    stackEl.appendChild(createLooseDropSlot(lIdx, 0, 'loose-slot-top'));

    stack.blocks.forEach((blk, subIdx) => {
      const el = buildBlockElement(blk, {
        loose: true,
        looseIdx: lIdx,
        looseBlockIdx: subIdx,
        blockDisabled: !!blk.disabled,
        stackTailCount: stack.blocks.length - subIdx,
        onChange: (shouldRender = false) => {
          if (shouldRender) renderCanvas();
          saveCanvasLayout();
          pushBlockSnapshot();
        },
        onToggleDisable: () => {
          blk.disabled = !blk.disabled;
          renderCanvas();
          saveCanvasLayout();
          pushBlockSnapshot();
        },
        onDuplicate: (canvasPt) => spawnDuplicatedLooseStack([blk], canvasPt),
        onDuplicateStack: (canvasPt) => spawnDuplicatedLooseStack(stack.blocks.slice(subIdx), canvasPt),
        onDelete: () => {
          stack.blocks.splice(subIdx, 1);
          if (stack.blocks.length === 0) state.looseBlocks.splice(lIdx, 1);
          renderCanvas();
          saveCanvasLayout();
          pushBlockSnapshot();
        }
      });
      stackEl.appendChild(el);
      stackEl.appendChild(
        createLooseDropSlot(
          lIdx,
          subIdx + 1,
          subIdx === stack.blocks.length - 1 ? 'loose-slot-end' : 'loose-slot-mid'
        )
      );
    });

    stage.appendChild(stackEl);
  });
  state.lastDuplicatedStackId = -1;

  if (placedCount === 0 && state.looseBlocks.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-canvas-banner';
    hint.textContent = 'ยังไม่มี Mission บน Canvas — ลาก Mission 1 / Mission 2 / Mission 3 จากหมวด Missions ด้านซ้ายมาวางได้เลย';
    stage.appendChild(hint);
  }
}

function applyCanvasZoom(pct) {
  state.zoomPct = Math.max(60, Math.min(130, pct));
  if ($('zoomLabel')) $('zoomLabel').textContent = `${state.zoomPct}%`;
  if ($('canvasStage')) $('canvasStage').style.transform = `scale(${state.zoomPct / 100})`;
  saveCanvasLayout();
}

// ============================================================================
// Mode 2 File List & Snippets
// ============================================================================
function openCodeFile(name) {
  state.activeCodeFile = name;
  if ($('activeFileName')) $('activeFileName').textContent = name;
  codeIde.loadFileIntoEditor(name, state.files[name] || '');
  updateDirtyIndicator();
  updateDocumentTitle();
  renderFileList();
  if (state.mode === 'code') {
    if (state.missions[name]) {
      parseMissionFile(name);
      state.activeMissionFile = name;
      rebuildSimAndDraw(true);
      if ($('codeSimHint') && isClickToSeekSimEnabled()) {
        $('codeSimHint').textContent = `${name} · คลิกบรรทัดเพื่อย้ายจุดจำลอง`;
      }
    } else {
      drawSimulator(state);
      if ($('codeSimHint') && isClickToSeekSimEnabled()) {
        $('codeSimHint').textContent = `ไฟล์ ${name} (แสดงผลภารกิจ ${state.activeMissionFile})`;
      }
    }
  }
}

function renderFileList() {
  const container = $('fileList');
  if (!container) return;
  container.innerHTML = '';
  for (const name of Object.keys(state.files)) {
    const isDirty = state.files[name] !== state.savedFiles[name];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `file-item${name === state.activeCodeFile ? ' active' : ''}`;
    btn.innerHTML = `<span>${escapeHtml(name)}</span>${isDirty ? '<span style="color:#f59e0b;">*</span>' : ''}`;
    btn.onclick = () => openCodeFile(name);
    container.appendChild(btn);
  }
}

function renderSnippets() {
  const container = $('snippetList');
  if (!container) return;
  container.innerHTML = '';
  for (const s of SNIPPETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'snippet-btn';
    btn.innerHTML = `<strong>${escapeHtml(s.desc)}</strong><code>${escapeHtml(s.code)}</code>`;
    btn.onclick = () => {
      const ta = $('codeTextarea');
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      const prefix = start > 0 && ta.value[start - 1] !== '\n' ? '\n    ' : '    ';
      const insertion = `${prefix}${s.code}\n`;
      ta.value = `${ta.value.slice(0, start)}${insertion}${ta.value.slice(end)}`;
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + insertion.length;
      ta.dispatchEvent(new Event('input'));
    };
    container.appendChild(btn);
  }
}

function updateDirtyIndicator() {
  const anyDirty = Object.keys(state.files).some((k) => state.files[k] !== state.savedFiles[k]);
  if ($('dirtyIndicator')) $('dirtyIndicator').hidden = !anyDirty;
  renderFileList();
  refreshAutoSaveUi(anyDirty);
}

// ============================================================================
// Field Map Storage & Map Manager Controller Integration
// ============================================================================
function saveFieldMapToStorage() {
  try {
    const fm = state.fieldMap;
    localStorage.setItem(FIELD_MAP_STORAGE_KEY, JSON.stringify({
      rows: fm.rows,
      cols: fm.cols,
      tileWidthCm: fm.tileWidthCm,
      simViewMode: fm.simViewMode,
      simCameraRot: fm.simCameraRot,
      showMarkers: !!fm.showMarkers,
      compactGrid: buildCompactGrid(fm.gridData)
    }));
  } catch (_) {}
}

function syncSimGridInputsFromFieldMap() {
  const fm = state.fieldMap;
  if ($('simCellSizeCm')) $('simCellSizeCm').value = String(fm.tileWidthCm);
  if ($('simGridCols')) $('simGridCols').value = String(fm.cols);
  if ($('simGridRows')) $('simGridRows').value = String(fm.rows);
}

function syncSimStartFromFieldStartTile() {
  const startCell = findStartTileCell(state.fieldMap.gridData);
  if (!startCell) return false;
  if ($('simStartCol')) $('simStartCol').value = String(startCell.col);
  if ($('simStartRow')) $('simStartRow').value = String(startCell.row);
  return true;
}

function syncSimViewButtons() {
  const fm = state.fieldMap;
  const isIso = fm.simViewMode === 'iso';
  const camLocked = !!state.sim.cameraFollowRobot;
  for (const btnId of ['btnSimViewMode', 'btnCodeSimViewMode']) {
    const btn = $(btnId);
    if (btn) {
      setBtnContent(btn, isIso ? 'grid' : 'cube', isIso ? '3D Iso' : '2D View', 'sm');
      btn.classList.toggle('active', isIso);
    }
  }
  for (const rotBtnId of ['btnSimRotateIso', 'btnCodeSimRotateIso']) {
    const rotBtn = $(rotBtnId);
    if (rotBtn) {
      rotBtn.hidden = !isIso;
      rotBtn.disabled = camLocked;
      rotBtn.title = camLocked
        ? 'ปิด Lock Camera ใน IDE Settings เพื่อหมุนกล้องอิสระ'
        : 'หมุนมุมกล้อง 3D Iso 90°';
      const lbl = rotBtn.querySelector('span');
      if (lbl) lbl.textContent = camLocked ? 'LOCK' : `${fm.simCameraRot || 0}°`;
    }
  }
}

function toggleSimViewMode() {
  state.fieldMap.simViewMode = state.fieldMap.simViewMode === 'iso' ? '2d' : 'iso';
  syncSimViewButtons();
  saveFieldMapToStorage();
  drawSimulator(state);
  if (typeof publishPluginBridgeState === 'function') publishPluginBridgeState('view-mode');
}

function rotateSimIsoCamera() {
  state.fieldMap.simCameraRot = (Number(state.fieldMap.simCameraRot || 0) + 90) % 360;
  syncSimViewButtons();
  saveFieldMapToStorage();
  drawSimulator(state);
  if (typeof publishPluginBridgeState === 'function') publishPluginBridgeState('camera-rot');
}

const LEGACY_REMOVED_TILE_MAP = { 5: 1, 8: 3, 9: 2, 10: 1, 11: 3 };

function sanitizeLegacyCompactGrid(compactGrid) {
  if (!Array.isArray(compactGrid)) return compactGrid;
  return compactGrid.map((row) =>
    Array.isArray(row)
      ? row.map((token) => {
          if (typeof token !== 'string' || !token) return token;
          const parts = token.split('@');
          const id = parseInt(parts[0], 10);
          const rot = parseInt(parts[1], 10) || 0;
          const mapped = LEGACY_REMOVED_TILE_MAP[id];
          return mapped ? `${mapped}@${rot}` : token;
        })
      : row
  );
}

function loadFieldMapFromStorage() {
  try {
    const raw = localStorage.getItem(FIELD_MAP_STORAGE_KEY);
    if (!raw) {
      syncSimGridInputsFromFieldMap();
      syncSimViewButtons();
      return;
    }
    const saved = JSON.parse(raw);
    const rows = Math.max(2, Math.min(24, Number(saved.rows) || 7));
    const cols = Math.max(2, Math.min(24, Number(saved.cols) || 7));
    const tileWidthCm = Math.max(5, Math.min(200, Number(saved.tileWidthCm) || 30));
    state.fieldMap.rows = rows;
    state.fieldMap.cols = cols;
    state.fieldMap.tileWidthCm = tileWidthCm;
    state.fieldMap.simViewMode = saved.simViewMode === 'iso' ? 'iso' : '2d';
    state.fieldMap.simCameraRot = (((Number(saved.simCameraRot) || 0) % 360) + 360) % 360;
    state.fieldMap.showMarkers = !!saved.showMarkers;
    if (Array.isArray(saved.compactGrid)) {
      state.fieldMap.gridData = parseCompactGrid(sanitizeLegacyCompactGrid(saved.compactGrid), rows, cols);
    }
  } catch (_) {}
  syncSimGridInputsFromFieldMap();
  syncSimViewButtons();
}

const mapManager = createMapManagerController({
  getFieldState: () => state.fieldMap,
  setFieldState: (next) => { state.fieldMap = next; },
  getSimContext: () => ({
    segments: state.sim.segments,
    segIdx: state.sim.segIdx,
    segProgress: state.sim.segProgress,
    robotX: state.sim.robotX,
    robotY: state.sim.robotY,
    robotH: state.sim.robotH
  }),
  onFieldChanged: ({ syncStart } = {}) => {
    syncSimGridInputsFromFieldMap();
    if (syncStart) syncSimStartFromFieldStartTile();
    saveFieldMapToStorage();
    rebuildSimAndDraw(!!syncStart);
    if (typeof publishPluginBridgeState === 'function') publishPluginBridgeState('field-map');
  },
  onBackToSim: () => switchMode('visual'),
  appendConsole
});

// ============================================================================
// Simulator Control & Click-to-Seek Simulation (Blocks + Code Lines)
// ============================================================================
function isClickToSeekSimEnabled() {
  return !!codeIde.getSettings().clickToSeekSim;
}

function setSimPlayButtons(playing) {
  const icon = playing ? 'pause' : 'play';
  const label = playing ? 'Pause' : 'Run';
  setBtnContent($('btnSimPlay'), icon, label, 'sm');
  setBtnContent($('btnCodeSimPlay'), icon, label, 'sm');
}

function updateSimActiveVisuals() {
  const activeIdx = state.sim.activeBlockIndex;
  const activeFile = state.activeMissionFile;

  document.querySelectorAll('.mc-block[data-mission]').forEach((blk) => {
    const match = activeIdx >= 0 && blk.dataset.mission === activeFile && Number(blk.dataset.globalIdx) === activeIdx;
    blk.classList.toggle('sim-active', match);
  });

  const pre = $('visualCodePreview');
  if (pre) {
    const code = pre._rawCode ?? state.files[activeFile] ?? '';
    const activeLine = activeIdx >= 0 ? buildMissionLineIndex(activeFile, code).blockToLine.get(activeIdx) : null;
    let activeRow = null;
    pre.querySelectorAll('.preview-code-line').forEach((row) => {
      const isMatch = activeLine != null && Number(row.dataset.line) === activeLine;
      row.classList.toggle('sim-line-active', isMatch);
      if (isMatch) activeRow = row;
    });
    if (activeRow) activeRow.scrollIntoView({ block: 'nearest' });
  }
}

function renderVisualCodePreview(code, filename = state.activeMissionFile) {
  const pre = $('visualCodePreview');
  if (!pre) return;
  const text = String(code || '');
  if (pre._lastSig === `${filename}\0${text}`) {
    updateSimActiveVisuals();
    return;
  }
  pre._lastSig = `${filename}\0${text}`;
  pre._missionFile = filename;
  pre._rawCode = text;

  if (!pre.dataset.seekBound) {
    pre.dataset.seekBound = '1';
    pre.addEventListener('click', (e) => {
      if (!isClickToSeekSimEnabled()) return;
      const row = e.target.closest('.preview-code-line');
      if (!row) return;
      const ln = parseInt(row.dataset.line, 10);
      if (ln > 0) seekSimulationToCodeLine(pre._missionFile || state.activeMissionFile, pre._rawCode || '', ln);
    });
  }

  const lines = text.split('\n');
  const frag = document.createDocumentFragment();
  for (let i = 0; i < lines.length; i++) {
    const row = document.createElement('div');
    row.className = 'preview-code-line';
    row.dataset.line = String(i + 1);
    const lnSpan = document.createElement('span');
    lnSpan.className = 'preview-code-ln';
    lnSpan.textContent = String(i + 1);
    const txtSpan = document.createElement('span');
    txtSpan.className = 'preview-code-text';
    txtSpan.textContent = lines[i] || ' ';
    row.append(lnSpan, txtSpan);
    frag.appendChild(row);
  }
  pre.innerHTML = '';
  pre.appendChild(frag);
  updateSimActiveVisuals();
}

function applySeekPoseForBlock(globalBlockIdx, built = null) {
  const resolvedBuilt = built || buildSimSegments(state);
  const segs = resolvedBuilt.segments;
  state.sim.segments = segs;
  state.sim.stats = resolvedBuilt.stats;

  let lastSegIdx = -1;
  for (let i = 0; i < segs.length; i++) {
    if (segs[i].blockIdx <= globalBlockIdx) lastSegIdx = i;
  }

  if (globalBlockIdx < 0 || lastSegIdx < 0) {
    state.sim.segIdx = 0;
    state.sim.segProgress = 0;
    state.sim.elapsedMs = 0;
    state.sim.robotX = resolvedBuilt.startX;
    state.sim.robotY = resolvedBuilt.startY;
    state.sim.robotH = resolvedBuilt.startH;
    state.sim.activeBlockIndex = globalBlockIdx;
    return;
  }

  const seg = segs[lastSegIdx];
  state.sim.segIdx = lastSegIdx;
  state.sim.segProgress = 1;
  state.sim.elapsedMs = seg.endMs;
  state.sim.robotX = seg.tx;
  state.sim.robotY = seg.ty;
  state.sim.robotH = seg.th;
  state.sim.activeBlockIndex = globalBlockIdx;
}

function seekSimulationToBlock(missionFile, globalBlockIdx, { lineNumber = null } = {}) {
  if (!isClickToSeekSimEnabled()) return;
  state.sim.playing = false;
  if (state.sim.rafId) cancelAnimationFrame(state.sim.rafId);
  setSimPlayButtons(false);

  if (missionFile && state.missions[missionFile] && state.activeMissionFile !== missionFile) {
    setActiveMission(missionFile, false);
  }

  const built = buildSimSegments(state);
  applySeekPoseForBlock(globalBlockIdx, built);

  const hintEl = $('codeSimHint');
  if (hintEl) {
    const fileLabel = missionFile || state.activeMissionFile;
    const totalSegs = built.segments.length;
    const lineTag = lineNumber ? ` · บรรทัด ${lineNumber}` : '';
    if (globalBlockIdx < 0) {
      hintEl.textContent = `${fileLabel}${lineTag} → จุดเริ่มต้น (Start Pose)`;
    } else {
      const stepNum = state.sim.segProgress >= 1 ? state.sim.segIdx + 1 : 0;
      hintEl.textContent = `${fileLabel}${lineTag} → บล็อก #${globalBlockIdx + 1} (Step ${stepNum}/${totalSegs})`;
    }
  }

  updateSimActiveVisuals();
  drawSimulator(state);
}

function seekSimulationToSectionBlock(missionFile, sectionId, stackIdx) {
  if (!isClickToSeekSimEnabled()) return;
  const m = ensureMissionStructure(state.missions[missionFile]);
  if (!m) return;
  let globalIdx = 0;
  let found = -1;
  for (const sec of MISSION_SECTIONS) {
    const list = m.sections[sec.id] || [];
    if (sec.id === sectionId) {
      if (stackIdx >= 0 && stackIdx < list.length) found = globalIdx + stackIdx;
      break;
    }
    globalIdx += list.length;
  }
  if (found >= 0) seekSimulationToBlock(missionFile, found);
}

function seekSimulationToCodeLine(filename, code, lineNumber) {
  if (!isClickToSeekSimEnabled()) return;
  if (!state.missions[filename]) {
    if ($('codeSimHint')) {
      $('codeSimHint').textContent = `ไฟล์ ${filename} ไม่ใช่ไฟล์ภารกิจ (เลือก RunMode1–3.ino เพื่อคลิกจำลอง)`;
    }
    return;
  }
  if (typeof code === 'string' && state.files[filename] !== code) {
    state.files[filename] = code;
  }
  parseMissionFile(filename);
  const resolved = resolveBlockIndexForCodeLine(filename, state.files[filename] || code || '', lineNumber);
  seekSimulationToBlock(filename, resolved.globalBlockIdx, { lineNumber });
}

function rebuildSimAndDraw(resetPose = true) {
  const built = buildSimSegments(state);
  state.sim.segments = built.segments;
  state.sim.stats = built.stats;
  if (resetPose) {
    state.sim.playing = false;
    if (state.sim.rafId) cancelAnimationFrame(state.sim.rafId);
    state.sim.segIdx = 0;
    state.sim.segProgress = 0;
    state.sim.elapsedMs = 0;
    state.sim.robotX = built.startX;
    state.sim.robotY = built.startY;
    state.sim.robotH = built.startH;
    state.sim.activeBlockIndex = -1;
    setSimPlayButtons(false);
    renderCanvas();
  } else if (!state.sim.playing && state.sim.activeBlockIndex >= 0 && isClickToSeekSimEnabled()) {
    applySeekPoseForBlock(state.sim.activeBlockIndex, built);
    updateSimActiveVisuals();
  }
  drawSimulator(state);
}

function toggleSimPlay() {
  if (state.sim.playing) {
    state.sim.playing = false;
    setSimPlayButtons(false);
    return;
  }
  const segs = state.sim.segments;
  if (segs.length === 0 || state.sim.segIdx >= segs.length || (state.sim.segIdx === segs.length - 1 && state.sim.segProgress >= 1)) {
    rebuildSimAndDraw(true);
  } else if (state.sim.segProgress >= 1) {
    state.sim.segIdx++;
    state.sim.segProgress = 0;
  }
  state.sim.playing = true;
  state.sim.lastTs = 0;
  setSimPlayButtons(true);
  state.sim.rafId = requestAnimationFrame(stepSimulatorFrame);
}

function stepSimOnce() {
  state.sim.playing = false;
  setSimPlayButtons(false);
  if (state.sim.segProgress >= 1) {
    state.sim.segIdx++;
    state.sim.segProgress = 0;
  }
  if (state.sim.segIdx >= state.sim.segments.length) {
    rebuildSimAndDraw(true);
    return;
  }
  const seg = state.sim.segments[state.sim.segIdx];
  state.sim.robotX = seg.tx;
  state.sim.robotY = seg.ty;
  state.sim.robotH = seg.th;
  state.sim.elapsedMs = seg.endMs;
  state.sim.activeBlockIndex = seg.blockIdx;
  state.sim.segIdx++;
  state.sim.segProgress = 0;
  updateSimActiveVisuals();
  drawSimulator(state);
}

function resetSimPose() {
  rebuildSimAndDraw(true);
}

function stepSimulatorFrame(ts) {
  if (!state.sim.playing) return;
  const segs = state.sim.segments;
  if (state.sim.segIdx >= segs.length) {
    state.sim.playing = false;
    setSimPlayButtons(false);
    state.sim.activeBlockIndex = -1;
    updateSimActiveVisuals();
    drawSimulator(state);
    return;
  }

  const dt = state.sim.lastTs ? ts - state.sim.lastTs : 16;
  state.sim.lastTs = ts;
  const speedMul = Number($('simSpeedMul')?.value) || 1;
  const seg = segs[state.sim.segIdx];

  if (state.sim.activeBlockIndex !== seg.blockIdx) {
    state.sim.activeBlockIndex = seg.blockIdx;
    updateSimActiveVisuals();
  }

  state.sim.segProgress += (dt * speedMul) / Math.max(80, seg.dur);
  if (state.sim.segProgress >= 1) {
    state.sim.robotX = seg.tx;
    state.sim.robotY = seg.ty;
    state.sim.robotH = seg.th;
    state.sim.elapsedMs = seg.endMs;
    state.sim.segIdx++;
    state.sim.segProgress = 0;
  } else {
    const t = state.sim.segProgress;
    const pose = evalSegmentPose(seg, t);
    state.sim.robotX = pose.x;
    state.sim.robotY = pose.y;
    state.sim.robotH = pose.h;
    state.sim.elapsedMs = seg.startMs + seg.dur * t;
  }

  drawSimulator(state);
  state.sim.rafId = requestAnimationFrame(stepSimulatorFrame);
}

// ============================================================================
// Save, Compile, Offline WebSerial Upload, Host COM Flash & Calibration Reader
// ============================================================================
function buildCurrentCanvasLayout() {
  return {
    activeMissionFile: state.activeMissionFile,
    zoomPct: state.zoomPct,
    missions: Object.fromEntries(MISSION_DEFS.map((d) => {
      const m = ensureMissionStructure(state.missions[d.file]);
      return [d.file, {
        placed: !!m.placed,
        x: Math.round(m.x),
        y: Math.round(m.y),
        folded: !!m.folded,
        activeSection: m.activeSection || 'Box1',
        foldedSections: m.foldedSections || {}
      }];
    })),
    looseBlocks: state.looseBlocks
  };
}

function buildBlockSummary() {
  return MISSION_DEFS.map((d) => `M${d.file.match(/\d/)?.[0]}:${getMissionTotalCount(state.missions[d.file])}`).join(' · ');
}

async function saveFiles(silent = false, viaAutoSave = false, saveSource = null) {
  const shouldLog = !viaAutoSave;
  const payload = { files: state.files };
  if (shouldLog) {
    payload.recordSaveLog = true;
    payload.saveSource = saveSource || 'manual';
    payload.canvasLayout = buildCurrentCanvasLayout();
    payload.calibration = state.calibration;
    payload.simSettings = getCurrentSimSettings();
    payload.blockSummary = buildBlockSummary();
  }
  const data = await apiJson('/api/files', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  state.files = data.files;
  state.savedFiles = { ...data.files };
  state.config = data.config || {};
  syncCalibrationFromConfig();
  updateDirtyIndicator();
  if (data.versions) {
    syncVersionListResponse(data);
  }
  if ($('autoSaveStatusText')) {
    const t = new Date().toLocaleTimeString('th-TH', { hour12: false });
    $('autoSaveStatusText').textContent = viaAutoSave ? `Auto-saved ${t}` : `Saved ${t}`;
    $('autoSaveStatusText').classList.remove('dirty', 'off');
  }
  if (!silent) {
    if (data.subVersion) {
      const filesList = (data.subVersion.changedFiles || []).join(', ');
      appendConsole(`[OK] บันทึกไฟล์แล้ว · เก็บ Log เวอร์ชันย่อย ${data.subVersion.versionLabel} (${filesList})`);
    } else {
      appendConsole('[OK] บันทึกไฟล์ลงโปรเจกต์เรียบร้อยแล้ว (ไม่มีการเปลี่ยนแปลงใหม่จากเวอร์ชันล่าสุด)');
    }
  }
}

function updateMeters(flash, ram) {
  if (flash && flash.percent !== null) {
    $('flashBar').style.width = `${flash.percent}%`;
    $('flashText').textContent = `${flash.percent}% (${Math.round(flash.used / 1024)} KB)`;
  }
  if (ram && ram.percent !== null) {
    $('ramBar').style.width = `${ram.percent}%`;
    $('ramText').textContent = `${ram.percent}% (${Math.round(ram.used / 1024)} KB)`;
  }
}

function renderArtifacts() {
  const container = $('artifactsList');
  if (!container) return;
  if (!state.artifacts || state.artifacts.length === 0) {
    container.innerHTML = '<p class="muted">ยังไม่มีไฟล์ไบนารี — กด Verify &amp; Compile เพื่อสร้าง .bin</p>';
    return;
  }
  container.innerHTML = '';
  for (const art of state.artifacts) {
    const a = document.createElement('a');
    a.className = 'artifact-chip';
    a.href = art.url;
    a.download = art.name;
    a.innerHTML = `${svgIcon('download', 'sm')}<span>${escapeHtml(art.name)}</span><span class="muted">(${Math.round(art.size / 1024)} KB)</span>`;
    container.appendChild(a);
  }
}

async function compileProject() {
  if (state.compiling) return false;
  state.compiling = true;
  $('btnCompile').disabled = true;
  setBtnContent($('btnCompile'), 'refresh', 'Compiling...');
  activateDrawerTab('console');
  appendConsole('=== เริ่มคอมไพล์เฟิร์มแวร์ด้วย Arduino CLI (PTBOT_ESP32:esp32:atom_vx) ===', true);

  try {
    await saveFiles(true, false, 'compile');
    const res = await apiJson('/api/compile', { method: 'POST', body: JSON.stringify({}) });
    appendConsole(res.log || '(no compiler output)');
    updateMeters(res.flash, res.ram);
    state.artifacts = res.artifacts || [];
    renderArtifacts();

    if (res.ok) {
      appendConsole(`\n[OK] คอมไพล์สำเร็จใน ${(res.durationMs / 1000).toFixed(1)} วินาที! พร้อมอัปโหลดลงบอร์ด`);
      return true;
    }
    appendConsole(`\n[ERR] คอมไพล์ไม่สำเร็จ (Exit code ${res.exitCode})`);
    return false;
  } catch (err) {
    appendConsole(`\n[ERR] เกิดข้อผิดพลาดขณะคอมไพล์: ${err.message}`);
    return false;
  } finally {
    state.compiling = false;
    $('btnCompile').disabled = false;
    setBtnContent($('btnCompile'), 'check', 'Verify & Compile');
  }
}

async function refreshHostPorts() {
  const select = $('hostPortSelect');
  if (!select) return;
  const prev = select.value;
  try {
    const data = await apiJson('/api/ports');
    select.innerHTML = '<option value="">COM Port</option>';
    for (const p of data.ports || []) {
      const opt = document.createElement('option');
      opt.value = p.address;
      opt.textContent = p.label ? `${p.address} (${p.label})` : p.address;
      select.appendChild(opt);
    }
    if (prev) select.value = prev;
    if (!select.value && data.ports?.length) {
      if (data.ports.length === 1) {
        select.value = data.ports[0].address;
      } else {
        const usbPorts = data.ports.filter((p) => /cp210|ch340|ch9102|ftdi|usb|esp32|silicon labs/i.test(p.label || ''));
        if (usbPorts.length === 1) select.value = usbPorts[0].address;
      }
    }
  } catch (err) {
    appendConsole(`[WARN] อ่านรายการพอร์ตไม่ได้: ${err.message}`);
  }
}

async function hostUpload() {
  let port = $('hostPortSelect').value;
  if (!port) {
    await refreshHostPorts();
    port = $('hostPortSelect').value;
  }
  if (!port) {
    appendConsole('[ERR] กรุณาเลือก COM / ttyUSB Port ด้านบนก่อนกด Host Flash');
    activateDrawerTab('console');
    return;
  }
  await disconnectSerialMonitor();
  activateDrawerTab('console');

  $('btnHostUpload').disabled = true;
  setBtnContent($('btnHostUpload'), 'refresh', 'Compiling...');

  try {
    const ok = await compileProject();
    if (!ok) return;

    setBtnContent($('btnHostUpload'), 'refresh', 'Flashing...');
    appendConsole(`\n=== กำลังอัปโหลดเฟิร์มแวร์ผ่านพอร์ต ${port} ===`);

    const res = await apiJson('/api/upload', { method: 'POST', body: JSON.stringify({ port }) });
    appendConsole(res.log || '');
    appendConsole(res.ok ? `\n[OK] อัปโหลดสำเร็จใน ${(res.durationMs / 1000).toFixed(1)} วินาที` : `\n[ERR] อัปโหลดล้มเหลว (Exit ${res.exitCode})`);
  } catch (err) {
    appendConsole(`\n[ERR] อัปโหลดล้มเหลว: ${err.message}`);
  } finally {
    $('btnHostUpload').disabled = false;
    setBtnContent($('btnHostUpload'), 'upload', 'Host Flash');
  }
}

async function fetchBinaryString(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ดาวน์โหลด ${url} ไม่สำเร็จ`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let str = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    str += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
  }
  return str;
}

async function webSerialUpload() {
  if (!('serial' in navigator)) {
    appendConsole('[ERR] เบราว์เซอร์นี้ไม่รองรับ WebSerial — กรุณาใช้ Chrome/Edge หรือปุ่ม Host Flash');
    activateDrawerTab('console');
    return;
  }

  let port = null;
  try {
    activateDrawerTab('console');
    appendConsole('\n=== เลือกบอร์ด PTBOT Atom VX (USB Serial) บนหน้าต่างเบราว์เซอร์ ===');
    // Request port immediately under fresh click gesture before 30s compilation
    port = await navigator.serial.requestPort();

    $('btnWebUpload').disabled = true;
    setBtnContent($('btnWebUpload'), 'refresh', 'Compiling...');

    const ok = await compileProject();
    if (!ok) return;

    setBtnContent($('btnWebUpload'), 'refresh', 'Flashing...');
    await ensureHostSerialPortReleased();

    appendConsole('กำลังโหลด Offline ESP32 Flasher (src/vendor/esptool-js.bundle.js)...');
    const esptool = await import('./vendor/esptool-js.bundle.js');
    const transport = new esptool.Transport(port, true);

    const terminal = {
      clean() {},
      writeLine(data) { appendConsole(data); },
      write(data) { appendConsole(data); }
    };

    const loader = new esptool.ESPLoader({ transport, baudrate: 460800, romBaudrate: 115200, terminal });
    appendConsole('กำลังเชื่อมต่อ Bootloader (หากค้างให้กดปุ่ม BOOT บนบอร์ด)...');
    const chip = await loader.main();
    appendConsole(`เชื่อมต่อชิปสำเร็จ: ${chip}`);

    const fileArray = [];
    const merged = state.artifacts.find((a) => a.name.endsWith('.merged.bin'));
    if (merged) {
      fileArray.push({ data: await fetchBinaryString(merged.url), address: 0x0 });
    } else {
      const boot = state.artifacts.find((a) => a.name.endsWith('.bootloader.bin'));
      const part = state.artifacts.find((a) => a.name.endsWith('.partitions.bin'));
      const otadata = state.artifacts.find((a) => a.name === 'boot_app0.bin');
      const app = state.artifacts.find((a) => a.name === 'KT_ATOM_Middle.ino.bin');
      if (boot) fileArray.push({ data: await fetchBinaryString(boot.url), address: 0x1000 });
      if (part) fileArray.push({ data: await fetchBinaryString(part.url), address: 0x8000 });
      if (otadata) fileArray.push({ data: await fetchBinaryString(otadata.url), address: 0xe000 });
      if (app) fileArray.push({ data: await fetchBinaryString(app.url), address: 0x10000 });
    }

    if (fileArray.length === 0) throw new Error('ไม่พบไฟล์ .bin สำหรับแฟลช');

    appendConsole('กำลังเขียนโปรแกรมลง Flash ESP32...');
    let lastLoggedPct = -1;
    await loader.writeFlash({
      fileArray,
      flashSize: 'keep',
      flashMode: 'keep',
      flashFreq: 'keep',
      eraseAll: false,
      compress: true,
      reportProgress(fileIndex, written, total) {
        const pct = Math.floor((written / total) * 100);
        if (pct % 10 === 0 && pct !== lastLoggedPct) {
          lastLoggedPct = pct;
          appendConsole(`  [File ${fileIndex + 1}/${fileArray.length}] ${pct}%`);
        }
      }
    });

    await loader.hardReset();
    await transport.disconnect();
    appendConsole('\n[OK] อัปโหลดผ่าน USB (Offline WebSerial) สำเร็จ! บอร์ดรีบูตแล้ว');
  } catch (err) {
    appendConsole(`\n[ERR] WebSerial Upload ล้มเหลว: ${err.message}`);
    try { if (port) await port.close(); } catch (_) {}
  } finally {
    $('btnWebUpload').disabled = false;
    setBtnContent($('btnWebUpload'), 'usb', 'USB Upload');
  }
}

// ============================================================================
// Live Robot Calibration Reader & Config Modal
// ============================================================================
function tryExtractCalibrationFromLine(line) {
  const m = line.match(/KT_CAL:(\{.*\})/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (_) { return null; }
}

async function sendTextToPort(port, text) {
  if (!port || !port.writable) return;
  const writer = port.writable.getWriter();
  try { await writer.write(new TextEncoder().encode(text)); } finally { writer.releaseLock(); }
}

async function ensureHostSerialPortReleased() {
  await disconnectSerialMonitor();
  try {
    await fetch('/api/release-port', { method: 'POST' });
  } catch (_) {}
}

function isRecoverableSerialError(err) {
  const name = err?.name || '';
  const msg = err?.message || '';
  return (
    name === 'BufferOverrunError' ||
    name === 'FramingError' ||
    name === 'BreakError' ||
    name === 'ParityError' ||
    /buffer overrun|framing|break|parity/i.test(msg)
  );
}

async function openWebSerialPortSafe(port, baudRate = 115200) {
  const opts = { baudRate, bufferSize: 32768 };
  try {
    await port.open(opts);
  } catch (err) {
    if (err.name === 'InvalidStateError' || /already open/i.test(err.message || '')) {
      try { await port.close(); } catch (_) {}
      await new Promise((r) => setTimeout(r, 150));
      await port.open(opts);
      return;
    }
    if (/Failed to open serial port|Access denied|busy|in use/i.test(err.message || '')) {
      throw new Error(
        `เปิดพอร์ตไม่สำเร็จ (${err.message}) — กรุณาปิด Serial Monitor ในแท็บเบราว์เซอร์อื่น / Arduino IDE แล้วลองใหม่ หรือกด "ซิงค์จากหุ่น (COM)"`
      );
    }
    throw err;
  }
}

async function closeWebSerialReaderAndPort(port, reader) {
  try { if (reader) await reader.cancel(); } catch (_) {}
  try { if (reader) reader.releaseLock(); } catch (_) {}
  try { if (port) await port.close(); } catch (_) {}
}

async function readCalibrationWebSerial() {
  if (!('serial' in navigator)) {
    appendConsole('[ERR] เบราว์เซอร์นี้ไม่รองรับ WebSerial — ใช้ซิงค์จาก COM หรือ Config.ino แทนได้');
    return;
  }
  $('btnReadCalWebSerial').disabled = true;
  setBtnContent($('btnReadCalWebSerial'), 'refresh', 'กำลังอ่าน...', 'sm');

  if (state.serialPort) {
    try {
      const waitPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { state.serialCalWaiter = null; reject(new Error('หมดเวลา 7.5 วินาที ยังไม่ได้รับ KT_CAL จากหุ่น')); }, 7500);
        state.serialCalWaiter = (cal) => { clearTimeout(timer); state.serialCalWaiter = null; resolve(cal); };
      });
      await sendTextToPort(state.serialPort, 'GET_CAL\n');
      const retryTimer = setInterval(() => {
        if (state.serialPort && state.serialCalWaiter) {
          sendTextToPort(state.serialPort, 'GET_CAL\n').catch(() => {});
        }
      }, 600);
      let cal;
      try {
        cal = await waitPromise;
      } finally {
        clearInterval(retryTimer);
      }
      applyLiveCalibration(cal, 'Live USB');
      appendConsole(`[OK] ซิงค์ค่า Calibration จากหุ่นสำเร็จ: tpcm=${cal.tpcm}, calms=${cal.calms}ms`);
    } catch (err) {
      appendConsole(`[ERR] อ่านค่าผ่าน USB ไม่สำเร็จ: ${err.message}`);
    } finally {
      $('btnReadCalWebSerial').disabled = false;
      setBtnContent($('btnReadCalWebSerial'), 'usb', 'ซิงค์จากหุ่น (USB)', 'sm');
    }
    return;
  }

  let port = null;
  let reader = null;
  try {
    port = await navigator.serial.requestPort();
    await ensureHostSerialPortReleased();
    await openWebSerialPortSafe(port, 115200);
    await port.setSignals({ dataTerminalReady: false, requestToSend: false }).catch(() => {});

    // Attach reader immediately before sending GET_CAL so 32KB RX buffer drains from millisecond 0
    const decoder = new TextDecoder('utf-8', { fatal: false });
    reader = port.readable ? port.readable.getReader() : null;
    await sendTextToPort(port, 'GET_CAL\n').catch(() => {});

    let buf = '';
    const deadline = Date.now() + 7500;
    let lastSendAt = Date.now();
    let found = null;
    let pendingRead = null;

    while (Date.now() < deadline) {
      if (!reader && port.readable) {
        reader = port.readable.getReader();
        pendingRead = null;
      }
      if (!reader) break;

      if (Date.now() - lastSendAt >= 600) {
        lastSendAt = Date.now();
        await sendTextToPort(port, 'GET_CAL\n').catch(() => {});
      }

      if (!pendingRead) {
        pendingRead = reader.read();
      }

      let timerId = null;
      let res;
      try {
        res = await Promise.race([
          pendingRead.then((v) => ({ timeout: false, ...v })),
          new Promise((r) => { timerId = setTimeout(() => r({ timeout: true }), 250); })
        ]);
      } catch (readErr) {
        if (timerId) clearTimeout(timerId);
        pendingRead = null;
        if (isRecoverableSerialError(readErr)) {
          try { reader.releaseLock(); } catch (_) {}
          reader = port.readable ? port.readable.getReader() : null;
          lastSendAt = Date.now();
          await sendTextToPort(port, 'GET_CAL\n').catch(() => {});
          continue;
        }
        throw readErr;
      }
      if (timerId) clearTimeout(timerId);

      if (res.timeout) continue;
      pendingRead = null;

      if (res.done) {
        try { reader.releaseLock(); } catch (_) {}
        reader = port.readable ? port.readable.getReader() : null;
        if (!reader) break;
        continue;
      }
      if (res.value) {
        buf += decoder.decode(res.value, { stream: true });
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() || '';
        for (const line of lines) {
          const parsed = tryExtractCalibrationFromLine(line);
          if (parsed) { found = parsed; break; }
        }
        if (!found && buf) {
          const partialParsed = tryExtractCalibrationFromLine(buf);
          if (partialParsed) found = partialParsed;
        }
        if (found) break;
      }
    }
    await closeWebSerialReaderAndPort(port, reader);
    reader = null;
    port = null;
    if (!found) throw new Error('ไม่พบข้อมูล KT_CAL');
    applyLiveCalibration(found, 'Live USB');
    appendConsole(`[OK] ซิงค์ค่า Calibration ผ่าน USB สำเร็จ: tpcm=${found.tpcm}, calms=${found.calms}ms`);
  } catch (err) {
    await closeWebSerialReaderAndPort(port, reader);
    reader = null;
    port = null;
    if (err?.name !== 'NotFoundError') {
      let comPort = $('hostPortSelect')?.value || '';
      if (!comPort) {
        await refreshHostPorts();
        comPort = $('hostPortSelect')?.value || '';
      }
      if (comPort) {
        try {
          appendConsole(`[INFO] WebSerial ติดขัด (${err.message}) — กำลังซิงค์ผ่าน ${comPort} อัตโนมัติ...`);
          await new Promise((r) => setTimeout(r, 250));
          const res = await apiJson('/api/read-calibration', { method: 'POST', body: JSON.stringify({ port: comPort }) });
          if (res.ok && res.calibration) {
            applyLiveCalibration(res.calibration, `COM (${comPort})`);
            appendConsole(`[OK] ซิงค์ค่า Calibration จาก ${comPort} สำเร็จ: tpcm=${res.calibration.tpcm}, calms=${res.calibration.calms}ms`);
            return;
          }
          if (res?.error) appendConsole(`[WARN] ซิงค์ผ่าน ${comPort} ไม่สำเร็จ: ${res.error}`);
        } catch (fallbackErr) {
          appendConsole(`[WARN] ซิงค์ผ่าน ${comPort} ผิดพลาด: ${fallbackErr.message}`);
        }
      }
    }
    appendConsole(`[ERR] อ่านค่า Calibration ผ่าน USB ไม่สำเร็จ: ${err.message}`);
  } finally {
    $('btnReadCalWebSerial').disabled = false;
    setBtnContent($('btnReadCalWebSerial'), 'usb', 'ซิงค์จากหุ่น (USB)', 'sm');
  }
}

async function readCalibrationHostCom() {
  let port = $('hostPortSelect').value;
  if (!port) { await refreshHostPorts(); port = $('hostPortSelect').value; }
  if (!port) { appendConsole('[ERR] กรุณาเลือก Host COM Port ด้านบนก่อนกดซิงค์จาก COM'); return; }
  await disconnectSerialMonitor();

  $('btnReadCalHostCom').disabled = true;
  setBtnContent($('btnReadCalHostCom'), 'refresh', 'กำลังอ่าน...', 'sm');
  try {
    const res = await apiJson('/api/read-calibration', { method: 'POST', body: JSON.stringify({ port }) });
    if (!res.ok || !res.calibration) throw new Error(res.error || 'ไม่ได้รับ KT_CAL จากหุ่น');
    applyLiveCalibration(res.calibration, `COM (${port})`);
    appendConsole(`[OK] ซิงค์ค่า Calibration จาก ${port} สำเร็จ: tpcm=${res.calibration.tpcm}, calms=${res.calibration.calms}ms`);
  } catch (err) {
    appendConsole(`[ERR] อ่านค่า COM Calibration ล้มเหลว: ${err.message}`);
  } finally {
    $('btnReadCalHostCom').disabled = false;
    setBtnContent($('btnReadCalHostCom'), 'serial', 'ซิงค์จากหุ่น (COM)', 'sm');
  }
}

async function syncCalFromConfigIno() {
  try {
    const filesRes = await apiJson('/api/files');
    state.files['Config.ino'] = filesRes.files['Config.ino'];
    state.savedFiles['Config.ino'] = filesRes.files['Config.ino'];
    state.config = filesRes.config || {};
    syncCalibrationFromConfig(true);
    rebuildSimAndDraw(true);
    if (!$('configModal').hidden) openConfigModal();
    appendConsole(`[OK] ดึงค่าคาลิเบรตจาก Config.ino แล้ว: tpcm=${state.calibration.tpcm}, calms=${state.calibration.calms}ms`);
  } catch (err) {
    appendConsole(`[ERR] ดึงค่าจาก Config.ino ไม่สำเร็จ: ${err.message}`);
  }
}

async function applyCalToConfigIno() {
  const cal = state.calibration;
  const patch = {
    ticksPerCm: Number(cal.tpcm) || 125.4,
    distTuneMm: Math.round(Number(cal.distmm) || 0),
    calRun30cmMs: Math.max(150, Math.round(Number(cal.calms) || 1150)),
    motorTrim: Math.round(Number(cal.trim) || 0),
    frontLock: Math.round(Number(cal.flock) || 90),
    frontDrop: Math.round(Number(cal.fdrop) || 140),
    backLock: Math.round(Number(cal.block) || 90),
    backDrop: Math.round(Number(cal.bdrop) || 140),
    showCmdOnRun: !!cal.showcmd,
    beepOnCmd: !!cal.beepcmd,
    spinKp: Number.isFinite(Number(cal.spinkp)) ? Number(cal.spinkp) : DEFAULT_MOTION_CONFIG.spinKp,
    spinKd: Number.isFinite(Number(cal.spinkd)) ? Number(cal.spinkd) : DEFAULT_MOTION_CONFIG.spinKd,
    turnFrontKp: Number.isFinite(Number(cal.tfkp)) ? Number(cal.tfkp) : DEFAULT_MOTION_CONFIG.turnFrontKp,
    turnFrontKd: Number.isFinite(Number(cal.tfkd)) ? Number(cal.tfkd) : DEFAULT_MOTION_CONFIG.turnFrontKd,
    turnBackKp: Number.isFinite(Number(cal.tbkp)) ? Number(cal.tbkp) : DEFAULT_MOTION_CONFIG.turnBackKp,
    turnBackKd: Number.isFinite(Number(cal.tbkd)) ? Number(cal.tbkd) : DEFAULT_MOTION_CONFIG.turnBackKd,
    threshold_spinDegree: Number.isFinite(Number(cal.tspin)) ? Number(cal.tspin) : DEFAULT_MOTION_CONFIG.threshold_spinDegree,
    spinLeftOffsetDeg: Number.isFinite(Number(cal.slofs)) ? Number(cal.slofs) : DEFAULT_MOTION_CONFIG.spinLeftOffsetDeg,
    smallAngle_turnDegree: Number.isFinite(Number(cal.tturn)) ? Number(cal.tturn) : DEFAULT_MOTION_CONFIG.smallAngle_turnDegree,
    turnRightOffsetDeg: Number.isFinite(Number(cal.trofs)) ? Number(cal.trofs) : DEFAULT_MOTION_CONFIG.turnRightOffsetDeg,
    smallAngle_threshold: Number.isFinite(Number(cal.sathr)) ? Number(cal.sathr) : DEFAULT_MOTION_CONFIG.smallAngle_threshold,
    spinMaxSpeed: Math.round(Number.isFinite(Number(cal.smaxs)) ? Number(cal.smaxs) : DEFAULT_MOTION_CONFIG.spinMaxSpeed),
    turnFrontMaxSpeed: Math.round(Number.isFinite(Number(cal.tfmax)) ? Number(cal.tfmax) : DEFAULT_MOTION_CONFIG.turnFrontMaxSpeed),
    turnBackMaxSpeed: Math.round(Number.isFinite(Number(cal.tbmax)) ? Number(cal.tbmax) : DEFAULT_MOTION_CONFIG.turnBackMaxSpeed)
  };
  if (Array.isArray(cal.smin) && cal.smin.length === 4) patch.senMin = cal.smin.map((n) => Math.round(Number(n) || 0));
  if (Array.isArray(cal.smax) && cal.smax.length === 4) patch.senMax = cal.smax.map((n) => Math.round(Number(n) || 0));
  if (Array.isArray(cal.sthr) && cal.sthr.length === 4) patch.senThresh = cal.sthr.map((n) => Math.round(Number(n) || 0));
  try {
    const data = await apiJson('/api/files', { method: 'POST', body: JSON.stringify({ configPatch: patch }) });
    state.files['Config.ino'] = data.files['Config.ino'];
    state.savedFiles['Config.ino'] = data.files['Config.ino'];
    state.config = data.config || {};
    syncCalibrationFromConfig(true);
    if (state.activeCodeFile === 'Config.ino') codeIde.loadFileIntoEditor('Config.ino', state.files['Config.ino']);
    updateDirtyIndicator();
    if (!$('configModal').hidden) openConfigModal();
    appendConsole('[OK] นำค่า Calibration และจูน Spin/Turn ที่ซิงค์บันทึกลง Config.ino เรียบร้อยแล้ว');
  } catch (err) {
    appendConsole(`[ERR] บันทึกลง Config.ino ไม่สำเร็จ: ${err.message}`);
  }
}

async function pullCalibrationSmart() {
  if (state.serialPort) {
    await readCalibrationWebSerial();
    return;
  }
  const comPort = $('hostPortSelect')?.value;
  if (comPort) {
    await readCalibrationHostCom();
    return;
  }
  await readCalibrationWebSerial();
}

async function toggleSerialMonitor() {
  if (state.serialPort) { await disconnectSerialMonitor(); return; }
  if (!('serial' in navigator)) { $('serialStatus').textContent = 'WebSerial unsupported (Use Chrome/Edge)'; return; }
  try {
    const port = await navigator.serial.requestPort();
    await ensureHostSerialPortReleased();
    await openWebSerialPortSafe(port, 115200);
    await port.setSignals({ dataTerminalReady: false, requestToSend: false }).catch(() => {});
    state.serialPort = port;
    state.serialKeepReading = true;
    state.serialLineBuf = '';
    setBtnContent($('btnSerialConnect'), 'close', 'Disconnect', 'sm');
    $('serialStatus').textContent = 'Connected @ 115200 baud';

    const decoder = new TextDecoder('utf-8', { fatal: false });
    let reader = port.readable ? port.readable.getReader() : null;
    state.serialReader = reader;

    while (state.serialKeepReading) {
      if (!reader && state.serialPort?.readable) {
        reader = state.serialPort.readable.getReader();
        state.serialReader = reader;
      }
      if (!reader) break;

      let result;
      try {
        result = await reader.read();
      } catch (readErr) {
        if (isRecoverableSerialError(readErr) && state.serialKeepReading && state.serialPort?.readable) {
          try { reader.releaseLock(); } catch (_) {}
          reader = state.serialPort.readable.getReader();
          state.serialReader = reader;
          continue;
        }
        throw readErr;
      }

      const { value, done } = result;
      if (done) {
        try { reader.releaseLock(); } catch (_) {}
        reader = state.serialKeepReading && state.serialPort?.readable ? state.serialPort.readable.getReader() : null;
        state.serialReader = reader;
        if (!reader) break;
        continue;
      }
      if (value) {
        const text = decoder.decode(value, { stream: true });
        appendSerial(text);
        state.serialLineBuf += text;
        const lines = state.serialLineBuf.split(/\r?\n/);
        state.serialLineBuf = lines.pop() || '';
        for (const line of lines) {
          const parsed = tryExtractCalibrationFromLine(line);
          if (parsed) {
            applyLiveCalibration(parsed, 'Live Serial');
            if (state.serialCalWaiter) {
              state.serialCalWaiter(parsed);
            } else {
              const msg = '[OK] รับค่าที่จูนจากหุ่นเรียบร้อย (กด "บันทึกลง Config.ino" เพื่อบันทึกถาวร)';
              appendSerial(`\n${msg}\n`);
              appendConsole(msg);
            }
          }
        }
      }
    }
  } catch (err) {
    appendSerial(`\n[Serial Error] ${err.message}\n`);
    await disconnectSerialMonitor();
  }
}

async function disconnectSerialMonitor() {
  state.serialKeepReading = false;
  try { if (state.serialReader) await state.serialReader.cancel(); } catch (_) {}
  try { if (state.serialReader) state.serialReader.releaseLock(); } catch (_) {}
  try { if (state.serialPort) await state.serialPort.close(); } catch (_) {}
  state.serialReader = null;
  state.serialPort = null;
  state.serialCalWaiter = null;
  setBtnContent($('btnSerialConnect'), 'usb', 'Connect Serial (115200)', 'sm');
  if ($('serialStatus')) $('serialStatus').textContent = 'Disconnected';
}

function createConfigRow(field, onToggleChange = null) {
  const row = document.createElement('div');
  row.className = 'cfg-row';
  const info = document.createElement('div');
  info.className = 'cfg-row-info';
  const lbl = document.createElement('label');
  lbl.textContent = field.label;
  info.appendChild(lbl);
  if (field.hint) {
    const small = document.createElement('small');
    small.textContent = field.hint;
    info.appendChild(small);
  }
  row.appendChild(info);

  const ctrlWrap = document.createElement('div');
  ctrlWrap.className = 'cfg-row-control';
  if (field.type === 'bool') {
    const checked = state.config[field.key] !== undefined ? !!state.config[field.key] : !!field.default;
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'm-switch';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', checked ? 'true' : 'false');
    sw.dataset.cfgKey = field.key;
    sw.innerHTML = `<span class="m-switch-track"><span class="m-switch-thumb"></span></span><span class="m-switch-lbl">${checked ? 'เปิด (true)' : 'ปิด (false)'}</span>`;
    sw.onclick = () => {
      const next = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', next ? 'true' : 'false');
      sw.querySelector('.m-switch-lbl').textContent = next ? 'เปิด (true)' : 'ปิด (false)';
      if (onToggleChange) onToggleChange(next);
    };
    ctrlWrap.appendChild(sw);
  } else {
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.dataset.cfgKey = field.key;
    if (field.min !== undefined) inp.min = field.min;
    if (field.max !== undefined) inp.max = field.max;
    if (field.step !== undefined) inp.step = field.step;
    inp.value = state.config[field.key] ?? (field.default ?? 0);
    ctrlWrap.appendChild(inp);
  }
  row.appendChild(ctrlWrap);
  return row;
}

function openConfigModal() {
  renderCalibrationCard();
  const body = $('configFormGrid');
  body.innerHTML = '';
  let overwriteGroup = null;

  for (const sec of CONFIG_SECTIONS) {
    const heading = document.createElement('div');
    heading.className = 'cfg-section-title';
    heading.textContent = sec.title;
    body.appendChild(heading);

    const secFields = CONFIG_FIELDS.filter((f) => f.section === sec.id);
    if (sec.id === 'overwrite') {
      overwriteGroup = document.createElement('div');
      overwriteGroup.id = 'cfgOverwriteGroup';
      overwriteGroup.className = 'cfg-overwrite-group';
      overwriteGroup.hidden = !(state.config.forceOverwriteFlashFromCode);
      const toggleField = secFields.find((f) => f.isToggle);
      if (toggleField) {
        body.appendChild(createConfigRow(toggleField, (isEnabled) => { overwriteGroup.hidden = !isEnabled; }));
      }
      for (const field of secFields.filter((f) => f.requiresOverwrite)) overwriteGroup.appendChild(createConfigRow(field));
      body.appendChild(overwriteGroup);
    } else {
      for (const field of secFields) body.appendChild(createConfigRow(field));
    }
  }
  $('configModal').hidden = false;
}

async function commitConfigPatch(patch, saveNote, okMessage, closeAfterSave) {
  const data = await apiJson('/api/files', {
    method: 'POST',
    body: JSON.stringify({
      configPatch: patch,
      recordSaveLog: true,
      saveSource: 'config',
      saveNote,
      canvasLayout: buildCurrentCanvasLayout(),
      calibration: state.calibration,
      simSettings: getCurrentSimSettings(),
      blockSummary: buildBlockSummary()
    })
  });
  state.files['Config.ino'] = data.files['Config.ino'];
  state.savedFiles['Config.ino'] = data.files['Config.ino'];
  if (data.files['KT_ATOM_Middle.ino'] !== undefined) {
    state.files['KT_ATOM_Middle.ino'] = data.files['KT_ATOM_Middle.ino'];
    state.savedFiles['KT_ATOM_Middle.ino'] = data.files['KT_ATOM_Middle.ino'];
  }
  state.config = data.config || {};
  syncCalibrationFromConfig(true);
  if (state.activeCodeFile === 'Config.ino' || state.activeCodeFile === 'KT_ATOM_Middle.ino') {
    codeIde.loadFileIntoEditor(state.activeCodeFile, state.files[state.activeCodeFile]);
  }
  updateDirtyIndicator();
  if (data.versions) syncVersionListResponse(data);
  if (closeAfterSave) $('configModal').hidden = true;
  else openConfigModal();
  rebuildSimAndDraw(false);
  const subNote = data.subVersion ? ` · เก็บ Log ${data.subVersion.versionLabel}` : '';
  appendConsole(`${okMessage}${subNote}`);
  if (typeof publishPluginBridgeState === 'function') publishPluginBridgeState('config-saved');
}

async function saveConfigModal() {
  const patch = {};
  for (const field of CONFIG_FIELDS) {
    const el = document.querySelector(`[data-cfg-key="${field.key}"]`);
    if (!el) continue;
    if (el.getAttribute('role') === 'switch') patch[field.key] = el.getAttribute('aria-checked') === 'true';
    else patch[field.key] = field.type === 'bool' ? el.value === 'true' : parseFloat(el.value);
  }
  try {
    await commitConfigPatch(
      patch,
      'อัปเดตค่า Robot Config',
      '[OK] บันทึกค่า Robot Config ลงใน Config.ino เรียบร้อย',
      true
    );
  } catch (err) {
    appendConsole(`[ERR] บันทึก Config ไม่สำเร็จ: ${err.message}`);
  }
}

async function restoreDefaultMotionConfig() {
  if (!window.confirm('ต้องการกู้คืนค่าเริ่มต้น Kp, Kd, Speed, Threshold และเปิด useCodeMotionDefaults ตามโค้ดหลักหรือไม่?\n(ค่าคาลิเบรตเซนเซอร์เส้นและเซอร์โวในเครื่องจะยังคงเดิม)')) {
    return;
  }
  try {
    await commitConfigPatch(
      { ...DEFAULT_MOTION_CONFIG },
      'กู้คืนค่าเริ่มต้น Kp/Kd และระบบเดิน',
      '[OK] กู้คืนค่าเริ่มต้น Kp/Kd และพารามิเตอร์ระบบเดินเรียบร้อยแล้ว',
      false
    );
  } catch (err) {
    appendConsole(`[ERR] กู้คืนค่าเริ่มต้นไม่สำเร็จ: ${err.message}`);
  }
}

// ============================================================================
// Auto Save & Resizable Panels
// ============================================================================
function loadAutoSavePref() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_STORAGE_KEY);
    state.autoSave = raw === null ? true : raw === '1';
  } catch (_) { state.autoSave = true; }
  const sw = $('btnToggleAutoSave');
  if (sw) sw.setAttribute('aria-checked', state.autoSave ? 'true' : 'false');
}

function toggleAutoSave() {
  state.autoSave = !state.autoSave;
  try { localStorage.setItem(AUTOSAVE_STORAGE_KEY, state.autoSave ? '1' : '0'); } catch (_) {}
  const sw = $('btnToggleAutoSave');
  if (sw) sw.setAttribute('aria-checked', state.autoSave ? 'true' : 'false');
  const anyDirty = Object.keys(state.files).some((k) => state.files[k] !== state.savedFiles[k]);
  refreshAutoSaveUi(anyDirty);
  if (state.autoSave && anyDirty) scheduleAutoSave(250);
}

function refreshAutoSaveUi(anyDirty) {
  const lbl = $('autoSaveStatusText');
  if (!lbl) return;
  lbl.classList.remove('dirty', 'off');
  if (!state.autoSave) {
    lbl.textContent = anyDirty ? 'Unsaved' : 'Manual';
    lbl.classList.add(anyDirty ? 'dirty' : 'off');
    return;
  }
  if (anyDirty) {
    lbl.textContent = 'กำลังแก้ไข...';
    lbl.classList.add('dirty');
  } else if (!lbl.textContent.startsWith('Auto-saved') && !lbl.textContent.startsWith('Saved')) {
    lbl.textContent = 'Synced';
  }
}

function scheduleAutoSave(delayMs = 1200) {
  if (!state.autoSave) return;
  clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = setTimeout(async () => {
    const anyDirty = Object.keys(state.files).some((k) => state.files[k] !== state.savedFiles[k]);
    if (!anyDirty) return;
    try { await saveFiles(true, true); } catch (err) { appendConsole(`[WARN] Auto Save ล้มเหลว: ${err.message}`); }
  }, delayMs);
}

function loadPanelPrefs() {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY);
    if (raw) state.panelPrefs = { ...DEFAULT_PANEL_PREFS, ...JSON.parse(raw) };
  } catch (_) {}
}

function savePanelPrefs() {
  try { localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(state.panelPrefs)); } catch (_) {}
}

function applyPanelPrefs() {
  const p = state.panelPrefs;
  const r = document.documentElement.style;
  r.setProperty('--toolbox-w', `${Math.max(220, Math.min(520, p.toolboxW))}px`);
  r.setProperty('--sim-w', `${p.simWide ? Math.max(460, p.simW) : Math.max(280, Math.min(680, p.simW))}px`);
  r.setProperty('--preview-h', `${Math.max(76, Math.min(420, p.previewH))}px`);
  r.setProperty('--drawer-h', `${p.drawerMaximized ? 360 : Math.max(82, Math.min(520, p.drawerH))}px`);
  r.setProperty('--code-sidebar-w', `${Math.max(170, Math.min(440, p.codeSidebarW))}px`);
  r.setProperty('--code-sim-w', `${Math.max(260, Math.min(560, p.codeSimW || 340))}px`);

  const vl = $('visualLayout');
  if (vl) {
    vl.classList.toggle('toolbox-collapsed', !!p.toolboxCollapsed);
    vl.classList.toggle('simulator-collapsed', !!p.simCollapsed);
  }
  if ($('btnExpandToolbox')) $('btnExpandToolbox').hidden = !p.toolboxCollapsed;
  if ($('btnRestoreSimulator')) $('btnRestoreSimulator').hidden = !p.simCollapsed;
  if ($('generatedPreview')) $('generatedPreview').classList.toggle('collapsed', !!p.previewCollapsed);
  if ($('simulatorPane')) $('simulatorPane').classList.toggle('config-collapsed', !!p.simConfigCollapsed);
  if ($('codeLayout')) {
    $('codeLayout').classList.toggle('sidebar-collapsed', !!p.codeSidebarCollapsed);
    $('codeLayout').classList.toggle('code-sim-collapsed', !!p.codeSimCollapsed);
  }
  if ($('btnExpandCodeSidebar')) $('btnExpandCodeSidebar').hidden = !p.codeSidebarCollapsed;
  if ($('btnToggleCodeSim')) $('btnToggleCodeSim').classList.toggle('active', !p.codeSimCollapsed);

  const bd = $('bottomDrawer');
  if (bd) {
    bd.classList.toggle('collapsed', !!p.drawerCollapsed);
    bd.classList.toggle('maximized', !p.drawerCollapsed && !!p.drawerMaximized);
  }
  drawSimulator(state);
}

function bindSplitResizer(resizerId, axis, getInitial, onMove) {
  const el = $(resizerId);
  if (!el) return;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startCoord = axis === 'x' ? e.clientX : e.clientY;
    const initialVal = getInitial();
    el.classList.add('active');
    document.body.classList.add('is-resizing');

    const handleMove = (mv) => {
      const delta = (axis === 'x' ? mv.clientX : mv.clientY) - startCoord;
      onMove(initialVal, delta);
      applyPanelPrefs();
    };
    const handleUp = () => {
      el.classList.remove('active');
      document.body.classList.remove('is-resizing');
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      savePanelPrefs();
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  });
}

function initResizablePanels() {
  loadPanelPrefs();
  if (window.innerWidth <= 1120) state.panelPrefs.drawerCollapsed = true;
  applyPanelPrefs();

  bindSplitResizer('resizerToolbox', 'x', () => state.panelPrefs.toolboxW, (initW, d) => {
    state.panelPrefs.toolboxW = Math.max(220, Math.min(520, initW + d));
  });
  bindSplitResizer('resizerSimulator', 'x', () => state.panelPrefs.simW, (initW, d) => {
    state.panelPrefs.simWide = false;
    state.panelPrefs.simW = Math.max(280, Math.min(680, initW - d));
  });
  bindSplitResizer('resizerPreview', 'y', () => state.panelPrefs.previewH, (initH, d) => {
    state.panelPrefs.previewCollapsed = false;
    state.panelPrefs.previewH = Math.max(76, Math.min(420, initH - d));
  });
  bindSplitResizer('resizerDrawer', 'y', () => state.panelPrefs.drawerH, (initH, d) => {
    state.panelPrefs.drawerCollapsed = false;
    state.panelPrefs.drawerMaximized = false;
    state.panelPrefs.drawerH = Math.max(82, Math.min(520, initH - d));
  });
  bindSplitResizer('resizerCodeSidebar', 'x', () => state.panelPrefs.codeSidebarW, (initW, d) => {
    state.panelPrefs.codeSidebarW = Math.max(170, Math.min(440, initW + d));
  });
  bindSplitResizer('resizerCodeSim', 'x', () => state.panelPrefs.codeSimW || 340, (initW, d) => {
    state.panelPrefs.codeSimCollapsed = false;
    state.panelPrefs.codeSimW = Math.max(260, Math.min(560, initW - d));
  });
}

// ============================================================================
// Local Git-Like Version Control (Commits + Images + Diff + Restore)
// ============================================================================
function getCurrentSimSettings() {
  return {
    cellCm: Number($('simCellSizeCm')?.value) || 30,
    cols: Number($('simGridCols')?.value) || 7,
    rows: Number($('simGridRows')?.value) || 7,
    startCol: Number($('simStartCol')?.value) || 1,
    startRow: Number($('simStartRow')?.value) || 5,
    startHeading: Number($('simStartHeading')?.value) || 0,
    simViewMode: state.fieldMap.simViewMode,
    simCameraRot: state.fieldMap.simCameraRot,
    compactGrid: buildCompactGrid(state.fieldMap.gridData)
  };
}

function applySimSettings(s) {
  if (!s || typeof s !== 'object') return;
  if ($('simCellSizeCm') && s.cellCm) $('simCellSizeCm').value = s.cellCm;
  if ($('simGridCols') && s.cols) $('simGridCols').value = s.cols;
  if ($('simGridRows') && s.rows) $('simGridRows').value = s.rows;
  if ($('simStartCol') && s.startCol !== undefined) $('simStartCol').value = s.startCol;
  if ($('simStartRow') && s.startRow !== undefined) $('simStartRow').value = s.startRow;
  if ($('simStartHeading') && s.startHeading !== undefined) $('simStartHeading').value = String(s.startHeading);

  const rows = Math.max(2, Math.min(24, Number(s.rows) || state.fieldMap.rows));
  const cols = Math.max(2, Math.min(24, Number(s.cols) || state.fieldMap.cols));
  const tileWidthCm = Math.max(5, Math.min(200, Number(s.cellCm) || state.fieldMap.tileWidthCm));
  state.fieldMap.rows = rows;
  state.fieldMap.cols = cols;
  state.fieldMap.tileWidthCm = tileWidthCm;
  if (s.simViewMode === '2d' || s.simViewMode === 'iso') state.fieldMap.simViewMode = s.simViewMode;
  if (Number.isFinite(s.simCameraRot)) state.fieldMap.simCameraRot = s.simCameraRot;
  if (Array.isArray(s.compactGrid)) {
    state.fieldMap.gridData = parseCompactGrid(sanitizeLegacyCompactGrid(s.compactGrid), rows, cols);
  }
  syncSimViewButtons();
  saveFieldMapToStorage();
  mapManager.refreshFromExternal();
}

function updateActiveVersionBadge() {
  const el = $('verActiveBadge');
  if (!el) return;
  const ver = state.versions.find((v) => v.id === state.activeVersionId) || state.versions[0];
  if (!ver) {
    el.textContent = '-';
    return;
  }
  const sub = state.activeSubVersionId
    ? (ver.subVersions || []).find((s) => s.id === state.activeSubVersionId)
    : null;
  el.textContent = sub ? `ใช้งาน: ${sub.versionLabel}` : `ใช้งาน: ${ver.versionLabel || `v${ver.majorNumber || 1}`}`;
}

function syncVersionListResponse(res) {
  if (Array.isArray(res.versions)) state.versions = res.versions;
  if (res.versionsDir) state.versionsDir = res.versionsDir;
  if (res.activeVersionId !== undefined) state.activeVersionId = res.activeVersionId;
  if (res.activeSubVersionId !== undefined) state.activeSubVersionId = res.activeSubVersionId;
  if ($('versionCountBadge')) $('versionCountBadge').textContent = String(state.versions.length);
  if ($('verStoragePathBadge') && state.versionsDir) {
    $('verStoragePathBadge').title = state.versionsDir;
    $('verStoragePathBadge').textContent = '.kt-versions (Local Disk)';
  }
  updateActiveVersionBadge();
  if (!$('versionModal')?.hidden) renderVersionTimeline();
}

async function loadVersions() {
  try {
    const res = await apiJson('/api/versions');
    syncVersionListResponse(res);
    renderVersionTimeline();
  } catch (err) {
    appendConsole(`[WARN] โหลดประวัติเวอร์ชันไม่สำเร็จ: ${err.message}`);
  }
}

function captureFieldCoverDataUrl(mode = state.verCoverMode) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 400;
  const gridData = Array.isArray(state.fieldMap?.gridData) && state.fieldMap.gridData.length > 0
    ? state.fieldMap.gridData
    : loadRescueMiddlePreset(state.fieldMap?.rows || 7, state.fieldMap?.cols || 7);
  const segs = state.sim.segments || [];
  const lastPose = segs.length > 0 ? evalSegmentPose(segs[segs.length - 1], 1) : null;
  const simOverlay = {
    tileWidthCm: state.fieldMap.tileWidthCm || 30,
    segments: segs,
    segIdx: Math.max(0, segs.length - 1),
    segProgress: 1,
    robotX: lastPose ? lastPose.x : state.sim.robotX,
    robotY: lastPose ? lastPose.y : state.sim.robotY,
    robotH: lastPose ? lastPose.h : state.sim.robotH
  };

  if (mode === 'iso') {
    renderIsometricGrid(canvas, gridData, {
      cameraRotDeg: state.fieldMap.simCameraRot || 0,
      tileWidthCm: state.fieldMap.tileWidthCm || 30,
      simOverlay,
      bgColor: '#070b14'
    });
  } else {
    render2DFieldGrid(canvas, gridData, {
      showMarkers: false,
      padding: 16,
      simOverlay,
      bgColor: '#070b14'
    });
  }

  return {
    name: `field_cover_${mode}.png`,
    dataUrl: canvas.toDataURL('image/png')
  };
}

function refreshVersionCoverPreview(forceCapture = true, existingCoverUrl = null) {
  const modeBtn = $('btnVerCoverMode');
  if (modeBtn) {
    const lbl = modeBtn.querySelector('span');
    if (lbl) lbl.textContent = state.verCoverMode === 'iso' ? '3D Iso' : '2D';
  }
  if (forceCapture) {
    state.verPendingCover = captureFieldCoverDataUrl(state.verCoverMode);
  }
  const imgEl = $('verCoverPreviewImg');
  if (imgEl) {
    imgEl.src = state.verPendingCover?.dataUrl || existingCoverUrl || '';
  }
  const metaEl = $('verCoverMetaText');
  if (metaEl) {
    const rows = state.fieldMap?.rows || 7;
    const cols = state.fieldMap?.cols || 7;
    if (!state.verPendingCover && existingCoverUrl) {
      metaEl.textContent = 'ภาพปกเดิม (กดอัปเดตปกเพื่อดึงสนามใหม่)';
    } else {
      metaEl.textContent = `สนาม ${cols}×${rows} · ${state.verCoverMode === 'iso' ? '3D Isometric' : '2D Top-Down'}`;
    }
  }
}

function resetVersionForm() {
  state.editingVersionId = null;
  state.verCoverMode = state.fieldMap?.simViewMode === 'iso' ? 'iso' : '2d';
  if ($('verFormModeTitle')) $('verFormModeTitle').textContent = 'บันทึกเวอร์ชันใหม่ (Create Commit)';
  if ($('verCommitBtnLabel')) $('verCommitBtnLabel').textContent = 'Commit & Save Version';
  if ($('btnCancelVerEdit')) $('btnCancelVerEdit').hidden = true;
  if ($('verTitleInput')) $('verTitleInput').value = '';
  if ($('verTagInput')) $('verTagInput').value = '';
  if ($('verDescInput')) $('verDescInput').value = '';
  refreshVersionCoverPreview(true);
}

function openVersionModal() {
  resetVersionForm();
  const modified = Object.keys(state.files).filter((k) => state.files[k] !== state.savedFiles[k]);
  const mSummary = MISSION_DEFS.map((d) => `M${d.file.match(/\d/)?.[0]}:${getMissionTotalCount(state.missions[d.file])}`).join(' ');
  if ($('verChangedFilesHint')) {
    $('verChangedFilesHint').textContent = modified.length > 0
      ? `มีไฟล์แก้ไข: ${modified.join(', ')} (${mSummary})`
      : `สถานะ: Snapshot ทุกไฟล์ .ino + Layout (${mSummary})`;
  }
  loadVersions();
  $('versionModal').hidden = false;
  $('verTitleInput')?.focus();
}

async function commitOrUpdateVersion() {
  const title = $('verTitleInput')?.value.trim() || '';
  const tag = $('verTagInput')?.value.trim() || '';
  const description = $('verDescInput')?.value.trim() || '';
  const btn = $('btnCommitVersion');
  if (btn) btn.disabled = true;

  try {
    if (state.editingVersionId) {
      const patchBody = {
        title: title || 'Updated Snapshot',
        tag,
        description
      };
      if (state.verPendingCover) {
        patchBody.coverImage = state.verPendingCover;
      }
      const res = await apiJson(`/api/versions/${encodeURIComponent(state.editingVersionId)}`, {
        method: 'PUT',
        body: JSON.stringify(patchBody)
      });
      syncVersionListResponse(res);
      appendConsole(`[OK] อัปเดตข้อมูลเวอร์ชัน ${res.version?.versionLabel || ''} #${res.version?.hash || ''} เรียบร้อย`);
    } else {
      const coverImage = state.verPendingCover || captureFieldCoverDataUrl(state.verCoverMode);
      const res = await apiJson('/api/versions', {
        method: 'POST',
        body: JSON.stringify({
          title: title || `Save ${new Date().toLocaleString('th-TH', { hour12: false })}`,
          tag,
          description,
          blockSummary: buildBlockSummary(),
          files: state.files,
          canvasLayout: buildCurrentCanvasLayout(),
          calibration: state.calibration,
          simSettings: getCurrentSimSettings(),
          coverImage
        })
      });
      syncVersionListResponse(res);
      state.savedFiles = { ...state.files };
      updateDirtyIndicator();
      appendConsole(`[OK] บันทึกเวอร์ชันหลัก ${res.version?.versionLabel || ''} #${res.version?.hash || ''} (${res.version?.title}) เรียบร้อย`);
    }

    resetVersionForm();
    renderVersionTimeline();
  } catch (err) {
    appendConsole(`[ERR] บันทึกเวอร์ชันไม่สำเร็จ: ${err.message}`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function computeFileDiffOps(oldText, newText) {
  const split = (t) => (t ? String(t).replace(/\r\n/g, '\n').split('\n') : []);
  const a = split(oldText);
  const b = split(newText);
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const am = a.slice(p, a.length - s);
  const bm = b.slice(p, b.length - s);
  const m = am.length;
  const n = bm.length;
  if (m === 0 && n === 0) return [];

  const ops = [];
  if (m * n <= 160000) {
    const cols = n + 1;
    const dp = new Int32Array((m + 1) * cols);
    for (let i = m - 1; i >= 0; i--) {
      const ro = i * cols;
      const nro = (i + 1) * cols;
      for (let j = n - 1; j >= 0; j--) {
        dp[ro + j] = am[i] === bm[j]
          ? dp[nro + j + 1] + 1
          : Math.max(dp[nro + j], dp[ro + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (am[i] === bm[j]) {
        ops.push({ type: 'ctx', text: am[i] });
        i++;
        j++;
      } else if (dp[(i + 1) * cols + j] >= dp[i * cols + j + 1]) {
        ops.push({ type: 'del', text: am[i] });
        i++;
      } else {
        ops.push({ type: 'add', text: bm[j] });
        j++;
      }
    }
    while (i < m) ops.push({ type: 'del', text: am[i++] });
    while (j < n) ops.push({ type: 'add', text: bm[j++] });
  } else {
    for (const l of am) ops.push({ type: 'del', text: l });
    for (const l of bm) ops.push({ type: 'add', text: l });
  }
  return ops;
}

function computeSnapshotDiffLines(snapFiles, targetFiles = state.files, emptyMsg = 'ไฟล์ทั้งหมดในเวอร์ชันนี้ตรงกับโค้ดปัจจุบัน 100%') {
  const rows = [];
  const allNames = Array.from(new Set([...Object.keys(targetFiles || {}), ...Object.keys(snapFiles || {})]));
  for (const fname of allNames) {
    const oldText = String(snapFiles?.[fname] || '');
    const curText = String(targetFiles?.[fname] || '');
    if (oldText === curText) continue;
    rows.push(`<div class="diff-line-hdr">--- ${escapeHtml(fname)} ---</div>`);
    const ops = computeFileDiffOps(oldText, curText);
    for (const op of ops) {
      if (op.type === 'del') rows.push(`<div class="diff-line-del">- ${escapeHtml(op.text)}</div>`);
      else if (op.type === 'add') rows.push(`<div class="diff-line-add">+ ${escapeHtml(op.text)}</div>`);
    }
  }
  return rows.length ? rows.slice(0, 140).join('') : `<div class="muted">${escapeHtml(emptyMsg)}</div>`;
}

function applyRestoredSnapshot(res, label) {
  state.files = res.files || {};
  state.savedFiles = { ...state.files };
  state.config = res.config || {};
  if (res.canvasLayout) {
    if (res.canvasLayout.activeMissionFile && state.missions[res.canvasLayout.activeMissionFile]) {
      state.activeMissionFile = res.canvasLayout.activeMissionFile;
    }
    if (res.canvasLayout.missions) {
      for (const d of MISSION_DEFS) {
        const sm = res.canvasLayout.missions[d.file];
        const m = ensureMissionStructure(state.missions[d.file]);
        if (sm && m) {
          m.placed = !!sm.placed;
          m.x = Number.isFinite(sm.x) ? sm.x : d.defaultX;
          m.y = Number.isFinite(sm.y) ? sm.y : d.defaultY;
          m.folded = !!sm.folded;
          if (sm.activeSection && MISSION_SECTIONS.some((s) => s.id === sm.activeSection)) {
            m.activeSection = sm.activeSection;
          }
          if (sm.foldedSections && typeof sm.foldedSections === 'object') {
            m.foldedSections = { ...sm.foldedSections };
          }
        }
      }
    }
    if (Array.isArray(res.canvasLayout.looseBlocks)) state.looseBlocks = normalizeLooseStacks(res.canvasLayout.looseBlocks);
    saveCanvasLayout();
  }
  if (res.simSettings) applySimSettings(res.simSettings);
  if (res.calibration?.tpcm) {
    state.calibration = { ...state.calibration, ...res.calibration };
    renderCalibrationCard();
  } else {
    syncCalibrationFromConfig(true);
  }

  syncVersionListResponse(res);
  parseAllMissionsFromFiles();
  codeIde.resetAllHistory();
  codeIde.loadFileIntoEditor(state.activeCodeFile, state.files[state.activeCodeFile] || '');
  renderVisualCodePreview(state.files[state.activeMissionFile] || '', state.activeMissionFile);
  updateDirtyIndicator();
  renderPalette();
  renderCanvas();
  rebuildSimAndDraw(true);
  pushBlockSnapshot(true);
  $('versionModal').hidden = true;
  appendConsole(`[OK] กู้คืนเวอร์ชัน ${label} กลับมาใช้งานเรียบร้อยแล้ว`);
}

async function restoreVersionById(id, title) {
  if (!confirm(`ต้องการดึงเวอร์ชัน "${title}" กลับมาทับไฟล์ในเครื่องตอนนี้หรือไม่?`)) return;
  clearTimeout(state.autoSaveTimer);
  try {
    const res = await apiJson(`/api/versions/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    const label = `${res.meta?.versionLabel || ''} #${res.meta?.hash || ''} (${title})`.trim();
    applyRestoredSnapshot(res, label);
  } catch (err) {
    appendConsole(`[ERR] กู้คืนเวอร์ชันไม่สำเร็จ: ${err.message}`);
  }
}

async function restoreSubVersionById(verId, subId, label) {
  if (!confirm(`ต้องการดึงเวอร์ชันย่อย "${label}" กลับมาทับไฟล์ในเครื่องตอนนี้หรือไม่?`)) return;
  clearTimeout(state.autoSaveTimer);
  try {
    const res = await apiJson(
      `/api/versions/${encodeURIComponent(verId)}/subversions/${encodeURIComponent(subId)}/restore`,
      { method: 'POST', body: JSON.stringify({}) }
    );
    applyRestoredSnapshot(res, `${label} #${res.subMeta?.hash || ''}`.trim());
  } catch (err) {
    appendConsole(`[ERR] กู้คืนเวอร์ชันย่อยไม่สำเร็จ: ${err.message}`);
  }
}

async function deleteVersionById(id, title) {
  if (!confirm(`ลบเวอร์ชัน "${title}" และประวัติย่อยทั้งหมดออกจากเครื่องถาวรหรือไม่?`)) return;
  try {
    const res = await apiJson(`/api/versions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (state.editingVersionId === id) resetVersionForm();
    syncVersionListResponse(res);
    renderVersionTimeline();
  } catch (err) {
    appendConsole(`[ERR] ลบเวอร์ชันไม่สำเร็จ: ${err.message}`);
  }
}

async function deleteSubVersionById(verId, subId, label) {
  if (!confirm(`ลบ Log เวอร์ชันย่อย "${label}" ออกจากเครื่องถาวรหรือไม่?`)) return;
  try {
    const res = await apiJson(
      `/api/versions/${encodeURIComponent(verId)}/subversions/${encodeURIComponent(subId)}`,
      { method: 'DELETE' }
    );
    syncVersionListResponse(res);
    renderVersionTimeline();
  } catch (err) {
    appendConsole(`[ERR] ลบเวอร์ชันย่อยไม่สำเร็จ: ${err.message}`);
  }
}

function startEditingVersion(v) {
  state.editingVersionId = v.id;
  state.verPendingCover = null;
  if ($('verFormModeTitle')) $('verFormModeTitle').textContent = `แก้ไขเวอร์ชัน ${v.versionLabel || ''} #${v.hash}`;
  if ($('verCommitBtnLabel')) $('verCommitBtnLabel').textContent = 'Update Version Info';
  if ($('btnCancelVerEdit')) $('btnCancelVerEdit').hidden = false;
  if ($('verTitleInput')) $('verTitleInput').value = v.title || '';
  if ($('verTagInput')) $('verTagInput').value = v.tag || '';
  if ($('verDescInput')) $('verDescInput').value = v.description || '';
  refreshVersionCoverPreview(false, v.coverUrl);
  $('verTitleInput')?.focus();
}

function openLightbox(url, caption) {
  if (!url) return;
  if ($('lightboxImg')) $('lightboxImg').src = url;
  if ($('lightboxCaption')) $('lightboxCaption').textContent = caption || 'Image Preview';
  if ($('imageLightboxModal')) $('imageLightboxModal').hidden = false;
}

function formatSaveSourceLabel(src) {
  if (src === 'manual') return 'Save';
  if (src === 'config') return 'Config';
  if (src === 'compile') return 'Compile';
  if (src === 'auto') return 'Auto';
  return src || 'Save';
}

function matchesVersionSearch(v, q) {
  if (!q) return true;
  const mainHay = `${v.versionLabel || ''} ${v.hash} ${v.title} ${v.tag || ''} ${v.description || ''} ${(v.changedFiles || []).join(' ')}`.toLowerCase();
  if (mainHay.includes(q)) return true;
  return (v.subVersions || []).some((sub) => {
    const previewTxt = (sub.changeSummary || []).flatMap((cs) => cs.preview || []).join(' ');
    const subHay = `${sub.versionLabel || ''} ${sub.hash} ${sub.source || ''} ${sub.note || ''} ${(sub.changedFiles || []).join(' ')} ${previewTxt}`.toLowerCase();
    return subHay.includes(q);
  });
}

function renderVersionTimeline() {
  const container = $('versionTimelineList');
  if (!container) return;
  const q = ($('verSearchInput')?.value || '').trim().toLowerCase();
  const filtered = state.versions.filter((v) => matchesVersionSearch(v, q));

  if (!filtered.length) {
    container.innerHTML = '<div class="muted" style="padding:18px;">ไม่พบเวอร์ชันที่ค้นหา</div>';
    return;
  }

  container.innerHTML = '';
  for (const v of filtered) {
    const isMainActive = v.id === state.activeVersionId;
    const isExactActive = isMainActive && !state.activeSubVersionId;
    const verLabel = v.versionLabel || `v${v.majorNumber || 1}`;
    const card = document.createElement('article');
    card.className = `ver-commit-card${isMainActive ? ' is-active' : ''}`;
    const timeStr = new Date(v.createdAt).toLocaleString('th-TH', { hour12: false });

    const topGrid = document.createElement('div');
    topGrid.className = 'ver-card-top';

    if (v.coverUrl) {
      const coverBtn = document.createElement('button');
      coverBtn.type = 'button';
      coverBtn.className = 'ver-cover-thumb';
      coverBtn.title = 'คลิกเพื่อดูภาพปกสนามขนาดใหญ่';
      coverBtn.innerHTML = `<img src="${escapeHtml(v.coverUrl)}" alt="${escapeHtml(v.title)}" />`;
      coverBtn.onclick = () => openLightbox(v.coverUrl, `${verLabel} — ${v.title}`);
      topGrid.appendChild(coverBtn);
    } else {
      const emptyCover = document.createElement('div');
      emptyCover.className = 'ver-cover-empty';
      emptyCover.innerHTML = `${svgIcon('map', 'sm')}<span>ไม่มีภาพปก</span>`;
      topGrid.appendChild(emptyCover);
    }

    const mainCol = document.createElement('div');
    mainCol.className = 'ver-card-main';

    const head = document.createElement('div');
    head.className = 'ver-card-head';
    head.innerHTML = `
      <div class="ver-card-title-row">
        <span class="ver-major-badge">${escapeHtml(verLabel)}</span>
        <span class="ver-hash">#${escapeHtml(v.hash)}</span>
        ${v.tag ? `<span class="ver-tag-badge">${escapeHtml(v.tag)}</span>` : ''}
        ${isExactActive ? '<span class="ver-current-badge">ใช้งานอยู่</span>' : ''}
        <span class="ver-title">${escapeHtml(v.title)}</span>
      </div>
      <span class="ver-meta-time">${escapeHtml(timeStr)}</span>
    `;
    mainCol.appendChild(head);

    if (v.description) {
      const desc = document.createElement('p');
      desc.className = 'ver-desc';
      desc.textContent = v.description;
      mainCol.appendChild(desc);
    }

    const chips = document.createElement('div');
    chips.className = 'ver-file-chips';
    if (v.blockSummary) {
      const bSpan = document.createElement('span');
      bSpan.className = 'ver-file-chip';
      bSpan.textContent = v.blockSummary;
      chips.appendChild(bSpan);
    }
    const summaryMap = Object.fromEntries((v.changeSummary || []).map((c) => [c.file, c]));
    for (const f of (v.changedFiles || []).slice(0, 6)) {
      const span = document.createElement('span');
      const cs = summaryMap[f];
      span.className = `ver-file-chip${cs ? ' has-delta' : ''}`;
      if (cs && (cs.added || cs.removed)) {
        span.innerHTML = `${escapeHtml(f)}<span class="ver-delta-add">+${cs.added}</span><span class="ver-delta-del">-${cs.removed}</span>`;
      } else {
        span.textContent = f;
      }
      chips.appendChild(span);
    }
    mainCol.appendChild(chips);

    // Keep extra legacy image thumbnails visible if a legacy version had >1 images
    if (v.images?.length > 1 || (v.images?.length === 1 && v.cover?.filename)) {
      const thumbs = document.createElement('div');
      thumbs.className = 'ver-card-thumbs';
      for (const img of v.images) {
        const tb = document.createElement('button');
        tb.type = 'button';
        tb.className = 'ver-thumb-btn';
        tb.title = img.originalName || img.filename;
        tb.innerHTML = `<img src="${escapeHtml(img.url)}" alt="${escapeHtml(v.title)}" />`;
        tb.onclick = () => openLightbox(img.url, `${v.title} — ${img.originalName || img.filename}`);
        thumbs.appendChild(tb);
      }
      mainCol.appendChild(thumbs);
    }

    topGrid.appendChild(mainCol);
    card.appendChild(topGrid);

    const diffBox = document.createElement('div');
    diffBox.className = 'ver-diff-box';
    diffBox.hidden = true;

    const actions = document.createElement('div');
    actions.className = 'ver-card-actions';

    const btnRestore = document.createElement('button');
    btnRestore.type = 'button';
    btnRestore.className = 'btn btn-xs btn-primary';
    btnRestore.innerHTML = `${svgIcon('restore', 'sm')}<span>ดึงกลับมาใช้ (${escapeHtml(verLabel)})</span>`;
    btnRestore.onclick = () => restoreVersionById(v.id, `${verLabel} — ${v.title}`);

    const btnDiff = document.createElement('button');
    btnDiff.type = 'button';
    btnDiff.className = 'btn btn-xs btn-secondary';
    btnDiff.innerHTML = `${svgIcon('diff', 'sm')}<span>ดูโค้ดที่เปลี่ยน (Diff)</span>`;
    btnDiff.onclick = async () => {
      if (!diffBox.hidden) { diffBox.hidden = true; return; }
      diffBox.innerHTML = '<div class="muted">กำลังเปรียบเทียบโค้ด...</div>';
      diffBox.hidden = false;
      try {
        const detail = await apiJson(`/api/versions/${encodeURIComponent(v.id)}`);
        diffBox.innerHTML = computeSnapshotDiffLines(detail.snapshot?.files || {}, state.files);
      } catch (err) {
        diffBox.innerHTML = `<div class="diff-line-del">${escapeHtml(err.message)}</div>`;
      }
    };

    const btnEdit = document.createElement('button');
    btnEdit.type = 'button';
    btnEdit.className = 'btn btn-xs btn-ghost';
    btnEdit.innerHTML = '<span>แก้ไข</span>';
    btnEdit.onclick = () => startEditingVersion(v);

    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.className = 'btn btn-xs btn-danger-soft';
    btnDel.innerHTML = `${svgIcon('trash', 'sm')}<span>ลบ</span>`;
    btnDel.onclick = () => deleteVersionById(v.id, `${verLabel} — ${v.title}`);

    actions.append(btnRestore, btnDiff, btnEdit, btnDel);
    card.append(actions, diffBox);

    const subs = v.subVersions || [];
    if (subs.length > 0) {
      const subSection = document.createElement('div');
      subSection.className = 'ver-sub-section';

      const defaultExpanded = isMainActive || v.id === state.versions[0]?.id || Boolean(q);
      const isExpanded = state.verExpandedSubs[v.id] !== undefined ? state.verExpandedSubs[v.id] : defaultExpanded;

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'ver-sub-toggle';
      toggleBtn.innerHTML = `
        <span>ประวัติการเซฟ / เวอร์ชันย่อย (${subs.length} รอบ)</span>
        <span>${isExpanded ? 'ซ่อน ▲' : 'แสดง ▼'}</span>
      `;

      const subList = document.createElement('div');
      subList.className = 'ver-sub-list';
      subList.hidden = !isExpanded;

      toggleBtn.onclick = () => {
        const next = subList.hidden;
        state.verExpandedSubs[v.id] = next;
        subList.hidden = !next;
        toggleBtn.lastElementChild.textContent = next ? 'ซ่อน ▲' : 'แสดง ▼';
      };

      for (const sub of subs) {
        const subActive = isMainActive && state.activeSubVersionId === sub.id;
        const subItem = document.createElement('div');
        subItem.className = `ver-sub-item${subActive ? ' is-active' : ''}`;
        const subTime = new Date(sub.createdAt).toLocaleString('th-TH', { hour12: false });

        const subHead = document.createElement('div');
        subHead.className = 'ver-sub-head';
        subHead.innerHTML = `
          <div class="ver-sub-id-row">
            <span class="ver-sub-badge">${escapeHtml(sub.versionLabel || `${verLabel}.${sub.seq}`)}</span>
            <span class="ver-hash">#${escapeHtml(sub.hash || '')}</span>
            <span class="ver-source-pill">${escapeHtml(formatSaveSourceLabel(sub.source))}</span>
            ${subActive ? '<span class="ver-current-badge">ใช้งานอยู่</span>' : ''}
            ${sub.note ? `<span class="muted" style="font-size:11px;">${escapeHtml(sub.note)}</span>` : ''}
          </div>
          <span class="ver-meta-time">${escapeHtml(subTime)}</span>
        `;
        subItem.appendChild(subHead);

        const subChips = document.createElement('div');
        subChips.className = 'ver-file-chips';
        const subCsMap = Object.fromEntries((sub.changeSummary || []).map((c) => [c.file, c]));
        for (const f of sub.changedFiles || []) {
          const sp = document.createElement('span');
          const cs = subCsMap[f];
          sp.className = `ver-file-chip${cs ? ' has-delta' : ''}`;
          if (cs && (cs.added || cs.removed)) {
            sp.innerHTML = `${escapeHtml(f)}<span class="ver-delta-add">+${cs.added}</span><span class="ver-delta-del">-${cs.removed}</span>`;
          } else {
            sp.textContent = f;
          }
          subChips.appendChild(sp);
        }
        subItem.appendChild(subChips);

        const previewRows = (sub.changeSummary || []).flatMap((cs) =>
          (cs.preview || []).map((line) => ({ file: cs.file, line }))
        ).slice(0, 4);
        if (previewRows.length > 0) {
          const prevBox = document.createElement('div');
          prevBox.className = 'ver-sub-preview';
          for (const pr of previewRows) {
            const lineEl = document.createElement('div');
            const isAdd = pr.line.startsWith('+');
            const isDel = pr.line.startsWith('-');
            lineEl.className = `ver-sub-preview-line${isAdd ? ' add' : isDel ? ' del' : ''}`;
            lineEl.textContent = `${pr.file}: ${pr.line}`;
            prevBox.appendChild(lineEl);
          }
          subItem.appendChild(prevBox);
        }

        const subDiffBox = document.createElement('div');
        subDiffBox.className = 'ver-diff-box';
        subDiffBox.hidden = true;

        const subActions = document.createElement('div');
        subActions.className = 'ver-sub-actions';

        const btnSubRestore = document.createElement('button');
        btnSubRestore.type = 'button';
        btnSubRestore.className = 'btn btn-xs btn-primary';
        btnSubRestore.innerHTML = `${svgIcon('restore', 'sm')}<span>กู้คืน ${escapeHtml(sub.versionLabel || '')}</span>`;
        btnSubRestore.onclick = () => restoreSubVersionById(v.id, sub.id, `${sub.versionLabel} (${v.title})`);

        const btnSubDiff = document.createElement('button');
        btnSubDiff.type = 'button';
        btnSubDiff.className = 'btn btn-xs btn-secondary';
        btnSubDiff.innerHTML = `${svgIcon('diff', 'sm')}<span>ดู Diff</span>`;
        btnSubDiff.onclick = async () => {
          if (!subDiffBox.hidden) { subDiffBox.hidden = true; return; }
          subDiffBox.innerHTML = '<div class="muted">กำลังโหลด Diff ของรอบที่เซฟ...</div>';
          subDiffBox.hidden = false;
          try {
            const detail = await apiJson(`/api/versions/${encodeURIComponent(v.id)}/subversions/${encodeURIComponent(sub.id)}`);
            const roundOld = detail.snapshot?.prevFiles || {};
            const roundKeys = Object.keys(roundOld);
            const roundNew = Object.fromEntries(roundKeys.map((k) => [k, detail.snapshot?.files?.[k] || '']));
            let html = '<div class="diff-line-hdr">[การแก้ไขในรอบการเซฟนี้]</div>';
            html += computeSnapshotDiffLines(roundOld, roundNew, 'ไม่มีความต่างของไฟล์โค้ด');
            if ((sub.changedFiles || []).includes('Field Map')) {
              html += '<div class="diff-line-hdr">--- Field Map ---</div><div class="diff-line-add">+ ปรับปรุงผังสนาม (Map Manager)</div>';
            }
            html += '<div class="diff-line-hdr" style="margin-top:6px;">[เทียบกับโค้ดปัจจุบันใน Editor]</div>';
            html += computeSnapshotDiffLines(detail.snapshot?.files || {}, state.files, 'ตรงกับโค้ดปัจจุบัน 100%');
            subDiffBox.innerHTML = html;
          } catch (err) {
            subDiffBox.innerHTML = `<div class="diff-line-del">${escapeHtml(err.message)}</div>`;
          }
        };

        const btnSubDel = document.createElement('button');
        btnSubDel.type = 'button';
        btnSubDel.className = 'btn btn-xs btn-danger-soft';
        btnSubDel.innerHTML = `${svgIcon('trash', 'sm')}<span>ลบ</span>`;
        btnSubDel.onclick = () => deleteSubVersionById(v.id, sub.id, sub.versionLabel || sub.id);

        subActions.append(btnSubRestore, btnSubDiff, btnSubDel);
        subItem.append(subActions, subDiffBox);
        subList.appendChild(subItem);
      }

      subSection.append(toggleBtn, subList);
      card.appendChild(subSection);
    }

    container.appendChild(card);
  }
}

// ============================================================================
// Mode & Drawer Switching
// ============================================================================
function switchMode(mode) {
  const prevMode = state.mode;
  if (prevMode === 'map' && mode !== 'map') {
    mapManager.deactivate();
    if (state.drawerStateBeforeMap) {
      state.panelPrefs.drawerCollapsed = state.drawerStateBeforeMap.drawerCollapsed;
      state.panelPrefs.drawerMaximized = state.drawerStateBeforeMap.drawerMaximized;
      state.drawerStateBeforeMap = null;
      applyPanelPrefs();
    }
  } else if (prevMode !== 'map' && mode === 'map') {
    state.drawerStateBeforeMap = {
      drawerCollapsed: !!state.panelPrefs.drawerCollapsed,
      drawerMaximized: !!state.panelPrefs.drawerMaximized
    };
    state.panelPrefs.drawerCollapsed = true;
    state.panelPrefs.drawerMaximized = false;
    applyPanelPrefs();
  }

  state.mode = mode;
  $('btnModeVisual').classList.toggle('active', mode === 'visual');
  $('btnModeCode').classList.toggle('active', mode === 'code');
  if ($('btnModeMap')) $('btnModeMap').classList.toggle('active', mode === 'map');
  $('viewVisual').classList.toggle('active', mode === 'visual');
  $('viewCode').classList.toggle('active', mode === 'code');
  if ($('viewMap')) $('viewMap').classList.toggle('active', mode === 'map');

  if (mode === 'visual') {
    parseAllMissionsFromFiles();
    renderPalette();
    renderCanvas();
    renderVisualCodePreview(state.files[state.activeMissionFile] || '', state.activeMissionFile);
    rebuildSimAndDraw(true);
  } else if (mode === 'code') {
    if (!state.files[state.activeCodeFile]) state.activeCodeFile = state.activeMissionFile;
    openCodeFile(state.activeCodeFile);
    codeIde.renderEditorVisuals();
    drawSimulator(state);
  } else if (mode === 'map') {
    mapManager.activate();
  }
  updateDocumentTitle();
}

function openQuickFieldScan() {
  switchMode('map');
  mapManager.setActiveMapTab('scan');
}

function activateDrawerTab(tabName) {
  state.panelPrefs.drawerCollapsed = false;
  applyPanelPrefs();
  document.querySelectorAll('.drawer-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tabName));
  $('panelConsole').classList.toggle('active', tabName === 'console');
  $('panelSerial').classList.toggle('active', tabName === 'serial');
  $('panelArtifacts').classList.toggle('active', tabName === 'artifacts');
}

// ============================================================================
// Extension Plugins Manager & 100% Offline Bidirectional Live Sync Bridge
// ============================================================================
const PLUGIN_BRIDGE_CHANNEL_NAME = 'kt_middle_ide_plugin_bridge_v1';
const PLUGIN_BRIDGE_LS_KEY = 'kt_middle_ide_plugin_bridge_snapshot_v1';
const BRIDGE_CLIENT_ID = `main-ide-${Math.random().toString(36).slice(2, 8)}`;
const pluginBridgeChannel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel(PLUGIN_BRIDGE_CHANNEL_NAME)
  : null;

let suppressBridgeBroadcast = false;
let pluginBridgeTimer = null;

function buildPluginBridgeSnapshot(reason = 'sync') {
  return {
    source: 'main-ide',
    clientId: BRIDGE_CLIENT_ID,
    reason,
    updatedAt: new Date().toISOString(),
    activeMissionFile: state.activeMissionFile,
    fieldMap: {
      rows: state.fieldMap.rows,
      cols: state.fieldMap.cols,
      tileWidthCm: state.fieldMap.tileWidthCm,
      simViewMode: state.fieldMap.simViewMode,
      simCameraRot: state.fieldMap.simCameraRot,
      showMarkers: !!state.fieldMap.showMarkers,
      compactGrid: buildCompactGrid(state.fieldMap.gridData)
    },
    simPose: {
      startCol: Number($('simStartCol')?.value) || 0,
      startRow: Number($('simStartRow')?.value) || 0,
      startHeading: Number($('simStartHeading')?.value) || 0,
      robotX: Number(state.sim.robotX) || 0,
      robotY: Number(state.sim.robotY) || 0,
      robotH: Number(state.sim.robotH) || 0,
      cameraFollowRobot: !!state.sim.cameraFollowRobot
    },
    calibration: { ...state.calibration },
    config: { ...state.config }
  };
}

async function flushPluginBridgeState(reason = 'sync') {
  if (suppressBridgeBroadcast) return;
  const snapshot = buildPluginBridgeSnapshot(reason);
  try {
    localStorage.setItem(PLUGIN_BRIDGE_LS_KEY, JSON.stringify(snapshot));
  } catch (_) {}
  try {
    pluginBridgeChannel?.postMessage({ type: 'bridge-state', clientId: BRIDGE_CLIENT_ID, snapshot });
  } catch (_) {}
  try {
    await fetch('/api/plugin-bridge/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot)
    });
  } catch (_) {}
}

function publishPluginBridgeState(reason = 'sync', immediate = false) {
  if (suppressBridgeBroadcast) return;
  clearTimeout(pluginBridgeTimer);
  if (immediate) {
    flushPluginBridgeState(reason);
    return;
  }
  pluginBridgeTimer = setTimeout(() => {
    flushPluginBridgeState(reason);
  }, 90);
}

function applyBridgeSnapshotFromPlugin(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return;
  const fromPlugin = snapshot.clientId !== BRIDGE_CLIENT_ID && snapshot.source !== 'main-ide' && snapshot.updatedBy !== 'main-ide';
  if (!fromPlugin && !snapshot.__forceApplyOnBoot) return;

  suppressBridgeBroadcast = true;
  try {
    const fm = snapshot.fieldMap || {};
    const sp = snapshot.simPose || {};
    const simPatch = {};

    if (Number.isFinite(Number(fm.tileWidthCm))) simPatch.cellCm = Number(fm.tileWidthCm);
    if (Number.isFinite(Number(fm.cols))) simPatch.cols = Number(fm.cols);
    if (Number.isFinite(Number(fm.rows))) simPatch.rows = Number(fm.rows);
    if (fm.simViewMode === '2d' || fm.simViewMode === 'iso') simPatch.simViewMode = fm.simViewMode;
    if (Number.isFinite(Number(fm.simCameraRot))) simPatch.simCameraRot = Number(fm.simCameraRot);
    if (Array.isArray(fm.compactGrid)) simPatch.compactGrid = fm.compactGrid;
    if (sp.startCol !== undefined) simPatch.startCol = Number(sp.startCol);
    if (sp.startRow !== undefined) simPatch.startRow = Number(sp.startRow);
    if (sp.startHeading !== undefined) simPatch.startHeading = Number(sp.startHeading);

    if (Object.keys(simPatch).length > 0) {
      applySimSettings(simPatch);
    }

    if (sp.cameraFollowRobot !== undefined) {
      state.sim.cameraFollowRobot = !!sp.cameraFollowRobot;
      syncSimViewButtons();
    }

    if (fromPlugin && snapshot.calibration && typeof snapshot.calibration === 'object') {
      state.calibration = { ...state.calibration, ...snapshot.calibration };
      renderCalibrationCard();
    }
    if (fromPlugin && snapshot.config && typeof snapshot.config === 'object') {
      state.config = { ...state.config, ...snapshot.config };
    }
    if (snapshot.activeMissionFile && state.missions[snapshot.activeMissionFile] && snapshot.activeMissionFile !== state.activeMissionFile) {
      setActiveMission(snapshot.activeMissionFile, false);
    }

    if (Number.isFinite(Number(sp.robotX)) && Number.isFinite(Number(sp.robotY)) && Number.isFinite(Number(sp.robotH)) && snapshot.reason === 'sim-pose') {
      state.sim.robotX = Number(sp.robotX);
      state.sim.robotY = Number(sp.robotY);
      state.sim.robotH = Number(sp.robotH);
      drawSimulator(state);
    } else {
      rebuildSimAndDraw(true);
    }

    if (fromPlugin) {
      try {
        localStorage.setItem(PLUGIN_BRIDGE_LS_KEY, JSON.stringify({ ...snapshot, source: 'plugin-applied' }));
      } catch (_) {}
    }
  } finally {
    suppressBridgeBroadcast = false;
  }
}

async function reloadFilesFromPluginEvent(msg = {}) {
  suppressBridgeBroadcast = true;
  try {
    const [filesRes, versionsRes] = await Promise.all([
      apiJson('/api/files'),
      apiJson('/api/versions').catch(() => null)
    ]);
    state.files = filesRes.files || {};
    state.savedFiles = { ...state.files };
    state.config = filesRes.config || {};
    syncCalibrationFromConfig(true);
    parseAllMissionsFromFiles();

    if (msg.targetFile && state.missions[msg.targetFile]) {
      state.activeMissionFile = msg.targetFile;
    }
    renderPalette();
    renderCanvas();
    renderVisualCodePreview(state.files[state.activeMissionFile] || '', state.activeMissionFile);
    if (state.activeCodeFile && state.files[state.activeCodeFile] !== undefined) {
      codeIde.loadFileIntoEditor(state.activeCodeFile, state.files[state.activeCodeFile]);
    }
    updateDirtyIndicator();
    if (versionsRes) syncVersionListResponse(versionsRes);
    rebuildSimAndDraw(true);

    const who = msg.pluginName || 'แอปเสริม';
    const fileLabel = msg.targetFile || 'ไฟล์ภารกิจ';
    const subTag = msg.subVersionLabel ? ` · Save Log ${msg.subVersionLabel}` : '';
    appendConsole(`[PLUGIN] ซิงค์โค้ดใหม่จาก ${who} เข้า ${fileLabel} เรียบร้อย${subTag}`);
  } catch (err) {
    appendConsole(`[WARN] โหลดไฟล์ที่อัปเดตจากแอปเสริมไม่สำเร็จ: ${err.message}`);
  } finally {
    suppressBridgeBroadcast = false;
    publishPluginBridgeState('post-plugin-files');
  }
}

function handleIncomingBridgeMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.clientId === BRIDGE_CLIENT_ID) return;

  if (msg.type === 'request-sync') {
    publishPluginBridgeState('plugin-request', true);
    return;
  }
  if (msg.type === 'open-main-config') {
    openConfigModal();
    return;
  }
  if (msg.type === 'bridge-state' && msg.snapshot) {
    applyBridgeSnapshotFromPlugin(msg.snapshot);
    return;
  }
  if (msg.type === 'files-updated') {
    if (msg.snapshot) applyBridgeSnapshotFromPlugin(msg.snapshot);
    reloadFilesFromPluginEvent(msg);
  }
}

if (pluginBridgeChannel) {
  pluginBridgeChannel.onmessage = (ev) => {
    handleIncomingBridgeMessage(ev.data);
  };
}

window.addEventListener('storage', (ev) => {
  if (ev.key === PLUGIN_BRIDGE_LS_KEY && ev.newValue) {
    try {
      const snap = JSON.parse(ev.newValue);
      if (snap && snap.source !== 'main-ide' && snap.source !== 'plugin-applied') {
        applyBridgeSnapshotFromPlugin(snap);
      }
    } catch (_) {}
  }
});

const CAPABILITY_LABELS = {
  'field-sync': 'ซิงค์สนาม',
  'pose-sync': 'ซิงค์ตำแหน่ง/ทิศ',
  'speed-sync': 'ซิงค์ความเร็ว/Cal',
  'auto-solve': 'แก้สนามอัตโนมัติ',
  'custom-waypoints': 'สร้างเส้นทางเอง',
  'dual-spin-turn': 'รองรับ Spin/Turn/ทั้งคู่',
  'simulator': 'Simulator ในตัว',
  'mission-codegen': 'เขียนโค้ด Mission'
};

function renderPluginToolbar() {
  const list = state.plugins.list || [];
  const connected = list.filter((p) => p.connected);
  if ($('pluginCountBadge')) {
    $('pluginCountBadge').textContent = String(connected.length);
  }
  const bar = $('connectedPluginBar');
  if (!bar) return;
  bar.innerHTML = '';
  bar.hidden = connected.length === 0;

  for (const plugin of connected) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'plugin-launch-btn';
    btn.title = `เปิดแอปเสริม ${plugin.name} (ซิงค์กับ IDE หลักทันที)`;
    btn.innerHTML = `
      <span class="plugin-live-dot" style="background:${escapeHtml(plugin.badgeColor || '#10b981')}"></span>
      <span>${escapeHtml(plugin.shortName || plugin.name)}</span>
      <svg class="svg-ico sm"><use href="#ico-external"></use></svg>
    `;
    btn.onclick = () => launchPlugin(plugin);
    bar.appendChild(btn);
  }
}

function renderPluginModal() {
  const container = $('pluginListContainer');
  if (!container) return;
  if ($('pluginFolderPath')) {
    $('pluginFolderPath').textContent = state.plugins.pluginsDir || 'extentions-plugins/';
  }

  const list = state.plugins.list || [];
  container.innerHTML = '';

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'plugin-empty-state';
    empty.innerHTML = 'ยังไม่พบแอปเสริมในโฟลเดอร์ <code>/extentions-plugins</code> — วางโฟลเดอร์แอปเสริมพร้อมไฟล์ <code>plugin.json</code> แล้วกด "สแกนโฟลเดอร์"';
    container.appendChild(empty);
    return;
  }

  for (const p of list) {
    const card = document.createElement('article');
    card.className = `plugin-card${p.connected ? ' connected' : ''}`;

    const iconName = ['route', 'plug', 'map', 'cube', 'code'].includes(p.icon) ? p.icon : 'plug';
    const head = document.createElement('div');
    head.className = 'plugin-card-head';
    head.innerHTML = `
      <div class="plugin-card-title">
        <div class="plugin-icon-box" style="background:${escapeHtml(p.badgeColor || '#0072f5')}">
          ${svgIcon(iconName)}
        </div>
        <div>
          <h3>${escapeHtml(p.name)}</h3>
          <div class="plugin-card-sub">/extentions-plugins/${escapeHtml(p.id)} · v${escapeHtml(p.version || '1.0.0')}</div>
        </div>
      </div>
      <span class="plugin-status-pill${p.connected ? ' is-connected' : ''}">${p.connected ? 'เชื่อมต่ออยู่' : 'ยังไม่เชื่อมต่อ'}</span>
    `;

    const desc = document.createElement('p');
    desc.className = 'plugin-card-desc';
    desc.textContent = p.description || 'แอปเสริมทำงานร่วมกับ KT Middle IDE';

    const caps = document.createElement('div');
    caps.className = 'plugin-caps';
    for (const c of p.capabilities || []) {
      const chip = document.createElement('span');
      chip.className = 'plugin-cap-chip';
      chip.textContent = CAPABILITY_LABELS[c] || c;
      caps.appendChild(chip);
    }
    if (!p.entryExists) {
      const warn = document.createElement('span');
      warn.className = 'plugin-cap-chip';
      warn.style.color = '#fbbf24';
      warn.textContent = `ไม่พบไฟล์ ${p.entry}`;
      caps.appendChild(warn);
    }

    const actions = document.createElement('div');
    actions.className = 'plugin-card-actions';

    const statusMeta = document.createElement('span');
    statusMeta.className = 'muted';
    statusMeta.style.fontSize = '11px';
    statusMeta.textContent = p.offline !== false ? 'Offline 100% Ready' : 'Local Plugin';

    const btns = document.createElement('div');
    btns.className = 'plugin-card-btns';

    if (p.connected) {
      const btnOpen = document.createElement('button');
      btnOpen.type = 'button';
      btnOpen.className = 'btn btn-xs btn-primary';
      btnOpen.disabled = !p.entryExists;
      btnOpen.innerHTML = `${svgIcon('external', 'sm')}<span>เปิดแอป</span>`;
      btnOpen.onclick = () => launchPlugin(p);

      const btnDisconnect = document.createElement('button');
      btnDisconnect.type = 'button';
      btnDisconnect.className = 'btn btn-xs btn-secondary';
      btnDisconnect.textContent = 'ตัดการเชื่อมต่อ';
      btnDisconnect.onclick = () => performPluginConnectionAction('disconnect', p.id);

      btns.append(btnOpen, btnDisconnect);
    } else {
      const btnConnect = document.createElement('button');
      btnConnect.type = 'button';
      btnConnect.className = 'btn btn-xs btn-primary';
      btnConnect.disabled = !p.entryExists;
      btnConnect.innerHTML = `${svgIcon('plug', 'sm')}<span>เชื่อมต่อแอป</span>`;
      btnConnect.onclick = () => performPluginConnectionAction('connect', p.id);
      btns.appendChild(btnConnect);
    }

    actions.append(statusMeta, btns);
    card.append(head, desc, caps, actions);
    container.appendChild(card);
  }
}

async function loadPlugins(showConsoleLog = false) {
  try {
    const res = await apiJson('/api/plugins');
    state.plugins.list = Array.isArray(res.plugins) ? res.plugins : [];
    state.plugins.connectedIds = Array.isArray(res.connectedIds) ? res.connectedIds : [];
    state.plugins.primaryPluginId = res.primaryPluginId || null;
    state.plugins.pluginsDir = res.pluginsDir || '';
    renderPluginToolbar();
    if (!$('pluginModal')?.hidden) renderPluginModal();
    if (showConsoleLog) {
      appendConsole(`[PLUGIN] สแกนโฟลเดอร์ /extentions-plugins พบ ${state.plugins.list.length} แอปเสริม`);
    }
  } catch (err) {
    appendConsole(`[WARN] โหลดรายการแอปเสริมไม่สำเร็จ: ${err.message}`);
  }
}

async function performPluginConnectionAction(action, pluginId) {
  try {
    const res = await apiJson('/api/plugins/connect', {
      method: 'POST',
      body: JSON.stringify({ action, pluginId })
    });
    state.plugins.list = Array.isArray(res.plugins) ? res.plugins : [];
    state.plugins.connectedIds = Array.isArray(res.connectedIds) ? res.connectedIds : [];
    state.plugins.primaryPluginId = res.primaryPluginId || null;
    state.plugins.pluginsDir = res.pluginsDir || state.plugins.pluginsDir;
    renderPluginToolbar();
    renderPluginModal();
    if (action === 'connect') {
      await publishPluginBridgeState('plugin-connected', true);
      appendConsole(`[OK] เชื่อมต่อแอปเสริม "${pluginId}" แล้ว — กดปุ่มลัดบนแถบด้านบนเพื่อเข้าแอปได้ทันที`);
    } else if (action === 'disconnect') {
      appendConsole(`[INFO] ยกเลิกการเชื่อมต่อแอปเสริม "${pluginId}" แล้ว`);
    }
  } catch (err) {
    appendConsole(`[ERR] จัดการการเชื่อมต่อแอปเสริมไม่สำเร็จ: ${err.message}`);
  }
}

async function openPluginModal() {
  if ($('pluginModal')) $('pluginModal').hidden = false;
  await loadPlugins(false);
  renderPluginModal();
}

async function launchPlugin(plugin) {
  if (!plugin || !plugin.launchUrl) return;
  await publishPluginBridgeState('launch-plugin', true);
  window.open(plugin.launchUrl, `kt_plugin_${plugin.id}`);
  if ($('pluginModal') && !$('pluginModal').hidden) {
    $('pluginModal').hidden = true;
  }
}

// ============================================================================
// Initialization & Event Bindings
// ============================================================================
async function init() {
  loadAutoSavePref();
  loadFieldMapFromStorage();
  mapManager.init();
  initResizablePanels();
  loadCanvasLayout();
  renderCategoryRail();
  renderPalette();
  renderSnippets();
  applyCanvasZoom(state.zoomPct);
  codeIde.bindEvents();
  state.sim.cameraFollowRobot = !!codeIde.getSettings().cameraFollowRobot;
  syncSimViewButtons();
  updateDocumentTitle();

  try {
    const [status, filesRes, bridgeRes] = await Promise.all([
      apiJson('/api/status'),
      apiJson('/api/files'),
      apiJson('/api/plugin-bridge/state').catch(() => null)
    ]);
    state.files = filesRes.files || {};
    state.savedFiles = { ...state.files };
    state.config = filesRes.config || {};
    state.artifacts = status.artifacts || [];

    syncCalibrationFromConfig(true);
    parseAllMissionsFromFiles();
    renderPalette();
    renderCanvas();
    renderVisualCodePreview(state.files[state.activeMissionFile] || '', state.activeMissionFile);
    openCodeFile(state.activeCodeFile);
    renderArtifacts();
    rebuildSimAndDraw(true);
    pushBlockSnapshot(true);
    await Promise.all([refreshHostPorts(), loadVersions(), loadPlugins()]);

    let restoredFromPluginBridge = false;
    const srvBridge = bridgeRes?.bridge;
    if (srvBridge && (srvBridge.simPose || srvBridge.fieldMap)) {
      applyBridgeSnapshotFromPlugin({ ...srvBridge, __forceApplyOnBoot: true });
      restoredFromPluginBridge = srvBridge.updatedBy && srvBridge.updatedBy !== 'main-ide';
    }
    if (!restoredFromPluginBridge) {
      publishPluginBridgeState('init', true);
    }
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('open') === 'config') {
      openConfigModal();
      urlParams.delete('open');
      const nextSearch = urlParams.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', nextUrl);
    }
  } catch (err) {
    appendConsole(`[ERR] ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์: ${err.message}`);
  }
}

$('blockCanvas').addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (e.target.closest('.mission-container, .loose-stack, .loose-block, .trash-dropzone')) return;
  dragCtx.active = true;
  dragCtx.moved = false;
  dragCtx.kind = 'pan';
  dragCtx.startX = e.clientX;
  dragCtx.startY = e.clientY;
  dragCtx.panStartScrollL = $('blockCanvas').scrollLeft;
  dragCtx.panStartScrollT = $('blockCanvas').scrollTop;
});

$('blockCanvas').addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  applyCanvasZoom(state.zoomPct + (e.deltaY < 0 ? 10 : -10));
}, { passive: false });

$('btnModeVisual').onclick = () => switchMode('visual');
$('btnModeCode').onclick = () => switchMode('code');
if ($('btnModeMap')) $('btnModeMap').onclick = () => switchMode('map');
document.querySelectorAll('.pane-tab-btn').forEach((btn) => { btn.onclick = () => setActiveVisualPane(btn.dataset.pane); });

if ($('btnToggleCodePreview')) $('btnToggleCodePreview').onclick = () => { state.panelPrefs.previewCollapsed = !state.panelPrefs.previewCollapsed; applyPanelPrefs(); savePanelPrefs(); };
if ($('btnCollapseToolbox')) $('btnCollapseToolbox').onclick = () => { state.panelPrefs.toolboxCollapsed = true; applyPanelPrefs(); savePanelPrefs(); };
if ($('btnExpandToolbox')) $('btnExpandToolbox').onclick = () => { state.panelPrefs.toolboxCollapsed = false; applyPanelPrefs(); savePanelPrefs(); };
if ($('btnCollapseSimulator')) $('btnCollapseSimulator').onclick = () => { state.panelPrefs.simCollapsed = true; applyPanelPrefs(); savePanelPrefs(); };
if ($('btnRestoreSimulator')) $('btnRestoreSimulator').onclick = () => { state.panelPrefs.simCollapsed = false; applyPanelPrefs(); savePanelPrefs(); };
if ($('btnExpandSimulator')) $('btnExpandSimulator').onclick = () => { state.panelPrefs.simWide = !state.panelPrefs.simWide; applyPanelPrefs(); savePanelPrefs(); };
if ($('btnToggleSimConfig')) $('btnToggleSimConfig').onclick = () => { state.panelPrefs.simConfigCollapsed = !state.panelPrefs.simConfigCollapsed; applyPanelPrefs(); savePanelPrefs(); };
if ($('btnCollapseCodeSidebar')) $('btnCollapseCodeSidebar').onclick = () => { state.panelPrefs.codeSidebarCollapsed = true; applyPanelPrefs(); savePanelPrefs(); };
if ($('btnExpandCodeSidebar')) $('btnExpandCodeSidebar').onclick = () => { state.panelPrefs.codeSidebarCollapsed = false; applyPanelPrefs(); savePanelPrefs(); };
if ($('btnToggleCodeSim')) {
  $('btnToggleCodeSim').onclick = () => {
    state.panelPrefs.codeSimCollapsed = !state.panelPrefs.codeSimCollapsed;
    applyPanelPrefs();
    savePanelPrefs();
  };
}
if ($('btnCloseCodeSim')) {
  $('btnCloseCodeSim').onclick = () => {
    state.panelPrefs.codeSimCollapsed = true;
    applyPanelPrefs();
    savePanelPrefs();
  };
}
if ($('btnResetLayout')) {
  $('btnResetLayout').onclick = () => {
    state.panelPrefs = { ...DEFAULT_PANEL_PREFS };
    applyPanelPrefs();
    savePanelPrefs();
    applyCanvasZoom(100);
  };
}

$('paletteSearch').oninput = renderPalette;
$('btnZoomOut').onclick = () => applyCanvasZoom(state.zoomPct - 10);
$('btnZoomIn').onclick = () => applyCanvasZoom(state.zoomPct + 10);
$('zoomLabel').onclick = () => applyCanvasZoom(100);
if ($('btnBlockUndo')) $('btnBlockUndo').onclick = undoBlocks;
if ($('btnBlockRedo')) $('btnBlockRedo').onclick = redoBlocks;

$('btnAutoArrange').onclick = () => {
  let x = 28;
  for (const def of MISSION_DEFS) {
    const m = state.missions[def.file];
    if (m.placed) { m.x = x; m.y = 28; x += 500; }
  }
  let lx = 28;
  for (const b of state.looseBlocks) { b.x = lx; b.y = 430; lx += 300; }
  $('blockCanvas').scrollTo({ left: 0, top: 0, behavior: 'smooth' });
  renderCanvas();
  saveCanvasLayout();
};
$('btnSyncFromCode').onclick = () => {
  parseAllMissionsFromFiles();
  renderPalette();
  renderCanvas();
  renderVisualCodePreview(state.files[state.activeMissionFile] || '', state.activeMissionFile);
  rebuildSimAndDraw(true);
};
$('btnClearBlocks').onclick = () => {
  if (!confirm(`ล้างคำสั่งทั้งหมดใน ${state.activeMissionFile}?`)) return;
  const m = ensureMissionStructure(state.missions[state.activeMissionFile]);
  if (m) {
    m.sections = createEmptyMissionSections();
    m.disabledSections = {};
    m.extraFunctionsCode = '';
    m.extraFunctionsBlocks = {};
  }
  renderCanvas();
  syncMissionToFile(state.activeMissionFile);
  saveCanvasLayout();
};
$('btnJumpToCode').onclick = () => {
  state.activeCodeFile = state.activeMissionFile;
  switchMode('code');
};

$('btnQuickSyncCal').onclick = pullCalibrationSmart;
$('btnOpenCalSettings').onclick = openConfigModal;
$('btnReadCalWebSerial').onclick = readCalibrationWebSerial;
$('btnReadCalHostCom').onclick = readCalibrationHostCom;
$('btnSyncCalFromConfig').onclick = syncCalFromConfigIno;
$('btnApplyCalToConfig').onclick = applyCalToConfigIno;

$('btnSimPlay').onclick = toggleSimPlay;
$('btnSimStep').onclick = stepSimOnce;
$('btnSimReset').onclick = resetSimPose;
if ($('btnCodeSimPlay')) $('btnCodeSimPlay').onclick = toggleSimPlay;
if ($('btnCodeSimStep')) $('btnCodeSimStep').onclick = stepSimOnce;
if ($('btnCodeSimReset')) $('btnCodeSimReset').onclick = resetSimPose;
['simCellSizeCm', 'simGridCols', 'simGridRows', 'simStartCol', 'simStartRow', 'simStartHeading'].forEach((id) => {
  $(id).onchange = () => {
    if (id === 'simCellSizeCm' || id === 'simGridCols' || id === 'simGridRows') {
      const nextRows = Math.max(2, Math.min(24, parseInt($('simGridRows')?.value, 10) || state.fieldMap.rows));
      const nextCols = Math.max(2, Math.min(24, parseInt($('simGridCols')?.value, 10) || state.fieldMap.cols));
      const nextCm = Math.max(5, Math.min(200, parseFloat($('simCellSizeCm')?.value) || state.fieldMap.tileWidthCm));
      state.fieldMap.gridData = resizeGridData(state.fieldMap.gridData, nextRows, nextCols);
      state.fieldMap.rows = nextRows;
      state.fieldMap.cols = nextCols;
      state.fieldMap.tileWidthCm = nextCm;
      saveFieldMapToStorage();
      mapManager.refreshFromExternal();
    }
    rebuildSimAndDraw(true);
    publishPluginBridgeState('sim-grid-input');
  };
});

if ($('btnSimViewMode')) $('btnSimViewMode').onclick = toggleSimViewMode;
if ($('btnCodeSimViewMode')) $('btnCodeSimViewMode').onclick = toggleSimViewMode;
if ($('btnSimRotateIso')) $('btnSimRotateIso').onclick = rotateSimIsoCamera;
if ($('btnCodeSimRotateIso')) $('btnCodeSimRotateIso').onclick = rotateSimIsoCamera;
if ($('btnSimSyncStart')) {
  $('btnSimSyncStart').onclick = () => {
    if (syncSimStartFromFieldStartTile()) {
      rebuildSimAndDraw(true);
      publishPluginBridgeState('sync-start-tile');
      appendConsole('[OK] ซิงก์ตำแหน่งหุ่นยนต์ไปที่แผ่น START (#31) เรียบร้อย');
    } else {
      appendConsole('[WARN] ไม่พบแผ่น START (#31) บนสนาม — ใช้ค่า Start X/Y ปัจจุบัน');
    }
  };
}
if ($('btnOpenMapManager')) {
  $('btnOpenMapManager').onclick = () => switchMode('map');
}
if ($('btnTopQuickScan')) {
  $('btnTopQuickScan').onclick = openQuickFieldScan;
}
if ($('btnSimQuickScan')) {
  $('btnSimQuickScan').onclick = openQuickFieldScan;
}

if ($('btnToggleAutoSave')) $('btnToggleAutoSave').onclick = toggleAutoSave;
if ($('btnOpenPlugins')) $('btnOpenPlugins').onclick = openPluginModal;
if ($('btnClosePluginModal')) $('btnClosePluginModal').onclick = () => { $('pluginModal').hidden = true; };
if ($('btnRescanPlugins')) $('btnRescanPlugins').onclick = () => loadPlugins(true);
if ($('pluginModal')) {
  $('pluginModal').onclick = (e) => { if (e.target === $('pluginModal')) $('pluginModal').hidden = true; };
}
if ($('btnOpenVersions')) $('btnOpenVersions').onclick = openVersionModal;
if ($('btnCloseVersion')) $('btnCloseVersion').onclick = () => { $('versionModal').hidden = true; };
if ($('btnVerCoverMode')) {
  $('btnVerCoverMode').onclick = () => {
    state.verCoverMode = state.verCoverMode === 'iso' ? '2d' : 'iso';
    refreshVersionCoverPreview(true);
  };
}
if ($('btnVerRefreshCover')) {
  $('btnVerRefreshCover').onclick = () => refreshVersionCoverPreview(true);
}
if ($('verCoverPreviewBox')) {
  $('verCoverPreviewBox').onclick = () => {
    const src = $('verCoverPreviewImg')?.getAttribute('src');
    if (src) openLightbox(src, $('verCoverMetaText')?.textContent || 'Field Cover');
  };
}
if ($('btnCommitVersion')) $('btnCommitVersion').onclick = commitOrUpdateVersion;
if ($('btnCancelVerEdit')) $('btnCancelVerEdit').onclick = resetVersionForm;
if ($('verSearchInput')) $('verSearchInput').oninput = renderVersionTimeline;
if ($('btnCloseLightbox')) $('btnCloseLightbox').onclick = () => { $('imageLightboxModal').hidden = true; };
if ($('imageLightboxModal')) {
  $('imageLightboxModal').onclick = (e) => { if (e.target === $('imageLightboxModal')) $('imageLightboxModal').hidden = true; };
}

$('btnSave').onclick = () => saveFiles(false, false).catch((e) => appendConsole(`[ERR] ${e.message}`));
$('btnCompile').onclick = compileProject;
$('btnWebUpload').onclick = webSerialUpload;
$('btnRefreshPorts').onclick = refreshHostPorts;
$('btnHostUpload').onclick = hostUpload;

document.querySelectorAll('.drawer-tab').forEach((tab) => { tab.onclick = () => activateDrawerTab(tab.dataset.tab); });
$('btnToggleDrawer').onclick = () => { state.panelPrefs.drawerCollapsed = !state.panelPrefs.drawerCollapsed; applyPanelPrefs(); savePanelPrefs(); };
if ($('btnMaximizeDrawer')) {
  $('btnMaximizeDrawer').onclick = () => {
    state.panelPrefs.drawerCollapsed = false;
    state.panelPrefs.drawerMaximized = !state.panelPrefs.drawerMaximized;
    applyPanelPrefs();
    savePanelPrefs();
  };
}
$('btnSerialConnect').onclick = toggleSerialMonitor;
$('btnSerialSendGetCal').onclick = async () => {
  if (!state.serialPort) { await readCalibrationWebSerial(); return; }
  await sendTextToPort(state.serialPort, 'GET_CAL\n');
  appendSerial('> GET_CAL\n');
};
if ($('btnSerialApplyCal')) $('btnSerialApplyCal').onclick = applyCalToConfigIno;
$('btnSerialClear').onclick = () => { $('serialLog').textContent = ''; };

$('btnOpenConfig').onclick = openConfigModal;
$('btnCloseConfig').onclick = () => { $('configModal').hidden = true; };
$('btnCancelConfig').onclick = () => { $('configModal').hidden = true; };
if ($('btnRestoreDefaultConfig')) $('btnRestoreDefaultConfig').onclick = restoreDefaultMotionConfig;
$('btnSaveConfig').onclick = saveConfigModal;

window.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (e.key === 'Escape') {
    if (!$('imageLightboxModal')?.hidden) { $('imageLightboxModal').hidden = true; return; }
    if (!$('pluginModal')?.hidden) { $('pluginModal').hidden = true; return; }
    if (!$('shortcutsModal')?.hidden) { $('shortcutsModal').hidden = true; return; }
    if (!$('ideSettingsModal')?.hidden) { $('ideSettingsModal').hidden = true; return; }
    if (!$('versionModal')?.hidden) { $('versionModal').hidden = true; return; }
    if (!$('configModal')?.hidden) { $('configModal').hidden = true; return; }
    if (!$('editorFindBar')?.hidden) { codeIde.closeFindBar(); return; }
  }

  if (ctrl && !e.shiftKey && key === 's') {
    e.preventDefault();
    saveFiles(false, false).catch((err) => appendConsole(`[ERR] ${err.message}`));
    return;
  }
  if (ctrl && !e.shiftKey && (key === 'r' || key === 'b')) {
    e.preventDefault();
    compileProject();
    return;
  }
  if (ctrl && e.shiftKey && key === 'g') {
    e.preventDefault();
    openVersionModal();
    return;
  }

  const inEditable = e.target.closest('input, textarea, select');
  if (state.mode === 'visual' && !inEditable && ctrl && !e.altKey) {
    if (!e.shiftKey && key === 'z') { e.preventDefault(); undoBlocks(); }
    else if (key === 'y' || (e.shiftKey && key === 'z')) { e.preventDefault(); redoBlocks(); }
  }
});

init();
