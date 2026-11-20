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

const EDITABLE_FILES = [
  'RunMode1.ino',
  'RunMode2.ino',
  'RunMode3.ino',
  'Variables.ino',
  'Config.ino',
  'Move.ino',
  'SpinTurn.ino',
  'Motor.ino',
  'Interface.ino',
  'Examples.ino',
  'KT_ATOM_Middle.ino'
];

const CONFIG_SCHEMA = [
  { key: 'enableMultiMode', type: 'bool' },
  { key: 'currentRunMode', type: 'int' },
  { key: 'forceOverwriteFlashFromCode', type: 'bool' },
  { key: 'fwdKp', type: 'float' },
  { key: 'fwdKd', type: 'float' },
  { key: 'bwdKp', type: 'float' },
  { key: 'bwdKd', type: 'float' },
  { key: 'kp_turn', type: 'float' },
  { key: 'kd_turn', type: 'float' },
  { key: 'Set_kp', type: 'float' },
  { key: 'Set_kd', type: 'float' },
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
  { key: 'beepOnCmd', type: 'bool' }
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
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
    '/workspace/KT_ATOM_Middle',
    path.resolve(IDE_DIR, '..', '..'),
    path.resolve(IDE_DIR, '..'),
    '/app/KT_ATOM_Middle'
  ];
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'KT_ATOM_Middle.ino'))) {
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
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Arduino IDE', 'resources', 'app', 'lib', 'backend', 'resources', 'arduino-cli.exe'),
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
const ARDUINO_CLI = findArduinoCli();
const VERSIONS_DIR = path.join(SKETCH_DIR, '.kt-versions');

function checkArduinoCliAvailable() {
  try {
    execFileSync(ARDUINO_CLI, ['version'], { encoding: 'utf8', timeout: 3000 });
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

function readAllSketchFiles() {
  const files = {};
  for (const name of EDITABLE_FILES) {
    const full = path.join(SKETCH_DIR, name);
    if (fs.existsSync(full)) {
      files[name] = fs.readFileSync(full, 'utf8');
    }
  }
  const config = files['Config.ino'] ? parseConfigIno(files['Config.ino']) : {};
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

function findBootApp0() {
  const roots = [
    path.join(os.homedir(), 'AppData', 'Local', 'Arduino15', 'packages', 'PTBOT_ESP32', 'hardware', 'esp32'),
    path.join(os.homedir(), '.arduino15', 'packages', 'PTBOT_ESP32', 'hardware', 'esp32'),
    '/root/.arduino15/packages/PTBOT_ESP32/hardware/esp32'
  ];
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    for (const ver of fs.readdirSync(r)) {
      const candidate = path.join(r, ver, 'tools', 'partitions', 'boot_app0.bin');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return '';
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
    const res = await runCommand(ARDUINO_CLI, ['board', 'list', '--format', 'json'], 8000);
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
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
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

function saveDataUrlImage(imagesDir, index, imgObj) {
  if (!imgObj || typeof imgObj.dataUrl !== 'string') return null;
  const match = imgObj.dataUrl.match(/^data:(image\/[A-Za-z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const ext = sanitizeImageExt(mime || imgObj.name);
  const rawName = String(imgObj.name || `photo_${index + 1}`)
    .replace(/\.[^.]+$/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .slice(0, 32) || `img_${index + 1}`;
  const filename = `${Date.now()}_${index + 1}_${rawName}${ext}`;
  const fullPath = path.join(imagesDir, filename);
  fs.writeFileSync(fullPath, Buffer.from(match[2], 'base64'));
  return {
    filename,
    originalName: String(imgObj.name || filename),
    size: fs.statSync(fullPath).size,
    addedAt: new Date().toISOString()
  };
}

function decorateVersionMeta(meta) {
  const images = (meta.images || []).map((img) => ({
    ...img,
    url: `/api/versions/${encodeURIComponent(meta.id)}/image/${encodeURIComponent(img.filename)}`
  }));
  return { ...meta, images };
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
  list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return list;
}

function listVersions() {
  let list = listRawVersionsSorted();
  if (list.length === 0) {
    const initial = createVersionSnapshot({
      title: 'Initial Workspace Baseline',
      description: 'จุดเริ่มต้นอัตโนมัติของโปรเจกต์ก่อนเริ่มแก้ไข',
      tag: 'baseline',
      images: []
    });
    list = [initial];
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
  let changedFiles = Object.keys(snapshotFiles);
  if (prevList.length > 0) {
    const prevSnapPath = path.join(VERSIONS_DIR, prevList[0].id, 'snapshot.json');
    if (fs.existsSync(prevSnapPath)) {
      try {
        const prevSnap = JSON.parse(fs.readFileSync(prevSnapPath, 'utf8'));
        const prevFiles = prevSnap.files || {};
        changedFiles = Object.keys(snapshotFiles).filter((f) => snapshotFiles[f] !== prevFiles[f]);
      } catch (_) {}
    }
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

  const title = String(payload.title || '').trim() || `Snapshot ${hash}`;
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
    title,
    description,
    tag,
    createdAt,
    changedFiles,
    fileCount: Object.keys(snapshotFiles).length,
    totalLines,
    blockSummary: payload.blockSummary || '',
    images: savedImages
  };

  fs.writeFileSync(path.join(verDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2), 'utf8');
  fs.writeFileSync(path.join(verDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
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
  const meta = decorateVersionMeta(JSON.parse(fs.readFileSync(metaPath, 'utf8')));
  const snapshot = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
  return { meta, snapshot };
}

function updateVersion(id, payload = {}) {
  const { meta } = getVersionDetail(id);
  const verDir = path.join(VERSIONS_DIR, id);
  const imagesDir = path.join(verDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  if (payload.title !== undefined) meta.title = String(payload.title).trim() || meta.title;
  if (payload.description !== undefined) meta.description = String(payload.description).trim();
  if (payload.tag !== undefined) meta.tag = String(payload.tag).trim();

  let images = (meta.images || []).map(({ url, ...rest }) => rest);
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

  meta.images = images;
  meta.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(verDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  return decorateVersionMeta(meta);
}

function restoreVersion(id) {
  const { meta, snapshot } = getVersionDetail(id);
  if (snapshot.files && typeof snapshot.files === 'object') {
    saveSketchUpdates({ files: snapshot.files });
  }
  const current = readAllSketchFiles();
  return {
    meta,
    ...current,
    canvasLayout: snapshot.canvasLayout || null,
    calibration: snapshot.calibration || null,
    simSettings: snapshot.simSettings || null
  };
}

function deleteVersion(id) {
  if (!isSafeVersionId(id)) throw new Error('Invalid version ID');
  const verDir = path.join(VERSIONS_DIR, id);
  if (!fs.existsSync(verDir)) throw new Error('Version not found');
  fs.rmSync(verDir, { recursive: true, force: true });
}

let compileBusy = false;

function createApiMiddleware() {
  return async (req, res, next) => {
    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = decodeURIComponent(parsedUrl.pathname);

      if (!pathname.startsWith('/api/')) {
        return next();
      }

      if (req.method === 'GET' && pathname === '/api/status') {
        return sendJson(res, 200, {
          ok: true,
          fqbn: FQBN,
          arduinoCli: ARDUINO_CLI,
          arduinoCliAvailable: checkArduinoCliAvailable(),
          sketchDir: SKETCH_DIR,
          librariesDir: LIBRARIES_DIR,
          buildDir: BUILD_DIR,
          versionsDir: VERSIONS_DIR,
          runtime: `Vite + Node.js ${process.version}`,
          platform: process.platform,
          editableFiles: EDITABLE_FILES.filter((f) => fs.existsSync(path.join(SKETCH_DIR, f))),
          artifacts: listBuildArtifacts()
        });
      }

      if (req.method === 'GET' && pathname === '/api/versions') {
        return sendJson(res, 200, { ok: true, versionsDir: VERSIONS_DIR, versions: listVersions() });
      }

      if (req.method === 'POST' && pathname === '/api/versions') {
        const body = await readJsonBody(req);
        const version = createVersionSnapshot(body);
        return sendJson(res, 201, { ok: true, version, versions: listVersions() });
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
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Cache-Control': 'no-store'
        });
        return fs.createReadStream(fullPath).pipe(res);
      }

      const verRestoreMatch = pathname.match(/^\/api\/versions\/([^/]+)\/restore$/);
      if (req.method === 'POST' && verRestoreMatch) {
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
          return sendJson(res, 200, { ok: true, version, versions: listVersions() });
        }
        if (req.method === 'DELETE') {
          deleteVersion(verId);
          return sendJson(res, 200, { ok: true, versions: listVersions() });
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
        return sendJson(res, 200, { ok: true, ...data });
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
          const args = ['compile', '--fqbn', FQBN, '--output-dir', BUILD_DIR];
          if (LIBRARIES_DIR) args.push('--libraries', LIBRARIES_DIR);
          args.push(SKETCH_DIR);

          const result = await runCommand(ARDUINO_CLI, args, 180000);
          const log = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
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
        const args = ['upload', '-p', port, '--fqbn', FQBN, '--input-dir', BUILD_DIR, SKETCH_DIR];
        const result = await runCommand(ARDUINO_CLI, args, 120000);
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
  MIME_TYPES,
  createApiMiddleware
};
