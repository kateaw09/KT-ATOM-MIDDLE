'use strict';

export const DEFAULT_IDE_SETTINGS = {
  syntaxHighlight: true,
  autocomplete: true,
  wordPrediction: true,
  parameterHints: true,
  clickToSeekSim: true,
  cameraFollowRobot: false,
  autoCloseBrackets: true,
  wordWrap: false,
  fontSize: 13,
  tabSize: 4
};

const IDE_SETTINGS_KEY = 'kt_middle_ide_settings_v1';

const CPP_KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break',
  'continue', 'return', 'extern', 'static', 'const', 'struct', 'class',
  'public', 'private', 'enum', 'sizeof', 'volatile', 'inline'
]);

const CPP_TYPES = new Set([
  'void', 'int', 'float', 'double', 'char', 'bool', 'long', 'short',
  'unsigned', 'signed', 'byte', 'String', 'uint8_t', 'uint16_t', 'uint32_t',
  'int8_t', 'int16_t', 'int32_t', 'size_t'
]);

const CPP_BOOLS = new Set(['true', 'false', 'NULL', 'nullptr', 'HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP']);

const ROBOT_COMPLETIONS = [
  { label: 'FC', insert: "FC(80, 30.0f, 'R');", sig: "FC(speed, cm [, 'R'|'L'|'r'|'l'|stop [, stopBeforeTurn]])", desc: "เดินหน้า 90° ('R'/'L'=Swing ไม่หยุด, 'r'/'l'=หยุดหมุน Spin 90°, false=ไม่หยุด)", kind: 'API' },
  { label: 'BC', insert: "BC(60, 30.0f, 'L');", sig: "BC(speed, cm [, 'R'|'L'|'r'|'l'|stop [, stopBeforeTurn]])", desc: "ถอยหลัง 90° ('R'/'L'=Swing ไม่หยุด, 'r'/'l'=หยุดหมุน Spin 90°, false=ไม่หยุด)", kind: 'API' },
  { label: 'FC_BOX', insert: "FC_BOX(65, 1.0f, 'R');", sig: "FC_BOX(speed, boxes [, 'R'|'L'|'r'|'l'|stop [, stopBeforeTurn]])", desc: 'เดินหน้าตามจำนวนช่อง (1–8 ช่อง ใช้ตาราง Box Calibration)', kind: 'API' },
  { label: 'BC_BOX', insert: "BC_BOX(50, 1.0f, 'L');", sig: "BC_BOX(speed, boxes [, 'R'|'L'|'r'|'l'|stop [, stopBeforeTurn]])", desc: 'ถอยหลังตามจำนวนช่อง (1–8 ช่อง ใช้ตาราง Box Calibration)', kind: 'API' },
  { label: 'BOX', insert: 'BOX(1)', sig: 'BOX(boxes)', desc: 'แปลงจำนวนช่อง (1–8) เป็นระยะสนามจริง (cm)', kind: 'MATH' },
  { label: 'FC4', insert: "FC4(60, 30.0f, 'R');", sig: "FC4(speed, cm, 'R'|'L'|'r'|'l' [, stopBeforeTurn])", desc: "เดินหน้า 45° ('R'/'L'=Swing ไม่หยุด, 'r'/'l'=หยุดหมุน Spin 45°)", kind: 'API' },
  { label: 'BC4', insert: "BC4(50, 20.0f, 'L');", sig: "BC4(speed, cm, 'R'|'L'|'r'|'l' [, stopBeforeTurn])", desc: "ถอยหลัง 45° ('R'/'L'=Swing ไม่หยุด, 'r'/'l'=หยุดหมุน Spin 45°)", kind: 'API' },
  { label: 'SpinDegree', insert: 'SpinDegree(90.0f);', sig: 'SpinDegree(degree)', desc: 'หมุนอยู่กับที่ตามมุม Gyro (+ ขวา / - ซ้าย)', kind: 'API' },
  { label: 'TrunDegreeFront', insert: 'TrunDegreeFront(90.0f);', sig: 'TrunDegreeFront(degree)', desc: 'เลี้ยวเหวี่ยงล้อหน้า Pivot ตามมุม Gyro', kind: 'API' },
  { label: 'TrunDegreeBack', insert: 'TrunDegreeBack(90.0f);', sig: 'TrunDegreeBack(degree)', desc: 'เลี้ยวเหวี่ยงล้อหลัง Pivot ตามมุม Gyro', kind: 'API' },
  { label: 'TTF90', insert: 'TTF90(80, 25, 33);', sig: 'TTF90(spdL, spdR, cm)', desc: 'ตีโค้งเดินหน้า 90 องศาด้วย Encoder', kind: 'API' },
  { label: 'TTF45', insert: 'TTF45(80, 25, 17);', sig: 'TTF45(spdL, spdR, cm)', desc: 'ตีโค้งเดินหน้า 45 องศาด้วย Encoder', kind: 'API' },
  { label: 'TTB90', insert: 'TTB90(25, 80, 33);', sig: 'TTB90(spdL, spdR, cm)', desc: 'ตีโค้งถอยหลัง 90 องศาด้วย Encoder', kind: 'API' },
  { label: 'TTB45', insert: 'TTB45(25, 80, 17);', sig: 'TTB45(spdL, spdR, cm)', desc: 'ตีโค้งถอยหลัง 45 องศาด้วย Encoder', kind: 'API' },
  { label: 'FF', insert: 'FF(60, 400);', sig: 'FF(speed, ms)', desc: 'เดินหน้าจับเวลา ms (เหมาะสำหรับข้ามสิ่งกีดขวาง)', kind: 'API' },
  { label: 'BB', insert: 'BB(50, 400);', sig: 'BB(speed, ms)', desc: 'ถอยหลังจับเวลา ms', kind: 'API' },
  { label: 'SetF', insert: 'SetF(25, 10.0f);', sig: "SetF(speed [, backCm [, 'R'|'L']])", desc: 'จัดแนวเส้นด้านหน้า + รีเซ็ตมุม Yaw = 0 (-> ถอย -> หยุดหมุน Spin 90°)', kind: 'API' },
  { label: 'SetB', insert: 'SetB(25, 10.0f);', sig: "SetB(speed [, fwdCm [, 'R'|'L']])", desc: 'ถอยจัดแนวเส้นด้านหลัง + รีเซ็ตมุม Yaw = 0 (-> เดินออก -> หยุดหมุน Spin 90°)', kind: 'API' },
  { label: 'DropF', insert: 'DropF(30);', sig: 'DropF([speed])', desc: 'เข้าเส้นหน้า (SetFront_drop) แล้วปล่อยลูกบาศก์ด้านหน้า', kind: 'API' },
  { label: 'DropB', insert: 'DropB(30);', sig: 'DropB([speed])', desc: 'เข้าเส้นหลัง (SetBack_drop) แล้วปล่อยลูกบาศก์ด้านหลัง', kind: 'API' },
  { label: 'STOP', insert: 'STOP();', sig: 'STOP()', desc: 'หยุดรอผู้ใช้กดปุ่ม A/B แล้วรีเซ็ต Yaw', kind: 'API' },
  { label: 'runMode1', insert: 'runMode1();', sig: 'runMode1()', desc: 'ฟังก์ชันภารกิจโหมดที่ 1 (Default)', kind: 'FN' },
  { label: 'runMode2', insert: 'runMode2();', sig: 'runMode2()', desc: 'ฟังก์ชันภารกิจโหมดที่ 2 (Btn B x1)', kind: 'FN' },
  { label: 'runMode3', insert: 'runMode3();', sig: 'runMode3()', desc: 'ฟังก์ชันภารกิจโหมดที่ 3 (Btn B x2)', kind: 'FN' },
  { label: 'delay', insert: 'delay(300);', sig: 'delay(ms)', desc: 'หน่วงเวลา (มิลลิวินาที)', kind: 'FN' },
  { label: 'millis', insert: 'millis()', sig: 'millis()', desc: 'อ่านเวลาตั้งแต่เปิดบอร์ด (ms)', kind: 'FN' },
  { label: 'constrain', insert: 'constrain(val, min, max)', sig: 'constrain(x, min, max)', desc: 'จำกัดค่าให้อยู่ในช่วง min..max', kind: 'MATH' },
  { label: 'abs', insert: 'abs(x)', sig: 'abs(x)', desc: 'ค่าสัมบูรณ์', kind: 'MATH' },
  { label: 'min', insert: 'min(a, b)', sig: 'min(a, b)', desc: 'ค่าน้อยกว่า', kind: 'MATH' },
  { label: 'max', insert: 'max(a, b)', sig: 'max(a, b)', desc: 'ค่ามากกว่า', kind: 'MATH' },
  { label: 'random', insert: 'random(min, max)', sig: 'random(min, max)', desc: 'สุ่มเลขจำนวนเต็ม', kind: 'MATH' },
  { label: 'Serial.println', insert: 'Serial.println();', sig: 'Serial.println(val)', desc: 'ส่งข้อความออกพอร์ต Serial', kind: 'FN' },
  { label: 'if', insert: 'if (condition) {\n    \n}', sig: 'if (condition) { ... }', desc: 'เงื่อนไขตรรกศาสตร์', kind: 'KW' },
  { label: 'else', insert: 'else {\n    \n}', sig: 'else { ... }', desc: 'กรณีเงื่อนไขไม่เป็นจริง', kind: 'KW' },
  { label: 'for', insert: 'for (int i = 0; i < 4; i++) {\n    \n}', sig: 'for (init; cond; step)', desc: 'วนซ้ำแบบกำหนดจำนวนรอบ', kind: 'KW' },
  { label: 'while', insert: 'while (condition) {\n    \n}', sig: 'while (condition)', desc: 'วนซ้ำตราบที่เงื่อนไขเป็นจริง', kind: 'KW' },
  { label: 'int', insert: 'int ', sig: 'int name = 0;', desc: 'ตัวแปรจำนวนเต็ม', kind: 'TYPE' },
  { label: 'float', insert: 'float ', sig: 'float name = 0.0f;', desc: 'ตัวแปรทศนิยม', kind: 'TYPE' },
  { label: 'char', insert: 'char ', sig: "char name = 'R';", desc: 'ตัวแปรอักขระ 1 ตัว', kind: 'TYPE' },
  { label: 'bool', insert: 'bool ', sig: 'bool name = true;', desc: 'ตัวแปรตรรกะ true/false', kind: 'TYPE' }
];

const ROBOT_API_NAMES = new Set(ROBOT_COMPLETIONS.filter((c) => c.kind === 'API' || c.kind === 'FN' || c.kind === 'MATH').map((c) => c.label));
const ROBOT_SIG_MAP = Object.fromEntries(ROBOT_COMPLETIONS.map((c) => [c.label, c]));

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
}

function tokenizeCppSegment(code, varSet) {
  let out = '';
  let i = 0;
  const n = code.length;
  let lineStart = true;

  while (i < n) {
    const ch = code[i];

    if (ch === '\n') {
      out += '\n';
      lineStart = true;
      i++;
      continue;
    }

    if (ch === ' ' || ch === '\t' || ch === '\r') {
      out += ch;
      i++;
      continue;
    }

    // Preprocessor directive at start of line
    if (lineStart && ch === '#') {
      let end = code.indexOf('\n', i);
      if (end === -1) end = n;
      out += `<span class="tok-preproc">${escapeHtml(code.slice(i, end))}</span>`;
      i = end;
      continue;
    }
    lineStart = false;

    // Single-line comment
    if (ch === '/' && code[i + 1] === '/') {
      let end = code.indexOf('\n', i);
      if (end === -1) end = n;
      out += `<span class="tok-comment">${escapeHtml(code.slice(i, end))}</span>`;
      i = end;
      continue;
    }

    // Multi-line comment
    if (ch === '/' && code[i + 1] === '*') {
      let end = code.indexOf('*/', i + 2);
      end = end === -1 ? n : end + 2;
      out += `<span class="tok-comment">${escapeHtml(code.slice(i, end))}</span>`;
      i = end;
      continue;
    }

    // String or char literal
    if (ch === '"' || ch === '\'') {
      const q = ch;
      let j = i + 1;
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === q) { j++; break; }
        if (code[j] === '\n') break;
        j++;
      }
      out += `<span class="tok-str">${escapeHtml(code.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch)) {
      const m = code.slice(i).match(/^(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?[fFlLuU]*)/);
      if (m) {
        out += `<span class="tok-num">${escapeHtml(m[0])}</span>`;
        i += m[0].length;
        continue;
      }
    }

    // Identifiers & keywords
    if (/[A-Za-z_]/.test(ch)) {
      const m = code.slice(i).match(/^[A-Za-z_]\w*/);
      const word = m[0];
      const nextNonSpace = code.slice(i + word.length).match(/^\s*([([])/);
      let cls = '';
      if (CPP_KEYWORDS.has(word)) cls = 'tok-keyword';
      else if (CPP_TYPES.has(word)) cls = 'tok-type';
      else if (CPP_BOOLS.has(word)) cls = 'tok-bool';
      else if (ROBOT_API_NAMES.has(word)) cls = 'tok-api';
      else if (varSet.has(word)) cls = 'tok-var';
      else if (nextNonSpace && nextNonSpace[1] === '(') cls = 'tok-fn';

      out += cls ? `<span class="${cls}">${escapeHtml(word)}</span>` : escapeHtml(word);
      i += word.length;
      continue;
    }

    // Operators / Punctuation
    if ('+-*/%=<>!&|?:~^'.includes(ch)) {
      out += `<span class="tok-op">${escapeHtml(ch)}</span>`;
      i++;
      continue;
    }
    if ('(){}[];,'.includes(ch)) {
      out += `<span class="tok-punct">${escapeHtml(ch)}</span>`;
      i++;
      continue;
    }

    out += escapeHtml(ch);
    i++;
  }
  return out;
}

export function highlightCppWithGhost(code, caretPos, ghostSuffix, variables = []) {
  const varSet = new Set(variables.map((v) => v.name));
  const splitIdx = Math.max(0, Math.min(code.length, caretPos ?? code.length));
  if (!ghostSuffix) {
    const html = tokenizeCppSegment(code, varSet);
    return code.endsWith('\n') ? `${html} ` : html;
  }
  const before = tokenizeCppSegment(code.slice(0, splitIdx), varSet);
  const after = tokenizeCppSegment(code.slice(splitIdx), varSet);
  const tailPad = code.endsWith('\n') ? ' ' : '';
  return `${before}<span class="tok-ghost">${escapeHtml(ghostSuffix)}</span>${after}${tailPad}`;
}

export function formatCppCode(code, tabSize = 4) {
  const indentUnit = ' '.repeat(tabSize === 2 ? 2 : 4);
  const normalized = String(code || '').replace(/\r\n/g, '\n');
  const rawLines = normalized.split('\n');
  const out = [];
  let indentLevel = 0;
  let inBlockComment = false;
  let prevBlank = false;

  const normalizeSpacingOutsideLiterals = (line) => {
    let res = '';
    let inStr = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inStr) {
        res += ch;
        if (ch === inStr && line[i - 1] !== '\\') inStr = null;
        continue;
      }
      if (ch === '/' && line[i + 1] === '/') {
        const prefix = res.trimEnd();
        res = (prefix ? `${prefix}  ` : '') + line.slice(i);
        break;
      }
      if (ch === '"' || ch === '\'') {
        inStr = ch;
        res += ch;
        continue;
      }
      if (ch === ',') {
        res = res.replace(/[ \t]+$/, '') + ',';
        while (line[i + 1] === ' ' || line[i + 1] === '\t') i++;
        if (i + 1 < line.length && line[i + 1] !== '\n') res += ' ';
        continue;
      }
      res += ch;
    }
    return res.replace(/[ \t]+$/, '');
  };

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (!prevBlank && out.length > 0) out.push('');
      prevBlank = true;
      continue;
    }
    prevBlank = false;

    if (inBlockComment) {
      out.push(`${indentUnit.repeat(indentLevel)}${trimmed}`);
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      out.push(`${indentUnit.repeat(indentLevel)}${trimmed}`);
      if (!trimmed.includes('*/')) inBlockComment = true;
      continue;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
      const pad = trimmed.startsWith('#') ? '' : indentUnit.repeat(indentLevel);
      out.push(`${pad}${trimmed}`);
      continue;
    }

    let openBraces = 0;
    let closeBraces = 0;
    let leadingCloses = 0;
    let seenNonClose = false;
    let inStr = null;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (inStr) {
        if (ch === inStr && trimmed[i - 1] !== '\\') inStr = null;
        continue;
      }
      if (ch === '/' && trimmed[i + 1] === '/') break;
      if (ch === '"' || ch === '\'') {
        inStr = ch;
        seenNonClose = true;
        continue;
      }
      if (ch === '}') {
        closeBraces++;
        if (!seenNonClose) leadingCloses++;
      } else {
        if (ch !== ' ' && ch !== '\t') seenNonClose = true;
        if (ch === '{') openBraces++;
      }
    }

    const effectiveLevel = Math.max(0, indentLevel - leadingCloses);
    const isCaseOrAccess = /^(case\b.*:|default\s*:|public\s*:|private\s*:|protected\s*:)/.test(trimmed);
    const finalLevel = isCaseOrAccess ? Math.max(0, effectiveLevel - 1) : effectiveLevel;
    out.push(`${indentUnit.repeat(finalLevel)}${normalizeSpacingOutsideLiterals(trimmed)}`);
    indentLevel = Math.max(0, indentLevel + openBraces - closeBraces);
  }

  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return `${out.join('\n')}\n`;
}

export function createCodeIdeController({
  getActiveFile,
  setActiveFileContent,
  getVariables,
  getConfigKeys,
  onFilesUpdated,
  onCursorLineChange,
  onSettingsChanged,
  appendConsole
}) {
  let settings = loadSettings();
  const codeHistory = {};
  let historyTimer = null;
  let acItems = [];
  let acSelected = 0;
  let acTokenPrefix = '';
  let acTokenStart = 0;
  let activeGhostSuffix = '';
  let findMatches = [];
  let findIdx = -1;

  const el = (id) => document.getElementById(id);

  function loadSettings() {
    try {
      const raw = localStorage.getItem(IDE_SETTINGS_KEY);
      return raw ? { ...DEFAULT_IDE_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_IDE_SETTINGS };
    } catch (_) {
      return { ...DEFAULT_IDE_SETTINGS };
    }
  }

  function saveSettings() {
    try { localStorage.setItem(IDE_SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
  }

  function applySettingsToDom() {
    const stage = el('codeEditorStage');
    const ta = el('codeTextarea');
    const pre = el('codeHighlightPre');
    const ln = el('lineNumbers');
    if (!stage || !ta || !pre) return;

    const fsPx = Math.max(11, Math.min(20, Number(settings.fontSize) || 13));
    const ts = Number(settings.tabSize) === 2 ? 2 : 4;
    stage.style.setProperty('--editor-font-size', `${fsPx}px`);
    stage.style.setProperty('--editor-tab-size', String(ts));
    if (ln) ln.style.fontSize = `${fsPx}px`;

    stage.classList.toggle('syntax-on', !!settings.syntaxHighlight);
    stage.classList.toggle('wrap-on', !!settings.wordWrap);
    document.documentElement.dataset.simSeek = settings.clickToSeekSim ? 'on' : 'off';
    document.documentElement.dataset.camLock = settings.cameraFollowRobot ? 'on' : 'off';

    const flags = [];
    if (settings.syntaxHighlight) flags.push('Syntax');
    if (settings.autocomplete) flags.push('AutoComplete');
    if (settings.wordPrediction) flags.push('Predict');
    if (settings.clickToSeekSim) flags.push('SimSeek');
    if (settings.cameraFollowRobot) flags.push('CamLock');
    if (el('statusAssistState')) el('statusAssistState').textContent = flags.length ? flags.join(' · ') : 'Plain Text';
    if (el('statusIndentLabel')) el('statusIndentLabel').textContent = `Spaces: ${ts} · UTF-8 · Arduino C++`;

    syncSettingsModalControls();
    renderEditorVisuals();
    if (typeof onSettingsChanged === 'function') onSettingsChanged({ ...settings });
  }

  function syncSettingsModalControls() {
    const togglePairs = [
      ['setSyntaxHighlight', 'syntaxHighlight'],
      ['setAutocomplete', 'autocomplete'],
      ['setWordPrediction', 'wordPrediction'],
      ['setParameterHints', 'parameterHints'],
      ['setClickToSeekSim', 'clickToSeekSim'],
      ['setCameraFollowRobot', 'cameraFollowRobot'],
      ['setAutoCloseBrackets', 'autoCloseBrackets'],
      ['setWordWrap', 'wordWrap']
    ];
    for (const [id, key] of togglePairs) {
      const btn = el(id);
      if (!btn) continue;
      const checked = !!settings[key];
      btn.setAttribute('aria-checked', checked ? 'true' : 'false');
      const lbl = btn.querySelector('.m-switch-lbl');
      if (lbl) lbl.textContent = checked ? 'เปิด' : 'ปิด';
    }
    if (el('setFontSize')) el('setFontSize').value = String(settings.fontSize);
    if (el('setTabSize')) el('setTabSize').value = String(settings.tabSize);
  }

  function ensureHistory(file, val) {
    if (!codeHistory[file]) codeHistory[file] = { past: [], future: [], lastVal: val };
    return codeHistory[file];
  }

  function commitHistoryNow() {
    const file = getActiveFile();
    const ta = el('codeTextarea');
    if (!file || !ta) return;
    const h = ensureHistory(file, ta.value);
    if (ta.value !== h.lastVal) {
      h.past.push({ value: h.lastVal, start: ta.selectionStart ?? 0, end: ta.selectionEnd ?? 0 });
      if (h.past.length > 100) h.past.shift();
      h.lastVal = ta.value;
      h.future = [];
    }
  }

  function applyTextWithHistory(newVal, selStart, selEnd) {
    const ta = el('codeTextarea');
    commitHistoryNow();
    const h = ensureHistory(getActiveFile(), ta.value);
    h.past.push({ value: ta.value, start: ta.selectionStart ?? 0, end: ta.selectionEnd ?? 0 });
    if (h.past.length > 100) h.past.shift();
    h.future = [];
    h.lastVal = newVal;
    ta.value = newVal;
    ta.selectionStart = Math.max(0, Math.min(newVal.length, selStart));
    ta.selectionEnd = Math.max(0, Math.min(newVal.length, selEnd));
    handleInput(false);
  }

  function undo() {
    const ta = el('codeTextarea');
    const h = ensureHistory(getActiveFile(), ta.value);
    if (ta.value !== h.lastVal) {
      h.future.push({ value: ta.value, start: ta.selectionStart ?? 0, end: ta.selectionEnd ?? 0 });
      ta.value = h.lastVal;
      handleInput(false);
      return true;
    }
    if (!h.past.length) return false;
    h.future.push({ value: ta.value, start: ta.selectionStart ?? 0, end: ta.selectionEnd ?? 0 });
    const prev = h.past.pop();
    h.lastVal = prev.value;
    ta.value = prev.value;
    ta.selectionStart = prev.start;
    ta.selectionEnd = prev.end;
    handleInput(false);
    return true;
  }

  function redo() {
    const ta = el('codeTextarea');
    const h = ensureHistory(getActiveFile(), ta.value);
    if (!h.future.length) return false;
    h.past.push({ value: ta.value, start: ta.selectionStart ?? 0, end: ta.selectionEnd ?? 0 });
    const next = h.future.pop();
    h.lastVal = next.value;
    ta.value = next.value;
    ta.selectionStart = next.start;
    ta.selectionEnd = next.end;
    handleInput(false);
    return true;
  }

  function buildCompletionDictionary() {
    const map = new Map();
    for (const c of ROBOT_COMPLETIONS) map.set(c.label, c);
    for (const v of (getVariables() || [])) {
      map.set(v.name, {
        label: v.name,
        insert: v.name,
        sig: `${v.type} ${v.name} = ${v.value}`,
        desc: v.comment || 'ตัวแปรใน Variables.ino',
        kind: 'VAR'
      });
    }
    for (const key of (getConfigKeys() || [])) {
      if (!map.has(key)) {
        map.set(key, { label: key, insert: key, sig: `Config: ${key}`, desc: 'พารามิเตอร์ใน Config.ino', kind: 'CFG' });
      }
    }
    const ta = el('codeTextarea');
    if (ta) {
      const identifiers = ta.value.match(/\b[A-Za-z_]\w{2,}\b/g) || [];
      for (const id of identifiers) {
        if (!map.has(id) && !CPP_KEYWORDS.has(id) && !CPP_TYPES.has(id)) {
          map.set(id, { label: id, insert: id, sig: id, desc: 'คำสั่ง/ตัวแปรในไฟล์ปัจจุบัน', kind: 'TXT' });
        }
      }
    }
    return Array.from(map.values());
  }

  function getCaretTokenContext() {
    const ta = el('codeTextarea');
    if (!ta) return { prefix: '', start: 0, caret: 0 };
    const caret = ta.selectionStart ?? 0;
    const before = ta.value.slice(0, caret);
    const m = before.match(/([A-Za-z_][\w.]*)$/);
    const prefix = m ? m[1] : '';
    return { prefix, start: caret - prefix.length, caret };
  }

  function measureCaretPixelPosition(ta, caretPos) {
    const stage = el('codeEditorStage');
    const cs = getComputedStyle(ta);
    const mirror = document.createElement('div');
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = cs.whiteSpace;
    mirror.style.fontFamily = cs.fontFamily;
    mirror.style.fontSize = cs.fontSize;
    mirror.style.lineHeight = cs.lineHeight;
    mirror.style.padding = cs.padding;
    mirror.style.width = `${ta.clientWidth}px`;
    mirror.style.tabSize = cs.tabSize;
    mirror.textContent = ta.value.slice(0, caretPos);
    const marker = document.createElement('span');
    marker.textContent = '|';
    mirror.appendChild(marker);
    stage.appendChild(mirror);
    const left = Math.max(8, Math.min(stage.clientWidth - 280, marker.offsetLeft - ta.scrollLeft));
    const top = Math.max(8, marker.offsetTop - ta.scrollTop + parseFloat(cs.lineHeight) + 2);
    mirror.remove();
    return { left, top };
  }

  function hideAutocomplete() {
    acItems = [];
    const pop = el('autocompletePopup');
    if (pop) pop.hidden = true;
  }

  function renderAutocompletePopup() {
    const pop = el('autocompletePopup');
    const ta = el('codeTextarea');
    if (!pop || !ta || acItems.length === 0 || !settings.autocomplete) {
      if (pop) pop.hidden = true;
      return;
    }
    const { left, top } = measureCaretPixelPosition(ta, acTokenStart);
    const maxTop = Math.max(12, el('codeEditorStage').clientHeight - 190);
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.min(top, maxTop)}px`;
    pop.innerHTML = '';

    acItems.forEach((item, idx) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `ac-item${idx === acSelected ? ' selected' : ''}`;
      row.innerHTML = `
        <span class="ac-kind kind-${item.kind.toLowerCase()}">${item.kind}</span>
        <span class="ac-label">${escapeHtml(item.label)}</span>
        <span class="ac-desc">${escapeHtml(item.desc)}</span>
      `;
      row.onmousedown = (e) => {
        e.preventDefault();
        acceptAutocompleteItem(item);
      };
      pop.appendChild(row);
    });
    pop.hidden = false;
  }

  function acceptAutocompleteItem(item) {
    const ta = el('codeTextarea');
    if (!ta || !item) return;
    const caret = ta.selectionStart ?? 0;
    const val = ta.value;
    const afterChar = val[caret] || '';
    const ins = afterChar === '(' && item.insert.includes('(') ? item.label : item.insert;
    const newVal = `${val.slice(0, acTokenStart)}${ins}${val.slice(caret)}`;
    let nextCaret = acTokenStart + ins.length;
    if (ins.includes('{\n    \n}')) {
      nextCaret = acTokenStart + ins.indexOf('{\n    ') + 6;
    }
    applyTextWithHistory(newVal, nextCaret, nextCaret);
    hideAutocomplete();
    ta.focus();
  }

  function updateSignatureHint() {
    const hint = el('signatureHintPopup');
    const ta = el('codeTextarea');
    if (!hint || !ta || !settings.parameterHints) {
      if (hint) hint.hidden = true;
      return;
    }
    const caret = ta.selectionStart ?? 0;
    const before = ta.value.slice(Math.max(0, caret - 120), caret);
    const fnCall = before.match(/([A-Za-z_]\w*)\s*\([^()]*$/);
    if (!fnCall || !ROBOT_SIG_MAP[fnCall[1]]) {
      hint.hidden = true;
      return;
    }
    const info = ROBOT_SIG_MAP[fnCall[1]];
    const { left, top } = measureCaretPixelPosition(ta, caret);
    hint.style.left = `${left}px`;
    hint.style.top = `${Math.max(4, top - 48)}px`;
    hint.innerHTML = `<code>${escapeHtml(info.sig)}</code><span>${escapeHtml(info.desc)}</span>`;
    hint.hidden = false;
  }

  function updateIntelligenceAndGhost(forceOpen = false) {
    const ta = el('codeTextarea');
    if (!ta) return;
    const { prefix, start, caret } = getCaretTokenContext();
    const selEmpty = (ta.selectionStart ?? 0) === (ta.selectionEnd ?? 0);
    const nextChar = ta.value[caret] || '';
    const atTokenEnd = selEmpty && (!nextChar || !/[A-Za-z0-9_]/.test(nextChar));

    activeGhostSuffix = '';
    if ((prefix.length >= 1 || forceOpen) && selEmpty) {
      const low = prefix.toLowerCase();
      const dict = buildCompletionDictionary();
      const KIND_RANK = { API: 0, VAR: 1, MATH: 2, FN: 3, TYPE: 4, KW: 5, CFG: 6, TXT: 7 };
      const matches = dict
        .filter((d) => !(d.kind === 'TXT' && low && d.label.toLowerCase() === low))
        .filter((d) => !low || d.label.toLowerCase().startsWith(low))
        .sort((a, b) => {
          const ra = KIND_RANK[a.kind] ?? 8;
          const rb = KIND_RANK[b.kind] ?? 8;
          if (ra !== rb) return ra - rb;
          return a.label.length - b.label.length || a.label.localeCompare(b.label);
        });

      const ghostMatch = matches.find((m) => m.label.length > prefix.length);
      if (settings.wordPrediction && atTokenEnd && prefix.length >= 2 && ghostMatch) {
        activeGhostSuffix = ghostMatch.label.slice(prefix.length);
      }

      if (settings.autocomplete && (prefix.length >= 1 || forceOpen) && matches.length > 0) {
        acItems = matches.slice(0, 8);
        acSelected = Math.min(acSelected, acItems.length - 1);
        acTokenPrefix = prefix;
        acTokenStart = start;
        renderAutocompletePopup();
      } else {
        hideAutocomplete();
      }
    } else {
      hideAutocomplete();
    }
    updateSignatureHint();
  }

  function updateLineNumbersAndStatus() {
    const ta = el('codeTextarea');
    if (!ta) return;
    const lines = ta.value.split('\n').length;
    if (el('lineNumbers')) {
      el('lineNumbers').textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
    }
    const pos = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? pos;
    const before = ta.value.slice(0, pos);
    const curLine = before.split('\n').length;
    const col = pos - before.lastIndexOf('\n');
    const selLen = Math.max(0, end - pos);
    if (el('statusCursor')) el('statusCursor').textContent = `Ln ${curLine}, Col ${col}`;
    if (el('statusSelection')) el('statusSelection').textContent = selLen > 0 ? `${selLen} sel` : `${ta.value.length} chars`;
    if (el('statusLineCount')) el('statusLineCount').textContent = `${lines} lines`;

    // Active line bar position
    const hlBar = el('activeLineHighlight');
    if (hlBar) {
      const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
      const topPad = parseFloat(getComputedStyle(ta).paddingTop) || 12;
      hlBar.style.top = `${topPad + (curLine - 1) * lh - ta.scrollTop}px`;
      hlBar.style.height = `${lh}px`;
    }
  }

  function renderEditorVisuals() {
    const ta = el('codeTextarea');
    const pre = el('codeHighlightPre');
    if (!ta || !pre) return;
    updateLineNumbersAndStatus();
    if (!settings.syntaxHighlight && !activeGhostSuffix) {
      pre.textContent = ta.value + (ta.value.endsWith('\n') ? ' ' : '');
      return;
    }
    const caret = ta.selectionStart ?? ta.value.length;
    const ghost = settings.wordPrediction ? activeGhostSuffix : '';
    pre.innerHTML = highlightCppWithGhost(ta.value, caret, ghost, getVariables());
  }

  function syncScroll() {
    const ta = el('codeTextarea');
    const pre = el('codeHighlightPre');
    const ln = el('lineNumbers');
    if (!ta) return;
    if (pre) {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    }
    if (ln) ln.scrollTop = ta.scrollTop;
    updateLineNumbersAndStatus();
  }

  function handleInput(recordDebounced = true) {
    const ta = el('codeTextarea');
    const file = getActiveFile();
    setActiveFileContent(file, ta.value);
    if (recordDebounced) {
      clearTimeout(historyTimer);
      historyTimer = setTimeout(() => commitHistoryNow(), 450);
    }
    updateIntelligenceAndGhost(false);
    renderEditorVisuals();
    onFilesUpdated();
  }

  function getSelectedLineRange(text, s, e) {
    const lineStart = text.lastIndexOf('\n', Math.max(0, s - 1)) + 1;
    const adjEnd = e > s && text[e - 1] === '\n' ? e - 1 : e;
    let lineEnd = text.indexOf('\n', adjEnd);
    if (lineEnd === -1) lineEnd = text.length;
    return { lineStart, lineEnd };
  }

  function toggleLineComment() {
    const ta = el('codeTextarea');
    const val = ta.value;
    const s = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const { lineStart, lineEnd } = getSelectedLineRange(val, s, end);
    const lines = val.slice(lineStart, lineEnd).split('\n');
    const nonEmpty = lines.filter((l) => l.trim().length > 0);
    const allCommented = nonEmpty.length > 0 && nonEmpty.every((l) => l.trimStart().startsWith('//'));
    let newLines;
    if (allCommented) {
      newLines = lines.map((l) => l.replace(/^(\s*)\/\/\s?/, '$1'));
    } else {
      const minIndent = nonEmpty.reduce((min, l) => Math.min(min, l.match(/^(\s*)/)[1].length), Infinity);
      const pad = Number.isFinite(minIndent) ? minIndent : 0;
      newLines = lines.map((l) => (l.trim().length === 0 ? l : `${l.slice(0, pad)}// ${l.slice(pad)}`));
    }
    const rep = newLines.join('\n');
    applyTextWithHistory(`${val.slice(0, lineStart)}${rep}${val.slice(lineEnd)}`, lineStart, lineStart + rep.length);
    ta.focus();
  }

  function toggleBlockComment() {
    const ta = el('codeTextarea');
    const val = ta.value;
    const s = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const sel = val.slice(s, end);
    const rep = sel.startsWith('/*') && sel.endsWith('*/') && sel.length >= 4 ? sel.slice(2, -2).trim() : `/* ${sel || 'comment'} */`;
    applyTextWithHistory(`${val.slice(0, s)}${rep}${val.slice(end)}`, s, s + rep.length);
    ta.focus();
  }

  function moveLines(dir) {
    const ta = el('codeTextarea');
    const val = ta.value;
    const s = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const lines = val.split('\n');
    const startLine = val.slice(0, s).split('\n').length - 1;
    const endLine = val.slice(0, end > s && val[end - 1] === '\n' ? end - 1 : end).split('\n').length - 1;
    if (dir < 0 && startLine === 0) return;
    if (dir > 0 && endLine >= lines.length - 1) return;
    const chunk = lines.slice(startLine, endLine + 1);
    if (dir < 0) {
      const swap = lines[startLine - 1];
      lines.splice(startLine - 1, chunk.length + 1, ...chunk, swap);
      applyTextWithHistory(lines.join('\n'), Math.max(0, s - swap.length - 1), Math.max(0, end - swap.length - 1));
    } else {
      const swap = lines[endLine + 1];
      lines.splice(startLine, chunk.length + 1, swap, ...chunk);
      applyTextWithHistory(lines.join('\n'), s + swap.length + 1, end + swap.length + 1);
    }
  }

  function duplicateLine() {
    const ta = el('codeTextarea');
    const val = ta.value;
    const s = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const { lineStart, lineEnd } = getSelectedLineRange(val, s, end);
    const block = val.slice(lineStart, lineEnd);
    applyTextWithHistory(`${val.slice(0, lineEnd)}\n${block}${val.slice(lineEnd)}`, s + block.length + 1, end + block.length + 1);
  }

  function deleteLine() {
    const ta = el('codeTextarea');
    const val = ta.value;
    const s = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const { lineStart, lineEnd } = getSelectedLineRange(val, s, end);
    const rmEnd = lineEnd < val.length && val[lineEnd] === '\n' ? lineEnd + 1 : lineEnd;
    const rmStart = rmEnd === lineEnd && lineStart > 0 ? lineStart - 1 : lineStart;
    applyTextWithHistory(`${val.slice(0, rmStart)}${val.slice(rmEnd)}`, rmStart, rmStart);
  }

  function formatCurrentFile() {
    const ta = el('codeTextarea');
    const formatted = formatCppCode(ta.value, settings.tabSize);
    applyTextWithHistory(formatted, ta.selectionStart ?? 0, ta.selectionStart ?? 0);
    appendConsole(`[OK] จัดรูปแบบโค้ด ${getActiveFile()} (Format) เรียบร้อยแล้ว`);
  }

  // Inline Find & Replace
  function openFindBar(focusReplace = false) {
    const bar = el('editorFindBar');
    const ta = el('codeTextarea');
    if (!bar) return;
    bar.hidden = false;
    const sel = ta.value.slice(ta.selectionStart ?? 0, ta.selectionEnd ?? 0);
    if (sel && !sel.includes('\n') && sel.length <= 80) el('findInput').value = sel;
    refreshFindMatches(true);
    if (focusReplace) el('replaceInput').focus();
    else { el('findInput').focus(); el('findInput').select(); }
  }

  function closeFindBar() {
    if (el('editorFindBar')) el('editorFindBar').hidden = true;
    el('codeTextarea')?.focus();
  }

  function refreshFindMatches(jumpFirst = false) {
    const needle = el('findInput')?.value || '';
    const hay = el('codeTextarea')?.value || '';
    findMatches = [];
    if (needle) {
      const lh = hay.toLowerCase();
      const ln = needle.toLowerCase();
      let idx = 0;
      while ((idx = lh.indexOf(ln, idx)) !== -1) {
        findMatches.push({ start: idx, end: idx + needle.length });
        idx += Math.max(1, needle.length);
      }
    }
    if (!findMatches.length) {
      findIdx = -1;
      if (el('findCount')) el('findCount').textContent = '0/0';
      return;
    }
    if (jumpFirst || findIdx < 0 || findIdx >= findMatches.length) findIdx = 0;
    if (el('findCount')) el('findCount').textContent = `${findIdx + 1}/${findMatches.length}`;
    if (jumpFirst) selectFindMatch(findIdx);
  }

  function selectFindMatch(idx) {
    if (!findMatches.length) return;
    findIdx = ((idx % findMatches.length) + findMatches.length) % findMatches.length;
    const m = findMatches[findIdx];
    const ta = el('codeTextarea');
    ta.focus();
    ta.setSelectionRange(m.start, m.end);
    if (el('findCount')) el('findCount').textContent = `${findIdx + 1}/${findMatches.length}`;
    renderEditorVisuals();
  }

  function replaceCurrentMatch() {
    const needle = el('findInput')?.value || '';
    if (!needle) return;
    refreshFindMatches(false);
    if (!findMatches.length) return;
    const m = findMatches[Math.max(0, findIdx)];
    const ta = el('codeTextarea');
    const rep = el('replaceInput')?.value ?? '';
    applyTextWithHistory(`${ta.value.slice(0, m.start)}${rep}${ta.value.slice(m.end)}`, m.start, m.start + rep.length);
    refreshFindMatches(true);
  }

  function replaceAllMatches() {
    const needle = el('findInput')?.value || '';
    if (!needle) return;
    const rep = el('replaceInput')?.value ?? '';
    const ta = el('codeTextarea');
    const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    applyTextWithHistory(ta.value.replace(new RegExp(esc, 'gi'), () => rep), 0, 0);
    refreshFindMatches(false);
  }

  function handleKeyDown(e) {
    const ta = el('codeTextarea');
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const pop = el('autocompletePopup');
    const acOpen = pop && !pop.hidden && acItems.length > 0;

    if (acOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); acSelected = (acSelected + 1) % acItems.length; renderAutocompletePopup(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); acSelected = (acSelected - 1 + acItems.length) % acItems.length; renderAutocompletePopup(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); acceptAutocompleteItem(acItems[acSelected]); return; }
      if (e.key === 'Escape') { e.preventDefault(); hideAutocomplete(); return; }
    }

    // Inline word prediction accept on Tab or ArrowRight
    if (settings.wordPrediction && activeGhostSuffix && !ctrl && !e.altKey) {
      if (e.key === 'Tab' || e.key === 'ArrowRight') {
        e.preventDefault();
        const c = ta.selectionStart ?? 0;
        const val = ta.value;
        applyTextWithHistory(`${val.slice(0, c)}${activeGhostSuffix}${val.slice(c)}`, c + activeGhostSuffix.length, c + activeGhostSuffix.length);
        activeGhostSuffix = '';
        hideAutocomplete();
        renderEditorVisuals();
        return;
      }
    }

    if (ctrl && e.code === 'Space') {
      e.preventDefault();
      updateIntelligenceAndGhost(true);
      return;
    }

    if (ctrl && !e.shiftKey && !e.altKey && key === 'z') { e.preventDefault(); undo(); return; }
    if ((ctrl && !e.altKey && key === 'y') || (ctrl && e.shiftKey && !e.altKey && key === 'z')) { e.preventDefault(); redo(); return; }
    if (ctrl && !e.altKey && (key === '/' || e.code === 'Slash')) { e.preventDefault(); toggleLineComment(); return; }
    if (e.shiftKey && e.altKey && key === 'a') { e.preventDefault(); toggleBlockComment(); return; }
    if ((e.shiftKey && e.altKey && key === 'f') || (ctrl && e.shiftKey && key === 'f')) { e.preventDefault(); formatCurrentFile(); return; }
    if (ctrl && !e.shiftKey && !e.altKey && (key === 'f' || key === 'h')) { e.preventDefault(); openFindBar(key === 'h'); return; }
    if (ctrl && !e.shiftKey && !e.altKey && key === 'd') { e.preventDefault(); duplicateLine(); return; }
    if (ctrl && e.shiftKey && !e.altKey && key === 'k') { e.preventDefault(); deleteLine(); return; }
    if (e.altKey && !ctrl && e.key === 'ArrowUp') { e.preventDefault(); moveLines(-1); return; }
    if (e.altKey && !ctrl && e.key === 'ArrowDown') { e.preventDefault(); moveLines(1); return; }

    if (e.key === 'Tab') {
      e.preventDefault();
      const indent = ' '.repeat(Number(settings.tabSize) === 2 ? 2 : 4);
      const val = ta.value;
      const s = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      if (s === end && !e.shiftKey) {
        applyTextWithHistory(`${val.slice(0, s)}${indent}${val.slice(end)}`, s + indent.length, s + indent.length);
        return;
      }
      const { lineStart, lineEnd } = getSelectedLineRange(val, s, end);
      const lines = val.slice(lineStart, lineEnd).split('\n');
      let firstDelta = 0;
      let totalDelta = 0;
      const newLines = lines.map((l, idx) => {
        if (e.shiftKey) {
          const rm = l.match(new RegExp(`^ {1,${indent.length}}|\\t`));
          const n = rm ? rm[0].length : 0;
          if (idx === 0) firstDelta = -n;
          totalDelta -= n;
          return l.slice(n);
        }
        if (idx === 0) firstDelta = indent.length;
        totalDelta += indent.length;
        return `${indent}${l}`;
      });
      const rep = newLines.join('\n');
      applyTextWithHistory(`${val.slice(0, lineStart)}${rep}${val.slice(lineEnd)}`, Math.max(lineStart, s + firstDelta), Math.max(lineStart, end + totalDelta));
      return;
    }

    if (e.key === 'Enter' && !ctrl) {
      const s = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      const val = ta.value;
      const indent = ' '.repeat(Number(settings.tabSize) === 2 ? 2 : 4);
      const lineStart = val.lastIndexOf('\n', Math.max(0, s - 1)) + 1;
      const curLine = val.slice(lineStart, s);
      const base = (curLine.match(/^(\s*)/)?.[1]) || '';
      const prevChar = curLine.trimEnd().slice(-1);
      const nextChar = val.slice(end).trimStart()[0];
      e.preventDefault();
      if (prevChar === '{' && nextChar === '}') {
        const inner = `${base}${indent}`;
        const ins = `\n${inner}\n${base}`;
        applyTextWithHistory(`${val.slice(0, s)}${ins}${val.slice(end)}`, s + 1 + inner.length, s + 1 + inner.length);
      } else {
        const ins = `\n${base}${prevChar === '{' ? indent : ''}`;
        applyTextWithHistory(`${val.slice(0, s)}${ins}${val.slice(end)}`, s + ins.length, s + ins.length);
      }
      return;
    }

    if (settings.autoCloseBrackets) {
      const PAIRS = { '(': ')', '{': '}', '[': ']', '"': '"', "'": "'" };
      if (!ctrl && !e.altKey && PAIRS[e.key]) {
        const s = ta.selectionStart ?? 0;
        const end = ta.selectionEnd ?? 0;
        const val = ta.value;
        if (s === end && val[s] === e.key && (e.key === '"' || e.key === '\'')) {
          e.preventDefault();
          ta.selectionStart = ta.selectionEnd = s + 1;
          return;
        }
        e.preventDefault();
        const sel = val.slice(s, end);
        const newVal = `${val.slice(0, s)}${e.key}${sel}${PAIRS[e.key]}${val.slice(end)}`;
        applyTextWithHistory(newVal, s + 1, s === end ? s + 1 : end + 1);
        return;
      }
      if (!ctrl && !e.altKey && [')', '}', ']'].includes(e.key)) {
        const s = ta.selectionStart ?? 0;
        if (s === (ta.selectionEnd ?? 0) && ta.value[s] === e.key) {
          e.preventDefault();
          ta.selectionStart = ta.selectionEnd = s + 1;
        }
      }
    }
  }

  function bindEvents() {
    const ta = el('codeTextarea');
    if (!ta) return;

    const notifyCursorLine = (trigger) => {
      if (!settings.clickToSeekSim || typeof onCursorLineChange !== 'function') return;
      const caret = ta.selectionStart ?? 0;
      const lineNumber = ta.value.slice(0, caret).split('\n').length;
      onCursorLineChange({ file: getActiveFile(), lineNumber, code: ta.value, trigger });
    };

    ta.addEventListener('input', () => handleInput(true));
    ta.addEventListener('scroll', syncScroll);
    ta.addEventListener('keydown', handleKeyDown);
    ta.addEventListener('keyup', (e) => {
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
        updateIntelligenceAndGhost(false);
      }
      renderEditorVisuals();
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
        notifyCursorLine('key');
      }
    });
    ta.addEventListener('click', () => {
      hideAutocomplete();
      updateSignatureHint();
      renderEditorVisuals();
      notifyCursorLine('click');
    });
    ta.addEventListener('blur', () => {
      setTimeout(() => {
        hideAutocomplete();
        if (el('signatureHintPopup')) el('signatureHintPopup').hidden = true;
      }, 150);
    });

    const ln = el('lineNumbers');
    if (ln) {
      ln.addEventListener('click', (e) => {
        const cs = getComputedStyle(ta);
        const lh = parseFloat(cs.lineHeight) || 20;
        const topPad = parseFloat(cs.paddingTop) || 12;
        const rect = ln.getBoundingClientRect();
        const relY = e.clientY - rect.top + ta.scrollTop - topPad;
        const lines = ta.value.split('\n');
        const targetLine = Math.max(1, Math.min(lines.length, Math.floor(relY / lh) + 1));

        let charOffset = 0;
        for (let i = 0; i < targetLine - 1; i++) charOffset += lines[i].length + 1;
        const leadingWs = (lines[targetLine - 1].match(/^(\s*)/)?.[1] || '').length;
        const caret = charOffset + leadingWs;
        ta.focus();
        ta.setSelectionRange(caret, caret);
        renderEditorVisuals();
        notifyCursorLine('gutter');
      });
    }

    if (el('btnCodeUndo')) el('btnCodeUndo').onclick = () => { undo(); ta.focus(); };
    if (el('btnCodeRedo')) el('btnCodeRedo').onclick = () => { redo(); ta.focus(); };
    if (el('btnCodeFormat')) el('btnCodeFormat').onclick = () => { formatCurrentFile(); ta.focus(); };
    if (el('btnCodeComment')) el('btnCodeComment').onclick = toggleLineComment;
    if (el('btnCodeFind')) el('btnCodeFind').onclick = () => openFindBar(false);
    if (el('btnCodeIdePrefs')) el('btnCodeIdePrefs').onclick = () => openIdeSettingsModal();
    if (el('btnCodeShortcuts')) el('btnCodeShortcuts').onclick = () => { el('shortcutsModal').hidden = false; };
    if (el('btnCloseShortcuts')) el('btnCloseShortcuts').onclick = () => { el('shortcutsModal').hidden = true; };

    if (el('findInput')) {
      el('findInput').oninput = () => refreshFindMatches(true);
      el('findInput').onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); selectFindMatch(findIdx + (e.shiftKey ? -1 : 1)); }
        else if (e.key === 'Escape') closeFindBar();
      };
    }
    if (el('btnFindPrev')) el('btnFindPrev').onclick = () => selectFindMatch(findIdx - 1);
    if (el('btnFindNext')) el('btnFindNext').onclick = () => selectFindMatch(findIdx + 1);
    if (el('btnReplaceOne')) el('btnReplaceOne').onclick = replaceCurrentMatch;
    if (el('btnReplaceAll')) el('btnReplaceAll').onclick = replaceAllMatches;
    if (el('btnCloseFind')) el('btnCloseFind').onclick = closeFindBar;

    // IDE Settings Modal bindings
    const modalToggleKeys = [
      ['setSyntaxHighlight', 'syntaxHighlight'],
      ['setAutocomplete', 'autocomplete'],
      ['setWordPrediction', 'wordPrediction'],
      ['setParameterHints', 'parameterHints'],
      ['setClickToSeekSim', 'clickToSeekSim'],
      ['setCameraFollowRobot', 'cameraFollowRobot'],
      ['setAutoCloseBrackets', 'autoCloseBrackets'],
      ['setWordWrap', 'wordWrap']
    ];
    for (const [id, key] of modalToggleKeys) {
      const btn = el(id);
      if (btn) {
        btn.onclick = () => {
          settings[key] = !settings[key];
          saveSettings();
          applySettingsToDom();
        };
      }
    }
    if (el('setFontSize')) {
      el('setFontSize').onchange = () => {
        settings.fontSize = Math.max(11, Math.min(20, parseInt(el('setFontSize').value, 10) || 13));
        saveSettings();
        applySettingsToDom();
      };
    }
    if (el('setTabSize')) {
      el('setTabSize').onchange = () => {
        settings.tabSize = Number(el('setTabSize').value) === 2 ? 2 : 4;
        saveSettings();
        applySettingsToDom();
      };
    }
    if (el('btnCloseIdeSettings')) el('btnCloseIdeSettings').onclick = () => { el('ideSettingsModal').hidden = true; };
    if (el('btnDoneIdeSettings')) el('btnDoneIdeSettings').onclick = () => { el('ideSettingsModal').hidden = true; };
    if (el('btnResetIdeSettings')) {
      el('btnResetIdeSettings').onclick = () => {
        settings = { ...DEFAULT_IDE_SETTINGS };
        saveSettings();
        applySettingsToDom();
      };
    }
    if (el('btnOpenIdeSettings')) el('btnOpenIdeSettings').onclick = openIdeSettingsModal;

    applySettingsToDom();
  }

  function openIdeSettingsModal() {
    syncSettingsModalControls();
    if (el('ideSettingsModal')) el('ideSettingsModal').hidden = false;
  }

  function loadFileIntoEditor(filename, content) {
    const ta = el('codeTextarea');
    if (!ta) return;
    ta.value = content || '';
    ensureHistory(filename, ta.value);
    activeGhostSuffix = '';
    hideAutocomplete();
    renderEditorVisuals();
    if (el('editorFindBar') && !el('editorFindBar').hidden) refreshFindMatches(false);
  }

  function resetAllHistory() {
    Object.keys(codeHistory).forEach((k) => delete codeHistory[k]);
  }

  return {
    bindEvents,
    loadFileIntoEditor,
    renderEditorVisuals,
    undo,
    redo,
    formatCurrentFile,
    toggleLineComment,
    openFindBar,
    closeFindBar,
    openIdeSettingsModal,
    resetAllHistory,
    getSettings: () => ({ ...settings })
  };
}
