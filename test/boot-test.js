/* Nebula OS boot test — jsdom regression + feature suite (v2.4.0) */
const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = '/home/user/webos';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const passed = [];
const ok = (cond, msg) => { if (cond) passed.push(msg); else { errors.push('FAIL: ' + msg); console.error('FAIL:', msg); } };

/* ---- minimal ZIP (stored) builder for APK fixtures ---- */
const CRC_TABLE = (() => {
  const t = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function buildApk(pkg, ver) {
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const manifest = '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="' + pkg + '" android:versionName="' + ver + '"><application android:label="Test App"><activity android:name=".Main"/></application></manifest>';
  const mBytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(manifest, 'utf16le')]);
  const entries = [
    { name: 'AndroidManifest.xml', data: mBytes },
    { name: 'res/mipmap-hdpi/ic_launcher.png', data: PNG }
  ];
  const locals = [], cents = [];
  let offset = 0, cdSize = 0;
  for (const e of entries) {
    const nb = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(0, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(e.data.length, 18); lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(nb.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(Buffer.concat([lh, nb, e.data]));
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(e.data.length, 20); ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(offset, 42);
    cents.push(Buffer.concat([ch, nb]));
    cdSize += 46 + nb.length;
    offset += 30 + nb.length + e.data.length;
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...cents, eocd]);
}

(async () => {
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    if (!/not implemented|could not load|createObjectURL is not a function/i.test(String(e)))
      errors.push('jsdom: ' + e.message);
  });
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

  class FileLoader extends ResourceLoader {
    fetch(url, options) {
      const prefix = 'http://localhost:8080/';
      if (url.startsWith(prefix)) {
        const p = path.join(ROOT, url.slice(prefix.length).split('?')[0]);
        if (fs.existsSync(p)) return Promise.resolve(Buffer.from(fs.readFileSync(p)));
      }
      return super.fetch(url, options);
    }
  }
  const dom = await JSDOM.fromFile(path.join(ROOT, 'index.html'), {
    resources: new FileLoader(),
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost:8080/',
    virtualConsole: vc,
    beforeParse(window) {
      window.addEventListener('error', (e) => errors.push('window: ' + e.message + ' @ ' + (e.filename || '') + ':' + e.lineno));
      window.URL.createObjectURL = () => 'blob:fake';
      window.HTMLElement.prototype.scrollIntoView = function () {};
      window.URL.revokeObjectURL = () => {};
      window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      if (!window.TextDecoder) { window.TextDecoder = TextDecoder; window.TextEncoder = TextEncoder; }
      window.fetch = () => new Promise(() => {}); // never resolves: exercise offline path
      const noop = () => {};
      window.HTMLCanvasElement.prototype.getContext = function () {
        if (!this.__ctx) {
          this.__ctx = new Proxy({}, {
            get: (t, p) => (p in t ? t[p] : (p === 'measureText' ? () => ({ width: 0 }) : noop)),
            set: (t, p, v) => { t[p] = v; return true; }
          });
        }
        return this.__ctx;
      };
    }
  });
  const { window } = dom;
  const { document } = window;

  await sleep(3200); // boot sequence

  /* ---------- boot ---------- */
  console.log('--- boot ---');
  ok(window.OS && window.OS.version === '2.7.0', 'OS booted at v2.7.0');
  ok(typeof window.APPS === 'object', 'APPS registry exposed');
  ok(Object.keys(window.APPS).length === 27, '27 apps registered (' + Object.keys(window.APPS).length + ')');
  ok(window.WALLPAPERS.length === 8, '8 wallpapers');
  ok(typeof window.OS.settings === 'object', 'settings state initialized after boot');
  ok(document.body.dataset.theme === 'dark', 'default theme dark applied');

  /* ---------- onboarding tour ---------- */
  console.log('--- onboarding tour ---');
  let tourEl = document.getElementById('tour');
  ok(!!tourEl && !!tourEl.querySelector('.tour-card'), 'tour auto-opens on first run');
  ok(tourEl.querySelector('.tour-step').textContent === 'Step 1 / 5', 'tour starts at step 1 of 5');
  const label1 = tourEl.querySelector('.tour-card').getAttribute('aria-label');
  tourEl.querySelector('[data-ts="next"]').click();
  await sleep(60);
  const label2 = document.getElementById('tour').querySelector('.tour-card').getAttribute('aria-label');
  ok(label1 !== label2, 'tour Next advances to step 2');
  document.getElementById('tour').querySelector('[data-ts="skip"]').click();
  await sleep(60);
  ok(!document.getElementById('tour'), 'tour skip closes it and marks seen');
  ok(window.OS.settings.tourSeen === true, 'tourSeen persisted in settings');
  ok(window.Audit.read().some((e) => e.event === 'tour.skipped'), 'tour skip audited');
  const brand = document.querySelector('#mb-brand');
  brand.click();
  await sleep(60);
  brand.querySelector('[data-act="tour"]').click();
  await sleep(60);
  ok(!!document.getElementById('tour'), 'Nebula menu > Restart tour reopens the tour');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(60);
  ok(!document.getElementById('tour'), 'Esc closes the tour');

  /* ---------- desktop & dock ---------- */
  console.log('--- desktop & dock ---');
  const icons = document.querySelectorAll('#desktop-icons .desktop-icon');
  ok(icons.length === 27, '27 desktop icons rendered');
  const dockIcons = document.querySelectorAll('#dock .dock-icon');
  ok(dockIcons.length >= 12, 'dock populated (' + dockIcons.length + ')');
  const startBtn = document.getElementById('start-btn');
  ok(!!startBtn, 'start button exists');
  startBtn.click();
  await sleep(80);
  const startApps = document.querySelectorAll('#start-grid .start-app');
  ok(startApps.length === 27, 'start menu lists all 27 apps');
  document.body.click();
  await sleep(60);

  /* ---------- menubar: roles + arrow-key navigation ---------- */
  console.log('--- menubar a11y ---');
  ok(document.querySelectorAll('.mb-menu[role="menu"]').length === 5, '5 menubar menus have role=menu');
  ok(document.querySelectorAll('.mb-mi[role="menuitem"]').length === 22, '22 menubar items have role=menuitem');
  const fileMenu = document.querySelector('#menubar .mb-item[data-menu]');
  fileMenu.click();
  await sleep(60);
  ok(fileMenu.classList.contains('open'), 'File menu opens on click');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  await sleep(40);
  let act = document.activeElement;
  ok(act && act.classList.contains('mb-mi'), 'ArrowDown focuses first menu item');
  const firstItem = act;
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  await sleep(40);
  ok(document.activeElement !== firstItem, 'ArrowDown moves to next item');
  firstItem.click(); // About (first File-menu item)
  await sleep(150);
  ok(!!window.OS.windows.get('about'), 'menu item action opens About');
  ok(window.OS.windows.get('about').el.textContent.includes('New in 2.5'), 'About lists the v2.5 new apps');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(60);

  /* ---------- context menu ---------- */
  const wallEv = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 });
  document.getElementById('wallpaper').dispatchEvent(wallEv);
  await sleep(60);
  const ctxEl = document.getElementById('ctx-menu');
  ok(ctxEl.classList.contains('open') && ctxEl.getAttribute('role') === 'menu', 'context menu opens with role=menu');
  ok(ctxEl.querySelectorAll('.ctx-item[role="menuitem"]').length >= 5, 'context items expose role=menuitem');
  document.body.click();

  /* ---------- windows ---------- */
  console.log('--- windows ---');
  window.openApp('calc');
  await sleep(140);
  const calcW = window.OS.windows.get('calc');
  ok(!!calcW, 'calc window opens');
  ok(calcW.el.classList.contains('focused'), 'new window is focused');
  ok(document.getElementById('mb-app-name').textContent === 'Calculator', 'menubar shows frontmost app');
  const bar = calcW.el.querySelector('.titlebar');
  console.log('DEBUG style:', JSON.stringify(calcW.el.style.cssText.slice(0, 140)));
  ok(bar.getAttribute('tabindex') === '0', 'titlebar is keyboard-focusable');
  /* jsdom layout: getBoundingClientRect() is always 0 — handler math is still exercised */
  bar.focus();
  bar.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await sleep(30);
  /* jsdom zero-rect: clamp floor is -r.width+110 = 110 — handler ran, repositioned */
  ok(parseFloat(calcW.el.style.left) === 110, 'titlebar ArrowRight repositions window');
  bar.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
  await sleep(30);
  const hNow = parseFloat(calcW.el.style.height);
  ok(isFinite(hNow) && hNow > 0, 'titlebar Shift+ArrowUp resizes window');

  window.openApp('files');
  await sleep(140);
  ok(window.OS.windows.size >= 3, 'multiple windows coexist');
  window.closeWindow('calc');
  await sleep(60);
  ok(document.getElementById('mb-app-name').textContent !== 'Calculator', 'menubar updates when frontmost closes');
  await sleep(200);

  /* ---------- spotlight ---------- */
  console.log('--- spotlight ---');
  const spot = document.getElementById('spotlight');
  ok(!!spot, 'spotlight exists');
  const si = spot.querySelector('input');
  si.value = '2+2*3';
  si.dispatchEvent(new window.Event('input', { bubbles: true }));
  await sleep(120);
  const spotRes = spot.textContent;
  ok(spotRes.includes('8'), 'spotlight math "2+2*3" returns 8 (safe parser)');
  window.localStorage.setItem('nebula.contacts.v1', JSON.stringify([{ id: 901, name: 'Spotlight Smith', phone: '555-7788', email: 'spot@example.gov', notes: '' }]));
  si.value = 'spotlight smith';
  si.dispatchEvent(new window.Event('input', { bubbles: true }));
  await sleep(120);
  ok(spot.textContent.includes('Spotlight Smith') && spot.textContent.includes('Contact'), 'spotlight searches local contacts');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(60);

  /* ---------- assistant ---------- */
  const asst = document.getElementById('asst-panel');
  ok(!!asst, 'assistant panel exists');

  /* ---------- terminal ---------- */
  console.log('--- terminal ---');
  window.openApp('terminal');
  await sleep(160);
  const term = window.OS.windows.get('terminal');
  ok(!!term, 'terminal opens');
  const tin = term.el.querySelector('.term-input');
  const runCmd = async (cmd) => {
    tin.value = cmd;
    tin.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(90);
    return term.el.querySelector('.term-out').textContent;
  };
  let out = await runCmd('echo hello-gov-24');
  ok(out.includes('hello-gov-24'), 'terminal echo works');
  out = await runCmd('neofetch');
  ok(out.includes('NEBULA'), 'neofetch works');
  out = await runCmd('theme patriot');
  await sleep(80);
  ok(document.body.dataset.theme === 'patriot', 'terminal theme patriot applies');
  window.OS.settings.theme = 'dark'; window.OS.applySettings();
  out = await runCmd('audit');
  ok(out.toLowerCase().includes('app.open') || out.toLowerCase().includes('system.boot'), 'terminal audit shows the trail');
  out = await runCmd('tv');
  await sleep(120);
  ok(!document.getElementById('tv-home').classList.contains('hidden'), 'terminal tv opens TV Mode');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(80);
  ok(document.getElementById('tv-home').classList.contains('hidden'), 'Esc exits TV Mode');

  /* ---------- settings ---------- */
  console.log('--- settings ---');
  window.openApp('settings');
  await sleep(160);
  const setW = window.OS.windows.get('settings');
  ok(setW.el.querySelectorAll('[data-seg="theme"] button').length === 3, 'theme picker offers 3 themes');
  ok(!!setW.el.querySelector('[data-erase]'), 'erase-all-data control present');
  ok(!!setW.el.querySelector('[data-idlemin]'), 'auto-lock idle select present');
  ok(!!setW.el.querySelector('[data-pin="set"]'), 'PIN set control present');

  /* ---------- audit app ---------- */
  console.log('--- audit app ---');
  ok(typeof window.Audit === 'object', 'Audit kernel exposed');
  const bootEntry = window.Audit.read().find((e) => e.event === 'system.boot');
  ok(!!bootEntry, 'boot event recorded in audit trail');
  ok(window.Audit.read().some((e) => e.event === 'app.open'), 'app.open events recorded');
  window.openApp('audit');
  await sleep(160);
  const auditW = window.OS.windows.get('audit');
  ok(!!auditW && auditW.el.querySelectorAll('.audit-row').length >= 3, 'audit app renders the trail');
  ok(!!auditW.el.querySelector('[data-export]') && !!auditW.el.querySelector('[data-clear]'), 'audit app has export + clear');
  window.closeWindow('audit');
  await sleep(60);

  /* ---------- announcer ---------- */
  const ann = document.getElementById('os-announcer');
  ok(!!ann && ann.getAttribute('role') === 'status' && ann.getAttribute('aria-live') === 'polite', 'OS announcer is a polite live region');
  window.openApp('notes');
  await sleep(250);
  ok(ann.textContent.length > 0, 'window-open event announced to screen readers');
  window.closeWindow('notes');
  await sleep(250);
  ok(ann.textContent.length > 0, 'window-close event announced');

  /* ---------- net status ---------- */
  const wifi = document.getElementById('tray-wifi');
  window.dispatchEvent(new window.Event('offline'));
  await sleep(60);
  ok(wifi.classList.contains('off'), 'wifi icon dims when offline');
  ok(window.Audit.read().some((e) => e.event === 'net.offline'), 'offline transition audited');
  window.dispatchEvent(new window.Event('online'));
  await sleep(60);
  ok(!wifi.classList.contains('off'), 'wifi icon restores when online');

  /* ---------- PIN security ---------- */
  console.log('--- PIN security ---');
  ok(typeof window.sha256Hex === 'function', 'sha256Hex exposed');
  ok(window.sha256Hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'SHA-256 known vector (abc) correct');
  window.OS.setPin('4242');
  ok(!!window.OS.settings.pinHash && window.OS.settings.pin === '', 'PIN stored as hash, never cleartext');
  ok(window.Audit.read().some((e) => e.event === 'security.pin.set'), 'PIN set audited');
  window.lockScreen();
  await sleep(120);
  ok(!document.getElementById('lock-screen').classList.contains('hidden'), 'lock screen shows');
  ok(!document.getElementById('lock-pin-wrap').classList.contains('hidden'), 'PIN pad visible when PIN set');
  ['4', '2', '4', '2'].forEach((d) => {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: d, bubbles: true }));
  });
  await sleep(160);
  ok(document.getElementById('lock-screen').classList.contains('hidden'), 'correct PIN unlocks');
  ok(window.Audit.read().some((e) => e.event === 'security.unlock'), 'unlock audited');
  window.OS.clearPin();
  ok(window.OS.settings.pinHash === '', 'PIN cleared removes hash');

  /* ---------- safe math (attacks) ---------- */
  ok(window.safeMath('2+2*3') === 8, 'safeMath precedence');
  ok(window.safeMath('(1+2)*3') === 9, 'safeMath parens');
  ok(window.safeMath('-5+3') === -2, 'safeMath unary minus');
  ok(window.safeMath('7%3') === 1, 'safeMath modulo');
  ok(window.safeMath('10/4') === 2.5, 'safeMath division');
  const attack = (expr) => { try { window.safeMath(expr); return false; } catch (e) { return true; } };
  ok(attack('alert(1)'), 'safeMath rejects function calls');
  ok(attack('process.exit(1)'), 'safeMath rejects identifier access');
  ok(attack('2..3'), 'safeMath rejects double dot');
  ok(attack('1;2'), 'safeMath rejects statement separator');

  /* ---------- CSP & code hygiene ---------- */
  const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  ok(!!cspMeta, 'CSP meta present');
  ok(cspMeta.content.includes("script-src 'self'"), 'CSP locks scripts to self');
  ok(cspMeta.content.includes("object-src 'none'"), 'CSP blocks plugins');
  const jsDir = path.join(ROOT, 'js');
  const jsFiles = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js'));
  const hasEval = jsFiles.some((f) => /new Function\(|\beval\(/.test(fs.readFileSync(path.join(jsDir, f), 'utf8')));
  ok(!hasEval, 'no eval/new Function in any shell JS');
  ok(fs.existsSync(path.join(ROOT, 'docs', 'a11y.html')), 'accessibility statement page exists');

  /* ---------- i18n ---------- */
  console.log('--- i18n ---');
  window.OS.setLanguage('ar');
  await sleep(120);
  ok(document.documentElement.dir === 'rtl', 'Arabic switches to RTL');
  ok(document.documentElement.lang === 'ar', 'html lang synced to ar');
  window.OS.setLanguage('ja');
  await sleep(120);
  const titleJa = document.querySelector('.mb-mi[data-act="tv"] span');
  ok(titleJa && titleJa.textContent === 'テレビモード', 'TV Mode label translated (ja)');
  window.OS.setLanguage('en');
  await sleep(80);

  /* ---------- celebrate (v2.3) ---------- */
  window.OS.celebrate();
  await sleep(150);
  ok(document.querySelector('.fw-canvas') !== null, 'celebrate launches fireworks');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(60);
  ok(document.querySelector('.fw-canvas') === null, 'Esc stops fireworks');

  /* ---------- Android layer (v2.1) ---------- */
  console.log('--- android ---');
  ok(typeof window.NebulaAndroid === 'object', 'Android runtime exposed');
  const toAB = (buf) => { const ab = new window.ArrayBuffer(buf.length); new window.Uint8Array(ab).set(buf); return ab; };
  const APK1 = buildApk('com.test.nebulaapp', '2.5.1');
  const instApp = await window.NebulaAndroid.install(toAB(APK1), 'test.apk');
  ok(instApp.pkg === 'com.test.nebulaapp', 'APK package parsed (' + instApp.pkg + ')');
  ok(instApp.ver === '2.5.1', 'APK version parsed');
  ok(JSON.parse(window.localStorage.getItem('nebula.android.v1')).length === 1, 'install persisted');
  window.openApp('android');
  await sleep(180);
  const andW = window.OS.windows.get('android');
  ok(andW.el.querySelectorAll('.and-app').length >= 1, 'Android launcher shows installed app');
  const APK2 = buildApk('com.drop.testapp', '0.9');
  const dropEv = new window.Event('drop');
  dropEv.dataTransfer = { files: [{ name: 'drop.apk', arrayBuffer: async () => toAB(APK2) }] };
  andW.el.dispatchEvent(dropEv);
  await sleep(150);
  ok(!!window.NebulaAndroid.byPkg('com.drop.testapp'), 'dropped APK installed');
  andW.el.querySelector('.and-app.and-center').click();
  await sleep(150);
  const storeRows = andW.el.querySelectorAll('.and-store-row');
  ok(storeRows.length >= 15, 'App Center lists the bridge catalog (' + storeRows.length + ')');
  window.NebulaAndroid.uninstall('com.drop.testapp');
  ok(window.NebulaAndroid.list().length === 1, 'uninstall removes app');
  window.closeWindow('android');
  await sleep(80);

  /* ---------- TV (v2.4) ---------- */
  console.log('--- TV ---');
  ok(window.TV_STREAMS.length === 20, 'TV catalog has 20 services');
  ok(window.TV_STREAMS.some((s) => s.id === 'netflix') && window.TV_STREAMS.some((s) => s.id === 'youtube'), 'catalog includes Netflix + YouTube');
  window.openApp('tv');
  await sleep(160);
  const tvW = window.OS.windows.get('tv');
  ok(!!tvW && tvW.el.querySelectorAll('.tv-app-tile').length === 20, 'TV app renders the catalog');
  ok(!!tvW.el.querySelector('[data-tvmode]'), 'TV app offers Enter TV Mode');
  window.OS.tv.open();
  await sleep(140);
  const home = document.getElementById('tv-home');
  ok(!home.classList.contains('hidden'), 'TV Mode opens full-screen launcher');
  const tvTiles = home.querySelectorAll('.tv-tile');
  ok(tvTiles.length === 47, 'TV Mode shows 27 apps + 20 streams (' + tvTiles.length + ')');
  ok(tvTiles[0].classList.contains('focused'), 'TV Mode starts with first tile focused');
  home.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await sleep(60);
  ok(tvTiles[1].classList.contains('focused') && document.activeElement === tvTiles[1], 'ArrowRight moves TV focus');
  home.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  await sleep(60);
  ok(document.activeElement !== tvTiles[1], 'ArrowDown moves TV focus to next row');
  home.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await sleep(200);
  ok(home.classList.contains('hidden'), 'Enter launches and exits TV Mode');
  ok(window.OS.windows.size > 0, 'launched app opened from TV Mode');
  window.OS.tv.open();
  await sleep(120);
  home.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(80);
  ok(home.classList.contains('hidden'), 'Esc exits TV Mode');
  const yt = window.TV_STREAMS.find((s) => s.id === 'youtube');
  window.OS.tv.launch(yt);
  await sleep(160);
  ok(!!window.OS.windows.get('youtube'), 'YouTube stream launches the native Nebula YouTube');
  const nf = window.TV_STREAMS.find((s) => s.id === 'netflix');
  window.OS.tv.launch(nf);
  await sleep(160);
  const nfW = window.OS.windows.get('tv-netflix');
  ok(!!nfW && nfW.el.querySelector('.tv-s-open'), 'non-embeddable stream gets full-screen session + open button');
  window.closeWindow('tv-netflix');
  window.closeWindow('tv');
  await sleep(80);

  /* ---------- wallpapers (v2.3) ---------- */
  const libIdx = window.WALLPAPERS.findIndex((w) => w.name === 'Liberty');
  ok(libIdx >= 0 && window.WALLPAPERS.some((w) => w.name === 'Old Glory'), 'Liberty + Old Glory wallpapers present');
  /* jsdom CSSOM drops multi-layer gradient shorthands — verify state round-trip instead */
  window.OS.settings.wallpaper = libIdx; window.OS.saveSettings(); window.OS.applySettings();
  ok(window.OS.settings.wallpaper === libIdx && JSON.parse(window.localStorage.getItem('nebula.settings.v1')).wallpaper === libIdx, 'Liberty wallpaper index persisted');
  window.OS.settings.wallpaper = 0; window.OS.saveSettings(); window.OS.applySettings();

  /* ---------- contacts ---------- */
  console.log('--- contacts ---');
  window.localStorage.setItem('nebula.contacts.v1', '[]'); // isolate from spotlight seed
  window.openApp('contacts');
  await sleep(160);
  const ctW = window.OS.windows.get('contacts');
  ok(!!ctW, 'contacts app opens');
  ctW.el.querySelector('[data-new]').click();
  await sleep(60);
  const ctName = ctW.el.querySelector('.ct-f.name');
  ctName.value = 'Ada Lovelace';
  ctName.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(60);
  ok(ctW.el.querySelectorAll('.ct-item').length === 1 && ctW.el.textContent.includes('Ada Lovelace'), 'contact created and listed');
  const ctSearch = ctW.el.querySelector('.ct-search');
  ctSearch.value = 'zzz-nobody';
  ctSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  await sleep(60);
  ok(ctW.el.querySelectorAll('.ct-item').length === 0, 'contact search filters the list');
  ctSearch.value = '';
  ctSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  await sleep(60);
  ctW.el.querySelector('[data-vcard]').click();
  await sleep(80);
  ctW.el.querySelector('[data-csv]').click();
  await sleep(80);
  const ctPick = ctW.el.querySelector('[data-vcardpick]');
  const vcf = 'BEGIN:VCARD\nVERSION:3.0\nFN:Grace Hopper\nTEL;TYPE=CELL:555-0100\nEMAIL:grace@example.gov\nEND:VCARD\n';
  const vcfFile = new window.File([vcf], 'people.vcf', { type: 'text/vcard' });
  Object.defineProperty(ctPick, 'files', { value: [vcfFile], configurable: true });
  ctPick.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(150);
  ok(ctW.el.querySelectorAll('.ct-item').length === 2 && ctW.el.textContent.includes('Grace Hopper'), 'vCard import adds a contact');
  ok(window.Audit.read().some((e) => e.event === 'contacts.import'), 'contact import audited');
  window.closeWindow('contacts');
  await sleep(80);

  /* ---------- music ---------- */
  console.log('--- music ---');
  window.openApp('music');
  await sleep(160);
  const muW = window.OS.windows.get('music');
  ok(!!muW, 'music app opens');
  ok(muW.el.querySelectorAll('.mu-track').length === 0, 'music starts with an empty playlist');
  muW.el.querySelector('[data-demo]').click();
  await sleep(80);
  const muTracks = muW.el.querySelectorAll('.mu-track');
  ok(muTracks.length === 3, 'demo button adds 3 synthesized tracks');
  ok(muW.el.textContent.includes('Nebula Drift') && muW.el.textContent.includes('Starfall Arp'), 'demo track names rendered');
  muW.el.querySelector('[data-play]').click();
  await sleep(100);
  ok(muW.el.querySelector('.mu-warn') !== null, 'music degrades gracefully without an AudioContext');
  window.closeWindow('music');
  await sleep(80);

  /* ---------- tasks ---------- */
  console.log('--- tasks ---');
  window.openApp('tasks');
  await sleep(160);
  const tkW = window.OS.windows.get('tasks');
  ok(!!tkW, 'tasks app opens');
  const tkText = tkW.el.querySelector('.tk-text');
  const tkDue = tkW.el.querySelector('.tk-due');
  const tkPrio = tkW.el.querySelector('.tk-prio');
  const nowD = new Date();
  const todayStr = nowD.getFullYear() + '-' + String(nowD.getMonth() + 1).padStart(2, '0') + '-' + String(nowD.getDate()).padStart(2, '0');
  tkText.value = 'Ship v2.6.0';
  tkDue.value = todayStr;
  tkW.el.querySelector('[data-add]').click();
  await sleep(60);
  tkText.value = 'Write release notes';
  tkPrio.value = '2';
  tkDue.value = '';
  tkText.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await sleep(60);
  ok(tkW.el.querySelectorAll('.tk-item').length === 2, 'two tasks added (button + Enter)');
  const tkItems = tkW.el.querySelectorAll('.tk-item');
  ok(tkItems[0].textContent.includes('Ship v2.6.0'), 'due-today task sorts first');
  tkItems[0].querySelector('.tk-check').click();
  await sleep(60);
  ok(tkW.el.querySelector('.tk-item.done') !== null, 'task completed via checkbox');
  tkW.el.querySelector('[data-f="3"]').click();
  await sleep(60);
  ok(tkW.el.querySelectorAll('.tk-item').length === 1 && tkW.el.querySelector('.tk-item').classList.contains('done'), 'Done filter shows only completed');
  tkW.el.querySelector('[data-f="0"]').click();
  await sleep(60);
  tkW.el.querySelector('[data-cleardone]').click();
  await sleep(60);
  ok(tkW.el.querySelectorAll('.tk-item').length === 1, 'clear-done removes completed task');
  ok(tkW.el.querySelector('.tk-count').textContent.includes('1'), 'open count reflects remaining tasks');
  window.closeWindow('tasks');
  await sleep(80);

  /* ---------- budget ---------- */
  console.log('--- budget ---');
  window.openApp('budget');
  await sleep(160);
  const bgW = window.OS.windows.get('budget');
  ok(!!bgW, 'budget app opens');
  bgW.el.querySelector('.bg-amt').value = '120.50';
  bgW.el.querySelector('.bg-desc').value = 'Lunch';
  bgW.el.querySelector('[data-add]').click();
  await sleep(60);
  bgW.el.querySelector('[data-bt="in"]').click();
  await sleep(30);
  bgW.el.querySelector('.bg-amt').value = '300';
  bgW.el.querySelector('.bg-desc').value = 'Paycheck';
  bgW.el.querySelector('[data-add]').click();
  await sleep(60);
  const bgIn = bgW.el.querySelector('[data-v="in"]').textContent;
  const bgOut = bgW.el.querySelector('[data-v="out"]').textContent;
  const bgNet = bgW.el.querySelector('[data-v="net"]').textContent;
  ok(bgIn === '300.00', 'income card sums this month (' + bgIn + ')');
  ok(bgOut === '120.50', 'expense card sums this month (' + bgOut + ')');
  ok(bgNet === '179.50', 'net card computes this month (' + bgNet + ')');
  ok(bgW.el.querySelectorAll('.bg-row').length === 2, 'both transactions listed');
  bgW.el.querySelector('[data-csvexp]').click();
  await sleep(80);
  ok(window.Audit.read().some((e) => e.event === 'budget.export'), 'budget CSV export audited');
  const csvText = 'type,amount,category,date,description\n"out",42.5,"Food","2026-01-05","Imported lunch"\n"in",10,"Other","2026-01-06","Imported refund"\n';
  Object.defineProperty(bgW.el.querySelector('[data-csvpick]'), 'files', {
    value: [new window.File([csvText], 'budget.csv', { type: 'text/csv' })], configurable: true
  });
  bgW.el.querySelector('[data-csvpick]').dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(150);
  ok(bgW.el.querySelectorAll('.bg-row').length === 4, 'CSV import adds transactions');
  ok(window.Audit.read().some((e) => e.event === 'budget.import'), 'budget CSV import audited');
  window.closeWindow('budget');
  await sleep(80);

  /* ---------- shortcuts reference ---------- */
  console.log('--- shortcuts ---');
  ok(!!window.OS.help, 'OS.help exposed');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', bubbles: true }));
  await sleep(80);
  let helpEl = document.getElementById('help');
  ok(!!helpEl && !!helpEl.querySelector('.help-card'), '? key opens shortcuts reference');
  ok(helpEl.textContent.includes('Spotlight') && helpEl.querySelectorAll('.help-row').length >= 10, 'shortcuts list renders grouped rows');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(60);
  ok(!document.getElementById('help'), 'Esc closes shortcuts reference');
  const brand2 = document.querySelector('#mb-brand');
  brand2.click();
  await sleep(60);
  brand2.querySelector('[data-act="help"]').click();
  await sleep(60);
  ok(!!document.getElementById('help'), 'Nebula menu > Shortcuts reopens it');
  document.getElementById('help').querySelector('[data-hc]').click();
  await sleep(60);
  ok(!document.getElementById('help'), 'close button dismisses it');

  /* ---------- notes markdown ---------- */
  console.log('--- notes markdown ---');
  window.openApp('notes');
  await sleep(160);
  const ndW = window.OS.windows.get('notes');
  const ndBody = ndW.el.querySelector('.notes-body');
  ndBody.value = '# Report\n\n**bold** and *italic* and `code`\n- item one\n- item two\n\n> a quote';
  ndBody.dispatchEvent(new window.Event('input', { bubbles: true }));
  await sleep(60);
  ndW.el.querySelector('[data-view="preview"]').click();
  await sleep(80);
  const ndPrev = ndW.el.querySelector('.notes-prev');
  ok(!ndPrev.classList.contains('hidden'), 'markdown preview shows');
  ok(ndPrev.innerHTML.includes('<h2') && ndPrev.innerHTML.includes('<b>bold</b>') && ndPrev.innerHTML.includes('<code>code</code>'), 'markdown renders heading, bold and code');
  ok(ndPrev.querySelectorAll('.md-ul li').length === 2, 'markdown renders list items');
  ok(ndPrev.querySelector('.md-q') !== null, 'markdown renders blockquote');
  ndW.el.querySelector('[data-view="edit"]').click();
  await sleep(60);
  ok(ndPrev.classList.contains('hidden'), 'edit mode hides preview');
  window.closeWindow('notes');
  await sleep(80);

  /* ---------- calendar <-> tasks ---------- */
  console.log('--- calendar tasks ---');
  const tNow = new Date();
  const lateKey = tNow.getFullYear() + '-' + String(tNow.getMonth() + 1).padStart(2, '0') + '-' + String(Math.max(1, tNow.getDate() - 5)).padStart(2, '0');
  window.localStorage.setItem('nebula.tasks.v1', JSON.stringify([
    { id: 101, text: 'Cal test task', due: todayStr, prio: 1, done: false, created: Date.now(), updated: Date.now() },
    { id: 102, text: 'Old overdue task', due: lateKey, prio: 0, done: false, created: Date.now(), updated: Date.now() }
  ]));
  window.openApp('calendar');
  await sleep(160);
  const calW = window.OS.windows.get('calendar');
  ok(!!calW, 'calendar opens');
  const dots = calW.el.querySelectorAll('.mdot');
  ok(dots.length >= 1, 'calendar shows due-date dots (' + dots.length + ')');
  ok(lateKey === todayStr || calW.el.querySelector('.mdot.late') !== null, 'overdue task gets a red dot');
  const todayCell = calW.el.querySelector('.cal-day.today');
  ok(!!todayCell && !!todayCell.querySelector('.mdot'), 'today carries a due dot');
  todayCell.click();
  await sleep(60);
  const calPanel = calW.el.querySelector('.cal-daypanel');
  ok(!calPanel.classList.contains('hidden') && calPanel.textContent.includes('Cal test task'), 'day panel lists the due task');
  window.closeWindow('calendar');
  await sleep(80);

  /* ---------- backup (last: restore path reloads after 500ms) ---------- */
  console.log('--- backup ---');
  window.openApp('backup');
  await sleep(160);
  const bkW = window.OS.windows.get('backup');
  ok(!!bkW, 'backup app opens');
  const bkCount = parseInt(bkW.el.querySelector('.bk-big').textContent, 10);
  ok(bkCount >= 6, 'backup summarizes stored data keys (' + bkCount + ')');
  bkW.el.querySelector('[data-export]').click();
  await sleep(100);
  ok(!!window.localStorage.getItem('nebula.backup.last'), 'export stamps last-backup time');
  ok(window.Audit.read().some((e) => e.event === 'backup.created'), 'backup export audited');
  /* reject an invalid bundle */
  const bkPick = bkW.el.querySelector('[data-pick]');
  Object.defineProperty(bkPick, 'files', { value: [new window.File(['definitely not json'], 'bad.json', { type: 'application/json' })], configurable: true });
  bkPick.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(120);
  ok(!window.Audit.read().some((e) => e.event === 'backup.restored'), 'invalid backup file rejected');
  /* full round-trip through the app: snapshot, mutate, restore -> mutation reverted */
  window.localStorage.setItem('nebula.testprobe', 'BEFORE');
  const snap = {};
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k.indexOf('nebula.') === 0) snap[k] = window.localStorage.getItem(k);
  }
  window.localStorage.setItem('nebula.testprobe', 'AFTER');
  const bundle = { app: 'nebula-os', kind: 'backup', version: window.OS.version, ts: Date.now(), count: Object.keys(snap).length, entries: snap };
  Object.defineProperty(bkW.el.querySelector('[data-pick]'), 'files', {
    value: [new window.File([JSON.stringify(bundle)], 'nebula-backup.json', { type: 'application/json' })], configurable: true
  });
  bkW.el.querySelector('[data-pick]').dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(150);
  const okBtn = document.querySelector('.modal-overlay [data-a="ok"]');
  ok(!!okBtn, 'restore asks for confirmation');
  okBtn.click();
  await sleep(150);
  ok(window.localStorage.getItem('nebula.testprobe') === 'BEFORE', 'restore reverts post-backup changes (round-trip)');
  ok(window.Audit.read().some((e) => e.event === 'backup.restored'), 'restore audited');

  /* ---------- CSS system checks ---------- */
  const cssText = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
  ok(cssText.includes(':focus-visible{ outline:2px solid var(--accent)'), 'global :focus-visible ring defined');
  ok(cssText.includes('calc(26px + env(safe-area-inset-top, 0px))'), 'menubar includes safe-area top inset');
  ok(cssText.includes('calc(56px + env(safe-area-inset-bottom, 0px))'), 'taskbar includes safe-area bottom inset');
  ok(cssText.includes('--btn-ink'), 'dynamic button-ink token present');
  ok(cssText.includes('grid-auto-flow:row; grid-template-columns:repeat(4, auto)'), 'phone desktop-icon row grid present');

  await sleep(250);
  console.log('\n=== PASSED: ' + passed.length + ' checks ===');
  console.log('errors: ' + (errors.length ? '\n' + errors.join('\n') : 'none'));
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('CRASH:', e); process.exit(2); });
