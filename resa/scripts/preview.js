// Dependency-free UI preview. Only serves desktop assets; no device access.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mousePhotos } from '../desktop/mouse-assets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = {
  '/': ['index.html','text/html'],
  '/styles.css': ['styles.css','text/css'],
  '/device-controls.js': ['device-controls.js','text/javascript'],
  '/device-contract.js': ['device-contract.js','text/javascript'],
  '/renderer.js': ['renderer.js','text/javascript'],
  '/model.js': ['model.js','text/javascript'],
  '/dropdown.js': ['dropdown.js','text/javascript'],
  '/mouse-assets.js': ['mouse-assets.js','text/javascript'],
  '/mouse-geometry.js': ['mouse-geometry.js','text/javascript'],
  '/mouse-viewer.js': ['mouse-viewer.js','text/javascript'],
  '/mouse-input.js': ['mouse-input.js','text/javascript'],
  '/lighting-contract.js': ['lighting-contract.js','text/javascript'],
  '/live-lighting.js': ['live-lighting.js','text/javascript'],
  '/captured-lighting.js': ['captured-lighting.js','text/javascript'],
  '/session-controls.js': ['session-controls.js','text/javascript'],
};
for(const photo of mousePhotos) assets[photo.src.replace('..','')] = [photo.src,'image/jpeg'];
const server = http.createServer((req, res) => {
  const asset = assets[req.url];
  if (req.method !== 'GET' || !asset) { res.writeHead(404); res.end(); return; }
  fs.readFile(path.join(__dirname, '..', 'desktop', asset[0]), (err, data) => {
    if (err) { res.writeHead(500); res.end('Preview asset unavailable'); return; }
    res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-store' }); res.end(data);
  });
});
server.on('error', (error) => {
  console.error(`Preview server could not start: ${error.message}`);
  console.error('Use pnpm snapshot for an offline HTML preview.');
  process.exitCode = 1;
});
server.listen(4173, '127.0.0.1', () => console.log('UI preview: http://127.0.0.1:4173 (no hardware bridge)'));
