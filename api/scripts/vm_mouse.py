"""VirtualBox SDK mouse bridge. Coordinates from Go are zero-based pixels."""
import sys
import time


def send_mouse(manager, vm, action, x, y, button, clicks, wheel):
    machine = manager.vbox.findMachine(vm)
    session = manager.openMachineSession(machine, True)
    try:
        mouse = session.console.mouse
        if not mouse.absoluteSupported:
            raise RuntimeError("The guest does not support absolute pointing. Configure a USB Tablet pointing device or install Guest Additions.")
        # The SDK uses one-based display coordinates. Always release all buttons.
        x, y = x + 1, y + 1
        try:
            mouse.putMouseEventAbsolute(x, y, wheel if action == "scroll" else 0, 0, 0)
            if action == "click":
                mask = {"left": 1, "right": 2, "middle": 4}[button]
                for index in range(clicks):
                    mouse.putMouseEventAbsolute(x, y, 0, 0, mask)
                    time.sleep(0.04)
                    mouse.putMouseEventAbsolute(x, y, 0, 0, 0)
                    if index + 1 < clicks:
                        time.sleep(0.08)
        finally:
            mouse.putMouseEventAbsolute(x, y, 0, 0, 0)
    finally:
        manager.closeMachineSession(session)


if __name__ == "__main__":
    try:
        from vboxapi import VirtualBoxManager
        manager = VirtualBoxManager(None, None)
        try:
            vm, action, x, y, button, clicks, wheel = sys.argv[1:]
            send_mouse(manager, vm, action, int(x), int(y), button, int(clicks), int(wheel))
        finally:
            manager.deinit()
    except (Exception, KeyboardInterrupt) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
