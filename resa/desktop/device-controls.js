import {capturedEffects,toPalette,adoptLighting} from './captured-lighting.js';
import {buttonKeys,deviceRequest,deviceResult} from './device-contract.js';

const cloneDeviceProfile=value=>structuredClone(value);
const sameDeviceValue=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const brightnessCode=percent=>6-Math.round(percent*6/100);
export const brightnessPercent=code=>Math.round((6-Math.min(code,6))*100/6);

export function changesFor(profile,device,baseline) {
  if(!profile.buttons.includes('Left click'))throw Error('Keep at least one button assigned to Left click.');
  const changes={};
  if(!sameDeviceValue(profile.dpi,device.dpi)||!sameDeviceValue(profile.enabled,device.enabled)||profile.stage!==device.stage)
    changes.dpi={values:[...profile.dpi],enabled:[...profile.enabled],stage:profile.stage};
  if(Number.isInteger(device.double_click_ms)&&Number.isInteger(profile.doubleClickMs)&&profile.doubleClickMs!==device.double_click_ms)changes.double_click_ms=profile.doubleClickMs;
  if(profile.polling!==device.polling)changes.polling=profile.polling;
  buttonKeys.forEach((key,index)=>{if(profile.buttons[index]!==device[key])changes[key]=profile.buttons[index];});
  if(profile.lighting.effect!=='Off'&&profile.lighting.brightness!==baseline.lighting.brightness)
    changes.brightness_raw=brightnessCode(profile.lighting.brightness);
  const light=profile.lighting, old=baseline.lighting, lighting={};
  if(light.effect!==old.effect&&![...capturedEffects,'Static','Breathing','Off'].includes(light.effect))throw Error('This lighting effect is not available yet.');
  if(light.effect!==old.effect&&capturedEffects.includes(light.effect))lighting.effect=light.effect;
  if(light.effect==='Off'&&device.lighting?.effect==='Button Response')lighting.effect='Light On';
  if(light.speed!==old.speed&&capturedEffects.includes(light.effect))lighting.speed_raw=Math.round(light.speed/20);
  for(const [local,native,convert] of [['palette','palette',v=>v.map(toPalette)],['slots','enabled',v=>[...v]],['responses','responses',v=>[...v]],['direction','direction',v=>v],['symmetry','symmetry',v=>v]])
    if(!sameDeviceValue(light[local],old[local]))lighting[native]=convert(light[local]);
  if(device.lighting?.response_enabled){
    const enabled=light.effect==='Off'?Array(7).fill(false):light.responseEnabled;
    if(!sameDeviceValue(enabled,device.lighting.response_enabled))lighting.response_enabled=[...enabled];
  }
  if(Object.keys(lighting).length)changes.lighting=lighting;
  const live=['Static','Breathing','Off'].includes(light.effect);
  const lightingChanged=['effect','color','speed'].some(key=>light[key]!==old[key]);
  const rgb=live&&(lightingChanged||(device.lighting&&Object.keys(changes).length))?{effect:light.effect,color:light.color,speed:Math.min(5,Math.round(light.speed/20))}:null;
  return {changes,rgb};
}

export function withDevice(profile,settings,{preserveLive=false}={}) {
  const next=cloneDeviceProfile(profile);
  next.dpi=[...settings.dpi];next.enabled=[...settings.enabled];next.stage=settings.stage;
  next.polling=settings.polling;next.buttons=buttonKeys.map(key=>settings[key]);
  if(next.lighting.effect!=='Off')next.lighting.brightness=brightnessPercent(settings.brightness_raw);
  if(Number.isInteger(settings.double_click_ms))next.doubleClickMs=settings.double_click_ms;
  adoptLighting(next,settings,preserveLive);
  return next;
}

// Preserve edited sections while adopting fresh device values for untouched ones.
function rebaseDeviceEdits(profile,previous,settings) {
  const preserveLive=[profile,previous].every(p=>['Static','Breathing','Off'].includes(p.lighting.effect));
  const next=withDevice(profile,settings,{preserveLive});
  if(previous.lighting.effect==='Off')next.lighting.responseEnabled=cloneDeviceProfile(profile.lighting.responseEnabled);
  if(['dpi','enabled','stage'].some(key=>!sameDeviceValue(profile[key],previous[key])))
    for(const key of ['dpi','enabled','stage'])next[key]=cloneDeviceProfile(profile[key]);
  if(profile.doubleClickMs!==previous.doubleClickMs)next.doubleClickMs=profile.doubleClickMs;
  if(profile.polling!==previous.polling)next.polling=profile.polling;
  buttonKeys.forEach((key,index)=>{if(profile.buttons[index]!==previous.buttons[index])next.buttons[index]=profile.buttons[index];});
  for(const key of Object.keys(profile.lighting)){
    if(['palette','slots','responses','responseEnabled'].includes(key)){
      profile.lighting[key].forEach((value,i)=>{if(!sameDeviceValue(value,previous.lighting[key][i]))next.lighting[key][i]=cloneDeviceProfile(value);});
    }else if(!sameDeviceValue(profile.lighting[key],previous.lighting[key]))next.lighting[key]=cloneDeviceProfile(profile.lighting[key]);
  }
  return next;
}

export function mountDeviceControls({getProfile,onRead,onSaved,onUndo}) {
  const $=id=>document.getElementById(id);
  const api=window.resa;
  let available=false,busy=false,ready=false,revision=null,device=null,baseline=cloneDeviceProfile(getProfile());
  let needsFreshRead=false,hasError=false;
  let canRestore=false,lastMessage='Connect the mouse to Linux to load its settings.';
  const pending=()=>Boolean(baseline&&(!sameDeviceValue(getProfile(),baseline)||
    (getProfile().lighting.effect==='Off'&&(device?.lighting?.response_enabled?.some(Boolean)||device?.lighting?.effect==='Button Response'))));
  function update() {
    const changed=pending();
    $('save').disabled=busy||!ready||!available||!changed;
    $('undo').disabled=busy||!changed;
    $('device-restore').disabled=busy||!ready||!canRestore;
    // A failed operation must never strand the whole editor in a disabled state.
    $('settings-editor').disabled=busy;
    $('device-retry').hidden=!hasError||!available;
    $('device-retry').disabled=busy;
    $('device-error').hidden=!hasError;
    $('save-status').setAttribute?.('role',hasError?'alert':'status');
    document.querySelectorAll('.profile').forEach(button=>{button.disabled=busy;});
    $('save').textContent=busy?'Working…':'Apply changes';
    $('save-status').textContent=ready&&changed&&!busy?'Unapplied changes · Apply changes updates the mouse and saves your preset.':lastMessage;
  }
  function status(message){hasError=false;lastMessage=message;update();}
  function failure(message,error){
    hasError=true;lastMessage=message;
    $('device-error-text').textContent=String(error.message||error);
  }
  async function load() {
    if(busy||!available||!api?.readDevice)return;
    const preserve=pending();
    busy=true;status('Loading settings from your mouse…');
    try {
      const result=deviceResult('read',await api.readDevice());
      if(!available)throw Error('Mouse disconnected. Reconnect and refresh.');
      device=result.settings;revision=result.revision;canRestore=result.can_restore===true;
      if(preserve){
        const edited=rebaseDeviceEdits(getProfile(),baseline,device);
        baseline=withDevice(baseline,device,{preserveLive:['Static','Breathing','Off'].includes(baseline.lighting.effect)});onRead(device);onUndo(edited);
      }else {onRead(device);baseline=cloneDeviceProfile(getProfile());}
      ready=true;needsFreshRead=false;lastMessage='Mouse connected · Apply changes also saves your preset.';
    }catch(error){ready=false;revision=null;failure('Could not read settings. Your edits are kept. Retry read or reconnect the mouse.',error);}
    finally{busy=false;update();}
  }
  async function save() {
    if(busy||!ready||!available||!pending())return;
    let profile=cloneDeviceProfile(getProfile());
    let sentRGB=false,wrote=false;
    busy=true;status('Applying changes to your mouse…');
    try {
      // RGB is not readback-verifiable and can change the device revision.
      // Refresh the revision before a subsequent explicit Apply, never after RGB.
      if(needsFreshRead){
        const read=deviceResult('read',await api.readDevice());
        device=read.settings;revision=read.revision;canRestore=read.can_restore===true;
        profile=rebaseDeviceEdits(profile,baseline,device);
        needsFreshRead=false;
      }
      const plan=changesFor(profile,device,baseline);
      if(Object.keys(plan.changes).length){
        const result=deviceResult('apply',await api.applyDevice(deviceRequest('apply',{expected_revision:revision,changes:plan.changes})));
        device=result.settings;revision=result.revision;canRestore=result.can_restore===true;wrote=result.status==='written-readback';
      }
      // Configuration finalization may reload stored lighting. Send the live
      // color LAST, and never invent a brightness write for a color-only edit.
      if(plan.rgb){
        needsFreshRead=true;
        deviceResult('rgb',await api.applyRGB(deviceRequest('rgb',plan.rgb)));
        sentRGB=true;
      }
      if(!available)throw Error('Mouse disconnected while saving. Refresh before retrying.');
      onRead(device,{preserveLive:sentRGB});
      baseline=cloneDeviceProfile(getProfile());
      ready=true;
      try {onSaved();}
      catch(error){lastMessage=`Mouse operation finished, but the local preset could not be saved: ${error.message}`;return;}
      lastMessage=sentRGB?'Lighting sent · Check the physical lights. Preset saved automatically.':wrote?'Settings read back · Check the mouse response. Preset saved automatically.':'Preset saved automatically · Mouse already has these settings. Macro previews stay local.';
    }catch(error){
      ready=false;revision=null;
      failure(wrote?'Settings read back; the remaining changes failed. Edits kept. Retry read.':'Apply failed; mouse state is unconfirmed. Edits kept. Retry read before applying again.',error);
    }finally{busy=false;update();}
  }
  async function restore() {
    if(busy||!ready||!canRestore)return;
    busy=true;status('Restoring previous mouse settings…');
    try {
      if(needsFreshRead){
        const read=deviceResult('read',await api.readDevice());
        device=read.settings;revision=read.revision;needsFreshRead=false;
      }
      const result=deviceResult('restore',await api.restoreDevice(deviceRequest('restore',{expected_revision:revision})));
      device=result.settings;revision=result.revision;canRestore=result.can_restore===true;
      onRead(device);baseline=cloneDeviceProfile(getProfile());ready=true;hasError=false;lastMessage='Previous mouse settings restored and read back.';
    }catch(error){ready=false;revision=null;failure('Restore could not be confirmed. Edits kept. Retry read.',error);}
    finally{busy=false;update();}
  }
  $('device-retry').addEventListener('click',load);
  $('save').addEventListener('click',save);
  $('undo').addEventListener('click',()=>{if(!busy&&baseline){onUndo(cloneDeviceProfile(baseline));update();}});
  $('device-restore').addEventListener('click',restore);
  if(!api?.readDevice)lastMessage='Preview only · Open the desktop app to apply changes to a mouse.';
  update();
  return {
    refresh:update,hasPending:pending,get busy(){return busy;},
    setDevices(devices){
      available=Boolean(api?.readDevice)&&devices.filter(d=>d.bus===3&&d.vid===0x30fa&&d.pid===0x1440&&d.product==='FANTECH-X16v2'&&d.interface==='01'&&d.descriptor_sha256==='0ec3eb2dc293bd8edcb490f5cee9ab272ebec8f4e0edc5f9f365f1bab53b2018'&&!d.warnings?.length).length===1;
      if(!available){ready=false;revision=null;lastMessage=api?.readDevice?'Mouse unavailable · Connect it to Linux and refresh.':'Preview only · Open the desktop app to apply changes to a mouse.';update();return Promise.resolve();}
      return load();
    },
    profileChanged(){update();}
  };
}
