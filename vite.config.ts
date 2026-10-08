import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function copyCesiumAssets() {
  const sourceDir = path.resolve(__dirname, 'node_modules/cesium/Build/Cesium');
  const targetDir = path.resolve(__dirname, 'public/cesium');

  return {
    name: 'copy-cesium-assets',
    buildStart() {
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      fs.rmSync(targetDir, { recursive: true, force: true });
      fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
    },
    configureServer(server) {
      const syncAssets = () => {
        if (!fs.existsSync(sourceDir)) return;
        fs.mkdirSync(path.dirname(targetDir), { recursive: true });
        fs.rmSync(targetDir, { recursive: true, force: true });
        fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
      };

      syncAssets();
      server.watcher.add(sourceDir);
      server.watcher.on('change', syncAssets);
      server.watcher.on('add', syncAssets);
      server.watcher.on('unlink', syncAssets);
    },
  };
}

export default defineConfig({
  plugins: [react(), copyCesiumAssets()],
});