import fcntl
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from vm_network import VBoxManageNIC, run, write_json


class NetworkCaptureTests(unittest.TestCase):
    @patch("vm_network.subprocess.run")
    def test_vboxmanage_inspection_and_fixed_commands(self, command):
        command.return_value = Mock(returncode=0, stdout="State: running (since now)\nNIC 1: MAC: 080027000001, Attachment: NAT, Cable connected: on, Trace: off (file: none), Type: 82540EM, Reported speed: 0 Mbps\n")
        nic = VBoxManageNIC("Test VM", 1)
        self.assertEqual(nic.inspect(), dict(running=True, enabled=True, trace=False, file=""))
        self.assertEqual(command.call_args.args[0], ["VBoxManage", "showvminfo", "Test VM"])
        self.assertEqual(command.call_args.kwargs["env"]["LC_ALL"], "C")
        nic.set_file("/tmp/my trace.pcap")
        self.assertEqual(command.call_args.args[0], ["VBoxManage", "controlvm", "Test VM", "nictracefile1", "/tmp/my trace.pcap"])
        nic.set_enabled(True)
        self.assertEqual(command.call_args.args[0], ["VBoxManage", "controlvm", "Test VM", "nictrace1", "on"])

    @patch("vm_network.subprocess.run")
    def test_cli_failures_preserve_diagnostics(self, command):
        command.return_value = Mock(returncode=1, stdout="", stderr="VBoxManage: configured VM is unavailable")
        with self.assertRaisesRegex(RuntimeError, "configured VM is unavailable"):
            VBoxManageNIC("Test VM", 1).inspect()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.info = dict(running=True, enabled=True, trace=False, file="/tmp/original-trace.pcap")
        self.nic = Mock()
        self.nic.inspect.side_effect = lambda: dict(self.info)
        self.nic.set_enabled.side_effect = lambda value: self.info.update(trace=value)
        self.nic.set_file.side_effect = lambda value: self.info.update(file=value)

    def capture(self):
        run(self.nic, "capture", "Test VM", 1, self.directory, "trace-test.pcap", 1, os.getppid())

    @patch("vm_network.time.monotonic", side_effect=[0, 2])
    def test_duration_limit_restores_adapter_and_session(self, _clock):
        self.capture()
        self.assertFalse(self.info["trace"])
        self.assertEqual(self.info["file"], "/tmp/original-trace.pcap")
        self.assertFalse((self.directory / ".active.json").exists())
        saved = json.loads((self.directory / "trace-test.pcap.json").read_text())
        self.assertEqual(saved["reason"], "duration limit")
        self.assertEqual(saved["vm"], "Test VM")
        self.nic.set_enabled.assert_any_call(True)
        self.nic.set_enabled.assert_any_call(False)

    def test_stop_marker(self):
        (self.directory / "trace-test.pcap.stop").touch()
        self.capture()
        saved = json.loads((self.directory / "trace-test.pcap.json").read_text())
        self.assertEqual(saved["reason"], "stopped by user")
        self.assertFalse(self.info["trace"])

    @patch("vm_network.time.sleep", side_effect=KeyboardInterrupt)
    def test_parent_exit_cleanup(self, _sleep):
        self.capture()
        self.assertFalse(self.info["trace"])
        self.assertEqual(self.info["file"], "/tmp/original-trace.pcap")
        self.assertFalse((self.directory / ".active.json").exists())

    def test_existing_external_trace_is_preserved(self):
        self.info["trace"] = True
        with self.assertRaisesRegex(RuntimeError, "trace already exists"):
            self.capture()
        self.assertTrue(self.info["trace"])
        self.assertEqual(self.info["file"], "/tmp/original-trace.pcap")
        self.assertFalse((self.directory / ".active.json").exists())

    def test_cross_process_lock(self):
        with (self.directory / ".capture.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                self.capture()
        self.nic.inspect.assert_not_called()

    def test_recover_owned_capture(self):
        state = {"vm": "Test VM", "adapter": 1, "filename": "trace-test.pcap", "previous_file": "/tmp/original-trace.pcap", "name": "02 Unchanged Apply", "notes": "No settings changed."}
        write_json(self.directory / ".active.json", state)
        self.info["trace"] = True
        self.info["file"] = str(self.directory / "trace-test.pcap")
        run(self.nic, "recover", "Test VM", 1, self.directory, "", 0, os.getppid())
        self.assertFalse(self.info["trace"])
        self.assertEqual(self.info["file"], "/tmp/original-trace.pcap")
        self.assertFalse((self.directory / ".active.json").exists())

        saved = json.loads((self.directory / "trace-test.pcap.json").read_text())
        self.assertEqual(saved["name"], state["name"])
        self.assertEqual(saved["notes"], state["notes"])

    def test_recovery_preserves_changed_external_trace(self):
        state = {"vm": "Test VM", "adapter": 1, "filename": "trace-test.pcap", "previous_file": "/tmp/prior.pcap"}
        write_json(self.directory / ".active.json", state)
        self.info["trace"] = True
        self.info["file"] = "/tmp/some-other-trace.pcap"
        with self.assertRaisesRegex(RuntimeError, "changed externally"):
            run(self.nic, "recover", "Test VM", 1, self.directory, "", 0, os.getppid())
        self.assertTrue(self.info["trace"])
        self.assertEqual(self.info["file"], "/tmp/some-other-trace.pcap")
        self.assertTrue((self.directory / ".active.json").exists())


if __name__ == "__main__":
    unittest.main()
