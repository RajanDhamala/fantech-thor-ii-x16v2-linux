import { createMouseGeometry, clampMouseCamera, mouseCameraPosition, mouseViewProjection, projectMousePoint, stepMouseWheel } from './mouse-geometry.js';
import { mousePhotos } from './mouse-assets.js';
import { createMouseInputMonitor, mouseInputButtons } from './mouse-input.js';

const mouseVertexShader = `
  attribute vec3 aPosition, aNormal, aMaterial;
  attribute float aGlow, aButton;
  uniform mat4 uViewProjection;
  uniform vec3 uWheelCenter;
  uniform float uWheelAngle;
  varying vec3 vPosition, vNormal, vMaterial;
  varying float vGlow, vButton;
  void main() {
    vec3 position=aPosition, normal=aNormal;
    if(abs(aButton-2.0)<0.1) {
      float c=cos(uWheelAngle), s=sin(uWheelAngle);
      mat2 turn=mat2(c,s,-s,c);
      position.yz=uWheelCenter.yz+turn*(aPosition.yz-uWheelCenter.yz);
      normal.yz=turn*aNormal.yz;
    }
    vPosition=position; vNormal=normal; vMaterial=aMaterial;
    vGlow=aGlow; vButton=aButton;
    gl_Position=uViewProjection*vec4(position,1.0);
  }`;
const mouseFragmentShader = `
  precision mediump float;
  varying vec3 vPosition, vNormal, vMaterial;
  varying float vGlow, vButton;
  uniform vec3 uEye, uLedColor;
  uniform float uBrightness, uSelected, uWheel;
  uniform float uPressed[7];
  void main() {
    vec3 n=normalize(vNormal), eye=normalize(uEye-vPosition);
    if(dot(n,eye)<0.0) n=-n;
    vec3 light=normalize(vec3(-2.0,4.0,-3.0));
    float diffuse=max(dot(n,light),0.0);
    float soft=max(dot(n,normalize(vec3(3.0,2.0,2.0))),0.0);
    float shine=pow(max(dot(reflect(-light,n),eye),0.0),45.0)*0.12;
    float rim=pow(1.0-max(dot(n,eye),0.0),3.0)*0.08;
    vec3 color=vMaterial*(0.32+0.85*diffuse+0.24*soft)+vec3(shine+rim);
    if(abs(vButton-uSelected)<0.1) color=mix(color,uLedColor*0.45,0.32);
    float pressed=0.0;
    for(int i=0;i<7;i++) {
      if(abs(vButton-float(i))<0.1) pressed=uPressed[i];
    }
    if(abs(vButton-2.0)<0.1) pressed=max(pressed,abs(uWheel));
    color=mix(color,vec3(0.12,0.63,0.44),pressed*0.75);
    if(vGlow>0.5) color=mix(vec3(0.015),uLedColor*1.25,uBrightness);
    gl_FragColor=vec4(sqrt(max(color,vec3(0.0))),1.0);
  }`;

function mouseViewerElement(tag, className, text) {
  const node=document.createElement(tag);
  if(className) node.className=className;
  if(text!==undefined) node.textContent=text;
  return node;
}

export function mountMouseViewer({ onSelect }) {
  const canvas=document.querySelector('#mouse-canvas');
  const stage=document.querySelector('#mouse-3d');
  const diagram=document.querySelector('#mouse-art');
  const controls=document.querySelector('#model-controls');
  const status=document.querySelector('#model-status');
  const note=document.querySelector('#mouse-view-note');
  const zoom=document.querySelector('#model-zoom');
  const zoomValue=document.querySelector('#model-zoom-value');
  const rotate=document.querySelector('#model-rotate');
  const dialog=document.querySelector('#mouse-photo-dialog');
  const photo=document.querySelector('#mouse-reference-photo');
  const photoCaption=document.querySelector('#mouse-photo-caption');
  const shell=document.querySelector('.app-shell');
  const focusButton=document.querySelector('#model-focus');
  const testButton=document.querySelector('#model-test');
  const inputPanel=document.querySelector('#mouse-input-panel');
  const inputStatus=document.querySelector('#mouse-input-status');
  const inputEvent=document.querySelector('#mouse-input-event');
  const inputSummary=document.querySelector('#mouse-input-summary');
  let focusedView=false;
  let inputState={enabled:false,activeButtons:[],wheelDirection:0};
  let mode='2d',active=true,selected=0,photoIndex=0;
  const initialCamera={yaw:-2.5,pitch:.95,distance:4.3};
  let camera=clampMouseCamera(initialCamera);
  let lighting={effect:'Static',color:'#ef4444',brightness:65,speed:40};
  let gl,program,buffer,geometry,uniforms,frame=0,lastTime=0,autoRotate=false,drag;
  let graphicsFailed=false,contextLost=false;
  let wheelAngle=0,wheelTarget=0;
  const markers=[];
  const inputCounts=mouseInputButtons.map(item=>{
    const badge=mouseViewerElement('span','mouse-input-count');
    const value=mouseViewerElement('strong','','0');
    badge.append(mouseViewerElement('span','',item.label),value);
    document.querySelector('#mouse-input-counts').append(badge);
    return {badge,value,index:item.index};
  });
  for(const label of ['Wheel ↑','Wheel ↓']) {
    const badge=mouseViewerElement('span','mouse-input-count');
    const value=mouseViewerElement('strong','','0');
    badge.append(mouseViewerElement('span','',label),value);
    document.querySelector('#mouse-input-counts').append(badge);inputCounts.push({badge,value});
  }
  const inputMonitor=createMouseInputMonitor({
    target:window,focused:document.hasFocus(),
    isIgnored:event=>{
      if(dialog.open || document.querySelector('#details-dialog').open) return true;
      const control=event.target.closest?.('button,input,select,textarea,a,dialog,.model-controls,.mouse-view-toolbar');
      return Boolean(control && !control.classList.contains('model-hotspot'));
    },
    onChange:state=>{
      const up=state.wheelUp-(inputState.wheelUp||0),down=state.wheelDown-(inputState.wheelDown||0);
      if(up>=0 && down>=0) wheelTarget+=(down-up)*.32;
      inputState=state;
      testButton.setAttribute('aria-pressed',String(state.enabled));
      testButton.textContent=state.enabled ? 'Finish test' : 'Test inputs';
      stage.classList.toggle('is-testing',state.enabled);
      inputPanel.classList.toggle('is-listening',state.enabled && state.focused);
      inputStatus.textContent=state.enabled ? (state.focused?'Listening in this window':'Paused · window unfocused') : 'Test complete';
      inputEvent.textContent=state.lastEvent;
      inputSummary.textContent=`${state.total} presses · ${state.wheelUp+state.wheelDown} wheel events`;
      inputCounts.forEach(({badge,value,index},i)=>{
        value.textContent=String(i<5 ? state.counts[index] : i===5 ? state.wheelUp : state.wheelDown);
        badge.classList.toggle('is-active',i<5 ? state.activeButtons.includes(index) : state.wheelDirection===(i===5?-1:1));
      });
      markers.forEach((marker,i)=>marker.classList.toggle('is-pressed',state.activeButtons.includes(i) || (i===2 && state.wheelDirection!==0)));
      updateInstructions();requestDraw();
    },
  });

  function updateInstructions() {
    document.querySelector('#model-instructions').textContent=inputState.enabled
      ? 'Drag to orbit · Scroll zooms + tests the wheel · Arrow keys also work'
      : `Drag to orbit · Scroll to zoom · Arrow keys also work${focusedView?' · Esc exits focus':''}`;
  }
  function setFocusedView(value) {
    focusedView=value && mode==='3d' && active;
    shell.classList.toggle('is-model-focused',focusedView);
    focusButton.textContent=focusedView?'Exit focus · Esc':'Focus view';
    focusButton.setAttribute('aria-pressed',String(focusedView));
    updateInstructions();requestDraw();
  }
  function stopInputTest() {
    if(inputState.enabled) inputMonitor.setEnabled(false);
  }

  function requestDraw() {
    if(!frame && mode==='3d' && active && !graphicsFailed && !contextLost && !dialog.open && !document.hidden) frame=requestAnimationFrame(draw);
  }
  function setAutoRotate(value) {
    autoRotate=value;
    rotate.setAttribute('aria-pressed',String(value));
    rotate.textContent=value ? 'Stop rotation' : 'Auto-rotate';
    lastTime=0; requestDraw();
  }
  function updateZoom() {
    camera=clampMouseCamera(camera);
    const value=Math.round(430/camera.distance);
    zoom.value=String(value); zoomValue.textContent=`${value}%`;
    canvas.setAttribute('aria-label',`Approximate Thor II X16v2 3D model, zoom ${value} percent. Drag or use arrow keys to orbit; plus and minus zoom; Home resets.`);
    requestDraw();
  }
  function resetCamera() {
    camera=clampMouseCamera(initialCamera);
    setAutoRotate(false); updateZoom();
  }
  function compile(type,source) {
    const shader=gl.createShader(type);
    gl.shaderSource(shader,source); gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) {
      const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw new Error(message);
    }
    return shader;
  }
  function initialize() {
    if(gl) return;
    const context=canvas.getContext('webgl',{antialias:true,alpha:true,powerPreference:'low-power'});
    if(!context) throw new Error('WebGL unavailable');
    gl=context;
    const vertex=compile(gl.VERTEX_SHADER,mouseVertexShader),fragment=compile(gl.FRAGMENT_SHADER,mouseFragmentShader);
    program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
    gl.deleteShader(vertex);gl.deleteShader(fragment);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    geometry=createMouseGeometry();
    buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer); gl.bufferData(gl.ARRAY_BUFFER,geometry.vertices,gl.STATIC_DRAW);
    gl.useProgram(program);
    for(const [name,size,offset] of [['aPosition',3,0],['aNormal',3,3],['aMaterial',3,6],['aGlow',1,9],['aButton',1,10]]) {
      const location=gl.getAttribLocation(program,name);
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location,size,gl.FLOAT,false,geometry.stride*4,offset*4);
    }
    uniforms=Object.fromEntries(['uViewProjection','uEye','uLedColor','uBrightness','uSelected','uPressed[0]','uWheel','uWheelCenter','uWheelAngle'].map(name=>[name,gl.getUniformLocation(program,name)]));
    gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
  }
  function lightingAt(time) {
    let color=lighting.color.match(/[\da-f]{2}/gi).map(value=>parseInt(value,16)/255);
    let brightness=lighting.effect==='Off' ? 0 : lighting.brightness/100;
    const moving=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(moving && lighting.effect==='Breathing') brightness*=.35+.65*(Math.sin(time/(1800-lighting.speed*12))*.5+.5);
    if(moving && lighting.effect==='Spectrum') {
      const phase=time/(1600-lighting.speed*10);
      color=[0,2.094,4.189].map(offset=>.5+.5*Math.sin(phase+offset));
    }
    return {color,brightness,animated:moving && ['Breathing','Spectrum'].includes(lighting.effect)};
  }
  function draw(time) {
    frame=0;
    if(mode!=='3d' || !active || graphicsFailed || contextLost || dialog.open || document.hidden) { lastTime=0;return; }
    try { initialize(); } catch(error) {
      graphicsFailed=true;
      if(buffer) gl.deleteBuffer(buffer);
      if(program) gl.deleteProgram(program);
      status.hidden=false;status.textContent='3D graphics are unavailable here. You can still open your reference photos.';
      canvas.hidden=true;controls.hidden=true;
      console.warn('Mouse 3D preview unavailable:',error.message);return;
    }
    const seconds=lastTime ? Math.min((time-lastTime)/1000,.05) : 1/60;
    if(autoRotate && lastTime) camera.yaw+=seconds*.32;
    lastTime=time;
    const wheelMotion=stepMouseWheel(wheelAngle,wheelTarget,seconds,window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    wheelAngle=wheelMotion.angle;wheelTarget=wheelMotion.target;
    const bounds=stage.getBoundingClientRect();
    if(!bounds.width || !bounds.height) return;
    const scale=Math.min(window.devicePixelRatio||1,2);
    const width=Math.round(bounds.width*scale),height=Math.round(bounds.height*scale);
    if(canvas.width!==width || canvas.height!==height) { canvas.width=width;canvas.height=height; }
    const matrix=mouseViewProjection(camera,bounds.width/bounds.height),eye=mouseCameraPosition(camera);
    const light=lightingAt(time);
    gl.viewport(0,0,width,height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);
    gl.uniformMatrix4fv(uniforms.uViewProjection,false,matrix);
    gl.uniform3fv(uniforms.uEye,eye);gl.uniform3fv(uniforms.uLedColor,light.color);
    gl.uniform1f(uniforms.uBrightness,light.brightness);gl.uniform1f(uniforms.uSelected,selected);
    gl.uniform1fv(uniforms['uPressed[0]'],new Float32Array(Array.from({length:7},(_,i)=>inputState.activeButtons.includes(i)?1:0)));
    gl.uniform1f(uniforms.uWheel,inputState.wheelDirection);
    gl.uniform3fv(uniforms.uWheelCenter,geometry.wheelCenter);
    gl.uniform1f(uniforms.uWheelAngle,wheelAngle);
    gl.drawArrays(gl.TRIANGLES,0,geometry.vertices.length/geometry.stride);
    geometry.hotspots.forEach((point,i)=>{
      const projected=projectMousePoint(point,matrix),normal=geometry.normals[i];
      const direction=eye.map((value,k)=>value-point[k]);
      const facing=normal.reduce((sum,value,k)=>sum+value*direction[k],0)/Math.hypot(...direction);
      const visible=projected && facing>.2 && Math.abs(projected[0])<.94 && Math.abs(projected[1])<.94;
      const marker=markers[i];marker.hidden=!visible;
      if(visible) {marker.style.left=`${(projected[0]+1)*bounds.width/2}px`;marker.style.top=`${(1-projected[1])*bounds.height/2}px`;}
    });
    if(autoRotate || light.animated || wheelMotion.moving) requestDraw();
  }
  for(let i=0;i<7;i++) {
    const marker=mouseViewerElement('button','model-hotspot',String(i+1));
    marker.type='button';marker.hidden=true;
    marker.setAttribute('aria-label',`Select button ${i+1} on the 3D model`);
    marker.addEventListener('click',()=>{if(!inputState.enabled) onSelect(i,!focusedView);});stage.append(marker);markers.push(marker);
  }
  function setMode(next) {
    stopInputTest();setFocusedView(false);
    mode=next;setAutoRotate(false);
    focusButton.hidden=next!=='3d';
    diagram.hidden=next==='3d';stage.hidden=next!=='3d';controls.hidden=next!=='3d'||graphicsFailed;
    document.querySelectorAll('[data-mouse-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mouseView===next)));
    note.textContent=next==='3d' ? 'REFERENCE-BASED 3D APPROXIMATION' : 'ILLUSTRATION · PLACEMENT PREVIEW';
    document.querySelector('#mouse-view-direction').hidden=next==='3d';
    if(next==='3d') { updateZoom(); requestDraw(); } else {cancelAnimationFrame(frame);frame=0;}
  }
  document.querySelectorAll('[data-mouse-view]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mouseView)));
  document.querySelector('#model-reset').addEventListener('click',resetCamera);
  focusButton.addEventListener('click',()=>setFocusedView(!focusedView));
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape' && (focusedView || inputState.enabled) && !dialog.open && !document.querySelector('#details-dialog').open) {
      event.preventDefault();stopInputTest();
      if(focusedView) {setFocusedView(false);focusButton.focus();}
    }
  });
  testButton.addEventListener('click',()=>{
    if(inputState.enabled) stopInputTest();
    else {
      endDrag();inputPanel.hidden=false;inputMonitor.setEnabled(true);
    }
  });
  document.querySelector('#mouse-input-clear').addEventListener('click',()=>inputMonitor.clear());
  rotate.addEventListener('click',()=>setAutoRotate(!autoRotate));
  zoom.addEventListener('input',()=>{camera.distance=430/Number(zoom.value);updateZoom();});
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0) return;
    setAutoRotate(false);drag={id:event.pointerId,x:event.clientX,y:event.clientY};
    canvas.setPointerCapture(event.pointerId);canvas.classList.add('is-dragging');canvas.focus({preventScroll:true});
  });
  canvas.addEventListener('pointermove',event=>{
    if(!drag || drag.id!==event.pointerId) return;
    camera.yaw-=(event.clientX-drag.x)*.012;camera.pitch+=(event.clientY-drag.y)*.009;
    drag.x=event.clientX;drag.y=event.clientY;updateZoom();
  });
  const endDrag=()=>{drag=undefined;canvas.classList.remove('is-dragging');};
  canvas.addEventListener('lostpointercapture',endDrag);canvas.addEventListener('pointercancel',endDrag);
  canvas.addEventListener('pointerup',event=>{if(canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);endDrag();});
  canvas.addEventListener('wheel',event=>{
    event.preventDefault();
    if(!inputState.enabled && Number.isFinite(event.deltaY)) wheelTarget+=Math.sign(event.deltaY)*.32;
    camera.distance*=Math.exp(Math.max(-500,Math.min(500,event.deltaY))*.001);updateZoom();
  },{passive:false});
  canvas.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(event.key)) return;
    event.preventDefault();setAutoRotate(false);
    if(event.key==='ArrowLeft') camera.yaw-=.12;if(event.key==='ArrowRight') camera.yaw+=.12;
    if(event.key==='ArrowUp') camera.pitch+=.1;if(event.key==='ArrowDown') camera.pitch-=.1;
    if(['+','='].includes(event.key)) camera.distance-=.15;if(event.key==='-') camera.distance+=.15;
    if(event.key==='Home') resetCamera();else updateZoom();
  });
  canvas.addEventListener('webglcontextlost',event=>{
    stopInputTest();
    contextLost=true;lastTime=0;
    event.preventDefault();cancelAnimationFrame(frame);frame=0;endDrag();markers.forEach(marker=>{marker.hidden=true;});
    status.hidden=false;status.textContent='3D graphics paused. Waiting for the graphics context to recover.';
  });
  canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;gl=undefined;status.hidden=true;requestDraw();});
  const observer=new ResizeObserver(requestDraw);observer.observe(stage);
  document.addEventListener('visibilitychange',()=>{lastTime=0;requestDraw();});

  function showPhoto(index) {
    photoIndex=(index+mousePhotos.length)%mousePhotos.length;
    const item=mousePhotos[photoIndex];photo.src=item.src;photo.alt=`Your Fantech Thor II X16v2 — ${item.label.toLowerCase()} photograph`;
    photoCaption.textContent=`${String(photoIndex+1).padStart(2,'0')} / ${String(mousePhotos.length).padStart(2,'0')} · ${item.label}`;
    document.querySelectorAll('[data-reference-photo]').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===photoIndex)));
  }
  mousePhotos.forEach((item,i)=>{
    const button=mouseViewerElement('button','reference-thumbnail');button.type='button';button.dataset.referencePhoto=String(i);
    const image=mouseViewerElement('img');image.src=item.src;image.alt='';image.loading='lazy';
    button.append(image,mouseViewerElement('span','',item.label));button.setAttribute('aria-label',`View ${item.label.toLowerCase()} photo`);
    button.addEventListener('click',()=>showPhoto(i));document.querySelector('#mouse-photo-thumbnails').append(button);
  });
  document.querySelector('#mouse-photos').addEventListener('click',()=>{stopInputTest();showPhoto(photoIndex);dialog.showModal();});
  document.querySelector('#close-mouse-photos').addEventListener('click',()=>dialog.close());
  document.querySelector('#mouse-photo-prev').addEventListener('click',()=>showPhoto(photoIndex-1));
  document.querySelector('#mouse-photo-next').addEventListener('click',()=>showPhoto(photoIndex+1));
  dialog.addEventListener('keydown',event=>{
    if(event.key==='ArrowLeft' || event.key==='ArrowRight') {event.preventDefault();showPhoto(photoIndex+(event.key==='ArrowLeft'?-1:1));}
  });
  dialog.addEventListener('click',event=>{if(event.target===dialog) dialog.close();});
  dialog.addEventListener('close',()=>{lastTime=0;requestDraw();});
  updateZoom();
  return {
    setSelected(index) {selected=index;markers.forEach((marker,i)=>marker.setAttribute('aria-pressed',String(i===index)));requestDraw();},
    setLighting(value) {lighting={...value};requestDraw();},
    setActive(value) {active=value;lastTime=0;if(value) requestDraw();else {stopInputTest();setFocusedView(false);cancelAnimationFrame(frame);frame=0;endDrag();}},
    destroy() {inputMonitor.destroy();cancelAnimationFrame(frame);observer.disconnect();if(gl){gl.deleteBuffer(buffer);gl.deleteProgram(program);}},
  };
}
