"""Captured-byte regressions; no hardware access."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock
from worker_test import w, BASE, Sim


class CapturedLightingTests(unittest.TestCase):
    def test_mode_extension_and_speed_match_recordings_14_15_21_22_27(self):
        modes = [('DPI Breathing Effect', ['85','82','80'], '1f'),
                 ('Cycle Breathing Effect', ['95','92','90'], '1f'),
                 ('Flowing Water Effect', ['b5','b2','b0'], '1f'),
                 ('Mono Water Effect', ['c5','c2','c0'], '1f'),
                 ('Neon', ['e5','e2','e0'], '1f'),
                 ('Flicker', ['85','82','80'], '9f'),
                 ('Enraptured', ['b5','b2','b0'], '9f')]
        for effect, values, extension in modes:
            for speed, value in zip([5,2,0], values):
                after = w.merge(BASE, {'lighting': {'effect': effect, 'speed_raw': speed}})
                self.assertEqual(after[0x1c], int(value,16))
                self.assertEqual(after[0x33], int(extension,16))
                self.assertEqual(w.decode(after)['lighting']['effect'], effect)
                self.assertTrue(all(after[a] == BASE[a] for a in BASE if a not in (0x1c,0x33)))
        self.assertEqual(w.merge(BASE, {'lighting': {'effect':'Light On','speed_raw':0}})[0x1c], 0xa0)

    def test_button_response_uses_special_flag_not_dropdown_index_12(self):
        after = w.merge(BASE, {'lighting': {'effect':'Button Response','speed_raw':2}})
        self.assertEqual((after[0x1c],after[0x33]), (0x9a,0x1f))
        self.assertEqual(w.decode(after)['lighting']['effect'], 'Button Response')
        other = w.merge(after, {'lighting': {'effect':'Flicker'}})
        self.assertEqual((other[0x1c],other[0x33]), (0x82,0x9f))

    def test_all_response_selectors_preserve_bit5_and_ordinary_action(self):
        for index, address in enumerate(w.BUTTON_SLOTS.values()):
            for flag in (0, 0x20):
                before={**BASE,address:flag|5}
                for code,effect in enumerate(w.RESPONSES):
                    responses=list(w.decode(before)['lighting']['responses']);responses[index]=effect
                    after=w.merge(before, {'lighting': {'responses': responses}})
                    self.assertEqual(after[address],flag|5|code<<6)
                    self.assertTrue(all(after[a]==before[a] for a in BASE if a!=address))
        responses=list(w.RESPONSES)*2
        after=w.merge(BASE, {'button5':'Rapid Fire','lighting':{'responses':responses[:7]}})
        self.assertEqual(after[0x47]&0x1f, 9)
        self.assertEqual(after[0x47]>>6, 0)
        with self.assertRaisesRegex(ValueError,'Unrelated'):
            w.transact(Sim(),BASE,{**BASE,0x1c:BASE[0x1c]^0x80})

    def test_reaction_enable_changes_only_bit5_and_restores_independently(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'backup.json'
            before={**BASE,0x44:0xe1,0x46:0x43}
            memory=Sim(before)
            result=w.handle('apply',{'expected_revision':w.revision(before),'changes':{'lighting':{'response_enabled':[False]*7}}},memory,path)
            self.assertEqual(result['settings']['lighting']['response_enabled'],[False]*7)
            for a in w.BUTTON_SLOTS.values():
                self.assertEqual(memory.image[a],before[a]&~0x20)
            # Later action and response-type edits must survive restoring Off.
            memory.image[0x45]=memory.image[0x45]&~0x1f|1
            memory.image[0x44]=0x85
            w.handle('restore',{'expected_revision':w.revision(memory.image)},memory,path)
            self.assertEqual(memory.image[0x44],0xa5)
            self.assertEqual(memory.image[0x46],0x43)
            self.assertEqual(w.decode(memory.image)['lighting']['response_enabled'],w.decode(before)['lighting']['response_enabled'])

    def test_old_backups_cannot_modify_reaction_enable(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'backup.json'
            w.save_backup(path,BASE,{**BASE,0x44:BASE[0x44]^0x20})
            data=json.loads(path.read_text());data['version']=3
            path.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError,'unrelated'):
                w.load_backup(path,BASE)

    def test_palette_matches_slot1_color_and_special_slot7_packing(self):
        palette=w.decode(BASE)['lighting']['palette']
        palette[0]=[0,15,7]  # Recording23: selected color is not pure red.
        before={**BASE,0x20:0xf0,0x21:0xff,0x22:0xff,0x3f:0xc3}
        after=w.merge(before, {'lighting':{'palette':palette}})
        self.assertEqual([after[a] for a in (0x20,0x21,0x22)],[0x00,0xff,0x7f])
        palette=w.decode(before)['lighting']['palette'];palette[6]=[2,9,11]
        after=w.merge(before, {'lighting':{'palette':palette}})
        self.assertEqual(after[0x3e],0x29)
        self.assertEqual(after[0x3f],0xcb)
        self.assertTrue(all(after[a]&15==before[a]&15 for a in range(0x20,0x32)))
        after=w.merge(after,{'brightness_raw':4})
        self.assertEqual(after[0x3f],0xcb)

    def test_toggle_direction_symmetry_and_palette_flag_preservation(self):
        before={**BASE,0x3a:0x8b}
        for name,full in zip(w.DIRECTIONS,[0x8b,0x9b,0xab,0xbb]):
            after=w.merge(before,{'lighting':{'direction':name}})
            self.assertEqual(after[0x3a],full)
        after=w.merge(after,{'lighting':{'symmetry':True}})
        self.assertEqual(after[0x3a],0xfb)
        after=w.merge(after,{'lighting':{'symmetry':False,'enabled':[False]+[True]*6}})
        self.assertEqual(after[0x3a],0xbb)
        self.assertEqual(after[0x1d],0xfe)
        off_flag={**BASE,0x1d:0x7f}
        self.assertEqual(w.merge(off_flag,{'lighting':{'enabled':[False]+[True]*6}})[0x1d],0x7e)

    def test_restore_sharing_preserves_later_brightness_action_and_color(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'backup.json'
            palette=w.decode(BASE)['lighting']['palette'];palette[6][0]=1
            responses=list(w.decode(BASE)['lighting']['responses']);responses[4]='Mono Water Effect'
            memory=Sim()
            w.handle('apply',{'expected_revision':w.revision(BASE),'changes':{'lighting':{'palette':palette,'responses':responses}}},memory,path)
            self.assertEqual(json.loads(path.read_text())['version'],4)
            # Subsequent changes share bytes but belong to different fields.
            memory.image[0x3f]=0xe7
            memory.image[0x3e]=memory.image[0x3e]&0xf0|2
            memory.image[0x47]=memory.image[0x47]&0xe0|9
            w.handle('restore',{'expected_revision':w.revision(memory.image)},memory,path)
            self.assertEqual(memory.image[0x3f],0xe7)
            self.assertEqual(memory.image[0x3e],0x82)
            self.assertEqual(memory.image[0x47],0x29)

    def test_palette_transaction_failure_rolls_back_every_attempted_fragment(self):
        palette=[[i,i+1,i+2] for i in range(7)]
        after=w.merge(BASE,{'lighting':{'effect':'Flicker','palette':palette,'symmetry':True}})
        parts=w.changed_fragments(BASE,after);self.assertGreater(len(parts),3)
        memory=Sim(fail_on=3)
        with self.assertRaisesRegex(w.DeviceError,'original settings were restored'):
            w.transact(memory,BASE,after)
        self.assertEqual(memory.image,BASE)
        self.assertEqual(memory.writes,parts[:3]+list(reversed(parts[:3])))
        self.assertTrue(all(len(part)<=5 for part in parts))

    def test_slot7_blue_restore_keeps_later_brightness_and_disables_restore(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'backup.json';memory=Sim()
            palette=w.decode(BASE)['lighting']['palette'];palette[6][2]=8
            w.handle('apply',{'expected_revision':w.revision(BASE),'changes':{'lighting':{'palette':palette}}},memory,path)
            memory.image[0x3f]=0xe8
            self.assertTrue(w.can_restore(path,memory.image))
            w.handle('restore',{'expected_revision':w.revision(memory.image)},memory,path)
            self.assertEqual(memory.image[0x3f],0xe3)
            self.assertFalse(w.can_restore(path,memory.image))

    def test_legacy_backup_cannot_restore_response_or_palette_bits(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'backup.json'
            original={str(a):BASE[a] for a in w.OLD_FIELDS}
            applied={**original,str(0x48):0x65}
            path.write_text(json.dumps({'version':1,'device':'30fa:1440','descriptor':w.DESCRIPTOR,'before':original,'after':applied}))
            path.chmod(0o600)
            with self.assertRaisesRegex(ValueError,'unrelated'):
                w.load_backup(path,BASE)

    def test_invalid_and_uncaptured_settings_fail_before_any_device_access(self):
        cases=[{}, {'effect':'Comet Streak'}, {'effect':'Spectrum'},
               {'speed_raw':6},{'speed_raw':True},{'palette':[[0,0,16]]*7},
               {'enabled':[False]*7},{'responses':['shell']*7},{'response_enabled':[False]*6},{'response_enabled':[1]*7},{'symmetry':1},
               {'direction':0},{'address':0x44}]
        for light in cases:
            with self.assertRaises(ValueError):
                w.validate_request('apply',{'expected_revision':'a'*64,'changes':{'lighting':light}})
        # Unsupported stored effects can still be read and preserved by DPI edits.
        before={**BASE,0x1c:0xd2}
        self.assertEqual(w.decode(before)['lighting']['effect'],'Comet Streak')
        self.assertEqual(w.merge(before,{'polling':500})[0x1c],0xd2)

    def test_mono_water_captured_palette_toggles_brightness_and_restore(self):
        evidence=json.loads((Path(__file__).resolve().parents[2]/'evidence/mono-water-support.json').read_text())
        before=w.merge(BASE,{'lighting':{'effect':'Button Response'}})
        palette=evidence['palette_inverted_nibbles']
        after=w.merge(before,{'brightness_raw':6,'lighting':{'effect':'Mono Water Effect','speed_raw':0,'direction':'Two way','symmetry':False,'palette':palette}})
        self.assertEqual((after[0x1c],after[0x33],after[0x3a],after[0x3e],after[0x3f]),(0xc0,0x1f,0x2b,0x0f,0xef))
        for index,off_byte in enumerate(evidence['participation_off_bytes_hex']):
            enabled=[True]*7;enabled[index]=False
            off=w.merge(after,{'lighting':{'enabled':enabled}})
            self.assertEqual(off[0x1d],int(off_byte,16))
            self.assertEqual(w.merge(off,{'lighting':{'enabled':[True]*7}})[0x1d],0xff)
        for value in (0,4,6):
            image=w.merge(after,{'brightness_raw':value})
            self.assertEqual(image[0x3f],0x80|value<<4|15)
        for address in w.BUTTON_SLOTS.values():self.assertEqual(after[address],before[address])
        with tempfile.TemporaryDirectory() as folder:
            backup=Path(folder)/'backup.json';memory=Sim(before)
            result=w.handle('apply',{'expected_revision':w.revision(before),'changes':{'brightness_raw':6,'lighting':{'effect':'Mono Water Effect','palette':palette,'direction':'Two way','symmetry':True}}},memory,backup)
            self.assertEqual(result['status'],'written-readback');self.assertEqual(memory.active,memory.image)
            w.handle('restore',{'expected_revision':w.revision(memory.image)},memory,backup)
            self.assertEqual(memory.image,before)

    def test_mono_water_rejects_overwrite_without_blocking_flowing_water(self):
        with self.assertRaisesRegex(ValueError,'Mono Water supports'):
            w.merge(BASE,{'lighting':{'effect':'Mono Water Effect','direction':'Overwrite'}})
        flowing=w.merge(BASE,{'lighting':{'effect':'Flowing Water Effect','direction':'Overwrite'}})
        with self.assertRaisesRegex(ValueError,'Mono Water supports'):
            w.merge(flowing,{'lighting':{'effect':'Mono Water Effect'}})
        mono=w.merge(flowing,{'lighting':{'effect':'Mono Water Effect','direction':'Clockwise'}})
        self.assertEqual(mono[0x3a],0x0b)
        with self.assertRaisesRegex(ValueError,'Mono Water supports'):
            w.merge(mono,{'lighting':{'direction':'Overwrite'}})

    def test_palette_and_response_bits_participate_in_revision(self):
        for a in (0x20,0x3e,0x3f,0x44,0x4a):
            self.assertNotEqual(w.revision(BASE),w.revision({**BASE,a:BASE[a]^0x40}))

    def test_explicit_effect_reselection_activates_once_after_live_off(self):
        memory=Sim();effect=w.decode(BASE)['lighting']['effect']
        result=w.handle('apply',{'expected_revision':w.revision(BASE),'changes':{'lighting':{'effect':effect}}},memory,None)
        self.assertEqual(result['status'],'written-readback')
        self.assertEqual(memory.finalizations,1);self.assertEqual(memory.writes,[])
        memory=Sim();memory.finalize=mock.Mock(side_effect=w.DeviceError('failed'))
        with self.assertRaisesRegex(w.DeviceError,'activation could not be confirmed'):
            w.handle('apply',{'expected_revision':w.revision(BASE),'changes':{'lighting':{'effect':effect}}},memory,None)
        memory.finalize.assert_called_once()


if __name__=='__main__':unittest.main()
