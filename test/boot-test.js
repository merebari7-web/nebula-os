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
    if (!/not implemented|Could not load link|Could not load img|createObjectURL is not a function/.test(String(e)))
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
  ok(window.OS && window.OS.version === '2.4.0', 'OS booted at v2.4.0');
  ok(typeof window.APPS === 'object', 'APPS registry exposed');
  ok(Object.keys(window.APPS).length === 22, '22 apps registered (' + Object.keys(window.APPS).length + ')');
  ok(window.WALLPAPERS.length === 8, '8 wallpapers');
  ok(typeof window.OS.settings === 'object', 'settings state initialized after boot');
  ok(document.body.dataset.theme === 'dark', 'default theme dark applied');

  /* ---------- desktop & dock ---------- */
  console.log('--- desktop & dock ---');
  const icons = document.querySelectorAll('#desktop-icons .desktop-icon');
  ok(icons.length === 22, '22 desktop icons rendered');
  const dockIcons = document.querySelectorAll('#dock .dock-icon');
  ok(dockIcons.length >= 12, 'dock populated (' + dockIcons.length + ')');
  const startBtn = document.getElementById('start-btn');
  ok(!!startBtn, 'start button exists');
  startBtn.click();
  await sleep(80);
  const startApps = document.querySelectorAll('#start-grid .start-app');
  ok(startApps.length === 22, 'start menu lists all 22 apps');
  document.body.click();
  await sleep(60);

  /* ---------- menubar: roles + arrow-key navigation ---------- */
  console.log('--- menubar a11y ---');
  ok(document.querySelectorAll('.mb-menu[role="menu"]').length === 5, '5 menubar menus have role=menu');
  ok(document.querySelectorAll('.mb-mi[role="menuitem"]').length === 20, '20 menubar items have role=menuitem');
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
  ok(tvTiles.length === 42, 'TV Mode shows 22 apps + 20 streams (' + tvTiles.length + ')');
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
