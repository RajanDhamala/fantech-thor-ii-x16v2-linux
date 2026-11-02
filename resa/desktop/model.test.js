import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultProfile, validateProfile, loadProfiles } from './model.js';

test('saved profiles round-trip without sharing edits', () => {
  const original = Array.from({ length: 4 }, defaultProfile);
  const loaded = loadProfiles(JSON.stringify({ version: 1, profiles: original }));
  assert.deepEqual(loaded, original);
  loaded[0].dpi[0] = 800;
  assert.equal(loaded[1].dpi[0], 400);
  assert.equal(original[0].dpi[0], 400);
});
test('invalid settings and unsupported imported records are rejected', () => {
  const mutations = [
    p => p.buttons[0] = 'shell command', p => p.dpi[0] = 2200,
    p => p.enabled.fill(false), p => p.enabled[p.stage] = false,
    p => p.stage = 6, p => p.lighting.color = 'url(file:///etc/passwd)',
    p => p.lighting.brightness = -1, p => p.macro.push({ type: 'exec', key: 'A' }),
    p => p.macro.push({ type: 'delay', ms: 10001 }),
  ];
  for (const mutate of mutations) { const p = defaultProfile(); mutate(p); assert.equal(validateProfile(p), false); }
  assert.equal(loadProfiles('{'), null);
  assert.equal(loadProfiles(JSON.stringify({ version: 2, profiles: [] })), null);
});
