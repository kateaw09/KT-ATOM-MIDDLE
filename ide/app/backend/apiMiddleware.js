'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const PORT = Number(process.env.PORT || 3080);
const FQBN = process.env.FQBN || 'PTBOT_ESP32:esp32:atom_vx';
const IDE_DIR = path.resolve(__dirname, '..');
const BUILD_DIR = process.env.BUILD_DIR || path.join(os.tmpdir(), 'kt-atom-ide-build');
const MAIN_SKETCH_NAME = 'KT_ATOM_Middle';
const MAIN_SKETCH_FILE = `${MAIN_SKETCH_NAME}.ino`;
const PTBOT_CORE_ID = 'PTBOT_ESP32:esp32';
const PTBOT_BOARD_INDEX_URL = 'https://raw.githubusercontent.com/pt-robotics/esp32/refs/heads/main/package_ptbot_index.json';
const STAGE_SKETCH_DIR = path.join(os.tmpdir(), 'kt-atom-ide-sketch', MAIN_SKETCH_NAME);

const EDITABLE_FILES = [
  'RunMode1.ino',
  'RunMode2.ino',
  'RunMode3.ino',
  'Variables.ino',
  'Config.ino',
  'Move.ino',
  'SpinTurn.ino',
  'Motor.ino',
  'PoseEKF.ino',
  'PathControl.ino',
  'Interface.ino',
  'Examples.ino',
  'KT_ATOM_Middle.ino'
];

const CONFIG_SCHEMA = [
  { key: 'enableMultiMode', type: 'bool' },
  { key: 'currentRunMode', type: 'int' },
  { key: 'useCodeMotionDefaults', type: 'bool' },
  { key: 'forceOverwriteFlashFromCode', type: 'bool' },
  { key: 'fwdKp', type: 'float' },
  { key: 'fwdKd', type: 'float' },
  { key: 'bwdKp', type: 'float' },
  { key: 'bwdKd', type: 'float' },
  { key: 'kp_turn', type: 'float' },
  { key: 'kd_turn', type: 'float' },
  { key: 'Set_kp', type: 'float' },
  { key: 'Set_kd', type: 'float' },
  { key: 'kp_time', type: 'float' },
  { key: 'kd_time', type: 'float' },
  { key: 'spinKp', type: 'float' },
  { key: 'spinKd', type: 'float' },
  { key: 'spinMinSpeed', type: 'int' },
  { key: 'spinMaxSpeed', type: 'int' },
  { key: 'turnFrontKp', type: 'float' },
  { key: 'turnFrontKd', type: 'float' },
  { key: 'turnFrontMinSpeed', type: 'int' },
  { key: 'turnFrontMaxSpeed', type: 'int' },
  { key: 'turnBackKp', type: 'float' },
  { key: 'turnBackKd', type: 'float' },
  { key: 'turnBackMinSpeed', type: 'int' },
  { key: 'turnBackMaxSpeed', type: 'int' },
  { key: 'threshold_spinDegree', type: 'float' },
  { key: 'spinLeftOffsetDeg', type: 'float' },
  { key: 'smallAngle_threshold', type: 'float' },
  { key: 'smallAngle_turnDegree', type: 'float' },
  { key: 'turnRightOffsetDeg', type: 'float' },
  { key: 'enableTurnDistComp', type: 'bool' },
  { key: 'turnEntryCompCm', type: 'float' },
  { key: 'turnExitRadiusCm', type: 'float' },
  { key: 'enableSpeedInvariantDist', type: 'bool' },
  { key: 'moveAccelRate', type: 'float' },
  { key: 'moveDecelRate', type: 'float' },
  { key: 'moveArriveSpeed', type: 'int' },
  { key: 'motorMinMoveSpeed', type: 'int' },
  { key: 'enableEndPositionTrim', type: 'bool' },
  { key: 'enableBoxDistCal', type: 'bool' },
  { key: 'distOffsetCm', type: 'float' },
  { key: 'boxTileCm', type: 'float' },
  { key: 'box1Cm', type: 'float' },
  { key: 'box2Cm', type: 'float' },
  { key: 'box3Cm', type: 'float' },
  { key: 'box4Cm', type: 'float' },
  { key: 'box5Cm', type: 'float' },
  { key: 'box6Cm', type: 'float' },
  { key: 'box7Cm', type: 'float' },
  { key: 'box8Cm', type: 'float' },
  { key: 'motorTrim', type: 'int' },
  { key: 'servoDropDelayMs', type: 'int' },
  { key: 'ticksPerCm', type: 'float' },
  { key: 'distTuneMm', type: 'int' },
  { key: 'calRun30cmMs', type: 'int' },
  { key: 'frontLock', type: 'int' },
  { key: 'frontDrop', type: 'int' },
  { key: 'backLock', type: 'int' },
  { key: 'backDrop', type: 'int' },
  { key: 'showCmdOnRun', type: 'bool' },
  { key: 'beepOnCmd', type: 'bool' },
  { key: 'effectiveTrackCm', type: 'float' },
  { key: 'motorI2cDedupMs', type: 'int' },
  { key: 'velKs', type: 'float' },
  { key: 'velKv', type: 'float' },
  { key: 'velKp', type: 'float' },
  { key: 'velKi', type: 'float' },
  { key: 'velKd', type: 'float' },
  { key: 'velIntegralLimit', type: 'float' },
  { key: 'velEmaAlpha', type: 'float' },
  { key: 'ekfQPos', type: 'float' },
  { key: 'ekfQHeadingBase', type: 'float' },
  { key: 'ekfQHeadingTurn', type: 'float' },
  { key: 'ekfRImuYaw', type: 'float' },
  { key: 'ppLookaheadMinCm', type: 'float' },
  { key: 'ppLookaheadMaxCm', type: 'float' },
  { key: 'ppLookaheadGain', type: 'float' },
  { key: 'ppMaxLatAccel', type: 'float' },
  { key: 'ppGoalToleranceCm', type: 'float' },
  { key: 'ppWaypointSpacingCm', type: 'float' }
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.bin': 'application/octet-stream'
};

function firstExistingDir(candidates) {
  for (const dir of candidates) {
    if (dir && fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      return dir;
    }
  }
  return '';
}

function findSketchDir() {
  const candidates = [
    process.env.SKETCH_DIR,
    path.resolve(IDE_DIR, '..', '..'),
    path.resolve(IDE_DIR, '..'),
    '/workspace/KT_ATOM_Middle',
    '/app/KT_ATOM_Middle'
  ];
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, MAIN_SKETCH_FILE))) {
      return dir;
    }
  }
  return path.resolve(IDE_DIR, '..');
}

function findLibrariesDir(sketchDir) {
  return firstExistingDir([
    process.env.LIBRARIES_DIR,
    path.join(sketchDir, 'libraries'),
    path.join(os.homedir(), 'Documents', 'Arduino', 'libraries'),
    '/root/Arduino/libraries'
  ]);
}

function findArduinoCli() {
  const localBinName = process.platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli';
  const candidates = [
    process.env.ARDUINO_CLI,
    path.join(IDE_DIR, 'tools', localBinName),
    'C:\\Program Files\\Arduino IDE\\resources\\app\\lib\\backend\\resources\\arduino-cli.exe',
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Arduino IDE', 'resources', 'app', 'lib', 'backend', 'resources', 'arduino-cli.exe')
      : '',
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Arduino IDE', 'resources', 'app', 'lib', 'backend', 'resources', 'arduino-cli.exe'),
    '/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli',
    '/opt/homebrew/bin/arduino-cli',
    '/usr/local/bin/arduino-cli',
    '/usr/bin/arduino-cli'
  ].filter(Boolean);

  for (const bin of candidates) {
    if (fs.existsSync(bin)) return bin;
  }

  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const out = execFileSync(cmd, ['arduino-cli'], { encoding: 'utf8', timeout: 3000 }).trim();
    if (out) return out.split(/\r?\n/)[0].trim();
  } catch (_) {}
  return 'arduino-cli';
}

const SKETCH_DIR = findSketchDir();
const LIBRARIES_DIR = findLibrariesDir(SKETCH_DIR);
let ARDUINO_CLI = findArduinoCli();
const VERSIONS_DIR = path.join(SKETCH_DIR, '.kt-versions');
const PLUGINS_DIR = path.join(SKETCH_DIR, 'extentions-plugins');
const PLUGINS_CONFIG_FILE = path.join(SKETCH_DIR, '.kt-plugins.json');
const PLUGIN_SDK_ROOT = path.join(IDE_DIR, 'src');
const ALLOWED_SDK_SUBDIRS = new Set(['sim', 'blocks']);

function getArduinoCli() {
  if (!ARDUINO_CLI || (ARDUINO_CLI !== 'arduino-cli' && !fs.existsSync(ARDUINO_CLI))) {
    ARDUINO_CLI = findArduinoCli();
  } else if (ARDUINO_CLI === 'arduino-cli') {
    const refreshed = findArduinoCli();
    if (refreshed && refreshed !== 'arduino-cli') ARDUINO_CLI = refreshed;
  }
  return ARDUINO_CLI;
}

function checkArduinoCliAvailable() {
  try {
    execFileSync(getArduinoCli(), ['version'], { encoding: 'utf8', timeout: 3000 });
    return true;
  } catch (_) {
    return false;
  }
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseConfigIno(content) {
  const result = {};
  for (const item of CONFIG_SCHEMA) {
    const re = new RegExp(`^\\s*(?:bool|int|float|unsigned\\s+long)\\s+${escapeRegExp(item.key)}\\s*=\\s*([^;]+);`, 'm');
    const match = content.match(re);
    if (!match) continue;
    const raw = match[1].trim();
    if (item.type === 'bool') {
      result[item.key] = raw === 'true';
    } else if (item.type === 'int') {
      result[item.key] = parseInt(raw, 10);
    } else if (item.type === 'float') {
      result[item.key] = parseFloat(raw.replace(/f$/i, ''));
    }
  }
  for (const arrKey of ['senMin', 'senMax', 'senThresh']) {
    const re = new RegExp(`^\\s*int\\s+${arrKey}\\s*\\[\\s*4\\s*\\]\\s*=\\s*\\{([^}]*)\\}\\s*;`, 'm');
    const match = content.match(re);
    if (!match) continue;
    const vals = match[1].split(',').map((s) => parseInt(s.trim(), 10));
    if (vals.length === 4 && vals.every((n) => Number.isFinite(n))) {
      result[arrKey] = vals;
    }
  }
  return result;
}

function formatFloatLiteral(num) {
  const n = Number(num);
  if (!Number.isFinite(n)) return '0.0f';
  const s = n.toString();
  return (s.includes('.') ? s : `${s}.0`) + 'f';
}

function applyConfigPatch(content, patch) {
  let updated = content;
  for (const item of CONFIG_SCHEMA) {
    if (!(item.key in patch)) continue;
    const val = patch[item.key];
    let formatted;
    if (item.type === 'bool') {
      formatted = val ? 'true' : 'false';
    } else if (item.type === 'int') {
      const iv = parseInt(val, 10);
      if (!Number.isFinite(iv)) continue;
      formatted = String(iv);
    } else {
      const fv = parseFloat(val);
      if (!Number.isFinite(fv)) continue;
      formatted = formatFloatLiteral(fv);
    }
    const re = new RegExp(`^(\\s*(?:bool|int|float|unsigned\\s+long)\\s+${escapeRegExp(item.key)}\\s*=\\s*)([^;]+)(;)`, 'm');
    updated = updated.replace(re, `$1${formatted}$3`);
  }
  for (const arrKey of ['senMin', 'senMax', 'senThresh']) {
    if (!Array.isArray(patch[arrKey]) || patch[arrKey].length !== 4) continue;
    const nums = patch[arrKey].map((v) => parseInt(v, 10));
    if (!nums.every((n) => Number.isFinite(n))) continue;
    const re = new RegExp(`^(\\s*int\\s+${arrKey}\\s*\\[\\s*4\\s*\\]\\s*=\\s*\\{)([^}]*)(\\}\\s*;)`, 'm');
    updated = updated.replace(re, `$1 ${nums.join(', ')} $3`);
  }
  return updated;
}

function parseSetupCodeDefaults(mainInoContent) {
  if (!mainInoContent) return null;
  if (/^\s*enableCodeMotionDefaults\s*\(\s*\)\s*;/m.test(mainInoContent)) return true;
  if (/^\s*\/\/\s*enableCodeMotionDefaults\s*\(\s*\)\s*;/m.test(mainInoContent)) return false;
  return null;
}

function applySetupCodeDefaultsPatch(mainInoContent, enabled) {
  if (!mainInoContent) return mainInoContent;
  const re = /^([ \t]*)(?:\/\/[ \t]*)?(enableCodeMotionDefaults\s*\(\s*\)\s*;)/m;
  if (!re.test(mainInoContent)) return mainInoContent;
  return mainInoContent.replace(re, enabled ? '$1$2' : '$1// $2');
}

function readAllSketchFiles() {
  const files = {};
  for (const name of EDITABLE_FILES) {
    const full = path.join(SKETCH_DIR, name);
    if (fs.existsSync(full)) {
      files[name] = fs.readFileSync(full, 'utf8');
    }
  }
  const config = files['Config.ino'] ? parseConfigIno(files['Config.ino']) : {};
  if (files[MAIN_SKETCH_FILE]) {
    const setupFlag = parseSetupCodeDefaults(files[MAIN_SKETCH_FILE]);
    if (setupFlag !== null) config.useCodeMotionDefaults = setupFlag;
  }
  return { files, config };
}

function saveSketchUpdates(payload) {
  if (!payload || typeof payload !== 'object') return;
  const incomingFiles = payload.files && typeof payload.files === 'object' ? payload.files : {};

  for (const [name, text] of Object.entries(incomingFiles)) {
    if (!EDITABLE_FILES.includes(name) || typeof text !== 'string') continue;
    fs.writeFileSync(path.join(SKETCH_DIR, name), text, 'utf8');
  }

  if (payload.configPatch && typeof payload.configPatch === 'object') {
    const cfgPath = path.join(SKETCH_DIR, 'Config.ino');
    if (fs.existsSync(cfgPath)) {
      const current = fs.readFileSync(cfgPath, 'utf8');
      const patched = applyConfigPatch(current, payload.configPatch);
      fs.writeFileSync(cfgPath, patched, 'utf8');
    }
    if ('useCodeMotionDefaults' in payload.configPatch) {
      const mainPath = path.join(SKETCH_DIR, MAIN_SKETCH_FILE);
      if (fs.existsSync(mainPath)) {
        const currentMain = fs.readFileSync(mainPath, 'utf8');
        const patchedMain = applySetupCodeDefaultsPatch(currentMain, !!payload.configPatch.useCodeMotionDefaults);
        if (patchedMain !== currentMain) {
          fs.writeFileSync(mainPath, patchedMain, 'utf8');
        }
      }
    }
  }
}

function runCommand(cmd, args, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const proc = spawn(cmd, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill('SIGKILL'); } catch (_) {}
    }, timeoutMs);

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: 1,
        stdout,
        stderr: `${stderr}\n${err.message}`.trim(),
        durationMs: Date.now() - start
      });
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) stderr += '\nCommand timed out.';
      resolve({
        exitCode: typeof code === 'number' ? code : 1,
        stdout,
        stderr,
        durationMs: Date.now() - start
      });
    });
  });
}

function parseUsageMetrics(logText) {
  const flashMatch = logText.match(/Sketch uses (\d+) bytes \((\d+)%\) of program storage space\. Maximum is (\d+) bytes\./);
  const ramMatch = logText.match(/Global variables use (\d+) bytes \((\d+)%\) of dynamic memory.*?Maximum is (\d+) bytes\./);
  return {
    flash: flashMatch ? {
      used: Number(flashMatch[1]),
      percent: Number(flashMatch[2]),
      max: Number(flashMatch[3])
    } : null,
    ram: ramMatch ? {
      used: Number(ramMatch[1]),
      percent: Number(ramMatch[2]),
      max: Number(ramMatch[3])
    } : null
  };
}

let cachedCliDataDir;

function getArduino15Candidates() {
  const list = [];
  if (process.env.ARDUINO_DIRECTORIES_DATA) {
    list.push(process.env.ARDUINO_DIRECTORIES_DATA);
  }
  if (cachedCliDataDir === undefined) {
    cachedCliDataDir = '';
    try {
      const out = execFileSync(getArduinoCli(), ['config', 'get', 'directories.data'], {
        encoding: 'utf8',
        timeout: 3000
      }).trim();
      if (out) cachedCliDataDir = out.split(/\r?\n/)[0].trim();
    } catch (_) {}
  }
  if (cachedCliDataDir) list.push(cachedCliDataDir);
  if (process.env.LOCALAPPDATA) list.push(path.join(process.env.LOCALAPPDATA, 'Arduino15'));
  list.push(
    path.join(os.homedir(), 'AppData', 'Local', 'Arduino15'),
    path.join(os.homedir(), 'Library', 'Arduino15'),
    path.join(os.homedir(), '.arduino15'),
    '/root/.arduino15'
  );
  return [...new Set(list.filter(Boolean))];
}

function findBootApp0() {
  for (const dataDir of getArduino15Candidates()) {
    const esp32Dir = path.join(dataDir, 'packages', 'PTBOT_ESP32', 'hardware', 'esp32');
    if (!fs.existsSync(esp32Dir)) continue;
    for (const ver of fs.readdirSync(esp32Dir)) {
      const candidate = path.join(esp32Dir, ver, 'tools', 'partitions', 'boot_app0.bin');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return '';
}

function checkBoardCoreInstalled() {
  for (const dataDir of getArduino15Candidates()) {
    const esp32Dir = path.join(dataDir, 'packages', 'PTBOT_ESP32', 'hardware', 'esp32');
    if (!fs.existsSync(esp32Dir)) continue;
    try {
      const entries = fs.readdirSync(esp32Dir, { withFileTypes: true });
      if (entries.some((ent) => ent.isDirectory())) return true;
    } catch (_) {}
  }
  try {
    const out = execFileSync(getArduinoCli(), ['core', 'list'], { encoding: 'utf8', timeout: 5000 });
    if (out.includes(PTBOT_CORE_ID)) return true;
  } catch (_) {}
  return false;
}

function resolveCompileSketchDir() {
  // Arduino CLI requires the sketch directory basename to match KT_ATOM_Middle.ino;
  // when cloned/downloaded as KT-ATOM-MIDDLE or KT-ATOM-MIDDLE-main, stage sources in temp.
  if (path.basename(SKETCH_DIR) === MAIN_SKETCH_NAME) {
    return { compileDir: SKETCH_DIR, staged: false };
  }
  fs.mkdirSync(STAGE_SKETCH_DIR, { recursive: true });
  const srcExtRe = /\.(ino|h|hpp|c|cpp|cc|cxx|s)$/i;
  const sourceNames = fs
    .readdirSync(SKETCH_DIR, { withFileTypes: true })
    .filter((ent) => ent.isFile() && srcExtRe.test(ent.name))
    .map((ent) => ent.name);
  const wanted = new Set(sourceNames);

  for (const ent of fs.readdirSync(STAGE_SKETCH_DIR, { withFileTypes: true })) {
    if (!wanted.has(ent.name)) {
      fs.rmSync(path.join(STAGE_SKETCH_DIR, ent.name), { recursive: true, force: true });
    }
  }

  for (const name of sourceNames) {
    const srcPath = path.join(SKETCH_DIR, name);
    const dstPath = path.join(STAGE_SKETCH_DIR, name);
    const srcBuf = fs.readFileSync(srcPath);
    let needsWrite = true;
    if (fs.existsSync(dstPath)) {
      try {
        const dstBuf = fs.readFileSync(dstPath);
        if (Buffer.compare(srcBuf, dstBuf) === 0) needsWrite = false;
      } catch (_) {}
    }
    if (needsWrite) {
      fs.writeFileSync(dstPath, srcBuf);
    }
  }

  return { compileDir: STAGE_SKETCH_DIR, staged: true };
}

function listBuildArtifacts() {
  if (!fs.existsSync(BUILD_DIR)) return [];
  const names = [
    'KT_ATOM_Middle.ino.merged.bin',
    'KT_ATOM_Middle.ino.bin',
    'KT_ATOM_Middle.ino.bootloader.bin',
    'KT_ATOM_Middle.ino.partitions.bin',
    'boot_app0.bin'
  ];
  const bootApp0 = findBootApp0();
  if (bootApp0 && fs.existsSync(path.join(BUILD_DIR, 'KT_ATOM_Middle.ino.bin'))) {
    const dest = path.join(BUILD_DIR, 'boot_app0.bin');
    if (!fs.existsSync(dest)) {
      try { fs.copyFileSync(bootApp0, dest); } catch (_) {}
    }
  }
  return names
    .map((name) => {
      const full = path.join(BUILD_DIR, name);
      if (!fs.existsSync(full)) return null;
      return {
        name,
        size: fs.statSync(full).size,
        url: `/api/build-artifact/${encodeURIComponent(name)}`
      };
    })
    .filter(Boolean);
}

async function listSerialPorts() {
  const ports = [];
  const seen = new Set();

  try {
    const res = await runCommand(getArduinoCli(), ['board', 'list', '--format', 'json'], 8000);
    if (res.exitCode === 0 && res.stdout) {
      const parsed = JSON.parse(res.stdout);
      const detected = Array.isArray(parsed) ? parsed : (parsed.detected_ports || []);
      for (const entry of detected) {
        const p = entry.port || entry;
        if (p && p.address && !seen.has(p.address)) {
          seen.add(p.address);
          const boardName = entry.matching_boards?.[0]?.name || p.protocol_label || 'Serial Device';
          ports.push({ address: p.address, label: boardName });
        }
      }
    }
  } catch (_) {}

  if (process.platform === 'win32') {
    try {
      const psOut = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-Command', '[System.IO.Ports.SerialPort]::GetPortNames() -join "`n"'],
        { encoding: 'utf8', timeout: 3000 }
      ).trim();
      for (const line of psOut.split(/\r?\n/)) {
        const addr = line.trim();
        if (addr && !seen.has(addr)) {
          seen.add(addr);
          ports.push({ address: addr, label: 'USB Serial Port' });
        }
      }
    } catch (_) {}
  } else {
    try {
      for (const entry of fs.readdirSync('/dev')) {
        if (/^(ttyUSB|ttyACM)\d+$/.test(entry)) {
          const addr = `/dev/${entry}`;
          if (!seen.has(addr)) {
            seen.add(addr);
            ports.push({ address: addr, label: 'Linux USB Serial' });
          }
        }
      }
    } catch (_) {}
  }

  return ports;
}

async function releaseSerialPortLocks() {
  if (process.platform !== 'win32') return { released: false };
  const targets = ['serial-monitor.exe'];
  let released = false;
  for (const exe of targets) {
    const res = await runCommand('taskkill', ['/F', '/IM', exe], 3000);
    if (res.exitCode === 0) released = true;
  }
  if (released) {
    await new Promise((r) => setTimeout(r, 350));
  }
  return { released };
}

async function readCalibrationOverSerial(port) {
  await releaseSerialPortLocks();
  const isWin = process.platform === 'win32';
  const script = isWin
    ? `
$sp = New-Object System.IO.Ports.SerialPort($env:KT_SERIAL_PORT, 115200, 'None', 8, 'One')
$sp.DtrEnable = $false
$sp.RtsEnable = $false
$sp.ReadTimeout = 500
$sp.NewLine = "\`n"
try {
  try {
    $sp.Open()
  } catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 3
  }
  $sp.DiscardInBuffer()
  Start-Sleep -Milliseconds 300
  $sp.Write("GET_CAL\`n")
  $deadline = (Get-Date).AddMilliseconds(7500)
  while ((Get-Date) -lt $deadline) {
    try {
      $line = $sp.ReadLine().Trim()
      if ($line -match 'KT_CAL:(\\{.*\\})') {
        Write-Output $Matches[1]
        exit 0
      }
    } catch [System.TimeoutException] {
      try { $sp.Write("GET_CAL\`n") } catch {}
    }
  }
  exit 2
} finally {
  if ($sp.IsOpen) { $sp.Close() }
}
`
    : `
import sys, time, re, serial
try:
    sp = serial.Serial(sys.argv[1], 115200, timeout=0.5)
except Exception as e:
    sys.stderr.write(str(e))
    sys.exit(3)
try:
    time.sleep(0.3)
    sp.write(b"GET_CAL\\n")
    deadline = time.time() + 7.5
    while time.time() < deadline:
        raw = sp.readline()
        if raw:
            line = raw.decode("utf-8", errors="ignore").strip()
            m = re.search(r"KT_CAL:(\\{.*\\})", line)
            if m:
                print(m.group(1))
                sys.exit(0)
        else:
            sp.write(b"GET_CAL\\n")
    sys.exit(2)
finally:
    sp.close()
`;

  const cmd = isWin ? 'powershell.exe' : 'python3';
  const args = isWin ? ['-NoProfile', '-Command', script] : ['-c', script, port];

  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      windowsHide: true,
      env: { ...process.env, KT_SERIAL_PORT: port }
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch (_) {}
    }, 11000);

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const out = stdout.trim();
      if (code === 0 && out.startsWith('{')) {
        try {
          const calibration = JSON.parse(out);
          return resolve({ ok: true, calibration });
        } catch (err) {
          return resolve({ ok: false, error: `ข้อมูล JSON ไม่สมบูรณ์: ${err.message}` });
        }
      }
      const errText = stderr.trim();
      if (code === 3 || /Access to the port .* is denied|UnauthorizedAccessException|PermissionError|busy/i.test(errText)) {
        return resolve({
          ok: false,
          error: `พอร์ต ${port} กำลังถูกโปรแกรมอื่นหรือ Serial Monitor ใช้งานอยู่ (${errText || 'Access denied'}) — กรุณาปิด Serial Monitor ในแท็บเบราว์เซอร์อื่น หรือปิด Arduino IDE แล้วลองใหม่อีกครั้ง`
        });
      }
      resolve({
        ok: false,
        error: errText || 'ไม่พบข้อมูล KT_CAL จากบอร์ด (กรุณาอัปโหลดเฟิร์มแวร์ล่าสุดลงหุ่น หรือกดปุ่มซิงค์ใหม่อีกครั้ง)'
      });
    });
  });
}

function sendJson(res, statusCode, data) {
  const buf = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store'
  });
  res.end(buf);
}

function readJsonBody(req, limitBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limitBytes) {
        reject(new Error('Request payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

// Local Git-Like Version Control Store (.kt-versions on host disk)
const ACTIVE_VERSION_FILE = path.join(VERSIONS_DIR, 'active.json');

function ensureVersionsDir() {
  if (!fs.existsSync(VERSIONS_DIR)) {
    fs.mkdirSync(VERSIONS_DIR, { recursive: true });
  }
  const gitignorePath = path.join(SKETCH_DIR, '.gitignore');
  try {
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      if (!content.split(/\r?\n/).some((l) => l.trim() === '.kt-versions/' || l.trim() === '.kt-versions')) {
        fs.appendFileSync(gitignorePath, `${content.endsWith('\n') ? '' : '\n'}.kt-versions/\n`, 'utf8');
      }
    } else {
      fs.writeFileSync(gitignorePath, '.kt-versions/\n', 'utf8');
    }
  } catch (_) {}
}

function isSafeVersionId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{3,80}$/.test(id);
}

function sanitizeImageExt(mimeOrName) {
  const s = String(mimeOrName || '').toLowerCase();
  if (s.includes('jpeg') || s.endsWith('.jpg') || s.endsWith('.jpeg')) return '.jpg';
  if (s.includes('webp') || s.endsWith('.webp')) return '.webp';
  if (s.includes('gif') || s.endsWith('.gif')) return '.gif';
  return '.png';
}

function parseDataUrlImage(imgObj) {
  if (!imgObj || typeof imgObj.dataUrl !== 'string') return null;
  const match = imgObj.dataUrl.match(/^data:(image\/[A-Za-z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const ext = sanitizeImageExt(match[1] || imgObj.name);
  return { ext, buf: Buffer.from(match[2], 'base64') };
}

function saveDataUrlImage(imagesDir, index, imgObj) {
  const parsed = parseDataUrlImage(imgObj);
  if (!parsed) return null;
  const rawName = String(imgObj.name || `photo_${index + 1}`)
    .replace(/\.[^.]+$/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .slice(0, 32) || `img_${index + 1}`;
  const filename = `${Date.now()}_${index + 1}_${rawName}${parsed.ext}`;
  const fullPath = path.join(imagesDir, filename);
  fs.writeFileSync(fullPath, parsed.buf);
  return {
    filename,
    originalName: String(imgObj.name || filename),
    size: parsed.buf.length,
    addedAt: new Date().toISOString()
  };
}

function saveCoverImage(verDir, coverObj) {
  const parsed = parseDataUrlImage(coverObj);
  if (!parsed) return null;
  for (const ext of ['.png', '.jpg', '.webp', '.gif']) {
    const oldPath = path.join(verDir, `cover${ext}`);
    if (ext !== parsed.ext && fs.existsSync(oldPath)) {
      try { fs.unlinkSync(oldPath); } catch (_) {}
    }
  }
  const filename = `cover${parsed.ext}`;
  const fullPath = path.join(verDir, filename);
  fs.writeFileSync(fullPath, parsed.buf);
  return {
    filename,
    size: parsed.buf.length,
    updatedAt: new Date().toISOString()
  };
}

function splitNormalizedLines(text) {
  if (!text) return [];
  return String(text).replace(/\r\n/g, '\n').split('\n');
}

function computeFileLineDiff(oldText, newText) {
  const a = splitNormalizedLines(oldText);
  const b = splitNormalizedLines(newText);
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;

  const am = a.slice(p, a.length - s);
  const bm = b.slice(p, b.length - s);
  const m = am.length;
  const n = bm.length;

  if (m === 0 && n === 0) {
    return { added: 0, removed: 0, diffLines: [], preview: [] };
  }

  const ops = [];
  if (m * n <= 160000) {
    const cols = n + 1;
    const dp = new Int32Array((m + 1) * cols);
    for (let i = m - 1; i >= 0; i--) {
      const rowOff = i * cols;
      const nextRowOff = (i + 1) * cols;
      for (let j = n - 1; j >= 0; j--) {
        dp[rowOff + j] = am[i] === bm[j]
          ? dp[nextRowOff + j + 1] + 1
          : Math.max(dp[nextRowOff + j], dp[rowOff + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (am[i] === bm[j]) {
        ops.push({ type: 'ctx', text: am[i], oldLine: p + i + 1, newLine: p + j + 1 });
        i++;
        j++;
      } else if (dp[(i + 1) * cols + j] >= dp[i * cols + j + 1]) {
        ops.push({ type: 'del', text: am[i], oldLine: p + i + 1 });
        i++;
      } else {
        ops.push({ type: 'add', text: bm[j], newLine: p + j + 1 });
        j++;
      }
    }
    while (i < m) {
      ops.push({ type: 'del', text: am[i], oldLine: p + i + 1 });
      i++;
    }
    while (j < n) {
      ops.push({ type: 'add', text: bm[j], newLine: p + j + 1 });
      j++;
    }
  } else {
    for (let i = 0; i < m; i++) ops.push({ type: 'del', text: am[i], oldLine: p + i + 1 });
    for (let j = 0; j < n; j++) ops.push({ type: 'add', text: bm[j], newLine: p + j + 1 });
  }

  let added = 0;
  let removed = 0;
  const preview = [];
  const diffLines = [];
  for (const op of ops) {
    if (op.type === 'add') added++;
    else if (op.type === 'del') removed++;
    if (op.type !== 'ctx' && preview.length < 6 && op.text.trim()) {
      const prefix = op.type === 'add' ? '+ ' : '- ';
      preview.push(`${prefix}${op.text.trim().slice(0, 94)}`);
    }
    if (diffLines.length < 200) {
      diffLines.push(op);
    }
  }

  return { added, removed, diffLines, preview };
}

function summarizeFileChanges(prevFiles = {}, nextFiles = {}, prevGrid = undefined, nextGrid = undefined) {
  const changedFiles = [];
  const changeSummary = [];
  let totalAdded = 0;
  let totalRemoved = 0;

  for (const fname of EDITABLE_FILES) {
    const hasPrev = typeof prevFiles[fname] === 'string';
    const hasNext = typeof nextFiles[fname] === 'string';
    if (!hasPrev && !hasNext) continue;
    const oldText = prevFiles[fname] || '';
    const newText = nextFiles[fname] || '';
    if (oldText === newText) continue;

    const diff = computeFileLineDiff(oldText, newText);
    changedFiles.push(fname);
    totalAdded += diff.added;
    totalRemoved += diff.removed;
    changeSummary.push({
      file: fname,
      added: diff.added,
      removed: diff.removed,
      preview: diff.preview
    });
  }

  if (prevGrid !== undefined && nextGrid !== undefined && JSON.stringify(prevGrid || null) !== JSON.stringify(nextGrid || null)) {
    changedFiles.push('Field Map');
    totalAdded += 1;
    changeSummary.push({
      file: 'Field Map',
      added: 1,
      removed: 0,
      preview: ['ปรับปรุงผังสนาม (Map Manager)']
    });
  }

  return { changedFiles, changeSummary, totalAdded, totalRemoved };
}

function listRawVersionsSorted() {
  ensureVersionsDir();
  const entries = fs.readdirSync(VERSIONS_DIR, { withFileTypes: true });
  const list = [];
  for (const ent of entries) {
    if (!ent.isDirectory() || !isSafeVersionId(ent.name)) continue;
    const metaPath = path.join(VERSIONS_DIR, ent.name, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;
    try {
      list.push(JSON.parse(fs.readFileSync(metaPath, 'utf8')));
    } catch (_) {}
  }

  // Assign deterministic majorNumber (v1, v2, ...) chronologically if missing
  const asc = [...list].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  let maxAssigned = 0;
  for (const m of asc) {
    const n = Number(m.majorNumber);
    if (Number.isInteger(n) && n > maxAssigned) maxAssigned = n;
  }
  let fallbackCounter = 1;
  for (const m of asc) {
    if (!Number.isInteger(Number(m.majorNumber)) || Number(m.majorNumber) <= 0) {
      while (asc.some((other) => other !== m && Number(other.majorNumber) === fallbackCounter)) {
        fallbackCounter++;
      }
      m.majorNumber = fallbackCounter++;
    }
    if (!m.versionLabel) m.versionLabel = `v${m.majorNumber}`;
  }

  list.sort((a, b) => {
    const cmp = String(b.createdAt).localeCompare(String(a.createdAt));
    return cmp !== 0 ? cmp : (Number(b.majorNumber) || 0) - (Number(a.majorNumber) || 0);
  });
  return list;
}

function readActiveVersionState(rawList = null) {
  ensureVersionsDir();
  const list = rawList || listRawVersionsSorted();
  const validIds = new Set(list.map((v) => v.id));
  let saved = null;
  if (fs.existsSync(ACTIVE_VERSION_FILE)) {
    try {
      saved = JSON.parse(fs.readFileSync(ACTIVE_VERSION_FILE, 'utf8'));
    } catch (_) {}
  }
  if (saved && isSafeVersionId(saved.activeVersionId) && validIds.has(saved.activeVersionId)) {
    let activeSubVersionId = null;
    if (isSafeVersionId(saved.activeSubVersionId)) {
      const subPath = path.join(VERSIONS_DIR, saved.activeVersionId, 'subversions', `${saved.activeSubVersionId}.json`);
      if (fs.existsSync(subPath)) activeSubVersionId = saved.activeSubVersionId;
    }
    return { activeVersionId: saved.activeVersionId, activeSubVersionId };
  }
  const newest = list[0];
  return { activeVersionId: newest ? newest.id : null, activeSubVersionId: null };
}

function writeActiveVersionState(activeVersionId, activeSubVersionId = null) {
  ensureVersionsDir();
  fs.writeFileSync(
    ACTIVE_VERSION_FILE,
    JSON.stringify({ activeVersionId: activeVersionId || null, activeSubVersionId: activeSubVersionId || null }, null, 2),
    'utf8'
  );
}

function decorateVersionMeta(meta) {
  const majorNumber = Number(meta.majorNumber) || 1;
  const versionLabel = meta.versionLabel || `v${majorNumber}`;
  const images = (meta.images || []).map((img) => ({
    ...img,
    url: `/api/versions/${encodeURIComponent(meta.id)}/image/${encodeURIComponent(img.filename)}`
  }));

  let coverUrl = null;
  if (meta.cover?.filename) {
    const coverPath = path.join(VERSIONS_DIR, meta.id, path.basename(meta.cover.filename));
    if (fs.existsSync(coverPath)) {
      const verStamp = encodeURIComponent(meta.cover.updatedAt || meta.createdAt || '');
      coverUrl = `/api/versions/${encodeURIComponent(meta.id)}/cover?t=${verStamp}`;
    }
  } else if (images.length > 0) {
    const legacyImgPath = path.join(VERSIONS_DIR, meta.id, 'images', path.basename(images[0].filename));
    if (fs.existsSync(legacyImgPath)) {
      coverUrl = images[0].url;
    }
  }

  const subVersions = [...(meta.subVersions || [])]
    .sort((a, b) => (Number(b.seq) || 0) - (Number(a.seq) || 0))
    .map((sub) => ({
      ...sub,
      versionLabel: sub.versionLabel || `v${majorNumber}.${sub.seq || 1}`
    }));

  return {
    ...meta,
    majorNumber,
    versionLabel,
    coverUrl,
    images,
    subVersions,
    subVersionCount: subVersions.length
  };
}

function getLatestCheckpointForVersion(verId) {
  const { meta, snapshot } = getVersionDetail(verId);
  if (Array.isArray(meta.subVersions) && meta.subVersions.length > 0) {
    const latestSub = [...meta.subVersions].sort((a, b) => (Number(b.seq) || 0) - (Number(a.seq) || 0))[0];
    const subPath = path.join(VERSIONS_DIR, verId, 'subversions', `${latestSub.id}.json`);
    if (fs.existsSync(subPath)) {
      try {
        const subSnap = JSON.parse(fs.readFileSync(subPath, 'utf8'));
        return {
          files: subSnap.files || {},
          compactGrid: subSnap.simSettings?.compactGrid
        };
      } catch (_) {}
    }
  }
  return {
    files: snapshot.files || {},
    compactGrid: snapshot.simSettings?.compactGrid
  };
}

function listVersions() {
  let list = listRawVersionsSorted();
  if (list.length === 0) {
    createVersionSnapshot({
      title: 'Initial Workspace Baseline',
      description: 'จุดเริ่มต้นอัตโนมัติของโปรเจกต์ก่อนเริ่มแก้ไข',
      tag: 'baseline'
    });
    list = listRawVersionsSorted();
  }
  return list.map(decorateVersionMeta);
}

function createVersionSnapshot(payload = {}) {
  ensureVersionsDir();
  if (payload.files && typeof payload.files === 'object') {
    saveSketchUpdates({ files: payload.files });
  }
  const { files } = readAllSketchFiles();
  const snapshotFiles = {};
  for (const name of EDITABLE_FILES) {
    if (typeof files[name] === 'string') {
      snapshotFiles[name] = files[name];
    }
  }

  const prevList = listRawVersionsSorted();
  const nextMajor = prevList.reduce((mx, v) => Math.max(mx, Number(v.majorNumber) || 0), 0) + 1;
  const versionLabel = `v${nextMajor}`;

  let changedFiles = Object.keys(snapshotFiles);
  let changeSummary = [];
  let totalAdded = 0;
  let totalRemoved = 0;
  if (prevList.length > 0) {
    try {
      const active = readActiveVersionState(prevList);
      const baseId = active.activeVersionId || prevList[0].id;
      const baseCp = getLatestCheckpointForVersion(baseId);
      const summary = summarizeFileChanges(baseCp.files, snapshotFiles, baseCp.compactGrid, payload.simSettings?.compactGrid);
      changedFiles = summary.changedFiles;
      changeSummary = summary.changeSummary;
      totalAdded = summary.totalAdded;
      totalRemoved = summary.totalRemoved;
    } catch (_) {}
  }

  const createdAt = new Date().toISOString();
  const hash = crypto
    .createHash('sha1')
    .update(JSON.stringify(snapshotFiles) + createdAt + Math.random())
    .digest('hex')
    .slice(0, 7);
  const stamp = createdAt.replace(/[-:T.Z]/g, '').slice(0, 14);
  const id = `v_${stamp}_${hash}`;
  const verDir = path.join(VERSIONS_DIR, id);
  const imagesDir = path.join(verDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  const savedImages = [];
  if (Array.isArray(payload.images)) {
    payload.images.forEach((imgObj, idx) => {
      const saved = saveDataUrlImage(imagesDir, idx, imgObj);
      if (saved) savedImages.push(saved);
    });
  }
  const cover = saveCoverImage(verDir, payload.coverImage);

  const title = String(payload.title || '').trim() || `Snapshot ${versionLabel} (${hash})`;
  const description = String(payload.description || '').trim();
  const tag = String(payload.tag || '').trim();

  const snapshot = {
    files: snapshotFiles,
    canvasLayout: payload.canvasLayout || null,
    calibration: payload.calibration || null,
    simSettings: payload.simSettings || null
  };

  const totalLines = Object.values(snapshotFiles).reduce((acc, txt) => acc + String(txt).split('\n').length, 0);
  const meta = {
    id,
    hash,
    majorNumber: nextMajor,
    versionLabel,
    title,
    description,
    tag,
    createdAt,
    changedFiles,
    changeSummary,
    totalAdded,
    totalRemoved,
    fileCount: Object.keys(snapshotFiles).length,
    totalLines,
    blockSummary: payload.blockSummary || '',
    cover,
    images: savedImages,
    subVersions: [],
    subVersionCount: 0
  };

  fs.writeFileSync(path.join(verDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2), 'utf8');
  fs.writeFileSync(path.join(verDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  writeActiveVersionState(id, null);
  return decorateVersionMeta(meta);
}

function getVersionDetail(id) {
  if (!isSafeVersionId(id)) throw new Error('Invalid version ID');
  const verDir = path.join(VERSIONS_DIR, id);
  const metaPath = path.join(verDir, 'meta.json');
  const snapPath = path.join(verDir, 'snapshot.json');
  if (!fs.existsSync(metaPath) || !fs.existsSync(snapPath)) {
    throw new Error('Version not found');
  }
  const rawList = listRawVersionsSorted();
  const matched = rawList.find((m) => m.id === id) || JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const meta = decorateVersionMeta(matched);
  const snapshot = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
  return { meta, snapshot };
}

function updateVersion(id, payload = {}) {
  const { meta } = getVersionDetail(id);
  const verDir = path.join(VERSIONS_DIR, id);
  const imagesDir = path.join(verDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  const rawMeta = JSON.parse(fs.readFileSync(path.join(verDir, 'meta.json'), 'utf8'));
  rawMeta.majorNumber = meta.majorNumber;
  rawMeta.versionLabel = meta.versionLabel;

  if (payload.title !== undefined) rawMeta.title = String(payload.title).trim() || rawMeta.title;
  if (payload.description !== undefined) rawMeta.description = String(payload.description).trim();
  if (payload.tag !== undefined) rawMeta.tag = String(payload.tag).trim();

  if (payload.coverImage) {
    const savedCover = saveCoverImage(verDir, payload.coverImage);
    if (savedCover) rawMeta.cover = savedCover;
  }

  let images = (rawMeta.images || []).map(({ url, ...rest }) => rest);
  if (Array.isArray(payload.removeImages) && payload.removeImages.length > 0) {
    const rmSet = new Set(payload.removeImages);
    images = images.filter((img) => {
      if (rmSet.has(img.filename)) {
        const p = path.join(imagesDir, path.basename(img.filename));
        if (fs.existsSync(p)) {
          try { fs.unlinkSync(p); } catch (_) {}
        }
        return false;
      }
      return true;
    });
  }
  if (Array.isArray(payload.addImages)) {
    payload.addImages.forEach((imgObj, idx) => {
      const saved = saveDataUrlImage(imagesDir, images.length + idx, imgObj);
      if (saved) images.push(saved);
    });
  }

  rawMeta.images = images;
  rawMeta.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(verDir, 'meta.json'), JSON.stringify(rawMeta, null, 2), 'utf8');
  return decorateVersionMeta(rawMeta);
}

function recordSaveSubVersion(payload = {}) {
  let rawList = listRawVersionsSorted();
  if (rawList.length === 0) {
    listVersions();
    rawList = listRawVersionsSorted();
  }
  const active = readActiveVersionState(rawList);
  const parentId = active.activeVersionId || rawList[0].id;
  const parentRaw = rawList.find((v) => v.id === parentId) || rawList[0];
  const verDir = path.join(VERSIONS_DIR, parentRaw.id);
  const metaPath = path.join(verDir, 'meta.json');
  const parentMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  parentMeta.majorNumber = parentRaw.majorNumber;
  parentMeta.versionLabel = parentRaw.versionLabel;

  const checkpoint = getLatestCheckpointForVersion(parentRaw.id);
  const { files } = readAllSketchFiles();
  const snapshotFiles = {};
  for (const name of EDITABLE_FILES) {
    if (typeof files[name] === 'string') {
      snapshotFiles[name] = files[name];
    }
  }

  const summary = summarizeFileChanges(
    checkpoint.files,
    snapshotFiles,
    checkpoint.compactGrid,
    payload.simSettings?.compactGrid
  );

  if (summary.changedFiles.length === 0) {
    return {
      created: false,
      subVersion: null,
      parentId: parentRaw.id,
      activeVersionId: active.activeVersionId,
      activeSubVersionId: active.activeSubVersionId
    };
  }

  const existingSubs = Array.isArray(parentMeta.subVersions) ? parentMeta.subVersions : [];
  const nextSeq = existingSubs.reduce((mx, s) => Math.max(mx, Number(s.seq) || 0), 0) + 1;
  const versionLabel = `v${parentMeta.majorNumber}.${nextSeq}`;
  const createdAt = new Date().toISOString();
  const hash = crypto
    .createHash('sha1')
    .update(JSON.stringify(snapshotFiles) + createdAt + Math.random())
    .digest('hex')
    .slice(0, 7);
  const subId = `sub_${String(nextSeq).padStart(3, '0')}_${hash}`;
  const subDir = path.join(verDir, 'subversions');
  fs.mkdirSync(subDir, { recursive: true });

  const prevFiles = {};
  for (const fname of summary.changedFiles) {
    if (fname === 'Field Map') continue;
    prevFiles[fname] = checkpoint.files[fname] || '';
  }

  const source = String(payload.saveSource || 'manual').trim().slice(0, 24);
  const note = String(payload.saveNote || '').trim().slice(0, 200);
  const subSnap = {
    id: subId,
    parentId: parentRaw.id,
    seq: nextSeq,
    versionLabel,
    hash,
    source,
    note,
    createdAt,
    files: snapshotFiles,
    prevFiles,
    canvasLayout: payload.canvasLayout || null,
    calibration: payload.calibration || null,
    simSettings: payload.simSettings || null,
    blockSummary: payload.blockSummary || '',
    changedFiles: summary.changedFiles,
    changeSummary: summary.changeSummary,
    totalAdded: summary.totalAdded,
    totalRemoved: summary.totalRemoved
  };

  fs.writeFileSync(path.join(subDir, `${subId}.json`), JSON.stringify(subSnap, null, 2), 'utf8');

  const subMeta = {
    id: subId,
    seq: nextSeq,
    versionLabel,
    hash,
    source,
    note,
    createdAt,
    changedFiles: summary.changedFiles,
    changeSummary: summary.changeSummary,
    totalAdded: summary.totalAdded,
    totalRemoved: summary.totalRemoved,
    blockSummary: payload.blockSummary || ''
  };

  existingSubs.push(subMeta);
  parentMeta.subVersions = existingSubs;
  parentMeta.subVersionCount = existingSubs.length;
  fs.writeFileSync(metaPath, JSON.stringify(parentMeta, null, 2), 'utf8');
  writeActiveVersionState(parentRaw.id, subId);

  return {
    created: true,
    subVersion: subMeta,
    parentId: parentRaw.id,
    activeVersionId: parentRaw.id,
    activeSubVersionId: subId
  };
}

function getSubVersionDetail(verId, subId) {
  if (!isSafeVersionId(verId) || !isSafeVersionId(subId)) {
    throw new Error('Invalid version or sub-version ID');
  }
  const { meta } = getVersionDetail(verId);
  const subPath = path.join(VERSIONS_DIR, verId, 'subversions', `${subId}.json`);
  if (!fs.existsSync(subPath)) {
    throw new Error('Sub-version not found');
  }
  const snapshot = JSON.parse(fs.readFileSync(subPath, 'utf8'));
  const subMeta = (meta.subVersions || []).find((s) => s.id === subId) || {
    id: subId,
    seq: snapshot.seq,
    versionLabel: snapshot.versionLabel,
    hash: snapshot.hash,
    source: snapshot.source,
    createdAt: snapshot.createdAt
  };
  return { meta, subMeta, snapshot };
}

function restoreSubVersion(verId, subId) {
  const { meta, subMeta, snapshot } = getSubVersionDetail(verId, subId);
  if (snapshot.files && typeof snapshot.files === 'object') {
    saveSketchUpdates({ files: snapshot.files });
  }
  writeActiveVersionState(verId, subId);
  const current = readAllSketchFiles();
  return {
    meta,
    subMeta,
    ...current,
    canvasLayout: snapshot.canvasLayout || null,
    calibration: snapshot.calibration || null,
    simSettings: snapshot.simSettings || null,
    activeVersionId: verId,
    activeSubVersionId: subId,
    versions: listVersions()
  };
}

function deleteSubVersion(verId, subId) {
  if (!isSafeVersionId(verId) || !isSafeVersionId(subId)) {
    throw new Error('Invalid version or sub-version ID');
  }
  const verDir = path.join(VERSIONS_DIR, verId);
  const metaPath = path.join(verDir, 'meta.json');
  const subPath = path.join(verDir, 'subversions', `${subId}.json`);
  if (!fs.existsSync(metaPath) || !fs.existsSync(subPath)) {
    throw new Error('Sub-version not found');
  }
  fs.unlinkSync(subPath);

  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  meta.subVersions = (meta.subVersions || []).filter((s) => s.id !== subId);
  meta.subVersionCount = meta.subVersions.length;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

  const active = readActiveVersionState();
  if (active.activeVersionId === verId && active.activeSubVersionId === subId) {
    const newestSub = [...meta.subVersions].sort((a, b) => (Number(b.seq) || 0) - (Number(a.seq) || 0))[0];
    writeActiveVersionState(verId, newestSub ? newestSub.id : null);
  }
  return readActiveVersionState();
}

function restoreVersion(id) {
  const { meta, snapshot } = getVersionDetail(id);
  if (snapshot.files && typeof snapshot.files === 'object') {
    saveSketchUpdates({ files: snapshot.files });
  }
  writeActiveVersionState(id, null);
  const current = readAllSketchFiles();
  return {
    meta,
    ...current,
    canvasLayout: snapshot.canvasLayout || null,
    calibration: snapshot.calibration || null,
    simSettings: snapshot.simSettings || null,
    activeVersionId: id,
    activeSubVersionId: null,
    versions: listVersions()
  };
}

function deleteVersion(id) {
  if (!isSafeVersionId(id)) throw new Error('Invalid version ID');
  const verDir = path.join(VERSIONS_DIR, id);
  if (!fs.existsSync(verDir)) throw new Error('Version not found');
  fs.rmSync(verDir, { recursive: true, force: true });

  const remaining = listRawVersionsSorted();
  const active = readActiveVersionState(remaining);
  writeActiveVersionState(active.activeVersionId, active.activeSubVersionId);
  return active;
}

let compileBusy = false;

// ============================================================================
// Extension Plugins Registry, Static Host, Shared SDK & Live Bridge
// ============================================================================
function isSafePluginId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9._-]{1,64}$/.test(id) && id !== '.' && id !== '..';
}

function readPluginStore() {
  const fallback = {
    connectedIds: [],
    primaryPluginId: null,
    bridgeState: null,
    updatedAt: null
  };
  try {
    if (!fs.existsSync(PLUGINS_CONFIG_FILE)) return fallback;
    const raw = JSON.parse(fs.readFileSync(PLUGINS_CONFIG_FILE, 'utf8'));
    if (!raw || typeof raw !== 'object') return fallback;
    const connectedIds = Array.isArray(raw.connectedIds)
      ? raw.connectedIds.filter((id) => isSafePluginId(id))
      : [];
    const primaryPluginId = isSafePluginId(raw.primaryPluginId) && connectedIds.includes(raw.primaryPluginId)
      ? raw.primaryPluginId
      : (connectedIds[0] || null);
    return {
      connectedIds,
      primaryPluginId,
      bridgeState: raw.bridgeState && typeof raw.bridgeState === 'object' ? raw.bridgeState : null,
      updatedAt: raw.updatedAt || null
    };
  } catch (_) {
    return fallback;
  }
}

function writePluginStore(nextStore) {
  const safeStore = {
    connectedIds: Array.isArray(nextStore.connectedIds) ? nextStore.connectedIds.filter(isSafePluginId) : [],
    primaryPluginId: isSafePluginId(nextStore.primaryPluginId) ? nextStore.primaryPluginId : null,
    bridgeState: nextStore.bridgeState && typeof nextStore.bridgeState === 'object' ? nextStore.bridgeState : null,
    updatedAt: new Date().toISOString()
  };
  if (safeStore.primaryPluginId && !safeStore.connectedIds.includes(safeStore.primaryPluginId)) {
    safeStore.primaryPluginId = safeStore.connectedIds[0] || null;
  }
  const dir = path.dirname(PLUGINS_CONFIG_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const tmpFile = `${PLUGINS_CONFIG_FILE}.tmp.${process.pid}`;
  fs.writeFileSync(tmpFile, JSON.stringify(safeStore, null, 2), 'utf8');
  fs.renameSync(tmpFile, PLUGINS_CONFIG_FILE);
  return safeStore;
}

function discoverPlugins() {
  fs.mkdirSync(PLUGINS_DIR, { recursive: true });
  const store = readPluginStore();
  const entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });
  const plugins = [];

  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
    const folderName = ent.name;
    if (!isSafePluginId(folderName)) continue;

    const pluginDir = path.join(PLUGINS_DIR, folderName);
    const manifestPath = path.join(pluginDir, 'plugin.json');
    let manifest = {};
    let hasManifest = false;

    if (fs.existsSync(manifestPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (parsed && typeof parsed === 'object') {
          manifest = parsed;
          hasManifest = true;
        }
      } catch (_) {}
    }

    const id = folderName;
    const rawEntry = typeof manifest.entry === 'string' && manifest.entry.trim()
      ? manifest.entry.trim().replace(/^\/+/, '')
      : 'index.html';
    const safeEntry = path.normalize(rawEntry).replace(/\\/g, '/');
    const resolvedEntry = path.resolve(pluginDir, safeEntry);
    const insidePlugin = resolvedEntry.startsWith(path.resolve(pluginDir) + path.sep);
    const entryExists = insidePlugin && fs.existsSync(resolvedEntry) && fs.statSync(resolvedEntry).isFile();

    if (!hasManifest && !entryExists) continue;

    const connected = store.connectedIds.includes(id);
    const isPrimary = connected && store.primaryPluginId === id;

    plugins.push({
      id,
      manifestId: isSafePluginId(manifest.id) ? manifest.id : id,
      name: String(manifest.name || folderName),
      shortName: String(manifest.shortName || manifest.name || folderName),
      version: String(manifest.version || '1.0.0'),
      description: String(manifest.description || (hasManifest ? '' : 'พบโฟลเดอร์แอปเสริม (ยังไม่มีไฟล์ plugin.json — พร้อมทดลองเชื่อมต่อ)')),
      entry: insidePlugin ? safeEntry : 'index.html',
      entryExists,
      hasManifest,
      icon: String(manifest.icon || 'plug'),
      badgeColor: /^#[0-9a-fA-F]{3,8}$/.test(String(manifest.badgeColor || '')) ? manifest.badgeColor : '#0072f5',
      capabilities: Array.isArray(manifest.capabilities) ? manifest.capabilities.map((c) => String(c)) : [],
      author: String(manifest.author || ''),
      offline: manifest.offline !== false,
      folderPath: pluginDir,
      connected,
      isPrimary,
      launchUrl: `/plugins/${encodeURIComponent(id)}/`
    });
  }

  plugins.sort((a, b) => {
    if (a.connected !== b.connected) return a.connected ? -1 : 1;
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { store, plugins };
}

let liveBridgeState = readPluginStore().bridgeState || {
  seq: 0,
  updatedAt: null,
  updatedBy: null,
  activeMissionFile: 'RunMode1.ino',
  fieldMap: null,
  simPose: null,
  calibration: null,
  config: null
};

function mergeBridgeState(patch) {
  if (!patch || typeof patch !== 'object') return liveBridgeState;
  const src = patch.snapshot && typeof patch.snapshot === 'object' ? patch.snapshot : patch;
  const next = {
    ...liveBridgeState,
    seq: (Number(liveBridgeState?.seq) || 0) + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: String(src.source || src.updatedBy || patch.updatedBy || 'unknown')
  };
  if (typeof src.activeMissionFile === 'string' && src.activeMissionFile) {
    next.activeMissionFile = src.activeMissionFile;
  }
  if (src.fieldMap && typeof src.fieldMap === 'object') {
    next.fieldMap = { ...(liveBridgeState.fieldMap || {}), ...src.fieldMap };
  }
  if (src.simPose && typeof src.simPose === 'object') {
    next.simPose = { ...(liveBridgeState.simPose || {}), ...src.simPose };
  }
  if (src.calibration && typeof src.calibration === 'object') {
    next.calibration = { ...(liveBridgeState.calibration || {}), ...src.calibration };
  }
  if (src.config && typeof src.config === 'object') {
    next.config = { ...(liveBridgeState.config || {}), ...src.config };
  }
  liveBridgeState = next;
  try {
    const store = readPluginStore();
    store.bridgeState = liveBridgeState;
    writePluginStore(store);
  } catch (_) {}
  return liveBridgeState;
}

function serveStaticFile(res, fullPath, forcedMime = null) {
  if (!fullPath || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return true;
  }
  const ext = path.extname(fullPath).toLowerCase();
  const stat = fs.statSync(fullPath);
  res.writeHead(200, {
    'Content-Type': forcedMime || MIME_TYPES[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(fullPath).pipe(res);
  return true;
}

function createApiMiddleware() {
  return async (req, res, next) => {
    try {
      const rawUrlPath = String(req.url || '/').split('?')[0];
      if (
        (rawUrlPath.startsWith('/plugins/') || rawUrlPath.startsWith('/plugin-sdk/')) &&
        /(^|[\\/])(\.\.|%2e%2e)([\\/]|$)/i.test(rawUrlPath)
      ) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Forbidden');
      }
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = decodeURIComponent(parsedUrl.pathname);

      // Shared Offline ES Modules SDK (/plugin-sdk/sim/* and /plugin-sdk/blocks/*)
      if ((req.method === 'GET' || req.method === 'HEAD') && pathname.startsWith('/plugin-sdk/')) {
        const rawRel = pathname.slice('/plugin-sdk/'.length).replace(/\\/g, '/');
        if (!rawRel || rawRel.includes('..') || rawRel.startsWith('/')) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('Forbidden');
        }
        const normRel = path.posix.normalize(rawRel);
        const topDir = normRel.split('/')[0];
        if (!ALLOWED_SDK_SUBDIRS.has(topDir) || !/\.(m?js)$/i.test(normRel)) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('Forbidden SDK Path');
        }
        const sdkRootResolved = path.resolve(PLUGIN_SDK_ROOT);
        const targetFile = path.resolve(sdkRootResolved, normRel);
        if (!targetFile.startsWith(sdkRootResolved + path.sep)) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('Forbidden');
        }
        return serveStaticFile(res, targetFile, 'application/javascript; charset=utf-8');
      }

      // Extension Plugins Static Host (/plugins/:pluginId/*)
      const pluginMatch = pathname.match(/^\/plugins\/([^/]+)(\/.*)?$/);
      if ((req.method === 'GET' || req.method === 'HEAD') && pluginMatch) {
        const pluginId = pluginMatch[1];
        const tail = pluginMatch[2] || '';
        if (!isSafePluginId(pluginId)) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('Invalid plugin ID');
        }
        if (!tail) {
          res.writeHead(302, { Location: `/plugins/${encodeURIComponent(pluginId)}/${parsedUrl.search || ''}` });
          return res.end();
        }
        const pluginRoot = path.resolve(PLUGINS_DIR, pluginId);
        if (!pluginRoot.startsWith(path.resolve(PLUGINS_DIR) + path.sep) || !fs.existsSync(pluginRoot) || !fs.statSync(pluginRoot).isDirectory()) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('Plugin not found');
        }

        let relPath = tail.replace(/^\/+/, '');
        if (!relPath) {
          let entry = 'index.html';
          const manifestPath = path.join(pluginRoot, 'plugin.json');
          if (fs.existsSync(manifestPath)) {
            try {
              const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
              if (parsed && typeof parsed.entry === 'string' && parsed.entry.trim()) {
                entry = parsed.entry.trim().replace(/^\/+/, '');
              }
            } catch (_) {}
          }
          relPath = entry;
        }
        if (relPath.includes('..')) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('Forbidden');
        }
        const resolvedFile = path.resolve(pluginRoot, relPath);
        if (!resolvedFile.startsWith(pluginRoot + path.sep)) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('Forbidden');
        }
        return serveStaticFile(res, resolvedFile);
      }

      if (!pathname.startsWith('/api/')) {
        return next();
      }

      if (req.method === 'GET' && pathname === '/api/status') {
        return sendJson(res, 200, {
          ok: true,
          fqbn: FQBN,
          arduinoCli: getArduinoCli(),
          arduinoCliAvailable: checkArduinoCliAvailable(),
          boardCoreInstalled: checkBoardCoreInstalled(),
          folderNameMatchesSketch: path.basename(SKETCH_DIR) === MAIN_SKETCH_NAME,
          sketchDir: SKETCH_DIR,
          librariesDir: LIBRARIES_DIR,
          buildDir: BUILD_DIR,
          versionsDir: VERSIONS_DIR,
          pluginsDir: PLUGINS_DIR,
          offlineReady: true,
          runtime: `Vite + Node.js ${process.version}`,
          platform: process.platform,
          editableFiles: EDITABLE_FILES.filter((f) => fs.existsSync(path.join(SKETCH_DIR, f))),
          artifacts: listBuildArtifacts()
        });
      }

      if (req.method === 'GET' && pathname === '/api/plugins') {
        const { store, plugins } = discoverPlugins();
        return sendJson(res, 200, {
          ok: true,
          pluginsDir: PLUGINS_DIR,
          connectedIds: store.connectedIds,
          primaryPluginId: store.primaryPluginId,
          plugins
        });
      }

      if (req.method === 'POST' && pathname === '/api/plugins/connect') {
        const body = await readJsonBody(req);
        const action = String(body.action || 'connect');
        const pluginId = String(body.pluginId || '').trim();
        if (!isSafePluginId(pluginId)) {
          return sendJson(res, 400, { ok: false, error: 'รหัสแอปเสริมไม่ถูกต้อง' });
        }

        const before = discoverPlugins();
        const exists = before.plugins.some((p) => p.id === pluginId);
        if ((action === 'connect' || action === 'setPrimary') && !exists) {
          return sendJson(res, 404, { ok: false, error: `ไม่พบแอปเสริม "${pluginId}" ในโฟลเดอร์ extentions-plugins` });
        }

        const nextStore = { ...before.store };
        const set = new Set(nextStore.connectedIds);

        if (action === 'connect') {
          set.add(pluginId);
          nextStore.connectedIds = Array.from(set);
          if (!nextStore.primaryPluginId || body.setPrimary) {
            nextStore.primaryPluginId = pluginId;
          }
        } else if (action === 'disconnect') {
          set.delete(pluginId);
          nextStore.connectedIds = Array.from(set);
          if (nextStore.primaryPluginId === pluginId) {
            nextStore.primaryPluginId = nextStore.connectedIds[0] || null;
          }
        } else if (action === 'setPrimary') {
          set.add(pluginId);
          nextStore.connectedIds = Array.from(set);
          nextStore.primaryPluginId = pluginId;
        } else {
          return sendJson(res, 400, { ok: false, error: `ไม่รองรับ action: ${action}` });
        }

        writePluginStore(nextStore);
        const after = discoverPlugins();
        return sendJson(res, 200, {
          ok: true,
          pluginsDir: PLUGINS_DIR,
          connectedIds: after.store.connectedIds,
          primaryPluginId: after.store.primaryPluginId,
          plugins: after.plugins
        });
      }

      if (req.method === 'GET' && pathname === '/api/plugin-bridge/state') {
        return sendJson(res, 200, {
          ok: true,
          bridge: liveBridgeState,
          filesMeta: {
            activeSketchDir: SKETCH_DIR,
            editableFiles: EDITABLE_FILES.filter((f) => fs.existsSync(path.join(SKETCH_DIR, f)))
          }
        });
      }

      if (req.method === 'POST' && pathname === '/api/plugin-bridge/state') {
        const body = await readJsonBody(req);
        const updated = mergeBridgeState(body);
        return sendJson(res, 200, {
          ok: true,
          bridge: updated
        });
      }

      if (req.method === 'GET' && pathname === '/api/versions') {
        const versions = listVersions();
        const active = readActiveVersionState();
        return sendJson(res, 200, {
          ok: true,
          versionsDir: VERSIONS_DIR,
          ...active,
          versions
        });
      }

      if (req.method === 'POST' && pathname === '/api/versions') {
        const body = await readJsonBody(req);
        const version = createVersionSnapshot(body);
        const versions = listVersions();
        const active = readActiveVersionState();
        return sendJson(res, 201, { ok: true, version, ...active, versions });
      }

      const verCoverMatch = pathname.match(/^\/api\/versions\/([^/]+)\/cover$/);
      if (req.method === 'GET' && verCoverMatch) {
        const id = verCoverMatch[1];
        if (!isSafeVersionId(id)) return sendJson(res, 400, { ok: false, error: 'Invalid version ID' });
        const metaPath = path.join(VERSIONS_DIR, id, 'meta.json');
        if (!fs.existsSync(metaPath)) return sendJson(res, 404, { ok: false, error: 'Version not found' });
        let coverFile = '';
        try {
          const rawMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          coverFile = rawMeta.cover?.filename ? path.basename(rawMeta.cover.filename) : '';
        } catch (_) {}
        const fullPath = coverFile ? path.join(VERSIONS_DIR, id, coverFile) : '';
        if (!fullPath || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
          return sendJson(res, 404, { ok: false, error: 'Cover image not found' });
        }
        const ext = path.extname(fullPath).toLowerCase();
        const stat = fs.statSync(fullPath);
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Content-Length': stat.size,
          'Cache-Control': 'no-store'
        });
        return fs.createReadStream(fullPath).pipe(res);
      }

      const verImgMatch = pathname.match(/^\/api\/versions\/([^/]+)\/image\/([^/]+)$/);
      if (req.method === 'GET' && verImgMatch) {
        const id = verImgMatch[1];
        const imgFile = path.basename(verImgMatch[2]);
        if (!isSafeVersionId(id)) return sendJson(res, 400, { ok: false, error: 'Invalid version ID' });
        const fullPath = path.join(VERSIONS_DIR, id, 'images', imgFile);
        if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
          return sendJson(res, 404, { ok: false, error: 'Image not found' });
        }
        const ext = path.extname(fullPath).toLowerCase();
        const stat = fs.statSync(fullPath);
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Content-Length': stat.size,
          'Cache-Control': 'no-store'
        });
        return fs.createReadStream(fullPath).pipe(res);
      }

      const subRestoreMatch = pathname.match(/^\/api\/versions\/([^/]+)\/subversions\/([^/]+)\/restore$/);
      if (req.method === 'POST' && subRestoreMatch) {
        await readJsonBody(req);
        const restored = restoreSubVersion(subRestoreMatch[1], subRestoreMatch[2]);
        return sendJson(res, 200, { ok: true, ...restored });
      }

      const subItemMatch = pathname.match(/^\/api\/versions\/([^/]+)\/subversions\/([^/]+)$/);
      if (subItemMatch) {
        const [, verId, subId] = subItemMatch;
        if (req.method === 'GET') {
          return sendJson(res, 200, { ok: true, ...getSubVersionDetail(verId, subId) });
        }
        if (req.method === 'DELETE') {
          const active = deleteSubVersion(verId, subId);
          return sendJson(res, 200, { ok: true, ...active, versions: listVersions() });
        }
      }

      const verRestoreMatch = pathname.match(/^\/api\/versions\/([^/]+)\/restore$/);
      if (req.method === 'POST' && verRestoreMatch) {
        await readJsonBody(req);
        const restored = restoreVersion(verRestoreMatch[1]);
        return sendJson(res, 200, { ok: true, ...restored });
      }

      const verItemMatch = pathname.match(/^\/api\/versions\/([^/]+)$/);
      if (verItemMatch) {
        const verId = verItemMatch[1];
        if (req.method === 'GET') {
          return sendJson(res, 200, { ok: true, ...getVersionDetail(verId) });
        }
        if (req.method === 'PUT') {
          const body = await readJsonBody(req);
          const version = updateVersion(verId, body);
          const active = readActiveVersionState();
          return sendJson(res, 200, { ok: true, version, ...active, versions: listVersions() });
        }
        if (req.method === 'DELETE') {
          const active = deleteVersion(verId);
          return sendJson(res, 200, { ok: true, ...active, versions: listVersions() });
        }
      }

      if (req.method === 'GET' && pathname === '/api/files') {
        const data = readAllSketchFiles();
        return sendJson(res, 200, { ok: true, sketchDir: SKETCH_DIR, ...data });
      }

      if (req.method === 'POST' && pathname === '/api/files') {
        const body = await readJsonBody(req);
        saveSketchUpdates(body);
        const data = readAllSketchFiles();
        let saveLog = null;
        if (body && body.recordSaveLog) {
          saveLog = recordSaveSubVersion(body);
        }
        return sendJson(res, 200, {
          ok: true,
          ...data,
          ...(saveLog
            ? {
                subVersion: saveLog.subVersion,
                activeVersionId: saveLog.activeVersionId,
                activeSubVersionId: saveLog.activeSubVersionId,
                versions: saveLog.created ? listVersions() : undefined
              }
            : {})
        });
      }

      if (req.method === 'POST' && pathname === '/api/compile') {
        if (compileBusy) {
          return sendJson(res, 409, { ok: false, error: 'มีการคอมไพล์กำลังทำงานอยู่ กรุณารอสักครู่' });
        }
        compileBusy = true;
        try {
          const body = await readJsonBody(req);
          if (body && (body.files || body.configPatch)) {
            saveSketchUpdates(body);
          }
          fs.mkdirSync(BUILD_DIR, { recursive: true });
          const cli = getArduinoCli();
          const { compileDir, staged } = resolveCompileSketchDir();
          const args = ['compile', '--fqbn', FQBN, '--output-dir', BUILD_DIR];
          if (LIBRARIES_DIR) args.push('--libraries', LIBRARIES_DIR);
          args.push(compileDir);

          const result = await runCommand(cli, args, 180000);
          let log = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
          if (staged) {
            log = log.split(compileDir).join(SKETCH_DIR);
          }
          if (result.exitCode !== 0) {
            const missingPlatform = /platform\s+'?PTBOT_ESP32:esp32'?\s+not\s+found|unknown\s+fqbn|no\s+matching\s+platform/i.test(log);
            const missingCli = /ENOENT|not\s+recognized|command\s+not\s+found/i.test(log);
            if (missingCli) {
              log += '\n\n[HINT] ไม่พบ arduino-cli — กรุณารัน ide/start-ide.bat (Windows) หรือ node ide/app/setup-deps.js เพื่อติดตั้งอัตโนมัติ';
            } else if (missingPlatform) {
              log += `\n\n[HINT] ยังไม่ได้ติดตั้งบอร์ด ${PTBOT_CORE_ID} — กรุณารัน ide/start-ide.bat (หรือ node ide/app/setup-deps.js) โดยเชื่อมต่ออินเทอร์เน็ตครั้งแรก หรือเพิ่ม Board Manager URL ใน Arduino IDE:\n${PTBOT_BOARD_INDEX_URL}`;
            }
          }
          const usage = parseUsageMetrics(log);

          return sendJson(res, 200, {
            ok: result.exitCode === 0,
            exitCode: result.exitCode,
            durationMs: result.durationMs,
            log,
            flash: usage.flash,
            ram: usage.ram,
            artifacts: listBuildArtifacts()
          });
        } finally {
          compileBusy = false;
        }
      }

      if (req.method === 'GET' && pathname.startsWith('/api/build-artifact/')) {
        const fileName = path.basename(pathname.slice('/api/build-artifact/'.length));
        const allowed = listBuildArtifacts().find((a) => a.name === fileName);
        if (!allowed) {
          return sendJson(res, 404, { ok: false, error: 'ยังไม่มีไฟล์ไบนารี กรุณากด Compile ก่อน' });
        }
        const full = path.join(BUILD_DIR, fileName);
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': fs.statSync(full).size,
          'Content-Disposition': `attachment; filename="${fileName}"`
        });
        return fs.createReadStream(full).pipe(res);
      }

      if (req.method === 'GET' && pathname === '/api/ports') {
        const ports = await listSerialPorts();
        return sendJson(res, 200, { ok: true, ports });
      }

      if (req.method === 'POST' && pathname === '/api/release-port') {
        await readJsonBody(req).catch(() => ({}));
        const result = await releaseSerialPortLocks();
        return sendJson(res, 200, { ok: true, ...result });
      }

      if (req.method === 'POST' && pathname === '/api/read-calibration') {
        const body = await readJsonBody(req);
        const port = String(body.port || '').trim();
        if (!/^(COM\d+|\/dev\/[\w.-]+)$/i.test(port)) {
          return sendJson(res, 400, { ok: false, error: 'รูปแบบพอร์ตไม่ถูกต้อง (ตัวอย่าง: COM3 หรือ /dev/ttyUSB0)' });
        }
        const result = await readCalibrationOverSerial(port);
        return sendJson(res, 200, result);
      }

      if (req.method === 'POST' && pathname === '/api/upload') {
        const body = await readJsonBody(req);
        const port = String(body.port || '').trim();
        if (!/^(COM\d+|\/dev\/[\w.-]+)$/i.test(port)) {
          return sendJson(res, 400, { ok: false, error: 'รูปแบบพอร์ตไม่ถูกต้อง (ตัวอย่าง: COM3 หรือ /dev/ttyUSB0)' });
        }
        if (listBuildArtifacts().length === 0) {
          return sendJson(res, 400, { ok: false, error: 'ยังไม่มีไฟล์ที่คอมไพล์แล้ว กรุณากด Compile ก่อน Upload' });
        }
        await releaseSerialPortLocks();
        const { compileDir } = resolveCompileSketchDir();
        const args = ['upload', '-p', port, '--fqbn', FQBN, '--input-dir', BUILD_DIR, compileDir];
        const result = await runCommand(getArduinoCli(), args, 120000);
        const log = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
        return sendJson(res, 200, {
          ok: result.exitCode === 0,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          log
        });
      }

      return sendJson(res, 404, { ok: false, error: 'API route not found' });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  };
}

module.exports = {
  PORT,
  FQBN,
  IDE_DIR,
  SKETCH_DIR,
  LIBRARIES_DIR,
  ARDUINO_CLI,
  VERSIONS_DIR,
  PLUGINS_DIR,
  MIME_TYPES,
  createApiMiddleware
};
