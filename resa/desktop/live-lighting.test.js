import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { mountLiveLighting } from './live-lighting.js';

// Minimal DOM boundary exercises lifecycle and prevents accidental automatic sends.
test('only an explicit Apply sends, once, with the currently previewed settings', async () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalTimeout = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;
  const elements = new Map();
  const el = (id) => {
    if (!elements.has(id)) elements.set(id, { value: id === '#live-speed' ? '3' : '4', disabled: false,
      events: {}, addEventListener(event, callback) { this.events[event] = callback; } });
    return elements.get(id);
  };
  let planCalls = 0;
  let sent = [];
  let timers = [];
  let complete;
  const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
  try {
    globalThis.document = { querySelector: () => ({ querySelector: el }) };
    globalThis.setTimeout = (fn) => { timers.push(fn); return fn; };
    globalThis.clearTimeout = (fn) => { timers = timers.filter(item => item !== fn); };
    globalThis.window = { resa: {
      previewLighting: async settings => { planCalls++; return { settings, report_hex: `0713fff${settings.speed}0b0${settings.brightness}0002` }; },
      applyLighting: settings => { sent.push(settings); return new Promise(resolve => { complete = resolve; }); },
    } };
    const panel = mountLiveLighting();
    const devices = JSON.parse(readFileSync(new URL('../evidence/linux-discovery.json', import.meta.url)));
    panel.setDevices(devices);
    assert.equal(el('#live-apply').disabled, true);
    timers.shift()(); await settle();
    assert.equal(planCalls, 1); assert.equal(sent.length, 0);
    el('#live-brightness').value = '6'; el('#live-brightness').events.input();
    assert.equal(el('#live-apply').disabled, true); assert.equal(sent.length, 0);
    timers.shift()(); await settle();
    assert.equal(el('#live-apply').disabled, false);
    const pending = el('#live-apply').events.click();
    await el('#live-apply').events.click();
    assert.equal(sent.length, 1); assert.deepEqual(sent[0], { brightness: 6, speed: 3 });
    assert.equal(el('#live-brightness').disabled, true);
    complete({ note: 'Kernel accepted one lighting report; effect unverified.' }); await pending;
    assert.match(el('#live-status').textContent, /unverified/);
    panel.setDevices([]); assert.equal(el('#live-apply').disabled, true);
  } finally {
    globalThis.document = originalDocument; globalThis.window = originalWindow;
    globalThis.setTimeout = originalTimeout; globalThis.clearTimeout = originalClear;
  }
});
