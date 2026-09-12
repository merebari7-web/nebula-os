/* ============================================================
   NEBULA OS — applications
   terminal · files · notes · paint · beat deck · browser
   monitor · calendar · settings · about
   ============================================================ */
(function () {
  'use strict';

  const FS = window.NebulaFS.fs;
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

  /* ============================================================
     TERMINAL
     ============================================================ */
  registerApp({
    id: 'terminal',
    title: 'Terminal',
    icon: '⬛',
    open() {
      createWindow({
        id: 'terminal',
        title: 'Terminal',
        icon: '⬛',
        width: 660,
        height: 410,
        content(win) {
          const term = $el('div', 'terminal');
          term.innerHTML =
            '<div class="term-out"></div>' +
            '<div class="term-line"><span class="term-prompt"></span>' +
            '<input class="term-input" spellcheck="false" autocomplete="off" aria-label="terminal input"></div>';
          win.body.appendChild(term);

          const out = term.querySelector('.term-out');
          const input = term.querySelector('.term-input');
          const promptEl = term.querySelector('.term-prompt');
          let cwd = '/home/guest';
          const hist = [];
          let hi = 0;

          const P = () => 'guest@nebula:' + esc(shortHome(cwd)) + '$';
          const setPrompt = () => { promptEl.textContent = P(); };
          const print = (html, cls) => {
            const d = $el('div', cls || '');
            d.innerHTML = html;
            out.appendChild(d);
            out.scrollTop = out.scrollHeight;
          };

          win.hooks.focus = () => input.focus({ preventScroll: true });
          win.hooks.blur = () => input.blur();

          function neofetch() {
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
              ['Shell', 'nterm 1.0'],
              ['Resolution', innerWidth + '×' + (innerHeight - TASKBAR_H)],
              ['Theme', 'nebula-' + OS.settings.theme],
              ['Accent', OS.settings.accent]
            ];
            const body = rows.map(([k, v]) =>
              '<span class="tnf-k">' + esc(k) + ':</span> ' + esc(v)).join('\n');
            return '<pre class="neofetch">' + esc(logo) + '\n\n' + body + '</pre>';
          }

          function run(raw) {
            const line = raw.trim();
            print('<span class="tp">' + esc(P()) + '</span> ' + esc(line));
            if (!line) return;
            hist.push(line);
            hi = hist.length;
            const sp = line.indexOf(' ');
            const cmd = sp === -1 ? line : line.slice(0, sp);
            const arg = sp === -1 ? '' : line.slice(sp + 1).trim();

            switch (cmd) {
              case 'help':
                print('Available commands:\n' +
                  '  help          show this list\n' +
                  '  ls            list directory\n' +
                  '  cd &lt;dir&gt;       change directory\n' +
                  '  cat &lt;file&gt;     print a file\n' +
                  '  echo &lt;text&gt;     print text\n' +
                  '  pwd           print working directory\n' +
                  '  mkdir / rm / touch\n' +
                  '  date · whoami · history · clear\n' +
                  '  wallpaper     cycle the wallpaper\n' +
                  '  open &lt;app&gt;    launch an app (e.g. open beat-deck)\n' +
                  '  neofetch      system info, the classic way');
                break;
              case 'ls': {
                const list = FS.list(cwd);
                if (list === null) print('ls: ' + esc(cwd) + ': not a directory', 'ter');
                else if (!list.length) print('(empty)', 'tdim');
                else print(list.map((n) =>
                  '<span class="' + (n.type === 'dir' ? 'tdir' : 'tfile') + '">' +
                  esc(n.name) + (n.type === 'dir' ? '/' : '') + '</span>').join('   '));
                break;
              }
              case 'cd': {
                if (!arg) cwd = '/home/guest';
                else if (arg === '..') cwd = cwd === '/' ? '/' : cwd.slice(0, cwd.lastIndexOf('/') || 1);
                else cwd = resolvePath(cwd, arg);
                const n = FS.nodeAt(cwd);
                if (n && n.type === 'dir') setPrompt();
                else print('cd: no such directory: ' + esc(arg), 'ter');
                break;
              }
              case 'pwd': print(cwd); break;
              case 'cat': {
                const n = FS.nodeAt(resolvePath(cwd, arg));
                if (n && n.type === 'file') print(esc(n.content) || '(empty file)');
                else print('cat: ' + esc(arg || '') + ': no such file', 'ter');
                break;
              }
              case 'echo': print(esc(arg)); break;
              case 'date': print(new Date().toString()); break;
              case 'whoami': print('guest'); break;
              case 'clear': out.innerHTML = ''; break;
              case 'history':
                print(hist.map((h, i) => '  ' + (i + 1) + '  ' + esc(h)).join('\n') || '(empty)');
                break;
              case 'mkdir': {
                const p = resolvePath(cwd, arg);
                if (!arg) print('mkdir: missing operand', 'ter');
                else if (FS.nodeAt(p)) print(p + ': already exists', 'twarn');
                else FS.mkdir(p);
                break;
              }
              case 'touch': {
                const p = resolvePath(cwd, arg);
                if (!arg) print('touch: missing operand', 'ter');
                else if (FS.nodeAt(p)) print(p + ': exists', 'twarn');
                else FS.createFile(p, '');
                break;
              }
              case 'rm': {
                if (/^-rf/.test(arg) || arg.includes(' -rf ') || arg === '/') {
                  print('Nice try. This is a demo — the universe is indestructible. 😄', 'twarn');
                  break;
                }
                const p = resolvePath(cwd, arg);
                if (FS.rm(p)) print('removed ' + esc(arg), 'tok');
                else print('rm: ' + esc(arg) + ': no such file', 'ter');
                break;
              }
              case 'wallpaper': cycleWallpaper(); break;
              case 'open': {
                const id = arg.split(' ')[0];
                if (APPS[id]) openApp(id);
                else print("open: unknown app '" + esc(arg) + "'. Available: " + Object.keys(APPS).join(', '), 'twarn');
                break;
              }
              case 'neofetch': print(neofetch()); break;
              case 'sudo':
                print('guest is not in the sudoers file.\nThis incident will be reported. 🚨', 'twarn');
                break;
              case 'about':
                print('Nebula OS ' + OS.version + ' — a tiny operating system that lives in your browser.\nVanilla JavaScript. Zero dependencies. 100% in-tab.');
                break;
              default:
                print('command not found: ' + esc(cmd) + " — try 'help'", 'ter');
            }
          }

          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              const v = input.value;
              input.value = '';
              run(v);
            } else if (e.key === 'ArrowUp') {
              if (hi > 0) { hi--; input.value = hist[hi] || ''; e.preventDefault(); }
            } else if (e.key === 'ArrowDown') {
              if (hi < hist.length) { hi++; input.value = hist[hi] || ''; e.preventDefault(); }
            }
          });

          setPrompt();
          print('Nebula OS ' + OS.version + ' — nterm 1.0', 'tdim');
          print("Type 'help' to list commands, or 'neofetch' because why not.\n");
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
    icon: '📁',
    open() {
      createWindow({
        id: 'files',
        title: 'Files',
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
                '<button class="btn ghost sm" data-act="new">＋ Folder</button>' +
                '<button class="btn ghost sm" data-act="del">🗑 Delete</button>' +
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
                else {
                  const node = FS.nodeAt(p);
                  if (TEXT_EXTS.test(n.name)) openApp('notes', { name: n.name, content: node ? node.content : '' });
                  else notify('📄', n.name, 'No viewer installed for this file type. (It\'s a demo filesystem anyway.)');
                }
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
              title: 'New folder',
              message: 'Create a folder in ' + cwd,
              placeholder: 'Folder name',
              value: 'New Folder',
              okLabel: 'Create'
            }).then((v) => {
              if (!v || !v.trim()) return;
              const p = (cwd === '/' ? '/' : cwd + '/') + v.trim();
              if (FS.nodeAt(p)) notify('⚠️', 'Already exists', '“' + v.trim() + '” is already in this folder.');
              else { FS.mkdir(p); render(); }
            });
          });
          root.querySelector('[data-act="del"]').addEventListener('click', () => {
            if (!selected) { notify('⚠️', 'Nothing selected', 'Click an item first.'); return; }
            confirmDialog('Delete ' + selected + '?', 'It will be removed from the demo filesystem. No backups, no undo.', 'Delete').then((ok) => {
              if (ok) { FS.rm((cwd === '/' ? '/' : cwd + '/') + selected); selected = null; render(); }
            });
          });

          render();
          win.hooks.focus = () => {};
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
    icon: '📝',
    open(args) {
      const existing = OS.windows.get('notes');
      if (existing) {
        if (existing.hooks.consume) existing.hooks.consume(args);
        focusWindow(existing);
        return;
      }
      createWindow({
        id: 'notes',
        title: 'Notes',
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

          function selectNote(n) {
            current = n;
            syncFromCurrent();
            renderList();
          }

          function makeNew() {
            const n = { id: Date.now() + Math.floor(Math.random() * 1e4), title: '', content: '', updated: Date.now() };
            notes.unshift(n);
            current = n;
            save();
            renderList();
            syncFromCurrent();
            titleEl.focus();
          }

          function consume(a) {
            if (!a) return;
            if (a.fresh) { makeNew(); return; }
            const n = { id: Date.now() + Math.floor(Math.random() * 1e4), title: a.name || 'Untitled', content: a.content || '', updated: Date.now() };
            notes.unshift(n);
            current = n;
            save();
            renderList();
            syncFromCurrent();
          }

          titleEl.addEventListener('input', () => {
            if (!current) return;
            current.title = titleEl.value;
            current.updated = Date.now();
            save(); renderList();
          });
          bodyEl.addEventListener('input', () => {
            if (!current) return;
            current.content = bodyEl.value;
            current.updated = Date.now();
            save(); renderList();
          });
          root.querySelector('[data-new]').addEventListener('click', makeNew);

          win.hooks.consume = consume;
          win.hooks.focus = () => bodyEl.focus({ preventScroll: true });
          win.hooks.blur = () => bodyEl.blur();

          if (args) consume(args);
          if (!current) {
            if (notes.length) selectNote(notes[0]);
            else makeNew();
          }
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
    icon: '🎨',
    open() {
      createWindow({
        id: 'paint',
        title: 'Paint',
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
          let tool = 'brush';
          let drawing = false;
          let last = null;

          size.addEventListener('input', () => { sizeLabel.textContent = size.value + ' px'; });
          root.querySelectorAll('[data-t]').forEach((b) => {
            b.addEventListener('click', () => {
              tool = b.dataset.t;
              root.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('active', x === b));
            });
          });

          function paintBg() {
            ctx.fillStyle = PAINT_BG;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          function resize() {
            const w = wrapEl.clientWidth, h = wrapEl.clientHeight;
            if (!w || !h) return;
            const t = document.createElement('canvas');
            t.width = canvas.width; t.height = canvas.height;
            if (canvas.width && canvas.height) t.getContext('2d').drawImage(canvas, 0, 0);
            canvas.width = w; canvas.height = h;
            paintBg();
            if (t.width) ctx.drawImage(t, 0, 0);
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
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = s;
            ctx.strokeStyle = ctx.fillStyle = tool === 'eraser' ? PAINT_BG : color.value;
          }
          canvas.addEventListener('pointerdown', (e) => {
            drawing = true;
            last = pos(e);
            strokeStyle();
            ctx.beginPath();
            ctx.arc(last.x, last.y, ctx.lineWidth / 2, 0, Math.PI * 2);
            ctx.fill();
            canvas.setPointerCapture(e.pointerId);
          });
          canvas.addEventListener('pointermove', (e) => {
            if (!drawing) return;
            const p = pos(e);
            strokeStyle();
            ctx.beginPath();
            ctx.moveTo(last.x, last.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
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
     BEAT DECK — a 16-step web-audio sequencer
     ============================================================ */
  registerApp({
    id: 'beats',
    title: 'Beat Deck',
    icon: '🎛️',
    open() {
      createWindow({
        id: 'beats',
        title: 'Beat Deck',
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
          for (let s = 0; s < STEPS; s++) {
            grid.appendChild($el('div', 'beats-stepnum' + (s % 4 === 0 ? ' acc' : ''), String(s + 1)));
          }
          const cells = TRACKS.map(() => []);
          TRACKS.forEach((tr, ti) => {
            const label = $el('div', 'beats-tlabel',
              '<span style="color:' + tr.color + '">' + tr.icon + '</span>' + tr.name);
            grid.appendChild(label);
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

          /* --- web audio engine --- */
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
          function env(g, t, peak, decay) {
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.004);
            g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
          }
          function kick(t) {
            const o = actx.createOscillator(), g = actx.createGain();
            o.frequency.setValueAtTime(150, t);
            o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
            env(g, t, 0.9, 0.24);
            o.connect(g); g.connect(master);
            o.start(t); o.stop(t + 0.3);
          }
          function snare(t) {
            const s = actx.createBufferSource(); s.buffer = noiseBuf;
            const f = actx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
            const g = actx.createGain(); env(g, t, 0.5, 0.16);
            s.connect(f); f.connect(g); g.connect(master);
            s.start(t); s.stop(t + 0.2);
            const o = actx.createOscillator(), g2 = actx.createGain();
            o.frequency.value = 190; env(g2, t, 0.25, 0.08);
            o.connect(g2); g2.connect(master);
            o.start(t); o.stop(t + 0.1);
          }
          function hat(t) {
            const s = actx.createBufferSource(); s.buffer = noiseBuf;
            const f = actx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
            const g = actx.createGain(); env(g, t, 0.22, 0.05);
            s.connect(f); f.connect(g); g.connect(master);
            s.start(t); s.stop(t + 0.08);
          }
          function bass(t, sIdx) {
            const o = actx.createOscillator(); o.type = 'sawtooth';
            o.frequency.value = midi2f(BASSLINE[sIdx % STEPS]);
            const f = actx.createBiquadFilter(); f.type = 'lowpass';
            f.frequency.setValueAtTime(900, t);
            f.frequency.exponentialRampToValueAtTime(180, t + 0.18);
            const g = actx.createGain(); env(g, t, 0.3, 0.2);
            o.connect(f); f.connect(g); g.connect(master);
            o.start(t); o.stop(t + 0.26);
          }
          function scheduleStep(i, t) {
            if (pat[0][i]) kick(t);
            if (pat[1][i]) snare(t);
            if (pat[2][i]) hat(t);
            if (pat[3][i]) bass(t, i);
          }
          function tick() {
            while (nextT < actx.currentTime + 0.12) {
              scheduleStep(step, nextT);
              nextT += 60 / parseFloat(bpm.value) / 4;
              const cue = step;
              cells.forEach((row) => {
                row.forEach((c, s) => c.classList.toggle('cur', s === cue));
              });
              step = (step + 1) % STEPS;
            }
          }
          playBtn.addEventListener('click', () => {
            if (playing) {
              playing = false;
              clearInterval(timer);
              playBtn.textContent = '▶ Play';
              clearCue();
            } else {
              const c = ac();
              step = 0;
              nextT = c.currentTime + 0.06;
              timer = setInterval(tick, 25);
              playing = true;
              playBtn.textContent = '⏹ Stop';
            }
          });
          vol.addEventListener('input', () => { if (master) master.gain.value = parseFloat(vol.value); });
          win.onClose = () => {
            if (timer) clearInterval(timer);
            playing = false;
          };
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
    icon: '🌐',
    open() {
      createWindow({
        id: 'browser',
        title: 'Nebula Web',
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
    icon: '📊',
    open() {
      createWindow({
        id: 'monitor',
        title: 'System Monitor',
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
            { name: 'nebula-shell', base: 4 },
            { name: 'window-manager', base: 3 },
            { name: 'render-core', base: 11 },
            { name: 'audio-engine', base: 2 },
            { name: 'file-service', base: 1 },
            { name: 'net-daemon', base: 2 },
            { name: 'star-tracker', base: 1 },
            { name: 'theme-engine', base: 0.5 }
          ];

          function drawChart(cv, arr) {
            const dpr = window.devicePixelRatio || 1;
            const w = cv.clientWidth, h = cv.clientHeight;
            if (!w || !h) return;
            cv.width = w * dpr; cv.height = h * dpr;
            const c = cv.getContext('2d');
            c.scale(dpr, dpr);
            c.clearRect(0, 0, w, h);
            c.strokeStyle = 'rgba(148,163,255,.14)';
            c.lineWidth = 1;
            for (let i = 1; i < 4; i++) {
              c.beginPath(); c.moveTo(0, (h * i) / 4); c.lineTo(w, (h * i) / 4); c.stroke();
            }
            c.beginPath();
            arr.forEach((v, i) => {
              const x = (i / (N - 1)) * w;
              const y = h - (v / 100) * (h - 8) - 4;
              i ? c.lineTo(x, y) : c.moveTo(x, y);
            });
            c.strokeStyle = OS.settings.accent;
            c.lineWidth = 2;
            c.stroke();
            c.lineTo(w, h); c.lineTo(0, h); c.closePath();
            c.fillStyle = OS.settings.accent + '2e';
            c.fill();
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
    icon: '📅',
    open() {
      createWindow({
        id: 'calendar',
        title: 'Calendar',
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
            const startOffset = (first.getDay() + 6) % 7; // Monday first
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
    icon: '⚙️',
    open() {
      createWindow({
        id: 'settings',
        title: 'Settings',
        icon: '⚙️',
        width: 580,
        height: 520,
        content(win) {
          const s = OS.settings;
          const ACCENTS = ['#7c6cff', '#22d3ee', '#f472b6', '#34d399', '#fbbf24', '#f87171'];
          const root = $el('div', 'settings');
          root.innerHTML =
            '<div class="set-sec">' +
              '<h3>Appearance</h3>' +
              '<div class="set-row"><div><div class="lbl">Theme</div><div class="sub">Window chrome & UI surfaces</div></div>' +
                '<div class="seg" data-seg="theme">' +
                  '<button data-v="dark">🌙 Dark</button><button data-v="light">☀️ Light</button>' +
                '</div></div>' +
              '<div class="set-row"><div><div class="lbl">Accent color</div><div class="sub">Used for highlights and focus glow</div></div>' +
                '<div class="swatches">' +
                  ACCENTS.map((c) => '<button class="swatch" data-c="' + c + '" style="background:' + c + '"></button>').join('') +
                  '<input type="color" data-custom value="' + s.accent + '" title="Custom accent">' +
                '</div></div>' +
              '<div class="set-row" style="align-items:flex-start"><div><div class="lbl">Wallpaper</div><div class="sub">Pick your view on the universe</div></div>' +
                '<div class="wp-thumbs" style="width:100%">' +
                  WALLPAPERS.map((w, i) =>
                    '<button class="wp-thumb' + (i === s.wallpaper ? ' on' : '') + '" data-w="' + i + '" title="' + esc(w.name) +
                    '" style="background:' + w.css + '"></button>').join('') +
                '</div></div>' +
            '</div>' +
            '<div class="set-sec">' +
              '<h3>Behavior</h3>' +
              '<div class="set-row"><div><div class="lbl">Sound effects</div><div class="sub">Tiny UI blips for windows</div></div>' +
                '<input type="checkbox" class="check" data-key="sound"></div>' +
              '<div class="set-row"><div><div class="lbl">Reduce motion</div><div class="sub">Disable animations and transitions</div></div>' +
                '<input type="checkbox" class="check" data-key="reduceMotion"></div>' +
            '</div>' +
            '<div class="set-sec">' +
              '<h3>System</h3>' +
              '<div class="set-row"><div class="lbl">Workspace storage</div><div class="set-storage" data-storage></div></div>' +
              '<div class="set-row"><div><div class="lbl">Reset workspace</div><div class="sub">Clears notes, settings and files, then reboots</div></div>' +
                '<button class="btn ghost sm" data-reset>Reset…</button></div>' +
            '</div>';
          win.body.appendChild(root);

          function syncTheme() {
            root.querySelectorAll('[data-seg="theme"] button').forEach((b) =>
              b.classList.toggle('on', b.dataset.v === s.theme));
          }
          function syncAccents() {
            root.querySelectorAll('.swatch').forEach((b) =>
              b.classList.toggle('on', b.dataset.c.toLowerCase() === s.accent.toLowerCase()));
            const custom = root.querySelector('[data-custom]');
            custom.value = s.accent;
          }
          function syncWall() {
            root.querySelectorAll('.wp-thumb').forEach((b) =>
              b.classList.toggle('on', parseInt(b.dataset.w, 10) === s.wallpaper));
          }
          function syncChecks() {
            root.querySelectorAll('.check').forEach((c) => { c.checked = !!s[c.dataset.key]; });
          }
          function syncStorage() {
            let total = 0;
            try {
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                total += (localStorage.getItem(k) || '').length + k.length;
              }
            } catch (e) {}
            root.querySelector('[data-storage]').textContent = fmtBytes(total * 2) + ' used (localStorage)';
          }
          function syncAll() { syncTheme(); syncAccents(); syncWall(); syncChecks(); syncStorage(); }
          function apply() { OS.saveSettings(); OS.applySettings(); }

          root.querySelectorAll('[data-seg="theme"] button').forEach((b) => {
            b.addEventListener('click', () => { s.theme = b.dataset.v; apply(); syncTheme(); });
          });
          root.querySelectorAll('.swatch').forEach((b) => {
            b.addEventListener('click', () => { s.accent = b.dataset.c; apply(); syncAccents(); });
          });
          root.querySelector('[data-custom]').addEventListener('input', (e) => {
            s.accent = e.target.value; apply(); syncAccents();
          });
          root.querySelectorAll('.wp-thumb').forEach((b) => {
            b.addEventListener('click', () => {
              s.wallpaper = parseInt(b.dataset.w, 10);
              apply(); syncWall();
            });
          });
          root.querySelectorAll('.check').forEach((c) => {
            c.addEventListener('change', () => {
              s[c.dataset.key] = c.checked;
              apply(); syncChecks();
            });
          });
          root.querySelector('[data-reset]').addEventListener('click', () => {
            confirmDialog('Reset workspace?', 'All notes, files and settings will be wiped from this browser. There is no undo.', 'Reset everything').then((ok) => {
              if (!ok) return;
              try { localStorage.clear(); } catch (e) {}
              location.reload();
            });
          });

          syncAll();
        }
      });
    }
  });

  /* ============================================================
     ABOUT
     ============================================================ */
  registerApp({
    id: 'about',
    title: 'About Nebula OS',
    icon: '🪐',
    open() {
      createWindow({
        id: 'about',
        title: 'About Nebula OS',
        icon: '🪐',
        width: 460,
        height: 540,
        content(win) {
          const uptimeMin = () => Math.max(0, Math.floor((Date.now() - OS.startedAt) / 60000));
          const root = $el('div', 'about');
          root.innerHTML =
            '<div class="orb"></div>' +
            '<h2>NEBULA OS</h2>' +
            '<div class="ver">version ' + OS.version + ' · build web</div>' +
            '<div class="about-specs">' +
              '<div><span>Engine</span><b>Vanilla JavaScript — 0 dependencies</b></div>' +
              '<div><span>Shell</span><b>nterm 1.0</b></div>' +
              '<div><span>Window manager</span><b>nebwm (drag · snap · resize)</b></div>' +
              '<div><span>Filesystem</span><b>virtual, localStorage-backed</b></div>' +
              '<div><span>Audio</span><b>Web Audio API (Beat Deck)</b></div>' +
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

  /* ---------- launch ---------- */
  window.Nebula = { OS, APPS, FS, openApp, WALLPAPERS, GITHUB_URL };
  OS.init();
})();
