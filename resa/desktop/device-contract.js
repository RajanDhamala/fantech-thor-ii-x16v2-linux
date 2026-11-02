import {lightingPatch} from './captured-lighting.js';
import {actions} from './model.js';

const rates = [125,250,500,1000];
const buttonActions = actions.filter(action=>action!=='Disabled');
const buttonKeys = Array.from({length:7},(_,index)=>`button${index+1}`);
const dpis = [200,400,600,800,1000,1200,1400,1600,1800,2000,2400,3200,4000,4800,5600,6400,7200,8000,8800,9600,10400,11200,12800];
function deviceRequest(action, input) {
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const keys = (value, names) => object(value) && Object.keys(value).sort().join() === names.sort().join();
  if (action === 'read') { if (!keys(input, [])) throw Error('Read accepts no settings.'); return {}; }
  if (action === 'rgb') {
    if (!keys(input, ['effect','color','speed']) || !['Static','Breathing','Off'].includes(input.effect) || !/^#[\da-f]{6}$/i.test(input.color) || !Number.isInteger(input.speed) || input.speed < 0 || input.speed > 5) throw Error('Invalid lighting settings.');
    return structuredClone(input);
  }
  if (!['apply','restore'].includes(action) || !keys(input, action === 'apply' ? ['expected_revision','changes'] : ['expected_revision']) || !/^[a-f0-9]{64}$/.test(input.expected_revision)) throw Error('Read mouse settings before applying.');
  if (action === 'restore') return structuredClone(input);
  const c = input.changes;
  if (!object(c) || !Object.keys(c).length || Object.keys(c).some(k => !['dpi','polling','brightness_raw','lighting','double_click_ms',...buttonKeys].includes(k))) throw Error('Choose a supported settings section.');
  if ('polling' in c && !rates.includes(c.polling)) throw Error('Choose a supported polling rate.');
  for (const key of buttonKeys) if (key in c && !buttonActions.includes(c[key])) throw Error('Choose a supported mouse-button action.');
  if ('brightness_raw' in c && (!Number.isInteger(c.brightness_raw) || c.brightness_raw < 0 || c.brightness_raw > 6)) throw Error('Invalid brightness level.');
  if ('double_click_ms' in c&&(!Number.isInteger(c.double_click_ms)||c.double_click_ms<8||c.double_click_ms>300))throw Error('Choose a double-click interval from 8 to 300 ms.');
  if ('lighting' in c) lightingPatch(c.lighting);
  if ('dpi' in c) {
    const d=c.dpi;
    if (!keys(d,['values','enabled','stage']) || !Array.isArray(d.values) || d.values.length!==6 || !d.values.every(v=>dpis.includes(v)) || !Array.isArray(d.enabled) || d.enabled.length!==6 || !d.enabled.every(v=>typeof v==='boolean') || !Number.isInteger(d.stage) || d.stage<0 || d.stage>5 || !d.enabled[d.stage]) throw Error('Choose six supported DPI stages and an enabled active stage.');
  }
  return structuredClone(input);
}
function deviceResult(action, result) {
  if (action==='rgb') {
    if (result?.status!=='sent-unverified' || result.reports_sent!==7 || result.physical_effect_verified!==false) throw Error('Unexpected lighting response. Check the mouse before retrying.');
    return result;
  }
  if (action==='read' ? result?.status!=='read' : !['unchanged','written-readback'].includes(result?.status)) throw Error('Unexpected operation status. Read mouse again.');
  const s=result?.settings;
  if (!result || !['read','unchanged','written-readback'].includes(result.status) || !/^[a-f0-9]{64}$/.test(result.revision) || !s || !rates.includes(s.polling) || !buttonKeys.every(key=>buttonActions.includes(s[key])) || !Number.isInteger(s.brightness_raw) || s.brightness_raw<0 || s.brightness_raw>7) throw Error('Unexpected device response. Read the mouse again.');
  if(s.double_click_ms!==undefined&&(!Number.isInteger(s.double_click_ms)||s.double_click_ms<0||s.double_click_ms>65535))throw Error('Invalid device timing readback.');
  if(s.lighting)lightingPatch(s.lighting,true);
  deviceRequest('apply',{expected_revision:result.revision,changes:{dpi:{values:s.dpi,enabled:s.enabled,stage:s.stage}}});
  return result;
}
export {rates,buttonActions,buttonKeys,deviceRequest,deviceResult};
