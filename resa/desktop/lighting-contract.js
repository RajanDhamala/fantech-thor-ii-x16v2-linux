// Shared validation for the narrow native bridge. No raw reports or node paths.
export function lightingSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== 2 || !Object.hasOwn(value, 'brightness') || !Object.hasOwn(value, 'speed') ||
      !Number.isInteger(value.brightness) || value.brightness < 0 || value.brightness > 7 ||
      !Number.isInteger(value.speed) || value.speed < 0 || value.speed > 7) {
    throw new Error('Brightness and timing must each be an integer from 0 to 7.');
  }
  return { brightness: value.brightness, speed: value.speed };
}

export function lightingArguments(value, apply) {
  const settings = lightingSettings(value);
  return ['lighting', '--brightness', String(settings.brightness), '--speed', String(settings.speed), '--json',
    ...(apply ? ['--apply', '--experimental'] : [])];
}

export function matchingLightingDevice(device) {
  return device.bus === 3 && device.vid === 0x30fa && device.pid === 0x1440 && device.interface === '01' &&
    device.product === 'FANTECH-X16v2' && !device.warnings?.length &&
    device.descriptor_sha256 === '0ec3eb2dc293bd8edcb490f5cee9ab272ebec8f4e0edc5f9f365f1bab53b2018' &&
    device.reports?.some(report => report.kind === 'feature' && report.id === 7 && report.bytes_with_id === 8);
}
