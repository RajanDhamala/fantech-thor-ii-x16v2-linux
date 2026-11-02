// Renderer-only desktop sliders. Editing never writes; Apply is explicit.
export function mountSessionControls(){
  const el=id=>document.getElementById(id),api=window.resa;let current=null,busy=false;
  const values=()=>({pointer_level:Number(el('pointer-speed').value),wheel_multiplier:Number(el('wheel-speed').value),wheel_enabled:el('wheel-helper-enabled').checked});
  function update(){
    const draft=values();el('pointer-speed-value').textContent=`${draft.pointer_level} / 11`;el('wheel-speed-value').textContent=`${draft.wheel_multiplier}×`;
    el('pointer-speed').disabled=busy||!current?.capabilities.pointer;
    el('wheel-helper-enabled').disabled=busy||!current?.capabilities.wheel;
    el('wheel-speed').disabled=busy||!current?.capabilities.wheel||!draft.wheel_enabled;
    const changed=current&&(draft.pointer_level!==current.settings.pointer_level||draft.wheel_enabled!==current.settings.wheel_enabled||draft.wheel_enabled&&draft.wheel_multiplier!==current.settings.wheel_multiplier);
    el('session-apply').disabled=busy||!changed;el('session-refresh').disabled=busy||!api?.readSession;
  }
  function adopt(result){current=result;for(const key of ['pointer_level','wheel_multiplier'])el(key==='pointer_level'?'pointer-speed':'wheel-speed').value=String(result.settings[key]);el('wheel-helper-enabled').checked=result.settings.wheel_enabled;el('pointer-speed-note').textContent=result.capabilities.pointer_note;el('wheel-speed-note').textContent=result.capabilities.wheel_note;}
  async function load(){if(busy)return;busy=true;update();try{adopt(await api.readSession());el('session-status').textContent='Desktop settings loaded. Edits apply only when you choose Apply desktop settings.';}catch(error){el('session-status').textContent=error.message;}finally{busy=false;update();}}
  for(const id of ['pointer-speed','wheel-speed'])el(id).addEventListener('input',update);
  el('wheel-helper-enabled').addEventListener('change',update);el('session-refresh').addEventListener('click',load);
  el('session-apply').addEventListener('click',async()=>{
    if(busy||!current)return;const draft=values(),changes={};
    if(draft.pointer_level!==current.settings.pointer_level)changes.pointer_level=draft.pointer_level;
    if(draft.wheel_enabled!==current.settings.wheel_enabled||draft.wheel_enabled&&draft.wheel_multiplier!==current.settings.wheel_multiplier){changes.wheel_enabled=draft.wheel_enabled;changes.wheel_multiplier=draft.wheel_multiplier;}
    if(!Object.keys(changes).length)return;busy=true;update();
    try{adopt(await api.applySession({expected_revision:current.revision,changes}));el('session-status').textContent='Desktop settings applied. Wheel helper stops when Resa closes.';}
    catch(error){el('session-status').textContent=error.message+' Reload desktop settings before trying again.';current=null;}
    finally{busy=false;update();}
  });
  if(api?.readSession)load();else{el('session-status').textContent='Open the Electron app to change desktop settings.';el('session-refresh').disabled=true;update();}
}
