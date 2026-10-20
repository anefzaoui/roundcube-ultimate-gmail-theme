// Modal dialogs (in-house). Replaces jQuery UI dialogs for the whole app: rcmail.show_popup_dialog
// (and therefore simple_dialog / alert_dialog / confirm_dialog) is routed here, plus our own
// promise-based alert/confirm/prompt used instead of native window.alert/confirm/prompt.
const label = (name) => (window.rcmail?.get_label ? rcmail.get_label(name) : name);
let stack = [];

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

function trapFocus(dialog, e) {
  const f = [
    ...dialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
    ),
  ].filter((x) => x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0];
  const last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * Low-level: open a dialog.
 * @param {object} o  { title, content (Node|string), buttons: [{text, class, click, mainaction}],
 *                      width, height, cancelButton, closeOnEscape=true, classes, onClose, dialogClass }
 * @returns {object} handle: { el, close(), setOption() }
 */
export function openDialog(o = {}) {
  // framed page (preview pane, settings form, compose popup): let the top window own the dialog
  if (window !== window.top && !o.local) {
    try {
      const topUI = window.top.UI;
      if (topUI?.modal?.open && topUI.modal.open !== openDialog) {
        const opts = { ...o };
        if (o.content && typeof o.content === 'object' && typeof o.content.nodeType === 'number') {
          opts.content = window.top.document.adoptNode(o.content);
        }
        return topUI.modal.open(opts);
      }
    } catch {
      /* cross-origin top — fall through */
    }
  }
  const scrim = el('div', 'gm-scrim');
  const dialog = el('div', `gm-dialog ${o.dialogClass || ''}`.trim());
  dialog.setAttribute('role', o.role || 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  if (o.width) dialog.style.width = typeof o.width === 'number' ? `${o.width}px` : o.width;
  if (o.height) dialog.style.height = typeof o.height === 'number' ? `${o.height}px` : o.height;

  const id = `gm-dialog-${Date.now().toString(36)}${stack.length}`;
  if (o.title) {
    const h = el('div', 'gm-dialog-head');
    const t = el('h2', 'gm-dialog-title');
    t.id = `${id}-title`;
    t.textContent = o.title;
    h.append(t);
    if (o.closeButton !== false) {
      const x = el(
        'button',
        'gm-icon-btn gm-dialog-close',
        '<i class="ico ico-close" aria-hidden="true"></i>'
      );
      x.type = 'button';
      x.title = label('close');
      x.addEventListener('click', () => handle.close());
      h.append(x);
    }
    dialog.append(h);
    dialog.setAttribute('aria-labelledby', t.id);
  }

  const body = el('div', 'gm-dialog-body');
  if (o.content && typeof o.content === 'object' && typeof o.content.nodeType === 'number') {
    body.append(o.content);
  } else if (o.content != null) body.innerHTML = o.content;
  dialog.append(body);

  const buttons = (o.buttons || []).filter(Boolean);
  if (buttons.length) {
    const foot = el('div', 'gm-dialog-actions');
    for (const b of buttons) {
      const btn = el(
        'button',
        `gm-btn ${b.mainaction ? 'gm-btn-filled' : 'gm-btn-text'} ${b.class || ''}`.trim()
      );
      btn.type = 'button';
      btn.textContent = b.text;
      if (b.mainaction) btn.dataset.mainaction = '1';
      btn.addEventListener('click', (e) => {
        if (b.click) b.click.call(dialog, e, handle);
        else handle.close();
      });
      foot.append(btn);
    }
    dialog.append(foot);
  }

  scrim.append(dialog);
  document.body.append(scrim);
  document.documentElement.classList.add('gm-modal-open');

  const prevFocus = document.activeElement;
  const onKey = (e) => {
    if (stack[stack.length - 1] !== handle) return;
    if (e.key === 'Escape' && o.closeOnEscape !== false) {
      e.preventDefault();
      handle.close();
    } else if (e.key === 'Tab') trapFocus(dialog, e);
    else if (
      e.key === 'Enter' &&
      !['TEXTAREA', 'SELECT'].includes(e.target.tagName) &&
      !e.target.closest('[contenteditable]')
    ) {
      const main = dialog.querySelector('[data-mainaction]');
      if (main && (e.target.tagName !== 'BUTTON' || e.target === main)) {
        e.preventDefault();
        main.click();
      }
    }
  };
  document.addEventListener('keydown', onKey);
  // Material: a click on the scrim dismisses the dialog unless the caller forbids it
  if (o.closeOnScrim !== false) {
    scrim.addEventListener('pointerdown', (e) => e.target === scrim && handle.close());
  }

  const handle = {
    el: dialog,
    scrim,
    closed: false,
    close() {
      if (handle.closed) return;
      handle.closed = true;
      document.removeEventListener('keydown', onKey);
      document.querySelectorAll('.gm-select-list.gm-open').forEach((n) => {
        n.classList.remove('gm-open');
        n.remove();
      });
      stack = stack.filter((h) => h !== handle);
      scrim.remove();
      if (!stack.length) document.documentElement.classList.remove('gm-modal-open');
      o.onClose?.();
      if (prevFocus && document.body.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
    },
    setOption(opts) {
      if (opts.width) {
        dialog.style.width = typeof opts.width === 'number' ? `${opts.width}px` : opts.width;
      }
      if (opts.height) {
        dialog.style.height = typeof opts.height === 'number' ? `${opts.height}px` : opts.height;
      }
      if (opts.title) {
        const t = dialog.querySelector('.gm-dialog-title');
        if (t) t.textContent = opts.title;
      }
    },
  };
  stack.push(handle);

  requestAnimationFrame(() => {
    scrim.classList.add('gm-visible');
    const focusTarget =
      dialog.querySelector(
        '[autofocus], input:not([type=hidden]):not([disabled]), textarea, select'
      ) ||
      dialog.querySelector('[data-mainaction]') ||
      dialog.querySelector('button');
    focusTarget?.focus({ preventScroll: true });
  });

  return handle;
}

export const modal = {
  open: openDialog,

  alert(message, title) {
    return new Promise((resolve) => {
      openDialog({
        title: title || label('errortitle') || 'Notice',
        content: el('p', 'gm-dialog-text', escapeHtml(message)),
        dialogClass: 'gm-dialog-sm',
        buttons: [
          { text: label('ok'), mainaction: true, click: (e, h) => (h.close(), resolve(true)) },
        ],
        onClose: () => resolve(true),
      });
    });
  },

  confirm(message, { title, okLabel, cancelLabel, danger } = {}) {
    return new Promise((resolve) => {
      let answered = false;
      openDialog({
        title: title || '',
        content: el('p', 'gm-dialog-text', escapeHtml(message)),
        dialogClass: 'gm-dialog-sm',
        buttons: [
          {
            text: cancelLabel || label('cancel'),
            click: (e, h) => ((answered = true), resolve(false), h.close()),
          },
          {
            text: okLabel || label('ok'),
            mainaction: true,
            class: danger ? 'gm-btn-danger' : '',
            click: (e, h) => ((answered = true), resolve(true), h.close()),
          },
        ],
        onClose: () => !answered && resolve(false),
      });
    });
  },

  prompt(message, { title, value = '', okLabel, cancelLabel, placeholder } = {}) {
    return new Promise((resolve) => {
      let answered = false;
      const wrap = el('div', 'gm-field');
      const p = el('label', 'gm-dialog-text', escapeHtml(message));
      const input = el('input', 'gm-input');
      input.type = 'text';
      input.value = value;
      if (placeholder) input.placeholder = placeholder;
      p.append(input);
      wrap.append(p);
      openDialog({
        title: title || '',
        content: wrap,
        dialogClass: 'gm-dialog-sm',
        buttons: [
          {
            text: cancelLabel || label('cancel'),
            click: (e, h) => ((answered = true), resolve(null), h.close()),
          },
          {
            text: okLabel || label('ok'),
            mainaction: true,
            click: (e, h) => ((answered = true), resolve(input.value), h.close()),
          },
        ],
        onClose: () => !answered && resolve(null),
      });
    });
  },

  closeAll() {
    for (const h of [...stack]) h.close();
  },

  get isOpen() {
    return stack.length > 0;
  },
};

export function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}
