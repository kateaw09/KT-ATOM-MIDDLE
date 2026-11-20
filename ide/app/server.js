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
  MIME_TYPES,
  createApiMiddleware
} = require('./backend/apiMiddleware');

const DIST_DIR = path.join(__dirname, 'dist');
const USE_PROD = process.argv.includes('--prod') && fs.existsSync(path.join(DIST_DIR, 'index.html'));

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
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(resolved).pipe(res);
}

async function start() {
  if (USE_PROD) {
    const api = createApiMiddleware();
    const server = http.createServer((req, res) => {
      api(req, res, () => serveDistFile(decodeURIComponent(req.url.split('?')[0]), res));
    });
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`KT Middle IDE (Vite Dist Production) running at http://localhost:${PORT}`);
      console.log(`Sketch Directory : ${SKETCH_DIR}`);
      console.log(`Versions Store   : ${VERSIONS_DIR}`);
      console.log(`Libraries Dir    : ${LIBRARIES_DIR || '(default Arduino libraries)'}`);
      console.log(`Arduino CLI      : ${ARDUINO_CLI}`);
    });
    return;
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
  console.log(`Libraries Dir    : ${LIBRARIES_DIR || '(default Arduino libraries)'}`);
  console.log(`Arduino CLI      : ${ARDUINO_CLI}`);
}

start().catch((err) => {
  console.error('[ERR] Failed to start KT Middle IDE:', err);
  process.exit(1);
});
