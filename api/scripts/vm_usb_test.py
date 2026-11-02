import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from vm_network import VBoxManageUSB, run_usb

UUID = '01234567-1234-1234-1234-0123456789ab'


class USBCaptureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.usb = Mock()
        self.usb.device.return_value = {'UUID': UUID, 'Current State': 'Captured'}
        self.usb.attached.return_value = True

    def capture(self):
        run_usb(self.usb, 'capture', 'Test VM', 1, self.directory, 'trace-usb.pcapng', 1, os.getppid())

    @patch('vm_network.time.monotonic', side_effect=[0, 2])
    def test_bounded_capture_restores_and_keeps_metadata(self, _clock):
        self.capture()
        self.usb.command.assert_any_call('controlvm', 'Test VM', 'usbdetach', UUID)
        self.usb.command.assert_any_call('controlvm', 'Test VM', 'usbattach', UUID, '--capturefile', str(self.directory/'trace-usb.pcapng'))
        self.usb.restore.assert_called_once()
        state = self.usb.restore.call_args.args[0]
        self.assertTrue(state['previous_attached'])
        self.assertEqual(state['source'], 'usb')
        self.assertFalse((self.directory/'.active.json').exists())
        self.assertEqual(json.loads((self.directory/'trace-usb.pcapng.json').read_text())['reason'], 'duration limit')

    def test_other_vm_and_host_devices_are_never_taken(self):
        self.usb.attached.return_value = False
        with self.assertRaisesRegex(RuntimeError, 'another VM'):
            self.capture()
        self.usb.device.return_value['Current State'] = 'Available'
        with self.assertRaisesRegex(RuntimeError, 'Devices > USB'):
            self.capture()
        self.usb.command.assert_not_called()
        self.usb.restore.assert_not_called()
        self.assertFalse((self.directory/'.active.json').exists())

    def test_start_failure_restores_and_preserves_error(self):
        self.usb.command.side_effect = RuntimeError('USB controller unavailable')
        with self.assertRaisesRegex(RuntimeError, 'USB controller unavailable'):
            self.capture()
        self.usb.restore.assert_called_once()
        state = json.loads((self.directory/'trace-usb.pcapng.json').read_text())
        self.assertEqual(state['status'], 'failed')
        self.assertFalse((self.directory/'.active.json').exists())

    @patch('vm_network.time.monotonic', side_effect=[0, 2])
    @patch.dict(os.environ, {'SCREENDROP_RECORDING': '{"name":"01 Startup","notes":"No Apply."}'})
    def test_cleanup_failure_keeps_recovery_record(self, _clock):
        self.usb.restore.side_effect = RuntimeError('VM unavailable during restore')
        with self.assertRaisesRegex(RuntimeError, 'VM unavailable during restore'):
            self.capture()
        state = json.loads((self.directory/'.active.json').read_text())
        self.assertEqual(state['status'], 'cleanup_error')
        self.assertEqual(state['usb_uuid'], UUID)
        self.usb.restore.side_effect = None
        run_usb(self.usb, 'recover', 'Test VM', 1, self.directory, 'trace-usb.pcapng', 0, os.getppid())
        self.assertFalse((self.directory/'.active.json').exists())
        saved = json.loads((self.directory/'trace-usb.pcapng.json').read_text())
        self.assertEqual(saved['name'], '01 Startup')
        self.assertEqual(saved['notes'], 'No Apply.')

    @patch('vm_network.subprocess.run')
    def test_device_selection_and_attachment_parse(self, command):
        usb = VBoxManageUSB('Test VM', 1)
        listing = f'''Host USB Devices:

UUID:               {UUID}
VendorId:           0x30fa (30FA)
ProductId:          0x1440 (1440)
Product:            FANTECH-X16v2
Current State:      Captured
'''
        command.side_effect = [Mock(returncode=0, stdout='State: running\n', stderr=''), Mock(returncode=0, stdout=listing, stderr='')]
        self.assertEqual(usb.device()['UUID'], UUID)
        command.side_effect = None
        command.return_value = Mock(returncode=0, stderr='')
        command.return_value.stdout = f'''State: running (since now)
USB Device Filters:
UUID: other-filter
Currently attached USB devices:

UUID: other-device
VendorId: 0x1111

UUID: {UUID}
VendorId: 0x30fa

Bandwidth groups: <none>
'''
        self.assertTrue(usb.attached(UUID))
        command.return_value.stdout = f'State: running\nUSB Device Filters:\nUUID: {UUID}\nCurrently attached USB devices:\n<none>\n'
        self.assertFalse(usb.attached(UUID))

    @patch('vm_network.subprocess.run')
    def test_wrong_vm_is_reported_before_usb_lookup(self, command):
        command.return_value = Mock(returncode=1, stdout='', stderr='Could not find a registered machine named Win !0')
        with self.assertRaisesRegex(RuntimeError, 'registered machine'):
            VBoxManageUSB('Win !0', 1).device()
        self.assertEqual(command.call_count, 1)
        self.assertEqual(command.call_args.args[0], ['VBoxManage', 'showvminfo', 'Win !0'])

    @patch('vm_network.subprocess.run')
    def test_saved_vm_is_reported_before_usb_lookup(self, command):
        command.return_value = Mock(returncode=0, stdout='State: saved (since now)\n', stderr='')
        with self.assertRaisesRegex(RuntimeError, 'VM_NAME'):
            VBoxManageUSB('Test VM', 1).device()
        self.assertEqual(command.call_count, 1)

    @patch('vm_network.subprocess.run')
    def test_empty_usb_list_preserves_permission_warning(self, command):
        command.side_effect = [Mock(returncode=0, stdout='State: running\n', stderr=''),
                               Mock(returncode=0, stdout='Host USB Devices:\n<none>\n', stderr="VirtualBox is not currently allowed to access USB devices; add user to vboxusers")]
        with self.assertRaisesRegex(RuntimeError, 'vboxusers'):
            VBoxManageUSB('Test VM', 1).device()

    def test_restore_reattaches_without_capture(self):
        usb = VBoxManageUSB('Test VM', 1)
        usb.attached = Mock(return_value=True)
        usb.command = Mock()
        usb.restore(dict(usb_uuid=UUID, previous_attached=True))
        self.assertEqual(usb.command.call_args_list[0].args, ('controlvm', 'Test VM', 'usbdetach', UUID))
        self.assertEqual(usb.command.call_args_list[1].args, ('controlvm', 'Test VM', 'usbattach', UUID))


if __name__ == '__main__':
    unittest.main()
