// Custom select presentation. Native selects remain the source of values/events;
// the menu lives in the top layer so it cannot be clipped by panels or cards.
const dropdownControls = new WeakMap();
let dropdownMenu;
let openDropdown;
let dropdownRows = [];
let dropdownIndex = -1;
let dropdownSearch = '';
let dropdownSearchTime = 0;
let dropdownSequence = 0;

function dropdownElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function getDropdownMenu() {
  if (dropdownMenu) return dropdownMenu;
  dropdownMenu = dropdownElement('div', 'dropdown-menu');
  dropdownMenu.id = 'resa-dropdown-menu';
  dropdownMenu.setAttribute('popover', 'manual');
  dropdownMenu.setAttribute('role', 'listbox');
  document.body.append(dropdownMenu);
  // Keep focus on the combobox while choosing with a mouse.
  dropdownMenu.addEventListener('pointerdown', event => event.preventDefault());
  dropdownMenu.addEventListener('pointermove', event => {
    const row = event.target.closest('[role="option"]');
    if (row && row.getAttribute('aria-disabled') !== 'true') setDropdownIndex(Number(row.dataset.index), false);
  });
  dropdownMenu.addEventListener('click', event => {
    const row = event.target.closest('[role="option"]');
    if (row && row.getAttribute('aria-disabled') !== 'true') chooseDropdownOption(Number(row.dataset.index));
  });
  document.addEventListener('pointerdown', event => {
    if (openDropdown && !event.composedPath().includes(dropdownMenu) && !event.composedPath().includes(openDropdown.trigger)) closeDropdown();
  });
  document.addEventListener('focusin', event => {
    if (openDropdown && event.target !== openDropdown.trigger) closeDropdown();
  });
  document.addEventListener('scroll', event => {
    if (openDropdown && !dropdownMenu.contains(event.target)) closeDropdown();
  }, true);
  window.addEventListener('resize', () => closeDropdown());
  window.addEventListener('blur', () => closeDropdown());
  return dropdownMenu;
}

export function closeDropdown(restoreFocus = false) {
  if (!openDropdown) return;
  const { trigger } = openDropdown;
  trigger.setAttribute('aria-expanded', 'false');
  trigger.removeAttribute('aria-activedescendant');
  dropdownMenu.hidePopover();
  openDropdown = undefined;
  dropdownSearch = '';
  if (restoreFocus && trigger.isConnected) trigger.focus();
}

export function syncDropdown(select) {
  const control = dropdownControls.get(select);
  if (!control) return;
  const text = select.selectedOptions[0]?.textContent ?? 'Select an option';
  control.value.textContent = text;
  control.trigger.disabled = select.disabled;
  control.trigger.setAttribute('aria-label', `${control.label}: ${text}`);
}

export function focusDropdown(select) {
  (dropdownControls.get(select)?.trigger ?? select).focus();
}

function setDropdownIndex(index, scroll = true) {
  if (!openDropdown || index < 0 || !dropdownRows[index]) return;
  dropdownIndex = index;
  dropdownRows.forEach((row, i) => row.classList.toggle('is-highlighted', i === index));
  openDropdown.trigger.setAttribute('aria-activedescendant', dropdownRows[index].id);
  if (scroll) {
    const row = dropdownRows[index];
    // Scroll the menu only; scrollIntoView can move the entire app behind it.
    if (row.offsetTop < dropdownMenu.scrollTop) dropdownMenu.scrollTop = row.offsetTop;
    if (row.offsetTop + row.offsetHeight > dropdownMenu.scrollTop + dropdownMenu.clientHeight) {
      dropdownMenu.scrollTop = row.offsetTop + row.offsetHeight - dropdownMenu.clientHeight;
    }
  }
}

function moveDropdown(direction) {
  if (!openDropdown) return;
  const options = [...openDropdown.select.options];
  let next = dropdownIndex;
  for (let step = 0; step < options.length; step++) {
    next = (next + direction + options.length) % options.length;
    if (!options[next].disabled) { setDropdownIndex(next); return; }
  }
}

function chooseDropdownOption(index) {
  if (!openDropdown) return;
  const { select } = openDropdown;
  if (!select.options[index] || select.options[index].disabled) return;
  const changed = select.selectedIndex !== index;
  select.selectedIndex = index;
  syncDropdown(select);
  closeDropdown(true);
  if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
}

function showDropdown(control) {
  closeDropdown();
  const menu = getDropdownMenu();
  const options = [...control.select.options];
  if (control.select.disabled || !options.some(option => !option.disabled)) return;
  openDropdown = control;
  dropdownSearch = '';
  dropdownRows = [];
  menu.replaceChildren();
  menu.setAttribute('aria-label', control.label);
  let previousGroup;
  options.forEach((option, i) => {
    const group = control.groups[option.value];
    if (group && group !== previousGroup) {
      const heading = dropdownElement('div', 'dropdown-group', group);
      heading.setAttribute('role', 'presentation');
      menu.append(heading);
      previousGroup = group;
    }
    const row = dropdownElement('div', 'dropdown-option');
    row.id = `resa-dropdown-option-${i}`;
    row.dataset.index = String(i);
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(i === control.select.selectedIndex));
    row.setAttribute('aria-disabled', String(option.disabled));
    row.append(dropdownElement('span', 'dropdown-option-label', option.textContent),
      dropdownElement('span', 'dropdown-check', i === control.select.selectedIndex ? '✓' : ''));
    menu.append(row);
    dropdownRows.push(row);
  });
  control.trigger.setAttribute('aria-expanded', 'true');
  menu.style.width = `${Math.min(Math.max(control.trigger.getBoundingClientRect().width, 230), window.innerWidth - 24)}px`;
  menu.style.maxHeight = `${Math.max(80, Math.min(350, window.innerHeight - 24))}px`;
  menu.showPopover();
  const anchor = control.trigger.getBoundingClientRect();
  const below = window.innerHeight - anchor.bottom - 18;
  const above = anchor.top - 18;
  const openAbove = menu.offsetHeight > below && above > below;
  menu.style.maxHeight = `${Math.max(60, Math.min(350, openAbove ? above : below))}px`;
  menu.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - menu.offsetWidth - 12))}px`;
  menu.style.top = `${openAbove ? anchor.top - menu.offsetHeight - 7 : anchor.bottom + 7}px`;
  menu.classList.toggle('opens-above', openAbove);
  const selected = options[control.select.selectedIndex]?.disabled ? -1 : control.select.selectedIndex;
  setDropdownIndex(selected >= 0 ? selected : options.findIndex(option => !option.disabled));
}

function handleDropdownKey(event, control) {
  const isOpen = openDropdown === control;
  if (['Enter', ' '].includes(event.key)) {
    event.preventDefault();
    if (isOpen) chooseDropdownOption(dropdownIndex); else showDropdown(control);
  } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    if (!isOpen) showDropdown(control);
    if (event.key === 'ArrowDown' && isOpen) moveDropdown(1);
    if (event.key === 'ArrowUp' && isOpen) moveDropdown(-1);
    const options = [...control.select.options];
    if (event.key === 'Home') setDropdownIndex(options.findIndex(option => !option.disabled));
    if (event.key === 'End') setDropdownIndex(options.findLastIndex(option => !option.disabled));
  } else if (event.key === 'Escape' && isOpen) {
    event.preventDefault(); closeDropdown(true);
  } else if (event.key === 'Tab') {
    closeDropdown();
  } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
    event.preventDefault();
    if (!isOpen) showDropdown(control);
    const now = performance.now();
    dropdownSearch = now - dropdownSearchTime > 700 ? event.key.toLowerCase() : dropdownSearch + event.key.toLowerCase();
    dropdownSearchTime = now;
    const repeated = [...dropdownSearch].every(char => char === dropdownSearch[0]);
    const query = repeated ? dropdownSearch[0] : dropdownSearch;
    const options = [...control.select.options];
    for (let step = repeated ? 1 : 0; step < options.length + (repeated ? 1 : 0); step++) {
      const index = (dropdownIndex + step + options.length) % options.length;
      if (!options[index].disabled && options[index].textContent.toLowerCase().startsWith(query)) {
        setDropdownIndex(index); break;
      }
    }
  }
}

export function enhanceSelect(select, { groups = {} } = {}) {
  if (dropdownControls.has(select)) return dropdownControls.get(select).root;
  const root = dropdownElement('span', 'dropdown-control');
  const trigger = dropdownElement('button', 'dropdown-trigger');
  trigger.type = 'button';
  trigger.id = `${select.id || `dropdown-${++dropdownSequence}`}-trigger`;
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', getDropdownMenu().id);
  const labelNode = [...document.querySelectorAll('label[for]')].find(label => label.htmlFor === select.id);
  const label = select.getAttribute('aria-label') || labelNode?.textContent || 'Select an option';
  if (labelNode) labelNode.htmlFor = trigger.id;
  const value = dropdownElement('span', 'dropdown-value');
  const arrow = dropdownElement('span', 'dropdown-chevron');
  arrow.setAttribute('aria-hidden', 'true');
  trigger.append(value, arrow);
  // Set hidden at the element level so the OS popup cannot appear via pointer or keyboard.
  select.hidden = true;
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.classList.add('dropdown-native');
  const parent = select.parentNode;
  if (parent) parent.insertBefore(root, select);
  root.append(select, trigger);
  const control = { root, select, trigger, value, label, groups };
  dropdownControls.set(select, control);
  trigger.addEventListener('click', () => openDropdown === control ? closeDropdown() : showDropdown(control));
  trigger.addEventListener('keydown', event => handleDropdownKey(event, control));
  trigger.addEventListener('focus', () => select.dispatchEvent(new FocusEvent('focus')));
  select.addEventListener('change', () => syncDropdown(select));
  syncDropdown(select);
  return root;
}
