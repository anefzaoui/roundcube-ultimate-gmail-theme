// Mail task glue: message list (row layout, letter avatars, hover actions, selection mode),
// preview frame and phone panels. Works on the DOM Roundcube's list.js renders — never replaces it.
import { parseSender } from './sender.js';
import { layout } from './layout.js';
import { apply as avatar } from './avatars.js';
import { openDialog } from './modal.js';
import { enhance as enhanceControls } from './controls.js';

const html = document.documentElement;
const label = (n) => (window.rcmail?.get_label ? rcmail.get_label(n) : n);

function onSmallScreen() {
  return layout.mode === 'phone' || layout.mode === 'small';
}

// On small screens exactly one panel is visible: sidebar (folders) | list | content.
function showPanel(name) {
  if (name === 'sidebar' && document.querySelector('#layout-menu > #layout-sidebar')) {
    html.classList.add('nav-open');
    return;
  }
  if (!document.getElementById(`layout-${name}`)) name = 'content';
  for (const id of ['layout-sidebar', 'layout-list', 'layout-content']) {
    document.getElementById(id)?.classList.toggle('selected', id === `layout-${name}`);
  }
  html.dataset.panel = name;
}

function rowAction(uid, action) {
  const rc = window.rcmail;
  const list = rc.message_list;
  if (!list) return;
  if (action === 'read' || action === 'unread') {
    rc.mark_message(action, uid);
    return;
  }
  // core commands act on the selection: select this row alone, run, restore nothing (Gmail semantics)
  list.select_row(uid, 0, false);
  if (action === 'archive') {
    rc.command(rc.commands['plugin.archive'] !== undefined ? 'plugin.archive' : 'delete');
  } else if (action === 'snooze') rc.command('plugin.snoozed_messages.snooze');
  else rc.command(action);
}

function decorateRow(row) {
  const el = row?.obj;
  if (!el || el.dataset.gm) return;
  el.dataset.gm = '1';
  const selCell = el.querySelector('td.selection');
  if (selCell) {
    selCell.addEventListener('mousedown', (e) => e.stopPropagation());
  }
  const subjectCell = el.querySelector('td.subject');
  const flagsCell = el.querySelector('td.flags');
  if (!subjectCell) return;

  // Gmail order: [checkbox] star · avatar+sender · subject · attachment · date · (hover actions)
  const star = flagsCell?.querySelector('span.flag');
  if (star) subjectCell.prepend(star);
  const att = flagsCell?.querySelector('span.attachment');
  if (att) subjectCell.append(att);

  const from = subjectCell.querySelector(':scope > .fromto');
  if (from && !subjectCell.querySelector('.gm-avatar-initial')) {
    const { name, email } = parseSender(from.querySelector('.rcmContactAddress') || from);
    const a = document.createElement('span');
    a.className = 'gm-avatar gm-avatar-sm gm-avatar-initial';
    avatar(a, name);
    if (email) a.dataset.email = email;
    a.setAttribute('aria-hidden', 'true');
    subjectCell.prepend(a);
  }

  const rc = window.rcmail;
  if (!html.classList.contains('touch')) {
    const actions = document.createElement('span');
    actions.className = 'gm-row-actions';
    const items = [
      rc.env.archive_folder || rc.commands?.['plugin.archive'] !== undefined
        ? ['archive', 'archive']
        : null,
      ['delete', 'delete'],
      [
        el.classList.contains('unread') ? 'read' : 'unread',
        el.classList.contains('unread') ? 'markread' : 'markunread',
      ],
      rc.commands?.['plugin.snoozed_messages.snooze'] !== undefined ? ['snooze', 'snooze'] : null,
    ].filter(Boolean);
    for (const [cls, lab] of items) {
      const a = document.createElement('a');
      a.href = `#${cls}`;
      a.className = cls;
      a.title = label(lab);
      a.setAttribute('aria-label', label(lab));
      a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        rowAction(row.uid, a.className);
      });
      a.addEventListener('mousedown', (e) => e.stopPropagation());
      actions.append(a);
    }
    subjectCell.append(actions);
  }
}

// keep the read/unread hover action in sync with the row state
function syncReadAction(uid) {
  const rc = window.rcmail;
  const row = rc.message_list?.rows?.[uid]?.obj;
  const a = row?.querySelector('.gm-row-actions > a.read, .gm-row-actions > a.unread');
  if (!a) return;
  const unread = row.classList.contains('unread');
  a.className = unread ? 'read' : 'unread';
  a.title = label(unread ? 'markread' : 'markunread');
}

// "List options" (sort column/order, threads) — Elastic builds a jQuery dialog from the hidden
// #listoptions-menu template; we do the same with our modal + custom selects.
function openListOptions() {
  const rc = window.rcmail;
  const tpl = document.getElementById('listoptions-menu');
  if (!rc || !tpl) return false;
  const form = tpl.cloneNode(true);
  form.removeAttribute('id');
  form.className = 'gm-listoptions propform';
  form.querySelector('h3.voice')?.remove();
  // the template's selects were already enhanced in place: unwrap them so the clone gets live controls
  for (const wrap of form.querySelectorAll('.gm-select')) {
    const sel = wrap.querySelector('select');
    if (sel) {
      delete sel.dataset.gm;
      sel.classList.remove('gm-select-native');
      sel.removeAttribute('tabindex');
      sel.removeAttribute('aria-hidden');
      wrap.replaceWith(sel);
    }
  }
  for (const sel of form.querySelectorAll('select')) sel.id = `${sel.id}-dialog`;
  for (const l of form.querySelectorAll('label[for]')) l.htmlFor = `${l.htmlFor}-dialog`;
  const val = (name, v) => {
    const sel = form.querySelector(`select[name="${name}"]`);
    if (sel) sel.value = v;
  };
  val('sort_col', rc.env.sort_col || '');
  val('sort_ord', rc.env.sort_order || 'ASC');
  val('mode', rc.env.threading ? 'threads' : 'list');
  enhanceControls(form);
  openDialog({
    title: label('listoptionstitle'),
    content: form,
    dialogClass: 'gm-dialog-sm',
    buttons: [
      { text: label('cancel') },
      {
        text: label('save'),
        mainaction: true,
        click(e, handle) {
          const get = (name) => form.querySelector(`select[name="${name}"]`)?.value;
          rc.set_list_options(
            [],
            get('sort_col'),
            get('sort_ord'),
            get('mode') === 'threads' ? 1 : 0
          );
          handle.close();
          document.getElementById('listmenulink')?.focus();
        },
      },
    ],
  });
  return false;
}

// Message view: core renders <img class="contactphoto"> with a generic placeholder when the
// sender has no photo — swap the placeholder for a letter avatar (same look as the list rows).
const AUTHRES = {
  status_pass: ['ico-verified-user', 'ok'],
  status_partial_pass: ['ico-verified-user', 'partial'],
  status_fail: ['ico-block', 'fail'],
  status_warn: ['ico-warning', 'warn'],
  status_nores: ['ico-help', 'none'],
  status_nosig: ['ico-shield', 'none'],
  status_third: ['ico-shield', 'third'],
};

// authres_status plugin renders blurry 16px PNGs before the sender — swap for our glyphs
function replaceAuthresIcons(root = document) {
  for (const img of root.querySelectorAll('img.authres-status-img')) {
    const key = (img.getAttribute('src') || '').match(/(status_[a-z_]+)\.png/)?.[1];
    const [cls, state] = AUTHRES[key] || ['ico-help', 'none'];
    const i = document.createElement('i');
    i.className = `ico gm-authres ${cls}`;
    i.dataset.state = state;
    i.title = img.title || img.alt || '';
    i.setAttribute('aria-label', img.alt || img.title || '');
    img.replaceWith(i);
  }
}

// Gmail sender line: "<b>Name</b> <email>  … date" + "to me ▾" (opens the details table).
// Built from the details table core renders (.header-headers), the original one-liner is hidden.
function buildSummary() {
  const header = document.querySelector('#message-header');
  const details = header?.querySelector('.header-headers');
  const summary = header?.querySelector('.header-summary');
  if (!header || !details || !summary || header.querySelector('.gm-msg-summary')) return;
  const rows = {};
  for (const tr of details.querySelectorAll('tr')) {
    const title = tr.querySelector('.header-title')?.textContent.trim().toLowerCase();
    const cell = tr.querySelector('td:not(.header-title)');
    if (!cell) continue;
    if (title) rows[title] = cell;
    for (const key of ['from', 'sender', 'to', 'cc', 'bcc', 'replyto', 'date']) {
      if (cell.classList.contains(key)) rows[key] = cell;
    }
  }
  const fromCell = rows.from || rows.sender;
  const from = fromCell?.querySelector('.adr');
  if (!from) return;
  const { name, email } = parseSender(from.querySelector('.rcmContactAddress'));
  const date =
    rows.date?.textContent.trim() || summary.querySelector('.date')?.textContent.trim() || '';
  const who = (cell) =>
    [...(cell?.querySelectorAll('.rcmContactAddress') || [])].map((a) => a.textContent.trim());
  const me = window.rcmail?.env?.identities
    ? Object.values(window.rcmail.env.identities).map((i) => i.email)
    : [];
  const toList = [...who(rows.to), ...who(rows.cc)];
  const toLabel = toList.length
    ? toList
        .map((t) => (me.includes(t) ? 'me' : t.split('@')[0]))
        .slice(0, 3)
        .join(', ') + (toList.length > 3 ? ` +${toList.length - 3}` : '')
    : '';

  const el = document.createElement('div');
  el.className = 'gm-msg-summary';
  el.innerHTML = `
    <div class="gm-msg-line1">
      <span class="gm-msg-name"></span>
      <span class="gm-msg-email"></span>
      <span class="gm-msg-flags"></span>
      <span class="gm-msg-date"></span>
    </div>
    <div class="gm-msg-line2">
      <button type="button" class="gm-msg-to" aria-expanded="false"></button>
    </div>`;
  el.querySelector('.gm-msg-name').textContent = name;
  if (email && email !== name) el.querySelector('.gm-msg-email').textContent = `<${email}>`;
  el.querySelector('.gm-msg-date').textContent = date;
  // authres / other inline status glyphs from the one-liner
  for (const i of summary.querySelectorAll('.gm-authres, img.authres-status-img, img')) {
    el.querySelector('.gm-msg-flags').append(i);
  }
  const toBtn = el.querySelector('.gm-msg-to');
  toBtn.innerHTML = `<span>${toLabel ? `${label('to')} ${toLabel}` : label('details') || 'Details'}</span><i class="ico ico-arrow-drop-down" aria-hidden="true"></i>`;
  toBtn.addEventListener('click', () => {
    const open = details.classList.toggle('details');
    toBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    header.querySelector('a.headers-summary')?.classList.toggle('expanded', open);
  });
  summary.after(el);
  summary.classList.add('gm-hidden');
  // the add-to-address-book link stays reachable (next to the email)
  const add = fromCell.querySelector('a.rcmaddcontact');
  if (add) el.querySelector('.gm-msg-email').after(add.cloneNode(true));
}

function decorateMessageHeader() {
  replaceAuthresIcons();
  buildSummary();
  const img = document.querySelector('#message-header img.contactphoto');
  if (!img) return;
  const { name, email: addr } = parseSender(
    document.querySelector('#message-header .header-summary .adr .rcmContactAddress') ||
      document.querySelector('#message-header .header-summary .adr')
  );
  const fallback = document.createElement('span');
  fallback.className = 'contactphoto gm-avatar-initial gm-msg-avatar';
  avatar(fallback, name || '?');
  if (addr) fallback.dataset.email = addr;
  const isPlaceholder = () =>
    /contactpic|contactgroup/.test(img.getAttribute('src') || '') ||
    (img.complete && img.naturalWidth === 0);
  const settle = () => {
    if (isPlaceholder()) {
      img.replaceWith(fallback);
    } else {
      img.classList.add('gm-loaded');
    }
  };
  if (img.complete) settle();
  else {
    img.addEventListener('load', settle, { once: true });
    img.addEventListener('error', () => img.replaceWith(fallback), { once: true });
  }
}

export const mailUI = {
  showPanel,
  init() {
    const rc = window.rcmail;
    if (!rc || rc.env.task !== 'mail') return;

    rc.addEventListener('insertrow', (e) => decorateRow(e.row));
    rc.addEventListener('menu-open', (p) => {
      if (p?.name === 'messagelistmenu') return openListOptions();
      return undefined;
    });
    if (['show', 'preview', 'print'].includes(rc.env.action)) decorateMessageHeader();
    rc.addEventListener('set_unread_count', () => {
      for (const uid of Object.keys(rc.message_list?.rows || {})) syncReadAction(uid);
    });

    // back buttons / panel switching on phones
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a.back-list-button, a.back-sidebar-button, a.task-menu-button');
      if (!a) return;
      e.preventDefault();
      if (a.classList.contains('back-sidebar-button')) showPanel('sidebar');
      else if (a.classList.contains('task-menu-button')) html.classList.toggle('nav-open');
      else showPanel('list');
    });

    rc.addEventListener('init', () => {
      const list = rc.message_list;
      if (list) {
        // Gmail: checkboxes are always visible
        list.enable_checkbox_selection();
        document.getElementById('messagelist')?.classList.add('withselection');
        // toolbar "Select" button = select-all toggle with tri-state glyph; its caret opens the menu
        const selBtn = document.querySelector('#messagelist-header a.select');
        const syncSel = () => {
          const total = Object.keys(list.rows || {}).length;
          const n = list.get_selection().length;
          selBtn?.classList.toggle('gm-all', total > 0 && n === total);
          selBtn?.classList.toggle('gm-some', n > 0 && n < total);
          selBtn?.classList.toggle('disabled', total === 0);
          document.getElementById('layout-list')?.classList.toggle('gm-has-selection', n > 0);
          const count = document.querySelector('.gm-selection-count');
          if (count) count.textContent = String(n);
        };
        if (selBtn) {
          selBtn.removeAttribute('data-popup');
          selBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            rc.command(list.get_selection().length ? 'select-none' : 'select-all', 'page');
            syncSel();
          });
          const caret = document.createElement('a');
          caret.href = '#select-menu';
          caret.className = 'select-caret';
          caret.dataset.popup = 'listselect-menu';
          caret.title = selBtn.title;
          caret.innerHTML = '<span class="inner">▾</span>';
          selBtn.after(caret);
        }
        list.addEventListener('select', (l) => {
          syncSel();
          if (
            onSmallScreen() &&
            l.get_single_selection() &&
            !l.multi_selecting &&
            !rc.dummy_select &&
            rc.env.layout !== 'list'
          ) {
            showPanel('content');
          }
        });
        rc.addEventListener('listupdate', syncSel);
        rc.addEventListener('afterlist', syncSel);
      }
      if (rc.env.action === 'show' && onSmallScreen()) showPanel('content');
      else if (onSmallScreen()) showPanel('list');
    });

    // folder click on phones → list; any click outside the drawer closes it
    document.getElementById('mailboxlist')?.addEventListener('click', (e) => {
      if (onSmallScreen() && e.target.closest('a')) {
        html.classList.remove('nav-open');
        showPanel('list');
      }
    });
    document.addEventListener('pointerdown', (e) => {
      if (
        html.classList.contains('nav-open') &&
        !e.target.closest('#layout-menu, #nav-toggle, .task-menu-button')
      ) {
        html.classList.remove('nav-open');
      }
    });

    document.addEventListener('gm:layout', () => {
      if (!onSmallScreen()) {
        for (const id of ['layout-sidebar', 'layout-list', 'layout-content']) {
          document.getElementById(id)?.classList.add('selected');
        }
      } else {
        showPanel(rc.env.action === 'show' || rc.env.action === 'compose' ? 'content' : 'list');
      }
    });
  },
};
