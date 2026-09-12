/* ============================================================
   NEBULA OS — kernel
   Window manager · taskbar · start menu · dialogs · toasts
   ============================================================ */
(function () {
  'use strict';

  const TASKBAR_H = 56;
  const LS_SETTINGS = 'nebula.settings.v1';

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

  /* ---------- settings ---------- */
  const DEFAULT_SETTINGS = {
    wallpaper: 0,
    accent: '#7c6cff',
    theme: 'dark',
    sound: true,
    reduceMotion: false
  };

  const WALLPAPERS = [
    { name: 'Nebula', css: 'radial-gradient(1100px 750px at 78% -12%, #43348f 0%, rgba(67,52,143,0) 60%), radial-gradient(900px 650px at 12% 112%, #123c5e 0%, rgba(18,60,94,0) 55%), linear-gradient(158deg, #070a18 0%, #0b1030 48%, #141a3f 100%)' },
    { name: 'Aurora', css: 'radial-gradient(1000px 500px at 22% -8%, rgba(45,212,191,.4) 0%, rgba(45,212,191,0) 55%), radial-gradient(900px 600px at 85% 8%, rgba(16,185,129,.3) 0%, rgba(16,185,129,0) 55%), linear-gradient(180deg, #020617 0%, #062019 60%, #04140f 100%)' },
    { name: 'Sunset', css: 'radial-gradient(900px 500px at 50% 118%, rgba(251,146,60,.55) 0%, rgba(251,146,60,0) 60%), radial-gradient(800px 500px at 82% -10%, rgba(217,70,239,.35) 0%, rgba(217,70,239,0) 55%), linear-gradient(180deg, #170b2b 0%, #3b1444 55%, #7c2d4e 100%)' },
    { name: 'Ocean', css: 'radial-gradient(1100px 700px at 70% 120%, rgba(14,165,233,.5) 0%, rgba(14,165,233,0) 60%), radial-gradient(800px 500px at 15% -15%, rgba(34,211,238,.28) 0%, rgba(34,211,238,0) 55%), linear-gradient(180deg, #030b1d 0%, #07234a 55%, #0a3a66 100%)' },
    { name: 'Ember', css: 'radial-gradient(1000px 650px at 20% 115%, rgba(239,68,68,.42) 0%, rgba(239,68,68,0) 60%), radial-gradient(900px 550px at 88% -12%, rgba(249,115,22,.3) 0%, rgba(249,115,22,0) 55%), linear-gradient(165deg, #160607 0%, #33100c 55%, #57200e 100%)' },
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
    version: '1.0.0',
    startedAt: Date.now(),
    z: 100,
    seq: 1,
    windows: new Map(),   // id -> win
    tasks: [],            // ordered window ids
    settings: Object.assign({}, DEFAULT_SETTINGS, safeJson(localStorage.getItem(LS_SETTINGS))),
    _startRender: null
  };

  function safeJson(s) { try { return JSON.parse(s) || {}; } catch (e) { return {}; } }
  OS.saveSettings = function () {
    try { localStorage.setItem(LS_SETTINGS, JSON.stringify(OS.settings)); } catch (e) {}
  };

  function applyWallpaper(i) {
    const wp = byId('wallpaper');
    if (!wp) return;
    wp.style.background = WALLPAPERS[i].css;
  }

  OS.applySettings = function () {
    document.body.dataset.theme = OS.settings.theme;
    document.body.dataset.motion = OS.settings.reduceMotion ? 'reduce' : 'full';
    document.documentElement.style.setProperty('--accent', OS.settings.accent);
    const vol = byId('tray-vol');
    if (vol) vol.style.opacity = OS.settings.sound ? '1' : '.35';
    applyWallpaper(OS.settings.wallpaper);
  };

  /* ---------- sound ---------- */
  const Sound = {
    ctx: null,
    ensure() {
      if (!this.ctx) {
        try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ }
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
    pop() { this.blip(880, 0.045, 'triangle', 0.025); }
  };

  /* ---------- app registry ---------- */
  const APPS = {};
  function registerApp(app) { APPS[app.id] = app; }
  function openApp(id, args) {
    const a = APPS[id];
    if (!a) { notify('⚠️', 'Unknown app', `No app registered as "${id}".`); return; }
    a.open(args);
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
      win.el.classList.remove('minimized');
    }
    OS.z += 1;
    win.el.style.zIndex = OS.z;
    OS.windows.forEach((w) => w.el.classList.toggle('focused', w === win));
    updateTaskbar();
    try { win.hooks.focus && win.hooks.focus(); } catch (e) {}
  }

  function minimizeWindow(win) {
    win.minimized = true;
    win.el.classList.add('minimized');
    if (focusedWin === win) focusedWin = null;
    updateTaskbar();
    Sound.pop();
  }

  function refreshMaxIcon(win) {
    const btn = win.el.querySelector('[data-act="max"]');
    if (btn) btn.innerHTML = win.maximized ? ICONS.restore : ICONS.max;
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
    win.el.classList.add('closing');
    OS.windows.delete(id);
    OS.tasks = OS.tasks.filter((x) => x !== id);
    if (focusedWin === win) focusedWin = null;
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

    const W = opts.width || 640, H = opts.height || 420;
    const n = OS.tasks.length;
    const elWin = el('section', 'window');
    elWin.dataset.id = id;
    elWin.style.left = (opts.x != null ? opts.x : 90 + (n % 7) * 34) + 'px';
    elWin.style.top = (opts.y != null ? opts.y : 54 + (n % 7) * 26) + 'px';
    elWin.style.width = Math.min(W, innerWidth - 16) + 'px';
    elWin.style.height = Math.min(H, innerHeight - TASKBAR_H - 12) + 'px';
    elWin.innerHTML =
      '<header class="titlebar">' +
        '<div class="titlebar-left"><span class="win-icon">' + (opts.icon || '🪐') + '</span>' +
        '<span class="win-title">' + escapeHtml(opts.title || 'Window') + '</span></div>' +
        '<div class="win-controls">' +
          '<button class="wc" data-act="min" title="Minimize" aria-label="Minimize">' + ICONS.min + '</button>' +
          '<button class="wc" data-act="max" title="Maximize" aria-label="Maximize">' + ICONS.max + '</button>' +
          '<button class="wc wc-close" data-act="close" title="Close" aria-label="Close">' + ICONS.close + '</button>' +
        '</div>' +
      '</header>' +
      '<div class="win-body"></div>' +
      '<div class="rh rh-n"></div><div class="rh rh-s"></div><div class="rh rh-e"></div><div class="rh rh-w"></div>' +
      '<div class="rh rh-ne"></div><div class="rh rh-nw"></div><div class="rh rh-se"></div><div class="rh rh-sw"></div>';

    const win = {
      id,
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
        win.el.style.top = clamp(r.top + dy, 0, maxY) + 'px';
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
        const dir = h.dataset.dir || (h.classList[1] || '');
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
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
    });
  }

  /* ---------- taskbar ---------- */
  function updateTaskbar() {
    const bar = byId('taskbar-apps');
    if (!bar) return;
    bar.innerHTML = '';
    OS.tasks.forEach((id) => {
      const w = OS.windows.get(id);
      if (!w) return;
      const b = el('button', 'task');
      if (focusedWin === w && !w.minimized) b.classList.add('focused');
      if (w.minimized) b.classList.add('min');
      b.innerHTML = '<span>' + w.icon + '</span><span class="task-label">' + escapeHtml(w.title) + '</span>';
      b.addEventListener('click', () => {
        if (w.minimized) { w.minimized = false; w.el.classList.remove('minimized'); focusWindow(w); }
        else if (focusedWin === w) minimizeWindow(w);
        else focusWindow(w);
      });
      bar.appendChild(b);
    });
  }

  /* ---------- toasts ---------- */
  function notify(icon, title, body) {
    const wrap = byId('toasts');
    if (!wrap) return;
    const t = el('div', 'toast');
    t.innerHTML = '<span class="toast-icon">' + (icon || '💬') + '</span>' +
      '<div><strong>' + escapeHtml(title) + '</strong>' +
      (body ? '<p>' + escapeHtml(body) + '</p>' : '') + '</div>';
    wrap.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    let gone = false;
    const remove = () => {
      if (gone) return; gone = true;
      t.classList.remove('show');
      setTimeout(() => t.remove(), 280);
    };
    t.addEventListener('click', remove);
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
  function ask({ title, message, input = true, placeholder = '', value = '', okLabel = 'OK', cancelLabel = 'Cancel' }) {
    return new Promise((res) => {
      const root = byId('modal-root');
      const wrap = el('div', 'modal-overlay');
      wrap.innerHTML =
        '<div class="modal">' +
          '<div class="modal-title">' + escapeHtml(title) + '</div>' +
          (message ? '<div class="modal-msg">' + escapeHtml(message) + '</div>' : '') +
          (input ? '<input class="modal-input" placeholder="' + escapeHtml(placeholder) + '" value="' + escapeHtml(value) + '" spellcheck="false">' : '') +
          '<div class="modal-actions">' +
            '<button class="btn ghost" data-a="cancel">' + escapeHtml(cancelLabel || 'Cancel') + '</button>' +
            '<button class="btn" data-a="ok">' + escapeHtml(okLabel) + '</button>' +
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
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); finish(null); }
        if (e.key === 'Enter' && (!inp || e.target === inp)) finish(inp ? inp.value : '');
      };
      wrap.addEventListener('keydown', onKey);
      if (inp) inp.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); finish(null); }
        if (e.key === 'Enter') finish(inp.value);
      });
    });
  }
  function confirm(title, message, okLabel) {
    return ask({ title, message, input: false, okLabel: okLabel || 'Confirm' }).then((v) => v !== null);
  }
  OS.ask = ask;
  OS.confirm = confirm;

  /* ---------- clock ---------- */
  function tickClock() {
    const now = new Date();
    byId('tray-time').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    byId('tray-date').textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }

  /* ---------- start menu ---------- */
  function buildStartMenu() {
    const menu = byId('start-menu');
    const grid = byId('start-grid');
    const search = byId('start-search');

    function render(filter) {
      grid.innerHTML = '';
      const f = (filter || '').toLowerCase();
      const apps = Object.values(APPS).sort((a, b) => a.title.localeCompare(b.title));
      apps.forEach((a) => {
        if (f && !a.title.toLowerCase().includes(f)) return;
        const b = el('button', 'start-app');
        b.innerHTML = '<span class="start-app-ic">' + a.icon + '</span><span>' + escapeHtml(a.title) + '</span>';
        b.addEventListener('click', () => { openApp(a.id); closeStart(); });
        grid.appendChild(b);
      });
      if (!grid.children.length) grid.appendChild(el('div', 'start-empty', 'No apps match “' + escapeHtml(filter) + '”'));
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
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    window.closeStart = closeStart;

    byId('start-restart').addEventListener('click', () => location.reload());
    byId('start-shutdown').addEventListener('click', () => {
      Sound.close();
      close();
      byId('shutdown').classList.remove('hidden');
    });
    byId('shutdown-restart').addEventListener('click', () => location.reload());
  }

  /* ---------- desktop icons ---------- */
  const DESKTOP_APPS = ['files', 'terminal', 'notes', 'browser', 'paint', 'beats', 'monitor', 'calendar', 'settings', 'about'];

  function buildDesktop() {
    const d = byId('desktop-icons');
    DESKTOP_APPS.forEach((id) => {
      const a = APPS[id];
      if (!a) return;
      const ic = el('div', 'desktop-icon');
      ic.innerHTML = '<span class="di-ic">' + a.icon + '</span><span class="di-label">' + escapeHtml(a.title) + '</span>';
      ic.addEventListener('click', () => {
        document.querySelectorAll('.desktop-icon').forEach((x) => x.classList.remove('sel'));
        ic.classList.add('sel');
      });
      ic.addEventListener('dblclick', () => openApp(id));
      ic.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        showMenu(e.clientX, e.clientY, [
          { label: 'Open ' + a.title, icon: a.icon, action: () => openApp(id) },
          '-',
          {
            label: 'Rename', icon: '✏️',
            action: () => ask({
              title: 'Rename app', message: 'New name for ' + a.title, value: a.title,
              okLabel: 'Rename'
            }).then((v) => {
              if (v && v !== a.title) {
                a.title = v.trim() || a.title;
                ic.querySelector('.di-label').textContent = a.title;
                if (OS._startRender) OS._startRender('');
                updateTaskbar();
              }
            })
          }
        ]);
      });
      d.appendChild(ic);
    });
    document.body.addEventListener('click', () => {
      document.querySelectorAll('.desktop-icon.sel').forEach((x) => x.classList.remove('sel'));
    });

    byId('wallpaper').addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showMenu(e.clientX, e.clientY, [
        { label: 'New note', icon: '📝', action: () => openApp('notes', { fresh: true }) },
        { label: 'Open Terminal', icon: '⬛', action: () => openApp('terminal') },
        { label: 'Next wallpaper', icon: '🖼️', action: cycleWallpaper },
        '-',
        { label: 'About Nebula OS', icon: '🪐', action: () => openApp('about') }
      ]);
    });
  }

  function cycleWallpaper() {
    OS.settings.wallpaper = (OS.settings.wallpaper + 1) % WALLPAPERS.length;
    OS.saveSettings();
    OS.applySettings();
    notify('🖼️', 'Wallpaper', 'Switched to “' + WALLPAPERS[OS.settings.wallpaper].name + '”.');
  }

  /* ---------- boot ---------- */
  function boot() {
    const bar = byId('boot-bar');
    let p = 0;
    const t = setInterval(() => {
      p = Math.min(100, p + 9 + Math.random() * 18);
      bar.style.width = p + '%';
      if (p >= 100) {
        clearInterval(t);
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
    buildDesktop();
    buildStartMenu();
    tickClock();
    setInterval(tickClock, 1000);
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('#ctx-menu')) hideMenu();
    }, true);
    byId('wallpaper').style.background = WALLPAPERS[OS.settings.wallpaper].css;
    boot();
    setTimeout(() => {
      if (!localStorage.getItem('nebula.welcomed')) {
        localStorage.setItem('nebula.welcomed', '1');
        notify('🪐', 'Welcome to Nebula OS', 'Double-click an icon to launch an app, or press the orb below to open Start.');
      }
    }, 1600);
  };

  /* ---------- public API ---------- */
  window.OS = OS;
  window.APPS = APPS;
  window.WALLPAPERS = WALLPAPERS;
  window.TASKBAR_H = TASKBAR_H;
  window.registerApp = registerApp;
  window.openApp = openApp;
  window.createWindow = createWindow;
  window.focusWindow = focusWindow;
  window.notify = notify;
  window.ask = ask;
  window.confirmDialog = confirm;
  window.Sound = Sound;
  window.esc = escapeHtml;
  window.$el = el;
  window.$id = byId;
  window.clampNum = clamp;
  window.fmtBytes = fmtBytes;
})();
