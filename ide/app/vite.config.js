const { defineConfig } = require('vite');
const { createApiMiddleware, PORT } = require('./backend/apiMiddleware');

function ktIdeBackendPlugin() {
  return {
    name: 'kt-middle-ide-backend',
    configureServer(server) {
      server.middlewares.use(createApiMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createApiMiddleware());
    }
  };
}

module.exports = defineConfig({
  publicDir: 'public',
  plugins: [ktIdeBackendPlugin()],
  server: {
    host: '0.0.0.0',
    port: PORT,
    strictPort: true,
    open: false
  },
  preview: {
    host: '0.0.0.0',
    port: PORT,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
