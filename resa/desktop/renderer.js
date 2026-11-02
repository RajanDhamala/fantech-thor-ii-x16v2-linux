import {mountSessionControls} from './session-controls.js';
import {capturedEffects,allEffects,responseEffects,directions,directionsForEffect,snapColor} from './captured-lighting.js';
import { dpiValues, names, defaultProfile, validateProfile, loadProfiles, clone } from './model.js';
import { enhanceSelect, syncDropdown, focusDropdown, closeDropdown } from './dropdown.js';
import { mountMouseViewer } from './mouse-viewer.js';
import { brightnessPercent, withDevice, mountDeviceControls } from './device-controls.js';
import { buttonActions, buttonKeys } from './device-contract.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const storageKey = 'resa.profiles.v1';
let saved = Array.from({ length: 4 }, defaultProfile);
let storageProblem = '';
try {
  const raw = localStorage.getItem(storageKey);
  if (raw) {
    const loaded = loadProfiles(raw);
    if (loaded) saved = loaded;
    else storageProblem = 'Saved profiles could not be loaded. Preview defaults are shown.';
  }
} catch { storageProblem = 'Local storage is unavailable. Profile saving may not work.'; }
let profiles = saved.map(clone);
let profileIndex = 0;
let selectedButton = 0;
let tab = 'buttons';
let dpiEditorStage = null;
let toastTimer;
let playback;
let playbackGeneration = 0;
let devices = [];
let mouseViewer;
let deviceControls;
let lastLightEffect='Light On';
let lastDeviceTiming=150;
const current = () => profiles[profileIndex];
let editBaselines = saved.map(clone);

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3500);
}

function updateDirty() {
  renderProfiles();
  deviceControls?.refresh();
}

function renderProfiles() {
  const container = $('#profiles');
  container.replaceChildren();
  names.forEach((name, i) => {
    const button = element('button', `profile${i === profileIndex ? ' active' : ''}`);
    const edited = JSON.stringify(profiles[i]) !== JSON.stringify(editBaselines[i]);
    button.append(element('span', 'profile-index', `0${i + 1}`), element('span', 'profile-name', name + (edited ? ' ·' : '')), element('span', 'profile-indicator'));
    button.disabled = Boolean(deviceControls?.busy);
    button.setAttribute('aria-pressed', String(i === profileIndex));
    button.setAttribute('aria-label', `${name}, local profile${edited ? ', unsaved changes' : ''}`);
    button.addEventListener('click', () => { stopPlayback(); profileIndex = i; dpiEditorStage = null; deviceControls?.profileChanged(); render(); });
    container.append(button);
  });
}

function highlightButton(index, focus = false) {
  selectedButton = index;
  $$('.hotspot').forEach((node) => {
    const buttonIndex = Number(node.dataset.button);
    const active = buttonIndex === index;
    node.classList.toggle('selected', active);
    node.setAttribute('aria-pressed', String(active));
    node.setAttribute('aria-label', `Select button ${buttonIndex + 1}, ${current().buttons[buttonIndex]}`);
  });
  $$('.assignment').forEach((node) => node.classList.toggle('active', Number(node.dataset.button) === index));
  $('#selection-description').textContent = `Button ${index + 1} · ${current().buttons[index]}`;
  mouseViewer?.setSelected(index);
  if (focus) focusDropdown($(`#assign-${index}`));
}

function renderButtons() {
  closeDropdown();
  $('#assign-left').replaceChildren();
  $('#assign-right').replaceChildren();
  current().buttons.forEach((action, i) => {
    const label = element('label', 'assignment');
    label.dataset.button = String(i);
    label.htmlFor = `assign-${i}-trigger`;
    label.append(element('span', 'number', String(i + 1)), element('span', 'assignment-label', `Button ${i + 1}`));
    const select = element('select');
    select.id = `assign-${i}`;
    select.setAttribute('aria-label', `Button ${i + 1} assignment`);
    buttonActions.forEach((value) => { const option = element('option', '', value); option.value = value; select.append(option); });
    if(!buttonActions.includes(action)) {
      const option=element('option','',`${action} (unsupported)`);option.value=action;option.disabled=true;select.append(option);
    }
    select.value = action;
    select.addEventListener('focus', () => highlightButton(i));
    select.addEventListener('change', () => {
      const buttons=[...current().buttons];buttons[i]=select.value;
      if(!buttons.includes('Left click')) {
        select.value=current().buttons[i];syncDropdown(select);
        toast('Keep at least one button assigned to Left click.');return;
      }
      current().buttons[i]=select.value;highlightButton(i);updateDirty();
    });
    label.append(enhanceSelect(select, { groups: {
      'Left click': 'Mouse buttons', 'Right click': 'Mouse buttons', 'Middle click': 'Mouse buttons',
      Forward: 'Mouse buttons', Back: 'Mouse buttons', 'Rapid Fire': 'Mouse buttons',
      'DPI Loop': 'Sensitivity', 'DPI up': 'Sensitivity', 'DPI down': 'Sensitivity', 'Color cycle': 'Lighting',
    } }));
    (i < 3 ? $('#assign-left') : $('#assign-right')).append(label);
  });
  highlightButton(selectedButton);
}

function renderDpi() {
  closeDropdown();
  const profile = current();
  const index = dpiEditorStage ?? profile.stage;
  const root = $('#dpi-grid'); root.replaceChildren();
  const strip = element('div', 'dpi-stage-strip');
  strip.setAttribute('role', 'group'); strip.setAttribute('aria-label', 'DPI stages');
  profile.dpi.forEach((value, i) => {
    const button = element('button', `dpi-stage-tab${i === index ? ' selected' : ''}`);
    button.type = 'button'; button.dataset.stage = String(i);
    button.setAttribute('aria-pressed', String(i === index));
    const state = !profile.enabled[i] ? 'Off' : i === profile.stage ? 'Active' : 'Enabled';
    button.setAttribute('aria-label', `Stage ${i + 1}, ${value} DPI, ${state.toLowerCase()}`);
    button.append(element('span', 'dpi-stage-name', `Stage ${i + 1}`), element('span', 'dpi-stage-value', value.toLocaleString()), element('span', `dpi-stage-state${i === profile.stage ? ' active' : ''}`, state));
    button.addEventListener('click', () => { dpiEditorStage = i; renderDpi(); $(`[data-stage="${i}"]`).focus(); });
    strip.append(button);
  });
  const editor = element('div', 'dpi-editor');
  editor.setAttribute('role', 'group'); editor.setAttribute('aria-label', `Edit stage ${index + 1}`);
  const heading = element('div', 'dpi-editor-heading');
  const reading = element('div');
  const label = element('p', 'dpi-edit-label', `Stage ${index + 1} sensitivity`);
  const valueLabel = element('div', 'dpi-value');
  const output = element('output', '', profile.dpi[index].toLocaleString());
  output.id = 'dpi-current-value'; valueLabel.append(output, element('span', '', 'DPI'));
  reading.append(label, valueLabel);
  const exactLabel = element('label', 'dpi-exact-label', 'Exact value');
  const exact = element('select', 'dpi-exact'); exact.id = 'dpi-exact';
  exact.setAttribute('aria-label', `Exact DPI for stage ${index + 1}`);
  dpiValues.forEach(value => { const option=element('option','',`${value.toLocaleString()} DPI`); option.value=String(value); exact.append(option); });
  exact.value = String(profile.dpi[index]); exactLabel.append(enhanceSelect(exact));
  heading.append(reading, exactLabel);
  const range = element('input', 'dpi-main-range');
  range.type='range'; range.id='dpi-range'; range.min='0'; range.max=String(dpiValues.length-1); range.step='1';
  range.value=String(dpiValues.indexOf(profile.dpi[index]));
  range.setAttribute('aria-label', `DPI value for stage ${index + 1}`);
  range.setAttribute('aria-valuetext', `${profile.dpi[index]} DPI`);
  const setDpi = value => {
    if (!dpiValues.includes(value)) return;
    profile.dpi[index]=value;range.value=String(dpiValues.indexOf(value));exact.value=String(value);syncDropdown(exact);
    output.textContent=value.toLocaleString();range.setAttribute('aria-valuetext', `${value} DPI`);
    strip.children[index].querySelector('.dpi-stage-value').textContent=value.toLocaleString();
    const state=!profile.enabled[index]?'off':index===profile.stage?'active':'enabled';
    strip.children[index].setAttribute('aria-label',`Stage ${index+1}, ${value} DPI, ${state}`);
    updateDirty();
  };
  range.addEventListener('input', () => setDpi(dpiValues[Number(range.value)]));
  exact.addEventListener('change', () => setDpi(Number(exact.value)));
  const ends = element('div', 'range-ends');
  ends.append(element('span','',`${dpiValues[0].toLocaleString()} DPI`),element('span','',`${dpiValues.at(-1).toLocaleString()} DPI`));
  const options = element('div','dpi-stage-options');
  const enabledLabel = element('label','dpi-cycle-toggle');
  const enabled = element('input'); enabled.type='checkbox'; enabled.id='dpi-stage-enabled'; enabled.checked=profile.enabled[index];
  enabled.setAttribute('aria-label', `Enable DPI stage ${index+1}`);
  enabled.addEventListener('change', () => {
    if (!enabled.checked && profile.enabled.filter(Boolean).length===1) {enabled.checked=true;toast('Keep at least one DPI stage enabled.');return;}
    profile.enabled[index]=enabled.checked;
    if(!profile.enabled[profile.stage])profile.stage=profile.enabled.findIndex(Boolean);
    renderDpi();updateDirty();$('#dpi-stage-enabled').focus();
  });
  enabledLabel.append(enabled,element('span','','Include in DPI cycle'));
  options.append(enabledLabel);
  if(index===profile.stage) options.append(element('span','dpi-active-note','Active stage'));
  else {
    const activate=element('button','secondary-button','Use this stage');activate.id='dpi-use-stage';activate.type='button';activate.disabled=!profile.enabled[index];
    activate.addEventListener('click',()=>{profile.stage=index;renderDpi();updateDirty();$('#dpi-range').focus();});options.append(activate);
  }
  editor.append(heading,range,ends,options);
  root.append(strip,editor);
}

const colors = ['#ef4444', '#f59e0b', '#8bce89', '#60a5fa', '#ac8cf5', '#e8e8e3'];
const previewArt = $('.mouse-drawing').cloneNode(true);
previewArt.removeAttribute('aria-label'); previewArt.setAttribute('aria-hidden', 'true');
// Avoid duplicate SVG gradient IDs in the two independent illustrations.
previewArt.querySelectorAll('[id]').forEach(node => { node.id = `light-${node.id}`; });
previewArt.querySelectorAll('[fill]').forEach(node => {
  const fill = node.getAttribute('fill');
  if (fill.startsWith('url(#')) node.setAttribute('fill', fill.replace('url(#', 'url(#light-'));
});
$('#lighting-art').append(previewArt);
colors.forEach(color => {
  const button = element('button', 'swatch'); button.style.setProperty('--swatch', color);
  button.dataset.color = color; button.setAttribute('aria-label', `Use color ${color}`);
  button.addEventListener('click', () => { current().lighting.color = color; renderLighting(); updateDirty(); });
  $('#swatches').append(button);
});

const effectSelect=$('#effect');
for(const name of allEffects){const option=element('option','',name);option.value=name;option.disabled=!capturedEffects.includes(name);if(option.disabled)option.textContent+=' (coming soon)';effectSelect.append(option);}
for(const [value,label] of [['Static','Solid accent color'],['Breathing','Breathing accent color'],['Off','Off']]){const option=element('option','',label);option.value=value;effectSelect.append(option);}
for(const direction of directions){const option=element('option','',direction);option.value=direction;$('#light-direction').append(option);}
function renderLighting() {
  const light=current().lighting, off=light.effect==='Off';
  if(!off)lastLightEffect=light.effect;
  $('#lights-enabled').checked=!off;
  mouseViewer?.setLighting({...light,color:['Cycle Breathing Effect','Flowing Water Effect','Mono Water Effect'].includes(light.effect)?light.palette[light.slots.findIndex(Boolean)]||light.palette[0]:light.color});
  if(![...effectSelect.options].some(o=>o.value===light.effect)){const option=element('option','',`${light.effect} (unavailable)`);option.value=light.effect;option.disabled=true;effectSelect.append(option);}
  effectSelect.value=light.effect;syncDropdown(effectSelect);$('#color').value=light.color;
  $('#color-value').textContent=light.color.toUpperCase();
  $('#brightness').value=String(Math.round(light.brightness*6/100)+1);$('#speed').value=String(Math.min(5,Math.round(light.speed/20)));
  $('#brightness-value').textContent=`Level ${Math.round(light.brightness*6/100)+1} of 7`;
  $('#speed-value').textContent=light.speed>100?`Device setting ${Math.round(light.speed/20)}`:`${Math.round(light.speed/20)} / 5`;
  const palette=['Cycle Breathing Effect','Flowing Water Effect','Mono Water Effect'].includes(light.effect), live=['Static','Breathing'].includes(light.effect);
  $('#accent-controls').hidden=!live;$('#palette-controls').hidden=!palette;
  $('#brightness-controls').hidden=!['Light On','Flowing Water Effect','Mono Water Effect','Static','Breathing'].includes(light.effect);
  $('#speed-controls').hidden=!['DPI Breathing Effect','Cycle Breathing Effect','Flowing Water Effect','Mono Water Effect','Neon','Flicker','Enraptured','Breathing'].includes(light.effect);
  $('#direction-controls').hidden=!['Flowing Water Effect','Mono Water Effect'].includes(light.effect);$('#response-controls').hidden=light.effect!=='Button Response';
  for(const option of $('#light-direction').options)option.disabled=!directionsForEffect(light.effect).includes(option.value);
  $('#light-direction').value=light.direction;syncDropdown($('#light-direction'));$('#light-symmetry').checked=light.symmetry;
  $('#palette-slots').replaceChildren();
  light.palette.forEach((color,i)=>{
    const slot=element('div','palette-slot');
    const label=element('label','palette-toggle');const toggle=element('input');toggle.type='checkbox';toggle.id=`slot-enabled-${i}`;toggle.checked=light.slots[i];toggle.setAttribute('aria-label',`Include color slot ${i+1}`);
    toggle.addEventListener('change',()=>{if(!toggle.checked&&light.slots.filter(Boolean).length===1){toggle.checked=true;toast('Keep at least one color slot enabled.');return;}light.slots[i]=toggle.checked;renderLighting();updateDirty();$(`#slot-enabled-${i}`).focus();});label.append(toggle,element('span','',String(i+1)));
    const picker=element('input','slot-color');picker.type='color';picker.id=`slot-color-${i}`;picker.value=color;picker.setAttribute('aria-label',`Color slot ${i+1}`);
    const code=element('input','slot-hex');code.type='text';code.id=`slot-hex-${i}`;code.value=color.toUpperCase();code.maxLength=7;code.setAttribute('aria-label',`Hex color for slot ${i+1}`);
    const setColor=value=>{if(!/^#[\da-f]{6}$/i.test(value)){code.value=light.palette[i].toUpperCase();toast('Use a hex color such as #FF0000.');return;}light.palette[i]=snapColor(value);picker.value=light.palette[i];code.value=light.palette[i].toUpperCase();renderLighting();updateDirty();};
    picker.addEventListener('change',()=>setColor(picker.value));code.addEventListener('change',()=>setColor(code.value));
    slot.append(label,picker,code);$('#palette-slots').append(slot);
  });
  // Response settings are separate from the ordinary action selectors.
  closeDropdown();$('#response-buttons').replaceChildren();
  const buttonLabels=['Left','Right','Wheel press','Side / Forward','Side / Back','DPI','Lighting'];
  light.responses.forEach((effect,i)=>{
    const label=element('label','response-row');label.append(element('span','',`${i+1} · ${buttonLabels[i]}`));
    const select=element('select');select.id=`response-${i}`;select.setAttribute('aria-label',`Button ${i+1} lighting response`);
    responseEffects.forEach(value=>{const option=element('option','',value);option.value=value;select.append(option);});select.value=effect;
    select.addEventListener('change',()=>{light.responses[i]=select.value;updateDirty();});label.append(enhanceSelect(select));$('#response-buttons').append(label);
  });
  $('#lighting-note').textContent=off?'Off selected. Apply changes turns off lighting and button reactions. Switch Lights on to return to the previous effect.':'Edits are sent when you choose Apply changes.';
  const color=palette?(light.palette[light.slots.findIndex(Boolean)]||light.palette[0]):light.color;
  document.documentElement.style.setProperty('--light-color',color);
  const preview=$('.lighting-preview');preview.dataset.effect=['DPI Breathing Effect','Cycle Breathing Effect','Breathing'].includes(light.effect)?'Breathing':light.effect;
  previewArt.querySelectorAll('.rgb-line,.rgb-mark').forEach(node=>{node.style.opacity=off?'0':String(light.brightness/100);node.style.animationDuration=`${6-Math.min(100,light.speed)/20}s`;});
  $('#effect-caption').textContent=`${light.effect.toUpperCase()} / COLOR PREVIEW`;
  $$('.swatch').forEach(button=>button.classList.toggle('active',button.dataset.color===light.color));
}

function renderMacro() {
  $('#macro-events').replaceChildren();
  $('#macro-empty').hidden = current().macro.length > 0;
  $('#macro-count').textContent = `${current().macro.length} / 64`;
  $('#add-event').disabled = current().macro.length >= 64;
  $('#clear-macro').disabled = current().macro.length === 0;
  $('#play-macro').disabled = current().macro.length === 0;
  current().macro.forEach((event, i) => {
    const row = element('li', 'macro-event'); row.dataset.event = String(i);
    row.append(element('span', 'event-index', String(i + 1).padStart(2, '0')),
      element('span', 'event-key', event.type === 'delay' ? '◷' : event.key),
      element('span', 'event-description', event.type === 'delay' ? `Wait ${event.ms} ms` : `Key ${event.type}`));
    const remove = element('button', 'event-remove', '×'); remove.setAttribute('aria-label', `Remove event ${i + 1}`);
    remove.addEventListener('click', () => { stopPlayback(); current().macro.splice(i, 1); renderMacro(); updateDirty(); });
    row.append(remove); $('#macro-events').append(row);
  });
}

function stopPlayback() {
  clearTimeout(playback); playbackGeneration += 1;
  $$('.macro-event').forEach(row => row.classList.remove('playing'));
  $('#play-macro').textContent = 'Preview sequence ▷';
}

function renderTiming(){const value=current().doubleClickMs??lastDeviceTiming;$('#double-click-speed').value=String(Math.max(8,Math.min(300,value)));$('#double-click-value').textContent=`${value} ms`; }

function render() { renderTiming(); renderButtons(); renderDpi(); renderLighting(); renderMacro(); if($('#polling-rate')) $('#polling-rate').value=String(current().polling??1000); updateDirty(); }

function selectTab(next) {
  closeDropdown();
  stopPlayback(); tab = next;
  mouseViewer?.setActive(next === 'buttons');
  $$('[data-tab]').forEach(button => {
    const active = button.dataset.tab === tab;
    button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
  });
  $$('[role=tabpanel]').forEach(panel => { panel.hidden = panel.id !== `panel-${tab}`; });
}

$$('[data-tab]').forEach((button, i, tabs) => {
  button.addEventListener('click', () => selectTab(button.dataset.tab));
  button.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (i + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (i + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); selectTab(tabs[next].dataset.tab); tabs[next].focus(); }
  });
});
$$('.hotspot').forEach(button => button.addEventListener('click', () => highlightButton(Number(button.dataset.button), true)));
$('.brand').addEventListener('click', event => { event.preventDefault(); selectTab('buttons'); });
$('#effect').addEventListener('change',()=>{const light=current().lighting;light.effect=$('#effect').value;if(capturedEffects.includes(light.effect))light.speed=Math.min(100,light.speed);if(!directionsForEffect(light.effect).includes(light.direction))light.direction='Clockwise';renderLighting();updateDirty();});
$('#light-direction').addEventListener('change',()=>{current().lighting.direction=$('#light-direction').value;updateDirty();});
$('#light-symmetry').addEventListener('change',()=>{current().lighting.symmetry=$('#light-symmetry').checked;updateDirty();});
$('#color').addEventListener('input', () => { current().lighting.color = $('#color').value; renderLighting(); updateDirty(); });
for (const key of ['brightness', 'speed']) {
  $(`#${key}`).addEventListener('input', () => { current().lighting[key] = key === 'brightness' ? Math.round((Number($('#brightness').value)-1)*100/6) : Number($('#speed').value)*20; renderLighting(); updateDirty(); });
}

for (const key of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') $('#event-key').append(element('option', '', key));
for (const id of ['effect','light-direction','event-type','event-key']) enhanceSelect($(`#${id}`));
$('#event-type').addEventListener('change', () => {
  const delay = $('#event-type').value === 'delay'; $('#key-field').hidden = delay; $('#delay-field').hidden = !delay;
});
$('#add-event').addEventListener('click', () => {
  if (current().macro.length >= 64) return;
  const type = $('#event-type').value;
  const event = type === 'delay' ? { type, ms: Number($('#event-delay').value) } : { type, key: $('#event-key').value };
  const candidate = clone(current()); candidate.macro.push(event);
  if (!validateProfile(candidate)) { toast('Use a delay from 10 to 10,000 whole milliseconds.'); return; }
  stopPlayback(); current().macro.push(event); renderMacro(); updateDirty();
});
$('#clear-macro').addEventListener('click', () => { stopPlayback(); current().macro = []; renderMacro(); updateDirty(); });
$('#play-macro').addEventListener('click', () => {
  stopPlayback(); const generation = playbackGeneration; let i = 0;
  $('#play-macro').textContent = 'Playing visual preview…';
  const step = () => {
    if (generation !== playbackGeneration) return;
    $$('.macro-event').forEach(row => row.classList.remove('playing'));
    if (i >= current().macro.length) { stopPlayback(); return; }
    const row = $(`[data-event="${i}"]`); row?.classList.add('playing');
    row?.scrollIntoView({ block: 'nearest' });
    const event = current().macro[i++]; playback = setTimeout(step, event.type === 'delay' ? event.ms : 200);
  };
  step();
});

window.addEventListener('beforeunload', event => { if (deviceControls?.hasPending() || profiles.some((p, i) => JSON.stringify(p) !== JSON.stringify(editBaselines[i]))) { event.preventDefault(); event.returnValue = ''; } });

async function discover() {
  const button = $('#refresh'); button.disabled = true;
  try {
    if (!window.resa) {
      $('#connection-label').textContent = 'Browser preview';
      $('#connection-detail').textContent = 'Open the desktop app for device discovery';
      $('#device-details').textContent = 'This browser preview has no native device bridge. Launch make desktop for read-only discovery.';
      return;
    }
    $('#connection-label').textContent = 'Checking device';
    devices = await window.resa.discover();
    const config = devices.find(d => d.bus === 3 && d.vid === 0x30fa && d.pid === 0x1440 && d.reports?.some(r => r.kind === 'feature' && r.id === 7 && r.bytes_with_id === 8));
    $('#connection-badge').classList.toggle('connected', Boolean(config));
    $('#connection-label').textContent = config ? 'Mouse detected' : 'Mouse not detected';
    $('#connection-detail').textContent = config ? `USB 30FA:1440 · Interface ${config.interface ?? '?'}` : 'Connect your Thor II X16v2 and refresh';
    $('#device-details').textContent = JSON.stringify(devices, null, 2);
  } catch (error) {
    devices = [];
    $('#connection-badge').classList.remove('connected');
    $('#connection-label').textContent = 'Discovery unavailable';
    $('#connection-detail').textContent = 'Check the helper and refresh';
    $('#device-details').textContent = error.message; toast(error.message);
  } finally { button.disabled = false; deviceControls?.setDevices(devices); }
}
$('#refresh').addEventListener('click', discover);
$('#double-click-speed').addEventListener('input',()=>{current().doubleClickMs=Number($('#double-click-speed').value);renderTiming();updateDirty();});
mountSessionControls();
$('#polling-rate').addEventListener('change',()=>{current().polling=Number($('#polling-rate').value);updateDirty();});
$('#lights-enabled').addEventListener('change',()=>{current().lighting.effect=$('#lights-enabled').checked?(capturedEffects.includes(lastLightEffect)||['Static','Breathing'].includes(lastLightEffect)?lastLightEffect:'Light On'):'Off';renderLighting();updateDirty();});
$('#device-info').addEventListener('click', () => $('#details-dialog').showModal());
$('#close-details').addEventListener('click', () => $('#details-dialog').close());
$('#details-dialog').addEventListener('click', event => { if (event.target === $('#details-dialog')) $('#details-dialog').close(); });
mouseViewer = mountMouseViewer({ onSelect: (index, focus) => highlightButton(index, focus) });
deviceControls = mountDeviceControls({
  getProfile: current,
  onRead: (settings,options) => {
    if(Number.isInteger(settings.double_click_ms))lastDeviceTiming=settings.double_click_ms;
    profiles[profileIndex]=withDevice(current(),settings,options);
    editBaselines[profileIndex]=clone(current());render();
  },
  onSaved: () => {
    if(!validateProfile(current()))throw Error('Unsupported preset values');
    const next=saved.map(clone);next[profileIndex]=clone(current());
    localStorage.setItem(storageKey,JSON.stringify({version:1,profiles:next}));
    saved=next;editBaselines[profileIndex]=clone(current());renderProfiles();
  },
  onUndo: profile => {profiles[profileIndex]=profile;stopPlayback();render();}
});
render(); discover();
if (storageProblem) toast(storageProblem);
