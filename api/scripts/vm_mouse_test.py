import unittest
from unittest.mock import Mock, call, patch

from vm_mouse import send_mouse


class MouseBridgeTests(unittest.TestCase):
    def manager(self):
        manager = Mock()
        session = manager.openMachineSession.return_value
        session.console.mouse.absoluteSupported = True
        return manager, session, session.console.mouse

    @patch("vm_mouse.time.sleep")
    def test_double_click_coordinates_and_release(self, _sleep):
        manager, session, mouse = self.manager()
        send_mouse(manager, "VM", "click", 0, 8, "right", 2, 0)
        manager.openMachineSession.assert_called_once_with(manager.vbox.findMachine.return_value, True)
        mouse.putMouseEventAbsolute.assert_has_calls([
            call(1, 9, 0, 0, 0), call(1, 9, 0, 0, 2), call(1, 9, 0, 0, 0),
            call(1, 9, 0, 0, 2), call(1, 9, 0, 0, 0), call(1, 9, 0, 0, 0),
        ])
        manager.closeMachineSession.assert_called_once_with(session)

    @patch("vm_mouse.time.sleep", side_effect=KeyboardInterrupt)
    def test_interruption_releases_buttons_and_session(self, _sleep):
        manager, session, mouse = self.manager()
        with self.assertRaises(KeyboardInterrupt):
            send_mouse(manager, "VM", "click", 4, 4, "left", 1, 0)
        self.assertEqual(mouse.putMouseEventAbsolute.call_args, call(5, 5, 0, 0, 0))
        manager.closeMachineSession.assert_called_once_with(session)

    def test_unsupported_pointing_closes_session_without_input(self):
        manager, session, mouse = self.manager()
        mouse.absoluteSupported = False
        with self.assertRaisesRegex(RuntimeError, "absolute pointing"):
            send_mouse(manager, "VM", "move", 0, 0, "left", 1, 0)
        mouse.putMouseEventAbsolute.assert_not_called()
        manager.closeMachineSession.assert_called_once_with(session)

    def test_scroll_direction(self):
        manager, _, mouse = self.manager()
        send_mouse(manager, "VM", "scroll", 2, 3, "left", 1, -3)
        self.assertEqual(mouse.putMouseEventAbsolute.call_args_list[0], call(3, 4, -3, 0, 0))


if __name__ == "__main__":
    unittest.main()
