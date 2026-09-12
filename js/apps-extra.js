/* ============================================================
   NEBULA OS — flagship apps v1.1
   calculator · clock (world/stopwatch/timer) · code editor
   weather (live, Open-Meteo) · snake
   ============================================================ */
(function () {
  'use strict';

  const Nebula = window.Nebula;
  const FS = Nebula.FS;
  const TEXT_EXTS = Nebula.TEXT_EXTS;

  /* single keyboard router for keyboard-driven apps (registered once) */
  const KEY_ROUTES = {};
  document.addEventListener('keydown', (e) => {
    const focused = document.querySelector('.window.focused');
    if (!focused) return;
    const handler = KEY_ROUTES[focused.dataset.id];
    if (handler) handler(e);
  });

  /* ============================================================
     CALCULATOR
     ============================================================ */
  registerApp({
    id: 'calc',
    title: 'Calculator',
    titleKey: 'app.calc',
    icon: '🧮',
    tile: 'linear-gradient(135deg,#f59e0b,#ef4444)',
    open() {
      createWindow({
        id: 'calc',
        appId: 'calc',
        title: t('app.calc'),
        icon: '🧮',
        width: 340,
        height: 540,
        content(win) {
          const root = $el('div', 'calc');
          root.innerHTML =
            '<div class="calc-expr" data-expr>&nbsp;</div>' +
            '<div class="calc-display" data-disp>0</div>' +
            '<div class="calc-history" data-hist></div>' +
            '<div class="calc-keys">' +
              ['C', '⌫', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '±', '0', '.', '=']
                .map((k) => '<button class="calc-key ' + (/[0-9.]/.test(k) ? 'k-num' : k === '=' ? 'k-eq' : 'k-op') + '" data-k="' + k + '">' + k + '</button>')
                .join('') +
            '</div>';
          win.body.appendChild(root);

          const disp = root.querySelector('[data-disp]');
          const exprEl = root.querySelector('[data-expr]');
          const histEl = root.querySelector('[data-hist]');
          let expr = '';
          const history = [];

          function show(v) {
            if (v.length > 14) v = Number(v).toPrecision(10).replace(/\.?0+$/, '');
            disp.textContent = v;
          }
          function render() {
            exprEl.innerHTML = esc(expr) || '&nbsp;';
            show(expr || '0');
          }
          function push(k) {
            if (k === 'C') { expr = ''; render(); return; }
            if (k === '⌫') { expr = expr.slice(0, -1); render(); return; }
            if (k === '=') {
              const out = evaluate(expr);
              if (out === null) { show('Error'); Sound.fail(); return; }
              history.unshift(expr + ' = ' + out);
              if (history.length > 4) history.pop();
              histEl.innerHTML = history.map((h) => '<span>' + esc(h) + '</span>').join('');
              expr = String(out);
              show(out);
              return;
            }
            if (k === '±') {
              const m = expr.match(/(-?\d+\.?\d*)$/);
              if (m) {
                const num = m[1];
                const idx = expr.length - num.length;
                expr = expr.slice(0, idx) + (num.startsWith('-') ? num.slice(1) : '-' + num);
              }
              render();
              return;
            }
            expr += k;
            render();
          }
          function evaluate(raw) {
            if (!raw) return null;
            const jsExpr = raw.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/%/g, '%');
            if (!/^[0-9+\-*/%().\s]+$/.test(jsExpr)) return null;
            try {
              const v = Function('"use strict";return (' + jsExpr + ')')();
              if (typeof v !== 'number' || !isFinite(v)) return null;
              return String(Math.round(v * 1e10) / 1e10);
            } catch (e) { return null; }
          }

          root.querySelectorAll('.calc-key').forEach((b) => {
            b.addEventListener('click', () => { push(b.dataset.k); Sound.pop(); });
          });
          const KEYMAP = {
            '*': '×', '/': '÷', '-': '−', '+': '+', '%': '%', '.': '.',
            'Enter': '=', '=': '=', 'Backspace': '⌫', 'Escape': 'C', 'Delete': 'C'
          };
          win.hooks.focus = () => {
            KEY_ROUTES['calc'] = (e) => {
              let k = null;
              if (/^[0-9]$/.test(e.key)) k = e.key;
              else k = KEYMAP[e.key];
              if (!k) return;
              e.preventDefault();
              push(k);
              Sound.pop();
            };
          };
          win.hooks.blur = () => { KEY_ROUTES['calc'] = null; };
          render();
        }
      });
    }
  });

  /* ============================================================
     CLOCK — analog + digital + world clocks + stopwatch + timer
     ============================================================ */
  registerApp({
    id: 'clock',
    title: 'Clock',
    titleKey: 'app.clock',
    icon: '🕰️',
    tile: 'linear-gradient(135deg,#f43f5e,#8b5cf6)',
    open() {
      createWindow({
        id: 'clock',
        appId: 'clock',
        title: t('app.clock'),
        icon: '🕰️',
        width: 620,
        height: 560,
        content(win) {
          const root = $el('div', 'clock-app');
          root.innerHTML =
            '<div class="clock-top">' +
              '<div class="clock-analog">' +
                '<svg viewBox="0 0 100 100" class="clock-svg">' +
                  '<circle cx="50" cy="50" r="47" class="clock-face"></circle>' +
                  '<g class="clock-ticks"></g>' +
                  '<line id="ck-h" x1="50" y1="50" x2="50" y2="31" class="ck-hand ck-h"></line>' +
                  '<line id="ck-m" x1="50" y1="50" x2="50" y2="23" class="ck-hand ck-m"></line>' +
                  '<line id="ck-s" x1="50" y1="54" x2="50" y2="19" class="ck-hand ck-s"></line>' +
                  '<circle cx="50" cy="50" r="2.4" class="ck-pin"></circle>' +
                '</svg>' +
              '</div>' +
              '<div class="clock-digital">' +
                '<div class="clock-time" data-dtime>--:--:--</div>' +
                '<div class="clock-date" data-ddate></div>' +
              '</div>' +
            '</div>' +
            '<div class="clock-grid">' +
              '<div class="clock-panel"><h4>World clocks</h4><div class="world-list" data-world></div></div>' +
              '<div class="clock-panel"><h4>Stopwatch</h4>' +
                '<div class="stop-time" data-stop>00:00.00</div>' +
                '<div class="clock-btns">' +
                  '<button class="btn sm" data-sw="toggle">Start</button>' +
                  '<button class="btn ghost sm" data-sw="lap">Lap</button>' +
                  '<button class="btn ghost sm" data-sw="reset">Reset</button>' +
                '</div>' +
                '<div class="stop-laps" data-laps></div>' +
              '</div>' +
            '</div>' +
            '<div class="clock-panel timer-row">' +
              '<h4>Timer</h4>' +
              '<div class="timer-presets">' +
                [1, 5, 10, 25].map((m) => '<button class="btn ghost sm timer-preset" data-min="' + m + '">' + m + ' min</button>').join('') +
                '<input class="timer-custom" data-custom placeholder="seconds" inputmode="numeric">' +
                '<button class="btn sm" data-timer="toggle">Start</button>' +
                '<button class="btn ghost sm" data-timer="cancel">Cancel</button>' +
              '</div>' +
              '<div class="timer-time" data-ttime>—</div>' +
            '</div>';
          win.body.appendChild(root);

          /* ticks */
          const ticksG = root.querySelector('.clock-ticks');
          for (let i = 0; i < 12; i++) {
            const a = (i * Math.PI) / 6;
            const x1 = 50 + Math.sin(a) * 42, y1 = 50 - Math.cos(a) * 42;
            const x2 = 50 + Math.sin(a) * (i % 3 === 0 ? 36 : 39), y2 = 50 - Math.cos(a) * (i % 3 === 0 ? 36 : 39);
            const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            ln.setAttribute('x1', x1); ln.setAttribute('y1', y1);
            ln.setAttribute('x2', x2); ln.setAttribute('y2', y2);
            ln.setAttribute('class', 'ck-tick' + (i % 3 === 0 ? ' major' : ''));
            ticksG.appendChild(ln);
          }

          const WORLD = [
            ['Lagos', 'Africa/Lagos'], ['London', 'Europe/London'],
            ['New York', 'America/New_York'], ['Tokyo', 'Asia/Tokyo'],
            ['Sydney', 'Australia/Sydney'], ['Dubai', 'Asia/Dubai']
          ];
          const worldEl = root.querySelector('[data-world]');
          WORLD.forEach(([city, tz]) => {
            const row = $el('div', 'world-row');
            row.innerHTML = '<span class="wc-city">' + esc(city) + '</span><span class="wc-time"></span>';
            row.dataset.tz = tz;
            worldEl.appendChild(row);
          });

          function fmtStop(ms) {
            const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), cs = Math.floor((ms % 1000) / 10);
            return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(cs).padStart(2, '0');
          }
          let swRunning = false, swStart = 0, swBase = 0;
          const swBtn = root.querySelector('[data-sw="toggle"]');
          const stopEl = root.querySelector('[data-stop]');
          const lapsEl = root.querySelector('[data-laps]');
          let laps = [];
          root.querySelector('[data-sw="toggle"]').addEventListener('click', () => {
            if (swRunning) { swBase += Date.now() - swStart; swRunning = false; swBtn.textContent = 'Start'; }
            else { swStart = Date.now(); swRunning = true; swBtn.textContent = 'Pause'; }
            Sound.pop();
          });
          root.querySelector('[data-sw="lap"]').addEventListener('click', () => {
            const now = swBase + (swRunning ? Date.now() - swStart : 0);
            laps.unshift(now);
            if (laps.length > 6) laps.pop();
            lapsEl.innerHTML = laps.map((l, i) => '<span>lap ' + (laps.length - i) + ' · ' + fmtStop(l) + '</span>').join('');
          });
          root.querySelector('[data-sw="reset"]').addEventListener('click', () => {
            swRunning = false; swBase = 0; laps = [];
            swBtn.textContent = 'Start';
            lapsEl.innerHTML = '';
            stopEl.textContent = fmtStop(0);
          });

          let timerEnd = 0, timerRunning = false;
          const tBtn = root.querySelector('[data-timer="toggle"]');
          const tTime = root.querySelector('[data-ttime]');
          root.querySelectorAll('.timer-preset').forEach((b) => {
            b.addEventListener('click', () => startTimer(parseInt(b.dataset.min, 10) * 60));
          });
          root.querySelector('[data-custom]').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              const v = parseInt(e.target.value, 10);
              if (v > 0) startTimer(v);
              e.target.value = '';
            }
          });
          function startTimer(sec) {
            timerEnd = Date.now() + sec * 1000;
            timerRunning = true;
            tBtn.textContent = 'Restart';
            Sound.pop();
          }
          tBtn.addEventListener('click', () => {
            const cur = timerRunning ? Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000)) : 0;
            startTimer(Math.max(cur, 0) === 0 ? 60 : cur);
          });
          root.querySelector('[data-timer="cancel"]').addEventListener('click', () => {
            timerRunning = false;
            tBtn.textContent = 'Start';
            tTime.textContent = '—';
          });

          const iv = setInterval(() => {
            const now = new Date();
            const h = now.getHours(), mi = now.getMinutes(), se = now.getSeconds();
            root.querySelector('[data-dtime]').textContent =
              String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0') + ':' + String(se).padStart(2, '0');
            root.querySelector('[data-ddate]').textContent =
              now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
            const hs = h % 12 + mi / 60, ms2 = mi + se / 60, ss2 = se;
            root.querySelector('#ck-h').setAttribute('transform', 'rotate(' + (hs * 30) + ' 50 50)');
            root.querySelector('#ck-m').setAttribute('transform', 'rotate(' + (ms2 * 6) + ' 50 50)');
            root.querySelector('#ck-s').setAttribute('transform', 'rotate(' + (ss2 * 6) + ' 50 50)');
            worldEl.querySelectorAll('.world-row').forEach((row) => {
              row.querySelector('.wc-time').textContent =
                now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: row.dataset.tz });
            });
            stopEl.textContent = fmtStop(swBase + (swRunning ? Date.now() - swStart : 0));
            if (timerRunning) {
              const left = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
              tTime.textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
              if (left <= 0) {
                timerRunning = false;
                tBtn.textContent = 'Start';
                tTime.textContent = "⏰ It's time!";
                notify('⏰', 'Timer done', 'Your timer has finished.');
                Sound.chime();
              }
            }
          }, 250);
          win.onClose = () => clearInterval(iv);
        }
      });
    }
  });

  /* ============================================================
     CODE EDITOR — syntax highlighting over a virtual FS
     ============================================================ */
  function highlightCode(code, lang) {
    const escH = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let rules;
    if (lang === 'js') {
      rules = [
        ['com', /\/\/[^\n]*|\/\*[\s\S]*?\*\//y],
        ['str', /`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/y],
        ['key', /\b(?:const|let|var|function|return|if|else|for|while|do|class|new|import|export|from|await|async|try|catch|finally|throw|typeof|instanceof|of|in|switch|case|break|continue|default|this|super|extends|yield|delete|void|static|get|set|constructor)\b/y],
        ['num', /\b0x[\da-fA-F]+\b|\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/y],
        ['fn', /[A-Za-z_$][\w$]*(?=\s*\()/y]
      ];
    } else if (lang === 'css') {
      rules = [
        ['com', /\/\*[\s\S]*?\*\//y],
        ['str', /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y],
        ['key', /@[a-zA-Z-]+/y],
        ['prop', /[a-zA-Z-]+(?=\s*:)/y],
        ['tag', /[.#][\w-]+/y],
        ['num', /#[\da-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg)?\b/y]
      ];
    } else if (lang === 'html') {
      rules = [
        ['com', /<!--[\s\S]*?-->/y],
        ['str', /"[^"]*"|'[^']*'/y],
        ['tag', /<\/?[a-zA-Z][\w-]*|\/?>/y],
        ['prop', /\b[a-zA-Z-]+(?==)/y]
      ];
    } else if (lang === 'json') {
      rules = [
        ['prop', /"(?:\\.|[^"\\])*"(?=\s*:)/y],
        ['str', /"(?:\\.|[^"\\])*"/y],
        ['num', /-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/y],
        ['key', /\b(?:true|false|null)\b/y]
      ];
    } else {
      return escH(code);
    }
    let out = '';
    let i = 0;
    while (i < code.length) {
      let matched = false;
      for (const pair of rules) {
        const cls = pair[0], re = pair[1];
        re.lastIndex = i;
        const m = re.exec(code);
        if (m && m.index === i && m[0].length > 0) {
          out += '<span class="c-' + cls + '">' + escH(m[0]) + '</span>';
          i += m[0].length;
          matched = true;
          break;
        }
      }
      if (!matched) { out += escH(code[i]); i++; }
    }
    return out;
  }

  function langOf(name) {
    const n = name.toLowerCase();
    if (/\.(js|ts)$/.test(n)) return 'js';
    if (n.endsWith('.css')) return 'css';
    if (/\.(html|htm)$/.test(n)) return 'html';
    if (n.endsWith('.json')) return 'json';
    return 'txt';
  }

  registerApp({
    id: 'code',
    title: 'Code Editor',
    titleKey: 'app.code',
    icon: '⌨️',
    tile: 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
    open(args) {
      createWindow({
        id: 'code',
        appId: 'code',
        title: t('app.code'),
        icon: '⌨️',
        width: 760,
        height: 520,
        content(win) {
          const root = $el('div', 'code');
          root.innerHTML =
            '<div class="code-bar">' +
              '<select class="code-file" data-files></select>' +
              '<button class="btn ghost sm" data-new>＋ New file</button>' +
              '<button class="btn sm" data-save>💾 Save</button>' +
            '</div>' +
            '<div class="code-edit">' +
              '<pre class="code-pre" aria-hidden="true"><code></code></pre>' +
              '<textarea class="code-ta" spellcheck="false" wrap="off"></textarea>' +
            '</div>' +
            '<div class="code-status">' +
              '<span data-lang>txt</span><span data-loc>Ln 1, Col 1</span><span data-chars>0 chars</span>' +
            '</div>';
          win.body.appendChild(root);

          const fileSel = root.querySelector('[data-files]');
          const ta = root.querySelector('.code-ta');
          const preCode = root.querySelector('.code-pre code');
          const langEl = root.querySelector('[data-lang]');
          const locEl = root.querySelector('[data-loc]');
          const charsEl = root.querySelector('[data-chars]');
          let currentPath = null;
          let dirty = false;

          function listFiles() {
            const found = [];
            (function walk(node, path) {
              (node.children || []).forEach((c) => {
                const p = path + '/' + c.name;
                if (c.type === 'dir') walk(c, p);
                else if (TEXT_EXTS.test(c.name)) found.push(p);
              });
            })(FS.nodeAt('/home/guest') || { children: [] }, '/home/guest');
            found.sort();
            fileSel.innerHTML = found.map((p) =>
              '<option value="' + esc(p) + '"' + (p === currentPath ? ' selected' : '') + '>' + esc(p.replace('/home/guest/', '')) + '</option>').join('') ||
              '<option value="">(no text files)</option>';
          }

          function render() {
            const lang = langOf(currentPath || 'x.txt');
            preCode.innerHTML = highlightCode(ta.value, lang);
            langEl.textContent = lang;
            const upto = ta.value.slice(0, ta.selectionStart || 0).split('\n');
            locEl.textContent = 'Ln ' + upto.length + ', Col ' + (upto[upto.length - 1] || '').length + 1;
            charsEl.textContent = ta.value.length + ' chars';
          }

          function openFile(p) {
            const n = FS.nodeAt(p);
            if (!n || n.type !== 'file') return;
            currentPath = p;
            ta.value = n.content || '';
            dirty = false;
            listFiles();
            render();
          }

          ta.addEventListener('input', () => { dirty = true; render(); });
          ta.addEventListener('scroll', () => {
            root.querySelector('.code-pre').scrollTop = ta.scrollTop;
            root.querySelector('.code-pre').scrollLeft = ta.scrollLeft;
          });
          ta.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const s = ta.selectionStart;
              ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(ta.selectionEnd);
              ta.selectionStart = ta.selectionEnd = s + 2;
              render();
            }
          });
          fileSel.addEventListener('change', () => openFile(fileSel.value));
          root.querySelector('[data-new]').addEventListener('click', () => {
            ask({
              title: 'New file', message: 'Where? (inside /home/guest/Documents)',
              placeholder: 'script.js', value: 'script.js', okLabel: t('common.create')
            }).then((v) => {
              if (!v || !v.trim()) return;
              const p = '/home/guest/Documents/' + v.trim().replace(/^\/+/, '');
              if (FS.nodeAt(p)) { openFile(p); return; }
              FS.createFile(p, '// ' + v.trim() + '\n');
              openFile(p);
            });
          });
          root.querySelector('[data-save]').addEventListener('click', () => {
            if (!currentPath) { notify('⚠️', 'Nothing to save', 'Pick or create a file first.'); return; }
            FS.writeFile(currentPath, ta.value);
            dirty = false;
            notify('💾', 'Saved', currentPath.replace('/home/guest/', ''));
          });

          listFiles();
          if (args && args.path) {
            if (FS.nodeAt(args.path)) openFile(args.path);
          } else if (fileSel.options.length) {
            openFile(fileSel.options[0].value);
          }
          win.hooks.focus = () => ta.focus({ preventScroll: true });
          win.hooks.blur = () => ta.blur();
          render();
        }
      });
    }
  });

  /* ============================================================
     WEATHER — live data via Open-Meteo (no API key)
     ============================================================ */
  registerApp({
    id: 'weather',
    title: 'Weather',
    titleKey: 'app.weather',
    icon: '🌦️',
    tile: 'linear-gradient(135deg,#38bdf8,#818cf8)',
    open() {
      createWindow({
        id: 'weather',
        appId: 'weather',
        title: t('app.weather'),
        icon: '🌦️',
        width: 560,
        height: 500,
        content(win) {
          const CITIES = [
            { id: 'phc', name: 'Port Harcourt', lat: 4.7747, lon: 7.0036, tz: 'Africa/Lagos' },
            { id: 'lag', name: 'Lagos', lat: 6.5244, lon: 3.3792, tz: 'Africa/Lagos' },
            { id: 'lon', name: 'London', lat: 51.5074, lon: -0.1278, tz: 'Europe/London' },
            { id: 'nyc', name: 'New York', lat: 40.7128, lon: -74.006, tz: 'America/New_York' },
            { id: 'tok', name: 'Tokyo', lat: 35.6762, lon: 139.6503, tz: 'Asia/Tokyo' },
            { id: 'par', name: 'Paris', lat: 48.8566, lon: 2.3522, tz: 'Europe/Paris' },
            { id: 'syd', name: 'Sydney', lat: -33.8688, lon: 151.2093, tz: 'Australia/Sydney' },
            { id: 'dxb', name: 'Dubai', lat: 25.2048, lon: 55.2708, tz: 'Asia/Dubai' },
            { id: 'sin', name: 'Singapore', lat: 1.3521, lon: 103.8198, tz: 'Asia/Singapore' },
            { id: 'sao', name: 'São Paulo', lat: -23.5505, lon: -46.6333, tz: 'America/Sao_Paulo' },
            { id: 'del', name: 'Delhi', lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata' },
            { id: 'cpt', name: 'Cape Town', lat: -33.9249, lon: 18.4241, tz: 'Africa/Johannesburg' }
          ];
          function wmo(code, isDay) {
            const d = isDay ? 1 : 0;
            if (code === 0) return { icon: d ? '☀️' : '🌙', label: 'Clear sky' };
            if (code === 1) return { icon: d ? '🌤️' : '🌙', label: 'Mainly clear' };
            if (code === 2) return { icon: d ? '⛅' : '☁️', label: 'Partly cloudy' };
            if (code === 3) return { icon: '☁️', label: 'Overcast' };
            if (code === 45 || code === 48) return { icon: '🌫️', label: 'Fog' };
            if (code >= 51 && code <= 57) return { icon: '🌦️', label: 'Drizzle' };
            if (code >= 61 && code <= 67) return { icon: '🌧️', label: 'Rain' };
            if (code >= 71 && code <= 77) return { icon: '🌨️', label: 'Snow' };
            if (code >= 80 && code <= 82) return { icon: '🌦️', label: 'Rain showers' };
            if (code === 85 || code === 86) return { icon: '❄️', label: 'Snow showers' };
            if (code >= 95) return { icon: '⛈️', label: 'Thunderstorm' };
            return { icon: '🌡️', label: 'Unknown' };
          }

          const root = $el('div', 'wx');
          root.innerHTML =
            '<div class="wx-head">' +
              '<select class="wx-city" data-city></select>' +
              '<button class="btn ghost sm" data-geo>📍 My location</button>' +
            '</div>' +
            '<div class="wx-body" data-body><div class="wx-loading">Contacting the stratosphere…</div></div>';
          win.body.appendChild(root);

          const citySel = root.querySelector('[data-city]');
          const body = root.querySelector('[data-body]');
          citySel.innerHTML = CITIES.map((c) => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('');
          let cityId = CITIES[0].id;

          function render(data) {
            const cur = data.current;
            const w = wmo(cur.weather_code, cur.is_day);
            const hTime = data.hourly.time;
            let start = hTime.indexOf(cur.time);
            if (start < 0) start = 0;
            const hours = [];
            for (let i = start; i < Math.min(start + 24, hTime.length); i++) {
              hours.push({
                h: hTime[i].slice(11, 16) || hTime[i].slice(11),
                t: Math.round(data.hourly.temperature_2m[i]),
                icon: wmo(data.hourly.weather_code[i], 1).icon
              });
            }
            body.innerHTML =
              '<div class="wx-main">' +
                '<div class="wx-temp">' + Math.round(cur.temperature_2m) + '°</div>' +
                '<div class="wx-ic">' + w.icon + '</div>' +
                '<div class="wx-cond">' + esc(w.label) +
                  '<small>feels like ' + Math.round(cur.apparent_temperature) + '°</small>' +
                '</div>' +
              '</div>' +
              '<div class="wx-stats">' +
                '<div class="wx-stat"><span>💧 Humidity</span><b>' + cur.relative_humidity_2m + '%</b></div>' +
                '<div class="wx-stat"><span>💨 Wind</span><b>' + Math.round(cur.wind_speed_10m) + ' km/h</b></div>' +
                '<div class="wx-stat"><span>' + (cur.is_day ? '☀️ Day' : '🌙 Night') + '</span><b>' + (data.current.is_day ? 'sunny side' : 'dark side') + '</b></div>' +
              '</div>' +
              '<div class="wx-hours-label">Next 24 hours</div>' +
              '<div class="wx-hours">' +
                hours.map((h) =>
                  '<div class="wx-hour"><span class="wx-h-t">' + Math.round(h.t) + '°</span><span class="wx-h-ic">' + h.icon + '</span><span class="wx-h-h">' + esc(h.h) + '</span></div>').join('') +
              '</div>';
          }
          function showError() {
            body.innerHTML =
              '<div class="wx-err">📡 Could not reach the weather satellite.<br><small>Check your connection — the rest of the OS is fully offline-ready.</small><br><br>' +
              '<button class="btn sm" data-retry>Retry</button></div>';
            body.querySelector('[data-retry]').addEventListener('click', () => load(cityId));
          }

          function load(id, silent) {
            const city = CITIES.find((c) => c.id === id);
            if (!city) return;
            if (typeof fetch !== 'function') { if (!silent) showError(); return; }
            if (!silent) body.innerHTML = '<div class="wx-loading">Contacting the stratosphere…</div>';
            const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + city.lat +
              '&longitude=' + city.lon +
              '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m' +
              '&hourly=temperature_2m,weather_code&forecast_days=2&timezone=' + encodeURIComponent(city.tz);
            fetch(url)
              .then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
              .then((data) => {
                try { localStorage.setItem('nebula.wx.' + id, JSON.stringify({ d: data, ts: Date.now() })); } catch (e) {}
                render(data);
              })
              .catch(() => {
                if (!silent) showError();
              });
          }

          citySel.addEventListener('change', () => { cityId = citySel.value; load(cityId); });
          root.querySelector('[data-geo]').addEventListener('click', () => {
            if (!navigator.geolocation) { notify('⚠️', 'No geolocation', 'Your browser does not support it.'); return; }
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const id = 'me';
                CITIES.push({ id, name: 'My location', lat: pos.coords.latitude, lon: pos.coords.longitude, tz: 'auto' });
                citySel.innerHTML = CITIES.map((c) => '<option value="' + c.id + '"' + (c.id === id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
                cityId = id;
                load(id);
              },
              () => notify('⚠️', 'Location denied', 'Pick a city from the list instead.'),
              { timeout: 8000 }
            );
          });

          /* cache first, then live refresh */
          let cache = null;
          try {
            const raw = localStorage.getItem('nebula.wx.' + cityId);
            if (raw) cache = JSON.parse(raw);
          } catch (e) {}
          if (cache && cache.d) { render(cache.d); load(cityId, true); }
          else load(cityId);
        }
      });
    }
  });

  /* ============================================================
     SNAKE — classic, canvas, high score
     ============================================================ */
  registerApp({
    id: 'snake',
    title: 'Snake',
    titleKey: 'app.snake',
    icon: '🐍',
    tile: 'linear-gradient(135deg,#22c55e,#84cc16)',
    open() {
      createWindow({
        id: 'snake',
        appId: 'snake',
        title: t('app.snake'),
        icon: '🐍',
        width: 500,
        height: 540,
        content(win) {
          const CELL = 20, N = 22;
          const root = $el('div', 'snake');
          root.innerHTML =
            '<div class="snake-hud">' +
              '<span class="snake-score">Score <b data-score>0</b></span>' +
              '<span class="snake-best">Best <b data-best>0</b></span>' +
              '<span class="snake-speed" data-speed>×1.0</span>' +
            '</div>' +
            '<div class="snake-stage">' +
              '<canvas width="' + N * CELL + '" height="' + N * CELL + '"></canvas>' +
              '<div class="snake-overlay" data-ov>' +
                '<div class="snake-ov-title" data-ovt>🐍 Snake</div>' +
                '<div class="snake-ov-sub" data-ovs>Press an arrow key or WASD to start</div>' +
              '</div>' +
            '</div>' +
            '<div class="snake-help">Arrows / WASD move · Space pauses</div>';
          win.body.appendChild(root);

          const canvas = root.querySelector('canvas');
          const ctx = canvas.getContext('2d');
          const scoreEl = root.querySelector('[data-score]');
          const bestEl = root.querySelector('[data-best]');
          const speedEl = root.querySelector('[data-speed]');
          const ov = root.querySelector('[data-ov]');
          const ovt = root.querySelector('[data-ovt]');
          const ovs = root.querySelector('[data-ovs]');

          let best = 0;
          try { best = parseInt(localStorage.getItem('nebula.snake.hi') || '0', 10); } catch (e) {}
          bestEl.textContent = best;

          let snake, dir, nextDir, food, score, running, paused, dead, iv;

          function reset() {
            snake = [{ x: 10, y: 11 }, { x: 9, y: 11 }, { x: 8, y: 11 }];
            dir = { x: 1, y: 0 };
            nextDir = dir;
            score = 0;
            dead = false;
            paused = false;
            scoreEl.textContent = '0';
            placeFood();
            draw();
            ov.classList.add('hidden');
          }
          function placeFood() {
            do {
              food = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) };
            } while (snake.some((s) => s.x === food.x && s.y === food.y));
          }
          function speed() { return Math.max(70, 140 - Math.floor(score / 3) * 6); }
          function loop() {
            if (paused || dead) return;
            dir = nextDir;
            const head = { x: (snake[0].x + dir.x + N) % N, y: (snake[0].y + dir.y + N) % N };
            if (snake.some((s) => s.x === head.x && s.y === head.y)) { gameOver(); return; }
            snake.unshift(head);
            if (head.x === food.x && head.y === food.y) {
              score++;
              scoreEl.textContent = score;
              if (score > best) { best = score; bestEl.textContent = best; try { localStorage.setItem('nebula.snake.hi', String(best)); } catch (e) {} }
              speedEl.textContent = '×' + (140 / speed()).toFixed(1);
              placeFood();
              Sound.pop();
            } else snake.pop();
            draw();
          }
          function gameOver() {
            dead = true;
            running = false;
            clearInterval(iv);
            Sound.fail();
            ovt.textContent = '💀 Game over';
            ovs.textContent = 'Score ' + score + ' · Best ' + best + ' — press Enter to restart';
            ov.classList.remove('hidden');
          }
          function draw() {
            ctx.fillStyle = '#0b0e1a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(148,163,255,.05)';
            for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) if ((x + y) % 2 === 0) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
            /* food */
            ctx.save();
            ctx.shadowColor = OS.settings.accent;
            ctx.shadowBlur = 12;
            ctx.fillStyle = OS.settings.accent;
            ctx.beginPath();
            ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL / 2 - 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            /* snake */
            snake.forEach((s, i) => {
              const shade = 1 - (i / snake.length) * 0.6;
              ctx.fillStyle = 'rgba(74,222,128,' + shade.toFixed(2) + ')';
              const r = 6;
              const x = s.x * CELL + 1.5, y = s.y * CELL + 1.5, w = CELL - 3;
              ctx.beginPath();
              ctx.roundRect ? ctx.roundRect(x, y, w, w, r) : ctx.rect(x, y, w, w);
              ctx.fill();
              if (i === 0) {
                ctx.fillStyle = '#052e16';
                ctx.beginPath();
                ctx.arc(s.x * CELL + CELL / 2 - 3, s.y * CELL + CELL / 2 - 2, 1.8, 0, Math.PI * 2);
                ctx.arc(s.x * CELL + CELL / 2 + 3, s.y * CELL + CELL / 2 - 2, 1.8, 0, Math.PI * 2);
                ctx.fill();
              }
            });
          }
          function start() {
            if (running) return;
            reset();
            running = true;
            iv = setInterval(loop, speed());
          }

          const DIRS = {
            ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 },
            ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 },
            ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 },
            ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 }
          };
          win.hooks.focus = () => {
            KEY_ROUTES['snake'] = (e) => {
              const k = e.key;
              if (DIRS[k]) {
                e.preventDefault();
                const d = DIRS[k];
                if (d.x !== -dir.x || d.y !== -dir.y) nextDir = d;
                if (!running && !dead) start();
                return;
              }
              if (k === ' ') {
                e.preventDefault();
                if (running && !dead) { paused = !paused; ovs.textContent = paused ? 'Paused — Space to resume' : ''; ov.classList.toggle('hidden', !paused); if (!paused) ovs.textContent = ''; }
                return;
              }
              if (k === 'Enter' && dead) { e.preventDefault(); start(); }
            };
          };
          win.hooks.blur = () => {
            KEY_ROUTES['snake'] = null;
            if (running && !dead) { paused = true; }
          };

          /* draw initial board */
          snake = [{ x: 10, y: 11 }, { x: 9, y: 11 }, { x: 8, y: 11 }];
          food = { x: 15, y: 11 };
          draw();
          win.onClose = () => { if (iv) clearInterval(iv); };
        }
      });
    }
  });

  window.Nebula = Object.assign({}, window.Nebula, { highlightCode, langOf });

  /* boot once every app (incl. this file's) is registered */
  OS.init();
})();
