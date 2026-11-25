'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const {
  PORT,
  SKETCH_DIR,
  LIBRARIES_DIR,
  ARDUINO_CLI,
  VERSIONS_DIR,
  PLUGINS_DIR,
  MIME_TYPES,
  createApiMiddleware
} = require('./backend/apiMiddleware');

const DIST_DIR = path.join(__dirname, 'dist');
const HAS_DIST = fs.existsSync(path.join(DIST_DIR, 'index.html'));

function isViteAvailable() {
  try {
    require.resolve('vite', { paths: [__dirname] });
    return true;
  } catch (_) {
    return false;
  }
}

const FORCE_PROD = process.argv.includes('--prod') || process.argv.includes('--offline');
const HAS_VITE = isViteAvailable();
const USE_PROD = (FORCE_PROD && HAS_DIST) || (!HAS_VITE && HAS_DIST);

function serveDistFile(reqPath, res) {
  const clean = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
  const safePath = path.normalize(clean);
  if (safePath.startsWith('..') || path.isAbsolute(safePath)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  const fullPath = path.join(DIST_DIR, safePath);
  const resolved = fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()
    ? fullPath
    : path.join(DIST_DIR, 'index.html');
  const ext = path.extname(resolved).toLowerCase();
  const stat = fs.statSync(resolved);
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(resolved).pipe(res);
}

async function start() {
  if (USE_PROD) {
    const modeLabel = HAS_VITE ? 'Vite Dist Production' : 'Offline Pure Node / Dist Server';
    const api = createApiMiddleware();
    const server = http.createServer((req, res) => {
      api(req, res, () => serveDistFile(decodeURIComponent(req.url.split('?')[0]), res));
    });
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`KT Middle IDE (${modeLabel}) running at http://localhost:${PORT}`);
      console.log(`Sketch Directory : ${SKETCH_DIR}`);
      console.log(`Versions Store   : ${VERSIONS_DIR}`);
      console.log(`Plugins Dir      : ${PLUGINS_DIR}`);
      console.log(`Libraries Dir    : ${LIBRARIES_DIR || '(default Arduino libraries)'}`);
      console.log(`Arduino CLI      : ${ARDUINO_CLI}`);
    });
    return;
  }

  if (!HAS_VITE) {
    console.error('[ERR] Neither Vite (node_modules) nor prebuilt dist/index.html was found.');
    console.error('      Run "npm.cmd install" and "npm.cmd run build" once while online.');
    process.exit(1);
  }

  const { createServer } = require('vite');
  const viteServer = await createServer({
    root: __dirname,
    configFile: path.join(__dirname, 'vite.config.js'),
    server: {
      host: '0.0.0.0',
      port: PORT,
      strictPort: true
    }
  });
  await viteServer.listen();
  console.log(`KT Middle IDE (Vite Server) running at http://localhost:${PORT}`);
  console.log(`Sketch Directory : ${SKETCH_DIR}`);
  console.log(`Versions Store   : ${VERSIONS_DIR}`);
  console.log(`Plugins Dir      : ${PLUGINS_DIR}`);
  console.log(`Libraries Dir    : ${LIBRARIES_DIR || '(default Arduino libraries)'}`);
  console.log(`Arduino CLI      : ${ARDUINO_CLI}`);
}

start().catch((err) => {
  console.error('[ERR] Failed to start KT Middle IDE:', err);
  process.exit(1);
});
