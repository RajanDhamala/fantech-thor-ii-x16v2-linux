import { readFile, mkdir, writeFile } from 'node:fs/promises';

// Electron sandboxed preloads do not support ESM. Adapt the single Electron
// import at build time; all authored application source remains ESM.
// This intentionally supports only our one-import bridge, not arbitrary modules.
const source = await readFile(new URL('../desktop/preload.js', import.meta.url), 'utf8');
const declaration = "import { contextBridge, ipcRenderer } from 'electron';";
if (!source.startsWith(declaration) || /^import /m.test(source.slice(declaration.length))) {
  throw new Error('Preload import layout changed; update the sandbox build adapter.');
}
await mkdir(new URL('../desktop/.generated/', import.meta.url), { recursive: true });
await writeFile(new URL('../desktop/.generated/preload.cjs', import.meta.url),
  source.replace(declaration, "const { contextBridge, ipcRenderer } = require('electron');"));
