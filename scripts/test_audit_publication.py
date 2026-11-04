"""Integration checks for the publication guard, using isolated Git indexes."""

from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


class PublicationAuditTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / 'scripts').mkdir()
        shutil.copyfile(Path(__file__).with_name('audit-publication.py'),
                        self.root / 'scripts/audit-publication.py')
        self.git('init', '--quiet')

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.root), *args], stderr=subprocess.DEVNULL)

    def audit(self):
        return subprocess.run([sys.executable, str(self.root / 'scripts/audit-publication.py')],
                              text=True, capture_output=True, check=False)

    def test_clean_tree_and_stage_pass(self):
        (self.root / 'README.md').write_text('Public project documentation.\n')
        self.git('add', '.')
        self.assertEqual(self.audit().returncode, 0)

    def test_staged_secret_cannot_be_hidden_by_clean_working_file(self):
        secret = 'ghp_' + 'A' * 36
        path = self.root / 'settings.txt'
        path.write_text(secret)
        self.git('add', 'settings.txt')
        path.write_text('Removed from working file.\n')
        result = self.audit()
        self.assertEqual(result.returncode, 1)
        self.assertIn('settings.txt (staged):1: GitHub token', result.stdout)
        self.assertNotIn(secret, result.stdout + result.stderr)

    def test_ignored_but_tracked_configuration_fails(self):
        (self.root / '.gitignore').write_text('.env\n')
        (self.root / '.env').write_text('CONFIG=value\n')
        self.git('add', '-f', '.env')
        self.assertIn('tracked despite ignore rules', self.audit().stdout)

    def test_symlinks_and_raw_capture_paths_fail(self):
        (self.root / 'captures').mkdir()
        (self.root / 'captures/recording.pcapng').write_bytes(b'capture')
        (self.root / 'external-link').symlink_to('/etc/hostname')
        result = self.audit()
        self.assertEqual(result.returncode, 1)
        self.assertIn('private/generated path is publishable', result.stdout)
        self.assertIn('symlink needs explicit review', result.stdout)

    def test_analysis_mappings_are_allowed_but_device_backups_are_rejected(self):
        analysis = self.root / 'api/analysis'
        analysis.mkdir(parents=True)
        (analysis / 'dpi-mapping.json').write_text('{"device": "30fa:1440"}\n')
        self.assertEqual(self.audit().returncode, 0)
        (analysis / 'rapid-fire-previous-backup.json').write_text('{}\n')
        result = self.audit()
        self.assertEqual(result.returncode, 1)
        self.assertIn('rapid-fire-previous-backup.json: private/generated path', result.stdout)

    def test_filtered_trace_reports_are_allowed_but_raw_comparisons_are_rejected(self):
        analysis = self.root / 'api/analysis'
        analysis.mkdir(parents=True)
        (analysis / 'trace-01-startup.md').write_text('# Startup findings\n')
        (analysis / 'trace-01-startup.json').write_text('{"report_id": 7}\n')
        self.assertEqual(self.audit().returncode, 0)
        (analysis / 'advanced-controls-raw-comparison.json').write_text('{}\n')
        result = self.audit()
        self.assertEqual(result.returncode, 1)
        self.assertIn('advanced-controls-raw-comparison.json: private/generated path', result.stdout)


if __name__ == '__main__':
    unittest.main()
