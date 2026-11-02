import test from 'node:test';
import assert from 'node:assert/strict';
import {capturedEffects,directionsForEffect,lightingPatch,fromPalette,toPalette,snapColor,lightingDefaults} from './captured-lighting.js';
import {defaultProfile,loadProfiles,validateProfile} from './model.js';
import {deviceRequest,deviceResult,buttonKeys} from './device-contract.js';
import {changesFor,withDevice} from './device-controls.js';

const revision='a'.repeat(64);
const settings=()=>({dpi:[400,800,1200,4800,7200,12800],enabled:Array(6).fill(true),stage:1,polling:1000,
  ...Object.fromEntries(buttonKeys.map((key,i)=>[key,defaultProfile().buttons[i]])),brightness_raw:4,
  lighting:{effect:'Cycle Breathing Effect',speed_raw:5,palette:Array.from({length:7},(_,i)=>[i,15-i,i]),enabled:Array(7).fill(true),responses:Array(7).fill('Cycle Breathing Effect'),direction:'Clockwise',symmetry:false}});

test('palette endpoints and all four-bit levels round-trip without changing saved device colors',()=>{
  assert.deepEqual(toPalette('#ff0000'),[0,15,15]);assert.deepEqual(toPalette('#000000'),[15,15,15]);
  for(let i=0;i<16;i++){const raw=[i,15-i,i];assert.deepEqual(toPalette(fromPalette(raw)),raw);}
  assert.equal(snapColor('#1280fc'),'#1188ff');
});
test('only captured effects and typed lighting fields may be applied',()=>{
  for(const effect of capturedEffects)assert.equal(deviceRequest('apply',{expected_revision:revision,changes:{lighting:{effect}}}).changes.lighting.effect,effect);
  for(const value of [{effect:'Comet Streak'},{speed_raw:6},{speed_raw:1.5},{palette:Array(7).fill([0,0,16])},{responses:Array(7).fill('shell')},{response_enabled:Array(6).fill(false)},{response_enabled:Array(7).fill(1)},{enabled:Array(7).fill(false)},{symmetry:1},{direction:'left'},{command:24}])
    assert.throws(()=>lightingPatch(value));
  const native=settings();assert.doesNotThrow(()=>deviceResult('read',{status:'read',revision,settings:native}));
  delete native.lighting.palette;assert.throws(()=>deviceResult('read',{status:'read',revision,settings:native}));
});
test('Mono Water exposes only captured directions and plans all controls through stored settings',()=>{
  assert.deepEqual(directionsForEffect('Mono Water Effect'),['Clockwise','Anti Clockwise','Two way']);
  assert(directionsForEffect('Flowing Water Effect').includes('Overwrite'));
  assert.throws(()=>lightingPatch({effect:'Mono Water Effect',direction:'Overwrite'}));
  const native=settings(),baseline=withDevice(defaultProfile(),native),p=structuredClone(baseline);
  Object.assign(p.lighting,{effect:'Mono Water Effect',speed:0,brightness:0,direction:'Two way',symmetry:true});
  p.lighting.palette[6]='#00ff00';p.lighting.slots[4]=false;
  const plan=changesFor(p,native,baseline);
  assert.equal(plan.rgb,null);assert.equal(plan.changes.brightness_raw,6);
  assert.equal(plan.changes.lighting.effect,'Mono Water Effect');assert.equal(plan.changes.lighting.speed_raw,0);
  assert.deepEqual(plan.changes.lighting.palette[6],[15,0,15]);assert.equal(plan.changes.lighting.enabled[4],false);
  assert.equal(plan.changes.lighting.direction,'Two way');assert.equal(plan.changes.lighting.symmetry,true);
  assert.doesNotThrow(()=>deviceRequest('apply',{expected_revision:revision,changes:plan.changes}));
});
test('old presets gain independent palette and response arrays without losing the old color',()=>{
  const profiles=Array.from({length:4},defaultProfile);
  for(const p of profiles)for(const key of Object.keys(lightingDefaults()))delete p.lighting[key];
  const migrated=loadProfiles(JSON.stringify({version:1,profiles}));assert(migrated.every(validateProfile));
  assert.equal(migrated[0].lighting.color,'#ef4444');migrated[0].lighting.palette[0]='#000000';
  assert.equal(migrated[1].lighting.palette[0],'#ff0000');
});
test('device reads populate stored mode, seven palettes and seven response controls',()=>{
  const native=settings();native.lighting.effect='Flicker';native.lighting.speed_raw=7;
  const p=withDevice(defaultProfile(),native);assert.equal(p.lighting.effect,'Flicker');assert.equal(p.lighting.speed,140);
  assert.equal(p.lighting.palette.length,7);assert.equal(p.lighting.responses.length,7);assert(validateProfile(p));
  assert.deepEqual(changesFor(p,native,structuredClone(p)),{changes:{},rgb:null});
  native.lighting.effect='Mono Water Effect';assert.equal(withDevice(p,native).lighting.effect,'Mono Water Effect');
});
test('response and ordinary action edits are planned together, without a live RGB overwrite',()=>{
  const native=settings(),baseline=withDevice(defaultProfile(),native),p=structuredClone(baseline);
  p.buttons[6]='Rapid Fire';p.lighting.responses[6]='Mono Water Effect';p.lighting.effect='Button Response';
  const plan=changesFor(p,native,baseline);assert.equal(plan.rgb,null);
  assert.equal(plan.changes.button7,'Rapid Fire');assert.equal(plan.changes.lighting.effect,'Button Response');
  assert.equal(plan.changes.lighting.responses[6],'Mono Water Effect');
});
test('stored palette-only edit does not change mode, speed or brightness and never sends RGB',()=>{
  const native=settings(),baseline=withDevice(defaultProfile(),native),p=structuredClone(baseline);
  p.lighting.palette[6]='#00ff00';const plan=changesFor(p,native,baseline);
  assert.deepEqual(Object.keys(plan.changes),['lighting']);assert.deepEqual(Object.keys(plan.changes.lighting),['palette']);
  assert.deepEqual(plan.changes.lighting.palette[6],[15,0,15]);assert.equal(plan.rgb,null);
});
test('returning from Off selects stored effect, while config changes during Off reassert Off last',()=>{
  const native=settings(),baseline=withDevice(defaultProfile(),native);baseline.lighting.effect='Off';
  const p=structuredClone(baseline);p.lighting.effect='Cycle Breathing Effect';
  assert.deepEqual(changesFor(p,native,baseline),{changes:{lighting:{effect:'Cycle Breathing Effect'}},rgb:null});
  p.lighting.effect='Off';p.polling=500;const plan=changesFor(p,native,baseline);
  assert.deepEqual(plan.changes,{polling:500});assert.equal(plan.rgb.effect,'Off');
});
