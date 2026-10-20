// Custom form controls (in-house). Native <select>, checkbox, radio, file and range inputs are kept
// in the DOM as the value carriers Roundcube's core/plugins read and write, but are visually
// replaced: checkbox/radio via CSS (appearance:none), <select> via a button + our popup listbox,
// <input type=file> via a styled trigger. Everything is keyboard accessible.
import { escapeHtml } from './modal.js';

let selectSeq = 0;

function enhanceListbox(sel) {
  sel.dataset.gm = '1';
  const wrap = document.createElement('div');
  wrap.className = 'gm-select gm-select-multiple';
  const list = document.createElement('div');
  list.className = 'gm-choice-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-multiselectable', String(sel.multiple));
  const label = sel.labels?.[0];
  if (label) {
    label.id ||= `gm-choice-label-${++selectSeq}`;
    list.setAttribute('aria-labelledby', label.id);
  }
  const render = () => {
    wrap.hidden = sel.hidden || sel.classList.contains('hidden') || sel.style.display === 'none';
    wrap.style.display = wrap.hidden ? 'none' : '';
    const activeIndex = list.contains(document.activeElement)
      ? document.activeElement.dataset.index
      : null;
    list.replaceChildren();
    for (const option of sel.options) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'gm-choice-option';
      item.dataset.index = option.index;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.selected));
      item.disabled = sel.disabled || option.disabled || !!option.parentElement.disabled;
      item.textContent = option.textContent;
      item.addEventListener('click', () => {
        if (sel.multiple) option.selected = !option.selected;
        else sel.selectedIndex = option.index;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
      list.append(item);
    }
    if (activeIndex !== null) list.querySelector(`[data-index="${activeIndex}"]`)?.focus();
  };
  list.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...list.querySelectorAll('button:not(:disabled)')];
    const current = items.indexOf(document.activeElement);
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : current + (event.key === 'ArrowDown' ? 1 : -1);
    items[Math.max(0, Math.min(items.length - 1, index))]?.focus();
  });
  sel.classList.add('gm-select-native');
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');
  sel.parentNode.insertBefore(wrap, sel);
  wrap.append(sel, list);
  sel.addEventListener('change', render);
  new MutationObserver(render).observe(sel, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'selected', 'style', 'class', 'hidden'],
  });
  render();
}

function enhanceSelect(sel) {
  if (sel.dataset.gm === '1' || sel.closest('.gm-native')) {
    return;
  }
  if (sel.multiple || sel.size > 1) return enhanceListbox(sel);
  sel.dataset.gm = '1';
  const id = `gm-select-${++selectSeq}`;
  const wrap = document.createElement('div');
  wrap.className = 'gm-select';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'gm-select-btn';
  btn.id = `${id}-btn`;
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  if (sel.disabled) btn.disabled = true;
  const list = document.createElement('div');
  list.className = 'gm-select-list gm-menu';
  list.id = `${id}-list`;
  list.setAttribute('role', 'listbox');

  const render = () => {
    wrap.hidden = sel.hidden || sel.classList.contains('hidden') || sel.style.display === 'none';
    wrap.style.display = wrap.hidden ? 'none' : '';
    btn.disabled = sel.disabled;
    const opt = sel.options[sel.selectedIndex];
    btn.innerHTML = `<span class="gm-select-value">${escapeHtml(opt ? opt.textContent : '')}</span><i class="ico ico-arrow-drop-down" aria-hidden="true"></i>`;
    list.innerHTML = '';
    for (const o of sel.querySelectorAll('option, optgroup')) {
      if (o.tagName === 'OPTGROUP') {
        const group = document.createElement('div');
        group.className = 'gm-select-group';
        group.textContent = o.label;
        list.append(group);
        continue;
      }
      const item = document.createElement('div');
      item.className =
        'gm-select-option' +
        (o.selected ? ' selected' : '') +
        (o.disabled || o.parentElement.disabled ? ' disabled' : '');
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', o.selected ? 'true' : 'false');
      item.tabIndex = -1;
      item.dataset.index = o.index;
      item.textContent = o.textContent;
      list.append(item);
    }
  };
  render();

  const openList = () => {
    if (btn.disabled) return;
    list.classList.add('gm-open');
    btn.setAttribute('aria-expanded', 'true');
    document.body.append(list);
    const r = btn.getBoundingClientRect();
    const availableWidth = document.documentElement.clientWidth - 16;
    list.style.minWidth = `${Math.min(r.width, availableWidth)}px`;
    list.style.maxWidth = `${availableWidth}px`;
    const listWidth = list.getBoundingClientRect().width;
    list.style.left = `${Math.max(8, Math.min(r.left, document.documentElement.clientWidth - listWidth - 8))}px`;
    const below = window.innerHeight - r.bottom;
    const h = Math.min(list.scrollHeight, 360, Math.max(below - 8, r.top - 8));
    list.style.maxHeight = `${h}px`;
    list.style.top = below >= h + 8 ? `${r.bottom + 4}px` : `${r.top - h - 4}px`;
    (list.querySelector('.selected') || list.querySelector('.gm-select-option'))?.focus();
    setTimeout(() => document.addEventListener('pointerdown', onOutside, true));
  };
  const closeList = (focusBtn = true) => {
    if (!list.classList.contains('gm-open')) return;
    list.classList.remove('gm-open');
    btn.setAttribute('aria-expanded', 'false');
    list.remove();
    document.removeEventListener('pointerdown', onOutside, true);
    if (focusBtn) btn.focus();
  };
  const onOutside = (e) => {
    if (!list.contains(e.target) && !btn.contains(e.target)) closeList(false);
  };
  const choose = (idx) => {
    if (!sel.options[idx] || sel.options[idx].disabled || sel.options[idx].parentElement.disabled) {
      return;
    }
    if (sel.selectedIndex !== idx) {
      sel.selectedIndex = idx;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    render();
    closeList();
  };

  btn.addEventListener('click', () =>
    list.classList.contains('gm-open') ? closeList() : openList()
  );
  btn.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      if (!list.classList.contains('gm-open')) {
        const n = sel.selectedIndex + (e.key === 'ArrowDown' ? 1 : -1);
        if (n >= 0 && n < sel.options.length) choose(n);
      }
    }
  });
  list.addEventListener('click', (e) => {
    const it = e.target.closest('.gm-select-option');
    if (it) choose(+it.dataset.index);
  });
  list.addEventListener('keydown', (e) => {
    const items = [...list.querySelectorAll('.gm-select-option:not(.disabled)')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), closeList());
    else if (e.key === 'Enter' || e.key === ' ') {
      (e.preventDefault(), e.stopPropagation(), i >= 0 && choose(+items[i].dataset.index));
    } else if (e.key === 'ArrowDown') {
      (e.preventDefault(), e.stopPropagation(), items[Math.min(i + 1, items.length - 1)]?.focus());
    } else if (e.key === 'ArrowUp') {
      (e.preventDefault(), e.stopPropagation(), items[Math.max(i - 1, 0)]?.focus());
    } else if (e.key === 'Tab') closeList(false);
  });
  sel.addEventListener('change', render);
  new MutationObserver(render).observe(sel, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'selected', 'style', 'class', 'hidden'],
  });

  sel.classList.add('gm-select-native');
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');
  sel.parentNode.insertBefore(wrap, sel);
  wrap.append(sel, btn);
}

function enhanceFile(input) {
  if (
    input.dataset.gm === '1' ||
    input.closest('.gm-native, form.hidden, [hidden], #uploadform, #upload-form') ||
    input.classList.contains('hidden')
  ) {
    return;
  }
  input.dataset.gm = '1';
  const wrap = document.createElement('div');
  wrap.className = 'gm-file';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'gm-btn gm-btn-outlined';
  btn.innerHTML = `<i class="ico ico-upload" aria-hidden="true"></i><span>${escapeHtml(window.rcmail?.get_label?.(input.multiple ? 'choosefiles' : 'choosefile') || 'Choose file')}</span>`;
  const name = document.createElement('span');
  name.className = 'gm-file-name';
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    name.textContent = [...input.files].map((f) => f.name).join(', ');
  });
  input.parentNode.insertBefore(wrap, input);
  wrap.append(input, btn, name);
  input.classList.add('gm-file-native');
  input.tabIndex = -1;
}

export function enhance(root = document) {
  for (const s of root.querySelectorAll('select')) enhanceSelect(s);
  for (const f of root.querySelectorAll('input[type="file"]')) enhanceFile(f);
}

export const controls = {
  enhance,
  init() {
    enhance(document);
    // forms injected later by core/plugins (dialogs, ajax) get enhanced too
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) enhance(n);
    }).observe(document.body, { childList: true, subtree: true });
  },
};
