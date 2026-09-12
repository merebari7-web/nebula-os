# 🪐 Nebula OS

An advanced **operating system for the web** — a full desktop environment that runs 100% inside a browser tab. No frameworks, no build step, no dependencies. Just HTML, CSS and vanilla JavaScript.

## ✨ Features

**Desktop environment**
- Boot sequence, desktop icons (double-click to launch, right-click to rename)
- Start menu with live app search
- Taskbar with running-app buttons, system tray, and a live clock
- Context menus, toast notifications, and glassy modal dialogs

**Window manager (`nebwm`)**
- Drag by the title bar (double-click to maximize)
- 8-way resize handles
- **Edge snapping** — drag a window to the top/left/right edge and it snaps to half or full screen (with a live ghost preview)
- Minimize / maximize / restore / close, z-order focus, open & close animations

**10 built-in applications**
| App | What it does |
| --- | --- |
| ⬛ Terminal | A real command shell over the virtual FS: `ls cd cat mkdir rm touch echo history sudo neofetch open …` with arrow-key history |
| 📁 Files | File manager over a **localStorage-backed virtual filesystem** — breadcrumbs, create/delete folders, open text files |
| 📝 Notes | Multi-note editor with autosave, persisted to the browser |
| 🎨 Paint | Canvas drawing app — brush sizes, colors, eraser, save as PNG |
| 🎛️ Beat Deck | A **16-step Web Audio sequencer** — program kick/snare/hat/bass and play it back live |
| 🌐 Nebula Web | Built-in browser with an internal start page, history and new-tab fallback |
| 📊 System Monitor | Animated CPU/RAM charts + a live (playfully fake) process table |
| 📅 Calendar | Month grid with today highlighting and navigation |
| ⚙️ Settings | Theme (dark/light), accent color, 6 wallpapers, sound, reduce-motion, storage stats, workspace reset |
| 🪐 About | System info and credits |

**Persistence** — notes, files, wallpaper, theme, accent color and window preferences all survive a refresh via `localStorage`.

## 🖥️ Run it locally

No server required — it's a static site:

```bash
# option 1: just open it
open index.html          # macOS
xdg-open index.html      # Linux

# option 2: serve it (recommended, for the browser app's iframes)
python3 -m http.server 8080
# → http://localhost:8080
```

## 🚀 Deploy to GitHub Pages

1. Create a new repository on GitHub (e.g. `nebula-os`).
2. Push this folder:
   ```bash
   git init
   git add -A
   git commit -m "Nebula OS 1.0"
   git branch -M main
   git remote add origin git@github.com:YOUR-USERNAME/nebula-os.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**
   select `main` / `(root)` and save.
4. In about a minute your OS lives at:
   - `https://YOUR-USERNAME.github.io/nebula-os/` (any repo name), or
   - `https://YOUR-USERNAME.github.io/` if the repo is named `YOUR-USERNAME.github.io`

## 📁 Project structure

```
index.html        page skeleton (boot screen, desktop, taskbar, start menu)
css/style.css     the entire design system (glassmorphism, themes, all apps)
js/fs.js          virtual filesystem (in-memory tree, localStorage persistence)
js/os.js          the kernel: window manager, taskbar, dialogs, toasts, sound
js/apps.js        all 10 applications + app registry
```

## 🛠️ Console API

Open devtools on a running instance and poke around:

```js
Nebula.openApp('terminal')      // launch any app
Nebula.openApp('notes', { name: 'hi.txt', content: 'hello' })
Nebula.FS.list('/home/guest')   // inspect the virtual filesystem
Nebula.OS.settings              // read current settings
Nebula.OS                       // the OS state object
```

## ⌨️ Quick tour

1. Double-click **Terminal** → type `neofetch`
2. Double-click **Beat Deck** → hit **▶ Play** (then click cells to remix)
3. Drag a window to the **right edge** to watch it snap
4. Open **Settings** → change theme, accent and wallpaper
5. Right-click the desktop for quick actions

---

*Made with ♥ in the browser. Everything — files, notes, settings — lives in your `localStorage`; hit **Settings → Reset workspace** to wipe the universe clean.*
