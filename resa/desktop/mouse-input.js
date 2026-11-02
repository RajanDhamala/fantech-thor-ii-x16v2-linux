// Standard app-window events only. These describe delivered actions, not raw HID
// buttons or a particular physical device (remapping can change the action).
export const mouseInputButtons = [
  { button:0, index:0, label:'Left click' },
  { button:2, index:1, label:'Right click' },
  { button:1, index:2, label:'Middle click' },
  { button:4, index:3, label:'Forward' },
  { button:3, index:4, label:'Back' },
];

export function createMouseInputMonitor({ target, onChange, isIgnored=()=>false, focused=true, pulseMs=180 }) {
  let enabled=false,hasFocus=focused,lastEvent='Ready — click or scroll inside this window.';
  let counts=Array(5).fill(0),wheelUp=0,wheelDown=0,wheelDirection=0;
  const held=new Set(),flashes=new Map(),listeners=[];
  let wheelTimer;
  const snapshot=()=>({
    enabled,focused:hasFocus,lastEvent,counts:[...counts],wheelUp,wheelDown,wheelDirection,
    pressed:[...held],activeButtons:[...new Set([...held,...flashes.keys()])],
    total:counts.reduce((sum,n)=>sum+n,0),
  });
  const emit=()=>onChange(snapshot());
  const accepts=event=>enabled && hasFocus && !isIgnored(event);
  function clearHeld() {
    held.clear();flashes.forEach(clearTimeout);flashes.clear();
    clearTimeout(wheelTimer);wheelDirection=0;
  }
  function listen(name,callback,options={capture:true}) {
    target.addEventListener(name,callback,options);
    listeners.push(()=>target.removeEventListener(name,callback,options));
  }
  listen('mousedown',event=>{
    if(!accepts(event)) return;
    const item=mouseInputButtons.find(item=>item.button===event.button);
    if(!item) return;
    event.preventDefault();
    if(!held.has(item.index)) counts[item.index]++;
    held.add(item.index);
    clearTimeout(flashes.get(item.index));flashes.delete(item.index);
    lastEvent=`${item.label} · pressed`;emit();
  });
  listen('mouseup',event=>{
    const item=mouseInputButtons.find(item=>item.button===event.button);
    // Release an accepted press even if the pointer has moved over a control.
    if(!enabled || !item || !held.has(item.index)) return;
    event.preventDefault();held.delete(item.index);
    flashes.set(item.index,setTimeout(()=>{flashes.delete(item.index);emit();},pulseMs));
    lastEvent=`${item.label} · released`;emit();
  });
  listen('wheel',event=>{
    if(!accepts(event) || !Number.isFinite(event.deltaY) || event.deltaY===0) return;
    event.preventDefault();
    wheelDirection=event.deltaY<0 ? -1 : 1;
    if(wheelDirection<0) wheelUp++;else wheelDown++;
    lastEvent=`Wheel ${wheelDirection<0?'up':'down'} · scroll event`;
    clearTimeout(wheelTimer);
    wheelTimer=setTimeout(()=>{wheelDirection=0;emit();},pulseMs);emit();
  },{capture:true,passive:false});
  for(const name of ['contextmenu','auxclick']) listen(name,event=>{
    if(accepts(event) || (name==='auxclick' && enabled && hasFocus && [3,4].includes(event.button))) event.preventDefault();
  });
  listen('blur',event=>{
    if(event.target!==target) return;
    hasFocus=false;clearHeld();
    if(enabled) {lastEvent='Paused — focus this window to continue.';emit();}
  });
  listen('focus',event=>{
    if(event.target!==target) return;
    hasFocus=true;
    if(enabled) {lastEvent='Listening — click or scroll inside this window.';emit();}
  });
  listen('mouseout',event=>{
    if(enabled && event.relatedTarget===null && held.size) {
      clearHeld();lastEvent='Pointer left the window — held highlights cleared.';emit();
    }
  });
  return {
    snapshot,
    setEnabled(value) {
      enabled=value;clearHeld();
      lastEvent=value ? (hasFocus?'Listening — click or scroll inside this window.':'Paused — focus this window to continue.') : 'Test complete. Results stay here until cleared.';
      emit();
    },
    clear() {clearHeld();counts=Array(5).fill(0);wheelUp=0;wheelDown=0;lastEvent='Results cleared.';emit();},
    destroy() {enabled=false;clearHeld();listeners.forEach(remove=>remove());},
  };
}
