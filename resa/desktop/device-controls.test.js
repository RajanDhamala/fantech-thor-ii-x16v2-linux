import test from 'node:test';
import assert from 'node:assert/strict';
import {mountDeviceControls,changesFor,brightnessCode,brightnessPercent,withDevice} from './device-controls.js';
import {defaultProfile} from './model.js';
import {buttonKeys} from './device-contract.js';
const hash='0ec3eb2dc293bd8edcb490f5cee9ab272ebec8f4e0edc5f9f365f1bab53b2018';
const node={bus:3,vid:0x30fa,pid:0x1440,product:'FANTECH-X16v2',interface:'01',descriptor_sha256:hash};
function result(status='read',revision='a'.repeat(64)) {
 return {status,revision,can_restore:false,settings:{dpi:[4000,800,1200,4800,7200,12800],enabled:[true,false,true,true,true,true],stage:0,polling:1000,...Object.fromEntries(buttonKeys.map((key,index)=>[key,defaultProfile().buttons[index]])),brightness_raw:4}};
}
function setup(api) {
 const oldDocument=globalThis.document,oldWindow=globalThis.window,elements=new Map();
 const el=id=>{
  if(!elements.has(id))elements.set(id,{value:'',disabled:false,textContent:'',events:{},addEventListener(name,fn){this.events[name]=fn;}});
  return elements.get(id);
 };
 globalThis.document={getElementById:el,querySelectorAll:()=>[]};globalThis.window={resa:api};
 let profile=defaultProfile(),saves=0;
 const controls=mountDeviceControls({getProfile:()=>profile,onRead:(s,options)=>{profile=withDevice(profile,s,options);
 },onSaved:()=>{saves++;},onUndo:p=>{profile=p;}});
 return {el,controls,get profile(){return profile;},get saves(){return saves;},cleanup(){globalThis.document=oldDocument;globalThis.window=oldWindow;}};
}
test('connection loads actual settings; editing never writes; Save changes applies and then saves',async()=>{
 const calls=[];
 const ui=setup({readDevice:async()=>{calls.push('read');return result();},applyDevice:async request=>{
  calls.push(request);const r=result('written-readback','b'.repeat(64));r.settings.dpi[0]=800;return r;
 }});
 try {
  await ui.controls.setDevices([node]);assert.deepEqual(calls,['read']);assert.equal(ui.profile.dpi[0],4000);assert.equal(ui.el('save').disabled,true);
  ui.profile.dpi[0]=800;ui.controls.refresh();assert.equal(calls.length,1);assert.equal(ui.el('save').disabled,false);
  await ui.el('save').events.click();assert.equal(calls.length,2);assert.equal(calls[1].changes.dpi.values[0],800);
  assert.deepEqual(Object.keys(calls[1].changes),['dpi']);assert.equal(ui.saves,1);assert.equal(ui.el('save').disabled,true);assert.match(ui.el('save-status').textContent,/Settings read back/);
 }finally{ui.cleanup();}
});
test('duplicate Save clicks send once and local persistence waits for the device result',async()=>{
 let finish,calls=0;
 const ui=setup({readDevice:async()=>result(),applyDevice:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
 try {
  await ui.controls.setDevices([node]);ui.profile.polling=500;ui.controls.refresh();const pending=ui.el('save').events.click();await ui.el('save').events.click();
  assert.equal(calls,1);assert.equal(ui.saves,0);assert.equal(ui.el('settings-editor').disabled,true);
  const r=result('written-readback');r.settings.polling=500;finish(r);await pending;assert.equal(ui.saves,1);
 }finally{ui.cleanup();}
});
test('a failed Save keeps edits and never reports local-only success; Refresh preserves pending values',async()=>{
 const ui=setup({readDevice:async()=>result(),applyDevice:async()=>{throw Error('device write failed');}});
 try {
  await ui.controls.setDevices([node]);ui.profile.polling=500;ui.controls.refresh();await ui.el('save').events.click();
  assert.equal(ui.saves,0);assert.equal(ui.profile.polling,500);assert.match(ui.el('save-status').textContent,/Apply failed/);
  assert.equal(ui.el('settings-editor').disabled,false);assert.equal(ui.el('device-retry').hidden,false);
  assert.equal(ui.el('device-error').hidden,false);assert.match(ui.el('device-error-text').textContent,/device write failed/);
  assert.equal(ui.el('save').disabled,true);ui.profile.polling=250;ui.controls.refresh();
  await ui.el('device-retry').events.click();assert.equal(ui.profile.polling,250);assert.equal(ui.el('save').disabled,false);
  assert.equal(ui.el('device-retry').hidden,true);assert.equal(ui.el('device-error').hidden,true);
 }finally{ui.cleanup();}
});
test('color-only Apply sends RGB once, without configuration writes or a later read',async()=>{
 const calls=[];
 const ui=setup({readDevice:async()=>{calls.push('read');return result();},applyRGB:async request=>{calls.push(request);return {status:'sent-unverified',reports_sent:7,physical_effect_verified:false};},applyDevice:async()=>{throw Error('unexpected configuration write');}});
 try {
  await ui.controls.setDevices([node]);ui.profile.lighting.color='#00ff00';ui.controls.refresh();await ui.el('save').events.click();
  assert.equal(calls.length,2);assert.equal(calls[1].color,'#00ff00');assert.equal(ui.saves,1);assert.match(ui.el('save-status').textContent,/Check the physical lights/);
 }finally{ui.cleanup();}
});
test('mixed Apply verifies configuration before sending color, with no forced brightness write',async()=>{
 const calls=[];
 const ui=setup({readDevice:async()=>{calls.push('read');return result();},applyDevice:async request=>{calls.push(request);const r=result('written-readback');r.settings.dpi[0]=200;return r;},applyRGB:async request=>{calls.push(request);return {status:'sent-unverified',reports_sent:7,physical_effect_verified:false};}});
 try {
  await ui.controls.setDevices([node]);ui.profile.dpi[0]=200;ui.profile.lighting.color='#00ff00';ui.controls.refresh();await ui.el('save').events.click();
  assert.equal(calls.length,3);assert.deepEqual(Object.keys(calls[1].changes),['dpi']);assert.equal(calls[1].changes.dpi.values[0],200);assert.equal(calls[2].color,'#00ff00');assert.equal(ui.saves,1);
 }finally{ui.cleanup();}
});
test('a later Apply reads a fresh revision after RGB and rebases untouched fields',async()=>{
 const calls=[];let reads=0;
 const ui=setup({readDevice:async()=>{calls.push('read');reads++;const r=result('read',String(reads).repeat(64));if(reads>1)r.settings.dpi[0]=800;return r;},applyDevice:async request=>{calls.push(request);const r=result('written-readback');r.settings.dpi[0]=800;r.settings.polling=500;return r;},applyRGB:async()=>({status:'sent-unverified',reports_sent:7,physical_effect_verified:false})});
 try {
  await ui.controls.setDevices([node]);ui.profile.lighting.color='#00ff00';ui.controls.refresh();await ui.el('save').events.click();
  ui.profile.polling=500;ui.controls.refresh();await ui.el('save').events.click();
  assert.deepEqual(calls.slice(0,2),['read','read']);assert.deepEqual(calls[2].changes,{polling:500});assert.equal(calls[2].expected_revision,'2'.repeat(64));
 }finally{ui.cleanup();}
});
test('a configuration failure never sends RGB or saves locally',async()=>{
 let rgb=0;const ui=setup({readDevice:async()=>result(),applyDevice:async()=>{throw Error('commit failed');},applyRGB:async()=>{rgb++;}});
 try{await ui.controls.setDevices([node]);ui.profile.polling=500;ui.profile.lighting.color='#00ff00';ui.controls.refresh();await ui.el('save').events.click();assert.equal(rgb,0);assert.equal(ui.saves,0);assert.equal(ui.el('settings-editor').disabled,false);}
 finally{ui.cleanup();}
});
test('partial success is explicit when RGB fails after configuration readback',async()=>{
 const ui=setup({readDevice:async()=>result(),applyDevice:async()=>{const r=result('written-readback');r.settings.polling=500;return r;},applyRGB:async()=>{throw Error('partial lighting transfer');}});
 try{await ui.controls.setDevices([node]);ui.profile.polling=500;ui.profile.lighting.color='#00ff00';ui.controls.refresh();await ui.el('save').events.click();assert.equal(ui.saves,0);assert.match(ui.el('save-status').textContent,/remaining changes failed/);assert.equal(ui.profile.lighting.color,'#00ff00');assert.equal(ui.el('settings-editor').disabled,false);}
 finally{ui.cleanup();}
});
test('Off is sent without a later brightness write that could switch lights back on',async()=>{
 const calls=[];
 const ui=setup({readDevice:async()=>result(),applyRGB:async r=>{calls.push(r);return {status:'sent-unverified',reports_sent:7,physical_effect_verified:false};},applyDevice:async r=>{calls.push(r);return result('written-readback');}});
 try {
  await ui.controls.setDevices([node]);ui.profile.lighting.effect='Off';ui.controls.refresh();await ui.el('save').events.click();
  assert.equal(calls.length,1);assert.equal(calls[0].effect,'Off');assert.equal(ui.profile.lighting.effect,'Off');assert.equal(ui.saves,1);
 }finally{ui.cleanup();}
});
test('brightness level mapping follows recorded inverse codes and leaves unrelated settings alone',()=>{
 assert.equal(brightnessCode(100),0);assert.equal(brightnessCode(0),6);assert.equal(brightnessCode(brightnessPercent(4)),4);
 const p=defaultProfile(),native=result().settings;p.dpi=[...native.dpi];p.enabled=[...native.enabled];p.stage=native.stage;p.buttons[3]=native.button4;p.buttons[4]=native.button5;p.lighting.brightness=brightnessPercent(native.brightness_raw);
 const baseline=structuredClone(p);p.lighting.brightness=100;
 assert.deepEqual(changesFor(p,native,baseline),{changes:{brightness_raw:0},rgb:null});
});
test('Off clears reactions before live Off; On restores each flag after refreshing the revision',async()=>{
 const calls=[],flags=[true,false,true,false,true,true,false];
 const native=result();
 native.settings.lighting={effect:'Button Response',speed_raw:2,palette:Array.from({length:7},()=>[0,15,15]),enabled:Array(7).fill(true),responses:Array(7).fill('Mono Water Effect'),response_enabled:[...flags],direction:'Clockwise',symmetry:false};
 const ui=setup({readDevice:async()=>structuredClone(native),applyDevice:async request=>{
  calls.push(request);Object.assign(native.settings.lighting,request.changes.lighting);
  native.revision='b'.repeat(64);return {...structuredClone(native),status:'written-readback'};
 },applyRGB:async request=>{calls.push(request);return {status:'sent-unverified',reports_sent:7,physical_effect_verified:false};}});
 try {
  await ui.controls.setDevices([node]);const buttons=[...ui.profile.buttons],responses=[...ui.profile.lighting.responses];
  ui.profile.lighting.effect='Off';ui.controls.refresh();await ui.el('save').events.click();
  assert.deepEqual(calls[0].changes,{lighting:{effect:'Light On',response_enabled:Array(7).fill(false)}});
  assert.equal(calls[1].effect,'Off');assert.equal(ui.profile.lighting.effect,'Off');
  assert.deepEqual(ui.profile.lighting.responseEnabled,flags);assert.deepEqual(ui.profile.buttons,buttons);assert.deepEqual(ui.profile.lighting.responses,responses);
  // Reapplying a config edit while Off must never restore click reactions.
  ui.profile.lighting.palette[0]='#00ff00';ui.controls.refresh();await ui.el('save').events.click();
  assert.equal(calls[2].changes.lighting.response_enabled,undefined);assert.equal(calls[3].effect,'Off');
  ui.profile.lighting.effect='Button Response';ui.controls.refresh();await ui.el('save').events.click();
  assert.deepEqual(calls[4].changes,{lighting:{effect:'Button Response',response_enabled:flags}});
  assert.deepEqual(ui.profile.lighting.responseEnabled,flags);assert.equal(ui.saves,3);
 }finally{ui.cleanup();}
});
test('an existing Off preset still allows Apply when the mouse has active click reactions',async()=>{
 const native=result();
 native.settings.lighting={effect:'Light On',speed_raw:2,palette:Array.from({length:7},()=>[0,15,15]),enabled:Array(7).fill(true),responses:Array(7).fill('Cycle Breathing Effect'),response_enabled:Array(7).fill(true),direction:'Clockwise',symmetry:false};
 let request;
 const ui=setup({readDevice:async()=>structuredClone(native),applyDevice:async r=>{
  request=r;native.settings.lighting.response_enabled=Array(7).fill(false);
  return {...structuredClone(native),status:'written-readback'};
 },applyRGB:async()=>({status:'sent-unverified',reports_sent:7,physical_effect_verified:false})});
 try {
  ui.profile.lighting.effect='Off';await ui.controls.setDevices([node]);
  assert.equal(ui.el('save').disabled,false);await ui.el('save').events.click();
  assert.deepEqual(request.changes,{lighting:{response_enabled:Array(7).fill(false)}});
  assert.equal(ui.el('save').disabled,true);
 }finally{ui.cleanup();}
});
test('disconnect and browser preview cannot save device settings',async()=>{
 const ui=setup({readDevice:async()=>result()});
 try {await ui.controls.setDevices([node]);ui.profile.polling=500;ui.controls.refresh();await ui.controls.setDevices([]);assert.equal(ui.el('save').disabled,true);}
 finally{ui.cleanup();}
 const preview=setup(undefined);
 try{await preview.controls.setDevices([node]);assert.equal(preview.el('save').disabled,true);assert.equal(preview.el('settings-editor').disabled,false);assert.match(preview.el('save-status').textContent,/Preview only/);}
 finally{preview.cleanup();}
});
test('Undo returns to the last loaded mouse settings without writing',async()=>{
 let writes=0;const ui=setup({readDevice:async()=>result(),applyDevice:async()=>{writes++;return result('written-readback');}});
 try{await ui.controls.setDevices([node]);ui.profile.polling=250;ui.controls.refresh();ui.el('undo').events.click();assert.equal(ui.profile.polling,1000);assert.equal(writes,0);assert.equal(ui.el('save').disabled,true);}
 finally{ui.cleanup();}
});

test('button5 Rapid Fire loads, saves, and preserves button4',async()=>{
 const calls=[];
 const ui=setup({readDevice:async()=>{const r=result();r.settings.button5='Rapid Fire';return r;},applyDevice:async request=>{calls.push(request);const r=result('written-readback');r.settings.button5=request.changes.button5;return r;}});
 try{
  await ui.controls.setDevices([node]);assert.equal(ui.profile.buttons[4],'Rapid Fire');assert.equal(ui.el('save').disabled,true);
  ui.profile.buttons[4]='Forward';ui.controls.refresh();assert.equal(calls.length,0);
  await ui.el('save').events.click();assert.deepEqual(calls[0].changes,{button5:'Forward'});assert.equal(ui.profile.buttons[3],'Forward');assert.equal(ui.saves,1);
 }finally{ui.cleanup();}
});

test('retry keeps edited button5 while adopting fresh untouched button4',async()=>{
 let reads=0;const calls=[];
 const ui=setup({readDevice:async()=>{const r=result();if(++reads>1)r.settings.button4='Back';return r;},applyDevice:async request=>{calls.push(request);if(calls.length===1)throw Error('readback failed');const r=result('written-readback');r.settings.button4='Back';r.settings.button5='Rapid Fire';return r;}});
 try{
  await ui.controls.setDevices([node]);ui.profile.buttons[4]='Rapid Fire';ui.controls.refresh();await ui.el('save').events.click();
  await ui.el('device-retry').events.click();assert.equal(ui.profile.buttons[3],'Back');assert.equal(ui.profile.buttons[4],'Rapid Fire');
  await ui.el('save').events.click();assert.deepEqual(calls[1].changes,{button5:'Rapid Fire'});assert.equal(ui.saves,1);
 }finally{ui.cleanup();}
});

test('all button reads and mixed edits reach their own numbered fields',async()=>{
 const calls=[];
 const assignments=['Forward','Middle click','Left click','DPI up','DPI down','Rapid Fire','DPI Loop'];
 const ui=setup({readDevice:async()=>result(),applyDevice:async request=>{
  calls.push(request);const r=result('written-readback');buttonKeys.forEach((key,index)=>{r.settings[key]=assignments[index];});return r;
 }});
 try{
  await ui.controls.setDevices([node]);assert.deepEqual(ui.profile.buttons,defaultProfile().buttons);
  ui.profile.buttons=[...assignments];ui.controls.refresh();assert.equal(calls.length,0);
  await ui.el('save').events.click();
  assert.deepEqual(calls[0].changes,Object.fromEntries(buttonKeys.map((key,index)=>[key,assignments[index]])));
  assert.deepEqual(ui.profile.buttons,assignments);assert.equal(ui.saves,1);
 }finally{ui.cleanup();}
});

test('a preset without Left click never reaches a hardware operation',async()=>{
 let writes=0;const ui=setup({readDevice:async()=>result(),applyDevice:async()=>{writes++;return result('written-readback');}});
 try{
  await ui.controls.setDevices([node]);ui.profile.buttons[0]='Forward';ui.controls.refresh();await ui.el('save').events.click();
  assert.equal(writes,0);assert.equal(ui.saves,0);assert.match(ui.el('device-error-text').textContent,/at least one/);
 }finally{ui.cleanup();}
});

test('refresh keeps an edited primary button while rebasing other buttons',async()=>{
 let reads=0;const calls=[];
 const ui=setup({readDevice:async()=>{const r=result();if(++reads>1)r.settings.button7='Rapid Fire';return r;},applyDevice:async request=>{calls.push(request);if(calls.length===1)throw Error('readback failed');const r=result('written-readback');r.settings.button2='Middle click';r.settings.button7='Rapid Fire';return r;}});
 try{
  await ui.controls.setDevices([node]);ui.profile.buttons[1]='Middle click';ui.controls.refresh();await ui.el('save').events.click();
  await ui.el('device-retry').events.click();assert.equal(ui.profile.buttons[1],'Middle click');assert.equal(ui.profile.buttons[6],'Rapid Fire');
  await ui.el('save').events.click();assert.deepEqual(calls[1].changes,{button2:'Middle click'});assert.equal(ui.saves,1);
 }finally{ui.cleanup();}
});
