import json
from pathlib import Path
import tempfile
import unittest
from worker_test import w, BASE, Sim

class AdvancedTests(unittest.TestCase):
    def test_recording26_words_and_all_bounded_intermediate_values(self):
        for value in range(8,301):
            after=w.merge(BASE,{'double_click_ms':value})
            self.assertEqual(w.decode(after)['double_click_ms'],value)
            self.assertTrue(all(after[a]==BASE[a] for a in BASE if a not in (0x1a,0x1b)))
        for value,expected in [(300,[0x2c,1]),(150,[0x96,0]),(8,[8,0]),(50,[50,0])]:
            after=w.merge(BASE,{'double_click_ms':value})
            self.assertEqual([after[0x1a],after[0x1b]],expected)
        for bad in [0,7,301,True,150.5,'150']:
            with self.assertRaises(ValueError):w.merge(BASE,{'double_click_ms':bad})

    def test_timing_revision_rollback_and_word_restore_across_255(self):
        before=w.merge(BASE,{'double_click_ms':50});after=w.merge(before,{'double_click_ms':150})
        self.assertNotEqual(w.revision(before),w.revision(after))
        with tempfile.TemporaryDirectory() as directory:
            backup=Path(directory)/'backup.json';memory=Sim(before)
            w.handle('apply',{'expected_revision':w.revision(before),'changes':{'double_click_ms':150}},memory,backup)
            memory.image.update({0x1a:0x2c,0x1b:1}) # Later timing crosses the high byte boundary.
            w.handle('restore',{'expected_revision':w.revision(memory.image)},memory,backup)
            self.assertEqual(w.decode(memory.image)['double_click_ms'],50)
        memory=Sim(before,fail_on=1)
        with self.assertRaisesRegex(w.DeviceError,'original settings were restored'):
            w.transact(memory,before,w.merge(before,{'double_click_ms':300}))
        self.assertEqual(memory.image,before)

    def test_version2_lighting_backup_preserves_new_timing(self):
        with tempfile.TemporaryDirectory() as directory:
            backup=Path(directory)/'backup.json';before=w.merge(BASE,{'double_click_ms':150});after=w.merge(before,{'polling':500})
            w.save_backup(backup,before,after);data=json.loads(backup.read_text());data['version']=2
            for name in ['before','after']:
                for a in (0x1a,0x1b):del data[name][str(a)]
            backup.write_text(json.dumps(data));memory=Sim(w.merge(after,{'double_click_ms':300}))
            w.handle('restore',{'expected_revision':w.revision(memory.image)},memory,backup)
            self.assertEqual(w.decode(memory.image)['double_click_ms'],300)
            self.assertEqual(w.decode(memory.image)['polling'],1000)

if __name__=='__main__':unittest.main()
