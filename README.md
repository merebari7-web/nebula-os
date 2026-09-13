# 🪐 Nebula OS

**An operating system for the web.** A complete desktop environment that runs 100% inside a browser tab — macOS-style menu bar, dock with magnification, Spotlight, Mission Control, an offline AI-free assistant, virtual filesystem with real file import/export, live crypto markets, live weather, live maps, YouTube player, code editor, beat sequencer, 19 apps, 8 languages, RTL support — and it's **installable as a PWA** with an offline shell. No frameworks, no build step, no dependencies. Just HTML, CSS and vanilla JavaScript.

![og](docs/og.png)

## ✨ Features

### 🌍 World Edition (v2.0)
- **Spotlight** — `⌘/Ctrl + Space`: search all 19 apps, every file in the virtual FS, evaluate math (`12*8`), and run system actions (lock, theme, show desktop) — arrow keys + Enter, `Esc` to dismiss
- **Mission Control** — `` ⌘/Ctrl + ` ``: frosted-glass overview of every open window as cards (minimized ones dimmed); click a card to jump to it
- **Assistant** — `✨` in the menu bar: type natural commands in plain English — `open maps`, `next wallpaper`, `wallpaper 3`, `theme`, `show desktop`, `lock`, `time`, `date`, `what is 6*7` — fully offline, zero APIs
- **📈 Stocks** — top-10 crypto markets, **live from CoinGecko** (no API key) with a `● LIVE` badge; offline it renders a clearly-labelled sample dataset and you can press ⟳ to retry
- **✅ Reminders** — persistent to-do list (localStorage): add, tick, delete, progress counter
- **Real file I/O** — in Files: ⬆ imports files *from your computer* into the virtual filesystem, ⬇ exports a selected file back out as a download
- **PWA** — web manifest + service worker + 192/512 icons: **install to your desktop/home screen** and it serves its shell offline

### macOS-style shell
- **Top menu bar** — Apple menu, File / Edit / View / Window menus (all with real actions), right-side status icons and live clock; hover-switches between open menus, `Esc` closes
- **Dock** — frosted glass, **icon magnification on hover** (CSS transforms, rAF-throttled), running-app indicator dots, tooltips, Launchpad rocket, and a **show-desktop edge** (minimize all / click again to restore)
- **Launchpad** — app grid with live search, opened from the dock
- **Windows with traffic lights** — red/yellow/green controls with hover glyphs, centered titles, rounded corners; **window positions persist** in localStorage and are restored on relaunch
- Sonoma/Sequoia-style gradient wallpapers · macOS blue accent · top-right notifications
- Real shortcuts: `⌘/Ctrl+Space` Spotlight · `` ⌘/Ctrl+` `` Mission Control · `⌘/Ctrl+N` new note · `⌘/Ctrl+T` terminal · `⌘/Ctrl+D` next wallpaper · `⌃⌘Q` lock

### Interactive desktop
- Boot sequence → desktop with **19 app icons** (right-aligned, like macOS)
- **Drag & drop icons** to rearrange them — the grid reflows live and your layout is saved
- **Pin / unpin** icons from the desktop (right-click → Unpin; right-click the wallpaper → Arrange icons restores the full set)
- **Keyboard navigation** — `Tab` / `Shift+Tab` to cycle, arrow keys to roam the grid, `Enter` to launch, `Esc` to deselect
- Click to select, **click again (or double-click) to open** — macOS click-to-open · right-click to rename/unpin
- **Lock screen** — optional 4-digit PIN, idle auto-lock, giant clock
- **Alt+Tab window switcher** with app tiles · **Alt+L** to lock
- Parallax wallpaper (respects reduce-motion)
- Context menus, macOS-style notifications, glassy modal dialogs

### Window manager (`nebwm`)
- Drag by title bar (double-click to maximize)
- 8-way resize handles
- **Edge snapping** — drag to the top/left/right edge for half/full screen with a live ghost preview
- Minimize/maximize/restore animations, z-order focus

### 19 applications
| App | What it does |
| --- | --- |
| ⬛ Terminal | Multi-tab shell over the virtual FS: `ls cd cat tree find df ps top uname ping cowsay sl matrix fortune edit theme open neofetch sudo …` — arrow-key history, 25+ commands |
| 📁 Files | File manager over a **localStorage-backed virtual filesystem** — breadcrumbs, folders, viewers, **⬆ import files from your disk, ⬇ export back** |
| ⌨️ Code Editor | Syntax highlighting (JS/CSS/HTML/JSON), create/save files to the FS, Ln/Col status, Tab insert |
| 📝 Notes | Multi-note editor with autosave |
| 🎨 Paint | Canvas drawing — brushes, colors, eraser, save as PNG |
| 🎛️ Beat Deck | **16-step Web Audio sequencer** — program kick/snare/hat/bass, tempo, live playback |
| 🌐 Nebula Web | Built-in browser with internal start page, history, new-tab fallback |
| ▶️ YouTube | Plays any watch/shorts/youtu.be/playlist link via the official embed player — oEmbed title + author metadata, thumbnails, **Recently played** history |
| 🗺️ Maps | Live OpenStreetMap with **geocoded search** (type any address, get results chips), 10 city shortcuts, geolocation, open-full-map |
| 🧮 Calculator | Expression calculator with keyboard support and history |
| 🕰️ Clock | Analog + digital, **world clocks**, stopwatch with laps, countdown timers |
| 🌦️ Weather | **Live weather** (Open-Meteo, no API key) — 12 cities, geolocation, 24h forecast, offline cache |
| 📊 System Monitor | Animated CPU/RAM charts + live process table |
| 📅 Calendar | Month grid with navigation |
| 🐍 Snake | Classic Snake — arrow/WASD, speed-up, persistent high score |
| 📈 Stocks | **Live crypto markets** (CoinGecko, no key) — price, 24h change, live badge, sample-data fallback, manual refresh |
| ✅ Reminders | Persistent to-do list — add / tick / delete with progress counter (localStorage) |
| ⚙️ Settings | Theme, accent color, 6 wallpapers, sound, reduce motion, **language (8)**, PIN, idle lock, reset |
| 🪐 About | System info & shortcuts |

### World-class details
- **8 languages** — English, Español, Français, Deutsch, Português, 日本語, हिन्दी, العربية (**RTL**) — switch live in Settings
- Web Audio UI sounds + boot chime, all optional
- Everything persists in `localStorage`; **Settings → Reset workspace** wipes it clean
- **Installable PWA** — manifest + service worker; the whole shell loads offline once visited
- `df` in the terminal reports your *actual* localStorage usage
- Console API: `Nebula.openApp('snake')`, `Nebula.FS.list('/home/guest')`, `Nebula.OS.setLanguage('ja')`

## ⌨️ Shortcuts
| Keys | Action |
| --- | --- |
| `⌘/Ctrl + Space` | Spotlight — apps, files, math, actions |
| `` ⌘/Ctrl + ` `` | Mission Control — window overview |
| `Alt + Tab` / `Alt + Shift + Tab` | Cycle open windows |
| `Alt + L` | Lock the screen |
| `Esc` | Close menus / switcher / Spotlight / Mission Control |

## 🖥️ Run it locally
```bash
# it's a static site — just open it
open index.html            # macOS
xdg-open index.html        # Linux

# or serve it
python3 -m http.server 8080
```

## 🚀 Deploy to GitHub Pages
1. Push this folder to a repo (e.g. `nebula-os`).
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch** → `main` / `(root)`.
3. Your OS lives at `https://<you>.github.io/nebula-os/`.

## 📁 Project structure
```
index.html        page skeleton (boot, desktop, lock screen, taskbar, alt-tab)
css/style.css     the entire design system (glassmorphism, themes, all apps)
js/fs.js          virtual filesystem (in-memory tree, localStorage persistence)
js/i18n.js        8-language UI dictionary + RTL
js/os.js          kernel: window manager, lock, alt-tab, parallax, i18n, idle
js/apps.js        terminal, files, notes, paint, beat deck, browser, monitor, calendar, settings, about
js/apps-extra.js  calculator, clock, code editor, weather, snake, youtube, maps, stocks, reminders
sw.js             service worker — offline-first shell cache
manifest.webmanifest  PWA manifest (installable, standalone)
```

## 🛠️ Console API
```js
Nebula.openApp('terminal')
Nebula.openApp('weather')
Nebula.FS.list('/home/guest')
Nebula.OS.setLanguage('ar')   // instant RTL
Nebula.lockScreen()
```

---
*Made with ♥ in the browser. v2.0.0 — World Edition*
