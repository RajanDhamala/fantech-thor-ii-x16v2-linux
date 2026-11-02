// Main-process Linux desktop settings. No HID access, shell or caller paths.
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import {homedir} from 'node:os';
import path from 'node:path';
import * as disk from 'node:fs/promises';
import {constants} from 'node:fs';
const execute=promisify(execFile);
const runDefault=async(exe,args)=>(await execute(exe,args,{timeout:3000,maxBuffer:4096,encoding:'utf8'})).stdout.trim();
export const pointerGain=level=>(level-6)/5;
export const wheelConfig=n=>`# Resa wheel settings v1\n".*"\nNone, Up, Button4, ${n}\nNone, Down, Button5, ${n}\n`+
  ['Control_L','Shift_L','Alt_L','Super_L'].map(key=>`${key}, Up, ${key}|Button4, 1\n${key}, Down, ${key}|Button5, 1\n`).join('');
export function sessionRequest(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join()!=='changes,expected_revision'||!/^[a-f0-9]{64}$/.test(value.expected_revision))throw Error('Reload desktop settings before applying.');
  const c=value.changes;
  if(!c||typeof c!=='object'||Array.isArray(c)||!Object.keys(c).length||Object.keys(c).some(k=>!['pointer_level','wheel_multiplier','wheel_enabled'].includes(k)))throw Error('Invalid desktop settings.');
  for(const key of ['pointer_level','wheel_multiplier'])if(key in c&&(!Number.isInteger(c[key])||c[key]<1||c[key]>11))throw Error('Choose a level from 1 to 11.');
  if(('wheel_enabled'in c)!==('wheel_multiplier'in c)||'wheel_enabled'in c&&typeof c.wheel_enabled!=='boolean')throw Error('Invalid wheel settings.');
  return structuredClone(value);
}
export function createSessionSettings({fs=disk,run=runDefault,launch=spawn,home=homedir(),env=process.env,uid=process.getuid?.(),settleMs=180}={}){
  const schema=/cinnamon/i.test(env.XDG_CURRENT_DESKTOP||'')?'org.cinnamon.desktop.peripherals.mouse':/gnome|unity/i.test(env.XDG_CURRENT_DESKTOP||'')?'org.gnome.desktop.peripherals.mouse':null;
  const configPath=path.join(home,'.imwheelrc');let child=null,busy=false,lastError='';
  const running=()=>Boolean(child&&child.exitCode===null&&!child.killed);
  async function config(){
    let file;
    try{
      file=await fs.open(configPath,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
      const stat=await file.stat();if(!stat.isFile()||stat.uid!==uid||stat.size>4096||stat.mode&0o022)throw Error('Existing imwheel configuration is not managed by Resa.');
      const text=await file.readFile('utf8');
      for(let n=1;n<=11;n++)if(text===wheelConfig(n))return {text,multiplier:n};
      throw Error('Existing ~/.imwheelrc is not managed by Resa; it will be kept.');
    }catch(error){if(error.code==='ENOENT')return {text:null,multiplier:1};throw error;}
    finally{await file?.close();}
  }
  async function writeConfig(text,expected){
    if(text===null){const previous=await config();if(previous.text!==expected)throw Error('Wheel configuration changed.');await fs.unlink(configPath);return;}
    const temporary=path.join(home,`.resa-imwheel-${randomUUID()}`);let file;
    try{
      const previous=await config();if(previous.text!==expected)throw Error('Wheel configuration changed.');
      file=await fs.open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      await file.writeFile(text,'utf8');await file.sync();await file.close();file=null;
      if(expected===null)await fs.link(temporary,configPath); // Never replace an existing user file.
      else{if((await config()).text!==expected)throw Error('Wheel configuration changed.');await fs.rename(temporary,configPath);}
    }finally{await file?.close();await fs.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  }
  async function read(){
    let gain=null,pointer=false,pointerNote='Pointer speed is supported on Cinnamon and GNOME desktops.';
    if(schema)try{
      gain=Number(await run('/usr/bin/gsettings',['get',schema,'speed']));
      if(!Number.isFinite(gain)||gain< -1||gain>1)throw Error('Invalid desktop pointer setting.');
      pointer=(await run('/usr/bin/gsettings',['writable',schema,'speed']))==='true';pointerNote=pointer?'Applies to mice in this Linux desktop session.':'Desktop pointer speed is locked.';
    }catch(error){pointerNote='Could not read desktop pointer speed.';gain=null;}
    let wheel=false,wheelNote='',cfg={text:null,multiplier:1};
    try{
      cfg=await config();
      if(env.XDG_SESSION_TYPE!=='x11'||!env.DISPLAY)throw Error('Wheel multiplier requires an X11 desktop session.');
      try{await fs.access('/usr/bin/imwheel',constants.X_OK);}catch{throw Error('Install the optional imwheel package, then reload desktop settings.');}
      let pids='';try{pids=await run('/usr/bin/pgrep',['-u',String(uid),'-x','imwheel']);}catch(error){if(error.code!==1)throw Error('Could not check for another wheel helper.');}
      if(pids.split(/\s+/).filter(Boolean).some(pid=>Number(pid)!==child?.pid))throw Error('Another imwheel process is running; Resa will not replace it.');
      wheel=true;wheelNote='Affects X11 wheel events while Resa stays open; modifier scrolling stays at 1×.';
    }catch(error){wheelNote=error.message;}
    const state={pointer_gain:gain,pointer_level:gain===null?6:Math.max(1,Math.min(11,Math.round(gain*5+6))),wheel_multiplier:cfg.multiplier,wheel_enabled:running()};
    const capabilities={pointer,wheel,pointer_note:pointerNote,wheel_note:wheelNote};
    const revision=createHash('sha256').update(JSON.stringify({schema,state,capabilities,config:cfg.text})).digest('hex');
    return {status:'read',revision,settings:state,capabilities,last_error:lastError};
  }
  async function stop(){
    const owned=child;if(!owned)return;
    if(owned.exitCode!==null){if(child===owned)child=null;return;}
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Wheel helper did not stop; no replacement was started.')),1500);
      owned.once('exit',()=>{clearTimeout(timer);resolve();});owned.kill('SIGTERM');
    });if(child===owned)child=null;
  }
  async function start(){
    const owned=launch('/usr/bin/imwheel',['-d','-b','45'],{stdio:['ignore','ignore','pipe'],windowsHide:true});child=owned;lastError='';
    owned.stderr?.on('data',data=>{lastError=(lastError+String(data)).slice(0,400);});
    owned.on('exit',()=>{if(child===owned)child=null;});
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{if(owned.exitCode!==null)reject(Error('Wheel helper exited before it was ready.'));else resolve();},settleMs);
      owned.once('error',error=>{clearTimeout(timer);if(child===owned)child=null;reject(error);});
      owned.once('exit',()=>{clearTimeout(timer);reject(Error('Wheel helper could not start. '+lastError));});
    });
  }
  async function apply(value){
    sessionRequest(value);if(uid===0)throw Error('Run Resa as your normal desktop user.');if(busy)throw Error('A desktop setting update is in progress.');busy=true;
    let before,oldConfig,pointerWritten=false,configWritten=false,wasRunning=false;
    const c=value.changes;
    try{
      before=await read();if(before.revision!==value.expected_revision)throw Error('Desktop settings changed. Reload before applying.');
      if('pointer_level'in c&&!before.capabilities.pointer)throw Error(before.capabilities.pointer_note);
      if('wheel_enabled'in c&&!before.capabilities.wheel)throw Error(before.capabilities.wheel_note);
      if('wheel_enabled'in c){oldConfig=await config();wasRunning=running();}
      if('pointer_level'in c){pointerWritten=true;await run('/usr/bin/gsettings',['set',schema,'speed',String(pointerGain(c.pointer_level))]);}
      if('wheel_enabled'in c){
        await stop();
        if(c.wheel_enabled){await writeConfig(wheelConfig(c.wheel_multiplier),oldConfig.text);configWritten=true;await start();}
      }
      const after=await read();
      if(pointerWritten&&Math.abs(after.settings.pointer_gain-pointerGain(c.pointer_level))>1e-8)throw Error('Desktop pointer readback did not match.');
      return {...after,status:'applied'};
    }catch(error){
      const recovery=[];
      if(oldConfig)try{
        await stop();if(configWritten)await writeConfig(oldConfig.text,wheelConfig(c.wheel_multiplier));if(wasRunning)await start();
      }catch(e){recovery.push(e.message);}
      if(pointerWritten)try{
        await run('/usr/bin/gsettings',['set',schema,'speed',String(before.settings.pointer_gain)]);
        const restored=Number(await run('/usr/bin/gsettings',['get',schema,'speed']));
        if(Math.abs(restored-before.settings.pointer_gain)>1e-8)throw Error('Pointer restoration did not match readback.');
      }catch(e){recovery.push(e.message);}
      throw Error(error.message+(recovery.length?' Recovery could not be confirmed: '+recovery.join('; '):pointerWritten||configWritten?' Previous settings were restored.':''));
    }finally{busy=false;}
  }
  return {read,apply,close(){child?.kill('SIGTERM');child=null;}};
}
