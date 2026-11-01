import copy
import io
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock
spec = importlib.util.spec_from_file_location('resa_worker', Path(__file__).with_name('worker.py'))
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)
BASE = {0x13: 240, 0x15: 228, 0x16: 111, 0x17: 40, 0x18: 152, 0x19: 189, 0x1e: 0, 0x3f: 131, 0x44: 33, 0x45: 34, 0x46: 35, 0x47: 36, 0x48: 37, 0x49: 38, 0x4a: 53}

BASE = {**{a: 0 for a in w.MASKS}, **BASE, 0x1c: 0x95, 0x1d: 0xff, 0x33: 0x1f, 0x3a: 0x0b, 0x3e: 0x8f}

class Sim:

    def __init__(self, image=None, fail_on=None, rollback_fail=False):
        self.image = dict(BASE if image is None else image)
        self.writes = []
        self.fail_on = fail_on
        self.rollback_fail = rollback_fail
        self.active = dict(self.image)
        self.finalizations = 0

    def stable(self):
        return dict(self.image)

    def verify(self, expected):
        if self.image != expected:
            raise w.DeviceError('Requested settings did not settle in readback')

    def finalize(self):
        self.finalizations += 1
        self.active = dict(self.image)

    def write_fragment(self, addresses, image):
        self.writes.append(list(addresses))
        for a in addresses:
            self.image[a] = image[a]
        if len(self.writes) == self.fail_on:
            raise w.DeviceError('commit failed after taking effect')
        if self.rollback_fail and len(self.writes) > self.fail_on:
            self.image[addresses[0]] ^= 1
            raise w.DeviceError('rollback failed')

class SettingsTests(unittest.TestCase):

    def test_captured_polling_choices_only(self):
        for hz, code in ((1000, 0), (500, 1), (250, 3), (125, 7)):
            after = w.merge(BASE, {'polling': hz})
            self.assertEqual(after[0x1e], code)
            self.assertEqual(w.decode(after)['polling'], hz)
            self.assertEqual([a for a in BASE if after[a] != BASE[a]], [] if code == 0 else [0x1e])
        for hz in (True, 0, 100, 2000, '500'):
            with self.assertRaises(ValueError):
                w.merge(BASE, {'polling': hz})

    def test_all_buttons_preserve_reaction_flags_and_other_slots(self):
        slots = {'button1': 0x44, 'button2': 0x46, 'button3': 0x45, 'button4': 0x48, 'button5': 0x47, 'button6': 0x49, 'button7': 0x4a}
        actions = {'Left click': 1, 'Right click': 3, 'Middle click': 2, 'Back': 4, 'Forward': 5, 'Rapid Fire': 9, 'DPI Loop': 6, 'DPI up': 11, 'DPI down': 12, 'Color cycle': 21}
        self.assertEqual(w.BUTTON_SLOTS, slots)
        self.assertEqual(w.BUTTONS, actions)
        for name, address in slots.items():
            for flags in (0, 32, 96, 0xe0):
                before = {**BASE, address: flags | 5}
                for action, low in actions.items():
                    after = w.merge(before, {name: action})
                    self.assertEqual(after[address], flags | low)
                    self.assertEqual(w.decode(after)[name], action)
                    self.assertTrue(all(after[a] == before[a] for a in BASE if a != address))
            with self.assertRaises(ValueError):
                w.merge(BASE, {name: 'Disabled'})

    def test_recording_11_button5_bytes_and_independent_button4(self):
        for action, value in (('Forward', 0x25), ('Back', 0x24), ('Rapid Fire', 0x29)):
            after = w.merge(BASE, {'button5': action})
            self.assertEqual(after[0x47], value)
            self.assertEqual(after[0x48], 0x25)
        after = w.merge(BASE, {'button4': 'Rapid Fire', 'button5': 'Rapid Fire'})
        self.assertEqual(w.changed_fragments(BASE, after), [[0x47, 0x48]])
        memory = Sim(fail_on=1)
        with self.assertRaisesRegex(w.DeviceError, 'original settings were restored'):
            w.transact(memory, BASE, after)
        self.assertEqual(memory.image, BASE)
        self.assertEqual(memory.writes, [[0x47, 0x48], [0x47, 0x48]])

    def test_button5_participates_in_revision_and_readback(self):
        after = w.merge(BASE, {'button5': 'Rapid Fire'})
        self.assertNotEqual(w.revision(BASE), w.revision(after))
        with self.assertRaisesRegex(w.DeviceError, 'changed since'):
            w.handle('apply', {'expected_revision': w.revision(BASE), 'changes': {'button4': 'Back'}}, Sim(after), None)

    def test_dpi_all_codes_and_reserved_bits(self):
        settings = w.decode(BASE)
        for dpi in w.DPIS:
            change = {'values': [dpi] * 6, 'enabled': [True] * 6, 'stage': 4}
            after = w.merge(BASE, {'dpi': change})
            decoded = w.decode(after)
            self.assertEqual(decoded['dpi'], [dpi] * 6)
            self.assertEqual(decoded['stage'], 4)
            for a in BASE:
                self.assertEqual(after[a] & ~w.MASKS[a], BASE[a] & ~w.MASKS[a])
            for a in (0x1e, 0x3f, 0x48):
                self.assertEqual(after[a], BASE[a])
        self.assertEqual(settings['dpi'], [4000, 800, 1200, 4800, 7200, 12800])
        self.assertEqual(settings['enabled'], [True, False, True, True, True, True])

    def test_brightness_capture_codes_preserve_low_and_top_bits(self):
        for code in (0, 6, 4):
            after = w.merge(BASE, {'brightness_raw': code})
            self.assertEqual(after[0x3f], 131 | code << 4)
            self.assertTrue(all((after[a] == BASE[a] for a in BASE if a != 0x3f)))
        for value in (-1, 7, True):
            with self.assertRaises(ValueError):
                w.merge(BASE, {'brightness_raw': value})

    def test_unsupported_state_and_stale_ui_refuse_writes(self):
        m = Sim()
        with self.assertRaises(w.DeviceError):
            w.handle('apply', {'expected_revision': '0' * 64, 'changes': {'polling': 500}}, m, None)
        self.assertEqual(m.writes, [])
        for bad in ({**BASE, 0x1e: 2}, {**BASE, 0x48: 62}, {**BASE, 0x15: 180}):
            with self.assertRaises(w.DeviceError):
                w.decode(bad)

    def test_read_and_noop_do_not_commit_or_replace_backup(self):
        m = Sim()
        result = w.handle('read', {}, m, None)
        self.assertEqual(result['status'], 'read')
        with mock.patch.object(w, 'save_backup') as save:
            r = w.handle('apply', {'expected_revision': w.revision(BASE), 'changes': {'polling': 1000}}, m, Path('unused'))
            self.assertEqual(r['status'], 'unchanged')
            save.assert_not_called()
            self.assertEqual(m.writes, [])

    def test_failure_restores_failed_fragment_and_prior_fragments(self):
        after = w.merge(BASE, {'polling': 500, 'button4': 'Left click'})
        m = Sim(fail_on=2)
        with self.assertRaisesRegex(w.DeviceError, 'original settings were restored'):
            w.transact(m, BASE, after)
        self.assertEqual(m.image, BASE)
        self.assertEqual(m.active, BASE)
        self.assertEqual(m.finalizations, 1)
        self.assertEqual(m.writes, [[0x1e], [0x48], [0x48], [0x1e]])

    def test_rollback_failure_is_reported(self):
        m = Sim(fail_on=1, rollback_fail=True)
        with self.assertRaisesRegex(w.DeviceError, 'could not be verified'):
            w.transact(m, BASE, w.merge(BASE, {'polling': 500}))

    def test_private_backup_and_restore_preserve_unrelated_new_state(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'backup.json'
            m = Sim()
            r = w.handle('apply', {'expected_revision': w.revision(BASE), 'changes': {'polling': 500}}, m, path)
            self.assertEqual(r['status'], 'written-readback')
            self.assertTrue(r['can_restore'])
            self.assertEqual(path.stat().st_mode & 511, 384)
            m.image[0x48] = 36
            r = w.handle('restore', {'expected_revision': w.revision(m.image)}, m, path)
            self.assertEqual(m.image[0x1e], 0)
            self.assertEqual(m.image[0x48], 36)
            self.assertTrue(r['restored'])
            self.assertFalse(r['can_restore'])
            os.chmod(path, 420)
            with self.assertRaises(ValueError):
                w.load_backup(path)

    def test_foreign_backups_and_symlinks_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'b'
            w.save_backup(path, BASE, w.merge(BASE, {'polling': 500}))
            link = Path(d) / 'link'
            link.symlink_to(path)
            with self.assertRaises(OSError):
                w.load_backup(link)
            data = json.loads(path.read_text())
            data['descriptor'] = 'wrong'
            path.write_text(json.dumps(data))
            with self.assertRaises(ValueError):
                w.load_backup(path)

    def test_both_legacy_backup_formats_preserve_new_button_fields(self):
        for stored_buttons in ({0x48}, {0x47, 0x48}, set(w.BUTTON_SLOTS.values())):
            with tempfile.TemporaryDirectory() as d:
                path = Path(d) / 'backup.json'
                original = dict(BASE)
                applied = w.merge(BASE, {'button4': 'Back'})
                w.save_backup(path, original, applied)
                data = json.loads(path.read_text())
                data['version'] = 1
                for name in ('before', 'after'):
                    data[name] = {str(a): BASE[a] if name == 'before' else applied[a] for a in w.OLD_COMMON | stored_buttons}
                path.write_text(json.dumps(data))
                current = {**applied, 0x44: 0x61, 0x45: 0xa2, 0x46: 0x65, 0x47: 0x69, 0x49: 0x2b, 0x4a: 0xf5}
                memory = Sim(current)
                self.assertTrue(w.can_restore(path, memory.image))
                w.handle('restore', {'expected_revision': w.revision(memory.image)}, memory, path)
                self.assertEqual(memory.image[0x48], original[0x48])
                if 0x47 not in stored_buttons:self.assertEqual(memory.image[0x47], 0x69)
                for address in w.BUTTON_SLOTS.values():
                    if address not in stored_buttons:
                        self.assertEqual(memory.image[address], current[address])
                self.assertEqual(memory.writes, [[0x48]])

    def test_last_left_click_is_required_before_any_backup_or_commit(self):
        request = {'expected_revision': w.revision(BASE), 'changes': {'button1': 'Forward'}}
        # Preflight checks the shape; only the actual full image determines
        # whether another physical button still provides Left click.
        w.validate_request('apply', request)
        memory = Sim()
        with mock.patch.object(w, 'save_backup') as save:
            with self.assertRaisesRegex(ValueError, 'at least one'):
                w.handle('apply', request, memory, Path('unused'))
            save.assert_not_called()
        self.assertEqual(memory.writes, [])
        request['changes']['button3'] = 'Left click'
        result = w.handle('apply', request, memory, None)
        self.assertEqual(result['settings']['button1'], 'Forward')
        self.assertEqual(result['settings']['button3'], 'Left click')

    def test_all_button_changes_are_bounded_and_roll_back_both_fragments(self):
        changes = {'button1': 'Forward', 'button2': 'Middle click', 'button3': 'Right click', 'button4': 'Back', 'button5': 'Left click', 'button6': 'DPI up', 'button7': 'Rapid Fire'}
        after = w.merge(BASE, changes)
        parts = [[0x44, 0x45, 0x46, 0x47, 0x48], [0x49, 0x4a]]
        self.assertEqual(w.changed_fragments(BASE, after), parts)
        memory = Sim(fail_on=2)
        with self.assertRaisesRegex(w.DeviceError, 'original settings were restored'):
            w.transact(memory, BASE, after)
        self.assertEqual(memory.image, BASE)
        self.assertEqual(memory.writes, parts + list(reversed(parts)))
        for key in changes:
            image = w.merge(BASE, {key: 'Rapid Fire'})
            self.assertNotEqual(w.revision(BASE), w.revision(image))

    def test_moving_last_left_click_establishes_new_slot_before_removing_old(self):
        after = w.merge(BASE, {'button1': 'Forward', 'button7': 'Left click'})
        memory = Sim()
        self.assertTrue(w.transact(memory, BASE, after))
        self.assertEqual(memory.writes, [[0x4a], [0x44]])
        memory = Sim(fail_on=2)
        with self.assertRaisesRegex(w.DeviceError, 'original settings were restored'):
            w.transact(memory, BASE, after)
        self.assertEqual(memory.writes, [[0x4a], [0x44], [0x44], [0x4a]])
        self.assertEqual(memory.image, BASE)

    def test_request_validation_and_allowlist(self):
        for bad in ({'address': 0x1e}, {'polling': True}, {'button4': 'shell'}, {'dpi': {'values': []}}):
            with self.assertRaises(ValueError):
                w.validate_request('apply', {'expected_revision': '0' * 64, 'changes': bad})
        with self.assertRaises(ValueError):
            w.validate_request('read', {'raw': 'packet'})
        m = w.Memory(-1)
        for op, base, length in ((3, 0, 1), (9, 18, 2), (5, 0x1f, 1), (3, 0x4a, 2), (3, 0x44, 6), (1, 0x13, 1)):
            with self.assertRaises(ValueError):
                m.send(op, base, length)

    def test_wire_read_preparation_never_commits_and_write_is_bounded(self):
        image = dict(BASE)
        staged = {}
        reads = [None]
        operations = []

        def ioctl(fd, command, packet, mutate):
            if command == 0xc0084807:
                packet[0] = 7
                packet[1] = image[reads[0]]
                return 8
            op, offset, base = (packet[2], packet[3], int.from_bytes(packet[4:6], 'little'))
            operations.append(op)
            if op == 3:
                staged[base + offset] = packet[6]
            elif op == 0:
                staged.clear()
            elif op == 5:
                reads[0] = base + offset
            elif op == 9:
                image.update(staged)
            return 8
        with mock.patch.object(w.fcntl, 'ioctl', side_effect=ioctl), mock.patch.object(w.time, 'sleep'):
            memory = w.Memory(10)
            self.assertEqual(memory.stable(), BASE)
            self.assertNotIn(9, operations)
            after = w.merge(BASE, {'polling': 250})
            memory.write_fragment([0x1e], after)
            self.assertIn(9, operations)
            self.assertEqual(memory.stable(), after)

    def test_apply_finishes_before_readback_and_activates_committed_settings(self):
        memory = Sim()
        after = w.merge(BASE, {'dpi': {'values': [200,800,1200,4800,7200,12800], 'enabled': [True,False,True,True,True,True], 'stage': 0}})
        for fragment in w.changed_fragments(BASE,after):
            memory.write_fragment(fragment,after)
        self.assertEqual(memory.stable(),after)
        self.assertEqual(memory.active,BASE)
        memory = Sim()
        self.assertTrue(w.transact(memory,BASE,after))
        self.assertEqual(memory.finalizations,1)
        self.assertEqual(memory.active,after)
        self.assertEqual(w.decode(memory.active)['dpi'][0],200)

    def test_finalizer_is_exact_fixed_pair_and_never_an_addressed_command(self):
        reports=[]
        def ioctl(fd,command,packet,mutate):
            reports.append(bytes(packet));return 8
        with mock.patch.object(w.fcntl,'ioctl',side_effect=ioctl),mock.patch.object(w.time,'sleep') as sleep:
            w.Memory(10).finalize()
            self.assertEqual(reports,[bytes.fromhex('07 18 10 00 00 00 00 00'),bytes.fromhex('07 18 00 00 00 00 00 00')])
            sleep.assert_called_once_with(.005)
        with self.assertRaises(ValueError):w.Memory(10).send(0x10,0x13)

    def test_unchanged_apply_does_not_send_finalizer(self):
        memory=Sim()
        self.assertFalse(w.transact(memory,BASE,dict(BASE)))
        self.assertEqual(memory.finalizations,0)

    def test_finalizer_failure_restores_and_finalizes_the_original_fields(self):
        memory=Sim();finish=memory.finalize;calls=[]
        def fail_once():
            calls.append(1)
            if len(calls)==1:raise w.DeviceError('final Apply failed')
            finish()
        memory.finalize=fail_once
        with self.assertRaisesRegex(w.DeviceError,'original settings were restored'):
            w.transact(memory,BASE,w.merge(BASE,{'polling':500}))
        self.assertEqual(memory.image,BASE);self.assertEqual(memory.active,BASE)
        self.assertEqual(len(calls),2)

    def test_dpi_endpoints_for_each_stage_preserve_other_stage_values(self):
        original=w.decode(BASE)
        for stage in range(6):
            for dpi,code in ((200,1),(12800,24)):
                values=list(original['dpi']);values[stage]=dpi
                enabled=list(original['enabled']);enabled[stage]=True
                after=w.merge(BASE,{'dpi':{'values':values,'enabled':enabled,'stage':stage}})
                self.assertEqual(w.decode(after)['dpi'],values)
                self.assertEqual(w.decode(after)['stage'],stage)
                self.assertEqual((after[0x13]>>stage)&1,code>>4)
                self.assertEqual((after[0x15+stage//2]>>(4 if stage%2==0 else 0))&15,code&15)
                for address in (0x1e,0x3f,0x48):self.assertEqual(after[address],BASE[address])
        for unsupported in (201,300,12799,13000):
            with self.assertRaises(ValueError):
                w.merge(BASE,{'dpi':{'values':[unsupported]*6,'enabled':[True]*6,'stage':0}})

    def test_read_stability_allows_a_transient_without_any_write(self):
        memory=w.Memory(-1)
        other=w.merge(BASE,{'polling':500})
        with mock.patch.object(memory,'snapshot',side_effect=[BASE,other,other]) as read, mock.patch.object(memory,'send') as send:
            self.assertEqual(memory.stable(),other)
            self.assertEqual(read.call_count,3);send.assert_not_called()

    def test_post_apply_verification_waits_for_two_requested_images(self):
        memory=w.Memory(-1);after=w.merge(BASE,{'polling':500})
        # Stable old data must not prematurely cause rollback or count as success.
        with mock.patch.object(memory,'snapshot',side_effect=[BASE,BASE,after,BASE,after,after]) as read, mock.patch.object(memory,'finalize') as finish, mock.patch.object(w.time,'sleep'):
            memory.verify(after)
            self.assertEqual(read.call_count,6);finish.assert_not_called()
        with mock.patch.object(memory,'snapshot',return_value=BASE) as read, mock.patch.object(w.time,'sleep'):
            with self.assertRaisesRegex(w.DeviceError,'did not settle'):memory.verify(after)
            self.assertEqual(read.call_count,8)

    def test_delayed_apply_readback_does_not_repeat_writes_or_finalization(self):
        class Delayed(Sim):
            verify=w.Memory.verify
            def snapshot(self):
                self.reads+=1
                return dict(BASE if self.reads<4 else self.image)
        memory=Delayed();memory.reads=0;after=w.merge(BASE,{'polling':500})
        with mock.patch.object(w.time,'sleep'):
            self.assertTrue(w.transact(memory,BASE,after))
        self.assertEqual(memory.writes,[[0x1e]])
        self.assertEqual(memory.finalizations,1)
        self.assertEqual(memory.reads,5)

    def test_unstable_read_is_bounded_and_never_succeeds(self):
        memory=w.Memory(-1);other=w.merge(BASE,{'polling':500})
        with mock.patch.object(memory,'snapshot',side_effect=[BASE,other]*3) as read:
            with self.assertRaisesRegex(w.DeviceError,'still changing'):memory.stable()
            self.assertEqual(read.call_count,6)

    def test_root_is_rejected_before_creating_settings_files(self):
        with mock.patch.object(w.sys,'argv',['worker','read']),mock.patch.object(w.sys,'stdin',io.StringIO('{}')),mock.patch.object(w.os,'geteuid',return_value=0),mock.patch.object(w,'private_dir') as folder:
            with self.assertRaises(w.DeviceError):w.main()
            folder.assert_not_called()

    def test_backup_failure_prevents_any_commit(self):
        memory = Sim()
        with mock.patch.object(w, 'save_backup', side_effect=OSError('disk full')):
            with self.assertRaises(OSError):
                w.transact(memory, BASE, w.merge(BASE, {'polling': 500}), Path('unused'))
        self.assertEqual(memory.writes, [])

    def test_simple_rgb_is_bounded_and_off_matches_existing_path(self):
        packets = w.rgb_reports({'effect': 'Off', 'color': '#abcdef', 'speed': 3})
        self.assertEqual(len(packets), 7)
        self.assertEqual(packets[-1], bytes.fromhex('07 13 ff a3 0b 0f 00 00'))
        self.assertTrue(all((p[4:] == bytes(4) for p in packets[:-1])))
        self.assertEqual(w.rgb_reports({'effect': 'Static', 'color': '#ff0000', 'speed': 0})[0], bytes.fromhex('07 14 0f 0f 00 00 00 00'))
        for bad in ({'effect': 'Spectrum', 'color': '#123456', 'speed': 1}, {'effect': 'Off', 'color': '#ffffff', 'speed': 6}):
            with self.assertRaises(ValueError):
                w.rgb_reports(bad)
if __name__ == '__main__':
    unittest.main()
