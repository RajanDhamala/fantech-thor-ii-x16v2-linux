import { matchingLightingDevice } from './lighting-contract.js';

// This panel is independent of saved preview profiles. Only its Apply click sends.
export function mountLiveLighting() {
  const panel = document.querySelector('#live-lighting');
  const brightness = panel.querySelector('#live-brightness');
  const speed = panel.querySelector('#live-speed');
  const apply = panel.querySelector('#live-apply');
  const status = panel.querySelector('#live-status');
  const packet = panel.querySelector('#live-packet');
  const bridge = window.resa;
  let eligible = false;
  let busy = false;
  let planned;
  let generation = 0;
  let timer;
  const settings = () => ({ brightness: Number(brightness.value), speed: Number(speed.value) });
  const updateButton = () => {
    apply.disabled = !eligible || busy || !planned || !bridge?.applyLighting;
    brightness.disabled = busy;
    speed.disabled = busy;
    apply.textContent = busy ? 'Sending one report…' : 'Apply experimental lighting';
  };
  function deviceStatus() {
    return !bridge?.applyLighting ? 'Open make desktop to use live lighting.' :
      eligible ? 'Ready for an experimental transfer. Check the mouse after applying.' :
      'Connect exactly one matching X16v2 and refresh device discovery.';
  }
  async function preview(version) {
    if (!bridge?.previewLighting) { status.textContent = deviceStatus(); return; }
    try {
      const result = await bridge.previewLighting(settings());
      if (version !== generation) return;
      planned = result.settings;
      packet.textContent = result.report_hex.match(/../g).join(' ').toUpperCase();
      status.textContent = deviceStatus();
    } catch (error) {
      if (version !== generation) return;
      status.textContent = error.message;
    }
    updateButton();
  }
  function changed() {
    panel.querySelector('#live-brightness-value').value = brightness.value;
    panel.querySelector('#live-speed-value').value = speed.value;
    planned = undefined;
    packet.textContent = 'Preparing report preview…';
    clearTimeout(timer);
    const version = ++generation;
    updateButton();
    if (!bridge?.previewLighting) { packet.textContent = 'Desktop helper required'; status.textContent = deviceStatus(); return; }
    timer = setTimeout(() => preview(version), 150);
  }
  brightness.addEventListener('input', changed);
  speed.addEventListener('input', changed);
  apply.addEventListener('click', async () => {
    if (apply.disabled) return;
    const requested = { ...planned };
    busy = true;
    updateButton();
    status.textContent = 'Sending one experimental report. No automatic retry.';
    try {
      const result = await bridge.applyLighting(requested);
      status.textContent = result.note;
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; updateButton(); }
  });
  changed();
  return {
    setDevices(devices) {
      eligible = devices.filter(matchingLightingDevice).length === 1;
      if (!busy) status.textContent = deviceStatus();
      updateButton();
    },
  };
}
