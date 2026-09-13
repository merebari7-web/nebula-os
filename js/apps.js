/* ============================================================
   NEBULA OS — applications v1.2
   terminal (tabs) · files · notes · paint · beat deck · browser
   monitor · calendar · settings · about
   ============================================================ */
(function () {
  'use strict';

  const FS = window.NebulaFS.fs;
  const I18N = window.I18N;
  const GITHUB_URL = 'https://github.com/merebari7-web/nebula-os';

  const TEXT_EXTS = /\.(txt|md|markdown|js|css|html|json|log|csv|sh|py|ts)$/i;

  function fileIcon(name) {
    const n = name.toLowerCase();
    if (/\.(png|jpe?g|gif|webp|svg|bmp)$/.test(n)) return '🖼️';
    if (/\.(mp3|wav|ogg|m4a|flac)$/.test(n)) return '🎵';
    if (n.endsWith('.md')) return '📑';
    if (/\.(js|ts|css|html|py|sh|json)$/.test(n)) return '🧩';
    if (n.endsWith('.csv')) return '🧾';
    if (n.endsWith('.apk')) return '🤖';
    return '📄';
  }
  /* read a File's text: modern File.text() first, FileReader fallback (jsdom/tests) */
function readFileText(f) {
  return new Promise((res, rej) => {
    if (typeof f.text === 'function') { f.text().then(res, rej); return; }
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error || new Error('read failed'));
    r.readAsText(f);
  });
}
/* tiny markdown renderer (headings, bold/italic, code, lists, quotes, hr, links) — no dependencies */
function mdRender(src) {
  const lines = esc(String(src || '')).split('\n');
  let html = '', inCode = false, inList = null, inQuote = false;
  const closeList = () => { if (inList) { html += '</' + inList + '>'; inList = null; } };
  const closeQuote = () => { if (inQuote) { html += '</blockquote>'; inQuote = false; } };
  const inline = (x) => x
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  for (const raw of lines) {
    if (/^```/.test(raw)) {
      closeList(); closeQuote();
      if (!inCode) { html += '<pre class="md-pre"><code>'; inCode = true; }
      else { html += '</code></pre>'; inCode = false; }
      continue;
    }
    if (inCode) { html += raw + '\n'; continue; }
    const h = raw.match(/^(#{1,4})\s+(.*)/);
    if (h) { closeList(); closeQuote(); const l = h[1].length; html += '<h' + (l + 1) + ' class="md-h">' + inline(h[2]) + '</h' + (l + 1) + '>'; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(raw)) { closeList(); closeQuote(); html += '<hr class="md-hr">'; continue; }
    const li = raw.match(/^\s*[-*]\s+(.*)/);
    if (li) { closeQuote(); if (inList !== 'ul') { closeList(); html += '<ul class="md-ul">'; inList = 'ul'; } html += '<li>' + inline(li[1]) + '</li>'; continue; }
    const oli = raw.match(/^\s*\d+\.\s+(.*)/);
    if (oli) { closeQuote(); if (inList !== 'ol') { closeList(); html += '<ol class="md-ol">'; inList = 'ol'; } html += '<li>' + inline(oli[1]) + '</li>'; continue; }
    const q = raw.match(/^&gt;\s?(.*)/);
    if (q) { closeList(); if (!inQuote) { html += '<blockquote class="md-q">'; inQuote = true; } html += inline(q[1]) + '<br>'; continue; }
    if (!raw.trim()) { closeList(); closeQuote(); continue; }
    closeList(); closeQuote();
    html += '<p class="md-p">' + inline(raw) + '</p>';
  }
  closeList(); closeQuote();
  if (inCode) html += '</code></pre>';
  return html;
}
function resolvePath(cwd, arg) {
    if (!arg) return cwd;
    if (arg.startsWith('/')) return arg;
    return (cwd === '/' ? '/' : cwd + '/') + arg;
  }
  function shortHome(p) { return p.replace('/home/guest', '~').replace('//', '/'); }
  function storageBytes() {
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        total += (localStorage.getItem(k) || '').length + k.length;
      }
    } catch (e) {}
    return total * 2;
  }

  /* ============================================================
     TERMINAL — multi-tab shell
     ============================================================ */
  const FORTUNES = [
    'The best time to plant a tree was 20 years ago. The second best time is now.',
    'You are one keystroke away from a completely different life. (Just kidding. Mostly.)',
    'In the absence of clear requirements, make your own and document them.',
    'A day without debugging is like a day without starlight.',
    'The early bird gets the worm, but the second mouse gets the cheese.',
    'Talk is cheap. Show me the code. — Linus, probably',
    '99 little bugs in the code, 99 little bugs. Take one down, patch it around… 127 little bugs in the code.',
    'It works on my machine — a classic, still true.',
    'Sleep is the best meditation. (Especially before code review.)',
    'The universe is made of atoms and JavaScript engines. Both are surprisingly small.',
    'Never trust an unsanitized input. Not even yourself.',
    'Ship it. Then sleep. Then fix it. That is the cycle.'
  ];

  registerApp({
    id: 'terminal',
    title: 'Terminal',
    titleKey: 'app.terminal',
    icon: '⬛',
    tile: 'linear-gradient(135deg,#1f2937,#4b5563)',
    open() {
      createWindow({
        id: 'terminal',
        appId: 'terminal',
        title: t('app.terminal'),
        icon: '⬛',
        width: 680,
        height: 430,
        content(win) {
          const wrap = $el('div', 'term-wrap');
          wrap.innerHTML =
            '<div class="term-tabs"><div class="term-tab-list"></div>' +
            '<button class="term-new" title="New tab">＋</button></div>' +
            '<div class="terminals"></div>';
          win.body.appendChild(wrap);
          const tabList = wrap.querySelector('.term-tab-list');
          const termHost = wrap.querySelector('.terminals');
          const tabs = [];
          let active = -1;

          function print(s, out, html, cls) {
            const d = $el('div', cls || '');
            d[html ? 'innerHTML' : 'textContent'] = html ? s : s;
            out.appendChild(d);
            out.scrollTop = out.scrollHeight;
            return d;
          }

          function run(s, raw) {
            const line = raw.trim();
            print('<span class="tp">' + esc(s.prompt()) + '</span> ' + esc(line), s.out, true);
            if (!line) return;
            s.hist.push(line);
            s.hi = s.hist.length;
            const sp = line.indexOf(' ');
            const cmd = sp === -1 ? line : line.slice(0, sp);
            const arg = sp === -1 ? '' : line.slice(sp + 1).trim();
            const out = s.out;

            switch (cmd) {
              case 'help':
                print('Available commands:\n' +
                  '  help            show this list\n' +
                  '  ls  cd  pwd     navigate the virtual filesystem\n' +
                  '  cat  echo  date whoami  history  clear\n' +
                  '  mkdir  rm  touch  tree  find\n' +
                  '  df  ps  top  uname    system info (real storage stats!)\n' +
                  '  ping  ssh  matrix  sl  cowsay  fortune\n' +
                  '  wallpaper  theme  open &lt;app&gt;  edit &lt;file&gt;\n' +
                  '  neofetch        the classic', s.out, true);
                break;
              case 'ls': {
                const list = FS.list(s.cwd);
                if (list === null) print('ls: ' + esc(s.cwd) + ': not a directory', out, true, 'ter');
                else if (!list.length) print('(empty)', out, true, 'tdim');
                else print(list.map((n) =>
                  '<span class="' + (n.type === 'dir' ? 'tdir' : 'tfile') + '">' +
                  esc(n.name) + (n.type === 'dir' ? '/' : '') + '</span>').join('   '), out, true);
                break;
              }
              case 'cd': {
                if (!arg) s.cwd = '/home/guest';
                else if (arg === '..') s.cwd = s.cwd === '/' ? '/' : s.cwd.slice(0, s.cwd.lastIndexOf('/') || 1);
                else s.cwd = resolvePath(s.cwd, arg);
                const n = FS.nodeAt(s.cwd);
                if (n && n.type === 'dir') s.setPrompt();
                else print('cd: no such directory: ' + esc(arg), out, true, 'ter');
                break;
              }
              case 'pwd': print(s.cwd, s.out); break;
              case 'cat': {
                const n = FS.nodeAt(resolvePath(s.cwd, arg));
                if (n && n.type === 'file') print(n.content || '(empty file)');
                else print('cat: ' + esc(arg || '') + ': no such file', out, true, 'ter');
                break;
              }
              case 'echo': print(arg, s.out); break;
              case 'date': print(new Date().toString(), s.out); break;
              case 'whoami': print('guest', s.out); break;
              case 'clear': out.innerHTML = ''; break;
              case 'history':
                print(s.hist.map((h, i) => '  ' + (i + 1) + '  ' + h).join('\n') || '(empty)', s.out);
                break;
              case 'mkdir': {
                const p = resolvePath(s.cwd, arg);
                if (!arg) print('mkdir: missing operand', out, true, 'ter');
                else if (FS.nodeAt(p)) print(p + ': already exists', out, true, 'twarn');
                else FS.mkdir(p);
                break;
              }
              case 'touch': {
                const p = resolvePath(s.cwd, arg);
                if (!arg) print('touch: missing operand', out, true, 'ter');
                else if (FS.nodeAt(p)) print(p + ': exists', out, true, 'twarn');
                else FS.createFile(p, '');
                break;
              }
              case 'rm': {
                if (/^-rf/.test(arg) || arg.includes(' -rf ') || arg === '/') {
                  print('Nice try. This is a demo — the universe is indestructible. 😄', out, true, 'twarn');
                  break;
                }
                const p = resolvePath(s.cwd, arg);
                if (FS.rm(p)) print('removed ' + esc(arg), out, true, 'tok');
                else print('rm: ' + esc(arg) + ': no such file', out, true, 'ter');
                break;
              }
              case 'tree': {
                const lines = [];
                (function walk(node, prefix, depth) {
                  if (depth > 3) return;
                  node.children
                    .slice().sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1)
                    .forEach((c, i, arr) => {
                      const last = i === arr.length - 1;
                      lines.push(prefix + (last ? '└── ' : '├── ') + c.name + (c.type === 'dir' ? '/' : ''));
                      if (c.type === 'dir') walk(c, prefix + (last ? '    ' : '│   '), depth + 1);
                    });
                })(FS.nodeAt(s.cwd) || { children: [] }, '', 0);
                print(s.cwd + '\n' + (lines.join('\n') || '(empty)'), out, true, 'tdir');
                break;
              }
              case 'find': {
                const found = [];
                (function walk(node, path) {
                  (node.children || []).forEach((c) => {
                    const p = path + '/' + c.name;
                    if (arg && c.name.toLowerCase().includes(arg.toLowerCase())) found.push(p);
                    if (c.type === 'dir') walk(c, p);
                  });
                })(FS.nodeAt(s.cwd) || { children: [] }, s.cwd === '/' ? '' : s.cwd);
                print(found.join('\n') || 'no matches', s.out);
                break;
              }
              case 'df': {
                const used = storageBytes();
                print('Filesystem      Size    Used    Avail  Mounted on\n' +
                  'nebula-fs     5.0 MB   ' + fmtBytes(used).padStart(8) + '   ' +
                  fmtBytes(Math.max(0, 5 * 1048576 - used)).padStart(8) + '  /home', out, true);
                break;
              }
              case 'ps':
              case 'top': {
                const procs = [
                  [1, 'init'], [42, 'nebula-shell'], [133, 'window-manager'], [201, 'render-core'],
                  [318, 'audio-engine'], [402, 'file-service'], [512, 'net-daemon'], [666, 'star-tracker']
                ];
                print((cmd === 'top' ? 'top - nebula ' : '  PID   CPU%   NAME') + '\n' +
                  procs.map((p) => '  ' + String(p[0]).padStart(5) + '  ' +
                    (0.1 + Math.random() * 8).toFixed(1).padStart(5) + '  ' + p[1]).join('\n'), out, true);
                break;
              }
              case 'uname':
                print('Nebula 2.7.0 nebula-es2022 (JavaScript) ' + (navigator.platform || 'web') + ' x86_64 web', s.out);
                break;
              case 'ping': {
                const host = arg || 'nebula.local';
                let n = 0;
                const iv = setInterval(() => {
                  n++;
                  print('64 bytes from ' + esc(host) + ': icmp_seq=' + n +
                    ' ttl=57 time=' + (8 + Math.random() * 30).toFixed(1) + ' ms', out, true, 'tdim');
                  if (n >= 4) {
                    clearInterval(iv);
                    print('--- ' + esc(host) + ' ping statistics ---\n4 packets transmitted, 4 received, 0% packet loss', out, true, 'tok');
                  }
                }, 220);
                break;
              }
              case 'ssh':
                print('ssh: ' + esc(arg || 'nebula.internal') + ' — connection refused.\nThis universe is self-contained. There is no outside. 🌌', out, true, 'twarn');
                break;
              case 'cowsay': {
                const msg = arg || 'Moo.';
                const inner = msg.length > 2 ? ' ' + msg + ' ' : msg;
                print(' ' + '_'.repeat(inner.length + 2) + '\n' +
                  '<' + inner + '> \n ' + '-'.repeat(inner.length + 2) + '\n' +
                  '        \\   ^__^\n' +
                  '         \\  (oo)\\_______\n' +
                  '            (__)\\       )\\/\\\n' +
                  '                ||----w |\n' +
                  '                ||     ||', out, true, 'tdir');
                break;
              }
              case 'sl': {
                const line = print('', out, false);
                let f = 0;
                const iv = setInterval(() => {
                  f++;
                  const pos = Math.floor((f / 18) * 30);
                  line.textContent = ' '.repeat(Math.max(0, 30 - pos)) + '🚂';
                  if (f >= 18) { clearInterval(iv); setTimeout(() => line.remove(), 900); }
                }, 70);
                break;
              }
              case 'matrix': {
                let n = 0;
                const iv = setInterval(() => {
                  print(Array.from({ length: 56 }, () => Math.random() < 0.5 ? '0' : '1').join(''), out, true, 't-matrix-line');
                  if (++n >= 7) {
                    clearInterval(iv);
                    print('Wake up, guest… the Matrix has you. 🟢', out, true, 'tdim');
                  }
                }, 90);
                break;
              }
              case 'fortune':
                print('“' + FORTUNES[Math.floor(Math.random() * FORTUNES.length)] + '”', out, true, 'tdim');
                break;
              case 'edit': {
                const p = resolvePath(s.cwd, arg);
                const n = FS.nodeAt(p);
                if (n && n.type === 'file') openApp('code', { path: p });
                else print('edit: ' + esc(arg || '') + ': no such file', out, true, 'ter');
                break;
              }
              case 'theme':
                if (arg === 'dark' || arg === 'light' || arg === 'patriot') {
                  OS.settings.theme = arg; OS.saveSettings(); OS.applySettings();
                } else OS.settings.theme = OS.settings.theme === 'dark' ? 'light' : 'dark',
                  OS.saveSettings(), OS.applySettings();
                print('theme → ' + OS.settings.theme, s.out);
                break;
              case 'wallpaper': {
                OS.settings.wallpaper = (OS.settings.wallpaper + 1) % WALLPAPERS.length;
                OS.saveSettings(); OS.applySettings();
                print('wallpaper → ' + WALLPAPERS[OS.settings.wallpaper].name);
                break;
              }
              case 'fireworks':
              case 'celebrate':
                OS.celebrate();
                print('celebrating — press Esc to stop the show', s.out);
                break;
              case 'audit': {
                const list = Audit.read().slice(0, 12);
                print(list.length ? list.map((e) => new Date(e.ts).toLocaleTimeString() + '  ' + e.event + (e.detail ? ' — ' + e.detail : '')).join('\n') : '(audit log is empty)', s.out, true);
                break;
              }
              case 'tv':
                OS.tv.toggle();
                print('TV mode ' + (document.body.classList.contains('tv-on') ? 'on' : 'off'), s.out);
                break;
              case 'open': {
                const id = arg.split(' ')[0];
                if (APPS[id]) openApp(id);
                else print("open: unknown app '" + esc(arg) + "'. Available: " + Object.keys(APPS).join(', '), out, true, 'twarn');
                break;
              }
              case 'neofetch': {
                const logo =
                  '         .   ✦    .        \n' +
                  '    ✦    ╭─────────╮    ✦  \n' +
                  '        .  NEBULA  .      \n' +
                  '    ✦    ╰─────────╯    ✦  \n' +
                  '         .   ✦    .        ';
                const rows = [
                  ['OS', 'Nebula OS ' + OS.version + ' (web)'],
                  ['Host', location.hostname || 'localhost'],
                  ['Kernel', 'JavaScript ES2022'],
                  ['Uptime', Math.max(0, Math.floor((Date.now() - OS.startedAt) / 60000)) + ' min'],
                  ['Shell', 'nterm 1.1 · ' + tabs.length + ' tab' + (tabs.length === 1 ? '' : 's')],
                  ['Resolution', innerWidth + '×' + (innerHeight - TASKBAR_H)],
                  ['Theme', 'nebula-' + OS.settings.theme],
                  ['Accent', OS.settings.accent],
                  ['Lang', I18N.lang]
                ];
                print('<pre class="neofetch">' + esc(logo) + '\n\n' +
                  rows.map(([k, v]) => '<span class="tnf-k">' + esc(k) + ':</span> ' + esc(v)).join('\n') + '</pre>', out, true);
                break;
              }
              case 'sudo':
                print('guest is not in the sudoers file.\nThis incident will be reported. 🚨', out, true, 'twarn');
                break;
              case 'about':
                print('Nebula OS ' + OS.version + ' — a tiny operating system that lives in your browser.\nVanilla JavaScript. Zero dependencies. 8 languages. 100% in-tab.', s.out);
                break;
              default:
                print('command not found: ' + esc(cmd) + " — try 'help'", out, true, 'ter');
            }
          }

          function renderTabs() {
            tabList.innerHTML = '';
            tabs.forEach((s, i) => {
              const b = $el('button', 'term-tab' + (i === active ? ' on' : ''));
              b.textContent = 'term ' + s.num;
              b.addEventListener('click', () => switchTab(i));
              tabList.appendChild(b);
            });
          }
          function switchTab(i) {
            active = i;
            tabs.forEach((s, j) => s.term.classList.toggle('hidden', j !== i));
            renderTabs();
            const s = tabs[i];
            if (s) s.input.focus({ preventScroll: true });
          }

          function makeTab() {
            const num = tabs.length + 1;
            const term = $el('div', 'terminal');
            term.innerHTML =
              '<div class="term-out"></div>' +
              '<div class="term-line"><span class="term-prompt"></span>' +
              '<input class="term-input" spellcheck="false" autocomplete="off" aria-label="terminal input"></div>';
            const s = {
              num,
              term,
              out: term.querySelector('.term-out'),
              input: term.querySelector('.term-input'),
              promptEl: term.querySelector('.term-prompt'),
              cwd: '/home/guest',
              hist: [],
              hi: 0,
              prompt() { return 'guest@nebula:' + esc(shortHome(this.cwd)) + '$'; },
              setPrompt() { this.promptEl.textContent = this.prompt(); }
            };
            s.setPrompt();
            print('Nebula OS ' + OS.version + ' — nterm 1.1 · tab ' + num, s.out, false, 'tdim');
            print("Type 'help' for commands, 'neofetch' for vibes, 'sl' if you're brave.\n", s.out, false);

            s.input.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') {
                const v = s.input.value;
                s.input.value = '';
                run(s, v);
              } else if (e.key === 'ArrowUp') {
                if (s.hi > 0) { s.hi--; s.input.value = s.hist[s.hi] || ''; e.preventDefault(); }
              } else if (e.key === 'ArrowDown') {
                if (s.hi < s.hist.length) { s.hi++; s.input.value = s.hist[s.hi] || ''; e.preventDefault(); }
              }
            });

            tabs.push(s);
            termHost.appendChild(term);
            switchTab(tabs.length - 1);
          }

          wrap.querySelector('.term-new').addEventListener('click', makeTab);
          win.hooks.focus = () => { const s = tabs[active]; if (s) s.input.focus({ preventScroll: true }); };
          win.hooks.blur = () => { const s = tabs[active]; if (s) s.input.blur(); };
          makeTab();
        }
      });
    }
  });

  /* ============================================================
     FILES
     ============================================================ */
  registerApp({
    id: 'files',
    title: 'Files',
    titleKey: 'app.files',
    icon: '📁',
    tile: 'linear-gradient(135deg,#f59e0b,#f97316)',
    open() {
      createWindow({
        id: 'files',
        appId: 'files',
        title: t('app.files'),
        icon: '📁',
        width: 690,
        height: 450,
        content(win) {
          const root = $el('div', 'fm');
          root.innerHTML =
            '<div class="fm-bar">' +
              '<button class="fm-nav" data-nav="up" title="Up one level">↑</button>' +
              '<div class="fm-crumbs"></div>' +
              '<div class="fm-actions">' +
                '<button class="btn ghost sm" data-act="new" title="New folder">＋</button>' +
                '<button class="btn ghost sm" data-act="import" title="Import files from your computer">⬆</button>' +
                '<button class="btn ghost sm" data-act="export" title="Export selected file">⬇</button>' +
                '<button class="btn ghost sm" data-act="del" title="Delete">🗑</button>' +
              '</div>' +
              '<input type="file" multiple hidden data-filepick>' +
            '</div>' +
            '<div class="fm-main"><div class="fm-grid"></div></div>' +
            '<div class="fm-status"><span class="fm-count"></span><span class="fm-path"></span></div>';
          win.body.appendChild(root);

          const grid = root.querySelector('.fm-grid');
          const crumbs = root.querySelector('.fm-crumbs');
          const countEl = root.querySelector('.fm-count');
          const pathEl = root.querySelector('.fm-path');
          let cwd = '/home/guest';
          let selected = null;

          function render() {
            const items = FS.list(cwd) || [];
            items.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : (a.type === 'dir' ? -1 : 1));
            crumbs.innerHTML = '';
            const home = $el('button', 'crumb', '🏠');
            home.title = '/home/guest';
            home.addEventListener('click', () => { cwd = '/home/guest'; selected = null; render(); });
            crumbs.appendChild(home);
            let acc = '';
            cwd.split('/').filter(Boolean).forEach((part) => {
              acc += '/' + part;
              const b = $el('button', 'crumb' + (acc === cwd ? ' active' : ''), esc(part));
              const path = acc;
              b.addEventListener('click', () => { cwd = path; selected = null; render(); });
              crumbs.appendChild(b);
            });
            grid.innerHTML = '';
            if (!items.length) grid.appendChild($el('div', 'fm-empty', 'This folder is empty'));
            items.forEach((n) => {
              const it = $el('div', 'fm-item' + (selected === n.name ? ' sel' : ''));
              it.innerHTML = '<span class="fm-ic">' + (n.type === 'dir' ? '📁' : fileIcon(n.name)) +
                '</span><span class="fm-name">' + esc(n.name) + '</span>';
              it.addEventListener('click', () => {
                selected = n.name;
                grid.querySelectorAll('.fm-item').forEach((x) => x.classList.remove('sel'));
                it.classList.add('sel');
              });
              it.addEventListener('dblclick', () => {
                const p = (cwd === '/' ? '/' : cwd + '/') + n.name;
                if (n.type === 'dir') { cwd = p; selected = null; render(); }
                else if (/\.apk$/i.test(n.name)) { openApp('android'); notify('🤖', n.name, t('and.install')); }
                else if (TEXT_EXTS.test(n.name)) {
                  const node = FS.nodeAt(p);
                  if (/\.(js|css|html|json|ts|md|sh|py)$/.test(n.name)) openApp('code', { path: p });
                  else openApp('notes', { name: n.name, content: node ? node.content : '' });
                } else notify('📄', n.name, 'No viewer installed for this file type.');
              });
              grid.appendChild(it);
            });
            countEl.textContent = items.length + ' item' + (items.length === 1 ? '' : 's');
            pathEl.textContent = cwd;
          }

          root.querySelector('[data-nav="up"]').addEventListener('click', () => {
            if (cwd !== '/') { cwd = cwd.slice(0, cwd.lastIndexOf('/') || 1); render(); }
          });
          root.querySelector('[data-act="new"]').addEventListener('click', () => {
            ask({
              title: 'New folder', message: 'Create a folder in ' + cwd,
              placeholder: 'Folder name', value: 'New Folder', okLabel: t('common.create')
            }).then((v) => {
              if (!v || !v.trim()) return;
              const p = (cwd === '/' ? '/' : cwd + '/') + v.trim();
              if (FS.nodeAt(p)) notify('⚠️', 'Already exists', '“' + v.trim() + '” is already in this folder.');
              else { FS.mkdir(p); render(); }
            });
          });
          const picker = root.querySelector('[data-filepick]');
          root.querySelector('[data-act="import"]').addEventListener('click', () => picker.click());
          picker.addEventListener('change', async () => {
            const files = Array.from(picker.files || []);
            picker.value = '';
            if (!files.length) return;
            let last = null;
            for (const f of files) {
              let text;
              try { text = await f.text(); } catch (e) { text = String(f.content || ''); }
              const name = (f.name || 'file.txt').replace(/[/]/g, '_');
              let path = (cwd === '/' ? '/' : cwd + '/') + name;
              try {
                if (FS.nodeAt(path)) {
                  path = path.replace(/(\.[^.]+)?$/, ' copy$1');
                }
                if (!FS.nodeAt(path)) FS.createFile(path, '');
                FS.writeFile(path, text);
                last = path;
              } catch (e) {}
            }
            render();
            if (last) { Audit.log('file.import', last); notify('📂', t('fs.imported'), last); }
          });
          root.querySelector('[data-act="export"]').addEventListener('click', () => {
            if (!selected) { notify('⚠️', 'Nothing selected', 'Click an item first.'); return; }
            const path = (cwd === '/' ? '/' : cwd + '/') + selected;
            const node = FS.nodeAt(path);
            if (!node || node.type !== 'file') return;
            const a = document.createElement('a');
            a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(node.content || '');
            a.download = node.name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            Audit.log('file.export', node.name);
            notify('⬇️', t('fs.exported'), node.name);
          });
          root.querySelector('[data-act="del"]').addEventListener('click', () => {
            if (!selected) { notify('⚠️', 'Nothing selected', 'Click an item first.'); return; }
            confirmDialog(t('common.delete') + ' ' + selected + '?', 'It will be removed from the demo filesystem.', t('common.delete')).then((ok) => {
              if (ok) { FS.rm((cwd === '/' ? '/' : cwd + '/') + selected); selected = null; render(); }
            });
          });

          render();
        }
      });
    }
  });

  /* ============================================================
     NOTES
     ============================================================ */
  const NOTES_KEY = 'nebula.notes.v1';

  registerApp({
    id: 'notes',
    title: 'Notes',
    titleKey: 'app.notes',
    icon: '📝',
    tile: 'linear-gradient(135deg,#10b981,#14b8a6)',
    open(args) {
      const existing = OS.windows.get('notes');
      if (existing) {
        if (existing.hooks.consume) existing.hooks.consume(args);
        focusWindow(existing);
        return;
      }
      createWindow({
        id: 'notes',
        appId: 'notes',
        title: t('app.notes'),
        icon: '📝',
        width: 720,
        height: 470,
        content(win) {
          const root = $el('div', 'notes-app');
          root.innerHTML =
            '<aside class="notes-side">' +
              '<div class="notes-list"></div>' +
              '<button class="btn sm" data-new>＋ New note</button>' +
            '</aside>' +
            '<main class="notes-main">' +
              '<input class="notes-title" placeholder="Untitled" spellcheck="false">' +
              '<div class="notes-tools">' +
                '<div class="seg">' +
                  '<button data-view="edit" class="on">' + esc(t('note.edit')) + '</button>' +
                  '<button data-view="preview">' + esc(t('note.view')) + '</button>' +
                '</div>' +
                '<button class="btn ghost sm" data-copy>' + esc(t('note.copy')) + '</button>' +
              '</div>' +
              '<textarea class="notes-body" placeholder="Start typing… everything autosaves." spellcheck="false"></textarea>' +
              '<div class="notes-prev hidden"></div>' +
            '</main>';
          win.body.appendChild(root);

          const listEl = root.querySelector('.notes-list');
          const titleEl = root.querySelector('.notes-title');
          const bodyEl = root.querySelector('.notes-body');
          let notes = [];
          try { notes = JSON.parse(localStorage.getItem(NOTES_KEY) || '[]'); } catch (e) { notes = []; }
          let current = null;

          const save = () => { try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch (e) {} };
          const fmtDate = (ts) => new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' }) +
            ' · ' + new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          function renderList() {
            listEl.innerHTML = '';
            notes.forEach((n) => {
              const b = $el('button', 'note-item' + (current && current.id === n.id ? ' sel' : ''));
              b.innerHTML = '<span class="nt">' + esc(n.title || 'Untitled') + '</span>' +
                '<span class="nu">' + fmtDate(n.updated) + '</span>';
              b.addEventListener('click', () => selectNote(n));
              listEl.appendChild(b);
            });
            if (!notes.length) listEl.appendChild($el('div', 'fm-empty', 'No notes yet'));
          }
          function syncFromCurrent() {
            if (!current) return;
            titleEl.value = current.title;
            bodyEl.value = current.content;
          }
          function selectNote(n) { current = n; syncFromCurrent(); renderList(); }
          function makeNew() {
            const n = { id: Date.now() + Math.floor(Math.random() * 1e4), title: '', content: '', updated: Date.now() };
            notes.unshift(n);
            current = n;
            save(); renderList(); syncFromCurrent();
            titleEl.focus();
          }
          function consume(a) {
            if (!a) return;
            if (a.fresh) { makeNew(); return; }
            const n = { id: Date.now() + Math.floor(Math.random() * 1e4), title: a.name || 'Untitled', content: a.content || '', updated: Date.now() };
            notes.unshift(n);
            current = n;
            save(); renderList(); syncFromCurrent();
          }

          const prevEl = root.querySelector('.notes-prev');
          let view = 'edit';
          function setView(v) {
            view = v;
            root.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
            bodyEl.classList.toggle('hidden', v !== 'edit');
            if (v === 'preview') { prevEl.innerHTML = mdRender(bodyEl.value); prevEl.classList.remove('hidden'); }
            else prevEl.classList.add('hidden');
          }
          root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
          root.querySelector('[data-copy]').addEventListener('click', () => {
            const txt = bodyEl.value;
            if (!txt) return;
            const done = () => notify('📋', t('note.copied'));
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, done);
            else {
              const ta = document.createElement('textarea');
              ta.value = txt; document.body.appendChild(ta); ta.select();
              try { document.execCommand('copy'); done(); } catch (e) {}
              ta.remove();
            }
          });
          titleEl.addEventListener('input', () => {
            if (!current) return;
            current.title = titleEl.value; current.updated = Date.now();
            save(); renderList();
          });
          bodyEl.addEventListener('input', () => {
            if (!current) return;
            current.content = bodyEl.value; current.updated = Date.now();
            save(); renderList();
          });
          root.querySelector('[data-new]').addEventListener('click', makeNew);

          win.hooks.consume = consume;
          win.hooks.focus = () => bodyEl.focus({ preventScroll: true });
          win.hooks.blur = () => bodyEl.blur();

          if (args) consume(args);
          if (!current) { if (notes.length) selectNote(notes[0]); else makeNew(); }
          renderList();
        }
      });
    }
  });

  /* ============================================================
     PAINT
     ============================================================ */
  const PAINT_BG = '#0b0e1a';

  registerApp({
    id: 'paint',
    title: 'Paint',
    titleKey: 'app.paint',
    icon: '🎨',
    tile: 'linear-gradient(135deg,#ec4899,#f43f5e)',
    open() {
      createWindow({
        id: 'paint',
        appId: 'paint',
        title: t('app.paint'),
        icon: '🎨',
        width: 740,
        height: 500,
        content(win) {
          const root = $el('div', 'paint');
          root.innerHTML =
            '<div class="paint-bar">' +
              '<input type="color" class="paint-color" value="#7c6cff" title="Color">' +
              '<input type="range" class="paint-size" min="1" max="40" value="6" title="Brush size">' +
              '<span class="paint-size-label">6 px</span>' +
              '<button class="btn ghost sm active" data-t="brush">✏️ Brush</button>' +
              '<button class="btn ghost sm" data-t="eraser">🧽 Eraser</button>' +
              '<span class="spacer"></span>' +
              '<button class="btn ghost sm" data-act="clear">Clear</button>' +
              '<button class="btn ghost sm" data-act="save">💾 Save PNG</button>' +
            '</div>' +
            '<div class="paint-canvas-wrap"><canvas></canvas></div>';
          win.body.appendChild(root);

          const canvas = root.querySelector('canvas');
          const ctx = canvas.getContext('2d');
          const wrapEl = root.querySelector('.paint-canvas-wrap');
          const color = root.querySelector('.paint-color');
          const size = root.querySelector('.paint-size');
          const sizeLabel = root.querySelector('.paint-size-label');
          let tool = 'brush', drawing = false, last = null;

          size.addEventListener('input', () => { sizeLabel.textContent = size.value + ' px'; });
          root.querySelectorAll('[data-t]').forEach((b) => {
            b.addEventListener('click', () => {
              tool = b.dataset.t;
              root.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('active', x === b));
            });
          });

          function paintBg() { ctx.fillStyle = PAINT_BG; ctx.fillRect(0, 0, canvas.width, canvas.height); }
          function resize() {
            const w = wrapEl.clientWidth, h = wrapEl.clientHeight;
            if (!w || !h) return;
            const tmp = document.createElement('canvas');
            tmp.width = canvas.width; tmp.height = canvas.height;
            if (canvas.width && canvas.height) tmp.getContext('2d').drawImage(canvas, 0, 0);
            canvas.width = w; canvas.height = h;
            paintBg();
            if (tmp.width) ctx.drawImage(tmp, 0, 0);
          }
          resize();
          const ro = new ResizeObserver(resize);
          ro.observe(wrapEl);

          const pos = (e) => {
            const r = canvas.getBoundingClientRect();
            return { x: e.clientX - r.left, y: e.clientY - r.top };
          };
          function strokeStyle() {
            const s = parseInt(size.value, 10) * (tool === 'eraser' ? 2.2 : 1);
            ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = s;
            ctx.strokeStyle = ctx.fillStyle = tool === 'eraser' ? PAINT_BG : color.value;
          }
          canvas.addEventListener('pointerdown', (e) => {
            drawing = true; last = pos(e); strokeStyle();
            ctx.beginPath(); ctx.arc(last.x, last.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
            canvas.setPointerCapture(e.pointerId);
          });
          canvas.addEventListener('pointermove', (e) => {
            if (!drawing) return;
            const p = pos(e); strokeStyle();
            ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
            last = p;
          });
          canvas.addEventListener('pointerup', () => { drawing = false; });
          canvas.addEventListener('pointerleave', () => { drawing = false; });

          root.querySelector('[data-act="clear"]').addEventListener('click', paintBg);
          root.querySelector('[data-act="save"]').addEventListener('click', () => {
            canvas.toBlob((blob) => {
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'nebula-paint.png';
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 4000);
            });
            notify('💾', 'Paint saved', 'nebula-paint.png is downloading.');
          });
          win.onClose = () => ro.disconnect();
        }
      });
    }
  });

  /* ============================================================
     BEAT DECK — 16-step Web Audio sequencer
     ============================================================ */
  registerApp({
    id: 'beats',
    title: 'Beat Deck',
    titleKey: 'app.beats',
    icon: '🎛️',
    tile: 'linear-gradient(135deg,#8b5cf6,#d946ef)',
    open() {
      createWindow({
        id: 'beats',
        appId: 'beats',
        title: t('app.beats'),
        icon: '🎛️',
        width: 780,
        height: 400,
        content(win) {
          const STEPS = 16;
          const TRACKS = [
            { name: 'Kick', icon: '🥁', color: '#ff6b8b' },
            { name: 'Snare', icon: '🪘', color: '#ffd166' },
            { name: 'Hat', icon: '🎩', color: '#4cc9f0' },
            { name: 'Bass', icon: '🎸', color: '#7c6cff' }
          ];
          const pat = TRACKS.map(() => Array(STEPS).fill(false));
          [0, 4, 8, 12].forEach((s) => pat[0][s] = true);
          [4, 12].forEach((s) => pat[1][s] = true);
          for (let s = 0; s < STEPS; s += 2) pat[2][s] = true;
          [0, 3, 6, 10, 14].forEach((s) => pat[3][s] = true);
          const BASSLINE = [45, 45, 48, 50, 45, 50, 52, 50, 43, 43, 48, 50, 45, 50, 52, 55];
          const midi2f = (m) => 440 * Math.pow(2, (m - 69) / 12);

          const root = $el('div', 'beats');
          root.innerHTML =
            '<div class="beats-controls">' +
              '<button class="btn" data-play>▶ Play</button>' +
              '<span class="lbl">TEMPO</span>' +
              '<input type="range" class="beats-bpm" min="60" max="160" value="100">' +
              '<span class="beats-val beats-bpm-val">100 BPM</span>' +
              '<span class="lbl">VOL</span>' +
              '<input type="range" class="beats-vol" min="0" max="1" step="0.01" value="0.8">' +
            '</div>' +
            '<div class="beats-grid"></div>';
          win.body.appendChild(root);

          const playBtn = root.querySelector('[data-play]');
          const bpm = root.querySelector('.beats-bpm');
          const bpmVal = root.querySelector('.beats-bpm-val');
          const vol = root.querySelector('.beats-vol');
          bpm.addEventListener('input', () => { bpmVal.textContent = bpm.value + ' BPM'; });

          const grid = root.querySelector('.beats-grid');
          grid.appendChild($el('div', 'beats-corner'));
          for (let s = 0; s < STEPS; s++) grid.appendChild($el('div', 'beats-stepnum' + (s % 4 === 0 ? ' acc' : ''), String(s + 1)));
          const cells = TRACKS.map(() => []);
          TRACKS.forEach((tr, ti) => {
            grid.appendChild($el('div', 'beats-tlabel',
              '<span style="color:' + tr.color + '">' + tr.icon + '</span>' + tr.name));
            for (let s = 0; s < STEPS; s++) {
              const c = $el('button', 'beats-cell' + (s % 4 === 0 ? ' beat' : '') + (pat[ti][s] ? ' on' : ''));
              c.style.setProperty('--tc', tr.color);
              c.setAttribute('aria-label', tr.name + ' step ' + (s + 1));
              c.addEventListener('click', () => {
                pat[ti][s] = !pat[ti][s];
                c.classList.toggle('on', pat[ti][s]);
                Sound.pop();
              });
              cells[ti].push(c);
              grid.appendChild(c);
            }
          });
          function clearCue() { cells.forEach((row) => row.forEach((c) => c.classList.remove('cur'))); }

          let actx = null, master = null, noiseBuf = null;
          let playing = false, step = 0, timer = null, nextT = 0;

          function ac() {
            if (!actx) {
              const AC = window.AudioContext || window.webkitAudioContext;
              actx = new AC();
              master = actx.createGain();
              master.gain.value = parseFloat(vol.value);
              master.connect(actx.destination);
              noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
              const d = noiseBuf.getChannelData(0);
              for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            }
            if (actx.state === 'suspended') actx.resume();
            return actx;
          }
          function env(g, t2, peak, decay) {
            g.gain.setValueAtTime(0.0001, t2);
            g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t2 + 0.004);
            g.gain.exponentialRampToValueAtTime(0.0001, t2 + decay);
          }
          function kick(t2) {
            const o = actx.createOscillator(), g = actx.createGain();
            o.frequency.setValueAtTime(150, t2);
            o.frequency.exponentialRampToValueAtTime(44, t2 + 0.12);
            env(g, t2, 0.9, 0.24);
            o.connect(g); g.connect(master); o.start(t2); o.stop(t2 + 0.3);
          }
          function snare(t2) {
            const s = actx.createBufferSource(); s.buffer = noiseBuf;
            const f = actx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
            const g = actx.createGain(); env(g, t2, 0.5, 0.16);
            s.connect(f); f.connect(g); g.connect(master); s.start(t2); s.stop(t2 + 0.2);
            const o = actx.createOscillator(), g2 = actx.createGain();
            o.frequency.value = 190; env(g2, t2, 0.25, 0.08);
            o.connect(g2); g2.connect(master); o.start(t2); o.stop(t2 + 0.1);
          }
          function hat(t2) {
            const s = actx.createBufferSource(); s.buffer = noiseBuf;
            const f = actx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
            const g = actx.createGain(); env(g, t2, 0.22, 0.05);
            s.connect(f); f.connect(g); g.connect(master); s.start(t2); s.stop(t2 + 0.08);
          }
          function bass(t2, sIdx) {
            const o = actx.createOscillator(); o.type = 'sawtooth';
            o.frequency.value = midi2f(BASSLINE[sIdx % STEPS]);
            const f = actx.createBiquadFilter(); f.type = 'lowpass';
            f.frequency.setValueAtTime(900, t2);
            f.frequency.exponentialRampToValueAtTime(180, t2 + 0.18);
            const g = actx.createGain(); env(g, t2, 0.3, 0.2);
            o.connect(f); f.connect(g); g.connect(master); o.start(t2); o.stop(t2 + 0.26);
          }
          function scheduleStep(i, t2) {
            if (pat[0][i]) kick(t2);
            if (pat[1][i]) snare(t2);
            if (pat[2][i]) hat(t2);
            if (pat[3][i]) bass(t2, i);
          }
          function tick() {
            while (nextT < actx.currentTime + 0.12) {
              scheduleStep(step, nextT);
              nextT += 60 / parseFloat(bpm.value) / 4;
              const cue = step;
              cells.forEach((row) => row.forEach((c, s) => c.classList.toggle('cur', s === cue)));
              step = (step + 1) % STEPS;
            }
          }
          playBtn.addEventListener('click', () => {
            if (playing) {
              playing = false; clearInterval(timer);
              playBtn.textContent = '▶ Play'; clearCue();
            } else {
              const c = ac();
              step = 0; nextT = c.currentTime + 0.06;
              timer = setInterval(tick, 25);
              playing = true; playBtn.textContent = '⏹ Stop';
            }
          });
          vol.addEventListener('input', () => { if (master) master.gain.value = parseFloat(vol.value); });
          win.onClose = () => { if (timer) clearInterval(timer); playing = false; };
        }
      });
    }
  });

  /* ============================================================
     BROWSER
     ============================================================ */
  registerApp({
    id: 'browser',
    title: 'Nebula Web',
    titleKey: 'app.browser',
    icon: '🌐',
    tile: 'linear-gradient(135deg,#3b82f6,#06b6d4)',
    open() {
      createWindow({
        id: 'browser',
        appId: 'browser',
        title: t('app.browser'),
        icon: '🌐',
        width: 880,
        height: 560,
        content(win) {
          const root = $el('div', 'browser');
          root.innerHTML =
            '<div class="br-bar">' +
              '<button class="btn icon" data-act="back" title="Back">←</button>' +
              '<button class="btn icon" data-act="home" title="Home">🏠</button>' +
              '<input class="br-url" spellcheck="false" placeholder="Enter a URL — e.g. https://www.openstreetmap.org" autocomplete="off">' +
              '<button class="btn" data-act="go">Go</button>' +
              '<button class="btn ghost" data-act="newtab" title="Open in a new tab">↗</button>' +
            '</div>' +
            '<div class="br-view"></div>';
          win.body.appendChild(root);

          const view = root.querySelector('.br-view');
          const urlInput = root.querySelector('.br-url');
          let history = [];
          let idx = -1;

          const QUICK = [
            { ic: '🗺️', label: 'Maps', url: 'https://www.openstreetmap.org/export/embed.html?bbox=-0.13%2C51.29%2C0.34%2C51.55&layer=mapnik' },
            { ic: '🌍', label: 'Wikipedia', url: 'https://simple.wikipedia.org/wiki/Main_Page' },
            { ic: '📚', label: 'Archive', url: 'https://archive.org' },
            { ic: '🧪', label: 'Example', url: 'https://example.com' }
          ];

          function startPage() {
            view.innerHTML =
              '<div class="br-start">' +
                '<div class="orb"></div>' +
                '<h2>NEBULA WEB</h2>' +
                '<div class="br-links">' +
                QUICK.map((q) =>
                  '<button class="br-link" data-url="' + esc(q.url) + '"><span class="ic">' + q.ic +
                  '</span>' + esc(q.label) + '</button>').join('') +
                '</div>' +
                '<p class="br-note">Tip: some sites (Google, YouTube, banks…) refuse to load inside frames —' +
                ' that\'s a security rule on their side. Use ↗ to open the current page in a full tab instead.</p>' +
              '</div>';
            view.querySelectorAll('.br-link').forEach((b) => {
              b.addEventListener('click', () => go(b.dataset.url));
            });
          }

          function normalize(u) {
            u = (u || '').trim();
            if (!u) return '';
            if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
            try { new URL(u); return u; } catch (e) { return ''; }
          }
          function go(raw) {
            const u = normalize(raw);
            if (!u) { notify('⚠️', 'Invalid URL', 'Could not parse “' + (raw || '') + '”.'); return; }
            history = history.slice(0, idx + 1);
            history.push(u);
            idx = history.length - 1;
            urlInput.value = u;
            view.innerHTML = '';
            const f = document.createElement('iframe');
            f.className = 'br-frame';
            f.setAttribute('referrerpolicy', 'no-referrer');
            f.src = u;
            view.appendChild(f);
          }

          root.querySelector('[data-act="go"]').addEventListener('click', () => go(urlInput.value));
          urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(urlInput.value); });
          root.querySelector('[data-act="back"]').addEventListener('click', () => {
            if (idx > 0) { idx--; urlInput.value = history[idx]; go(history[idx]); }
            else if (idx === 0) { idx = -1; startPage(); urlInput.value = ''; }
          });
          root.querySelector('[data-act="home"]').addEventListener('click', () => {
            history = []; idx = -1; urlInput.value = ''; startPage();
          });
          root.querySelector('[data-act="newtab"]').addEventListener('click', () => {
            const u = normalize(urlInput.value) || 'https://example.com';
            window.open(u, '_blank', 'noopener');
          });

          startPage();
          win.hooks.focus = () => urlInput.focus({ preventScroll: true });
          win.hooks.blur = () => urlInput.blur();
        }
      });
    }
  });

  /* ============================================================
     SYSTEM MONITOR
     ============================================================ */
  registerApp({
    id: 'monitor',
    title: 'System Monitor',
    titleKey: 'app.monitor',
    icon: '📊',
    tile: 'linear-gradient(135deg,#0ea5e9,#6366f1)',
    open() {
      createWindow({
        id: 'monitor',
        appId: 'monitor',
        title: t('app.monitor'),
        icon: '📊',
        width: 680,
        height: 480,
        content(win) {
          const root = $el('div', 'monitor');
          root.innerHTML =
            '<div class="mon-cards">' +
              '<div class="mon-card"><div class="mon-head"><span>CPU</span><b data-v="cpu">–</b></div><canvas data-c="cpu"></canvas></div>' +
              '<div class="mon-card"><div class="mon-head"><span>Memory</span><b data-v="mem">–</b></div><canvas data-c="mem"></canvas></div>' +
            '</div>' +
            '<div class="mon-table">' +
              '<div class="mon-row head"><span>Process</span><span>CPU %</span><span>Mem</span></div>' +
              '<div class="mon-body"></div>' +
            '</div>';
          win.body.appendChild(root);

          const N = 48;
          const data = { cpu: Array(N).fill(28), mem: Array(N).fill(52) };
          let cpu = 28, mem = 52;
          const vCpu = root.querySelector('[data-v="cpu"]');
          const vMem = root.querySelector('[data-v="mem"]');
          const body = root.querySelector('.mon-body');
          const canvases = Array.from(root.querySelectorAll('canvas'));

          const procs = [
            { name: 'nebula-shell', base: 4 }, { name: 'window-manager', base: 3 },
            { name: 'render-core', base: 11 }, { name: 'audio-engine', base: 2 },
            { name: 'file-service', base: 1 }, { name: 'net-daemon', base: 2 },
            { name: 'star-tracker', base: 1 }, { name: 'theme-engine', base: 0.5 }
          ];

          function drawChart(cv, arr) {
            const dpr = window.devicePixelRatio || 1;
            const w = cv.clientWidth, h = cv.clientHeight;
            if (!w || !h) return;
            cv.width = w * dpr; cv.height = h * dpr;
            const c = cv.getContext('2d');
            c.scale(dpr, dpr);
            c.clearRect(0, 0, w, h);
            c.strokeStyle = 'rgba(148,163,255,.14)'; c.lineWidth = 1;
            for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(0, (h * i) / 4); c.lineTo(w, (h * i) / 4); c.stroke(); }
            c.beginPath();
            arr.forEach((v, i) => {
              const x = (i / (N - 1)) * w;
              const y = h - (v / 100) * (h - 8) - 4;
              i ? c.lineTo(x, y) : c.moveTo(x, y);
            });
            c.strokeStyle = OS.settings.accent; c.lineWidth = 2; c.stroke();
            c.lineTo(w, h); c.lineTo(0, h); c.closePath();
            c.fillStyle = OS.settings.accent + '2e'; c.fill();
          }

          function tick() {
            cpu = clampNum(cpu + (Math.random() * 14 - 7) + (Math.random() < 0.06 ? 26 : 0), 4, 98);
            mem = clampNum(mem + (Math.random() * 4 - 2), 20, 92);
            data.cpu.push(cpu); data.cpu.shift();
            data.mem.push(mem); data.mem.shift();
            canvases.forEach((cv) => drawChart(cv, cv.dataset.c === 'cpu' ? data.cpu : data.mem));
            vCpu.textContent = Math.round(cpu) + '%';
            vMem.textContent = Math.round(mem) + '%';
            body.innerHTML = '';
            const rows = procs.map((p) => ({
              name: p.name,
              cpu: Math.max(0, p.base + (Math.random() * 4 - 2)),
              mem: (3 + Math.random() * 6).toFixed(1)
            })).sort((a, b) => b.cpu - a.cpu);
            rows.forEach((r) => {
              const row = $el('div', 'mon-row');
              row.innerHTML = '<span>' + esc(r.name) + '</span><span>' + r.cpu.toFixed(1) + '</span><span>' + r.mem + '%</span>';
              body.appendChild(row);
            });
          }

          tick();
          const iv = setInterval(tick, 1000);
          const ro = new ResizeObserver(() => {
            canvases.forEach((cv) => drawChart(cv, cv.dataset.c === 'cpu' ? data.cpu : data.mem));
          });
          canvases.forEach((cv) => ro.observe(cv));
          win.onClose = () => { clearInterval(iv); ro.disconnect(); };
        }
      });
    }
  });

  /* ============================================================
     CALENDAR
     ============================================================ */
  registerApp({
    id: 'calendar',
    title: 'Calendar',
    titleKey: 'app.calendar',
    icon: '📅',
    tile: 'linear-gradient(135deg,#ef4444,#f97316)',
    open() {
      createWindow({
        id: 'calendar',
        appId: 'calendar',
        title: t('app.calendar'),
        icon: '📅',
        width: 470,
        height: 500,
        content(win) {
          const today = new Date();
          let y = today.getFullYear();
          let m = today.getMonth();
          const root = $el('div', 'cal');
          root.innerHTML =
            '<div class="cal-head">' +
              '<div class="cal-title"></div>' +
              '<div class="cal-nav">' +
                '<button class="btn icon sm" data-nav="prev">←</button>' +
                '<button class="btn ghost sm" data-nav="today">Today</button>' +
                '<button class="btn icon sm" data-nav="next">→</button>' +
              '</div>' +
            '</div>' +
            '<div class="cal-grid"></div>' +
            '<div class="cal-daypanel hidden"></div>';
          win.body.appendChild(root);
          const titleEl = root.querySelector('.cal-title');
          const grid = root.querySelector('.cal-grid');
          let dayTasks = [];
          try { dayTasks = JSON.parse(localStorage.getItem('nebula.tasks.v1') || '[]'); } catch (e) { dayTasks = []; }
          const todayKey = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
          const calPanel = root.querySelector('.cal-daypanel');
          function showDay(dkey, dayNum) {
            const dt = new Date(y, m, dayNum);
            const due = dayTasks.filter((x) => x.due === dkey);
            calPanel.innerHTML = '<div class="cal-dp-h">✅ ' + esc(t('cal.tasks')) + ' ' +
              dt.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + '</div>' +
              (due.length
                ? due.map((x) => '<div class="cal-dp-item' + (x.done ? ' done' : '') + '"><span>' + (x.done ? '✓' : '○') + '</span>' + esc(x.text) + '</div>').join('')
                : '<div class="cal-dp-empty">' + esc(t('cal.none')) + '</div>');
            calPanel.classList.remove('hidden');
          }

          function render() {
            const first = new Date(y, m, 1);
            titleEl.textContent = first.toLocaleDateString([], { month: 'long', year: 'numeric' });
            const startOffset = (first.getDay() + 6) % 7;
            const dim = new Date(y, m + 1, 0).getDate();
            const prevDim = new Date(y, m, 0).getDate();
            grid.innerHTML = '';
            ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].forEach((d) => grid.appendChild($el('div', 'cal-dow', d)));
            const total = Math.ceil((startOffset + dim) / 7) * 7;
            for (let i = 0; i < total; i++) {
              const dayNum = i - startOffset + 1;
              const other = dayNum < 1 || dayNum > dim;
              const shown = dayNum < 1 ? prevDim + dayNum : (dayNum > dim ? dayNum - dim : dayNum);
              const isToday = !other && dayNum === today.getDate() && m === today.getMonth() && y === today.getFullYear();
              const cell = $el('div', 'cal-day' + (other ? ' other' : '') + (isToday ? ' today' : ''));
              cell.textContent = shown;
              if (!other) {
                const dkey = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(dayNum).padStart(2, '0');
                const dueTasks = dayTasks.filter((x) => x.due === dkey);
                if (dueTasks.length) {
                  const allDone = dueTasks.every((x) => x.done);
                  const late = dueTasks.some((x) => !x.done && dkey < todayKey);
                  cell.appendChild($el('span', 'mdot' + (late ? ' late' : '') + (allDone ? ' done' : '')));
                }
                cell.addEventListener('click', () => showDay(dkey, dayNum));
              }
              grid.appendChild(cell);
            }
          }
          root.querySelector('[data-nav="prev"]').addEventListener('click', () => { m--; if (m < 0) { m = 11; y--; } render(); });
          root.querySelector('[data-nav="next"]').addEventListener('click', () => { m++; if (m > 11) { m = 0; y++; } render(); });
          root.querySelector('[data-nav="today"]').addEventListener('click', () => { y = today.getFullYear(); m = today.getMonth(); render(); });
          render();
        }
      });
    }
  });

  /* ============================================================
     SETTINGS
     ============================================================ */
  registerApp({
    id: 'settings',
    title: 'Settings',
    titleKey: 'app.settings',
    icon: '⚙️',
    tile: 'linear-gradient(135deg,#6b7280,#374151)',
    open() {
      createWindow({
        id: 'settings',
        appId: 'settings',
        title: t('app.settings'),
        icon: '⚙️',
        width: 600,
        height: 560,
        content(win) {
          const s = OS.settings;
          const ACCENTS = ['#7c6cff', '#22d3ee', '#f472b6', '#34d399', '#fbbf24', '#f87171'];
          const box = $el('div', 'settings');
          win.body.appendChild(box);

          function rebuild() {
            box.innerHTML =
              '<div class="set-sec"><h3>' + esc(t('set.appearance')) + '</h3>' +
                '<div class="set-row"><div><div class="lbl">' + esc(t('set.theme')) + '</div><div class="sub">' + esc(t('set.themeSub')) + '</div></div>' +
                  '<div class="seg" data-seg="theme">' +
                    '<button data-v="dark">' + esc(t('set.dark')) + '</button>' +
                    '<button data-v="light">' + esc(t('set.light')) + '</button>' +
                    '<button data-v="patriot">' + esc(t('set.patriot')) + '</button>' +
                  '</div></div>' +
                '<div class="set-row"><div><div class="lbl">' + esc(t('set.accent')) + '</div><div class="sub">' + esc(t('set.accentSub')) + '</div></div>' +
                  '<div class="swatches">' +
                    ACCENTS.map((c) => '<button class="swatch" data-c="' + c + '" style="background:' + c + '"></button>').join('') +
                    '<input type="color" data-custom value="' + s.accent + '" title="Custom accent">' +
                  '</div></div>' +
                '<div class="set-row" style="align-items:flex-start"><div><div class="lbl">' + esc(t('set.wallpaper')) + '</div><div class="sub">' + esc(t('set.wallpaperSub')) + '</div></div>' +
                  '<div class="wp-thumbs" style="width:100%">' +
                    WALLPAPERS.map((w, i) =>
                      '<button class="wp-thumb' + (i === s.wallpaper ? ' on' : '') + '" data-w="' + i + '" title="' + esc(w.name) +
                      '" style="background:' + w.css + '"></button>').join('') +
                  '</div></div>' +
              '</div>' +
              '<div class="set-sec"><h3>' + esc(t('set.behavior')) + '</h3>' +
                '<div class="set-row"><div><div class="lbl">' + esc(t('set.sound')) + '</div><div class="sub">' + esc(t('set.soundSub')) + '</div></div>' +
                  '<input type="checkbox" class="check" data-key="sound"></div>' +
                '<div class="set-row"><div><div class="lbl">' + esc(t('set.motion')) + '</div><div class="sub">' + esc(t('set.motionSub')) + '</div></div>' +
                  '<input type="checkbox" class="check" data-key="reduceMotion"></div>' +
                '<div class="set-row"><div><div class="lbl">' + esc(t('set.language')) + '</div><div class="sub">' + esc(t('set.languageSub')) + '</div></div>' +
                  '<select class="set-select" data-lang>' +
                    I18N.LANGS.map((l) => '<option value="' + l.id + '"' + (l.id === s.language ? ' selected' : '') + '>' +
                      l.flag + ' ' + esc(l.name) + '</option>').join('') +
                  '</select></div>' +
              '</div>' +
              '<div class="set-sec"><h3>' + esc(t('set.security')) + '</h3>' +
                '<div class="set-row"><div><div class="lbl">' + esc(t('set.pin')) + '</div><div class="sub">' + esc(t('set.pinSub')) + '</div></div>' +
                  '<div class="seg">' +
                    '<button data-pin="set">' + esc(t('set.pinSet')) + '</button>' +
                    (s.pinHash ? '<button data-pin="clear">' + esc(t('set.pinClear')) + '</button>' : '') +
                  '</div></div>' +
                '<div class="set-row"><div><div class="lbl">' + esc(t('set.idle')) + '</div><div class="sub">' + esc(t('set.idleSub')) + '</div></div>' +
                  '<div style="display:flex;gap:8px;align-items:center">' +
                    '<select class="set-select" data-idlemin>' +
                      [1, 3, 5, 10].map((n) => '<option value="' + n + '"' + (n === s.idleMinutes ? ' selected' : '') + '>' + n + ' min</option>').join('') +
                    '</select>' +
                    '<input type="checkbox" class="check" data-key="idleLock">' +
                  '</div></div>' +
                '<div class="set-row"><div><div class="lbl">' + esc(t('set.erase')) + '</div><div class="sub">' + esc(t('set.eraseMsg')) + '</div></div>' +
                  '<button class="btn ghost sm" data-erase>' + esc(t('set.erase')) + '</button></div>' +
              '</div>' +
              '<div class="set-sec"><h3>' + esc(t('set.system')) + '</h3>' +
                '<div class="set-row"><div class="lbl">' + esc(t('set.storage')) + '</div><div class="set-storage" data-storage></div></div>' +
                '<div class="set-row"><div><div class="lbl">' + esc(t('set.reset')) + '</div><div class="sub">' + esc(t('set.resetSub')) + '</div></div>' +
                  '<button class="btn ghost sm" data-reset>' + esc(t('set.resetBtn')) + '</button></div>' +
              '</div>';

            /* --- wiring --- */
            box.querySelectorAll('[data-seg="theme"] button').forEach((b) => {
              b.classList.toggle('on', b.dataset.v === s.theme);
              b.addEventListener('click', () => { s.theme = b.dataset.v; OS.saveSettings(); OS.applySettings(); rebuild(); });
            });
            box.querySelectorAll('.swatch').forEach((b) => {
              b.classList.toggle('on', b.dataset.c.toLowerCase() === s.accent.toLowerCase());
              b.addEventListener('click', () => { s.accent = b.dataset.c; OS.saveSettings(); OS.applySettings(); rebuild(); });
            });
            box.querySelector('[data-custom]').addEventListener('input', (e) => {
              s.accent = e.target.value; OS.saveSettings(); OS.applySettings();
              box.querySelectorAll('.swatch').forEach((x) => x.classList.remove('on'));
            });
            box.querySelectorAll('.wp-thumb').forEach((b) => {
              b.addEventListener('click', () => { s.wallpaper = parseInt(b.dataset.w, 10); OS.saveSettings(); OS.applySettings(); rebuild(); });
            });
            box.querySelectorAll('.check').forEach((c) => {
              c.checked = !!s[c.dataset.key];
              c.addEventListener('change', () => { s[c.dataset.key] = c.checked; OS.saveSettings(); OS.applySettings(); });
            });
            box.querySelector('[data-lang]').addEventListener('change', (e) => OS.setLanguage(e.target.value));
            box.querySelector('[data-idlemin]').addEventListener('change', (e) => {
              s.idleMinutes = parseInt(e.target.value, 10); OS.saveSettings();
            });
            box.querySelectorAll('[data-pin]').forEach((b) => {
              b.addEventListener('click', () => {
                if (b.dataset.pin === 'set') {
                  ask({ title: t('set.pin'), message: t('set.pinSub'), placeholder: '1234', value: '', okLabel: t('set.pinSet') })
                    .then((v) => {
                      if (v && /^\d{4}$/.test(v)) {
                        OS.setPin(v);
                        notify('🔒', 'PIN set', t('set.pin'));
                      } else notify('⚠️', 'Invalid PIN', 'PIN must be exactly 4 digits.');
                      rebuild();
                    });
                } else {
                  confirmDialog(t('set.pinClear'), t('set.pinSub'), t('set.pinClear')).then((ok) => {
                    if (ok) { OS.clearPin(); notify('🔓', 'PIN cleared'); }
                    rebuild();
                  });
                }
              });
            });
            box.querySelector('[data-erase]').addEventListener('click', () => {
              confirmDialog(t('set.erase'), t('set.eraseMsg'), t('set.erase')).then((ok2) => {
                if (!ok2) return;
                Audit.log('data.erase', 'all local data wiped by user');
                Object.keys(localStorage).filter((k) => k.indexOf('nebula.') === 0).forEach((k) => localStorage.removeItem(k));
                setTimeout(() => location.reload(), 200);
              });
            });
            box.querySelector('[data-reset]').addEventListener('click', () => {
              confirmDialog(t('set.reset'), t('set.resetMsg'), t('set.resetBtn')).then((ok) => {
                if (!ok) return;
                try { localStorage.clear(); } catch (e) {}
                location.reload();
              });
            });
            let total = 0;
            try {
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                total += (localStorage.getItem(k) || '').length + k.length;
              }
            } catch (e) {}
            box.querySelector('[data-storage]').textContent = fmtBytes(total * 2) + ' used (localStorage)';
          }

          rebuild();
          win.hooks.rebuild = rebuild;
          if (!OS._refreshSettings) {
            OS._refreshSettings = () => {
              const w = OS.windows.get('settings');
              if (w && w.hooks.rebuild) w.hooks.rebuild();
            };
          }
        }
      });
    }
  });

  /* ============================================================
     ABOUT
     ============================================================ */
  registerApp({
    id: 'about',
    title: 'About',
    titleKey: 'app.about',
    icon: '🪐',
    tile: 'linear-gradient(135deg,#7c6cff,#22d3ee)',
    open() {
      createWindow({
        id: 'about',
        appId: 'about',
        title: t('app.about'),
        icon: '🪐',
        width: 470,
        height: 560,
        content(win) {
          const uptimeMin = () => Math.max(0, Math.floor((Date.now() - OS.startedAt) / 60000));
          const root = $el('div', 'about');
          root.innerHTML =
            '<div class="orb"></div>' +
            '<h2>NEBULA OS</h2>' +
            '<div class="ver">version ' + OS.version + ' · web build · ' + I18N.LANGS.length + ' languages</div>' +
            '<div class="about-specs">' +
              '<div><span>Engine</span><b>Vanilla JavaScript — 0 dependencies</b></div>' +
              '<div><span>Shell</span><b>nterm 1.1 (tabs · 25+ commands)</b></div>' +
              '<div><span>Window manager</span><b>nebwm (drag · snap · resize)</b></div>' +
              '<div><span>Spotlight</span><b>Ctrl/⌘+Space — apps, files, math</b></div>' +
              '<div><span>Mission Control</span><b>Ctrl/⌘+` — window overview</b></div>' +
              '<div><span>Assistant</span><b>offline natural-language commands</b></div>' +
              '<div><span>Stocks</span><b>live markets · CoinGecko</b></div>' +
              '<div><span>Android</span><b>APK install · web-bridge runtime · App Center</b></div>' +
              '<div><span>Themes</span><b>Dark · Light · Patriot (gold &amp; navy) · 8 wallpapers · 🎆 Celebrate</b></div>' +
              '<div><span>New in 2.5</span><b>Contacts (vCard/CSV) · Music (local audio) · Backup (one-file restore) · Onboarding tour</b></div>' +
              '<div><span>New in 2.6</span><b>Tasks (due dates · priorities) · Budget (income/expense ledger) · Shortcuts reference (press ?)</b></div>' +
              '<div><span>New in 2.7</span><b>Calendar shows task due-dates · Notes markdown preview · Budget CSV in/out · Spotlight finds notes, contacts, tasks &amp; budget</b></div>' +
              '<div><span>Compliance</span><b>WCAG 2.1 AA · Section 508 · <a href="docs/a11y.html" target="_blank" rel="noopener">Accessibility &amp; security statement ↗</a></b></div>' +
              '<div><span>Audit</span><b>immutable local event log · PIN (salted SHA-256) · auto-lock</b></div>' +
              '<div><span>Install</span><b>PWA · offline shell via service worker</b></div>' +
              '<div><span>Shortcuts</span><b>⌘Space · ⌘` · Alt+Tab · Alt+L</b></div>' +
              '<div><span>Filesystem</span><b>virtual, localStorage-backed</b></div>' +
              '<div><span>Audio</span><b>Web Audio API (Beat Deck)</b></div>' +
              '<div><span>Languages</span><b>EN · ES · FR · DE · PT · JA · HI · AR</b></div>' +
              '<div><span>Resolution</span><b>' + innerWidth + '×' + (innerHeight - TASKBAR_H) + '</b></div>' +
              '<div><span>Uptime</span><b class="about-up">' + uptimeMin() + ' min</b></div>' +
              '<div><span>Source</span><b><a data-gh href="' + esc(GITHUB_URL) + '" target="_blank" rel="noopener">View on GitHub ↗</a></b></div>' +
            '</div>' +
            '<p class="tag">A tiny universe in a single tab.<br>Built with ♥ and no frameworks.</p>';
          win.body.appendChild(root);
          const up = root.querySelector('.about-up');
          const iv = setInterval(() => { up.textContent = uptimeMin() + ' min'; }, 30000);
          win.onClose = () => clearInterval(iv);
        }
      });
    }
  });

  /* ---------- audit log (governance) ---------- */
  registerApp({
    id: 'audit',
    title: 'Audit Log',
    titleKey: 'app.audit',
    icon: '📜',
    tile: 'linear-gradient(135deg,#0f172a,#334155)',
    open() {
      createWindow({
        id: 'audit',
        appId: 'audit',
        title: t('app.audit'),
        width: 760,
        height: 480,
        content(winW) {
          const box = $el('div', 'audit');
          const render = () => {
            const list = Audit.read();
            box.innerHTML =
              '<div class="audit-bar"><b class="audit-count">' + list.length + '</b>' +
                '<button class="btn ghost sm" data-export>' + esc(t('audit.export')) + '</button>' +
                '<button class="btn ghost sm" data-clear>' + esc(t('audit.clear')) + '</button></div>' +
              '<div class="audit-list">' + (list.length ? list.map((e) =>
                '<div class="audit-row"><span class="audit-ts">' + new Date(e.ts).toLocaleString() + '</span>' +
                '<span class="audit-ev">' + esc(e.event) + '</span>' +
                '<span class="audit-dt">' + esc(e.detail) + '</span></div>').join('')
                : '<div class="audit-empty">' + esc(t('audit.empty')) + '</div>') + '</div>';
            box.querySelector('[data-export]').addEventListener('click', () => {
              const blob = new Blob([JSON.stringify(Audit.read(), null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'nebula-audit-log.json';
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 4000);
              Audit.log('audit.export');
              render();
            });
            box.querySelector('[data-clear]').addEventListener('click', () => {
              confirmDialog(t('audit.clear'), t('audit.clearMsg'), t('audit.clear')).then((ok2) => {
                if (ok2) { Audit.clear(); render(); }
              });
            });
          };
          render();
          winW.body.appendChild(box);
        }
      });
    }
  });

  /* ---------- TV (living room) ---------- */
  registerApp({
    id: 'tv',
    title: 'TV',
    titleKey: 'app.tv',
    icon: '📺',
    tile: 'linear-gradient(135deg,#111827,#3b82f6)',
    open() {
      createWindow({
        id: 'tv',
        appId: 'tv',
        title: t('app.tv'),
        width: 880,
        height: 560,
        content(winW) {
          const box = $el('div', 'tv-app');
          box.innerHTML =
            '<div class="tv-app-hero">' +
              '<div class="tv-app-eyebrow">NEBULA · LIVING ROOM</div>' +
              '<h2>📺 ' + esc(t('app.tv')) + '</h2>' +
              '<p>' + esc(t('tv.appSub')) + '</p>' +
              '<button class="btn" data-tvmode>' + esc(t('tv.mode')) + '</button>' +
            '</div>' +
            '<div class="tv-app-grid">' + window.TV_STREAMS.map((st) =>
              '<button class="tv-app-tile" data-s="' + st.id + '" style="--tc:' + st.color + '">' +
                '<span class="tv-app-glyph" style="background:' + st.color + '">' + esc(st.glyph) + '</span>' +
                '<span class="tv-app-name">' + esc(st.name) + '</span>' +
              '</button>').join('') + '</div>' +
            '<p class="tv-app-note">' + esc(t('tv.physics')) + '</p>';
          box.querySelector('[data-tvmode]').addEventListener('click', () => OS.tv.open());
          box.querySelectorAll('[data-s]').forEach((b) => {
            b.addEventListener('click', () => {
              const st = window.TV_STREAMS.find((x) => x.id === b.dataset.s);
              if (st) OS.tv.launch(st);
            });
          });
          winW.body.appendChild(box);
        }
      });
    }
  });


  /* ============================================================
     CONTACTS — local people manager (vCard / CSV)
     ============================================================ */
  const CT_KEY = 'nebula.contacts.v1';
  registerApp({
    id: 'contacts',
    title: 'Contacts',
    titleKey: 'app.contacts',
    icon: '👥',
    tile: 'linear-gradient(135deg,#06b6d4,#3b82f6)',
    open() {
      createWindow({
        id: 'contacts',
        appId: 'contacts',
        title: t('app.contacts'),
        icon: '👥',
        width: 800,
        height: 500,
        content(winW) {
          const box = $el('div', 'contacts');
          box.innerHTML =
            '<aside class="ct-side">' +
              '<input class="ct-search" placeholder="' + esc(t('ct.search')) + '" aria-label="' + esc(t('ct.search')) + '">' +
              '<div class="ct-list"></div>' +
              '<button class="btn sm" data-new>＋ ' + esc(t('ct.new')) + '</button>' +
            '</aside>' +
            '<main class="ct-main">' +
              '<div class="ct-editor hidden">' +
                '<input class="ct-f name" placeholder="' + esc(t('ct.name')) + '" aria-label="' + esc(t('ct.name')) + '">' +
                '<div class="ct-frow">' +
                  '<input class="ct-f phone" placeholder="' + esc(t('ct.phone')) + '" aria-label="' + esc(t('ct.phone')) + '">' +
                  '<input class="ct-f email" placeholder="' + esc(t('ct.email')) + '" aria-label="' + esc(t('ct.email')) + '">' +
                '</div>' +
                '<textarea class="ct-f notes" rows="4" placeholder="' + esc(t('ct.notes')) + '" aria-label="' + esc(t('ct.notes')) + '"></textarea>' +
              '</div>' +
              '<div class="ct-actions">' +
                '<button class="btn ghost sm" data-vcard>💳 ' + esc(t('ct.export')) + '</button>' +
                '<button class="btn ghost sm" data-csv>🧾 ' + esc(t('ct.csv')) + '</button>' +
                '<button class="btn ghost sm" data-import>⬆ ' + esc(t('ct.import')) + '</button>' +
                '<span class="spacer"></span>' +
                '<button class="btn sm danger" data-del>🗑 ' + esc(t('ct.delete')) + '</button>' +
              '</div>' +
              '<input type="file" hidden data-vcardpick accept=".vcf,.csv">' +
            '</main>';
          winW.body.appendChild(box);

          const listEl = box.querySelector('.ct-list');
          const editor = box.querySelector('.ct-editor');
          const fName = box.querySelector('.ct-f.name'), fPhone = box.querySelector('.ct-f.phone'),
                fEmail = box.querySelector('.ct-f.email'), fNotes = box.querySelector('.ct-f.notes');
          const searchEl = box.querySelector('.ct-search');
          let contacts = [];
          try { contacts = JSON.parse(localStorage.getItem(CT_KEY) || '[]'); } catch (e) { contacts = []; }
          let current = null;

          const save = () => { try { localStorage.setItem(CT_KEY, JSON.stringify(contacts)); } catch (e) {} };
          const initials = (n) => ((n || '?').trim().split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase()) || '?';

          function renderList(filter) {
            const q = (filter || '').trim().toLowerCase();
            listEl.innerHTML = '';
            const items = contacts.filter((c) => !q || ((c.name || '') + ' ' + (c.phone || '') + ' ' + (c.email || '')).toLowerCase().includes(q));
            if (!items.length) listEl.appendChild($el('div', 'fm-empty', esc(t('ct.empty'))));
            items.forEach((c) => {
              const b = $el('button', 'ct-item' + (current && current.id === c.id ? ' sel' : ''));
              b.innerHTML = '<span class="ct-av">' + esc(initials(c.name)) + '</span>' +
                '<span class="ct-meta"><b>' + esc(c.name || '—') + '</b><small>' + esc((c.phone || c.email) || '—') + '</small></span>';
              b.addEventListener('click', () => select(c));
              listEl.appendChild(b);
            });
          }
          function select(c) {
            current = c;
            editor.classList.remove('hidden');
            fName.value = c.name || ''; fPhone.value = c.phone || ''; fEmail.value = c.email || ''; fNotes.value = c.notes || '';
            renderList(searchEl.value);
          }
          function makeNew() {
            const c = { id: Date.now() + Math.floor(Math.random() * 1e4), name: '', phone: '', email: '', notes: '', updated: Date.now() };
            contacts.unshift(c);
            current = c;
            save();
            editor.classList.remove('hidden');
            fName.value = fPhone.value = fEmail.value = fNotes.value = '';
            renderList(searchEl.value);
            fName.focus({ preventScroll: true });
          }
          function commit() {
            if (!current) return;
            const name = fName.value.trim();
            if (!name) { notify('⚠️', t('ct.needName')); renderList(searchEl.value); return; }
            current.name = name; current.phone = fPhone.value.trim();
            current.email = fEmail.value.trim(); current.notes = fNotes.value.trim();
            current.updated = Date.now();
            save(); renderList(searchEl.value);
            notify('✅', t('ct.saved'), name);
          }
          [fName, fPhone, fEmail, fNotes].forEach((e2) => e2.addEventListener('change', commit));

          function vcard(c) {
            return 'BEGIN:VCARD\nVERSION:3.0\nFN:' + c.name +
              (c.phone ? '\nTEL;TYPE=CELL:' + c.phone : '') +
              (c.email ? '\nEMAIL:' + c.email : '') +
              (c.notes ? '\nNOTE:' + c.notes : '') +
              '\nEND:VCARD\n';
          }
          function downloadText(name, text, type) {
            const a = document.createElement('a');
            a.href = 'data:' + type + ';charset=utf-8,' + encodeURIComponent(text);
            a.download = name;
            document.body.appendChild(a); a.click(); a.remove();
          }
          box.querySelector('[data-vcard]').addEventListener('click', () => {
            if (!contacts.length) { notify('⚠️', t('ct.empty')); return; }
            downloadText('nebula-contacts.vcf', contacts.map(vcard).join(''), 'text/vcard');
            Audit.log('contacts.export', 'vCard ×' + contacts.length);
            notify('💳', t('ct.export'), contacts.length + '');
          });
          box.querySelector('[data-csv]').addEventListener('click', () => {
            if (!contacts.length) { notify('⚠️', t('ct.empty')); return; }
            const csv = 'name,phone,email,notes\n' + contacts.map((c) =>
              [c.name, c.phone || '', c.email || '', c.notes || ''].map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
            downloadText('nebula-contacts.csv', csv, 'text/csv');
            Audit.log('contacts.export', 'CSV ×' + contacts.length);
            notify('🧾', t('ct.csv'), contacts.length + '');
          });
          const pick = box.querySelector('[data-vcardpick]');
          box.querySelector('[data-import]').addEventListener('click', () => pick.click());
          pick.addEventListener('change', async () => {
            const f = pick.files && pick.files[0];
            pick.value = '';
            if (!f) return;
            try {
              const text = await readFileText(f);
              const added = parseContacts(text);
              if (!added.length) throw new Error('none');
              let fresh = 0;
              added.forEach((c) => {
                if (!contacts.some((x) => x.name && c.name && x.name.toLowerCase() === c.name.toLowerCase())) { contacts.push(c); fresh++; }
              });
              save(); renderList(searchEl.value);
              Audit.log('contacts.import', f.name + ' ×' + fresh);
              notify('⬆️', t('ct.import'), t('ct.imported').replace('%d', fresh));
            } catch (e) {
              notify('⚠️', t('ct.importErr'), f.name);
            }
          });
          function parseContacts(text) {
            const out = [];
            if (/BEGIN:VCARD/i.test(text)) {
              text.split(/BEGIN:VCARD/i).slice(1).forEach((chunk, ci) => {
                const end = chunk.indexOf('END:VCARD');
                const body = end >= 0 ? chunk.slice(0, end) : chunk;
                const get = (k) => {
                  const m = body.match(new RegExp('^' + k + '(?:;[^:\n]*)?:([^\n]+)', 'mi'));
                  return m ? m[1].trim() : '';
                };
                const name = get('FN') || (get('N') || '').split(';').reverse().filter(Boolean).join(' ');
                if (name) out.push({ id: Date.now() + ci * 7 + Math.floor(Math.random() * 1e3), name, phone: get('TEL'), email: get('EMAIL'), notes: get('NOTE'), updated: Date.now() });
              });
              return out;
            }
            const rows = text.trim().split(/\r?\n/);
            if (!rows.length) return out;
            const start = rows[0].toLowerCase().includes('name') ? 1 : 0;
            for (let i = start; i < rows.length; i++) {
              const cells = (rows[i].match(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g) || []).map((c) =>
                c.replace(/,$/, '').replace(/^"(.*)"$/, '$1').replace(/""/g, '"').trim());
              if (cells[0]) out.push({ id: Date.now() + i * 13 + Math.floor(Math.random() * 1e3), name: cells[0], phone: cells[1] || '', email: cells[2] || '', notes: cells[3] || '', updated: Date.now() });
            }
            return out;
          }
          box.querySelector('[data-del]').addEventListener('click', () => {
            if (!current) return;
            confirmDialog(t('ct.delete') + ' ' + (current.name || '?') + '?', '', t('ct.delete')).then((ok2) => {
              if (!ok2) return;
              contacts = contacts.filter((x) => x.id !== current.id);
              current = contacts[0] || null;
              save();
              if (current) select(current);
              else { editor.classList.add('hidden'); renderList(searchEl.value); }
            });
          });
          box.querySelector('[data-new]').addEventListener('click', makeNew);
          searchEl.addEventListener('input', () => renderList(searchEl.value));
          winW.hooks.focus = () => { (current ? fNotes : searchEl).focus({ preventScroll: true }); };
          if (contacts.length) select(contacts[0]); else renderList('');
        }
      });
    }
  });

  /* ============================================================
     MUSIC — local audio player (Web Audio, in-memory)
     ============================================================ */
  registerApp({
    id: 'music',
    title: 'Music',
    titleKey: 'app.music',
    icon: '🎵',
    tile: 'linear-gradient(135deg,#f472b6,#8b5cf6)',
    open() {
      createWindow({
        id: 'music',
        appId: 'music',
        title: t('app.music'),
        icon: '🎵',
        width: 740,
        height: 520,
        content(winW) {
          const box = $el('div', 'music');
          box.innerHTML =
            '<div class="mu-stage">' +
              '<div class="mu-disc" aria-hidden="true">🎵</div>' +
              '<div class="mu-now">' +
                '<span class="mu-eyebrow">' + esc(t('mu.now')) + '</span>' +
                '<b class="mu-title">—</b>' +
                '<div class="mu-bars" aria-hidden="true">' + Array.from({ length: 22 }, () => '<span class="mu-bar"></span>').join('') + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="mu-ctl">' +
              '<button class="btn icon" data-prev title="Previous">⏮</button>' +
              '<button class="btn" data-play>▶ ' + esc(t('mu.play')) + '</button>' +
              '<button class="btn icon" data-next title="Next">⏭</button>' +
              '<input type="range" class="mu-seek" min="0" max="100" value="0" step="0.1" aria-label="Seek">' +
              '<span class="mu-time">0:00 / 0:00</span>' +
              '<span class="spacer"></span>' +
              '<input type="range" class="mu-vol" min="0" max="1" step="0.01" value="0.8" aria-label="Volume">' +
            '</div>' +
            '<div class="mu-list-wrap">' +
              '<div class="mu-list-head"><b>' + esc(t('mu.list')) + '</b>' +
                '<span>' +
                  '<button class="btn ghost sm" data-demo>✨ ' + esc(t('mu.demo')) + '</button> ' +
                  '<button class="btn ghost sm" data-add>⬆ ' + esc(t('mu.add')) + '</button>' +
                '</span>' +
              '</div>' +
              '<div class="mu-list"></div>' +
              '<input type="file" hidden data-pick accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac" multiple>' +
            '</div>' +
            '<p class="mu-note">' + esc(t('mu.note')) + '</p>' +
            '<p class="mu-warn hidden">' + esc(t('mu.noengine')) + '</p>';
          winW.body.appendChild(box);

          const AC = window.AudioContext || window.webkitAudioContext;
          const hasAudio = !!AC;
          let actx = null, gain = null, srcNode = null;
          let tracks = [];      // {id,name,demo,dur,sr,samples,buffer}
          let cur = -1, playing = false, startAt = 0, offAt = 0, raf = 0;

          const listEl = box.querySelector('.mu-list');
          const titleEl = box.querySelector('.mu-title');
          const seek = box.querySelector('.mu-seek'), timeEl = box.querySelector('.mu-time'),
                volEl = box.querySelector('.mu-vol'), playBtn = box.querySelector('[data-play]');
          const bars = Array.from(box.querySelectorAll('.mu-bar'));
          const warnEl = box.querySelector('.mu-warn');
          if (!hasAudio) warnEl.classList.remove('hidden');

          const fmtT = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

          function renderList() {
            listEl.innerHTML = '';
            if (!tracks.length) listEl.appendChild($el('div', 'fm-empty', esc(t('mu.empty'))));
            tracks.forEach((tr, i) => {
              const b = $el('button', 'mu-track' + (i === cur ? ' cur' : ''));
              b.innerHTML = '<span class="mu-t-ic">' + (tr.demo ? '✨' : '🎵') + '</span><b>' + esc(tr.name) + '</b><small>' + fmtT(tr.dur) + '</small>';
              b.addEventListener('click', () => play(i));
              listEl.appendChild(b);
            });
          }
          function ensureCtx() {
            if (!hasAudio) return null;
            if (!actx) {
              actx = new AC();
              gain = actx.createGain();
              gain.gain.value = parseFloat(volEl.value);
              gain.connect(actx.destination);
            }
            if (actx.state === 'suspended') actx.resume();
            return actx;
          }
          function stopSrc() {
            if (srcNode) { try { srcNode.stop(); } catch (e) {} srcNode = null; }
          }
          function materialize(tr) {
            if (tr.buffer) return tr.buffer;
            if (!actx) return null;
            const ab = actx.createBuffer(1, tr.samples.length, tr.sr);
            ab.getChannelData(0).set(tr.samples);
            tr.buffer = ab;
            return ab;
          }
          function play(i) {
            cur = i;
            const c = ensureCtx();
            const tr = tracks[i];
            if (!c || !tr || !materialize(tr)) { renderList(); return; }
            offAt = 0;
            startSrc();
            renderList();
            tick();
          }
          function startSrc() {
            stopSrc();
            if (!actx) return;
            srcNode = actx.createBufferSource();
            srcNode.buffer = tracks[cur].buffer;
            srcNode.connect(gain);
            srcNode.onended = () => {
              if (playing && offAt >= tracks[cur].dur - 0.08) next();
            };
            srcNode.start(0, offAt);
            playing = true;
            startAt = actx.currentTime - offAt;
            playBtn.textContent = '⏸ ' + t('mu.pause');
            titleEl.textContent = tracks[cur].name;
          }
          function pause() {
            if (!actx) return;
            offAt = actx.currentTime - startAt;
            stopSrc();
            playing = false;
            playBtn.textContent = '▶ ' + t('mu.play');
            cancelAnimationFrame(raf);
          }
          function next() { if (tracks.length) play((cur + 1) % tracks.length); }
          function prev() {
            if (!tracks.length) return;
            if (actx && playing && (actx.currentTime - startAt) > 3) play(cur);
            else play((cur - 1 + tracks.length) % tracks.length);
          }
          const posNow = () => (playing && actx ? Math.min(tracks[cur].dur, actx.currentTime - startAt) : (cur >= 0 ? Math.min(tracks[cur].dur, offAt) : 0));
          function tick() {
            if (!playing) return;
            const p = posNow(), d = tracks[cur] ? tracks[cur].dur : 0;
            seek.value = d ? ((p / d) * 100).toFixed(1) : 0;
            timeEl.textContent = fmtT(p) + ' / ' + fmtT(d);
            const nowMs = Date.now();
            bars.forEach((b2, i2) => {
              b2.style.height = (2 + Math.abs(Math.sin(nowMs / 170 + i2 * 0.7)) * 14).toFixed(1) + 'px';
            });
            raf = requestAnimationFrame(tick);
          }
          playBtn.addEventListener('click', () => {
            if (!tracks.length) { addDemo(); if (!tracks.length) return; if (!hasAudio) return; play(0); return; }
            if (playing) pause();
            else { if (cur < 0) play(0); else { startSrc(); tick(); } }
          });
          box.querySelector('[data-next]').addEventListener('click', next);
          box.querySelector('[data-prev]').addEventListener('click', prev);
          volEl.addEventListener('input', () => { if (gain) gain.gain.value = parseFloat(volEl.value); });
          seek.addEventListener('change', () => {
            if (cur < 0 || !tracks[cur]) return;
            const d = tracks[cur].dur;
            const wasPlaying = playing && !!actx;
            offAt = (parseFloat(seek.value) / 100) * d;
            if (wasPlaying) { stopSrc(); startSrc(); }
            else { timeEl.textContent = fmtT(offAt) + ' / ' + fmtT(d); seek.value = ((offAt / d) * 100).toFixed(1); }
          });

          /* --- demo tracks: pure-JS synthesis (no assets, no network) --- */
          function mkTrack(name, dur, gen) {
            const sr = 22050, n = Math.floor(sr * dur);
            const f = new Float32Array(n);
            for (let i = 0; i < n; i++) f[i] = gen(i / sr);
            let peak = 0;
            for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(f[i]));
            const g = peak ? 0.82 / peak : 0;
            for (let i = 0; i < n; i++) f[i] *= g;
            const fade = (t2) => Math.min(1, t2 / 0.8, (dur - t2) / 1.2);
            for (let i = 0; i < n; i++) f[i] *= Math.max(0, fade(i / sr));
            return { id: Date.now() + Math.floor(Math.random() * 1e4), name, demo: true, sr, dur, samples: f, buffer: null };
          }
          const TAU = Math.PI * 2;
          function addDemo() {
            if (tracks.some((x) => x.demo)) return;
            tracks.push(mkTrack('Nebula Drift', 12, (t2) => {
              const o = (Math.sin(TAU * 110 * t2) * 0.5 + Math.sin(TAU * 220 * t2 + 1.3) * 0.24 + Math.sin(TAU * 327.5 * t2) * 0.12) *
                (0.62 + 0.38 * Math.sin(TAU * 0.17 * t2));
              return o;
            }));
            tracks.push(mkTrack('Orbit Pulse', 8, (t2) => {
              const p = t2 % 0.5;
              const kick = Math.sin(TAU * 48 * p + 2.6 * Math.sin(TAU * 28 * p)) * Math.exp(-8.5 * p);
              const bassNotes = [55, 65.41, 49, 58.27];
              const bn = bassNotes[Math.floor(t2 / 2) % bassNotes.length];
              const bass = Math.sin(TAU * bn * t2) * 0.16;
              const hat = (Math.random() * 2 - 1) * 0.05 * Math.exp(-38 * (t2 % 0.25));
              return kick * 0.9 + bass + hat;
            }));
            tracks.push(mkTrack('Starfall Arp', 10, (t2) => {
              const seq = [0, 4, 7, 12, 7, 4, 2, 9];
              const step = Math.floor(t2 / 0.125);
              const st = t2 % 0.125;
              const freq = 220 * Math.pow(2, seq[step % seq.length] / 12);
              return Math.sin(TAU * freq * t2) * Math.exp(-7 * st) * 0.9 + Math.sin(TAU * freq / 2 * t2) * Math.exp(-7 * st) * 0.25;
            }));
            renderList();
          }
          box.querySelector('[data-demo]').addEventListener('click', addDemo);

          const pick = box.querySelector('[data-pick]');
          box.querySelector('[data-add]').addEventListener('click', () => pick.click());
          pick.addEventListener('change', async () => {
            const files = Array.from(pick.files || []);
            pick.value = '';
            if (!files.length) return;
            const c = ensureCtx();
            if (!c) { warnEl.classList.remove('hidden'); return; }
            let added = 0;
            for (const f of files) {
              try {
                const ab = await f.arrayBuffer();
                const buf = await c.decodeAudioData(ab);
                tracks.push({ id: Date.now() + Math.floor(Math.random() * 1e4), name: (f.name || 'track').replace(/\.[^.]+$/, ''), demo: false, sr: buf.sampleRate, dur: buf.duration, samples: null, buffer: buf });
                added++;
              } catch (e) { /* undecodable — skip */ }
            }
            if (added) {
              Audit.log('music.import', added + ' tracks');
              notify('🎵', t('mu.added').replace('%d', added));
              renderList();
              if (cur < 0) play(0);
            } else {
              notify('⚠️', t('mu.decErr'));
            }
          });

          renderList();
          winW.onClose = () => {
            cancelAnimationFrame(raf);
            stopSrc();
            if (actx) { try { actx.close(); } catch (e) {} }
          };
        }
      });
    }
  });

  /* ============================================================
     BACKUP — one-file data portability (JSON bundle)
     ============================================================ */
  registerApp({
    id: 'backup',
    title: 'Backup',
    titleKey: 'app.backup',
    icon: '🧳',
    tile: 'linear-gradient(135deg,#10b981,#0ea5e9)',
    open() {
      createWindow({
        id: 'backup',
        appId: 'backup',
        title: t('app.backup'),
        icon: '🧳',
        width: 640,
        height: 500,
        content(winW) {
          const box = $el('div', 'backup');
          box.innerHTML =
            '<div class="bk-body"></div>' +
            '<input type="file" hidden data-pick accept=".json,application/json">';
          winW.body.appendChild(box);
          const body = box.querySelector('.bk-body');
          const pick = box.querySelector('[data-pick]');

          const CAT_ICONS = { fs: '📁', notes: '📝', contacts: '👥', settings: '⚙️', audit: '📜', android: '🤖', desktop: '🖥️', backup: '🧳' };
          function collect() {
            const entries = {};
            let bytes = 0, keys = 0;
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k.indexOf('nebula.') === 0) {
                const v = localStorage.getItem(k) || '';
                entries[k] = v;
                bytes += v.length + k.length;
                keys++;
              }
            }
            return { entries, bytes, keys };
          }
          function render() {
            const { entries, keys } = collect();
            const cats = {};
            Object.keys(entries).forEach((k) => {
              const ns = k.replace(/^nebula\./, '').split('.')[0];
              cats[ns] = (cats[ns] || 0) + 1;
            });
            const last = localStorage.getItem('nebula.backup.last');
            body.innerHTML =
              '<div class="bk-summary">' +
                '<div class="bk-big">' + keys + '</div>' +
                '<div class="bk-sub">' + esc(t('bk.last')) + ' · ' + (last ? new Date(parseInt(last, 10)).toLocaleString() : esc(t('bk.never'))) + '</div>' +
              '</div>' +
              '<div class="bk-cats">' + Object.keys(cats).map((ns) =>
                '<span class="bk-cat">' + (CAT_ICONS[ns] || '📦') + ' ' + esc(ns) + ' <b>' + cats[ns] + '</b></span>').join('') + '</div>' +
              '<div class="bk-note">' + esc(t('bk.note')) + '</div>' +
              '<div class="bk-actions">' +
                '<button class="btn" data-export>💾 ' + esc(t('bk.export')) + '</button>' +
                '<button class="btn ghost" data-restore>⬆ ' + esc(t('bk.restore')) + '</button>' +
              '</div>';
          }
          box.addEventListener('click', (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.hasAttribute('data-export')) doExport();
            else if (b.hasAttribute('data-restore')) pick.click();
          });
          function doExport() {
            const { entries, keys } = collect();
            const bundle = { app: 'nebula-os', kind: 'backup', version: OS.version, ts: Date.now(), count: keys, entries };
            const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'nebula-backup-' + new Date().toISOString().slice(0, 10) + '.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
            localStorage.setItem('nebula.backup.last', String(bundle.ts));
            Audit.log('backup.created', keys + ' keys · v' + OS.version);
            notify('💾', t('bk.created'), a.download);
            render();
          }
          pick.addEventListener('change', async () => {
            const f = pick.files && pick.files[0];
            pick.value = '';
            if (!f) return;
            let b;
            try {
              const raw = await readFileText(f);
              b = JSON.parse(raw);
            } catch (e) {
              notify('⚠️', t('bk.bad'), f.name);
              return;
            }
            if (!b || b.app !== 'nebula-os' || b.kind !== 'backup' || !b.entries || typeof b.entries !== 'object') {
              notify('⚠️', t('bk.bad'), f.name);
              return;
            }
            confirmDialog(t('bk.restore'), t('bk.note'), t('bk.restore')).then((ok2) => {
              if (!ok2) return;
              Object.keys(b.entries).forEach((k) => {
                if (k.indexOf('nebula.') === 0) localStorage.setItem(k, String(b.entries[k]));
              });
              Audit.log('backup.restored', b.count + ' keys from ' + f.name);
              notify('⬆️', t('bk.restored'), f.name);
              setTimeout(() => location.reload(), 500);
            });
          });
          render();
        }
      });
    }
  });


  /* ============================================================
     TASKS — local task manager (due dates · priorities)
     ============================================================ */
  const TASK_KEY = 'nebula.tasks.v1';
  registerApp({
    id: 'tasks',
    title: 'Tasks',
    titleKey: 'app.tasks',
    icon: '✅',
    tile: 'linear-gradient(135deg,#22c55e,#10b981)',
    open() {
      createWindow({
        id: 'tasks',
        appId: 'tasks',
        title: t('app.tasks'),
        icon: '✅',
        width: 700,
        height: 500,
        content(winW) {
          const box = $el('div', 'tasks');
          box.innerHTML =
            '<div class="tk-form">' +
              '<input class="tk-text" placeholder="' + esc(t('tk.add')) + '" aria-label="' + esc(t('tk.add')) + '">' +
              '<input type="date" class="tk-due" title="' + esc(t('tk.due')) + '" aria-label="' + esc(t('tk.due')) + '">' +
              '<select class="tk-prio" title="' + esc(t('tk.prio')) + '" aria-label="' + esc(t('tk.prio')) + '">' +
                '<option value="0">' + esc(t('tk.p0')) + '</option>' +
                '<option value="1" selected>' + esc(t('tk.p1')) + '</option>' +
                '<option value="2">' + esc(t('tk.p2')) + '</option>' +
              '</select>' +
              '<button class="btn sm" data-add>＋</button>' +
            '</div>' +
            '<div class="tk-filters">' +
              ['tk.fAll', 'tk.fToday', 'tk.fOverdue', 'tk.fDone'].map((k, i) =>
                '<button class="tk-f' + (i === 0 ? ' on' : '') + '" data-f="' + i + '">' + esc(t(k)) + '</button>').join('') +
            '</div>' +
            '<div class="tk-list"></div>' +
            '<div class="tk-foot"><span class="tk-count"></span><span class="spacer"></span>' +
              '<button class="btn ghost sm" data-cleardone>' + esc(t('tk.clearDone')) + '</button></div>';
          winW.body.appendChild(box);

          const listEl = box.querySelector('.tk-list');
          const textEl = box.querySelector('.tk-text'), dueEl = box.querySelector('.tk-due'), prioEl = box.querySelector('.tk-prio');
          const countEl = box.querySelector('.tk-count');
          let filter = 0;
          let tasks = [];
          try { tasks = JSON.parse(localStorage.getItem(TASK_KEY) || '[]'); } catch (e) { tasks = []; }
          const save = () => { try { localStorage.setItem(TASK_KEY, JSON.stringify(tasks)); } catch (e) {} };
          const todayStr = () => {
            const d = new Date();
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
          };
          const PRIO = ['#8a93a6', '#3b82f6', '#f87171'];

          function visible() {
            const t0 = todayStr();
            let v = tasks.slice();
            if (filter === 1) v = v.filter((x) => !x.done && x.due === t0);
            else if (filter === 2) v = v.filter((x) => !x.done && x.due && x.due < t0);
            else if (filter === 3) v = v.filter((x) => x.done);
            v.sort((a, b) => (a.done - b.done) || ((a.due || '9999') < (b.due || '9999') ? -1 : 1) || (b.prio - a.prio));
            return v;
          }
          function render() {
            const v = visible();
            listEl.innerHTML = '';
            if (!v.length) listEl.appendChild($el('div', 'fm-empty', esc(t('tk.empty'))));
            v.forEach((x) => {
              const t0 = todayStr();
              const overdue = !x.done && x.due && x.due < t0;
              const row = $el('div', 'tk-item' + (x.done ? ' done' : ''));
              row.innerHTML =
                '<button class="tk-check' + (x.done ? ' on' : '') + '" aria-label="toggle task">' + (x.done ? '✓' : '') + '</button>' +
                '<span class="tk-px" style="background:' + PRIO[x.prio] + '"></span>' +
                '<b class="tk-txt">' + esc(x.text) + '</b>' +
                (x.due ? '<span class="tk-duec' + (overdue ? ' late' : '') + '">📅 ' + esc(x.due) + (overdue ? ' ⚠' : '') + '</span>' : '') +
                '<button class="tk-x" aria-label="delete task">✕</button>';
              row.querySelector('.tk-check').addEventListener('click', () => { x.done = !x.done; x.updated = Date.now(); save(); render(); });
              row.querySelector('.tk-x').addEventListener('click', () => { tasks = tasks.filter((y) => y.id !== x.id); save(); render(); });
              listEl.appendChild(row);
            });
            const openN = tasks.filter((x) => !x.done).length;
            countEl.textContent = t('tk.open').replace('%d', openN);
          }
          function add() {
            const text = textEl.value.trim();
            if (!text) return;
            tasks.unshift({ id: Date.now() + Math.floor(Math.random() * 1e4), text, due: dueEl.value || '', prio: parseInt(prioEl.value, 10), done: false, created: Date.now(), updated: Date.now() });
            textEl.value = ''; dueEl.value = ''; prioEl.value = '1';
            save(); render();
          }
          box.querySelector('[data-add]').addEventListener('click', add);
          textEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
          box.querySelectorAll('.tk-f').forEach((b) => b.addEventListener('click', () => {
            filter = parseInt(b.dataset.f, 10);
            box.querySelectorAll('.tk-f').forEach((x) => x.classList.toggle('on', x === b));
            render();
          }));
          box.querySelector('[data-cleardone]').addEventListener('click', () => {
            if (!tasks.some((x) => x.done)) return;
            tasks = tasks.filter((x) => !x.done);
            save(); render();
          });
          winW.hooks.focus = () => textEl.focus({ preventScroll: true });
          render();
        }
      });
    }
  });

  /* ============================================================
     BUDGET — local income/expense ledger (monthly net)
     ============================================================ */
  const BG_KEY = 'nebula.budget.v1';
  registerApp({
    id: 'budget',
    title: 'Budget',
    titleKey: 'app.budget',
    icon: '💰',
    tile: 'linear-gradient(135deg,#fbbf24,#f59e0b)',
    open() {
      createWindow({
        id: 'budget',
        appId: 'budget',
        title: t('app.budget'),
        icon: '💰',
        width: 760,
        height: 520,
        content(winW) {
          const box = $el('div', 'budget');
          const cats = t('bg.cats').split('|');
          const d = new Date();
          const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
          box.innerHTML =
            '<div class="bg-cards">' +
              '<div class="bg-card in"><span>' + esc(t('bg.income')) + '</span><b data-v="in">0.00</b></div>' +
              '<div class="bg-card out"><span>' + esc(t('bg.expense')) + '</span><b data-v="out">0.00</b></div>' +
              '<div class="bg-card net"><span>' + esc(t('bg.net')) + '</span><b data-v="net">0.00</b></div>' +
            '</div>' +
            '<div class="bg-form">' +
              '<input class="bg-amt" type="number" min="0" step="0.01" placeholder="' + esc(t('bg.amount')) + '" aria-label="' + esc(t('bg.amount')) + '">' +
              '<div class="seg">' +
                '<button data-bt="out">' + esc(t('bg.typeOut')) + '</button>' +
                '<button data-bt="in">' + esc(t('bg.typeIn')) + '</button>' +
              '</div>' +
              '<select class="bg-cat" aria-label="' + esc(t('bg.cat')) + '">' + cats.map((c) => '<option>' + esc(c) + '</option>').join('') + '</select>' +
              '<input type="date" class="bg-date" value="' + today + '" aria-label="' + esc(t('bg.date')) + '">' +
              '<input class="bg-desc" placeholder="' + esc(t('bg.desc')) + '" aria-label="' + esc(t('bg.desc')) + '">' +
              '<button class="btn sm" data-add>' + esc(t('bg.add')) + '</button>' +
            '</div>' +
            '<div class="bg-listhead"><span class="spacer"></span>' +
              '<button class="btn ghost sm" data-csvexp>🧾 ' + esc(t('bg.export')) + '</button>' +
              '<button class="btn ghost sm" data-csvimp>⬆ ' + esc(t('bg.import')) + '</button>' +
              '<input type="file" hidden data-csvpick accept=".csv,text/csv">' +
            '</div>' +
            '<div class="bg-list"></div>';
          winW.body.appendChild(box);

          let type = 'out';
          box.querySelectorAll('[data-bt]').forEach((b) => {
            b.classList.toggle('on', b.dataset.bt === type);
            b.addEventListener('click', () => {
              type = b.dataset.bt;
              box.querySelectorAll('[data-bt]').forEach((x) => x.classList.toggle('on', x === b));
            });
          });
          let items = [];
          try { items = JSON.parse(localStorage.getItem(BG_KEY) || '[]'); } catch (e) { items = []; }
          const save = () => { try { localStorage.setItem(BG_KEY, JSON.stringify(items)); } catch (e) {} };
          const money = (n) => Math.abs(n).toFixed(2);
          const nowM = today.slice(0, 7);

          function render() {
            let inM = 0, outM = 0;
            items.forEach((x) => {
              if ((x.date || '').slice(0, 7) === nowM) {
                if (x.type === 'in') inM += x.amt; else outM += x.amt;
              }
            });
            box.querySelector('[data-v="in"]').textContent = money(inM);
            box.querySelector('[data-v="out"]').textContent = money(outM);
            const net = inM - outM;
            const netEl = box.querySelector('[data-v="net"]');
            netEl.textContent = (net < 0 ? '−' : '') + money(net);
            netEl.parentElement.classList.toggle('neg', net < 0);
            const listEl = box.querySelector('.bg-list');
            listEl.innerHTML = '';
            if (!items.length) listEl.appendChild($el('div', 'fm-empty', esc(t('bg.empty'))));
            items.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).forEach((x) => {
              const row = $el('div', 'bg-row');
              row.innerHTML =
                '<span class="bg-when">' + esc(x.date) + '</span>' +
                '<span class="bg-chip">' + esc(x.cat) + '</span>' +
                '<b class="bg-txt">' + esc(x.desc || (x.type === 'in' ? t('bg.typeIn') : t('bg.typeOut'))) + '</b>' +
                '<b class="bg-amtv ' + x.type + '">' + (x.type === 'in' ? '+' : '−') + money(x.amt) + '</b>' +
                '<button class="bg-x" aria-label="delete transaction">✕</button>';
              row.querySelector('.bg-x').addEventListener('click', () => { items = items.filter((y) => y.id !== x.id); save(); render(); });
              listEl.appendChild(row);
            });
          }
          box.querySelector('[data-csvexp]').addEventListener('click', () => {
            if (!items.length) { notify('⚠️', t('bg.empty')); return; }
            const csv = 'type,amount,category,date,description\n' + items.map((x) =>
              [x.type, x.amt, x.cat, x.date, x.desc || ''].map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
            const a = document.createElement('a');
            a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
            a.download = 'nebula-budget.csv';
            document.body.appendChild(a); a.click(); a.remove();
            Audit.log('budget.export', items.length + ' rows');
            notify('🧾', t('bg.export'), items.length + '');
          });
          const csvPick = box.querySelector('[data-csvpick]');
          box.querySelector('[data-csvimp]').addEventListener('click', () => csvPick.click());
          csvPick.addEventListener('change', async () => {
            const f = csvPick.files && csvPick.files[0];
            csvPick.value = '';
            if (!f) return;
            try {
              const text = await readFileText(f);
              const rows = text.trim().split(/\r?\n/);
              if (!rows.length) throw new Error('empty');
              const start = rows[0].toLowerCase().includes('type') ? 1 : 0;
              let added = 0;
              for (let i = start; i < rows.length; i++) {
                const cells = (rows[i].match(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g) || []).map((c) =>
                  c.replace(/,$/, '').replace(/^"(.*)"$/, '$1').replace(/""/g, '"').trim());
                if (!cells.length || !cells[0]) continue;
                const type = cells[0];
                const amt = parseFloat(cells[1]);
                if ((type !== 'in' && type !== 'out') || !(amt > 0)) continue;
                items.unshift({ id: Date.now() + i * 31 + Math.floor(Math.random() * 1e3), type, amt: Math.round(amt * 100) / 100, cat: cells[2] || '—', desc: cells[4] || '', date: cells[3] || today });
                added++;
              }
              if (!added) throw new Error('none');
              save(); render();
              Audit.log('budget.import', added + ' rows from ' + f.name);
              notify('⬆️', t('bg.import'), t('bg.imported').replace('%d', added));
            } catch (e) {
              notify('⚠️', t('bg.importErr'), f.name);
            }
          });
          box.querySelector('[data-add]').addEventListener('click', () => {
            const amt = parseFloat(box.querySelector('.bg-amt').value);
            if (!(amt > 0)) { notify('⚠️', t('bg.needAmt')); return; }
            items.unshift({
              id: Date.now() + Math.floor(Math.random() * 1e4),
              type, amt: Math.round(amt * 100) / 100,
              cat: box.querySelector('.bg-cat').value,
              desc: box.querySelector('.bg-desc').value.trim(),
              date: box.querySelector('.bg-date').value || today
            });
            box.querySelector('.bg-amt').value = '';
            box.querySelector('.bg-desc').value = '';
            save(); render();
          });
          render();
        }
      });
    }
  });

  /* ---------- public ---------- */
  window.Nebula = { OS, APPS, FS, I18N, openApp, WALLPAPERS, GITHUB_URL, TEXT_EXTS };
})();
