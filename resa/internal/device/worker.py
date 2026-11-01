"""Resa's bounded X16v2 bridge. No arbitrary packets, addresses or commands.

The command-18 coordinates are corroborated by Windows recordings 04-29.
Transaction preparation comes from the retained vendor Apply/read analysis.
Live RGB follows the earlier X16v2 off/color path; only off is user-reported
working. All device behavior requires physical validation; tests use emulation.
Reaction-enable bit 5 follows the retained LED_REACT_EN vendor serializer;
its off/on handling has not yet been physically verified.
"""
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import struct
import sys
import tempfile
import time
DESCRIPTOR = '0ec3eb2dc293bd8edcb490f5cee9ab272ebec8f4e0edc5f9f365f1bab53b2018'
DPIS = (200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2400, 3200, 4000, 4800, 5600, 6400, 7200, 8000, 8800, 9600, 10400, 11200, 12800)
CODES = (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24)
RATES = {1000: 0, 500: 1, 250: 3, 125: 7}
BUTTONS = {'Left click': 1, 'Right click': 3, 'Middle click': 2, 'Back': 4, 'Forward': 5, 'Rapid Fire': 9, 'DPI Loop': 6, 'DPI up': 11, 'DPI down': 12, 'Color cycle': 21}
# Recordings 08/11/13 map all seven GUI buttons; slots are not GUI order.
# Actions share the vendor serializer; upper reaction-lighting bits stay intact.
BUTTON_SLOTS = {'button1': 0x44, 'button2': 0x46, 'button3': 0x45, 'button4': 0x48, 'button5': 0x47, 'button6': 0x49, 'button7': 0x4a}
# Mode codes 5/7/9/10 are readable but remain unavailable until captured.
MODE_NAMES = ('DPI Breathing Effect', 'Cycle Breathing Effect', 'Light On', 'Flowing Water Effect', 'Mono Water Effect', 'Comet Streak', 'Neon', 'Ambilight', 'Flicker', 'Starlight', 'Ripple', 'Enraptured')
EFFECTS = {MODE_NAMES[i]: (i, 0) for i in (0, 1, 2, 3, 4, 6, 8, 11)}
# Retained Apply translation plus recording24's 9a/1f snapshot: not mode12.
EFFECTS['Button Response'] = (1, 8)
RESPONSES = ('Cycle Breathing Effect', 'Flowing Water Effect', 'Comet Streak', 'Mono Water Effect')
DIRECTIONS = ('Clockwise', 'Anti Clockwise', 'Two way', 'Overwrite')
OLD_COMMON = {0x13, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1e, 0x3f}
OLD_FIELDS = OLD_COMMON | set(BUTTON_SLOTS.values())
MASKS = {0x13: 0x3f, 0x15: 0xff, 0x16: 0xff, 0x17: 0xff, 0x18: 7, 0x19: 0x3f,
         0x1a: 0xff, 0x1b: 0xff, 0x1c: 0x7f, 0x1d: 0x7f, 0x1e: 0xff, **{a: 0xf0 for a in range(0x20, 0x32)},
         0x33: 0x80, 0x3a: 0x70, 0x3e: 0xff, 0x3f: 0x7f,
         **{address: 0xff for address in BUTTON_SLOTS.values()}}
# Fields sharing bytes must restore independently (color vs brightness, action
# vs response, direction vs symmetry). Never restore an untouched neighbor.
RESTORE_FIELDS = {a: (mask,) for a, mask in MASKS.items()}
RESTORE_FIELDS.update({0x1c: (0x78, 7), 0x1d: tuple(1 << i for i in range(7)),
                       0x3a: (0x30, 0x40), 0x3e: (0xf0, 0x0f), 0x3f: (0x70, 0x0f),
                       **{a: (0x1f, 0x20, 0xc0) for a in BUTTON_SLOTS.values()}})
def fragments(addresses):
    parts = []
    for a in sorted(addresses):
        if parts and parts[-1][-1] + 1 == a and len(parts[-1]) < 5:
            parts[-1].append(a)
        else:
            parts.append([a])
    return parts
FRAGMENTS = tuple((part[0], len(part)) for part in fragments(MASKS))

class DeviceError(RuntimeError):
    pass

def integer(value, low, high):
    if type(value) is not int or not low <= value <= high:
        raise ValueError('Setting is outside its supported range')
    return value

def snapshot_valid(image):
    if not isinstance(image, dict) or set(image) != set(MASKS):
        raise ValueError('Unexpected settings snapshot')
    for value in image.values():
        integer(value, 0, 0xff)
    return image

def revision(image):
    snapshot_valid(image)
    return hashlib.sha256(bytes((image[a] for a in sorted(MASKS)))).hexdigest()

def decode(image):
    snapshot_valid(image)
    codes = [image[0x15 + i // 2] >> (4 if i % 2 == 0 else 0) & 15 | (image[0x13] >> i & 1) << 4 for i in range(6)]
    if any((c not in CODES for c in codes)):
        raise DeviceError('Unrecognized DPI code in settings readback')
    enabled = [bool(image[0x19] >> i & 1) for i in range(6)]
    stage = image[0x18] & 7
    rate = next((r for r, c in RATES.items() if c == image[0x1e]), None)
    buttons = {name: next((a for a, c in BUTTONS.items() if c == image[address] & 0x1f), None) for name, address in BUTTON_SLOTS.items()}
    if stage >= 6 or not enabled[stage] or rate is None or any(action is None for action in buttons.values()):
        raise DeviceError('Mouse settings do not match the captured configuration')
    return {'dpi': [DPIS[CODES.index(c)] for c in codes], 'enabled': enabled, 'stage': stage, 'polling': rate, **buttons, 'brightness_raw': image[0x3f] >> 4 & 7, 'double_click_ms': image[0x1a] | image[0x1b] << 8, 'lighting': decode_lighting(image)}

def decode_lighting(image):
    mode = (image[0x1c] >> 4 & 7) | (image[0x33] >> 7 & 1) << 3
    effect = 'Button Response' if image[0x1c] & 8 and mode == 1 else (MODE_NAMES[mode] if not image[0x1c] & 8 and mode < len(MODE_NAMES) else 'Unrecognized')
    palette = [[image[0x20 + i * 3 + c] >> 4 for c in range(3)] for i in range(6)]
    palette.append([image[0x3e] >> 4, image[0x3e] & 15, image[0x3f] & 15])
    return {'effect': effect, 'speed_raw': image[0x1c] & 7, 'palette': palette,
            'enabled': [bool(image[0x1d] & 1 << i) for i in range(7)],
            'responses': [RESPONSES[image[a] >> 6] for a in BUTTON_SLOTS.values()],
            'response_enabled': [bool(image[a] & 0x20) for a in BUTTON_SLOTS.values()],
            'direction': DIRECTIONS[image[0x3a] >> 4 & 3], 'symmetry': bool(image[0x3a] & 0x40)}

def merge_lighting(after, light):
    allowed = {'effect', 'speed_raw', 'palette', 'enabled', 'responses', 'response_enabled', 'direction', 'symmetry'}
    if not isinstance(light, dict) or not light or set(light) - allowed:
        raise ValueError('Invalid lighting changes')
    if 'effect' in light:
        effect = light['effect']
        if not isinstance(effect, str) or effect not in EFFECTS:
            raise ValueError('Choose an available captured lighting effect')
        mode, flag = EFFECTS[effect]
        after[0x1c] = after[0x1c] & ~0x78 | (mode & 7) << 4 | flag
        after[0x33] = after[0x33] & 0x7f | (mode >> 3) << 7
    if 'speed_raw' in light:
        after[0x1c] = after[0x1c] & ~7 | integer(light['speed_raw'], 0, 5)
    if 'palette' in light:
        palette = light['palette']
        if not isinstance(palette, list) or len(palette) != 7:
            raise ValueError('Choose seven color slots')
        for rgb in palette:
            if not isinstance(rgb, list) or len(rgb) != 3:
                raise ValueError('Choose three channels per color slot')
            for n in rgb:
                integer(n, 0, 15)
        for i, rgb in enumerate(palette[:6]):
            for c, n in enumerate(rgb):
                a = 0x20 + i * 3 + c
                after[a] = after[a] & 15 | n << 4
        red, green, blue = palette[6]
        after[0x3e] = red << 4 | green
        after[0x3f] = after[0x3f] & 0xf0 | blue
    if 'enabled' in light:
        enabled = light['enabled']
        if not isinstance(enabled, list) or len(enabled) != 7 or any(type(v) is not bool for v in enabled) or not any(enabled):
            raise ValueError('Keep at least one color slot enabled')
        after[0x1d] = after[0x1d] & 0x80 | sum(int(v) << i for i, v in enumerate(enabled))
    if 'responses' in light:
        values = light['responses']
        if not isinstance(values, list) or len(values) != 7 or any(not isinstance(v, str) or v not in RESPONSES for v in values):
            raise ValueError('Choose seven supported response effects')
        for a, effect in zip(BUTTON_SLOTS.values(), values):
            after[a] = after[a] & 0x3f | RESPONSES.index(effect) << 6
    if 'direction' in light:
        if not isinstance(light['direction'], str) or light['direction'] not in DIRECTIONS:
            raise ValueError('Choose a supported direction')
        after[0x3a] = after[0x3a] & ~0x30 | DIRECTIONS.index(light['direction']) << 4
    if 'response_enabled' in light:
        values = light['response_enabled']
        if not isinstance(values, list) or len(values) != 7 or any(type(v) is not bool for v in values):
            raise ValueError('Choose seven button response states')
        # Vendor LED_REACT_EN serializer: PROTOCOL.md, button slot bit 5.
        for a, enabled in zip(BUTTON_SLOTS.values(), values):
            after[a] = after[a] & ~0x20 | int(enabled) << 5
    if 'symmetry' in light:
        if type(light['symmetry']) is not bool:
            raise ValueError('Invalid symmetry state')
        after[0x3a] = after[0x3a] & ~0x40 | int(light['symmetry']) << 6
    if ('effect' in light or 'direction' in light) and decode_lighting(after)['effect'] == 'Mono Water Effect' and after[0x3a] & 0x30 == 0x30:
        raise ValueError('Mono Water supports Clockwise, Anti Clockwise, or Two way')

def merge(image, changes):
    decode(image)
    if not isinstance(changes, dict) or not changes or set(changes) - ({'dpi', 'polling', 'brightness_raw', 'lighting', 'double_click_ms'} | set(BUTTON_SLOTS)):
        raise ValueError('Choose a supported settings section')
    after = dict(image)
    if 'dpi' in changes:
        d = changes['dpi']
        if not isinstance(d, dict) or set(d) != {'values', 'enabled', 'stage'}:
            raise ValueError('Invalid DPI settings')
        values, enabled, stage = (d['values'], d['enabled'], d['stage'])
        if not isinstance(values, list) or len(values) != 6 or any((type(v) is not int or v not in DPIS for v in values)):
            raise ValueError('Choose six supported DPI values')
        if not isinstance(enabled, list) or len(enabled) != 6 or any((type(v) is not bool for v in enabled)):
            raise ValueError('Invalid DPI enable state')
        integer(stage, 0, 5)
        if not enabled[stage]:
            raise ValueError('The selected DPI stage must be enabled')
        codes = [CODES[DPIS.index(v)] for v in values]
        fields = {0x13: sum(((c >> 4 & 1) << i for i, c in enumerate(codes))), 0x18: stage, 0x19: sum((int(v) << i for i, v in enumerate(enabled)))}
        for pair in range(3):
            fields[0x15 + pair] = (codes[2 * pair] & 15) << 4 | codes[2 * pair + 1] & 15
        for address, value in fields.items():
            after[address] = image[address] & ~MASKS[address] | value
    if 'polling' in changes:
        rate = changes['polling']
        if type(rate) is not int or rate not in RATES:
            raise ValueError('Choose 125, 250, 500, or 1000 Hz')
        after[0x1e] = RATES[rate]
    for name, address in BUTTON_SLOTS.items():
        if name not in changes:
            continue
        action = changes[name]
        if not isinstance(action, str) or action not in BUTTONS:
            raise ValueError('Choose a supported mouse-button action')
        after[address] = after[address] & 0xe0 | BUTTONS[action]
    if 'brightness_raw' in changes:
        code = integer(changes['brightness_raw'], 0, 6)
        after[0x3f] = image[0x3f] & ~0x70 | code << 4
    if 'double_click_ms' in changes:
        value = integer(changes['double_click_ms'], 8, 300)
        after[0x1a], after[0x1b] = value & 255, value >> 8
    if 'lighting' in changes:
        merge_lighting(after, changes['lighting'])
    decode(after)
    return after

def changed_fragments(before, after):
    return fragments(a for a in MASKS if before[a] != after[a])

class Memory:

    def __init__(self, fd):
        self.fd = fd

    def send(self, op, base=0, length=1, offset=0, value=0):
        if op not in (0, 3, 5, 9):
            raise ValueError('Unsupported transaction')
        if op != 0 and (not 1 <= length <= 5 or not 0 <= offset < length or any((a not in MASKS for a in range(base, base + length)))):
            raise ValueError('Transaction extends outside settings fields')
        packet = bytearray((7, 0x18, op, offset, base & 0xff, base >> 8, value, length - 1))
        if fcntl.ioctl(self.fd, 0xc0084806, packet, True) != 8:
            raise DeviceError('Incomplete settings transfer')

    def finalize(self):
        # Exact vendor FUN_00413c90: fixed 18/10 report, Sleep(5), zero exit.
        # Observed at the end of Windows captures 07-10. No address or value
        # can be supplied here; this is not part of reads or unchanged applies.
        try:
            packet = bytearray((7, 0x18, 0x10, 0, 0, 0, 0, 0))
            if fcntl.ioctl(self.fd, 0xc0084806, packet, True) != 8:
                raise DeviceError('Incomplete final Apply report')
            time.sleep(0.005)
        finally:
            self.send(0)

    def read_fragment(self, base, length):
        try:
            for offset in range(length):
                self.send(3, base, length, offset)
                time.sleep(0.002)
            time.sleep(0.002)
            self.send(0, base)
            out = {}
            for offset in range(length):
                self.send(5, base, length, offset)
                time.sleep(0.002)
                report = bytearray((7, 0, 0, 0, 0, 0, 0, 0))
                if fcntl.ioctl(self.fd, 0xc0084807, report, True) != 8 or report[0] != 7:
                    raise DeviceError('Invalid settings readback')
                out[base + offset] = report[1]
            return out
        finally:
            self.send(0)

    def snapshot(self):
        out = {}
        for base, length in FRAGMENTS:
            out.update(self.read_fragment(base, length))
        return snapshot_valid(out)

    def stable(self):
        previous = self.snapshot()
        # Bounded readback sampling, never a retry of a commit/finalize report.
        for _ in range(5):
            image = self.snapshot()
            if image == previous:
                return image
            previous = image
        raise DeviceError('Mouse settings are still changing; release the DPI button and retry read')

    def verify(self, expected):
        # Firmware reload after the observed finalizer need not be synchronous.
        # Require two matching full snapshots of the requested image. An early
        # stable old image is not success. This is a host verification window,
        # not a recovered firmware delay or an additional write sequence.
        previous = None
        for _ in range(8):
            image = self.snapshot()
            if image == previous and image == expected:
                return
            previous = image
            time.sleep(0.025)
        detail = ''
        try:
            wanted, actual = decode(expected), decode(image)
            detail = '; '.join(f'{key}: requested {wanted[key]}, read {actual[key]}' for key in wanted if wanted[key] != actual[key])
        except (ValueError, DeviceError) as error:
            detail = str(error)
        raise DeviceError('Requested settings did not settle in readback. ' + (detail or 'Raw snapshot differs, including preserved fields'))

    def write_fragment(self, addresses, image):
        base, length = (addresses[0], len(addresses))
        try:
            for offset, a in enumerate(addresses):
                self.send(3, base, length, offset, image[a])
            time.sleep(0.004)
            self.send(9, base, length)
            time.sleep(0.002)
        finally:
            self.send(0, base)

def transact(memory, before, after, backup=None, activate=False):
    parts = changed_fragments(before, after)
    if not parts:
        if activate:
            # Explicit selection can re-enable stored lighting after live Off.
            # Use only the existing captured finalizer; do not replay a batch.
            try:
                memory.finalize()
                memory.verify(after)
            except (OSError, ValueError, DeviceError) as error:
                raise DeviceError('Lighting activation could not be confirmed; read the mouse before retrying. ' + str(error)) from error
            return True
        return False
    if not any(after[address] & 0x1f == BUTTONS['Left click'] for address in BUTTON_SLOTS.values()):
        raise ValueError('Keep at least one button assigned to Left click')
    button_addresses = set(BUTTON_SLOTS.values())
    if not any(before[a] & 0x1f == after[a] & 0x1f == BUTTONS['Left click'] for a in button_addresses):
        # When moving the last Left click between fragments, establish the new
        # assignment before removing the old one. Rollback reverses that order.
        parts.sort(key=lambda part: not any(a in button_addresses and after[a] & 0x1f == BUTTONS['Left click'] for a in part))
    if any(((before[a] ^ after[a]) & ~MASKS[a] for a in MASKS)):
        raise ValueError('Unrelated settings would change')
    if backup is not None:
        save_backup(backup, before, after)
    attempted = []
    try:
        for part in parts:
            attempted.append(part)
            memory.write_fragment(part, after)
        memory.finalize()
        memory.verify(after)
    except (OSError, ValueError, DeviceError) as error:
        failures = []
        for part in reversed(attempted):
            try:
                memory.write_fragment(part, before)
            except (OSError, ValueError, DeviceError) as recovery:
                failures.append(str(recovery))
        try:
            memory.finalize()
            memory.verify(before)
        except (OSError, ValueError, DeviceError) as recovery:
            raise DeviceError('Update failed and restoration could not be verified. Reconnect, read the mouse, then use Restore last change. ' + 'Update: ' + str(error) + ' Restoration: ' + str(recovery)) from error
        raise DeviceError('Update failed; original settings were restored and read back. ' + str(error)) from error
    return True

def private_dir():
    base = Path(os.environ.get('XDG_CONFIG_HOME', ''))
    if not base.is_absolute():
        base = Path.home() / '.config'
    folder = base / 'resa'
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    if folder.resolve() != folder.absolute():
        raise ValueError('Resa settings directory must not contain symlinks')
    info = folder.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o022:
        raise ValueError('Resa settings directory must be owned by you and not publicly writable')
    return folder

def save_backup(path, before, after):
    decode(before)
    decode(after)
    data = {'version': 4, 'device': '30fa:1440', 'descriptor': DESCRIPTOR, 'before': {str(k): v for k, v in before.items()}, 'after': {str(k): v for k, v in after.items()}}
    temp = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, prefix='.backup-', delete=False) as file:
            temp = Path(file.name)
            json.dump(data, file)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp, path)
    finally:
        if temp is not None:
            temp.unlink(missing_ok=True)

def load_backup(path, current=None):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC)
    with os.fdopen(fd) as file:
        info = os.fstat(file.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077 or (info.st_size > 8192):
            raise ValueError('Backup must be a private regular file owned by you')
        data = json.loads(file.read(8193))
    if not isinstance(data, dict) or set(data) != {'version', 'device', 'descriptor', 'before', 'after'} or type(data['version']) is not int or (data['version'] not in (1, 2, 3, 4)) or (data['device'] != '30fa:1440') or (data['descriptor'] != DESCRIPTOR):
        raise ValueError('Invalid Resa device backup')
    fields = {str(a) for a in MASKS}
    if not isinstance(data['before'], dict) or not isinstance(data['after'], dict):
        raise ValueError('Unexpected backup fields')
    stored_fields = set(data['before'])
    legacy = [{str(a) for a in OLD_COMMON | buttons} for buttons in ({0x48}, {0x47, 0x48}, set(BUTTON_SLOTS.values()))]
    allowed = [fields] if data['version'] in (3, 4) else [fields - {str(0x1a), str(0x1b)}] if data['version'] == 2 else legacy
    if stored_fields not in allowed or set(data['after']) != stored_fields:
        raise ValueError('Unexpected backup fields')
    missing = {int(a) for a in fields - stored_fields}
    if missing:
        # Carry freshly read values through both images. Restoring an older
        # backup must never change button fields that it did not contain.
        snapshot_valid(current)
    images = []
    for name in ('before', 'after'):
        image = {int(a): v for a, v in data[name].items()}
        for address in missing:
            image[address] = current[address]
        decode(image)
        images.append(image)
    if data['version'] == 4:
        allowed_masks = MASKS
    elif data['version'] in (2, 3):
        allowed_masks = {a: mask & ~0x20 if a in BUTTON_SLOTS.values() else mask for a, mask in MASKS.items()}
    else:
        allowed_masks = {a: (0x1f if a in BUTTON_SLOTS.values() else 0x70 if a == 0x3f else MASKS[a]) if a in OLD_FIELDS else 0 for a in MASKS}
    if any(((images[0][a] ^ images[1][a]) & ~allowed_masks[a] for a in MASKS)):
        raise ValueError('Backup changes unrelated fields')
    return images

@contextlib.contextmanager
def device():
    if os.geteuid() == 0:
        raise DeviceError('Run Resa as your normal desktop user')
    nodes = []
    for entry in Path('/sys/class/hidraw').glob('hidraw*'):
        try:
            path = (entry / 'device').resolve()
            attrs = dict((line.split('=', 1) for line in (path / 'uevent').read_text().splitlines() if '=' in line))
            if tuple((int(v, 16) for v in attrs.get('HID_ID', '').split(':'))) != (3, 12538, 5184):
                continue
            interface = next((p / 'bInterfaceNumber' for p in (path, *path.parents) if (p / 'bInterfaceNumber').exists()), None)
            product = next((p / 'product' for p in (path, *path.parents) if (p / 'product').exists()), None)
            if interface is None or interface.read_text().strip() != '01' or product is None or (product.read_text().strip() != 'FANTECH-X16v2'):
                continue
            if hashlib.sha256((path / 'report_descriptor').read_bytes()).hexdigest() != DESCRIPTOR:
                continue
            nodes.append(Path('/dev') / entry.name)
        except (OSError, ValueError):
            continue
    if len(nodes) != 1:
        raise DeviceError('Connect exactly one X16v2 to Linux. Release it from the VM, then refresh Resa')
    fd = os.open(nodes[0], os.O_RDWR | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        info = os.fstat(fd)
        if not stat.S_ISCHR(info.st_mode):
            raise DeviceError('Invalid HID endpoint')
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        raw = bytearray(8)
        fcntl.ioctl(fd, 0x80084803, raw, True)
        if struct.unpack('=IHH', raw) != (3, 12538, 5184):
            raise DeviceError('Mouse identity changed')
        size = bytearray(4)
        fcntl.ioctl(fd, 0x80044801, size, True)
        length = struct.unpack('=I', size)[0]
        if not 1 <= length <= 4096:
            raise DeviceError('Invalid report descriptor size')
        desc = bytearray(struct.pack('=I', length) + bytes(4096))
        fcntl.ioctl(fd, 0x90044802, desc, True)
        if struct.unpack_from('=I', desc)[0] != length or hashlib.sha256(desc[4:4 + length]).hexdigest() != DESCRIPTOR:
            raise DeviceError('Mouse descriptor changed')
        yield fd
    finally:
        os.close(fd)

def rgb_reports(settings):
    if not isinstance(settings, dict) or set(settings) != {'effect', 'color', 'speed'}:
        raise ValueError('Invalid lighting settings')
    effect, color, speed = (settings['effect'], settings['color'], settings['speed'])
    integer(speed, 0, 5)
    if effect not in ('Static', 'Breathing', 'Off'):
        raise ValueError('Choose Static, Breathing, or Off')
    if not isinstance(color, str) or len(color) != 7 or color[0] != '#' or any((c not in '0123456789abcdefABCDEF' for c in color[1:])):
        raise ValueError('Choose an RGB color')
    channels = [int(color[i:i + 2], 16) for i in (1, 3, 5)] if effect != 'Off' else [0, 0, 0]
    red, green, blue = [15 - c // 16 for c in channels]
    packets = [bytes((7, 0x14, slot << 5 | green, red << 4 | blue, 0, 0, 0, 0)) for slot in range(6)]
    mode = 8 if effect == 'Breathing' else 10
    packets.append(bytes((7, 0x13, 0xff, mode << 4 | speed, 11, 15 if effect == 'Off' else 8, 0, 0)))
    return packets

def can_restore(path, current):
    if path is None:
        return False
    try:
        before, after = load_backup(path, current)
        return any((current[a] ^ before[a]) & restore_mask(before, after, a) for a in MASKS)
    except (OSError, ValueError, DeviceError):
        return False

def restore_mask(before, after, address):
    if address in (0x1a, 0x1b):
        return 0xff if any(before[a] != after[a] for a in (0x1a, 0x1b)) else 0
    return sum(field for field in RESTORE_FIELDS[address] if (before[address] ^ after[address]) & field)

def handle(action, request, memory, backup):
    if action == 'read':
        if request != {}:
            raise ValueError('Read accepts no settings')
        image = memory.stable()
        return {'status': 'read', 'settings': decode(image), 'revision': revision(image), 'can_restore': can_restore(backup, image)}
    if action not in ('apply', 'restore'):
        raise ValueError('Unsupported settings action')
    expected_keys = {'expected_revision', 'changes'} if action == 'apply' else {'expected_revision'}
    if not isinstance(request, dict) or set(request) != expected_keys:
        raise ValueError('Invalid settings request')
    before = memory.stable()
    decode(before)
    if request['expected_revision'] != revision(before):
        raise DeviceError('Mouse settings changed since the last read. Read mouse again before applying')
    if action == 'apply':
        after = merge(before, request['changes'])
    else:
        original, applied = load_backup(backup, before)
        after = dict(before)
        for a in MASKS:
            if restore_mask(original, applied, a):
                mask = restore_mask(original, applied, a)
                after[a] = before[a] & ~mask | original[a] & mask
        decode(after)
    activate = action == 'apply' and isinstance(request['changes'].get('lighting'), dict) and 'effect' in request['changes']['lighting']
    changed = transact(memory, before, after, backup if action == 'apply' else None, activate=activate)
    return {'status': 'written-readback' if changed else 'unchanged', 'settings': decode(after), 'revision': revision(after), 'restored': action == 'restore', 'can_restore': can_restore(backup, after)}

def validate_request(action, request):
    if action == 'read':
        if request != {}:
            raise ValueError('Read accepts no settings')
        return
    if action == 'rgb':
        rgb_reports(request)
        return
    fields = {'expected_revision', 'changes'} if action == 'apply' else {'expected_revision'}
    if not isinstance(request, dict) or set(request) != fields:
        raise ValueError('Invalid settings request')
    token = request['expected_revision']
    if not isinstance(token, str) or len(token) != 64 or any((c not in '0123456789abcdef' for c in token)):
        raise ValueError('Read mouse before applying')
    if action == 'apply':
        image = {a: 0 for a in MASKS}
        image.update({0x15: 17, 0x16: 17, 0x17: 17, 0x19: 1})
        image.update({address: BUTTONS['Left click'] for address in BUTTON_SLOTS.values()})
        merge(image, request['changes'])

def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ('read', 'apply', 'restore', 'rgb'):
        raise ValueError('Unsupported device operation')
    payload = sys.stdin.read(8193)
    if len(payload) > 8192:
        raise ValueError('Settings request is too large')
    request = json.loads(payload)
    action = sys.argv[1]
    validate_request(action, request)
    if os.geteuid() == 0:
        raise DeviceError('Run Resa as your normal desktop user')
    if action == 'rgb':
        packets = rgb_reports(request)
    folder = private_dir()
    lock = os.open(folder / 'device.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    try:
        info = os.fstat(lock)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise ValueError('Unsafe device lock')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        with device() as fd:
            if action == 'rgb':
                for report in packets:
                    packet = bytearray(report)
                    if fcntl.ioctl(fd, 0xc0084806, packet, True) != 8:
                        raise DeviceError('Incomplete lighting transfer; hardware state is unknown. No retry made')
                result = {'status': 'sent-unverified', 'reports_sent': len(packets), 'physical_effect_verified': False}
            else:
                result = handle(action, request, Memory(fd), folder / 'device-backup.json')
        print(json.dumps(result))
    finally:
        os.close(lock)
if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, DeviceError) as error:
        print('Resa device: ' + str(error), file=sys.stderr)
        sys.exit(1)
