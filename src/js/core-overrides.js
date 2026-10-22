// Roundcube core overrides — the exact surface where core would otherwise show jQuery UI dialogs,
// native confirm() dialogs or the native beforeunload prompt. Installed BEFORE rcmail.init().
import { openDialog, modal } from './modal.js';
import { popup } from './popup.js';
import { composeWindow } from './compose-window.js';
import { layout } from './layout.js';

const label = (n) => (window.rcmail?.get_label ? rcmail.get_label(n) : n);

// jQuery-UI-compatible handle so callers doing popup.dialog('close') / .dialog('option', {...}) still work.
function dialogShim(handle) {
  const shim = [handle.el];
  shim.dialog = (cmd, opts) => {
    if (cmd === 'close' || cmd === 'destroy') handle.close();
    else if (cmd === 'option' && opts) handle.setOption(opts);
    else if (cmd === 'isOpen') return !handle.closed;
    return shim;
  };
  shim.remove = () => handle.close();
  shim[0].jqref = () => shim;
  return shim;
}

export function installCoreOverrides() {
  if (!window.rcmail) return;

  // 1) All core dialogs (simple_dialog, alert_dialog, confirm_dialog funnel here).
  rcmail.show_popup_dialog = function (content, title, buttons, options = {}) {
    if (this.is_framed()) return parent.rcmail.show_popup_dialog(content, title, buttons, options);
    const btns = (buttons || []).map((b, i) => ({
      text: b.text === '*' ? '' : b.text,
      class: `${b.class || options.button_classes?.[i] || ''}${b.text === '*' ? ' gm-btn-spacer' : ''}`,
      mainaction: /mainaction/.test(`${b.class || ''} ${options.button_classes?.[i] || ''}`),
      click: (e, h) => {
        const r = b.click?.call(shim[0], e);
        if (r !== false && !options.keep_open) h.close();
      },
    }));
    // primary action last, like Gmail (core passes it first)
    btns.sort((a, b) => Number(a.mainaction) - Number(b.mainaction));
    let node = content;
    if (typeof content === 'string') node = content;
    else if (content && content.jquery) node = content[0];
    const handle = openDialog({
      title,
      content: node,
      buttons: btns,
      width: options.width,
      height: options.height,
      closeOnEscape: options.closeOnEscape !== false,
      dialogClass: options.dialogClass || options.classes?.['ui-dialog'] || '',
      onClose: () => options.close?.(),
    });
    const shim = dialogShim(handle);
    if (options.open) setTimeout(() => options.open.call(shim[0]), 0);
    this.triggerEvent('dialog-open', { obj: shim });
    return shim;
  };

  // 1b) Quick compose: core routes compose to open_window() when env.compose_extwin is set. On
  //     desktop we host it in an in-page floating window instead of a browser popup.
  const coreOpenWindow = rcmail.open_window;
  rcmail.open_window = function (url, small, toolbar) {
    const isCompose = /[?&]_action=compose(&|$)/.test(url || '');
    if (isCompose && this.env.framed && window.parent && window.parent !== window && window.parent.rcmail) {
      return window.parent.rcmail.open_window(url, small, toolbar);
    }
    const smallScreen = layout.mode === 'phone' || layout.mode === 'small';
    if (
      isCompose &&
      !this.env.extwin &&
      !this.env.gm_popup &&
      !smallScreen &&
      !this.env.standard_windows_force
    ) {
      return composeWindow.open(url);
    }
    return coreOpenWindow.call(this, url, small, toolbar);
  };
  if (typeof rcmail.open_compose_step === 'function') {
    const coreOpenComposeStep = rcmail.open_compose_step;
    rcmail.open_compose_step = function (p) {
      if (this.env.framed && window.parent && window.parent !== window && window.parent.rcmail?.open_compose_step) {
        return window.parent.rcmail.open_compose_step(p);
      }
      return coreOpenComposeStep.call(this, p);
    };
  }
  if (
    !rcmail.env.extwin &&
    rcmail.env.task === 'mail' &&
    rcmail.env.action !== 'compose'
  ) {
    rcmail.env.compose_extwin = true;
  }

  // 2) Menus: core calls these for data-popup-less menus (e.g. folder selector); route to ours.
  rcmail.show_menu = function (prop, show, event) {
    const name = typeof prop === 'object' ? prop.menu : prop;
    const menu = document.getElementById(name);
    if (!menu) {
      // no DOM menu (e.g. 'messagelistmenu'): let skin/plugin listeners build a dialog instead
      this.triggerEvent('menu-open', { name, obj: null, props: prop, originalEvent: event });
      return false;
    }
    const anchor =
      event?.target?.closest?.('a, button') || (typeof prop === 'object' && prop.obj) || null;
    if (show === false || (show === undefined && popup.isOpen(name))) popup.close(name);
    else popup.open(name, anchor, event);
    return false;
  };
  rcmail.hide_menu = function (name) {
    popup.close(name);
    return false;
  };

  // 3) Native confirm() sites in app.js → async modals with the same follow-up.
  const origCheck = rcmail.check_compose_input;
  rcmail.check_compose_input = function (cmd) {
    if (
      !this.mailvelope_editor &&
      this.editor &&
      !this.editor.get_content() &&
      !this.env.gm_nobody_ok
    ) {
      modal.confirm(label('nobodywarning')).then((ok) => {
        if (ok) {
          this.env.gm_nobody_ok = true;
          this.command(cmd);
          this.env.gm_nobody_ok = false;
        }
      });
      return false;
    }
    return origCheck.call(this, cmd);
  };
  const origToggle = rcmail.toggle_editor;
  rcmail.toggle_editor = function (props, obj, e) {
    if (props?.mode === 'plain' && !this.env.editor_warned && this.editor?.get_content?.()) {
      modal.confirm(label('editorwarning')).then((ok) => {
        if (ok) {
          this.env.editor_warned = true;
          origToggle.call(this, props, obj, e);
        } else if (obj?.tagName === 'SELECT') obj.value = 'html';
      });
      return false;
    }
    return origToggle.call(this, props, obj, e);
  };

  // 4) Never show the native leave-page prompt. Core installs its handler only if none exists;
  //    in-app navigation with unsaved compose content is guarded by unload.js instead.
  window.onbeforeunload = function () {
    return undefined;
  };

  // 5) Ban native dialogs app-wide (plugins included); route to in-house modals.
  window.alert = (m) => void modal.alert(String(m));
  window.confirm = () => {
    // Synchronous confirm cannot be emulated; callers in our code use modal.confirm(). Log for devs.
    console.warn('window.confirm() is disabled in roundcube-gmail — use UI.modal.confirm()');
    return false;
  };
}
