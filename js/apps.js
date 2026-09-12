/* ============================================================
   NEBULA OS — applications v1.1
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
    return '📄';
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
                print('Nebula 1.1.0 nebula-es2022 (JavaScript) ' + (navigator.platform || 'web') + ' x86_64 web', s.out);
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
                if (arg === 'dark' || arg === 'light') {
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
                '<button class="btn ghost sm" data-act="new">＋ ' + esc(t('common.create')) + '</button>' +
                '<button class="btn ghost sm" data-act="del">🗑 ' + esc(t('common.delete')) + '</button>' +
              '</div>' +
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
              '<textarea class="notes-body" placeholder="Start typing… everything autosaves." spellcheck="false"></textarea>' +
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
            '<div class="cal-grid"></div>';
          win.body.appendChild(root);
          const titleEl = root.querySelector('.cal-title');
          const grid = root.querySelector('.cal-grid');

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
                    (s.pin ? '<button data-pin="clear">' + esc(t('set.pinClear')) + '</button>' : '') +
                  '</div></div>' +
                '<div class="set-row"><div><div class="lbl">' + esc(t('set.idle')) + '</div><div class="sub">' + esc(t('set.idleSub')) + '</div></div>' +
                  '<div style="display:flex;gap:8px;align-items:center">' +
                    '<select class="set-select" data-idlemin>' +
                      [1, 3, 5, 10].map((n) => '<option value="' + n + '"' + (n === s.idleMinutes ? ' selected' : '') + '>' + n + ' min</option>').join('') +
                    '</select>' +
                    '<input type="checkbox" class="check" data-key="idleLock">' +
                  '</div></div>' +
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
                        s.pin = v; OS.saveSettings();
                        notify('🔒', 'PIN set', t('set.pin'));
                      } else notify('⚠️', 'Invalid PIN', 'PIN must be exactly 4 digits.');
                      rebuild();
                    });
                } else {
                  confirmDialog(t('set.pinClear'), t('set.pinSub'), t('set.pinClear')).then((ok) => {
                    if (ok) { s.pin = ''; OS.saveSettings(); notify('🔓', 'PIN cleared'); }
                    rebuild();
                  });
                }
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
              '<div><span>Shortcuts</span><b>Alt+Tab switcher · Alt+L lock</b></div>' +
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

  /* ---------- public ---------- */
  window.Nebula = { OS, APPS, FS, I18N, openApp, WALLPAPERS, GITHUB_URL, TEXT_EXTS };
})();
