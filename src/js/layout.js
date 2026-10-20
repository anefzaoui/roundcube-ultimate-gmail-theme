// Layout engine: maintains the <html> class contract (touch, layout-{phone,small,normal,large},
// nav-collapsed) and responsive panels. Up to 1024px, use a drawer and one main panel.
const BREAKPOINTS = [
  ['phone', 0, 480],
  ['small', 481, 1024],
  ['normal', 1025, 1200],
  ['large', 1201, Infinity],
];

const html = document.documentElement;

function screenMode() {
  const w = window.innerWidth;
  const mode = BREAKPOINTS.find(([, min, max]) => w >= min && w <= max)[0];
  for (const [name] of BREAKPOINTS) html.classList.toggle(`layout-${name}`, name === mode);
  return mode;
}

function detectTouch() {
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  html.classList.toggle('touch', touch);
  return touch;
}

// Phones/tablets: the folder / address-book list (#layout-sidebar) moves inside the nav drawer
// (#layout-menu) so the hamburger shows folders like Gmail's; back on wide screens it returns to
// its grid slot. Same DOM nodes → Roundcube's tree widgets keep working. Settings keeps its
// sections list as the main panel.
function placeSidebar(mode) {
  const sidebar = document.getElementById('layout-sidebar');
  const menu = document.getElementById('layout-menu');
  const layoutEl = document.getElementById('layout');
  if (!sidebar || !menu || !layoutEl || document.body.classList.contains('task-settings')) return;
  const small = mode === 'phone' || mode === 'small';
  if (small && sidebar.parentElement !== menu) {
    menu.append(sidebar);
    sidebar.classList.add('gm-in-drawer');
  } else if (!small && sidebar.parentElement === menu) {
    const list = document.getElementById('layout-list');
    if (list) layoutEl.insertBefore(sidebar, list);
    else layoutEl.append(sidebar);
    sidebar.classList.remove('gm-in-drawer');
  }
}

function initPaneResizer() {
  const layoutEl = document.getElementById('layout');
  const listEl = document.getElementById('layout-list');
  const contentEl = document.getElementById('layout-content');
  if (!layoutEl || !listEl || !contentEl) return;
  if (contentEl.querySelector(':scope > .gm-pane-resizer')) return;

  const task =
    window.rcmail?.env?.task ||
    (document.body.classList.contains('task-addressbook')
      ? 'addressbook'
      : document.body.classList.contains('task-settings')
        ? 'settings'
        : 'mail');
  const storageKey = `gm.list_width.${task}`;
  const MIN_LIST = 260;
  const MIN_CONTENT = 320;

  const clampWidth = (desired) => {
    const listLeft = listEl.getBoundingClientRect().left;
    const avail = layoutEl.clientWidth - listLeft - 16;
    if (avail <= MIN_LIST + MIN_CONTENT) return Math.max(MIN_LIST, Math.round(avail * 0.45));
    return Math.round(Math.min(avail - MIN_CONTENT, Math.max(MIN_LIST, desired)));
  };

  const applySaved = () => {
    if (window.innerWidth <= 1024 || document.body.classList.contains('layout-list')) return;
    try {
      const saved = parseInt(localStorage.getItem(storageKey) || '', 10);
      if (Number.isFinite(saved) && saved >= MIN_LIST) {
        layoutEl.style.setProperty('--gm-list-width', `${clampWidth(saved)}px`);
      }
    } catch {
      /* ignore */
    }
  };

  applySaved();
  window.addEventListener('resize', () => {
    if (layoutEl.style.getPropertyValue('--gm-list-width')) applySaved();
  });

  const resizer = document.createElement('div');
  resizer.className = 'gm-pane-resizer';
  resizer.setAttribute('role', 'separator');
  resizer.setAttribute('aria-orientation', 'vertical');
  resizer.title = 'Panel genişliğini ayarlamak için sürükleyin (Sıfırlamak için çift tıklayın)';
  contentEl.prepend(resizer);

  resizer.addEventListener('dblclick', (e) => {
    e.preventDefault();
    layoutEl.style.removeProperty('--gm-list-width');
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  });

  resizer.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = listEl.getBoundingClientRect().width;
    let currentWidth = startWidth;
    html.classList.add('gm-resizing');
    try {
      resizer.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    const onMove = (ev) => {
      currentWidth = clampWidth(startWidth + (ev.clientX - startX));
      layoutEl.style.setProperty('--gm-list-width', `${currentWidth}px`);
    };

    const onEnd = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      html.classList.remove('gm-resizing');
      try {
        localStorage.setItem(storageKey, String(Math.round(currentWidth)));
      } catch {
        /* ignore */
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  });
}

export const layout = {
  mode: null,
  touch: false,
  placeSidebar,

  init() {
    // html.kbd = the user is navigating with the keyboard → show focus rings; mouse hides them
    document.addEventListener('keydown', (e) => {
      if (
        ['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(e.key)
      ) {
        html.classList.add('kbd');
      }
    });
    document.addEventListener('pointerdown', () => html.classList.remove('kbd'), true);
    this.touch = detectTouch();
    this.mode = screenMode();
    placeSidebar(this.mode);
    initPaneResizer();
    window.addEventListener('resize', () => {
      const m = screenMode();
      if (m !== this.mode) {
        this.mode = m;
        placeSidebar(m);
        document.dispatchEvent(new CustomEvent('gm:layout', { detail: { mode: m } }));
      }
    });
    try {
      if (localStorage.getItem('gm.nav') === 'collapsed') html.classList.add('nav-collapsed');
    } catch {
      /* storage unavailable (private mode) — default expanded */
    }
  },

  toggleNav(force) {
    if (this.mode === 'phone' || this.mode === 'small') {
      html.classList.toggle('nav-open', force === undefined ? undefined : !force);
      return false;
    }
    const collapsed = html.classList.toggle('nav-collapsed', force);
    try {
      localStorage.setItem('gm.nav', collapsed ? 'collapsed' : 'expanded');
    } catch {
      /* ignore */
    }
    return collapsed;
  },
};
