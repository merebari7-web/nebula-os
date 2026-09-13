/* ============================================================
   NEBULA OS — ANDROID COMPATIBILITY LAYER (v2.1)
   • real APK parsing (APK = ZIP): package name, version, icon
   • Android launcher (installed apps grid, App Center, recents)
   • per-app session windows with Android chrome (status bar + nav)
   • web-bridge runtime: launches the app's official web version
     (embedded where possible, otherwise one tap to open it)
   ============================================================ */
(function () {
  'use strict';
  const Nebula = window.Nebula;
  const OS = Nebula.OS;
  const $el = window.$el;
  const esc = window.esc;
  const t = (k) => window.I18N.t(k);
  const notify = window.notify;

  const LS_KEY = 'nebula.android.v1';
  let installed = [];
  try { installed = JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch (e) {}
  const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(installed)); } catch (e) {} };

  /* ---------- web-bridge catalog (package → official web version) ---------- */
  const BRIDGES = [
    { pkg: 'com.google.android.youtube', name: 'YouTube', icon: '▶️', mode: 'nebula:youtube', kind: 'Media' },
    { pkg: 'com.google.android.apps.maps', name: 'Maps', icon: '🗺️', mode: 'nebula:maps', kind: 'Tools' },
    { pkg: 'org.mozilla.firefox', name: 'Firefox', icon: '🦊', mode: 'nebula:browser', kind: 'Tools' },
    { pkg: 'com.android.chrome', name: 'Chrome', icon: '🌐', mode: 'nebula:browser', kind: 'Tools' },
    { pkg: 'com.whatsapp', name: 'WhatsApp', icon: '💬', mode: 'tab:https://web.whatsapp.com', kind: 'Social' },
    { pkg: 'com.facebook.orca', name: 'Messenger', icon: '📨', mode: 'tab:https://www.messenger.com', kind: 'Social' },
    { pkg: 'com.instagram.android', name: 'Instagram', icon: '📸', mode: 'tab:https://www.instagram.com', kind: 'Social' },
    { pkg: 'com.telegram.org', name: 'Telegram', icon: '✈️', mode: 'tab:https://web.telegram.org', kind: 'Social' },
    { pkg: 'com.discord', name: 'Discord', icon: '🎧', mode: 'tab:https://discord.com/app', kind: 'Social' },
    { pkg: 'com.reddit.frontpage', name: 'Reddit', icon: '👽', mode: 'tab:https://www.reddit.com', kind: 'Social' },
    { pkg: 'com.spotify.music', name: 'Spotify', icon: '🎵', mode: 'tab:https://open.spotify.com', kind: 'Media' },
    { pkg: 'com.netflix.mediaclient', name: 'Netflix', icon: '🎬', mode: 'tab:https://www.netflix.com', kind: 'Media' },
    { pkg: 'tv.twitch.android.client', name: 'Twitch', icon: '🎮', mode: 'tab:https://www.twitch.tv', kind: 'Media' },
    { pkg: 'org.videolan.vlc', name: 'VLC', icon: '🔺', mode: 'tab:https://www.videolan.org/vlc', kind: 'Media' },
    { pkg: 'com.google.android.gm', name: 'Gmail', icon: '📧', mode: 'tab:https://mail.google.com', kind: 'Tools' },
    { pkg: 'com.google.android.apps.docs', name: 'Docs', icon: '📝', mode: 'nebula:notes', kind: 'Tools' },
    { pkg: 'com.google.android.calendar', name: 'Calendar', icon: '📅', mode: 'nebula:calendar', kind: 'Tools' },
    { pkg: 'com.duolingo', name: 'Duolingo', icon: '🦉', mode: 'tab:https://www.duolingo.com', kind: 'Education' },
    { pkg: 'org.mozilla.fennec', name: 'Fennec', icon: '🌙', mode: 'nebula:browser', kind: 'Tools' }
  ];

  /* ---------- minimal ZIP reader (APKs are ZIP archives) ---------- */
  function readZip(buf) {
    const u8 = new Uint8Array(buf);
    const dv = new DataView(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65558); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Not a valid ZIP/APK archive');
    const count = dv.getUint16(eocd + 10, true);
    const cdOff = dv.getUint32(eocd + 16, true);
    const entries = [];
    let p = cdOff;
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const compSize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
      entries.push({ name, method, compSize, localOff });
      p += 46 + nameLen + extraLen + commentLen;
    }
    async function read(entry) {
      let q = entry.localOff;
      if (dv.getUint32(q, true) !== 0x04034b50) throw new Error('Corrupt local header');
      const nLen = dv.getUint16(q + 26, true);
      const xLen = dv.getUint16(q + 28, true);
      const start = q + 30 + nLen + xLen;
      const data = u8.subarray(start, start + entry.compSize);
      if (entry.method === 0) return data.slice();
      if (entry.method === 8) {
        if (typeof DecompressionStream === 'undefined') throw new Error('Deflate needs a modern browser (DecompressionStream)');
        const ds = new DecompressionStream('deflate-raw');
        const stream = new Blob([data]).stream().pipeThrough(ds);
        return new Uint8Array(await new Response(stream).arrayBuffer());
      }
      throw new Error('Unsupported compression method ' + entry.method);
    }
    return { entries, read };
  }

  function bytesToDataUrl(u8, mime) {
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return 'data:image/' + mime + ';base64,' + btoa(bin);
  }
  function decodeMany(u8) {
    try { return [new TextDecoder('utf-8').decode(u8), new TextDecoder('utf-16le').decode(u8)]; } catch (e) { return ['', '']; }
  }
  function parsePackage(manBytes) {
    const texts = decodeMany(manBytes).join(' ');
    const cands = texts.match(/[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}/g) || [];
    const ok = cands.filter((c) => /^(com|org|io|net|dev|me|app|ai|xyz|info|biz)\./.test(c) && !/\.(xml|png|json|txt)$/.test(c));
    if (!ok.length) return null;
    ok.sort((a, b) => b.split('.').length - a.split('.').length);
    return ok[0];
  }
  function parseVersion(manBytes) {
    const m = decodeMany(manBytes).join(' ').match(/\b(\d+(?:\.\d+){1,4})\b/);
    return m ? m[1] : null;
  }
  function prettyPkg(pkg) {
    const last = pkg.split('.').pop() || pkg;
    return last.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /* ---------- install ---------- */
  async function installFromBuffer(buf) {
    const zip = readZip(buf);
    const man = zip.entries.find((e) => e.name === 'AndroidManifest.xml');
    if (!man) throw new Error('Not an APK (missing AndroidManifest.xml)');
    const manBytes = await zip.read(man);
    const pkg = parsePackage(manBytes);
    if (!pkg) throw new Error('Could not read package name from manifest');
    const ver = parseVersion(manBytes);

    let icon = null;
    const iconCands = zip.entries
      .filter((e) => /ic_launcher/i.test(e.name) && /\.(png|webp|jpg)$/.test(e.name))
      .sort((a, b) => b.name.length - a.name.length);
    for (const c of iconCands) {
      try {
        const d = await zip.read(c);
        if (!d.length || d.length > 250000) continue;
        if (d[0] === 0x89 && d[1] === 0x50) { icon = bytesToDataUrl(d, 'png'); break; }
        if (d[0] === 0xff && d[1] === 0xd8) { icon = bytesToDataUrl(d, 'jpeg'); break; }
      } catch (e) { /* try next icon */ }
    }

    const bridge = BRIDGES.find((b) => b.pkg === pkg);
    const app = {
      pkg,
      name: (bridge && bridge.name) || prettyPkg(pkg),
      ver: ver || '1.0',
      icon: icon || null,
      emoji: bridge ? bridge.icon : '🤖',
      bridge: bridge ? bridge.mode : null,
      source: 'apk',
      at: Date.now()
    };
    installed = installed.filter((a) => a.pkg !== pkg);
    installed.push(app);
    save();
    return app;
  }
  function installFromCatalog(bridge) {
    const app = {
      pkg: bridge.pkg, name: bridge.name, ver: 'web',
      icon: null, emoji: bridge.icon, bridge: bridge.mode,
      source: 'store', at: Date.now()
    };
    installed = installed.filter((a) => a.pkg !== app.pkg);
    installed.push(app);
    save();
    return app;
  }
  function uninstall(pkg) {
    installed = installed.filter((a) => a.pkg !== pkg);
    save();
  }
  function byPkg(pkg) { return installed.find((a) => a.pkg === pkg); }

  /* ---------- sessions ---------- */
  let sessionSeq = 0;
  function sessions() {
    const out = [];
    OS.windows.forEach((w, id) => { if (w.androidPkg) out.push({ id, w, app: byPkg(w.androidPkg) }); });
    return out;
  }
  function launch(pkg) {
    const app = byPkg(pkg);
    if (!app) { notify('🤖', 'Not installed', pkg); return null; }
    const existing = sessions().find((s) => s.app.pkg === app.pkg);
    if (existing) { focusWindow(existing.w); return existing.w; }
    if (app.bridge && app.bridge.indexOf('nebula:') === 0) {
      const nid = app.bridge.slice(7);
      window.openApp(nid);
      notify('🤖', app.name, 'Running natively through Nebula ' + nid);
      return null;
    }
    const id = 'android-session-' + (++sessionSeq);
    const w = window.createWindow({
      id, appId: 'android',
      title: app.name, icon: app.emoji,
      width: 760, height: 540,
      content(win) { buildSession(win, app); }
    });
    w.androidPkg = app.pkg;
    return w;
  }

  function buildSession(win, app) {
    const root = $el('div', 'and-session');
    const url = app.bridge && app.bridge.indexOf('tab:') === 0 ? app.bridge.slice(4) : null;
    root.innerHTML =
      '<div class="and-status"><span class="and-status-app">🤖 ' + esc(app.name) + '</span>' +
        '<span class="and-status-time" data-time>--:--</span>' +
        '<span class="and-status-ic">📶 🔋 87%</span></div>' +
      '<div class="and-body"></div>' +
      '<div class="and-nav">' +
        '<button class="and-nav-btn" data-nav="back" aria-label="Back">◀</button>' +
        '<button class="and-nav-btn" data-nav="home" aria-label="Home">●</button>' +
        '<button class="and-nav-btn" data-nav="recent" aria-label="Recent apps">◫</button>' +
      '</div>' +
      '<div class="and-recents hidden"></div>';
    win.body.appendChild(root);
    const body = root.querySelector('.and-body');
    const recents = root.querySelector('.and-recents');

    if (url) {
      body.innerHTML =
        '<div class="and-webbar"><span>🌐 ' + esc(url.replace(/^https?:\/\//, '')) + '</span>' +
          '<button class="btn ghost sm" data-open>Open externally ↗</button></div>' +
        '<iframe class="and-frame" src="' + esc(url) + '" sandbox="allow-scripts allow-same-origin allow-forms" title="' + esc(app.name) + '"></iframe>';
      root.querySelector('[data-open]').addEventListener('click', () => {
        try { window.open(url, '_blank'); } catch (e) {}
      });
    } else {
      body.innerHTML =
        '<div class="and-info">' +
          '<div class="and-info-ic">' + (app.icon ? '<img src="' + esc(app.icon) + '" alt="">' : app.emoji) + '</div>' +
          '<h3>' + esc(app.name) + '</h3>' +
          '<div class="and-info-pkg">' + esc(app.pkg) + ' · v' + esc(app.ver) + ' · ' + (app.source === 'store' ? 'App Center' : 'APK') + '</div>' +
          '<p class="and-info-note">' + esc(t('and.noBridge')) + '</p>' +
          '<div class="and-info-actions">' +
            '<button class="btn" data-search>🔎 Search web</button>' +
            '<button class="btn ghost" data-fdroid>F-Droid page ↗</button>' +
            '<button class="btn ghost danger" data-uninstall>Uninstall</button>' +
          '</div>' +
        '</div>';
      root.querySelector('[data-search]').addEventListener('click', () => {
        try { window.open('https://www.google.com/search?q=' + encodeURIComponent(app.pkg), '_blank'); } catch (e) {}
      });
      root.querySelector('[data-fdroid]').addEventListener('click', () => {
        try { window.open('https://f-droid.org/packages/' + app.pkg, '_blank'); } catch (e) {}
      });
      root.querySelector('[data-uninstall]').addEventListener('click', () => {
        uninstall(app.pkg);
        window.closeWindow(win.id);
        notify('🗑', 'Uninstalled', app.name);
        renderLauncher();
      });
    }

    const clockEl = root.querySelector('[data-time]');
    const tick = () => { clockEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
    tick();
    const iv = setInterval(tick, 30000);
    win.onClose = () => clearInterval(iv);

    function renderRecents() {
      recents.innerHTML = '';
      const list = sessions();
      if (!list.length) recents.appendChild($el('div', 'and-rec-empty', 'No running apps'));
      list.forEach((s) => {
        const row = $el('button', 'and-rec-row');
        row.innerHTML = '<span>' + s.app.emoji + ' ' + esc(s.app.name) + '</span><small data-x>✕</small>';
        row.addEventListener('click', (e) => {
          if (e.target.closest('[data-x]')) { closeWindow(s.id); return; }
          recents.classList.add('hidden');
          focusWindow(s.w);
        });
        recents.appendChild(row);
      });
    }
    root.querySelector('[data-nav="recent"]').addEventListener('click', () => {
      if (recents.classList.contains('hidden')) { renderRecents(); recents.classList.remove('hidden'); }
      else recents.classList.add('hidden');
    });
    root.querySelector('[data-nav="home"]').addEventListener('click', () => {
      recents.classList.add('hidden');
      window.openApp('android');
    });
    root.querySelector('[data-nav="back"]').addEventListener('click', () => {
      const fr = root.querySelector('.and-frame');
      if (fr) { fr.src = fr.src; notify('◀', 'Back', 'Web content reloaded'); }
      else window.openApp('android');
    });
  }

  /* ---------- launcher ---------- */
  let centerOpen = false;
  function renderLauncher(winEl) {
    const el = winEl || (OS.windows.get('android') && OS.windows.get('android').el);
    if (!el) return;
    const grid = el.querySelector('.and-grid');
    const count = el.querySelector('[data-and-count]');
    if (!grid) return;
    grid.innerHTML = '';
    if (count) count.textContent = installed.length;

    const apktile = $el('button', 'and-app and-apk');
    apktile.innerHTML = '<span class="and-app-ic">📦</span><span class="and-app-name">' + esc(t('and.install')) + '</span>';
    grid.appendChild(apktile);
    const centile = $el('button', 'and-app and-center');
    centile.innerHTML = '<span class="and-app-ic">🛒</span><span class="and-app-name">' + esc(t('and.center')) + '</span>';
    grid.appendChild(centile);

    installed.forEach((app) => {
      const b = $el('button', 'and-app');
      b.innerHTML = '<span class="and-app-ic">' + (app.icon ? '<img src="' + esc(app.icon) + '" alt="">' : app.emoji) + '</span>' +
        '<span class="and-app-name">' + esc(app.name) + '</span>' +
        (app.source === 'apk' ? '<small class="and-app-src">APK ' + esc(app.ver) + '</small>' : '');
      b.addEventListener('click', () => launch(app.pkg));
      grid.appendChild(b);
    });

    const center = el.querySelector('.and-store');
    if (center) {
      center.classList.toggle('hidden', !centerOpen);
      grid.classList.toggle('hidden', centerOpen);
      const q = el.querySelector('[data-store-q]');
      if (centerOpen) fillStore(center, q ? q.value : '');
    }
  }
  function fillStore(centerEl, q) {
    centerEl.innerHTML = '';
    const list = BRIDGES.filter((b) => !q || b.name.toLowerCase().includes(q.toLowerCase()) || b.pkg.includes(q.toLowerCase()));
    if (!list.length) centerEl.appendChild($el('div', 'and-store-empty', 'No apps found'));
    list.forEach((b) => {
      const isInstalled = !!byPkg(b.pkg);
      const row = $el('div', 'and-store-row');
      row.innerHTML = '<span class="and-store-ic">' + b.icon + '</span>' +
        '<span class="and-store-name">' + esc(b.name) + '<small>' + esc(b.kind) + ' · ' + (isInstalled ? 'installed' : 'web bridge') + '</small></span>' +
        '<button class="btn sm ' + (isInstalled ? 'ghost' : '') + '" data-pkg="' + esc(b.pkg) + '">' + (isInstalled ? 'Open' : 'Install') + '</button>';
      row.querySelector('button').addEventListener('click', () => {
        if (!isInstalled) { installFromCatalog(b); notify('🛒', 'Installed', b.name + ' (web bridge)'); }
        launch(b.pkg);
        fillStore(centerEl, q);
      });
      centerEl.appendChild(row);
    });
  }

  registerApp({
    id: 'android',
    title: 'Android',
    titleKey: 'app.android',
    icon: '🤖',
    tile: 'linear-gradient(135deg,#3ddc84,#0f9d58)',
    open() {
      window.createWindow({
        id: 'android',
        appId: 'android',
        title: t('app.android'),
        icon: '🤖',
        width: 700,
        height: 520,
        content(win) {
          const root = $el('div', 'and-home');
          root.innerHTML =
            '<div class="and-lstatus">' +
              '<span class="and-lstatus-name">NEBULA · ANDROID COMPATIBILITY</span>' +
              '<span><b data-and-count>0</b> installed</span>' +
            '</div>' +
            '<div class="and-grid"></div>' +
            '<div class="and-store hidden"></div>' +
            '<div class="and-store-bar hidden">' +
              '<input data-store-q placeholder="Search App Center…" spellcheck="false">' +
            '</div>';
          win.body.appendChild(root);
          const grid = root.querySelector('.and-grid');
          const center = root.querySelector('.and-store');
          const bar = root.querySelector('.and-store-bar');
          const picker = document.createElement('input');
          picker.type = 'file';
          picker.accept = '.apk,application/vnd.android.package-archive';
          picker.hidden = true;
          win.body.appendChild(picker);

          const gridBtns = () => Array.from(grid.children);
          grid.addEventListener('click', (e) => {
            const b = e.target.closest('.and-app');
            if (!b) return;
            if (b.classList.contains('and-apk')) { picker.click(); return; }
            if (b.classList.contains('and-center')) {
              centerOpen = !centerOpen;
              bar.classList.toggle('hidden', !centerOpen);
              renderLauncher();
              return;
            }
          });
          bar.querySelector('[data-store-q]').addEventListener('input', (e) => fillStore(center, e.target.value));

          picker.addEventListener('change', async () => {
            const f = picker.files && picker.files[0];
            picker.value = '';
            if (!f) return;
            try {
              const app = await installFromBuffer(await f.arrayBuffer());
              notify('📦', 'APK installed', app.name + ' · ' + app.pkg);
              renderLauncher();
            } catch (err) {
              notify('⚠️', 'Install failed', err.message || String(err));
            }
          });

          win.el.addEventListener('dragover', (e) => { e.preventDefault(); });
          win.el.addEventListener('drop', async (e) => {
            e.preventDefault();
            const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (!f || !/\.apk$/i.test(f.name)) return;
            try {
              const app = await installFromBuffer(await f.arrayBuffer());
              notify('📦', 'APK installed', app.name + ' · ' + app.pkg);
              renderLauncher();
            } catch (err) {
              notify('⚠️', 'Install failed', err.message || String(err));
            }
          });

          renderLauncher(win.el);
        }
      });
    }
  });

  window.NebulaAndroid = {
    install: installFromBuffer,
    fromCatalog: installFromCatalog,
    uninstall,
    list: () => installed.slice(),
    launch,
    byPkg,
    BRIDGES
  };

  /* all apps are registered by now (android.js loads last) — boot the OS */
  OS.init();
})();
