import {capturedEffects,allEffects,lightingDefaults,validLightingExtras} from './captured-lighting.js';
const dpiValues = [200,400,600,800,1000,1200,1400,1600,1800,2000,2400,3200,4000,4800,5600,6400,7200,8000,8800,9600,10400,11200,12800];
const actions = ['Left click','Right click','Middle click','Forward','Back','Rapid Fire','DPI Loop','DPI up','DPI down','Color cycle','Disabled'];
const names = ['Office', 'Game I', 'Game II', 'Game III'];
const defaultProfile = () => ({
  buttons: ['Left click','Right click','Middle click','Forward','Back','DPI Loop','Color cycle'],
  dpi: [400,800,1200,4800,7200,12800], enabled: [true,true,true,true,true,true],
  polling: 1000, doubleClickMs: 150,
  stage: 1, lighting: { effect: 'Static', color: '#ef4444', brightness: 65, speed: 40, ...lightingDefaults() },
  macro: [],
});
const clone = (value) => JSON.parse(JSON.stringify(value));
function validateProfile(p) {
  if (!p || !Array.isArray(p.buttons) || p.buttons.length !== 7 || !p.buttons.every(a => actions.includes(a))) return false;
  if (!Array.isArray(p.dpi) || p.dpi.length !== 6 || !p.dpi.every(d => dpiValues.includes(d))) return false;
  if (!Array.isArray(p.enabled) || p.enabled.length !== 6 || !p.enabled.every(v => typeof v === 'boolean') || !p.enabled.some(Boolean)) return false;
  if (!Number.isInteger(p.stage) || p.stage < 0 || p.stage > 5 || !p.enabled[p.stage]) return false;
  if (p.polling !== undefined && ![125,250,500,1000].includes(p.polling)) return false;
  if(p.doubleClickMs!==undefined&&(!Number.isInteger(p.doubleClickMs)||p.doubleClickMs<0||p.doubleClickMs>65535))return false;
  const l = p.lighting;
  if (!l || ![...allEffects,'Unrecognized','Static','Breathing','Spectrum','Off'].includes(l.effect) || !/^#[\da-f]{6}$/i.test(l.color)) return false;
  if (![l.brightness].every(v => Number.isInteger(v) && v >= 0 && v <= 100)) return false;
  if (!Number.isInteger(l.speed)||l.speed<0||l.speed>140||!validLightingExtras({...lightingDefaults(),...l})) return false;
  return Array.isArray(p.macro) && p.macro.length <= 64 && p.macro.every(e => e &&
    ((e.type === 'delay' && Number.isInteger(e.ms) && e.ms >= 10 && e.ms <= 10000) ||
     (['down','up'].includes(e.type) && /^[A-Z]$/.test(e.key))));
}
function loadProfiles(raw) {
  if (typeof raw !== 'string' || raw.length > 100000) return null;
  try {
    const data = JSON.parse(raw);
    return data.version === 1 && Array.isArray(data.profiles) && data.profiles.length === 4 && data.profiles.every(validateProfile)
      ? data.profiles.map(p => ({...clone(p), polling: p.polling ?? 1000, doubleClickMs: p.doubleClickMs, lighting: {...lightingDefaults(),...clone(p.lighting)}})) : null;
  } catch { return null; }
}
export { dpiValues, actions, names, defaultProfile, validateProfile, loadProfiles, clone };
