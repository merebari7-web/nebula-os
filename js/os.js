/* ============================================================
   NEBULA OS — kernel v1.1
   Window manager · taskbar · start menu · dialogs · toasts
   Lock screen · Alt+Tab · parallax · i18n · idle detection
   ============================================================ */
(function () {
  'use strict';

  const TASKBAR_H = 56;
  const MENU_H = 26;
  const LS_SETTINGS = 'nebula.settings.v1';
  const LS_DESKTOP = 'nebula.desktop.v1';

  /* ---------- tiny DOM helpers ---------- */
  function byId(id) { return document.getElementById(id); }
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  }
  function safeJson(s) { try { return JSON.parse(s) || {}; } catch (e) { return {}; } }

  /* ---------- i18n ---------- */
  const I18N = window.I18N;
  function t(key) { return I18N ? I18N.t(key) : key; }

  /* ---------- settings ---------- */
  const DEFAULT_SETTINGS = {
    wallpaper: 0,
    accent: '#0a84ff',
    theme: 'dark',
    sound: true,
    reduceMotion: false,
    language: 'en',
    pin: '',
    idleLock: true,
    idleMinutes: 5
  };

  const WALLPAPERS = [
    { name: 'Sonoma', css: 'radial-gradient(1300px 900px at 82% -10%, rgba(255,158,131,.5) 0%, rgba(255,158,131,0) 58%), radial-gradient(1100px 800px at 8% 112%, rgba(124,108,255,.45) 0%, rgba(124,108,255,0) 55%), radial-gradient(900px 700px at 32% 18%, rgba(255,196,140,.25) 0%, rgba(255,196,140,0) 50%), linear-gradient(155deg, #1c1233 0%, #45306b 40%, #8a4a6b 68%, #d97b5f 88%, #f2a97e 100%)' },
    { name: 'Sequoia', css: 'radial-gradient(1200px 800px at 85% 112%, rgba(45,212,191,.42) 0%, rgba(45,212,191,0) 55%), radial-gradient(1000px 700px at 12% -12%, rgba(16,185,129,.3) 0%, rgba(16,185,129,0) 55%), linear-gradient(165deg, #03120f 0%, #06302a 45%, #0d5c4d 75%, #2ea98a 100%)' },
    { name: 'Ventura', css: 'radial-gradient(1200px 850px at 75% -15%, rgba(96,165,250,.5) 0%, rgba(96,165,250,0) 60%), radial-gradient(1000px 700px at 15% 115%, rgba(192,132,252,.42) 0%, rgba(192,132,252,0) 55%), linear-gradient(150deg, #0b1030 0%, #232a6b 45%, #5b4bb5 75%, #9d7bea 100%)' },
    { name: 'Monterey', css: 'radial-gradient(1000px 700px at 72% 118%, rgba(125,196,245,.5) 0%, rgba(125,196,245,0) 58%), radial-gradient(800px 500px at 18% -12%, rgba(56,130,246,.3) 0%, rgba(56,130,246,0) 55%), linear-gradient(180deg, #071a3a 0%, #0e3a6e 42%, #2f6db5 72%, #6db3e8 100%)' },
    { name: 'Big Sur', css: 'radial-gradient(1000px 700px at 80% 115%, rgba(251,146,60,.5) 0%, rgba(251,146,60,0) 55%), radial-gradient(900px 600px at 12% -12%, rgba(244,114,182,.25) 0%, rgba(244,114,182,0) 55%), linear-gradient(160deg, #1a0b2e 0%, #5b2a5e 45%, #c2544f 75%, #f2935c 100%)' },
    { name: 'Void', css: 'radial-gradient(1200px 800px at 50% 50%, rgba(88,101,242,.16) 0%, rgba(88,101,242,0) 65%), linear-gradient(180deg, #04040a 0%, #08080f 60%, #0c0c16 100%)' }
  ];

  const ICONS = {
    min: '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6.5h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    max: '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="2.2" y="2.2" width="7.6" height="7.6" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    restore: '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="3.8" width="6.2" height="6.2" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M4 2.2h4.8A1.8 1.8 0 0 1 10.6 4v4.8" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    close: '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
  };

  /* ---------- OS state ---------- */
  const OS = {
    name: 'Nebula OS',
    version: '2.2.0',
    startedAt: Date.now(),
    z: 100,
    seq: 1,
    windows: new Map(),
    tasks: [],
    settings: Object.assign({}, DEFAULT_SETTINGS, safeJson(localStorage.getItem(LS_SETTINGS))),
    _startRender: null,
    _refreshSettings: null
  };
  OS.saveSettings = function () {
    try { localStorage.setItem(LS_SETTINGS, JSON.stringify(OS.settings)); } catch (e) {}
  };

  /* --- per-app window geometry persistence --- */
  const LS_WINRECT = 'nebula.winrect.v1';
  function loadWinRect(appId) {
    if (!appId) return null;
    const m = safeJson(localStorage.getItem(LS_WINRECT));
    return m[appId] || null;
  }
  function saveWinRect(win) {
    if (!win || !win.appId) return;
    try {
      const m = safeJson(localStorage.getItem(LS_WINRECT));
      if (win.maximized) m[win.appId] = { max: true };
      else {
        m[win.appId] = {
          x: Math.round(parseFloat(win.el.style.left) || 0),
          y: Math.round(parseFloat(win.el.style.top) || 0),
          w: Math.round(win.el.getBoundingClientRect().width || 0),
          h: Math.round(win.el.getBoundingClientRect().height || 0)
        };
      }
      const keys = Object.keys(m);
      if (keys.length > 40) delete m[keys[0]];
      localStorage.setItem(LS_WINRECT, JSON.stringify(m));
    } catch (e) {}
  }

  function applyWallpaper(i) {
    const wp = byId('wallpaper');
    if (wp) wp.style.background = WALLPAPERS[i].css;
  }

  OS.applySettings = function () {
    document.body.dataset.theme = OS.settings.theme;
    document.body.dataset.motion = OS.settings.reduceMotion ? 'reduce' : 'full';
    document.documentElement.style.setProperty('--accent', OS.settings.accent);
    const vol = byId('tray-vol');
    if (vol) vol.style.opacity = OS.settings.sound ? '1' : '.35';
    const brand = byId('boot-brand-svg');
    if (brand && brand.pauseAnimations) {
      try { OS.settings.reduceMotion ? brand.pauseAnimations() : brand.unpauseAnimations(); } catch (e) {}
    }
    applyWallpaper(OS.settings.wallpaper);
  };

  /* ---------- sound ---------- */
  const Sound = {
    ctx: null,
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) { try { this.ctx = new AC(); } catch (e) {} }
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    blip(freq, dur, type, gain) {
      if (!OS.settings.sound) return;
      this.ensure();
      const c = this.ctx;
      if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq || 520;
      g.gain.setValueAtTime(gain || 0.04, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + (dur || 0.08));
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + (dur || 0.08) + 0.03);
    },
    open() { this.blip(540, 0.07, 'sine', 0.035); setTimeout(() => this.blip(760, 0.09, 'sine', 0.028), 60); },
    close() { this.blip(340, 0.09, 'sine', 0.035); },
    pop() { this.blip(880, 0.045, 'triangle', 0.025); },
    chime() {
      this.blip(523.25, 0.35, 'sine', 0.03);
      setTimeout(() => this.blip(783.99, 0.5, 'sine', 0.03), 140);
    },
    fail() { this.blip(196, 0.18, 'square', 0.025); }
  };

  /* ---------- app registry ---------- */
  const APPS = {};
  function registerApp(app) { APPS[app.id] = app; }
  function openApp(id, args) {
    const a = APPS[id];
    if (!a) { notify('⚠️', 'Unknown app', 'No app registered as "' + id + '".'); return; }
    a.open(args);
  }
  function appTitle(a) { return (a.titleKey && t(a.titleKey)) || a.title || a.id; }
  function appTile(app, cls) {
    const g = app.tile || 'linear-gradient(135deg,#4f46e5,#7c3aed)';
    return '<span class="app-tile ' + (cls || '') + '" style="background:' + g + '">' + (app.icon || '🪐') + '</span>';
  }

  /* ---------- window manager ---------- */
  let focusedWin = null;

  function focusWindow(win) {
    if (!win) return;
    if (focusedWin && focusedWin !== win) {
      try { focusedWin.hooks.blur && focusedWin.hooks.blur(); } catch (e) {}
      focusedWin = null;
    }
    focusedWin = win;
    if (win.minimized) {
      win.minimized = false;
      const e = win.el;
      e.classList.remove('minimized');
      if (!OS.settings.reduceMotion) {
        e.classList.add('restore-anim');
        requestAnimationFrame(() => requestAnimationFrame(() => e.classList.remove('restore-anim')));
      }
    }
    OS.z += 1;
    win.el.style.zIndex = OS.z;
    OS.windows.forEach((w) => w.el.classList.toggle('focused', w === win));
    const mbName = byId('mb-app-name');
    if (mbName) {
      const a = win.appId && APPS[win.appId];
      mbName.textContent = a ? appTitle(a) : 'Nebula';
    }
    updateTaskbar();
    try { win.hooks.focus && win.hooks.focus(); } catch (e) {}
  }

  function minimizeWindow(win) {
    const e = win.el;
    const dur = OS.settings.reduceMotion ? 0 : 165;
    if (dur) e.classList.add('min-anim');
    setTimeout(() => {
      win.minimized = true;
      e.classList.add('minimized');
      e.classList.remove('min-anim');
    }, dur);
    if (focusedWin === win) focusedWin = null;
    updateTaskbar();
    Sound.pop();
  }

  function refreshMaxIcon(win) {
    const btn = win.el.querySelector('[data-act="max"]');
    if (btn) btn.classList.toggle('is-max', !!win.maximized);
    saveWinRect(win);
  }

  function toggleMaximize(win) {
    const e = win.el;
    if (win.maximized) {
      win.maximized = false;
      e.classList.remove('maximized');
      const r = win.lastRect;
      if (r) {
        e.style.left = r.left + 'px'; e.style.top = r.top + 'px';
        e.style.width = r.width + 'px'; e.style.height = r.height + 'px';
      }
    } else {
      win.lastRect = e.getBoundingClientRect();
      win.maximized = true;
      e.classList.add('maximized');
    }
    refreshMaxIcon(win);
    Sound.pop();
  }

  function closeWindow(id) {
    const win = OS.windows.get(id);
    if (!win) return;
    if (win.onClose) { try { win.onClose(win); } catch (e) {} }
    Sound.close();
    saveWinRect(win);
    win.el.classList.add('closing');
    OS.windows.delete(id);
    if (focusedWin === win) {
      focusedWin = null;
      const mbName = byId('mb-app-name');
      if (mbName) mbName.textContent = 'Nebula';
    }
    OS.tasks = OS.tasks.filter((x) => x !== id);
    if (altTab.active) {
      altTab.order = altTab.order.filter((x) => x !== id);
      if (!altTab.order.length) closeAltTab();
      else { renderAltTab(); }
    }
    updateTaskbar();
    setTimeout(() => win.el.remove(), 180);
  }

  function createWindow(opts) {
    const id = opts.id || ('w' + (OS.seq++));
    const existing = OS.windows.get(id);
    if (existing) {
      if (existing.minimized) { existing.minimized = false; existing.el.classList.remove('minimized'); }
      focusWindow(existing);
      return existing;
    }

    const saved = opts.appId ? loadWinRect(opts.appId) : null;
    const W = (saved && saved.w) || opts.width || 640, H = (saved && saved.h) || opts.height || 420;
    const n = OS.tasks.length;
    const elWin = el('section', 'window');
    elWin.dataset.id = id;
    elWin.style.left = (opts.x != null ? opts.x : (saved && saved.x != null ? saved.x : 90 + (n % 7) * 34)) + 'px';
    elWin.style.top = (opts.y != null ? opts.y : (saved && saved.y != null ? saved.y : 54 + (n % 7) * 26)) + 'px';
    elWin.style.width = Math.min(W, innerWidth - 16) + 'px';
    elWin.style.height = Math.min(H, innerHeight - TASKBAR_H - 12) + 'px';
    elWin.innerHTML =
      '<header class="titlebar">' +
        '<div class="win-controls">' +
          '<button class="wc wc-close" data-act="close" title="Close" aria-label="Close"></button>' +
          '<button class="wc wc-min" data-act="min" title="Minimize" aria-label="Minimize"></button>' +
          '<button class="wc wc-max" data-act="max" title="Zoom" aria-label="Zoom"></button>' +
        '</div>' +
        '<span class="win-title">' + escapeHtml(opts.title || 'Window') + '</span>' +
      '</header>' +
      '<div class="win-body"></div>' +
      '<div class="rh rh-n"></div><div class="rh rh-s"></div><div class="rh rh-e"></div><div class="rh rh-w"></div>' +
      '<div class="rh rh-ne"></div><div class="rh rh-nw"></div><div class="rh rh-se"></div><div class="rh rh-sw"></div>';

    const win = {
      id,
      appId: opts.appId || null,
      title: opts.title || 'Window',
      icon: opts.icon || '🪐',
      el: elWin,
      body: elWin.querySelector('.win-body'),
      minimized: false,
      maximized: false,
      lastRect: null,
      hooks: {},
      onClose: opts.onClose || null
    };

    const c = opts.content;
    if (typeof c === 'function') c(win);
    else if (typeof c === 'string') win.body.innerHTML = c;
    else if (c) win.body.appendChild(c);

    elWin.querySelector('[data-act="min"]').addEventListener('click', (e) => { e.stopPropagation(); minimizeWindow(win); });
    elWin.querySelector('[data-act="max"]').addEventListener('click', (e) => { e.stopPropagation(); toggleMaximize(win); });
    elWin.querySelector('[data-act="close"]').addEventListener('click', (e) => { e.stopPropagation(); closeWindow(id); });

    makeDraggable(win);
    makeResizable(win);
    elWin.addEventListener('pointerdown', () => focusWindow(win), true);

    byId('windows').appendChild(elWin);
    elWin.classList.add('opening');
    requestAnimationFrame(() => requestAnimationFrame(() => elWin.classList.remove('opening')));

    OS.windows.set(id, win);
    OS.tasks.push(id);
    updateTaskbar();
    focusWindow(win);
    Sound.open();
    return win;
  }

  /* --- drag + edge snapping --- */
  const snapEl = () => byId('snap-preview');

  function snapRect(side) {
    const W = innerWidth, H = innerHeight - TASKBAR_H;
    if (side === 'top') return { left: 0, top: 0, width: W, height: H };
    if (side === 'left') return { left: 0, top: 0, width: W / 2, height: H };
    if (side === 'right') return { left: W / 2, top: 0, width: W / 2, height: H };
    return null;
  }
  function snapSideOf(cx, cy) {
    if (cy <= 4) return 'top';
    if (cx <= 4) return 'left';
    if (cx >= innerWidth - 4) return 'right';
    return null;
  }
  function showSnapPreview(side) {
    const s = snapEl();
    const r = snapRect(side);
    if (!r) { s.classList.remove('on'); return; }
    Object.assign(s.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    s.classList.add('on');
  }
  function hideSnapPreview() { snapEl().classList.remove('on'); }

  function makeDraggable(win) {
    const bar = win.el.querySelector('.titlebar');
    bar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.wc')) return;
      if (win.maximized) return;
      focusWindow(win);
      const startX = e.clientX, startY = e.clientY;
      const r = win.el.getBoundingClientRect();
      let moved = false;

      const onMove = (ev) => {
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (!moved && Math.hypot(dx, dy) > 4) {
          moved = true;
          win.el.classList.add('dragging');
          document.body.style.userSelect = 'none';
        }
        if (!moved) return;
        const maxX = innerWidth - 90, maxY = innerHeight - TASKBAR_H - 30;
        win.el.style.left = clamp(r.left + dx, -r.width + 110, maxX) + 'px';
        win.el.style.top = clamp(r.top + dy, MENU_H, maxY) + 'px';
        showSnapPreview(snapSideOf(ev.clientX, ev.clientY));
      };
      const onUp = (ev) => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        win.el.classList.remove('dragging');
        document.body.style.userSelect = '';
        hideSnapPreview();
        if (moved) {
          const side = snapSideOf(ev.clientX, ev.clientY);
          if (side) {
            win.lastRect = { left: parseFloat(win.el.style.left), top: parseFloat(win.el.style.top), width: r.width, height: r.height };
            const rr = snapRect(side);
            Object.assign(win.el.style, { left: rr.left + 'px', top: rr.top + 'px', width: rr.width + 'px', height: rr.height + 'px' });
            Sound.pop();
          }
          saveWinRect(win);
        }
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
    bar.addEventListener('dblclick', (e) => {
      if (!e.target.closest('.wc')) toggleMaximize(win);
    });
  }

  function makeResizable(win) {
    win.el.querySelectorAll('.rh').forEach((h) => {
      h.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || win.maximized) return;
        e.preventDefault(); e.stopPropagation();
        focusWindow(win);
        const dir = (h.className.match(/rh-([a-z]+)/) || [])[1] || '';
        const r = win.el.getBoundingClientRect();
        const sx = e.clientX, sy = e.clientY;
        const onMove = (ev) => {
          const dx = ev.clientX - sx, dy = ev.clientY - sy;
          let left = r.left, top = r.top, width = r.width, height = r.height;
          if (dir.includes('e')) width = Math.max(340, r.width + dx);
          if (dir.includes('s')) height = Math.max(240, r.height + dy);
          if (dir.includes('w')) { width = Math.max(340, r.width - dx); left = r.left + (r.width - width); }
          if (dir.includes('n')) { height = Math.max(240, r.height - dy); top = r.top + (r.height - height); }
          Object.assign(win.el.style, { left: left + 'px', top: top + 'px', width: width + 'px', height: height + 'px' });
        };
        const onUp = () => {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          saveWinRect(win);
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
    });
  }

  /* ---------- taskbar ---------- */
  function updateTaskbar() {
    /* macOS dock: every app has a slot; dots mark running apps */
    const bar = byId('taskbar-apps');
    if (!bar) return;
    bar.querySelectorAll('.dock-icon[data-app]').forEach((b) => {
      const appId = b.dataset.app;
      const w = OS.windows.get(appId);
      b.classList.toggle('running', !!w);
      b.classList.toggle('min', !!w && w.minimized);
      b.classList.toggle('focused', !!w && w === focusedWin && !w.minimized);
      const tip = b.querySelector('.dock-tip');
      if (tip) tip.textContent = w && w.title ? w.title : (APPS[appId] ? appTitle(APPS[appId]) : appId);
    });
  }

  /* ---------- Alt+Tab ---------- */
  const altTab = { active: false, index: 0, order: [] };

  function openAltTab() {
    if (isLocked() || OS.windows.size === 0) return;
    altTab.active = true;
    altTab.order = OS.tasks.filter((id) => { const w = OS.windows.get(id); return w && !w.minimized; });
    if (!altTab.order.length) altTab.order = OS.tasks.slice();
    let i = 0;
    if (focusedWin) { i = altTab.order.indexOf(focusedWin.id); if (i === -1) i = 0; }
    altTab.index = i;
    renderAltTab();
    byId('alt-tab').classList.remove('hidden');
    Sound.pop();
  }
  function cycleAltTab(dir) {
    if (!altTab.active || !altTab.order.length) return;
    altTab.index = (altTab.index + dir + altTab.order.length) % altTab.order.length;
    renderAltTab();
  }
  function closeAltTab() {
    if (!altTab.active) return;
    altTab.active = false;
    byId('alt-tab').classList.add('hidden');
    const id = altTab.order[altTab.index];
    const w = id && OS.windows.get(id);
    if (w) focusWindow(w);
  }
  function renderAltTab() {
    const row = byId('alt-tab-row');
    if (!row) return;
    row.innerHTML = '';
    altTab.order.forEach((id, i) => {
      const w = OS.windows.get(id);
      if (!w) return;
      const b = el('button', 'alt-item' + (i === altTab.index ? ' sel' : ''));
      b.innerHTML = appTile(w, 'alt-tile') + '<span>' + escapeHtml(w.title) + '</span>';
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        altTab.index = i;
        closeAltTab();
      });
      row.appendChild(b);
    });
  }

  /* ---------- toasts ---------- */
  function notify(icon, title, body) {
    const wrap = byId('toasts');
    if (!wrap) return;
    const toast = el('div', 'toast');
    toast.innerHTML = '<span class="toast-icon">' + (icon || '💬') + '</span>' +
      '<div><strong>' + escapeHtml(title) + '</strong>' +
      (body ? '<p>' + escapeHtml(body) + '</p>' : '') + '</div>';
    wrap.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    let gone = false;
    const remove = () => {
      if (gone) return; gone = true;
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 280);
    };
    toast.addEventListener('click', remove);
    setTimeout(remove, 5400);
  }

  /* ---------- context menu ---------- */
  function showMenu(x, y, items) {
    const m = byId('ctx-menu');
    if (!m) return;
    m.innerHTML = '';
    items.forEach((it) => {
      if (it === '-') { m.appendChild(el('div', 'ctx-sep')); return; }
      const b = el('button', 'ctx-item');
      b.setAttribute('role', 'menuitem');
      b.innerHTML = '<span>' + (it.icon || '') + '</span>' + escapeHtml(it.label);
      b.addEventListener('click', () => { hideMenu(); it.action && it.action(); });
      m.appendChild(b);
    });
    m.classList.add('open');
    const r = m.getBoundingClientRect();
    m.style.left = clamp(x, 4, innerWidth - r.width - 6) + 'px';
    m.style.top = clamp(y, 4, innerHeight - r.height - 6) + 'px';
  }
  function hideMenu() {
    const m = byId('ctx-menu');
    if (m) m.classList.remove('open');
  }

  /* ---------- modal dialogs ---------- */
  function ask({ title, message, input = true, placeholder = '', value = '', okLabel, cancelLabel }) {
    return new Promise((res) => {
      const root = byId('modal-root');
      const wrap = el('div', 'modal-overlay');
      wrap.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true">' +
          '<div class="modal-title">' + escapeHtml(title) + '</div>' +
          (message ? '<div class="modal-msg">' + escapeHtml(message) + '</div>' : '') +
          (input ? '<input class="modal-input" placeholder="' + escapeHtml(placeholder) + '" value="' + escapeHtml(value) + '" spellcheck="false">' : '') +
          '<div class="modal-actions">' +
            '<button class="btn ghost" data-a="cancel">' + escapeHtml(cancelLabel || t('common.cancel')) + '</button>' +
            '<button class="btn" data-a="ok">' + escapeHtml(okLabel || t('common.ok')) + '</button>' +
          '</div>' +
        '</div>';
      root.appendChild(wrap);
      const inp = wrap.querySelector('.modal-input');
      if (inp) { inp.focus(); inp.select(); }

      let done = false;
      const finish = (v) => {
        if (done) return; done = true;
        wrap.remove();
        res(v);
      };
      wrap.querySelector('[data-a="cancel"]').addEventListener('click', () => finish(null));
      wrap.querySelector('[data-a="ok"]').addEventListener('click', () => finish(inp ? inp.value : ''));
      wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) finish(null); });
      if (inp) inp.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); finish(null); }
        if (e.key === 'Enter') finish(inp.value);
      });
      wrap.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); finish(null); }
        if (e.key === 'Enter' && (!inp || e.target !== inp)) finish(inp ? inp.value : '');
      });
    });
  }
  function confirmDialog(title, message, okLabel) {
    return ask({ title, message, input: false, okLabel: okLabel || t('common.ok') }).then((v) => v !== null);
  }
  OS.ask = ask;
  OS.confirm = confirmDialog;

  /* ---------- clock ---------- */
  function tickClock() {
    const now = new Date();
    byId('tray-time').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    byId('tray-date').textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    if (isLocked()) updateLockTime();
  }

  /* ---------- lock screen ---------- */
  function isLocked() { return byId('lock-screen').classList.contains('hidden') === false; }

  function updateLockTime() {
    const now = new Date();
    byId('lock-time').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    byId('lock-date').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  }

  let pinBuf = '';
  function renderDots() {
    const d = byId('lock-dots');
    if (!d) return;
    d.innerHTML = '';
    for (let i = 0; i < 4; i++) d.appendChild(el('span', 'lock-dot' + (i < pinBuf.length ? ' on' : '')));
  }
  function pinAppend(digit) {
    if (pinBuf.length >= 4) return;
    pinBuf += digit;
    renderDots();
    if (pinBuf.length === 4) {
      if (pinBuf === String(OS.settings.pin)) {
        pinBuf = '';
        renderDots();
        unlockScreen();
      } else {
        Sound.fail();
        const wrap = byId('lock-pin-wrap');
        wrap.classList.add('shake');
        byId('lock-hint').textContent = t('lock.wrong');
        pinBuf = '';
        renderDots();
        setTimeout(() => {
          wrap.classList.remove('shake');
          if (isLocked()) byId('lock-hint').textContent = t('lock.pin');
        }, 420);
      }
    }
  }

  function lockScreen() {
    if (isLocked()) return;
    byId('lock-bg').style.background = WALLPAPERS[OS.settings.wallpaper].css;
    updateLockTime();
    const hasPin = !!OS.settings.pin;
    byId('lock-pin-wrap').classList.toggle('hidden', !hasPin);
    byId('lock-reset').classList.toggle('hidden', !hasPin);
    byId('lock-hint').classList.toggle('hidden', hasPin);
    byId('lock-hint').textContent = hasPin ? t('lock.pin') : t('lock.hint');
    pinBuf = '';
    renderDots();
    byId('lock-screen').classList.remove('hidden');
    document.body.classList.add('locked');
    hideMenu();
    byId('start-menu') && byId('start-menu').classList.remove('open');
    Sound.pop();
  }
  function unlockScreen() {
    byId('lock-screen').classList.add('hidden');
    document.body.classList.remove('locked');
    lastActivity = Date.now();
    Sound.open();
  }

  function buildLock() {
    const pad = byId('lock-pad');
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].forEach((k) => {
      const b = el('button', 'lock-key');
      b.textContent = k;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (k === '⌫') { pinBuf = pinBuf.slice(0, -1); renderDots(); }
        else pinAppend(k);
        Sound.pop();
      });
      pad.appendChild(b);
    });
    byId('lock-reset').addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDialog(t('lock.reset'), t('lock.resetMsg'), t('lock.resetBtn')).then((ok) => {
        if (ok) {
          OS.settings.pin = '';
          OS.saveSettings();
          byId('lock-pin-wrap').classList.add('hidden');
          byId('lock-reset').classList.add('hidden');
          byId('lock-hint').classList.remove('hidden');
          byId('lock-hint').textContent = t('lock.hint');
        }
      });
    });
    byId('lock-screen').addEventListener('pointerdown', (e) => {
      if (e.target.closest('.lock-key') || e.target.closest('.lock-reset') || e.target.closest('.modal-overlay')) return;
      if (!OS.settings.pin) unlockScreen();
    });

    document.addEventListener('keydown', (e) => {
      if (!isLocked()) return;
      if (e.target && e.target.closest && e.target.closest('.modal-overlay')) return;
      if (OS.settings.pin) {
        if (/^[0-9]$/.test(e.key)) { e.preventDefault(); pinAppend(e.key); Sound.pop(); }
        else if (e.key === 'Backspace') { e.preventDefault(); pinBuf = pinBuf.slice(0, -1); renderDots(); }
      } else {
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        e.preventDefault();
        unlockScreen();
      }
    });
  }

  /* ---------- idle / activity ---------- */
  let lastActivity = Date.now();
  ['pointerdown', 'keydown', 'pointermove', 'wheel'].forEach((ev) => {
    document.addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true });
  });

  /* ---------- parallax wallpaper ---------- */
  let pRaf = null;
  function buildParallax() {
    byId('desktop').addEventListener('pointermove', (e) => {
      if (OS.settings.reduceMotion || pRaf || isLocked()) return;
      pRaf = requestAnimationFrame(() => {
        pRaf = null;
        const dx = (e.clientX / innerWidth - 0.5) * 16;
        const dy = (e.clientY / innerHeight - 0.5) * 12;
        const wp = byId('wallpaper');
        if (wp) wp.style.transform = 'scale(1.045) translate(' + (-dx).toFixed(1) + 'px,' + (-dy).toFixed(1) + 'px)';
      });
    });
  }

  /* ---------- start menu ---------- */
  function buildStartMenu() {
    const menu = byId('start-menu');
    const grid = byId('start-grid');
    const search = byId('start-search');

    function render(filter) {
      grid.innerHTML = '';
      const f = (filter || '').toLowerCase();
      const apps = Object.values(APPS).sort((a, b) => appTitle(a).localeCompare(appTitle(b)));
      apps.forEach((a) => {
        const label = appTitle(a);
        if (f && !label.toLowerCase().includes(f)) return;
        const b = el('button', 'start-app');
        b.innerHTML = appTile(a, 'start-app-tile') + '<span>' + escapeHtml(label) + '</span>';
        b.addEventListener('click', () => { openApp(a.id); closeStart(); });
        grid.appendChild(b);
      });
      if (!grid.children.length) grid.appendChild(el('div', 'start-empty', 'No apps found'));
    }
    OS._startRender = render;

    search.addEventListener('input', () => render(search.value));
    render('');

    const open = () => { menu.classList.add('open'); search.value = ''; render(''); setTimeout(() => search.focus(), 40); };
    const close = () => menu.classList.remove('open');
    const toggle = () => menu.classList.contains('open') ? close() : open();
    function closeStart() { close(); }

    byId('start-btn').addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    menu.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('#start-menu') && !e.target.closest('#start-btn')) close();
    });
    byId('start-lock').addEventListener('click', () => { close(); lockScreen(); });
    byId('start-restart').addEventListener('click', () => location.reload());
    byId('start-shutdown').addEventListener('click', () => {
      Sound.close();
      close();
      byId('shutdown').classList.remove('hidden');
    });
    byId('shutdown-restart').addEventListener('click', () => location.reload());
    byId('tray-clock').addEventListener('click', () => openApp('clock'));
  }

  /* ---------- desktop icons (interactive) ---------- */
  const DESKTOP_APPS = ['files', 'terminal', 'code', 'notes', 'reminders', 'browser', 'paint', 'beats', 'youtube', 'maps', 'calc', 'clock', 'weather', 'stocks', 'monitor', 'android', 'calendar', 'snake', 'settings', 'about'];

  let desktopState = loadDesktopState();
  function loadDesktopState() {
    // NB: runs before app registration — renderDesktopIcons() skips unknown ids
    const st = Object.assign({ icons: DESKTOP_APPS.slice() }, safeJson(localStorage.getItem(LS_DESKTOP)));
    if (!Array.isArray(st.icons) || !st.icons.length) st.icons = DESKTOP_APPS.slice();
    return st;
  }
  function saveDesktopState() {
    try { localStorage.setItem(LS_DESKTOP, JSON.stringify(desktopState)); } catch (e) {}
  }
  function iconLabel(a) { return a._customTitle || appTitle(a); }

  function makeIcon(id) {
    const a = APPS[id];
    const ic = el('div', 'desktop-icon');
    ic.dataset.app = id;
    ic.innerHTML = appTile(a, 'di-tile') + '<span class="di-label">' + escapeHtml(iconLabel(a)) + '</span>';
    ic.addEventListener('click', () => {
      if (iconDrag.suppressClick) return;
      const wasSelected = ic.classList.contains('sel');
      selectIconNode(ic, true);
      if (wasSelected) openApp(id); // second click (macOS click-to-open)
      else Sound.pop();
    });
    ic.addEventListener('dblclick', () => {
      if (iconDrag.suppressClick) return;
      openApp(id);
    });
    ic.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      showMenu(e.clientX, e.clientY, [
        { label: t('icon.open'), icon: '🚀', action: () => openApp(id) },
        '-',
        {
          label: t('common.rename'), icon: '✏️',
          action: () => ask({
            title: t('common.rename'), message: a.title || id, value: iconLabel(a), okLabel: t('common.rename')
          }).then((v) => {
            if (v && v.trim()) {
              a._customTitle = v.trim();
              document.querySelectorAll('.desktop-icon[data-app="' + id + '"] .di-label').forEach((n) => { n.textContent = a._customTitle; });
              if (OS._startRender) OS._startRender('');
              updateTaskbar();
            }
          })
        },
        { label: t('icon.unpin'), icon: '📌', action: () => unpinIcon(id) }
      ]);
    });
    ic.addEventListener('pointerdown', (e) => startIconDrag(e, id, ic));
    return ic;
  }

  function renderDesktopIcons() {
    const d = byId('desktop-icons');
    if (!d) return;
    d.innerHTML = '';
    desktopState.icons.forEach((id) => {
      if (!APPS[id]) return;
      if (iconDrag.moved && id === iconDrag.id) return; // floating copy lives in <body>
      d.appendChild(makeIcon(id));
    });
  }

  function selectIconNode(ic, on) {
    document.querySelectorAll('#desktop-icons .desktop-icon.sel').forEach((x) => x.classList.remove('sel'));
    if (on && ic) ic.classList.add('sel');
  }

  function unpinIcon(id) {
    desktopState.icons = desktopState.icons.filter((x) => x !== id);
    saveDesktopState();
    renderDesktopIcons();
    notify('📌', 'Unpinned', iconLabel(APPS[id]));
  }

  function arrangeIcons() {
    desktopState.icons = DESKTOP_APPS.slice().filter((id) => APPS[id]);
    saveDesktopState();
    renderDesktopIcons();
    notify('🧲', 'Icons arranged', OS.name);
  }

  function showDesktopAction() {
    let any = false;
    OS.windows.forEach((w) => { if (!w.minimized) { any = true; minimizeWindow(w); } });
    if (!any) {
      const last = OS.tasks[OS.tasks.length - 1];
      const w = last && OS.windows.get(last);
      if (w && w.minimized) { w.minimized = false; w.el.classList.remove('minimized'); focusWindow(w); }
      else Sound.pop();
    }
  }

  /* ---------- dock (macOS style) ---------- */
  const DOCK_APPS = DESKTOP_APPS; // same order as the desktop

  function buildDock() {
    const bar = byId('taskbar-apps');
    if (!bar) return;
    bar.innerHTML = '';
    DOCK_APPS.forEach((id) => {
      const a = APPS[id];
      if (!a) return;
      const b = el('button', 'dock-icon');
      b.dataset.app = id;
      b.title = iconLabel(a);
      b.setAttribute('aria-label', iconLabel(a));
      b.innerHTML = appTile(a, 'dock-tile') + '<span class="dock-tip">' + escapeHtml(iconLabel(a)) + '</span><span class="dock-dot"></span>';
      b.addEventListener('click', () => openApp(id));
      bar.appendChild(b);
    });

    /* icon magnification — CSS transforms only, rAF-throttled */
    const dock = byId('dock');
    if (!dock) return;
    let mRaf = null;
    dock.addEventListener('pointermove', (e) => {
      if (OS.settings.reduceMotion || mRaf || e.pointerType === 'touch') return;
      if (dock.scrollWidth > dock.clientWidth + 1) return; // scrollable dock: skip magnification
      mRaf = requestAnimationFrame(() => {
        mRaf = null;
        dock.querySelectorAll('.dock-icon').forEach((ic) => {
          const r = ic.getBoundingClientRect();
          if (!r.width) return;
          const dx = e.clientX - (r.left + r.width / 2);
          const sigma = 62;
          const sc = 1 + 0.55 * Math.exp(-(dx * dx) / (2 * sigma * sigma));
          ic.style.transform = 'translateY(' + (-(sc - 1) * 22).toFixed(1) + 'px) scale(' + sc.toFixed(3) + ')';
        });
      });
    });
    dock.addEventListener('pointerleave', () => {
      dock.querySelectorAll('.dock-icon').forEach((ic) => { ic.style.transform = ''; });
    });
  }

  /* ---------- spotlight (Ctrl/Cmd+Space) ---------- */
  function buildSpotlight() {
    const box = byId('spotlight');
    const input = byId('spot-input');
    const res = byId('spot-results');
    if (!box || !input || !res) return;
    let items = [];
    let selIdx = 0;

    function paint() {
      res.innerHTML = '';
      items.forEach((it, i) => {
        const b = el('button', 'spot-item' + (i === selIdx ? ' sel' : ''));
        b.innerHTML = '<span class="spot-ic">' + (it.icon || '') + '</span><span>' + escapeHtml(it.label) +
          (it.sub ? '<small>' + escapeHtml(it.sub) + '</small>' : '') + '</span>';
        b.addEventListener('click', () => { it.run(); close(); });
        res.appendChild(b);
      });
      if (!items.length) res.appendChild(el('div', 'spot-empty', 'No results'));
    }
    function compute() {
      const q = input.value.trim().toLowerCase();
      const list = [];
      if (/^[\d+\-*/().%\s]+$/.test(q) && /\d/.test(q)) {
        try {
          const v = new Function('return (' + q + ')')();
          if (isFinite(v)) list.push({ icon: '🧮', label: q + ' = ' + v, sub: 'Math', run: () => notify('🧮', 'Calculator', q + ' = ' + v) });
        } catch (e) {}
      }
      Object.values(APPS).forEach((a) => {
        const label = appTitle(a);
        if (!q || label.toLowerCase().includes(q) || a.id.includes(q)) list.push({ icon: a.icon || '🪐', label, sub: t('spot.launch'), run: () => openApp(a.id) });
      });
      if (q.length >= 2) {
        const found = [];
        (function walk(n, p) {
          (n.children || []).forEach((c) => {
            const pp = p + '/' + c.name;
            if (c.type === 'dir') walk(c, pp);
            else if (c.name.toLowerCase().includes(q)) found.push(c);
          });
        })((window.NebulaFS && NebulaFS.fs.root), '');
        found.forEach((f) => list.push({ icon: '📄', label: f.name, sub: f.path, run: () => { openApp('files'); notify('📄', f.name, f.path); } }));
      }
      if (!q || q === 'lock') list.push({ icon: '🔒', label: t('ctx.lock'), run: lockScreen });
      if (!q || q.includes('theme')) list.push({ icon: '🌓', label: t('ctx.theme'), run: toggleTheme });
      if (!q || q.includes('desktop')) list.push({ icon: '🖥️', label: t('taskbar.showDesktop'), run: showDesktopAction });
      return list.slice(0, 9);
    }
    function render() { items = compute(); selIdx = 0; paint(); }
    function open() {
      box.classList.remove('hidden');
      input.value = '';
      input.placeholder = t('spot.hint');
      render();
      input.focus();
      Sound.pop();
    }
    function close() { box.classList.add('hidden'); }

    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (items[selIdx]) { items[selIdx].run(); close(); } }
      else if (e.key === 'Escape') { e.stopPropagation(); close(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!items.length) return;
        selIdx = (selIdx + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
        paint();
      }
    });
    box.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('#spotlight')) close();
    }, true);
    byId('mb-search').addEventListener('click', (e) => {
      e.stopPropagation();
      if (box.classList.contains('hidden')) open();
      else close();
    });
    OS._spotlight = { open, close };
  }

  /* ---------- mission control (Ctrl/Cmd+`) ---------- */
  function openMission() {
    const grid = byId('mission-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const wins = OS.tasks.map((id) => OS.windows.get(id)).filter(Boolean);
    if (!wins.length) grid.appendChild(el('div', 'mc-empty', 'No windows open'));
    wins.forEach((w) => {
      const card = el('div', 'mc-card' + (w.minimized ? ' min' : ''));
      card.innerHTML = appTile(w, 'mc-tile') + '<span class="mc-title">' + escapeHtml(w.title) + '</span>';
      card.addEventListener('click', () => {
        closeMission();
        if (w.minimized) { w.minimized = false; w.el.classList.remove('minimized'); }
        focusWindow(w);
      });
      grid.appendChild(card);
    });
    byId('mission').classList.remove('hidden');
    Sound.pop();
  }
  function closeMission() {
    const m = byId('mission');
    if (m) m.classList.add('hidden');
  }
  function toggleMission() {
    const m = byId('mission');
    if (!m) return;
    if (m.classList.contains('hidden')) openMission();
    else closeMission();
  }

  /* ---------- assistant (natural-language commands, fully offline) ---------- */
  function assistantReply(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return 'I\u2019m listening. Try “open maps”.';
    let m;
    if ((m = s.match(/^(?:open|launch|start)\s+(.+)$/))) {
      const name = m[1].trim();
      const a = Object.values(APPS).find((x) => appTitle(x).toLowerCase().includes(name) || x.id.includes(name));
      if (a) { openApp(a.id); return 'Opening ' + appTitle(a) + '…'; }
      return 'I couldn\u2019t find an app named “' + name + '”.';
    }
    if (/next wallpaper|change wallpaper/.test(s)) { cycleWallpaper(); return 'Wallpaper: ' + WALLPAPERS[OS.settings.wallpaper].name; }
    if ((m = s.match(/wallpaper[\s:]+(\d+|[a-z]+)/))) {
      const arg = m[1];
      const i = /^\d+$/.test(arg) ? parseInt(arg, 10) - 1 : WALLPAPERS.findIndex((w) => w.name.toLowerCase().includes(arg));
      if (i >= 0) { OS.settings.wallpaper = i; OS.saveSettings(); OS.applySettings(); return 'Wallpaper: ' + WALLPAPERS[i].name; }
    }
    if (s.includes('theme')) { toggleTheme(); return (OS.settings.theme === 'dark' ? 'Dark' : 'Light') + ' theme on.'; }
    if (s.includes('show desktop')) { showDesktopAction(); return 'Show desktop.'; }
    if (s.includes('lock')) { lockScreen(); return 'Locked. See you soon. 🔒'; }
    if (s.includes('time')) return 'It\u2019s ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '.';
    if (s.includes('date')) return 'Today is ' + new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) + '.';
    if ((m = s.match(/(?:what is|what's|calculate|calc)\s+([\d+\-*/().%\s]+)/))) {
      try { const v = new Function('return (' + m[1] + ')')(); if (isFinite(v)) return m[1].trim() + ' = ' + v; } catch (e) {}
    }
    if (s.includes('about')) { openApp('about'); return 'About Nebula OS. 🪐'; }
    if (s.includes('mission')) { toggleMission(); return 'Mission Control.'; }
    return 'Try: “open maps” · “next wallpaper” · “lock” · “what is 6×7”';
  }
  function buildAssistant() {
    const panel = byId('asst-panel');
    const input = byId('asst-input');
    const out = byId('asst-out');
    if (!panel || !input || !out) return;
    const btn = byId('mb-asst');
    const close = () => panel.classList.remove('open');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (panel.classList.contains('open')) close();
      else { panel.classList.add('open'); input.value = ''; input.focus(); Sound.pop(); }
    });
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('#asst-panel') && !e.target.closest('#mb-asst')) close();
    }, true);
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const reply = assistantReply(input.value);
      out.textContent = reply;
      input.value = '';
      Sound.pop();
    });
  }

  /* ---------- menu bar (macOS style) ---------- */
  function buildMenuBar() {
    const items = Array.prototype.slice.call(document.querySelectorAll('#menubar .mb-item[data-menu]'));
    if (!items.length) return;
    const closeMenus = () => items.forEach((it) => it.classList.remove('open'));
    const openMenu = (it) => { closeMenus(); it.classList.add('open'); };
    items.forEach((it) => {
      it.addEventListener('click', (e) => {
        e.stopPropagation();
        if (it.classList.contains('open')) closeMenus();
        else openMenu(it);
      });
      it.addEventListener('mouseenter', () => {
        if (items.some((x) => x.classList.contains('open')) && !it.classList.contains('open')) openMenu(it);
      });
      it.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); it.click(); }
      });
    });
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('#menubar')) closeMenus();
    }, true);

    const acts = {
      about: () => openApp('about'),
      settings: () => openApp('settings'),
      lock: () => lockScreen(),
      restart: () => location.reload(),
      shutdown: () => { Sound.close(); closeMenus(); byId('shutdown').classList.remove('hidden'); },
      newNote: () => openApp('notes', { fresh: true }),
      terminal: () => openApp('terminal'),
      code: () => openApp('code'),
      files: () => openApp('files'),
      wallpaper: () => cycleWallpaper(),
      theme: () => toggleTheme(),
      arrange: () => arrangeIcons(),
      showDesktop: () => showDesktopAction(),
      mission: () => toggleMission(),
      min: () => { if (focusedWin) minimizeWindow(focusedWin); },
      zoom: () => { if (focusedWin) toggleMaximize(focusedWin); },
      showAll: () => OS.windows.forEach((w) => { if (w.minimized) { w.minimized = false; w.el.classList.remove('minimized'); } })
    };
    document.querySelectorAll('.mb-mi').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenus();
        const fn = acts[b.dataset.act];
        if (fn) fn();
      });
    });
    OS._closeMbMenus = closeMenus;
  }

  /* --- drag & drop reordering --- */
  const iconDrag = { id: null, el: null, sx: 0, sy: 0, offX: 0, offY: 0, w: 0, moved: false, suppressClick: false };

  function startIconDrag(e, id, ic) {
    if (e.button !== 0 || iconDrag.moved) return;
    const r = ic.getBoundingClientRect();
    Object.assign(iconDrag, {
      id, el: ic, sx: e.clientX, sy: e.clientY,
      offX: e.clientX - r.left, offY: e.clientY - r.top,
      w: r.width || 88, moved: false, suppressClick: false
    });

    const onMove = (ev) => {
      const dx = ev.clientX - iconDrag.sx, dy = ev.clientY - iconDrag.sy;
      if (!iconDrag.moved && Math.hypot(dx, dy) > 6) {
        iconDrag.moved = true;
        iconDrag.suppressClick = true;
        const el = iconDrag.el;
        el.classList.add('di-drag');
        el.style.width = iconDrag.w + 'px';
        document.body.appendChild(el); // float above the grid
        document.body.style.userSelect = 'none';
      }
      if (!iconDrag.moved) return;
      const el = iconDrag.el;
      el.style.left = (ev.clientX - iconDrag.offX) + 'px';
      el.style.top = (ev.clientY - iconDrag.offY) + 'px';
      ev.preventDefault();
      reorderLive(iconDrag.id, ev);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      document.body.style.userSelect = '';
      const el = iconDrag.el;
      const wasDragged = iconDrag.moved;
      iconDrag.moved = false;
      iconDrag.el = null;
      if (wasDragged) {
        el.classList.remove('di-drag');
        el.remove();
        renderDesktopIcons();
        saveDesktopState();
        const fresh = byId('desktop-icons').querySelector('.desktop-icon[data-app="' + iconDrag.id + '"]');
        if (fresh) selectIconNode(fresh, true);
        Sound.pop();
        setTimeout(() => { iconDrag.suppressClick = false; }, 120);
      }
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }

  function reorderLive(id, ev) {
    const d = byId('desktop-icons');
    const others = Array.prototype.filter.call(d.querySelectorAll('.desktop-icon'), (x) => x.dataset.app !== id);
    let best = null, bestD = Infinity;
    others.forEach((x) => {
      const r = x.getBoundingClientRect();
      if (!r.width && !r.height) return; // no layout info (headless) — skip
      const dist = Math.hypot(r.left + r.width / 2 - ev.clientX, r.top + r.height / 2 - ev.clientY);
      if (dist < bestD) { bestD = dist; best = x; }
    });
    if (!best || bestD > 320) return;
    const from = desktopState.icons.indexOf(id);
    const to = desktopState.icons.indexOf(best.dataset.app);
    if (from === -1 || to === -1) return;
    const br = best.getBoundingClientRect();
    const after = ev.clientY > br.top + br.height / 2 || (ev.clientX > br.left + br.width / 2 && ev.clientY >= br.top);
    const at = after ? to + 1 : to;
    if (at === from || at === from + 1) return;
    desktopState.icons.splice(from, 1);
    desktopState.icons.splice(at > from ? at - 1 : at, 0, id);
    renderDesktopIcons();
  }

  /* --- keyboard navigation --- */
  function desktopNav(e) {
    const d = byId('desktop-icons');
    if (!d) return;
    const icons = Array.prototype.slice.call(d.querySelectorAll('.desktop-icon'));
    if (!icons.length) return;
    const curEl = d.querySelector('.desktop-icon.sel');
    const cur = icons.indexOf(curEl);
    const pick = (ic) => {
      selectIconNode(ic, true);
      if (ic.scrollIntoView) ic.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      Sound.pop();
    };
    const rowsOf = () => {
      const map = {};
      icons.forEach((ic) => {
        const r = ic.getBoundingClientRect();
        const k = Math.round(r.top / 10);
        (map[k] = map[k] || []).push(ic);
      });
      return Object.keys(map).map(Number).sort((a, b) => a - b).map((k) =>
        map[k].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
      );
    };
    const nearX = (row, x) => {
      let best = row[0], bd = Infinity;
      row.forEach((ic) => { const dd = Math.abs(ic.getBoundingClientRect().left - x); if (dd < bd) { bd = dd; best = ic; } });
      return best;
    };

    if (e.key === 'Tab') {
      e.preventDefault();
      pick(icons[(cur + (e.shiftKey ? -1 : 1) + icons.length) % icons.length]);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      if (cur >= 0) { e.preventDefault(); openApp(icons[cur].dataset.app); }
      return;
    }
    if (e.key === 'Escape') { selectIconNode(curEl, false); return; }
    if (!/^Arrow/.test(e.key) || cur === -1) return;
    e.preventDefault();
    const rows = rowsOf();
    const ri = rows.findIndex((r) => r.includes(icons[cur]));
    if (ri === -1) { pick(icons[0]); return; }
    const row = rows[ri];
    const ci = row.indexOf(icons[cur]);
    const x = icons[cur].getBoundingClientRect().left;
    let next = null;
    if (e.key === 'ArrowRight') next = ci + 1 < row.length ? row[ci + 1] : (rows[ri + 1] && nearX(rows[ri + 1], x)) || null;
    else if (e.key === 'ArrowLeft') next = ci > 0 ? row[ci - 1] : (rows[ri - 1] && nearX(rows[ri - 1], x)) || null;
    else if (e.key === 'ArrowDown') next = rows[ri + 1] && nearX(rows[ri + 1], x);
    else if (e.key === 'ArrowUp') next = rows[ri - 1] && nearX(rows[ri - 1], x);
    if (next) pick(next);
  }

  function buildDesktop() {
    renderDesktopIcons();
    document.body.addEventListener('click', (e) => {
      if (iconDrag.suppressClick) return;
      if (e.target && e.target.closest && e.target.closest('#desktop-icons .desktop-icon')) return;
      document.querySelectorAll('#desktop-icons .desktop-icon.sel').forEach((x) => x.classList.remove('sel'));
    });

    byId('wallpaper').addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showMenu(e.clientX, e.clientY, [
        { label: t('ctx.newNote'), icon: '📝', action: () => openApp('notes', { fresh: true }) },
        { label: t('ctx.terminal'), icon: '⬛', action: () => openApp('terminal') },
        { label: t('ctx.arrange'), icon: '🧲', action: arrangeIcons },
        '-',
        { label: t('ctx.wallpaper'), icon: '🖼️', action: cycleWallpaper },
        { label: t('ctx.theme'), icon: '🌓', action: toggleTheme },
        { label: t('ctx.lock'), icon: '🔒', action: lockScreen },
        '-',
        { label: t('ctx.about'), icon: '🪐', action: () => openApp('about') }
      ]);
    });
  }

  function toggleTheme() {
    OS.settings.theme = OS.settings.theme === 'dark' ? 'light' : 'dark';
    OS.saveSettings();
    OS.applySettings();
    notify('🌓', OS.settings.theme === 'dark' ? 'Dark theme' : 'Light theme', OS.name + ' · ' + OS.settings.theme);
  }

  function cycleWallpaper() {
    OS.settings.wallpaper = (OS.settings.wallpaper + 1) % WALLPAPERS.length;
    OS.saveSettings();
    OS.applySettings();
    notify('🖼️', 'Wallpaper', WALLPAPERS[OS.settings.wallpaper].name);
  }

  /* ---------- i18n ---------- */
  function applyI18n() {
    I18N.set(OS.settings.language);
    document.documentElement.lang = I18N.lang;
    document.documentElement.dir = I18N.rtl ? 'rtl' : 'ltr';
    document.title = t('doc.title');
    const sub = byId('boot-sub');
    if (sub) sub.textContent = t('boot.sub');
    const userName = byId('start-user-name');
    if (userName) userName.textContent = t('start.user');
    byId('start-search').placeholder = t('start.search');
    byId('start-lock').title = t('start.lock');
    byId('start-restart').title = t('start.restart');
    byId('start-shutdown').title = t('start.shutdown');
    byId('tray-wifi').title = t('tray.wifi');
    byId('tray-vol').title = t('tray.vol');
    byId('tray-batt').title = t('tray.batt');
    byId('tray-clock').title = t('tray.clock');
    const sdBtn = byId('show-desktop');
    if (sdBtn) sdBtn.title = t('taskbar.showDesktop');
    if (isLocked()) {
      byId('lock-hint').textContent = OS.settings.pin ? t('lock.pin') : t('lock.hint');
      byId('lock-reset').textContent = t('lock.reset');
    }
    document.querySelectorAll('.desktop-icon').forEach((ic) => {
      const a = APPS[ic.dataset.app];
      if (a) ic.querySelector('.di-label').textContent = a._customTitle || appTitle(a);
    });
    if (OS._startRender) OS._startRender(byId('start-search').value);
    OS.windows.forEach((w) => {
      const a = w.appId && APPS[w.appId];
      if (a) {
        w.title = a._customTitle || appTitle(a);
        const titleEl = w.el.querySelector('.win-title');
        if (titleEl) titleEl.textContent = w.title;
      }
    });
    updateTaskbar();
    document.querySelectorAll('#menubar [data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
    document.querySelectorAll('#dock .dock-icon[data-app]').forEach((b) => {
      const a = APPS[b.dataset.app];
      if (a) {
        const tip = b.querySelector('.dock-tip');
        if (tip) tip.textContent = iconLabel(a);
        b.title = iconLabel(a);
        b.setAttribute('aria-label', iconLabel(a));
      }
    });
    const lp = byId('start-btn');
    if (lp) { lp.title = t('dock.launchpad'); lp.setAttribute('aria-label', t('dock.launchpad')); }
    const si = byId('spot-input');
    if (si) si.placeholder = t('spot.hint');
    const ai = byId('asst-input');
    if (ai) ai.placeholder = t('asst.hint');
    if (OS._refreshSettings) OS._refreshSettings();
  }
  OS.setLanguage = function (lang) {
    OS.settings.language = lang;
    OS.saveSettings();
    applyI18n();
    notify('🌐', 'Language', I18N.LANGS.find((l) => l.id === lang).name);
  };

  /* ---------- boot ---------- */
  function boot() {
    const bar = byId('boot-bar');
    let p = 0;
    const t2 = setInterval(() => {
      p = Math.min(100, p + 9 + Math.random() * 18);
      bar.style.width = p + '%';
      if (p >= 100) {
        clearInterval(t2);
        setTimeout(() => {
          byId('boot').classList.add('done');
          setTimeout(() => {
            const b = byId('boot');
            if (b) b.remove();
            byId('desktop').classList.remove('hidden');
          }, 640);
        }, 420);
      }
    }, 170);
  }

  /* ---------- init ---------- */
  OS.init = function () {
    OS.applySettings();
    applyI18n();
    buildLock();
    buildParallax();
    buildMenuBar();
    buildDock();
    buildDesktop();
    buildStartMenu();
    buildSpotlight();
    buildAssistant();
    tickClock();
    setInterval(tickClock, 1000);
    setInterval(() => {
      if (OS.settings.idleLock && !isLocked() &&
          (Date.now() - lastActivity) > OS.settings.idleMinutes * 60000) lockScreen();
    }, 20000);

    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('#ctx-menu')) hideMenu();
    }, true);

    /* show desktop / minimize all (dock edge) */
    const sdBtn = byId('show-desktop');
    if (sdBtn) sdBtn.addEventListener('click', () => showDesktopAction());

    /* global keyboard shortcuts */
    document.addEventListener('keydown', (e) => {
      if (isLocked()) return;
      if (e.altKey && e.key === 'Tab') {
        e.preventDefault();
        if (!altTab.active) openAltTab();
        else cycleAltTab(e.shiftKey ? -1 : 1);
      } else if (e.altKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        lockScreen();
      } else if (e.key === 'Escape') {
        closeAltTab();
        byId('start-menu').classList.remove('open');
        hideMenu();
        if (OS._closeMbMenus) OS._closeMbMenus();
        closeMission();
        if (OS._spotlight) OS._spotlight.close();
        if (focusedWin === null) {
          document.querySelectorAll('#desktop-icons .desktop-icon.sel').forEach((x) => x.classList.remove('sel'));
        }
      } else if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'q' && e.ctrlKey && e.metaKey) { e.preventDefault(); lockScreen(); return; }
        if (k === ' ' && OS._spotlight) { e.preventDefault(); byId('spotlight').classList.contains('hidden') ? OS._spotlight.open() : OS._spotlight.close(); return; }
        if (e.key === '`') { e.preventDefault(); toggleMission(); return; }
        if (k === 'n') { e.preventDefault(); openApp('notes', { fresh: true }); }
        else if (k === 't') { e.preventDefault(); openApp('terminal'); }
        else if (k === 'd') { e.preventDefault(); cycleWallpaper(); }
      } else if (!altTab.active && focusedWin === null && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const tgt = e.target;
        if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable)) return;
        desktopNav(e);
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Alt' && altTab.active) closeAltTab();
    });

    /* first-interaction boot chime */
    let chimed = false;
    document.addEventListener('pointerdown', () => {
      if (!chimed) { chimed = true; Sound.chime(); }
    });

    boot();
    setTimeout(() => {
      if (!localStorage.getItem('nebula.welcomed')) {
        localStorage.setItem('nebula.welcomed', '1');
        notify('🪐', t('welcome.title'), t('welcome.body'));
      }
    }, 1700);
  };

  /* ---------- public API ---------- */
  window.OS = OS;
  window.APPS = APPS;
  window.WALLPAPERS = WALLPAPERS;
  window.TASKBAR_H = TASKBAR_H;
  window.registerApp = registerApp;
  window.openApp = openApp;
  window.createWindow = createWindow;
  window.closeWindow = closeWindow;
  window.focusWindow = focusWindow;
  window.notify = notify;
  window.ask = ask;
  window.confirmDialog = confirmDialog;
  window.Sound = Sound;
  window.esc = escapeHtml;
  window.$el = el;
  window.$id = byId;
  window.clampNum = clamp;
  window.fmtBytes = fmtBytes;
  window.t = t;
  window.appTitle = appTitle;
  window.lockScreen = lockScreen;
})();
