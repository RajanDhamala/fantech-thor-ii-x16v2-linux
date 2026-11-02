import {createSessionSettings} from './session-settings.js';
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deviceRequest, deviceResult } from './device-contract.js';
import { lightingArguments } from './lighting-contract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const page = pathToFileURL(path.join(__dirname, 'index.html')).href;
let win;
let pendingScan;
let pendingLighting = false;
let pendingDevice = false;
const sessionSettings=createSessionSettings();

function requireApplicationWindow(event) {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== page) {
    throw new Error('Device access is only available to the application window.');
  }
}

async function runLightingHelper(event, settings, apply) {
  requireApplicationWindow(event);
  const args = lightingArguments(settings, apply);
  if (apply && (pendingLighting || pendingDevice)) throw new Error('A lighting transfer is already in progress.');
  if (apply) pendingLighting = true;
  try {
    return await new Promise((resolve, reject) => {
      execFile(path.join(root, 'bin', 'resa'), args,
        { cwd: root, timeout: 5000, maxBuffer: 16384, encoding: 'utf8' },
        (error, stdout, stderr) => {
          if (error) {
            const detail = stderr.trim().slice(0, 600) || 'Build the helper with make build.';
            reject(new Error(`${apply ? 'Lighting transfer failed; hardware state may be unknown. No retry was made.' : 'Lighting preview failed.'} ${detail}`));
            return;
          }
          try {
            const result = JSON.parse(stdout);
            if (result.status !== (apply ? 'sent-unverified' : 'plan') || result.experimental !== true || result.effect_verified !== false ||
                !/^0713fff[0-7]0b0[0-7]0002$/.test(result.report_hex) ||
                result.settings?.brightness !== settings.brightness || result.settings?.speed !== settings.speed) {
              throw new Error('Invalid lighting result');
            }
            resolve(result);
          } catch { reject(new Error('Invalid helper response. If Apply was clicked, check the mouse; do not assume nothing was sent.')); }
        });
    });
  } finally { if (apply) pendingLighting = false; }
}

app.whenReady().then(() => {
  ipcMain.handle('session:read',event=>{requireApplicationWindow(event);return sessionSettings.read();});
  ipcMain.handle('session:apply',(event,input)=>{requireApplicationWindow(event);return sessionSettings.apply(input);});
  ipcMain.handle('device:operation', async (event, action, input) => {
    requireApplicationWindow(event);
    const request = deviceRequest(action,input);
    if (pendingDevice || pendingLighting) throw new Error('A mouse operation is already in progress.');
    pendingDevice=true;
    try {
      return await new Promise((resolve,reject)=>{
        const child=execFile(path.join(root,'bin','resa'),['device',action],
          {cwd:root,timeout:30000,maxBuffer:32768,encoding:'utf8'},
          (error,stdout,stderr)=>{
            if(error){reject(new Error(stderr.trim().slice(0,1200)||'Device operation interrupted. Read the mouse before retrying.'));return;}
            try{resolve(deviceResult(action,JSON.parse(stdout)));}
            catch(error){reject(error);}
          });
        child.stdin.on('error',()=>{});
        child.stdin.end(JSON.stringify(request));
      });
    } finally { pendingDevice=false; }
  });
  ipcMain.handle('lighting:plan', (event, settings) => runLightingHelper(event, settings, false));
  ipcMain.handle('lighting:apply', (event, settings) => runLightingHelper(event, settings, true));
  ipcMain.handle('device:discover', (event) => {
    requireApplicationWindow(event);
    // Fixed executable and fixed arguments: the renderer cannot choose commands.
    // This command reads cached sysfs metadata and never opens a device node.
    if (!pendingScan) {
      pendingScan = new Promise((resolve, reject) => {
        execFile(path.join(root, 'bin', 'resa'), ['list', '--json'],
          { cwd: root, timeout: 5000, maxBuffer: 1024 * 1024, encoding: 'utf8' },
          (error, stdout) => {
            if (error) { reject(new Error('Device discovery failed. Run make build, then refresh the device.')); return; }
            try {
              const devices = JSON.parse(stdout);
              if (!Array.isArray(devices)) throw new Error('Invalid discovery result');
              resolve(devices);
            } catch { reject(new Error('The device helper returned invalid metadata.')); }
          });
      }).finally(() => { pendingScan = undefined; });
    }
    return pendingScan;
  });
  win = new BrowserWindow({
    width: 1250, height: 930, minWidth: 1000, minHeight: 760,
    backgroundColor: '#111315', title: 'Resa — Thor II X16v2',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '.generated', 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true, webviewTag: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question', buttons: ['Keep editing', 'Discard changes'],
      defaultId: 0, cancelId: 0, title: 'Unsaved mouse changes',
      message: 'Discard your pending edits?',
      detail: 'Settings already applied to the mouse are kept. Only your pending edits will be discarded.',
    });
    // Electron uses preventDefault here to permit the otherwise-blocked unload.
    if (choice === 1) event.preventDefault();
  });
  win.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  win.loadFile(path.join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());

app.on('will-quit',()=>sessionSettings.close());
