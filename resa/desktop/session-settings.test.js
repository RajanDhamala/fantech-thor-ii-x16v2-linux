import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {createSessionSettings,pointerGain,wheelConfig,sessionRequest} from './session-settings.js';
import {defaultProfile,loadProfiles} from './model.js';
import {deviceRequest} from './device-contract.js';
import {changesFor,withDevice} from './device-controls.js';

async function fixture({installed=true,external=false,failStart=false}={}){
  const home=await fs.mkdtemp(path.join(tmpdir(),'resa-session-test-'));let gain=-0.4;const calls=[],children=[];
  const service=createSessionSettings({home,env:{XDG_CURRENT_DESKTOP:'X-Cinnamon',XDG_SESSION_TYPE:'x11',DISPLAY:':test'},settleMs:1,
    fs:{...fs,access:async p=>{if(p==='/usr/bin/imwheel'){if(!installed)throw Object.assign(Error('missing'),{code:'ENOENT'});return;}return fs.access(p);}},
    run:async(exe,args)=>{calls.push([exe,...args]);if(exe==='/usr/bin/pgrep'){if(external)return '99999';throw Object.assign(Error('none'),{code:1});}if(args[0]==='get')return String(gain);if(args[0]==='writable')return 'true';if(args[0]==='set'){gain=Number(args[3]);return '';}throw Error('Unexpected command');},
    launch:(exe,args)=>{calls.push([exe,...args]);const c=new EventEmitter();Object.assign(c,{pid:1000+children.length,exitCode:null,killed:false,stderr:new EventEmitter(),kill(){c.killed=true;c.exitCode=0;queueMicrotask(()=>c.emit('exit',0));}});children.push(c);if(failStart)queueMicrotask(()=>{c.exitCode=1;c.emit('exit',1);});return c;}});
  return {home,calls,children,service,get gain(){return gain;},async cleanup(){service.close();await fs.rm(home,{recursive:true,force:true});}};
}
test('desktop levels are bounded and double-click requests use the verified millisecond word',()=>{
  assert.equal(pointerGain(1),-1);assert.equal(pointerGain(6),0);assert.equal(pointerGain(11),1);
  for(const value of [8,50,150,255,256,300])assert.equal(deviceRequest('apply',{expected_revision:'a'.repeat(64),changes:{double_click_ms:value}}).changes.double_click_ms,value);
  for(const value of [7,301,1.2,true])assert.throws(()=>deviceRequest('apply',{expected_revision:'a'.repeat(64),changes:{double_click_ms:value}}));
  for(const changes of [{pointer_level:0},{wheel_multiplier:12,wheel_enabled:true},{command:'shell'},{wheel_enabled:true}])assert.throws(()=>sessionRequest({expected_revision:'a'.repeat(64),changes}));
  const profiles=Array.from({length:4},defaultProfile);for(const p of profiles)delete p.doubleClickMs;
  assert.equal(loadProfiles(JSON.stringify({version:1,profiles}))[0].doubleClickMs,undefined);
});
test('desktop reads and slider planning do not write; pointer Apply uses fixed gsettings and rejects stale state',async()=>{
  const f=await fixture();try{
    const read=await f.service.read();assert.equal(read.settings.pointer_level,4);assert(read.capabilities.pointer);
    assert(!f.calls.some(c=>c[1]==='set'));assert.equal(f.children.length,0);
    await assert.rejects(f.service.apply({expected_revision:'a'.repeat(64),changes:{pointer_level:11}}),/changed/);
    const after=await f.service.apply({expected_revision:read.revision,changes:{pointer_level:11}});assert.equal(f.gain,1);assert.equal(after.settings.pointer_level,11);assert.equal(f.children.length,0);
  }finally{await f.cleanup();}
});
test('wheel helper is explicit, grabs only wheel buttons and stops without killing other processes',async()=>{
  const f=await fixture();try{
    const read=await f.service.read();assert(read.capabilities.wheel);assert.equal(f.children.length,0);
    const after=await f.service.apply({expected_revision:read.revision,changes:{wheel_enabled:true,wheel_multiplier:6}});
    assert.deepEqual(f.calls.find(c=>c[0]==='/usr/bin/imwheel'),['/usr/bin/imwheel','-d','-b','45']);
    assert.equal(await fs.readFile(path.join(f.home,'.imwheelrc'),'utf8'),wheelConfig(6));assert(after.settings.wheel_enabled);
    await f.service.apply({expected_revision:after.revision,changes:{wheel_enabled:false,wheel_multiplier:6}});assert(f.children[0].killed);
  }finally{await f.cleanup();}
});
test('custom configs, missing imwheel and another helper are left alone',async()=>{
  for(const options of [{installed:false},{external:true},{}]){
    const f=await fixture(options);try{
      if(!Object.keys(options).length)await fs.writeFile(path.join(f.home,'.imwheelrc'),'user config');
      const read=await f.service.read();assert(!read.capabilities.wheel);assert(read.capabilities.pointer);
      await assert.rejects(f.service.apply({expected_revision:read.revision,changes:{wheel_enabled:true,wheel_multiplier:3}}));assert.equal(f.children.length,0);
      if(!Object.keys(options).length)assert.equal(await fs.readFile(path.join(f.home,'.imwheelrc'),'utf8'),'user config');
    }finally{await f.cleanup();}
  }
});
test('failed wheel startup restores pointer gain and removes only the newly created Resa config',async()=>{
  const f=await fixture({failStart:true});try{
    const read=await f.service.read();await assert.rejects(f.service.apply({expected_revision:read.revision,changes:{pointer_level:11,wheel_enabled:true,wheel_multiplier:5}}),/restored/);
    assert.equal(f.gain,-0.4);await assert.rejects(fs.stat(path.join(f.home,'.imwheelrc')),e=>e.code==='ENOENT');
  }finally{await f.cleanup();}
});
