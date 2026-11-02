import { readFile, writeFile } from 'node:fs/promises';
import { mousePhotos } from '../desktop/mouse-assets.js';

const read = (file) => readFile(new URL(file, import.meta.url), 'utf8');
const [html, css, capturedLighting, model, dropdown, photoAssets, geometry, input, viewer, lightingContract, liveLighting, deviceContract, deviceControls, sessionControls, renderer] = await Promise.all([
  read('../desktop/index.html'), read('../desktop/styles.css'),
  read('../desktop/captured-lighting.js'), read('../desktop/model.js'), read('../desktop/dropdown.js'), read('../desktop/mouse-assets.js'),
  read('../desktop/mouse-geometry.js'), read('../desktop/mouse-input.js'), read('../desktop/mouse-viewer.js'),
  read('../desktop/lighting-contract.js'), read('../desktop/live-lighting.js'), read('../desktop/device-contract.js'), read('../desktop/device-controls.js'), read('../desktop/session-controls.js'), read('../desktop/renderer.js'),
]);
// One offline review artifact. The production Electron page keeps its strict CSP
// and external ESM sources; this file has no native bridge or device permissions.
let script = [capturedLighting,model,dropdown,photoAssets,geometry,input,viewer,lightingContract,liveLighting,deviceContract,deviceControls,sessionControls,renderer]
  .map(source=>source.replace(/^export \{.*\};$/gm,'').replace(/^export /gm,'').replace(/^import .*;\n/gm,''))
  .join('\n');
for(const photo of mousePhotos) {
  const bytes=await readFile(new URL(`../assets/${photo.src.split('/').pop()}`,import.meta.url));
  script=script.split(photo.src).join(`data:image/jpeg;base64,${bytes.toString('base64')}`);
}
const preview = html
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; base-uri \'none\'; form-action \'none\'">')
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>${css}</style>`)
  .replace('<script type="module" src="renderer.js"></script>', '')
  .replace('</body>', () => `<script type="module">${script}</script></body>`);
await writeFile(new URL('../evidence/desktop-preview.html', import.meta.url), preview);
console.log('Wrote evidence/desktop-preview.html (offline UI preview, no hardware bridge).');
