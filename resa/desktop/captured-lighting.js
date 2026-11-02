// Windows recordings 10, 14–25, 27–29. Unsupported modes can be read, never selected.
export const capturedEffects = ['DPI Breathing Effect','Cycle Breathing Effect','Light On','Flowing Water Effect','Mono Water Effect','Neon','Flicker','Enraptured','Button Response'];
export const allEffects = ['DPI Breathing Effect','Cycle Breathing Effect','Light On','Flowing Water Effect','Mono Water Effect','Comet Streak','Neon','Ambilight','Flicker','Starlight','Ripple','Enraptured','Button Response'];
export const responseEffects = ['Cycle Breathing Effect','Flowing Water Effect','Comet Streak','Mono Water Effect'];
export const directions = ['Clockwise','Anti Clockwise','Two way','Overwrite'];
export const directionsForEffect = effect => effect==='Mono Water Effect' ? directions.slice(0,3) : directions;
export const hexColor = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
export const toPalette = color => [1,3,5].map(i=>15-Math.round(parseInt(color.slice(i,i+2),16)/17));
export const fromPalette = rgb => '#'+rgb.map(n=>((15-n)*17).toString(16).padStart(2,'0')).join('');
export const snapColor = color => fromPalette(toPalette(color));
export const lightingDefaults = () => ({palette:['#ff0000','#ff8800','#ffff00','#00ff00','#00ffff','#0000ff','#8800ff'],slots:Array(7).fill(true),responses:Array(7).fill(responseEffects[0]),responseEnabled:Array(7).fill(true),direction:directions[0],symmetry:false});
export function validLightingExtras(l) {
  return Array.isArray(l.palette)&&l.palette.length===7&&l.palette.every(hexColor)&&
    Array.isArray(l.slots)&&l.slots.length===7&&l.slots.every(v=>typeof v==='boolean')&&
    Array.isArray(l.responses)&&l.responses.length===7&&l.responses.every(v=>responseEffects.includes(v))&&
    Array.isArray(l.responseEnabled)&&l.responseEnabled.length===7&&l.responseEnabled.every(v=>typeof v==='boolean')&&
    directions.includes(l.direction)&&typeof l.symmetry==='boolean';
}
export function lightingPatch(value, readback=false) {
  const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
  if(!object(value)||!Object.keys(value).length||Object.keys(value).some(k=>!['effect','speed_raw','palette','enabled','responses','response_enabled','direction','symmetry'].includes(k)))throw Error('Invalid lighting changes.');
  if('effect'in value&&!(readback?[...allEffects,'Unrecognized']:capturedEffects).includes(value.effect))throw Error('Choose an available lighting effect.');
  if('speed_raw'in value&&(!Number.isInteger(value.speed_raw)||value.speed_raw<0||value.speed_raw>(readback?7:5)))throw Error('Choose a speed from 0 to 5.');
  if('palette'in value&&(!Array.isArray(value.palette)||value.palette.length!==7||!value.palette.every(rgb=>Array.isArray(rgb)&&rgb.length===3&&rgb.every(n=>Number.isInteger(n)&&n>=0&&n<=15))))throw Error('Invalid color slots.');
  for(const [key,valid] of [['enabled',v=>typeof v==='boolean'],['responses',v=>responseEffects.includes(v)],['response_enabled',v=>typeof v==='boolean']])
    if(key in value&&(!Array.isArray(value[key])||value[key].length!==7||!value[key].every(valid)))throw Error('Invalid lighting slots.');
  if(!readback&&'enabled'in value&&!value.enabled.some(Boolean))throw Error('Keep at least one color slot enabled.');
  if('direction'in value&&!directions.includes(value.direction))throw Error('Invalid lighting direction.');
  if(!readback&&value.effect==='Mono Water Effect'&&'direction'in value&&!directionsForEffect(value.effect).includes(value.direction))throw Error('Mono Water supports Clockwise, Anti Clockwise, or Two way.');
  if('symmetry'in value&&typeof value.symmetry!=='boolean')throw Error('Invalid symmetry setting.');
  if(readback&&!['effect','speed_raw','palette','enabled','responses','direction','symmetry'].every(k=>k in value))throw Error('Incomplete lighting readback.');
  return structuredClone(value);
}
export function adoptLighting(profile, settings, preserveLive=false) {
  const light=profile.lighting;
  if(!settings.lighting)return; // Older mocked/offline bridges have no palette.
  const s=settings.lighting;
  // Off and the legacy live color modes have no reliable stored-mode readback.
  if(!preserveLive&&light.effect!=='Off'){
    light.effect=s.effect;light.speed=Math.round(s.speed_raw*20);
  }
  light.palette=s.palette.map(fromPalette);light.slots=[...s.enabled];light.responses=[...s.responses];light.direction=s.direction;light.symmetry=s.symmetry;
  // Off temporarily clears the device flags; retain the user's choices for On.
  if(light.effect!=='Off'&&s.response_enabled)light.responseEnabled=[...s.response_enabled];
}
