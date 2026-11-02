import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lightingSettings, lightingArguments, matchingLightingDevice } from './lighting-contract.js';
import { readFileSync } from 'node:fs';

test('bridge only accepts two bounded integer levels and constructs fixed arguments', () => {
  for (const value of [null, [], {}, { brightness: 8, speed: 3 }, { brightness: 4, speed: -1 },
    { brightness: 1.5, speed: 3 }, { brightness: '4', speed: 3 }, { brightness: 4, speed: 3, node: '/dev/hidraw1' }]) {
    assert.throws(() => lightingSettings(value));
  }
  assert.deepEqual(lightingArguments({ brightness: 4, speed: 3 }, false), ['lighting', '--brightness', '4', '--speed', '3', '--json']);
  assert.deepEqual(lightingArguments({ brightness: 4, speed: 3 }, true), ['lighting', '--brightness', '4', '--speed', '3', '--json', '--apply', '--experimental']);
});
test('live panel eligibility pins the configuration descriptor and exact device', () => {
  const devices = JSON.parse(readFileSync(new URL('../evidence/linux-discovery.json', import.meta.url)));
  assert.equal(matchingLightingDevice(devices[0]), false);
  assert.equal(matchingLightingDevice(devices[1]), true);
  for (const change of [{ interface: '00' }, { product: 'other' }, { descriptor_sha256: 'other' }, { warnings: ['invalid'] }, { reports: [] }]) {
    assert.equal(matchingLightingDevice({ ...devices[1], ...change }), false);
  }
});
