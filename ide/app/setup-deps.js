'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execFileSync } = require('child_process');

const APP_DIR = __dirname;
const IDE_DIR = path.resolve(APP_DIR, '..');
const TOOLS_DIR = path.join(APP_DIR, 'tools');
const PTBOT_CORE_ID = 'PTBOT_ESP32:esp32';
const PTBOT_BOARD_INDEX_URL = 'https://raw.githubusercontent.com/pt-robotics/esp32/refs/heads/main/package_ptbot_index.json';

function findSketchDir() {
  const candidates = [
    process.env.SKETCH_DIR,
    path.resolve(IDE_DIR, '..'),
    IDE_DIR
  ];
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'KT_ATOM_Middle.ino'))) {
      return dir;
    }
  }
  return path.resolve(IDE_DIR, '..');
}

function findArduinoCli() {
  const localBin = path.join(TOOLS_DIR, process.platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli');
  const candidates = [
    process.env.ARDUINO_CLI,
    localBin,
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
  return '';
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} while downloading ${url}`));
      }
      const stream = fs.createWriteStream(destPath);
      res.pipe(stream);
      stream.on('finish', () => stream.close(() => resolve(destPath)));
      stream.on('error', reject);
    }).on('error', reject);
  });
}

async function installStandaloneArduinoCli() {
  fs.mkdirSync(TOOLS_DIR, { recursive: true });
  const plat = process.platform;
  const arch = process.arch === 'arm64' ? 'ARM64' : '64bit';

  let url = '';
  let isZip = false;
  if (plat === 'win32') {
    // Arduino CLI does not publish Windows_ARM64; Windows_64bit runs on both x64 and ARM64.
    url = 'https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Windows_64bit.zip';
    isZip = true;
  } else if (plat === 'darwin') {
    url = `https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_macOS_${arch}.tar.gz`;
  } else {
    url = `https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Linux_${arch}.tar.gz`;
  }

  const archivePath = path.join(TOOLS_DIR, isZip ? 'arduino-cli.zip' : 'arduino-cli.tar.gz');
  console.log(`[SETUP] Downloading standalone arduino-cli from ${url} ...`);
  await downloadFile(url, archivePath);

  if (plat === 'win32') {
    const escArchive = archivePath.replace(/'/g, "''");
    const escDest = TOOLS_DIR.replace(/'/g, "''");
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `Expand-Archive -Path '${escArchive}' -DestinationPath '${escDest}' -Force`],
      { stdio: 'inherit', timeout: 60000 }
    );
  } else {
    execFileSync('tar', ['-xzf', archivePath, '-C', TOOLS_DIR], { stdio: 'inherit', timeout: 60000 });
  }
  try { fs.unlinkSync(archivePath); } catch (_) {}

  const binPath = path.join(TOOLS_DIR, plat === 'win32' ? 'arduino-cli.exe' : 'arduino-cli');
  if (plat !== 'win32' && fs.existsSync(binPath)) {
    fs.chmodSync(binPath, 0o755);
  }
  return fs.existsSync(binPath) ? binPath : '';
}

function isPtbotCoreInstalled(cli) {
  if (cli) {
    try {
      const out = execFileSync(cli, ['core', 'list'], { encoding: 'utf8', timeout: 10000 });
      if (out.includes(PTBOT_CORE_ID)) return true;
    } catch (_) {}
  }

  const dataRoots = [
    process.env.ARDUINO_DIRECTORIES_DATA,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Arduino15') : '',
    path.join(os.homedir(), 'AppData', 'Local', 'Arduino15'),
    path.join(os.homedir(), 'Library', 'Arduino15'),
    path.join(os.homedir(), '.arduino15'),
    '/root/.arduino15'
  ].filter(Boolean);

  for (const dataDir of dataRoots) {
    const esp32Dir = path.join(dataDir, 'packages', 'PTBOT_ESP32', 'hardware', 'esp32');
    if (!fs.existsSync(esp32Dir)) continue;
    try {
      const entries = fs.readdirSync(esp32Dir, { withFileTypes: true });
      if (entries.some((ent) => ent.isDirectory())) return true;
    } catch (_) {}
  }
  return false;
}

function ensurePtbotCore(cli) {
  if (!cli) return false;
  if (isPtbotCoreInstalled(cli)) {
    console.log('[OK] PTBOT_ESP32:esp32 board core is installed locally (100% offline ready).');
    return true;
  }

  console.log('[INFO] PTBOT_ESP32:esp32 board core not found — installing automatically (first-time download)...');
  try {
    execFileSync(cli, ['config', 'init'], { stdio: 'ignore', timeout: 15000 });
  } catch (_) {}
  try {
    execFileSync(cli, ['config', 'add', 'board_manager.additional_urls', PTBOT_BOARD_INDEX_URL], {
      stdio: 'ignore',
      timeout: 15000
    });
  } catch (_) {}

  try {
    execFileSync(cli, ['core', 'update-index', '--additional-urls', PTBOT_BOARD_INDEX_URL], {
      stdio: 'inherit',
      timeout: 300000
    });
    execFileSync(cli, ['core', 'install', PTBOT_CORE_ID, '--additional-urls', PTBOT_BOARD_INDEX_URL], {
      stdio: 'inherit',
      timeout: 600000
    });
  } catch (err) {
    console.log(`[WARN] Auto-install of ${PTBOT_CORE_ID} failed (${err.message}).`);
  }

  if (isPtbotCoreInstalled(cli)) {
    console.log('[OK] PTBOT_ESP32:esp32 board core installed successfully.');
    return true;
  }

  console.log(`[WARN] PTBOT_ESP32:esp32 board core is still missing. Ensure internet access on first run or add URL in Arduino IDE: ${PTBOT_BOARD_INDEX_URL}`);
  return false;
}

function syncBundledManagerLibrary(sketchDir, cli) {
  const src = path.join(sketchDir, 'libraries', 'KT_ATIOM_VX_MANAGER');
  if (!fs.existsSync(src)) return;

  let userArduinoDir = '';
  if (cli) {
    try {
      const out = execFileSync(cli, ['config', 'get', 'directories.user'], {
        encoding: 'utf8',
        timeout: 5000
      }).trim();
      if (out) userArduinoDir = out.split(/\r?\n/)[0].trim();
    } catch (_) {}
  }
  if (!userArduinoDir) {
    userArduinoDir = process.platform === 'linux'
      ? path.join(os.homedir(), 'Arduino')
      : path.join(os.homedir(), 'Documents', 'Arduino');
  }

  const dst = path.join(userArduinoDir, 'libraries', 'KT_ATIOM_VX_MANAGER');
  if (path.resolve(src).toLowerCase() === path.resolve(dst).toLowerCase()) return;

  try {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.cpSync(src, dst, { recursive: true, force: true });
    console.log(`[OK] Synced KT_ATIOM_VX_MANAGER library to ${dst} (ready for Arduino IDE too).`);
  } catch (err) {
    console.log(`[WARN] Could not sync KT_ATIOM_VX_MANAGER to ${dst} (${err.message}).`);
  }
}

async function main() {
  const major = parseInt(process.versions.node.split('.')[0], 10);
  console.log(`[SETUP] Node.js ${process.version} detected.`);
  if (major < 18) {
    console.error('[ERR] KT Middle IDE requires Node.js >= 18.0.0');
    process.exit(1);
  }

  const sketchDir = findSketchDir();
  console.log(`[SETUP] Sketch Directory: ${sketchDir}`);

  // Ensure local .kt-versions store and .gitignore entry
  const versionsDir = path.join(sketchDir, '.kt-versions');
  fs.mkdirSync(versionsDir, { recursive: true });
  const gitignorePath = path.join(sketchDir, '.gitignore');
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

  // Ensure offline esptool-js bundle exists
  const vendorBundle = path.join(APP_DIR, 'src', 'vendor', 'esptool-js.bundle.js');
  if (fs.existsSync(vendorBundle)) {
    console.log('[OK] Offline esptool-js bundle is ready.');
  } else {
    console.log('[WARN] src/vendor/esptool-js.bundle.js not found — WebSerial USB Flash disabled.');
  }

  let cli = findArduinoCli();
  if (!cli) {
    console.log('[INFO] arduino-cli not found on host; installing standalone arduino-cli into ide/app/tools ...');
    try {
      cli = await installStandaloneArduinoCli();
    } catch (err) {
      console.log(`[WARN] Could not auto-download arduino-cli (${err.message}).`);
      console.log('       Install Arduino IDE 2.x or place arduino-cli in PATH / ide/app/tools to enable compiling.');
    }
  }

  if (cli) {
    try {
      const ver = execFileSync(cli, ['version'], { encoding: 'utf8', timeout: 8000 }).trim();
      console.log(`[OK] Arduino CLI: ${cli} (${ver})`);
      ensurePtbotCore(cli);
    } catch (err) {
      console.log(`[WARN] Arduino CLI check warning: ${err.message}`);
    }
  }

  syncBundledManagerLibrary(sketchDir, cli);

  console.log('[OK] Setup complete! KT Middle IDE is ready to launch.');
}

main();
