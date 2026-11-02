(() => {
  const element = (id) => document.getElementById(`network-${id}`);
  const captures = element('captures');
  const filter = element('filter');
  const follow = element('follow');
  const source = element('source');
  const errorBox = element('error');
  const presets = {
    usb: [['Control / configuration', 'usb.transfer_type == 0x02'], ['USB / HID', 'usb || usbhid'], ['HID only', 'usbhid'], ['Interrupt reports', 'usb.transfer_type == 0x01'], ['Bulk / vendor data', 'usb.transfer_type == 0x03'], ['All protocols', '']],
    network: [['Common protocols', 'dns || tcp || udp || icmp || icmpv6 || arp'], ['DNS', 'dns'], ['TCP', 'tcp'], ['UDP', 'udp'], ['HTTP', 'http || http2'], ['TLS', 'tls'], ['ICMP', 'icmp || icmpv6'], ['ARP', 'arp'], ['All protocols', '']],
  };
  let state;
  let offset = 0;
  let cursor = 0;
  let rows = [];
  let backlog = false;
  let mutating = false;
  let ticking = false;
  let packetRequest;
  let generation = 0;

  function captureError(title, message) {
    element('capture-error-title').textContent = title;
    element('capture-error-detail').textContent = message;
    element('capture-error').hidden = false;
  }

  async function request(path, options = {}) {
    const response = await fetch(path, { ...options, signal: options.signal || AbortSignal.timeout(20000) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || `Request failed (${response.status})`);
    return value;
  }

  function captureButtons() {
    element('start').disabled = mutating || !state || Boolean(state.active);
    element('stop').disabled = mutating || !state?.active;
    element('duration').disabled = mutating || Boolean(state?.active);
    element('name').disabled = mutating || Boolean(state?.active);
    element('notes').disabled = mutating || Boolean(state?.active);
    source.disabled = mutating || Boolean(state?.active);
    element('apply').disabled = !captures.value || !state?.decoder;
  }

  function updatePresets(reset = false) {
    const box = element('presets');
    box.replaceChildren();
    if (reset) filter.value = presets[source.value][0][1];
    for (const [label, value] of presets[source.value]) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label; button.dataset.networkFilter = value;
      button.className = 'protocol-filter';
      button.setAttribute('aria-pressed', String(filter.value === value));
      button.addEventListener('click', () => { filter.value = value; updatePresets(); resetPackets(); loadPackets(); });
      box.append(button);
    }
    element('source-note').textContent = source.value === 'usb'
      ? `Mouse ${state?.usb_target || '30fa:1440'} · Pass it through using VirtualBox Devices → USB first. Start/Stop briefly reconnects it inside the VM; no mouse settings are written.`
      : `Records only ${state?.vm || 'this VM'} network adapter ${state?.adapter || 1}. This source cannot see USB/HID transfers.`;
    element('filter-note').textContent = source.value === 'usb'
      ? 'Control transfers are selected by default to focus on driver configuration. Choose USB / HID for all USB transfers, including movement. HID decoding needs descriptors; control transfers remain visible even when HID is undecoded.'
      : 'Common protocols are selected by default. Choose an individual protocol or enter a Wireshark display filter. Other protocols stay hidden unless you choose All protocols.';
  }

  function downloadLink() {
    const link = element('download');
    link.hidden = !captures.value || state?.active?.filename === captures.value;
    if (!link.hidden) { link.href = `/network/captures/${encodeURIComponent(captures.value)}`; link.download = captures.value; }
    else link.removeAttribute('href');
    const selected = [state?.active, ...(state?.captures || [])].find((item) => item?.filename === captures.value);
    element('recording-details').hidden = !selected;
    element('recording-name').textContent = selected?.name || selected?.filename || '';
    element('recording-notes').textContent = selected?.notes || 'No notes recorded.';
    element('recording-file').textContent = selected ? `${selected.filename} · Metadata: ${selected.filename}.json` : '';
    captureButtons();
  }

  function resetPackets() {
    generation++;
    packetRequest?.abort(); packetRequest = null;
    offset = 0; cursor = 0; rows = []; backlog = false;
    element('packets').replaceChildren();
    element('previous').disabled = true; element('next').disabled = true;
  }

  function showStatus(value) {
    const previouslyActive = state?.active?.filename;
    const selected = captures.value;
    state = value;
    element('state').textContent = state.active ? (state.active.status === 'cleanup_error' ? 'Cleanup needed' : 'Recording · live') : 'Idle';
    element('decoder').textContent = state.decoder ? 'Wireshark sharkd available' : 'Install Wireshark sharkd to inspect packets';
    if (state.active) {
      const remaining = Math.max(0, Math.ceil(state.active.deadline - Date.now() / 1000));
      element('status').textContent = `${state.active.name || state.active.filename} · ${state.active.source === 'usb' ? 'USB mouse' : 'VM network'} · ${(state.active.bytes / 1024).toFixed(0)} KB · ${remaining}s remaining.`;
      if (state.active.status === 'cleanup_error') captureError('Capture needs cleanup', `${state.active.reason}. Use Stop / recover after checking the VM.`);
    } else element('status').textContent = state.captures.length ? `${state.captures.length} saved file(s). Latest: ${state.captures[0].reason || 'saved capture'}.` : 'Ready. No captures have been started.';
    const available = [...(state.active ? [state.active] : []), ...state.captures];
    const names = available.map((capture) => capture.filename);
    if (JSON.stringify([...captures.options].map((option) => option.value).filter(Boolean)) !== JSON.stringify(names)) {
      captures.replaceChildren();
      captures.add(new Option(available.length ? 'Choose a capture' : 'No captures yet', ''));
      for (const capture of available) {
        const date = new Date(capture.started * 1000).toLocaleString();
        const kind = capture.source === 'usb' || capture.filename.endsWith('.pcapng') ? 'USB' : 'Network';
        captures.add(new Option(`${capture.filename === state.active?.filename ? '● LIVE · ' : ''}${capture.name || capture.filename} · ${kind} · ${date}`, capture.filename));
      }
    }
    if (state.active && state.active.filename !== previouslyActive && follow.checked) captures.value = state.active.filename;
    else if (names.includes(selected)) captures.value = selected;
    else if (!selected && source.value === 'usb') captures.value = available.find((capture) => capture.source === 'usb' || capture.filename.endsWith('.pcapng'))?.filename || '';
    for (const option of captures.options) {
      if (!option.value) continue;
      const isLive = option.value === state.active?.filename;
      const label = option.textContent.replace(/^● LIVE · /, '');
      option.textContent = (isLive ? '● LIVE · ' : '') + label;
    }
    if (captures.value !== selected) {
      const capture = available.find((item) => item.filename === captures.value);
      source.value = capture?.source || (capture?.filename.endsWith('.pcapng') ? 'usb' : 'network');
      updatePresets(true); resetPackets();
    }
    if (previouslyActive && !state.active) {
      const finished = state.captures.find((item) => item.filename === previouslyActive);
      if (finished?.status === 'failed') captureError('Capture worker stopped', finished.reason);
      if (selected === previouslyActive) backlog = true; // Drain the final frames after the writer closes.
    }
    downloadLink();
  }

  async function refreshStatus() {
    try { showStatus(await request('/api/network')); }
    catch (error) { captureError('Couldn’t check capture status', error.message); }
  }

  async function changeCapture(action) {
    if (mutating) return;
    if (action === 'start') {
      element('name').setCustomValidity(element('name').value.trim() ? '' : 'Give this recording a name.');
      if (!element('capture-form').reportValidity()) return;
    }
    mutating = true; captureButtons();
    element('capture-error').hidden = true;
    element(action === 'start' ? 'start' : 'stop').textContent = action === 'start' ? 'Starting…' : 'Stopping…';
    if (action === 'start') follow.checked = true;
    try {
      showStatus(await request(`/api/network/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-VM-Network': 'true' },
        body: JSON.stringify({ duration_seconds: Number(element('duration').value), source: source.value, name: element('name').value.trim(), notes: element('notes').value.trim() }),
      }));
      await loadPackets();
    } catch (error) { captureError(action === 'start' ? 'Couldn’t start capture' : 'Couldn’t stop capture', error.message); await refreshStatus(); }
    finally { mutating = false; element('start').textContent = 'Start capture'; element('stop').textContent = 'Stop / recover'; captureButtons(); }
  }

  function packetColor(packet) {
    const protocol = (packet.c[4] || '').toUpperCase();
    const info = packet.c[6] || '';
    if (/USB/.test(protocol) && /CONTROL|(?:GET|SET)[ _](?:REPORT|DESCRIPTOR|CONFIGURATION|INTERFACE|IDLE|PROTOCOL)/i.test(info)) return 'control';
    if (/HID/.test(protocol)) return 'hid';
    if (/USB/.test(protocol)) return 'usb';
    if (/DNS/.test(protocol)) return 'dns';
    if (/HTTP/.test(protocol)) return 'http';
    if (/TLS|SSL|QUIC/.test(protocol)) return 'tls';
    if (/TCP/.test(protocol)) return 'tcp';
    if (/UDP|DHCP/.test(protocol)) return 'udp';
    if (/ICMP|ARP/.test(protocol)) return 'icmp';
    return 'other';
  }

  function renderRows() {
    const scroll = element('packet-scroll');
    const atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 60;
    const body = element('packets'); body.replaceChildren();
    for (const packet of rows) {
      const row = document.createElement('tr');
      row.className = `packet-row packet-${packetColor(packet)}`;
      for (const column of packet.c) {
        const cell = document.createElement('td'); cell.className = 'max-w-md break-words px-4 py-3 font-mono text-[11px]';
        cell.textContent = column; row.append(cell);
      }
      body.append(row);
    }
    if (!rows.length) {
      const row = document.createElement('tr'); const cell = document.createElement('td');
      cell.colSpan = 7; cell.className = 'px-4 py-10 text-center text-muted';
      cell.textContent = state?.active?.filename === captures.value ? 'Waiting for matching packets… Live updates every second.' : 'No packets match this filter. USB/HID traffic requires a USB capture source.';
      row.append(cell); body.append(row);
    }
    if (follow.checked && atBottom) scroll.scrollTop = scroll.scrollHeight;
  }

  async function loadPackets() {
    if (packetRequest || !captures.value || !state?.decoder) return;
    const controller = new AbortController(); packetRequest = controller;
    const version = generation;
    errorBox.textContent = '';
    const live = follow.checked;
    const params = new URLSearchParams({ file: captures.value, filter: filter.value, offset: String(live ? 0 : offset), limit: live ? '200' : '100', since: String(live ? cursor : 0) });
    try {
      const result = await request(`/api/network/packets?${params}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
      if (version !== generation) return;
      const received = result.packets || [];
      rows = live ? [...rows, ...received].slice(-200) : received;
      cursor = result.cursor || received.at(-1)?.num || cursor;
      backlog = Boolean(result.more);
      renderRows();
      element('summary').textContent = `${result.total_packets} packets captured · ${Math.max(0, result.last - result.first).toFixed(2)}s · ${live ? 'Live view · latest' : 'Showing'} ${rows.length} matching packets${result.live ? ' · updated ' + new Date().toLocaleTimeString() : ''}.`;
      const protocols = element('protocols'); protocols.replaceChildren();
      for (const name of result.protocols || []) { const label = document.createElement('span'); label.className = 'rounded-md bg-paper px-2 py-1 font-mono text-[10px] text-muted'; label.textContent = name; protocols.append(label); }
      element('page-label').textContent = live ? (backlog ? 'Catching up · latest 200 matching rows kept' : 'Live follow · latest 200 matching rows kept') : `Matching packets ${rows.length ? offset + 1 : 0}–${offset + rows.length}`;
      element('previous').disabled = live || offset === 0;
      element('next').disabled = live || !result.more;
    } catch (error) {
      if (version !== generation || error.name === 'AbortError') return;
      errorBox.textContent = error.message;
      element('summary').textContent = 'Couldn’t load packets. Live capture will retry in one second.';
    } finally { if (packetRequest === controller) packetRequest = null; }
  }

  element('capture-form').addEventListener('submit', (event) => { event.preventDefault(); changeCapture('start'); });
  element('name').addEventListener('input', () => element('name').setCustomValidity(''));
  element('stop').addEventListener('click', () => changeCapture('stop'));
  element('refresh').addEventListener('click', async () => { await refreshStatus(); resetPackets(); loadPackets(); });
  source.addEventListener('change', () => { updatePresets(true); resetPackets(); loadPackets(); });
  captures.addEventListener('change', () => {
    const selected = [state?.active, ...(state?.captures || [])].find((item) => item?.filename === captures.value);
    source.value = selected?.source || (captures.value.endsWith('.pcapng') ? 'usb' : 'network');
    updatePresets(true); resetPackets(); downloadLink(); loadPackets();
  });
  follow.addEventListener('change', () => { resetPackets(); loadPackets(); });
  element('filter-form').addEventListener('submit', (event) => { event.preventDefault(); updatePresets(); resetPackets(); loadPackets(); });
  element('previous').addEventListener('click', () => { offset = Math.max(0, offset - 100); loadPackets(); });
  element('next').addEventListener('click', () => { offset += 100; loadPackets(); });
  updatePresets();
  refreshStatus().then(loadPackets);
  setInterval(async () => {
    if (ticking || mutating || document.hidden) return;
    ticking = true;
    try {
      await refreshStatus();
      if (follow.checked && (state?.active?.filename === captures.value || backlog || (!rows.length && cursor === 0))) await loadPackets();
    } finally { ticking = false; }
  }, 1000);
})();
