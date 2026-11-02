const errorBox = document.getElementById('capture-error');
const preview = document.getElementById('capture-preview');
const dialog = document.getElementById('image-dialog');
const fullImage = document.getElementById('full-image');
const viewport = document.getElementById('slide-viewport');
const playButton = document.querySelector('[data-slide-play]');
const zoomButton = document.querySelector('[data-slide-zoom]');
let slides = [];
let slideIndex = 0;
let playTimer;
let zoomed = false;
const deleteDialog = document.getElementById('delete-dialog');
const deleteForm = document.getElementById('delete-form');
const deleteError = document.getElementById('delete-error');
let pendingDeletion;
let deleting = false;

function gallerySlides() {
  return Array.from(document.querySelectorAll('[data-gallery-image]'), (card) => ({
    url: card.dataset.url, filename: card.dataset.filename, captured: card.dataset.captured,
  }));
}

function updateSlideButtons() {
  for (const button of dialog.querySelectorAll('[data-slide-previous], [data-slide-next], [data-slide-play]')) {
    button.disabled = slides.length < 2;
  }
}

function setDeleting(value) {
  deleting = value;
  deleteForm.querySelector('[data-cancel-delete]').disabled = value;
  document.getElementById('confirm-delete').disabled = value;
  document.getElementById('delete-label').textContent = value ? 'Deleting…' : 'Delete screenshot';
}

function requestDeletion(shot) {
  if (!shot || deleting) return;
  pauseSlideshow();
  pendingDeletion = { ...shot };
  deleteError.replaceChildren();
  document.getElementById('delete-image').src = shot.url;
  document.getElementById('delete-caption').textContent = shot.captured;
  deleteDialog.showModal();
  deleteForm.querySelector('[data-cancel-delete]').focus();
}

deleteDialog.addEventListener('cancel', (event) => {
  if (deleting) event.preventDefault();
});
deleteDialog.addEventListener('close', () => {
  pendingDeletion = undefined;
  deleteForm.reset();
  document.getElementById('delete-image').removeAttribute('src');
});
deleteForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!pendingDeletion || deleting) return;
  const selected = document.getElementById('screenshot')?.dataset.filename || '';
  deleteError.replaceChildren();
  setDeleting(true);
  htmx.ajax('DELETE', `/screenshots/${encodeURIComponent(pendingDeletion.filename)}?selected=${encodeURIComponent(selected)}`, {
    source: deleteForm,
    target: '#capture-preview',
    swap: 'innerHTML',
    headers: { 'X-Confirm-Delete': 'true' },
  }).catch(() => {
    setDeleting(false);
    deleteError.textContent = 'Couldn’t reach the server. Refresh the gallery before retrying.';
  });
});

document.body.addEventListener('screenshotDeleted', () => {
  const selected = slides[slideIndex]?.filename;
  setDeleting(false);
  deleteDialog.close();
  if (dialog.open) {
    slides = gallerySlides();
    if (!slides.length) {
      dialog.close();
    } else {
      const index = slides.findIndex((shot) => shot.filename === selected);
      showSlide(index < 0 ? Math.min(slideIndex, slides.length - 1) : index);
      updateSlideButtons();
    }
  }
  updateGalleryControls();
  if (inputStatus) inputStatus.textContent = 'Gallery updated. Take a fresh screenshot before controlling the VM.';
});

function pauseSlideshow() {
  clearInterval(playTimer);
  playTimer = undefined;
  playButton.querySelector('use').setAttribute('href', '#icon-play');
  playButton.querySelector('[data-play-label]').textContent = 'Play';
  playButton.setAttribute('aria-pressed', 'false');
}

function setZoom(value) {
  zoomed = value;
  fullImage.style.maxWidth = value ? 'none' : '';
  fullImage.style.maxHeight = value ? 'none' : '';
  zoomButton.querySelector('use').setAttribute('href', value ? '#icon-expand' : '#icon-zoom-in');
  zoomButton.querySelector('[data-zoom-label]').textContent = value ? 'Fit to screen' : 'Actual size';
  zoomButton.setAttribute('aria-pressed', String(value));
  viewport.scrollTo(0, 0);
}

function showSlide(index) {
  slideIndex = (index + slides.length) % slides.length;
  const slide = slides[slideIndex];
  fullImage.src = slide.url;
  fullImage.alt = `Screenshot captured ${slide.captured}`;
  document.getElementById('slide-count').textContent = `${slideIndex + 1} / ${slides.length}`;
  document.getElementById('slide-caption').textContent = slide.captured;
  const download = document.getElementById('slide-download');
  download.href = `${slide.url}?download=1`;
  download.download = slide.filename;
  setZoom(false);
}

function playSlideshow() {
  if (slides.length < 2) return;
  pauseSlideshow();
  playButton.querySelector('use').setAttribute('href', '#icon-pause');
  playButton.querySelector('[data-play-label]').textContent = 'Pause';
  playButton.setAttribute('aria-pressed', 'true');
  playTimer = setInterval(() => showSlide(slideIndex + 1), 4000);
}

function openViewer(url, autoplay = false) {
  pauseSlideshow();
  slides = gallerySlides();
  if (!slides.length) return;
  const selected = slides.findIndex((slide) => slide.url === url);
  showSlide(selected < 0 ? 0 : selected);
  updateSlideButtons();
  dialog.showModal();
  if (autoplay) playSlideshow();
}

dialog.addEventListener('close', () => {
  pauseSlideshow();
  fullImage.removeAttribute('src');
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseSlideshow();
});

dialog.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    pauseSlideshow();
    showSlide(slideIndex + (event.key === 'ArrowLeft' ? -1 : 1));
  }
});

let touchStart;
viewport.addEventListener('touchstart', (event) => {
  touchStart = !zoomed && event.touches.length === 1
    ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : undefined;
}, { passive: true });
viewport.addEventListener('touchend', (event) => {
  if (!touchStart || event.touches.length) return;
  const dx = event.changedTouches[0].clientX - touchStart.x;
  const dy = event.changedTouches[0].clientY - touchStart.y;
  touchStart = undefined;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
    pauseSlideshow();
    showSlide(slideIndex + (dx < 0 ? 1 : -1));
  }
}, { passive: true });
viewport.addEventListener('touchcancel', () => { touchStart = undefined; });

function updateGalleryControls() {
  document.querySelector('[data-start-slideshow]').disabled = !document.querySelector('[data-gallery-image]');
}
updateGalleryControls();
document.body.addEventListener('htmx:afterSettle', updateGalleryControls);

document.body.addEventListener('htmx:beforeRequest', () => {
  errorBox.replaceChildren();
  preview.setAttribute('aria-busy', 'true');
});

// Let the server's escaped error fragment appear beside the capture button,
// keeping the last successful screenshot in the preview.
document.body.addEventListener('htmx:beforeSwap', (event) => {
  if (event.detail.xhr.status >= 400) {
    event.detail.target = event.detail.requestConfig?.verb === 'delete' ? deleteError : errorBox;
    event.detail.shouldSwap = true;
    event.detail.isError = false;
  }
});

document.body.addEventListener('htmx:afterRequest', (event) => {
  preview.setAttribute('aria-busy', 'false');
  if (event.detail.requestConfig?.verb === 'delete' && event.detail.xhr.status !== 200) {
    setDeleting(false);
  }
});

for (const name of ['htmx:sendError', 'htmx:timeout']) {
  document.body.addEventListener(name, (event) => {
    const target = event.detail.requestConfig?.verb === 'delete' ? deleteError : errorBox;
    target.textContent = 'Couldn’t reach the server. Check your connection and try again.';
    if (target === deleteError) setDeleting(false);
    preview.setAttribute('aria-busy', 'false');
  });
}

document.addEventListener('click', (event) => {
  const deleteButton = event.target.closest('[data-delete-screenshot]');
  if (deleteButton) {
    requestDeletion({ filename: deleteButton.dataset.filename, url: deleteButton.dataset.url, captured: deleteButton.dataset.captured });
    return;
  }
  if (event.target.closest('[data-delete-current]')) {
    requestDeletion(slides[slideIndex]);
    return;
  }
  if (event.target.closest('[data-cancel-delete]') || event.target === deleteDialog) {
    if (!deleting) deleteDialog.close();
    return;
  }
  const card = event.target.closest('[data-gallery-image]');
  if (card && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    openViewer(card.dataset.url);
  }
  if (event.target.closest('[data-start-slideshow]')) openViewer(undefined, true);
  if (event.target.closest('[data-open-preview]')) {
    const image = document.getElementById('screenshot');
    if (!image) return;
    if (event.target === image && document.getElementById('mouse-control')?.checked) {
      controlPreviewClick(event, image);
      return;
    }
    openViewer(image.getAttribute('src'));
  }
  if (event.target.closest('[data-close-preview]') || event.target === dialog) {
    dialog.close();
  }
  if (event.target.closest('[data-slide-previous], [data-slide-next]')) {
    pauseSlideshow();
    showSlide(slideIndex + (event.target.closest('[data-slide-next]') ? 1 : -1));
  }
  if (event.target.closest('[data-slide-play]')) {
    if (playTimer) pauseSlideshow(); else playSlideshow();
  }
  if (event.target.closest('[data-slide-zoom]')) {
    pauseSlideshow();
    setZoom(!zoomed);
  }
  if (event.target.closest('[data-download]')) {
    const image = document.getElementById('screenshot');
    if (!image) return;
    const link = document.createElement('a');
    link.href = image.src;
    link.download = image.dataset.filename;
    document.body.append(link);
    link.click();
    link.remove();
  }
});

// When opened through the LAN, show the exact same address for another device.
if (!['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
  document.getElementById('lan-address').textContent = window.location.origin;
}

const inputStatus = document.getElementById('input-status');
const mouseControl = document.getElementById('mouse-control');
let inputSending = false;
let controlFrameReady = false;

async function sendVMInput(action) {
  if (inputSending) return;
  const token = document.getElementById('control-token').value.trim();
  if (!token) {
    inputStatus.textContent = 'Enter the control token from your server terminal first.';
    document.getElementById('control-token').focus();
    return;
  }
  inputSending = true;
  controlFrameReady = false;
  inputStatus.textContent = 'Sending input to the VM…';
  const buttons = document.querySelectorAll('[data-input-button]');
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const response = await fetch('/input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Control-Token': token },
      body: JSON.stringify(action),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'VM input failed.');
    inputStatus.textContent = 'Input sent. Refreshing the screenshot…';
    // Allow a short guest repaint before the explicit capture request.
    setTimeout(() => document.getElementById('capture-form').requestSubmit(), 250);
  } catch (error) {
    inputStatus.textContent = error.name === 'TimeoutError'
      ? 'The request timed out. Capture again before retrying; the input may have reached the VM.'
      : error.message;
  } finally {
    inputSending = false;
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function controlPreviewClick(event, image) {
  if (!controlFrameReady || inputSending) {
    inputStatus.textContent = 'Wait for a fresh screenshot before clicking the VM.';
    return;
  }
  const rect = image.getBoundingClientRect();
  // object-contain may add letterboxing inside a height-constrained image.
  const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
  if (!Number.isFinite(scale) || scale <= 0) return;
  const x = Math.floor((event.clientX - rect.left - (rect.width - image.naturalWidth * scale) / 2) / scale);
  const y = Math.floor((event.clientY - rect.top - (rect.height - image.naturalHeight * scale) / 2) / scale);
  if (x < 0 || y < 0 || x >= image.naturalWidth || y >= image.naturalHeight) return;
  const mode = document.getElementById('mouse-action').value;
  sendVMInput({ action: mode === 'move' ? 'move' : 'click', x, y,
    button: mode === 'right' ? 'right' : 'left', clicks: mode === 'double' ? 2 : 1 });
}

if (inputStatus) {
  document.getElementById('text-input-form').addEventListener('submit', (event) => {
    event.preventDefault();
    sendVMInput({ action: 'text', text: document.getElementById('remote-text').value });
  });
  document.getElementById('key-input-form').addEventListener('submit', (event) => {
    event.preventDefault();
    sendVMInput({ action: 'key', key: document.getElementById('remote-key').value });
  });
  mouseControl.addEventListener('change', () => {
    controlFrameReady = false;
    if (mouseControl.checked) document.getElementById('capture-form').requestSubmit();
  });
  for (const button of document.querySelectorAll('[data-mouse-scroll]')) {
    button.addEventListener('click', () => {
      const image = document.getElementById('screenshot');
      if (!mouseControl.checked || !controlFrameReady || !image?.naturalWidth) {
        inputStatus.textContent = 'Enable screenshot control and wait for a fresh frame before scrolling.';
        return;
      }
      sendVMInput({ action: 'scroll', x: Math.floor(image.naturalWidth / 2), y: Math.floor(image.naturalHeight / 2), wheel: Number(button.dataset.mouseScroll) });
    });
  }
  document.body.addEventListener('htmx:beforeRequest', () => { controlFrameReady = false; });
  document.body.addEventListener('htmx:afterSettle', (event) => {
    if (event.detail.xhr?.status === 200 && event.detail.requestConfig?.path === '/capture') {
      controlFrameReady = true;
      inputStatus.textContent = mouseControl.checked ? 'Fresh frame ready. Tap the main screenshot to control the VM.' : 'Screenshot refreshed. VM input is ready.';
    }
  });
}
