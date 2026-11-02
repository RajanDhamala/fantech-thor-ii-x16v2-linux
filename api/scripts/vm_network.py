"""Bounded capture of a VM adapter or an already-passed-through physical mouse."""
import ctypes
import fcntl
import json
import os
from pathlib import Path
import signal
import re
import subprocess
import sys
import time


def write_json(path, value):
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value), encoding="utf-8")
    os.chmod(temp, 0o600)
    os.replace(temp, path)


def interrupt(_signal, _frame):
    raise KeyboardInterrupt()


def recording_metadata():
    details = json.loads(os.environ.get("SCREENDROP_RECORDING", "{}"))
    return {key: details[key] for key in ("name", "notes") if key in details}


class VBoxManageNIC:
    def __init__(self, vm, adapter):
        self.vm = vm
        self.adapter = adapter

    def command(self, *args):
        result = subprocess.run(["VBoxManage", *args], capture_output=True, text=True,
                                timeout=5, env=dict(os.environ, LC_ALL="C", LANG="C"))
        if result.returncode:
            detail = (result.stderr or result.stdout).strip()
            raise RuntimeError(detail or f"VBoxManage exited with status {result.returncode}")
        # VBoxManage can return success with an empty USB list while explaining
        # missing USB permissions on stderr. Keep that actionable diagnostic.
        if args == ("list", "usbhost") and "not currently allowed to access USB" in result.stderr:
            raise RuntimeError(result.stderr.strip())
        return result.stdout

    def inspect(self):
        output = self.command("showvminfo", self.vm)
        state = re.search(r"^State:\s+(\w+)", output, re.MULTILINE)
        adapter = re.search(rf"^NIC {self.adapter}:\s+(.*)$", output, re.MULTILINE)
        if not state or not adapter:
            raise RuntimeError("Could not read VM state and adapter information from VBoxManage.")
        if adapter.group(1).startswith("disabled"):
            return dict(running=state.group(1) == "running", enabled=False, trace=False, file="")
        trace = re.search(r"Trace:\s+(on|off) \(file: (.*?)\), Type:", adapter.group(1))
        if not trace:
            raise RuntimeError("Could not read adapter tracing information from VBoxManage.")
        return dict(running=state.group(1) == "running", enabled=True,
                    trace=trace.group(1) == "on", file="" if trace.group(2) == "none" else trace.group(2))

    def set_file(self, path):
        self.command("controlvm", self.vm, f"nictracefile{self.adapter}", path)

    def set_enabled(self, enabled):
        self.command("controlvm", self.vm, f"nictrace{self.adapter}", "on" if enabled else "off")


class VBoxManageUSB(VBoxManageNIC):
    """Record exactly one configured physical device, never the virtual cursor."""
    def vm_info(self):
        output = self.command("showvminfo", self.vm)
        state = re.search(r"^State:\s+(\w+)", output, re.MULTILINE)
        if not state:
            raise RuntimeError(f"Could not read state for VM {self.vm!r}.")
        if state.group(1) != "running":
            raise RuntimeError(f"Configured VM {self.vm!r} is {state.group(1)}, not running. Check VM_NAME against VBoxManage list runningvms.")
        return output

    def device(self):
        # Validate the configured VM before inspecting USB, so a renamed VM or
        # wrong VirtualBox session cannot be disguised as a missing mouse.
        self.vm_info()
        vendor = os.environ.get("VM_USB_VENDOR", "30fa").lower()
        product = os.environ.get("VM_USB_PRODUCT", "1440").lower()
        if not re.fullmatch(r"[0-9a-f]{4}", vendor) or not re.fullmatch(r"[0-9a-f]{4}", product):
            raise RuntimeError("VM_USB_VENDOR and VM_USB_PRODUCT must be four hex digits.")
        matches = []
        for block in re.split(r"\n\s*\n", self.command("list", "usbhost")):
            fields = dict(re.findall(r"^([^:\n]+):\s*(.*)$", block, re.MULTILINE))
            if (fields.get("VendorId", "").lower().startswith("0x" + vendor) and
                    fields.get("ProductId", "").lower().startswith("0x" + product)):
                matches.append(fields)
        if len(matches) != 1:
            raise RuntimeError(f"Expected exactly one physical USB mouse {vendor}:{product}; found {len(matches)}. Check USB passthrough and VirtualBox USB permissions.")
        device = matches[0]
        if not re.fullmatch(r"[0-9a-fA-F-]{36}", device.get("UUID", "")):
            raise RuntimeError("Could not read the USB device UUID.")
        return device

    def attached(self, uuid):
        output = self.vm_info()
        # Only the attached section counts; an enabled USB filter is not attachment.
        section = output.partition("Currently attached USB devices:")[2]
        return bool(section and re.search(r"^UUID:\s+" + re.escape(uuid) + r"\s*$", section, re.MULTILINE))

    def restore(self, state):
        uuid = state["usb_uuid"]
        if self.attached(uuid):
            self.command("controlvm", self.vm, "usbdetach", uuid)
        if state["previous_attached"]:
            self.command("controlvm", self.vm, "usbattach", uuid)


def run_usb(usb, mode, vm, adapter, directory, name, seconds, parent):
    directory = Path(directory)
    active_file = directory / ".active.json"
    with (directory / ".capture.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if mode == "recover":
            state = json.loads(active_file.read_text())
            if state.get("source") != "usb" or state["vm"] != vm or state["adapter"] != adapter or state["filename"] != name:
                raise RuntimeError("The active USB capture changed. Refresh before stopping it.")
            if Path(name).name != name or not name.startswith("trace-") or not name.endswith(".pcapng"):
                raise RuntimeError("Invalid saved USB capture state.")
            if not re.fullmatch(r"[0-9a-fA-F-]{36}", state.get("usb_uuid", "")):
                raise RuntimeError("Invalid saved USB device UUID.")
            usb.restore(state)
            state.update(status="stopped", reason="recovered", ended=time.time())
            write_json(directory / (name + ".json"), state)
            active_file.unlink()
            print(json.dumps({"status": "stopped"}), flush=True)
            return
        if active_file.exists():
            raise RuntimeError("A capture already exists. Stop or recover it first.")
        device = usb.device()
        uuid = device["UUID"]
        attached = usb.attached(uuid)
        if device.get("Current State", "").lower() == "captured" and not attached:
            raise RuntimeError("The USB mouse is captured by another VM; it will not be detached.")
        if not attached:
            raise RuntimeError("Attach the physical mouse to this VM using Devices > USB first. USB recording only reconnects a mouse already attached to this VM.")
        path = directory / name
        state = dict(source="usb", vm=vm, adapter=adapter, filename=name, usb_uuid=uuid,
                     previous_attached=attached, started=time.time(), deadline=time.time()+seconds,
                     status="recording")
        state.update(recording_metadata())
        write_json(active_file, state)
        reason, failed = "duration limit", False
        try:
            usb.command("controlvm", vm, "usbdetach", uuid)
            # VirtualBox 7.0's controlvm parser requires these as two arguments,
            # despite the --capturefile=filename spelling in its usage output.
            usb.command("controlvm", vm, "usbattach", uuid, "--capturefile", str(path))
            print(json.dumps({"status": "started"}), flush=True)
            deadline = time.monotonic()+seconds
            while time.monotonic() < deadline:
                if (directory / (name + ".stop")).exists():
                    reason = "stopped by user"
                    break
                if path.exists() and path.stat().st_size >= 20*1024*1024:
                    reason = "size limit"
                    break
                if os.getppid() != parent:
                    reason = "server exited"
                    break
                time.sleep(0.2)
        except KeyboardInterrupt:
            reason = "server exited"
        except Exception as error:
            failed, reason = True, "capture failed: " + str(error)
            raise
        finally:
            handlers = {sig: signal.getsignal(sig) for sig in (signal.SIGINT, signal.SIGTERM)}
            for sig in handlers:
                signal.signal(sig, signal.SIG_IGN)
            try:
                usb.restore(state)
                state.update(status="failed" if failed else "stopped", reason=reason, ended=time.time())
                write_json(directory / (name + ".json"), state)
                active_file.unlink(missing_ok=True)
                (directory / (name + ".stop")).unlink(missing_ok=True)
            except Exception as error:
                state.update(status="cleanup_error", reason=str(error))
                write_json(active_file, state)
                raise
            finally:
                for sig, handler in handlers.items():
                    signal.signal(sig, handler)


def run(nic, mode, vm, adapter, directory, name, seconds, parent):
    directory = Path(directory)
    active_file = directory / ".active.json"
    with (directory / ".capture.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        info = nic.inspect()
        if not info["running"]:
            raise RuntimeError("The configured VM must be running.")
        if mode == "recover":
            state = json.loads(active_file.read_text())
            if state["vm"] != vm or state["adapter"] != adapter:
                raise RuntimeError("Capture belongs to another VM or adapter.")
            if name and state["filename"] != name:
                raise RuntimeError("The active capture changed. Refresh status before stopping it.")
            name = state["filename"]
            if Path(name).name != name or not name.startswith("trace-") or not name.endswith(".pcap"):
                raise RuntimeError("Invalid saved capture state.")
            expected = str(directory / name)
            previous = state.get("previous_file", "")
            if info["file"] == expected:
                nic.set_enabled(False)
                nic.set_file(previous)
            elif info["trace"] or info["file"] != previous:
                raise RuntimeError("The adapter trace file changed externally. Recovery will not modify it.")
            state.update(status="stopped", reason="recovered", ended=time.time())
            write_json(directory / (name + ".json"), state)
            active_file.unlink()
            print(json.dumps({"status": "stopped"}), flush=True)
            return
        if active_file.exists() or info["trace"]:
            raise RuntimeError("A trace already exists. Stop or recover it before starting another capture.")
        if not info["enabled"]:
            raise RuntimeError("The configured network adapter is disabled.")
        previous = info["file"]
        path = directory / name
        state = {"source": "network", "vm": vm, "adapter": adapter, "filename": name, "started": time.time(),
                 "deadline": time.time() + seconds, "status": "recording", "previous_file": previous}
        state.update(recording_metadata())
        write_json(active_file, state)
        reason = "duration limit"
        failed = False
        try:
            nic.set_file(str(path))
            nic.set_enabled(True)
            print(json.dumps({"status": "started"}), flush=True)
            deadline = time.monotonic() + seconds
            while time.monotonic() < deadline:
                if (directory / (name + ".stop")).exists():
                    reason = "stopped by user"
                    break
                if path.exists() and path.stat().st_size >= 20 * 1024 * 1024:
                    reason = "size limit"
                    break
                if os.getppid() != parent:
                    reason = "server exited"
                    break
                time.sleep(0.2)
        except KeyboardInterrupt:
            reason = "server exited"
        except Exception as error:
            failed = True
            reason = "capture failed: " + str(error)
            raise
        finally:
            # Preserve a recovery record if disabling/restoring the trace fails.
            handlers = {sig: signal.getsignal(sig) for sig in (signal.SIGINT, signal.SIGTERM)}
            for sig in handlers:
                signal.signal(sig, signal.SIG_IGN)
            try:
                info = nic.inspect()
                if info["file"] == str(path):
                    nic.set_enabled(False)
                    nic.set_file(previous)
                elif info["trace"] or info["file"] != previous:
                    raise RuntimeError("The adapter trace file changed externally. Cleanup will not modify it.")
                state.update(status="failed" if failed else "stopped", reason=reason, ended=time.time())
                write_json(directory / (name + ".json"), state)
                active_file.unlink(missing_ok=True)
                (directory / (name + ".stop")).unlink(missing_ok=True)
            except Exception as error:
                state.update(status="cleanup_error", reason=str(error))
                write_json(active_file, state)
                raise
            finally:
                for sig, handler in handlers.items():
                    signal.signal(sig, handler)


if __name__ == "__main__":
    try:
        mode, vm, adapter, directory, name, seconds, parent, source = sys.argv[1:]
        signal.signal(signal.SIGINT, interrupt)
        signal.signal(signal.SIGTERM, interrupt)
        # Linux sends SIGTERM to this worker even if the Go parent is killed.
        libc = ctypes.CDLL(None, use_errno=True)
        if libc.prctl(1, signal.SIGTERM, 0, 0, 0) != 0:
            raise RuntimeError("Cannot enable capture cleanup on parent exit.")
        if os.getppid() != int(parent):
            raise RuntimeError("Capture parent exited before startup.")
        if source == "usb":
            run_usb(VBoxManageUSB(vm, int(adapter)), mode, vm, int(adapter), directory, name, int(seconds), int(parent))
        elif source == "network":
            run(VBoxManageNIC(vm, int(adapter)), mode, vm, int(adapter), directory, name, int(seconds), int(parent))
        else:
            raise RuntimeError("Capture source must be usb or network.")
    except (Exception, KeyboardInterrupt) as error:
        print(json.dumps({"error": str(error)}), flush=True)
        sys.exit(1)
