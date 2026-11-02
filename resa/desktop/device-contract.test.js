import test from 'node:test';
import assert from 'node:assert/strict';
import { buttonKeys,buttonActions,deviceRequest,deviceResult } from './device-contract.js';
import { defaultProfile, loadProfiles } from './model.js';
const expected_revision='a'.repeat(64);
test('all seven buttons accept only the ten recovered actions',()=>{
  for(const polling of [125,250,500,1000])assert.equal(deviceRequest('apply',{expected_revision,changes:{polling}}).changes.polling,polling);
  assert.equal(buttonKeys.length,7);assert.equal(buttonActions.length,10);
  for(const key of buttonKeys)for(const action of buttonActions)assert.equal(deviceRequest('apply',{expected_revision,changes:{[key]:action}}).changes[key],action);
  for(const changes of [{polling:2000},{polling:true},{button4:'Disabled'},{button5:'shell'},{button8:'Rapid Fire'},{button0:'Left click'},{brightness_raw:7},{address:30}])assert.throws(()=>deviceRequest('apply',{expected_revision,changes}));
  assert.throws(()=>deviceRequest('apply',{expected_revision:'stale',changes:{polling:500}}));
});
test('DPI validation rejects a disabled selected stage and malformed fields',()=>{
  const p=defaultProfile(),dpi={values:p.dpi,enabled:p.enabled,stage:p.stage};
  assert.doesNotThrow(()=>deviceRequest('apply',{expected_revision,changes:{dpi}}));
  assert.throws(()=>deviceRequest('apply',{expected_revision,changes:{dpi:{...dpi,stage:6}}}));
  assert.throws(()=>deviceRequest('apply',{expected_revision,changes:{dpi:{...dpi,enabled:[false,false,false,false,false,false]}}}));
});
test('old local profiles migrate polling and readback is checked',()=>{
  const profiles=Array.from({length:4},()=>{const p=defaultProfile();delete p.polling;return p;});
  assert.equal(loadProfiles(JSON.stringify({version:1,profiles}))[0].polling,1000);
  const p=defaultProfile(),r={status:'read',revision:expected_revision,settings:{dpi:p.dpi,enabled:p.enabled,stage:p.stage,polling:1000,...Object.fromEntries(buttonKeys.map((key,index)=>[key,p.buttons[index]])),button5:'Rapid Fire',brightness_raw:4}};
  assert.equal(deviceResult('read',r),r);
  assert.throws(()=>deviceResult('read',{...r,settings:{...r.settings,polling:2000}}));
  assert.throws(()=>deviceResult('read',{...r,settings:{...r.settings,button5:undefined}}));
  assert.throws(()=>deviceResult('read',{...r,settings:{...r.settings,button5:'shell'}}));
  for(const key of buttonKeys)assert.throws(()=>deviceResult('read',{...r,settings:{...r.settings,[key]:undefined}}));
  profiles[0].buttons[3]='Rapid Fire';profiles[0].buttons[4]='Rapid Fire';
  assert.equal(loadProfiles(JSON.stringify({version:1,profiles}))[0].buttons[4],'Rapid Fire');
});
test('RGB requests cannot choose extra effects, raw commands, or packet counts',()=>{
  assert.equal(deviceRequest('rgb',{effect:'Off',color:'#abcdef',speed:0}).effect,'Off');
  assert.throws(()=>deviceRequest('rgb',{effect:'Off',color:'#abcdef',speed:0,command:24}));
  assert.throws(()=>deviceResult('rgb',{status:'sent-unverified',reports_sent:1,physical_effect_verified:false}));
});

test('DPI endpoint requests preserve exact minimum and maximum, rejecting in-between guesses',()=>{
  for(const value of [200,12800]){
    const p=defaultProfile();p.dpi[0]=value;
    const request=deviceRequest('apply',{expected_revision,changes:{dpi:{values:p.dpi,enabled:p.enabled,stage:0}}});
    assert.equal(request.changes.dpi.values[0],value);
  }
  for(const value of [201,300,12799,13000]){
    const p=defaultProfile();p.dpi[0]=value;
    assert.throws(()=>deviceRequest('apply',{expected_revision,changes:{dpi:{values:p.dpi,enabled:p.enabled,stage:0}}}));
  }
});
