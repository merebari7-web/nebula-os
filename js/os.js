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
    pinHash: '',
    pinSalt: '',
    idleLock: true,
    idleMinutes: 5,
    tourSeen: false
  };

  /* ---------- PIN security (salted SHA-256, never stored in cleartext) ---------- */
  function pinCheck(input) {
    const s = OS.settings;
    if (!s.pinHash) return false;
    return sha256Hex(s.pinSalt + ':' + String(input)) === s.pinHash;
  }
  function pinSet(v) {
    const s = OS.settings;
    const salt = sha256Hex(String(Date.now()) + Math.random()).slice(0, 16);
    s.pinSalt = salt;
    s.pinHash = sha256Hex(salt + ':' + v);
    s.pin = '';
    OS.saveSettings();
    Audit.log('security.pin.set', '4-digit PIN (salted SHA-256)');
    announce(t('lock.pinSetDone'));
  }
  function pinClear() {
    const s = OS.settings;
    s.pin = ''; s.pinHash = ''; s.pinSalt = '';
    OS.saveSettings();
    Audit.log('security.pin.clear');
    announce(t('lock.pinCleared'));
  }
  function migratePin() {
    const s = OS.settings;
    if (s.pin && !s.pinHash) {
      const salt = sha256Hex(String(Date.now()) + Math.random()).slice(0, 16);
      s.pinSalt = salt;
      s.pinHash = sha256Hex(salt + ':' + s.pin);
      s.pin = '';
      OS.saveSettings();
      Audit.log('security.pin.migrated', 'cleartext PIN converted to salted hash');
    }
  }

  const WALLPAPERS = [
    { name: 'Sonoma', css: 'radial-gradient(1300px 900px at 82% -10%, rgba(255,158,131,.5) 0%, rgba(255,158,131,0) 58%), radial-gradient(1100px 800px at 8% 112%, rgba(124,108,255,.45) 0%, rgba(124,108,255,0) 55%), radial-gradient(900px 700px at 32% 18%, rgba(255,196,140,.25) 0%, rgba(255,196,140,0) 50%), linear-gradient(155deg, #1c1233 0%, #45306b 40%, #8a4a6b 68%, #d97b5f 88%, #f2a97e 100%)' },
    { name: 'Sequoia', css: 'radial-gradient(1200px 800px at 85% 112%, rgba(45,212,191,.42) 0%, rgba(45,212,191,0) 55%), radial-gradient(1000px 700px at 12% -12%, rgba(16,185,129,.3) 0%, rgba(16,185,129,0) 55%), linear-gradient(165deg, #03120f 0%, #06302a 45%, #0d5c4d 75%, #2ea98a 100%)' },
    { name: 'Ventura', css: 'radial-gradient(1200px 850px at 75% -15%, rgba(96,165,250,.5) 0%, rgba(96,165,250,0) 60%), radial-gradient(1000px 700px at 15% 115%, rgba(192,132,252,.42) 0%, rgba(192,132,252,0) 55%), linear-gradient(150deg, #0b1030 0%, #232a6b 45%, #5b4bb5 75%, #9d7bea 100%)' },
    { name: 'Monterey', css: 'radial-gradient(1000px 700px at 72% 118%, rgba(125,196,245,.5) 0%, rgba(125,196,245,0) 58%), radial-gradient(800px 500px at 18% -12%, rgba(56,130,246,.3) 0%, rgba(56,130,246,0) 55%), linear-gradient(180deg, #071a3a 0%, #0e3a6e 42%, #2f6db5 72%, #6db3e8 100%)' },
    { name: 'Big Sur', css: 'radial-gradient(1000px 700px at 80% 115%, rgba(251,146,60,.5) 0%, rgba(251,146,60,0) 55%), radial-gradient(900px 600px at 12% -12%, rgba(244,114,182,.25) 0%, rgba(244,114,182,0) 55%), linear-gradient(160deg, #1a0b2e 0%, #5b2a5e 45%, #c2544f 75%, #f2935c 100%)' },
    { name: 'Void', css: 'radial-gradient(1200px 800px at 50% 50%, rgba(88,101,242,.16) 0%, rgba(88,101,242,0) 65%), linear-gradient(180deg, #04040a 0%, #08080f 60%, #0c0c16 100%)' },
    { name: 'Liberty', css: 'radial-gradient(circle, rgba(253,230,138,.9) 1px, transparent 1.6px) 0 0/170px 170px, radial-gradient(circle, rgba(255,255,255,.6) .8px, transparent 1.4px) 62px 96px/233px 233px, radial-gradient(circle, rgba(253,230,138,.45) 1.1px, transparent 1.7px) 130px 40px/311px 311px, radial-gradient(1400px 700px at 50% 118%, rgba(250,204,21,.2) 0%, transparent 60%), linear-gradient(180deg, #020617 0%, #0a1633 55%, #16294f 100%)' },
    { name: 'Old Glory', css: 'radial-gradient(circle, rgba(253,230,138,.75) 1px, transparent 1.6px) 34px 62px/201px 201px, radial-gradient(1200px 500px at 12% -10%, rgba(220,38,38,.42) 0%, transparent 55%), radial-gradient(1000px 700px at 88% 112%, rgba(30,58,138,.7) 0%, transparent 62%), linear-gradient(165deg, #0b1026 0%, #141c3f 45%, #3f1220 78%, #7f1d1d 100%)' }
  ];

  const ICONS = {
    min: '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6.5h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    max: '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="2.2" y="2.2" width="7.6" height="7.6" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    restore: '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="3.8" width="6.2" height="6.2" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M4 2.2h4.8A1.8 1.8 0 0 1 10.6 4v4.8" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    close: '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
  };

  /* ---------- fireworks (Celebrate) ---------- */
  let fw = null;
  function celebrate() {
    if (fw) return fw;
    if (OS.settings.reduceMotion) { notify('🎆', t('fw.title'), t('fw.reduced')); return null; }
    const cv = el('canvas', 'fw-canvas');
    document.body.appendChild(cv);
    const ctx = cv.getContext ? cv.getContext('2d') : null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; };
    size();
    const rockets = [], sparks = [];
    const COLORS = ['#ef4444', '#ffffff', '#3b82f6', '#facc15', '#f87171', '#60a5fa', '#fde68a'];
    const started = (window.performance && performance.now()) || Date.now();
    let lastLaunch = 0, raf = 0;
    function launch() {
      rockets.push({
        x: (0.15 + Math.random() * 0.7) * innerWidth * dpr,
        y: innerHeight * dpr + 6,
        vx: (Math.random() - 0.5) * 1.6 * dpr,
        vy: -(6.5 + Math.random() * 3) * dpr,
        color: COLORS[(Math.random() * COLORS.length) | 0], life: 0
      });
      try { Sound.blip(180 + Math.random() * 120, 0.12, 'triangle', 0.025); } catch (e) {}
    }
    function explode(r) {
      const n = 42 + ((Math.random() * 26) | 0);
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.2;
        const sp = (1.6 + Math.random() * 3.4) * dpr;
        sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          color: Math.random() < 0.82 ? r.color : COLORS[(Math.random() * COLORS.length) | 0],
          life: 0, max: 55 + Math.random() * 30 });
      }
      try { Sound.blip(80 + Math.random() * 60, 0.4, 'sine', 0.045); } catch (e) {}
    }
    function frame(now) {
      const t = now - started;
      if (t > 12000 || (rockets.length + sparks.length === 0 && t > 4000)) { stop(); return; }
      if (t - lastLaunch > 620 && t < 9500) { launch(); lastLaunch = t; }
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = rockets.length - 1; i >= 0; i--) {
          const r = rockets[i];
          r.x += r.vx; r.y += r.vy; r.vy += 0.06 * dpr; r.life++;
          ctx.globalAlpha = 0.9; ctx.fillStyle = r.color;
          ctx.beginPath(); ctx.arc(r.x, r.y, 1.6 * dpr, 0, 7); ctx.fill();
          if (r.vy > -1.2 * dpr || r.life > 70) { explode(r); rockets.splice(i, 1); }
        }
        for (let i = sparks.length - 1; i >= 0; i--) {
          const p = sparks[i];
          p.x += p.vx; p.y += p.vy; p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.05 * dpr; p.life++;
          if (p.life > p.max) { sparks.splice(i, 1); continue; }
          ctx.globalAlpha = 1 - p.life / p.max; ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, 1.4 * dpr, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', esc, true);
      cv.remove();
      fw = null;
    }
    const esc = (e) => { if (e.key === 'Escape') stop(); };
    document.addEventListener('keydown', esc, true);
    raf = requestAnimationFrame(frame);
    fw = { cv, stop, rockets, sparks };
    notify('🎆', t('fw.title'), t('fw.body'));
    return fw;
  }

  /* ---------- TV mode — 10-foot UI + living-room catalog ---------- */
  const TV_STREAMS = [
    { id: 'youtube', name: 'YouTube', glyph: '▶', color: '#ff0033', native: 'youtube' },
    { id: 'netflix', name: 'Netflix', glyph: 'N', color: '#e50914', url: 'https://www.netflix.com' },
    { id: 'prime', name: 'Prime Video', glyph: 'P', color: '#1399ff', url: 'https://www.primevideo.com' },
    { id: 'disney', name: 'Disney+', glyph: 'D', color: '#113ccf', url: 'https://www.disneyplus.com' },
    { id: 'max', name: 'Max', glyph: 'M', color: '#4d1d95', url: 'https://www.max.com' },
    { id: 'apple', name: 'Apple TV+', glyph: 'A', color: '#1d1d1f', url: 'https://tv.apple.com' },
    { id: 'paramount', name: 'Paramount+', glyph: 'P', color: '#0064ff', url: 'https://www.paramountplus.com' },
    { id: 'peacock', name: 'Peacock', glyph: 'P', color: '#ff5e21', url: 'https://www.peacocktv.com' },
    { id: 'dazn', name: 'DAZN', glyph: 'Z', color: '#0a7a43', url: 'https://www.dazn.com' },
    { id: 'espn', name: 'ESPN', glyph: 'E', color: '#cc0000', url: 'https://www.espn.com' },
    { id: 'bbciplayer', name: 'BBC iPlayer', glyph: 'B', color: '#b80000', url: 'https://www.bbc.co.uk/iplayer' },
    { id: 'crunchyroll', name: 'Crunchyroll', glyph: 'C', color: '#f47521', url: 'https://www.crunchyroll.com' },
    { id: 'tubi', name: 'Tubi', glyph: 'T', color: '#d9a404', url: 'https://tubi.tv' },
    { id: 'pluto', name: 'Pluto TV', glyph: 'P', color: '#1a4fff', url: 'https://pluto.tv' },
    { id: 'plex', name: 'Plex', glyph: 'P', color: '#c78a1a', url: 'https://watch.plex.tv' },
    { id: 'twitch', name: 'Twitch', glyph: 'T', color: '#9146ff', url: 'https://www.twitch.tv' },
    { id: 'tiktok', name: 'TikTok', glyph: 'T', color: '#010101', url: 'https://www.tiktok.com' },
    { id: 'sling', name: 'Sling TV', glyph: 'S', color: '#e45c10', url: 'https://www.slingtv.com' },
    { id: 'vudu', name: 'Vudu', glyph: 'V', color: '#e51937', url: 'https://www.vudu.com' },
    { id: 'browser', name: 'Web Browser', glyph: '🌐', color: '#3478f6', app: 'browser' }
  ];
  let tvState = null;
  function tvSession(st) {
    const key = 'tv-' + st.id;
    const existing = OS.windows.get(key);
    if (existing) { focusWindow(existing); return; }
    Audit.log('tv.session', st.name);
    createWindow({
      id: key, appId: 'tv', title: st.name,
      x: 0, y: MENU_H + 2,
      width: innerWidth, height: innerHeight - MENU_H - TASKBAR_H - 4,
      content(winW) {
        winW.body.innerHTML =
          '<div class="tv-session">' +
            '<div class="tv-s-glyph" style="background:' + st.color + '">' + escapeHtml(st.glyph) + '</div>' +
            '<h3>' + escapeHtml(st.name) + '</h3>' +
            '<p class="tv-s-note">' + escapeHtml(t('tv.noEmbed')) + '</p>' +
            '<button class="btn tv-s-open">' + escapeHtml(t('tv.open')) + ' ↗</button>' +
          '</div>';
        winW.body.querySelector('.tv-s-open').addEventListener('click', () => {
          Audit.log('tv.launch', st.name);
          window.open(st.url, '_blank', 'noopener');
        });
      }
    });
  }
  function tvLaunchStream(st) {
    if (st.native) { openApp(st.native); return; }
    if (st.app) { openApp(st.app); return; }
    tvSession(st);
  }
  function tickTvClock() {
    const c = byId('tv-clock');
    if (c) c.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function tvLayout() {
    const grid = byId('tv-grid');
    const first = grid && grid.querySelector('.tv-tile');
    if (!grid || !first) return;
    const tw = first.getBoundingClientRect().width + 16;
    tvState.cols = Math.max(1, Math.round(grid.getBoundingClientRect().width / tw));
  }
  function tvFocus(i) {
    if (!tvState) return;
    tvState.idx = i;
    const tiles = byId('tv-grid').querySelectorAll('.tv-tile');
    tiles.forEach((b, j) => b.classList.toggle('focused', j === i));
    if (tiles[i]) { tiles[i].focus(); try { tiles[i].scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} }
    Sound.pop();
  }
  function tvMove(dx, dy) {
    if (!tvState) return;
    const n = tvState.tiles.length, c = Math.max(1, tvState.cols), i = tvState.idx;
    let ni = i;
    if (dx === 1) ni = (i + 1) % n;
    else if (dx === -1) ni = (i - 1 + n) % n;
    else if (dy === 1) ni = (i + c) % n;
    else ni = (i - c + n) % n;
    tvFocus(ni);
  }
  function tvOpen() {
    if (tvState) return;
    const home = byId('tv-home');
    if (!home) return;
    const tiles = [];
    Object.values(APPS).forEach((a) => tiles.push({
      key: a.id, label: appTitle(a), glyph: a.icon || '🪐', color: '#5b6cff', run: () => openApp(a.id)
    }));
    TV_STREAMS.forEach((st) => tiles.push({ key: 's:' + st.id, label: st.name, glyph: st.glyph, color: st.color, run: () => tvLaunchStream(st) }));
    home.innerHTML =
      '<div class="tv-status"><span class="tv-brand">NEBULA · TV MODE</span><span class="tv-clock" id="tv-clock"></span></div>' +
      '<div class="tv-grid" id="tv-grid">' + tiles.map((tl, i) =>
        '<button class="tv-tile' + (i === 0 ? ' focused' : '') + '" data-i="' + i + '" style="--tc:' + tl.color + '" aria-label="' + escapeHtml(tl.label) + '">' +
          '<span class="tv-t-glyph" style="background:' + tl.color + '">' + escapeHtml(tl.glyph) + '</span>' +
          '<span class="tv-t-name">' + escapeHtml(tl.label) + '</span>' +
        '</button>').join('') + '</div>' +
      '<div class="tv-hint">' + escapeHtml(t('tv.hint')) + '</div>';
    home.classList.remove('hidden');
    document.body.classList.add('tv-on');
    tvState = { tiles, idx: 0, cols: 6, iv: setInterval(tickTvClock, 10000) };
    tickTvClock();
    tvLayout();
    tvFocus(0);
    Audit.log('tv.mode.on');
  }
  function tvClose() {
    if (!tvState) return;
    clearInterval(tvState.iv);
    byId('tv-home').classList.add('hidden');
    document.body.classList.remove('tv-on');
    tvState = null;
    Audit.log('tv.mode.off');
  }
  function tvToggle() { if (tvState) tvClose(); else tvOpen(); }
  function tvKeyHandler(e) {
    if (!tvState) return;
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); tvClose(); return; }
    if (k === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); tvMove(1, 0); }
    else if (k === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); tvMove(-1, 0); }
    else if (k === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); tvMove(0, 1); }
    else if (k === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); tvMove(0, -1); }
    else if (k === 'Enter' || k === ' ') {
      e.preventDefault(); e.stopPropagation();
      const tl = tvState.tiles[tvState.idx];
      tvClose();
      if (tl) tl.run();
    }
  }

  /* ---------- SHA-256 (pure JS, no deps — for PIN hashing) ---------- */
  function sha256Hex(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const bytes = [];
    for (let i = 0; i < ascii.length; i++) bytes.push(ascii.charCodeAt(i) & 255); // ASCII (PINs, salts, hex)
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, i * 8)) & 255);
    const w = new Array(64);
    for (let off = 0; off < bytes.length; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H = [(H[0] + a) | 0, (H[1] + b) | 0, (H[2] + c) | 0, (H[3] + d) | 0,
           (H[4] + e) | 0, (H[5] + f) | 0, (H[6] + g) | 0, (H[7] + h) | 0];
    }
    return H.map((x) => ('00000000' + ((x >>> 0).toString(16))).slice(-8)).join('');
  }

  /* ---------- safe math parser (replaces eval; CSP-friendly) ---------- */
  function safeMath(src) {
    const s2 = String(src).replace(/[\s ]/g, '');
    let i = 0;
    function fail() { throw new Error('bad math'); }
    function parseExpr() {
      let v = parseTerm();
      while (s2[i] === '+' || s2[i] === '-') { const op = s2[i++]; const r = parseTerm(); v = op === '+' ? v + r : v - r; }
      return v;
    }
    function parseTerm() {
      let v = parseFactor();
      while (s2[i] === '*' || s2[i] === '/' || s2[i] === '%') {
        const op = s2[i++]; const r = parseFactor();
        if (op === '*') v *= r; else if (op === '/') v /= r; else v %= r;
      }
      return v;
    }
    function parseFactor() {
      if (s2[i] === '-') { i++; return -parseFactor(); }
      if (s2[i] === '+') { i++; return parseFactor(); }
      return parseAtom();
    }
    function parseAtom() {
      if (s2[i] === '(') {
        i++; const v = parseExpr();
        if (s2[i] !== ')') fail();
        i++; return v;
      }
      const m = /^(\d+\.?\d*|\.\d+)/.exec(s2.slice(i));
      if (!m) fail();
      i += m[0].length;
      return parseFloat(m[0]);
    }
    if (!s2) fail();
    const v = parseExpr();
    if (i < s2.length) fail();
    return v;
  }

  /* ---------- audit trail (governance) ---------- */
  const Audit = {
    KEY: 'nebula.audit.v1',
    cap: 500,
    read() { try { const l = JSON.parse(localStorage.getItem(this.KEY)); return Array.isArray(l) ? l : []; } catch (e) { return []; } },
    log(event, detail) {
      const list = this.read();
      list.unshift({ ts: Date.now(), event: String(event), detail: String(detail == null ? '' : detail) });
      if (list.length > this.cap) list.length = this.cap;
      try { localStorage.setItem(this.KEY, JSON.stringify(list)); } catch (e) {}
    },
    clear() { try { localStorage.removeItem(this.KEY); } catch (e) {} }
  };

  /* ---------- network status ---------- */
  function netStatus(on) {
    const w = byId('tray-wifi');
    if (!w) return;
    w.classList.toggle('off', !on);
    w.title = on ? 'Connected — nebula-net' : 'Offline — data stays on this device';
  }

  /* ---------- screen-reader announcements ---------- */
  let annTimer = 0;
  function announce(msg) {
    const a = byId('os-announcer');
    if (!a) return;
    a.textContent = '';
    clearTimeout(annTimer);
    annTimer = setTimeout(() => { a.textContent = msg; }, 40);
  }

  /* ---------- OS state ---------- */
  const OS = {
    name: 'Nebula OS',
    version: '2.9.0',
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

  OS.celebrate = celebrate;
  OS.setPin = pinSet;
  OS.clearPin = pinClear;
  OS.tv = { open: tvOpen, close: tvClose, toggle: tvToggle, launch: tvLaunchStream };

  OS.applySettings = function () {
    document.body.dataset.theme = OS.settings.theme;
    document.body.dataset.motion = OS.settings.reduceMotion ? 'reduce' : 'full';
    document.documentElement.style.setProperty('--accent', OS.settings.accent);
    /* pick button ink with the best contrast against the user's accent (a11y) */
    try {
      const hx = String(OS.settings.accent).replace('#', '');
      const f = (i) => { const v = parseInt(hx.substr(i, 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const L = 0.2126 * f(0) + 0.7152 * f(2) + 0.0722 * f(4);
      const cw = 1.05 / (L + 0.05), cd = (L + 0.05) / 0.057;
      document.documentElement.style.setProperty('--btn-ink', cw > cd ? '#ffffff' : '#10131a');
    } catch (e) {}
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
    Audit.log('app.open', id);
    const a = APPS[id];
    if (!a) { notify('⚠️', 'Unknown app', 'No app registered as "' + id + '".'); return; }
    if (!OS.windows.has(id)) {
      const app = a;
      setTimeout(() => announce(appTitle(app) + ' ' + t('a11y.opened')), 60);
    }
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
      announce(t('flow.restored'));
    } else {
      win.lastRect = e.getBoundingClientRect();
      win.maximized = true;
      e.classList.add('maximized');
      announce(t('flow.maximized'));
    }
    refreshMaxIcon(win);
    Sound.pop();
  }

  function closeWindow(id) {
    Audit.log('app.close', id);
    const win = OS.windows.get(id);
    if (!win) return;
    if (win.onClose) { try { win.onClose(win); } catch (e) {} }
    Sound.close();
    saveWinRect(win);
    const closedApp = win.appId && APPS[win.appId];
    if (closedApp) announce(appTitle(closedApp) + ' ' + t('a11y.closed'));
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
  function snapWin(win, side) {
    if (!win || !side) return;
    const e = win.el;
    if (win.maximized) {
      win.maximized = false;
      e.classList.remove('maximized');
      refreshMaxIcon(win);
    } else if (!win.lastRect) {
      win.lastRect = { left: parseFloat(e.style.left) || 0, top: parseFloat(e.style.top) || 0, width: parseFloat(e.style.width) || 420, height: parseFloat(e.style.height) || 320 };
    }
    const r = snapRect(side);
    Object.assign(e.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    announce(t('flow.snapped').replace('%s', t(side === 'left' ? 'flow.left' : 'flow.right')));
    Sound.pop();
  }
  function unSnap(win) {
    if (!win) return;
    if (win.maximized) { toggleMaximize(win); return; }
    const r = win.lastRect;
    if (!r) return;
    const e = win.el;
    e.style.left = r.left + 'px'; e.style.top = r.top + 'px';
    e.style.width = r.width + 'px'; e.style.height = r.height + 'px';
    announce(t('flow.restored'));
    Sound.pop();
  }
  function altSnap(win, key) {
    if (key === 'ArrowLeft') snapWin(win, 'left');
    else if (key === 'ArrowRight') snapWin(win, 'right');
    else if (key === 'ArrowUp') { if (win && !win.maximized) toggleMaximize(win); }
    else if (key === 'ArrowDown') { if (win) { if (win.maximized) toggleMaximize(win); else unSnap(win); } }
  }
  OS.snap = {
    left: () => { if (focusedWin) snapWin(focusedWin, 'left'); },
    right: () => { if (focusedWin) snapWin(focusedWin, 'right'); },
    max: () => { if (focusedWin && !focusedWin.maximized) toggleMaximize(focusedWin); },
    restore: () => { if (focusedWin) { if (focusedWin.maximized) toggleMaximize(focusedWin); else unSnap(focusedWin); } }
  };

  function makeDraggable(win) {
    const bar = win.el.querySelector('.titlebar');
    bar.setAttribute('tabindex', '0');
    bar.setAttribute('aria-label', t('a11y.titlebar'));
    bar.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault(); e.stopPropagation();
        altSnap(win, e.key);
        return;
      }
      if (win.maximized) return;
      const step = 24;
      const r = win.el.getBoundingClientRect();
      let handled = true;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (e.shiftKey) {
          let w = r.width, h = r.height;
          if (e.key === 'ArrowRight') w += step; else if (e.key === 'ArrowLeft') w -= step;
          if (e.key === 'ArrowDown') h += step; else h -= step;
          w = Math.max(280, Math.min(w, innerWidth - 8));
          h = Math.max(180, Math.min(h, innerHeight - MENU_H - 8));
          win.el.style.width = w + 'px';
          win.el.style.height = h + 'px';
        } else {
          let x = r.left, y = r.top;
          if (e.key === 'ArrowRight') x += step; else if (e.key === 'ArrowLeft') x -= step;
          if (e.key === 'ArrowDown') y += step; else y -= step;
          x = Math.max(-r.width + 110, Math.min(x, innerWidth - 90));
          y = Math.max(MENU_H, Math.min(y, innerHeight - TASKBAR_H - 30));
          win.el.style.left = x + 'px';
          win.el.style.top = y + 'px';
        }
      } else handled = false;
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    });
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
          if (side) snapWin(win, side);
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

  /* ---------- onboarding tour ---------- */
  const TOUR_STEPS = () => [
    { ic: '🪐', t: t('tour.s1t'), b: t('tour.s1b') },
    { ic: '🪟', t: t('tour.s2t'), b: t('tour.s2b') },
    { ic: '⚡', t: t('tour.s3t'), b: t('tour.s3b') },
    { ic: '🔐', t: t('tour.s4t'), b: t('tour.s4b') },
    { ic: '📺', t: t('tour.s5t'), b: t('tour.s5b') }
  ];
  let tourIdx = 0;
  function tourClose(finished) {
    const old = byId('tour');
    if (old) old.remove();
    OS.settings.tourSeen = true;
    OS.saveSettings();
    Audit.log(finished ? 'tour.completed' : 'tour.skipped');
  }
  function tourRender() {
    const host = byId('tour');
    if (!host) return;
    const steps = TOUR_STEPS();
    const s = steps[tourIdx];
    host.innerHTML =
      '<div class="tour-card" role="dialog" aria-modal="true" aria-label="' + escapeHtml(s.t) + '">' +
        '<div class="tour-top">' +
          '<span class="tour-step">Step ' + (tourIdx + 1) + ' / ' + steps.length + '</span>' +
          '<button class="btn ghost sm" data-ts="skip">' + escapeHtml(t('tour.skip')) + '</button>' +
        '</div>' +
        '<div class="tour-ic" aria-hidden="true">' + s.ic + '</div>' +
        '<h3 class="tour-title">' + escapeHtml(s.t) + '</h3>' +
        '<p class="tour-body">' + escapeHtml(s.b) + '</p>' +
        '<div class="tour-dots">' + steps.map((_, i) => '<span class="tour-dot' + (i === tourIdx ? ' on' : '') + '"></span>').join('') + '</div>' +
        '<div class="tour-nav">' +
          (tourIdx > 0
            ? '<button class="btn ghost" data-ts="back">' + escapeHtml(t('tour.back')) + '</button>'
            : '<span class="spacer"></span>') +
          (tourIdx < steps.length - 1
            ? '<button class="btn" data-ts="next">' + escapeHtml(t('tour.next')) + '</button>'
            : '<button class="btn" data-ts="done">' + escapeHtml(t('tour.done')) + '</button>') +
        '</div>' +
      '</div>';
    const primary = host.querySelector('[data-ts="next"], [data-ts="done"]');
    if (primary) primary.focus();
  }
  function tourStart() {
    if (byId('tour')) return;
    tourIdx = 0;
    const host = el('div', 'tour-overlay');
    host.id = 'tour';
    host.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-ts]');
      if (!b) return;
      const a = b.dataset.ts;
      if (a === 'skip') tourClose(false);
      else if (a === 'back') { tourIdx = Math.max(0, tourIdx - 1); tourRender(); }
      else if (a === 'next') { tourIdx = Math.min(TOUR_STEPS().length - 1, tourIdx + 1); tourRender(); }
      else if (a === 'done') tourClose(true);
    });
    document.body.appendChild(host);
    tourRender();
  }
  OS.tour = { start: tourStart, close: (f) => tourClose(f !== false) };

  /* ---------- keyboard shortcuts reference ---------- */
  function helpGroups() {
    return [
      { h: t('help.g1'), rows: [
        [t('help.spot'), 'Ctrl/⌘ + Space'],
        [t('help.mission'), 'Ctrl/⌘ + `'],
        [t('help.lock'), 'Alt + L'],
        [t('help.newNote'), 'Ctrl/⌘ + N'],
        [t('help.newTerm'), 'Ctrl/⌘ + T'],
        [t('help.wall'), 'Ctrl/⌘ + D']
      ] },
      { h: t('help.g2'), rows: [
        [t('help.move'), '← → ↑ ↓'],
        [t('help.resize'), 'Shift + ← → ↑ ↓'],
        [t('help.menus'), '← → ↑ ↓ + Enter / Esc'],
        [t('help.min'), 'Window menu'],
        [t('help.tour'), 'Esc'],
        [t('flow.snapK'), 'Alt + ← →'],
        [t('flow.maxK'), 'Alt + ↑ ↓']
      ] }
    ];
  }
  function helpClose() {
    const old = byId('help');
    if (old) old.remove();
  }
  function helpOpen() {
    if (byId('help')) return;
    const host = el('div', 'help-overlay');
    host.id = 'help';
    host.innerHTML =
      '<div class="help-card" role="dialog" aria-modal="true" aria-label="' + escapeHtml(t('help.title')) + '">' +
        '<div class="help-top"><b>⌨️ ' + escapeHtml(t('help.title')) + '</b>' +
          '<button class="btn ghost sm" data-hc aria-label="close">✕</button></div>' +
        helpGroups().map((g) =>
          '<div class="help-group"><div class="help-gh">' + escapeHtml(g.h) + '</div>' +
            g.rows.map((r) => '<div class="help-row"><span>' + escapeHtml(r[0]) + '</span><kbd>' + escapeHtml(r[1]) + '</kbd></div>').join('') +
          '</div>').join('') +
        '<p class="help-note">' + escapeHtml(t('help.note')) + '</p>' +
      '</div>';
    host.addEventListener('click', (e) => {
      if (e.target === host || e.target.closest('[data-hc]')) helpClose();
    });
    document.body.appendChild(host);
    const b = host.querySelector('[data-hc]');
    if (b) b.focus();
  }
  OS.help = { open: helpOpen, close: helpClose };

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
      if (pinCheck(pinBuf)) {
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
    const hasPin = !!OS.settings.pinHash;
    byId('lock-pin-wrap').classList.toggle('hidden', !hasPin);
    byId('lock-reset').classList.toggle('hidden', !hasPin);
    byId('lock-hint').classList.toggle('hidden', hasPin);
    byId('lock-hint').textContent = hasPin ? t('lock.pin') : t('lock.hint');
    pinBuf = '';
    renderDots();
    byId('lock-screen').classList.remove('hidden');
    document.body.classList.add('locked');
    tvClose();
    hideMenu();
    byId('start-menu') && byId('start-menu').classList.remove('open');
    Sound.pop();
    Audit.log('security.lock');
    announce(t('lock.announced'));
  }
  function unlockScreen() {
    byId('lock-screen').classList.add('hidden');
    document.body.classList.remove('locked');
    lastActivity = Date.now();
    Sound.open();
    Audit.log('security.unlock');
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
          OS.clearPin();
          byId('lock-pin-wrap').classList.add('hidden');
          byId('lock-reset').classList.add('hidden');
          byId('lock-hint').classList.remove('hidden');
          byId('lock-hint').textContent = t('lock.hint');
        }
      });
    });
    byId('lock-screen').addEventListener('pointerdown', (e) => {
      if (e.target.closest('.lock-key') || e.target.closest('.lock-reset') || e.target.closest('.modal-overlay')) return;
      if (!OS.settings.pinHash) unlockScreen();
    });

    document.addEventListener('keydown', (e) => {
      if (!isLocked()) return;
      if (e.target && e.target.closest && e.target.closest('.modal-overlay')) return;
      if (OS.settings.pinHash) {
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
  const DESKTOP_APPS = ['files', 'terminal', 'code', 'notes', 'reminders', 'browser', 'paint', 'beats', 'youtube', 'maps', 'calc', 'clock', 'weather', 'stocks', 'monitor', 'android', 'calendar', 'snake', 'contacts', 'music', 'backup', 'tasks', 'budget', 'settings', 'about', 'audit', 'tv'];

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

  /* ---------- today widget (desktop) ---------- */
  function todayKeyNow() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function widgetRefresh() {
    const host = byId('today-widget');
    if (!host) return;
    const now = new Date();
    const t0 = todayKeyNow();
    let tasks = [];
    try { tasks = JSON.parse(localStorage.getItem('nebula.tasks.v1') || '[]'); } catch (e) {}
    let items = [];
    try { items = JSON.parse(localStorage.getItem('nebula.budget.v1') || '[]'); } catch (e) {}
    const openD = tasks.filter((x) => !x.done && x.due);
    const due = openD.filter((x) => x.due === t0);
    const late = openD.filter((x) => x.due < t0);
    const m = t0.slice(0, 7);
    let inM = 0, outM = 0;
    items.forEach((x) => { if ((x.date || '').slice(0, 7) === m) { if (x.type === 'in') inM += x.amt; else outM += x.amt; } });
    const net = inM - outM;
    const upNext = openD.slice().sort((a, b) => (a.due < b.due ? -1 : 1)).slice(0, 3);
    const taskLine = due.length || late.length
      ? t('dw.due').replace('%d', due.length) + (late.length ? ' · ' + t('dw.late').replace('%d', late.length) : '')
      : t('dw.ok');
    host.innerHTML =
      '<div class="tw-head"><b>📅 ' + escapeHtml(t('dw.title')) + ' — ' + escapeHtml(now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })) + '</b></div>' +
      '<div class="tw-row" data-open="tasks" role="button" tabindex="0">' +
        '<span class="tw-ic">✅</span><span class="tw-lb">' + escapeHtml(t('dw.t')) + '</span>' +
        '<span class="tw-val">' + escapeHtml(taskLine) + '</span></div>' +
      '<div class="tw-row" data-open="budget" role="button" tabindex="0">' +
        '<span class="tw-ic">💰</span><span class="tw-lb">' + escapeHtml(t('dw.b')) + '</span>' +
        '<span class="tw-val' + (net < 0 ? ' neg' : ' pos') + '">' + (net < 0 ? '−' : '') + Math.abs(net).toFixed(2) + ' <small>' + escapeHtml(t('dw.netM')) + '</small></span></div>' +
      (upNext.length ? '<div class="tw-next">' + escapeHtml(t('dw.next')) + upNext.map((x) =>
        '<div class="tw-item" data-open="tasks" role="button" tabindex="0"><span class="tw-dot' + (x.due < t0 ? ' late' : '') + '"></span>' +
        escapeHtml(String(x.text).slice(0, 34)) + '</div>').join('') + '</div>' : '');
    host.querySelectorAll('[data-open]').forEach((r) => {
      const go = () => openApp(r.dataset.open);
      r.addEventListener('click', go);
      r.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    });
  }
  function buildTodayWidget() {
    if (byId('today-widget')) return;
    const host = el('div', 'today-widget');
    host.id = 'today-widget';
    host.setAttribute('role', 'complementary');
    host.setAttribute('aria-label', t('dw.title'));
    const desk = byId('desktop');
    if (!desk) return;
    desk.appendChild(host);
    widgetRefresh();
    setInterval(widgetRefresh, 30000);
  }
  OS.widget = { refresh: widgetRefresh, build: buildTodayWidget };
  /* ---------- task reminders ---------- */
  const REM_KEY = 'nebula.reminders.v1';
  function taskReminders() {
    let tasks = [];
    try { tasks = JSON.parse(localStorage.getItem('nebula.tasks.v1') || '[]'); } catch (e) {}
    if (!tasks.length) return;
    const t0 = todayKeyNow();
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem(REM_KEY) || '{}'); } catch (e) {}
    let changed = false;
    tasks.forEach((x) => {
      if (x.done || !x.due) return;
      const key = x.id + '@' + x.due;
      if (seen[key] === t0) return;
      const label = String(x.text).slice(0, 60);
      if (x.due === t0) notify('⏰', t('rem.due').replace('%s', label));
      else if (x.due < t0) notify('⚠️', t('rem.late').replace('%s', String(x.text).slice(0, 40)).replace('%s', x.due));
      Audit.log('task.reminder', (x.due === t0 ? 'due-today ' : 'overdue ') + label);
      seen[key] = t0;
      changed = true;
    });
    if (changed) { try { localStorage.setItem(REM_KEY, JSON.stringify(seen)); } catch (e) {} }
  }
  OS.remind = { run: taskReminders };
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
          const v = safeMath(q);
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
        const dataHits = [];
        const tryArr = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } };
        tryArr('nebula.notes.v1').slice(0, 200).forEach((n) => {
          if ((n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q))
            dataHits.push({ icon: '📝', label: n.title || 'Untitled', sub: t('spot.notes') + ' · ' + (n.content || '').slice(0, 48), run: () => openApp('notes') });
        });
        tryArr('nebula.contacts.v1').slice(0, 200).forEach((c) => {
          if (((c.name || '') + ' ' + (c.phone || '') + ' ' + (c.email || '')).toLowerCase().includes(q))
            dataHits.push({ icon: '👥', label: c.name, sub: t('spot.contact') + ' · ' + (c.phone || c.email || ''), run: () => openApp('contacts') });
        });
        tryArr('nebula.tasks.v1').slice(0, 200).forEach((x) => {
          if (!x.done && (x.text || '').toLowerCase().includes(q))
            dataHits.push({ icon: '✅', label: x.text, sub: t('spot.task') + (x.due ? ' · ' + x.due : ''), run: () => openApp('tasks') });
        });
        tryArr('nebula.budget.v1').slice(0, 300).forEach((x) => {
          if (((x.desc || '') + ' ' + (x.cat || '')).toLowerCase().includes(q))
            dataHits.push({ icon: '💰', label: x.desc || (x.type === 'in' ? 'Income' : 'Expense'), sub: t('spot.txn') + ' · ' + (Math.round(x.amt * 100) / 100).toFixed(2), run: () => openApp('budget') });
        });
        dataHits.slice(0, 4).forEach((h) => list.push(h));
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
      try { const v = safeMath(m[1]); if (isFinite(v)) return m[1].trim() + ' = ' + v; } catch (e) {}
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

    /* a11y: full arrow-key menu navigation */
    document.addEventListener('keydown', (e) => {
      if (isLocked() || byId('tour')) return;
      if (e.altKey) return;
      const openIt = items.find((x) => x.classList.contains('open'));
      if (!openIt) return;
      const its = Array.prototype.slice.call(openIt.querySelectorAll('.mb-mi'));
      if (!its.length) return;
      const idx = its.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation();
        const next = e.key === 'ArrowDown' ? (idx < 0 ? 0 : (idx + 1) % its.length) : (idx <= 0 ? its.length - 1 : idx - 1);
        its[next].focus();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault(); e.stopPropagation();
        const i = items.indexOf(openIt);
        const nx = items[(i + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length];
        closeMenus();
        nx.classList.add('open');
        const fi = nx.querySelector('.mb-mi');
        (fi || nx).focus();
      } else if (e.key === 'Escape') {
        closeMenus();
        openIt.focus();
      }
    });

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
      celebrate: () => OS.celebrate(),
      tv: () => OS.tv && OS.tv.toggle(),
      tour: () => OS.tour && OS.tour.start(),
      help: () => OS.help && OS.help.open(),
      arrange: () => arrangeIcons(),
      showDesktop: () => showDesktopAction(),
      mission: () => toggleMission(),
      min: () => { if (focusedWin) minimizeWindow(focusedWin); },
      zoom: () => { if (focusedWin) toggleMaximize(focusedWin); },
      snapLeft: () => { if (focusedWin) snapWin(focusedWin, 'left'); },
      snapRight: () => { if (focusedWin) snapWin(focusedWin, 'right'); },
      snapMax: () => { if (focusedWin && !focusedWin.maximized) toggleMaximize(focusedWin); },
      snapRestore: () => { if (focusedWin) { if (focusedWin.maximized) toggleMaximize(focusedWin); else unSnap(focusedWin); } },
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
        { label: t('ctx.celebrate'), icon: '🎆', action: () => OS.celebrate() },
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
    Audit.log('appearance.theme', OS.settings.theme);
    notify('🌓', OS.settings.theme === 'dark' ? 'Dark theme' : 'Light theme', OS.name + ' · ' + OS.settings.theme);
  }

  function cycleWallpaper() {
    OS.settings.wallpaper = (OS.settings.wallpaper + 1) % WALLPAPERS.length;
    OS.saveSettings();
    OS.applySettings();
    Audit.log('appearance.wallpaper', WALLPAPERS[OS.settings.wallpaper].name);
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
      byId('lock-hint').textContent = OS.settings.pinHash ? t('lock.pin') : t('lock.hint');
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
    migratePin();
    Audit.log('system.boot', 'Nebula OS v2.9.0');
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

    /* connectivity (users must always know when they're offline) */
    netStatus(typeof navigator.onLine === 'boolean' ? navigator.onLine : true);
    window.addEventListener('offline', () => { netStatus(false); Audit.log('net.offline'); notify('📡', t('net.off')); });
    window.addEventListener('online', () => { netStatus(true); Audit.log('net.online'); notify('📡', t('net.on')); });
    document.addEventListener('keydown', tvKeyHandler, true);
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
      if (byId('tour')) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); tourClose(false); }
        return;
      }
      if (byId('help')) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); helpClose(); }
        return;
      }
      if (e.key === '?') { e.preventDefault(); helpOpen(); return; }
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const w = focusedWin;
        if (w && !w.minimized) { e.preventDefault(); altSnap(w, e.key); return; }
      }
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
    if (!OS.settings.tourSeen) setTimeout(tourStart, 2400);
  buildTodayWidget();
  setTimeout(taskReminders, 6000);
  setInterval(taskReminders, 60000);
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
  window.Audit = Audit;
  window.safeMath = safeMath;
  window.sha256Hex = sha256Hex;
  window.TV_STREAMS = TV_STREAMS;
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
