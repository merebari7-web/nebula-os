# 🪐 Nebula OS

**An operating system for the web.** A complete desktop environment that runs 100% inside a browser tab — macOS-style menu bar, dock with magnification, Spotlight, Mission Control, an offline AI-free assistant, virtual filesystem with real file import/export, live crypto markets, live weather, live maps, YouTube player, code editor, beat sequencer, 27 apps, **an Android compatibility layer** (install real APKs, run apps through their official web versions), 8 languages, RTL support — and it's **installable as a PWA** with an offline shell. No frameworks, no build step, no dependencies. Just HTML, CSS and vanilla JavaScript.

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

### 🤖 Android compatibility (v2.1)
- **Install real APKs** — drop an `.apk` on the Android app (or browse to it). Nebula parses the actual archive (ZIP central directory + DEFLATE via `DecompressionStream`), reads `AndroidManifest.xml` for the **package name and version**, and extracts the app's **icon** from `res/mipmap*/ic_launcher.png`
- **Android launcher** — home screen grid of your installed apps, live clock status bar, per-app session windows with Android chrome (status bar, back/home/recents nav)
- **Web-bridge runtime** — every launched app runs through its **official web version**: embedded in the window where the site allows it, with one-tap "open externally" otherwise (WhatsApp Web, Telegram, Instagram, Spotify, Netflix, Twitch, Gmail, …); some launch natively through their Nebula equivalents (YouTube → Nebula YouTube, Maps → Nebula Maps)
- **App Center** — curated catalog of 19 popular apps with one-tap install, search, and recents
- **Files integration** — `.apk` files get the 🤖 icon; double-click to hand them to the Android runtime
- Honest about physics: browsers can't execute Android bytecode — the runtime is a compatibility bridge, and the info screen says so for packages with no web version

### 🔊 Sound Edition (v2.10)
- **Sound pack** — fully synthesized (Web Audio, zero files): notification chime, lock/unlock, TV-mode sweep, power-down arpeggio, boot start, plus the existing open/close/pop/fail. Every sound honors the master switch
- **Settings → Sound** — new **volume slider** (0–100%, persisted) and a **Test** button; volume scales every system sound

### 🌊 Flow Edition (v2.9)
- **Window Flow** — snap any window with the **keyboard or the Window menu**: Alt+← / Alt+→ for half-screen, Alt+↑ maximize, Alt+↓ restore. Mouse edge-snapping shares the same engine (saved-rect restore included)
- **Screen-reader announcements** for every window state change: snapped left/right, maximized, restored
- Shortcuts reference (**?**) lists the new Flow keys

### 🖥️ Living Desktop Edition (v2.8)
- **Today widget** — a live desktop card: today's date, tasks due/overdue, this month's budget net, and the next up to 3 due tasks; every row launches the right app, auto-refreshes every 30 s
- **Task reminders** — when a task hits its due date (or slips past it) you get a toast; each task is reminded at most once per day, and every reminder is audit-logged
- **Notes → HTML** — one click publishes the current note as a clean, standalone, styled HTML page (markdown rendered, fully offline, safe: everything escaped)

### 🔗 Connections & Data Edition (v2.7)
- **Calendar ↔ Tasks** — the calendar now shows due-date dots (blue = due, red = overdue, dim = done); click any day for its task list
- **Notes markdown** — built-in zero-dependency markdown renderer (headings, bold/italic, inline & fenced code, lists, quotes, hr, links) with an Edit/Preview toggle and Copy-Markdown button
- **Budget CSV** — export the whole ledger as CSV and import it back (round-trips with any spreadsheet)
- **Spotlight local search** — Ctrl/⌘+Space now finds your **notes, contacts, tasks and budget entries** (up to 4 data hits per query), alongside apps, files and math

### 📈 Productivity Edition (v2.6)
- **Tasks** — local task manager: due dates, three priorities, live filters (All / Today / Overdue / Done), overdue flags, open-count footer, clear-done
- **Budget** — local income/expense ledger: per-month income, expenses and net cards, categories, per-entry delete, signed amounts
- **Shortcuts reference** — press **?** (or Nebula menu → Shortcuts) for a grouped keyboard-shortcut cheat sheet; fully translated, Esc to close

### 🧭 New Apps (v2.5)
- **Contacts** — a local people manager: add/edit/delete, live search, and real **vCard (.vcf) + CSV export/import** for round-tripping with any phone or address book. Stored locally, nothing uploaded
- **Music** — a local audio player: import MP3/WAV/OGG files and play them with Web Audio (seek, volume, prev/next, animated now-playing). Plus three built-in Web-Audio-synthesized demo tracks (Nebula Drift, Orbit Pulse, Starfall Arp). Honest physics: tracks play in-memory per session and never leave your device
- **Backup** — one-file data portability: **Create backup** downloads a single JSON bundle of *everything* Nebula stores (files, notes, contacts, settings, audit log, Android installs); **Restore** validates and re-imports it. Air-gapped by design
- **Onboarding tour** — a five-step first-launch guided tour (desktop, windows & keyboard, Spotlight/terminal, security & data, TV/Android/i18n); auto-shown once, restartable from the Nebula menu

### 🏛️ Government Edition (v2.4)
- **Audit trail** — a capped local event log (boot, app open/close, lock/unlock, PIN changes, theme/wallpaper, file import/export, Android installs, TV launches, data wipes) with its own **Audit Log app**: read-only table, JSON export, confirm-protected clear; also `audit` in the terminal
- **Hardened PIN** — the lock PIN is now a **salted SHA-256 digest** (pure-JS implementation, zero dependencies); legacy cleartext PINs are transparently migrated and destroyed at boot
- **Strict CSP** — `script-src 'self'`, no eval anywhere (the calculator/assistant math engine is a dedicated bounded parser), no plugins, locked base-uri/form-action; outbound connections are allow-listed
- **Section 508 / WCAG 2.1 AA work** — full arrow-key window move/resize from the title bar, arrow-key menubar menu navigation, screen-reader event announcements (window opened/closed, lock), contrast-computed button ink for any accent color, `docs/a11y.html` conformance statement
- **Connectivity status** — the tray wifi icon dims and the OS announces when you go offline/online (events are audited)
- **Data governance** — Settings → Security → **Erase all local data** (double-confirmed, audited)

### 📺 TV Edition (v2.4)
- **TV Mode** — a real 10-foot interface: full-screen launcher for all 22 apps + the streaming catalog, navigable entirely with arrow keys (D-pad/remote), Enter and Esc, with oversized focus targets and a live clock; open it from View menu → TV Mode, the TV app, or `tv` in the terminal
- **Living Room catalog** — the apps you'd expect on a modern smart TV (YouTube, Netflix, Prime Video, Disney+, Max, Apple TV+, Paramount+, Peacock, DAZN, ESPN, BBC iPlayer, Crunchyroll, Plex, Pluto, Tubi, Twitch, TikTok, Sling, Vudu, Web Browser), each launching through its **official web version**
- Honest about physics, like the Android layer: browsers can't run TV operating systems — embeddable services embed, the rest get a clean full-screen window with one tap to the official site, and your account/subscription/watch progress are unchanged

### 🎆 Patriot Edition (v2.3)
- **Patriot theme** — a full third theme in Settings: navy glass, gold strokes, gold accent (boot emblem, dock, buttons, focus ring all follow it), persisted like the others
- **Celebrate 🎆** — View menu → Celebrate, right-click the desktop, or `fireworks` in the terminal: canvas rockets in red/white/blue/gold, additive spark bursts, a soft synth pop per launch; auto-ends in ~12 s or on Esc, and politely skips (with a notice) when Reduce Motion is on
- **Liberty & Old Glory wallpapers** — gold starfield and crimson-navy abstracts, pure CSS, zero image bytes
- **Design system & accessibility** (v2.2.0) — design tokens, a global keyboard focus ring, ARIA menu/dialog/live-region semantics, Reduce-Motion support, safe-area-aware mobile layout

### macOS-style shell
- **Top menu bar** — Apple menu, File / Edit / View / Window menus (all with real actions), right-side status icons and live clock; hover-switches between open menus, `Esc` closes
- **Dock** — frosted glass, **icon magnification on hover** (CSS transforms, rAF-throttled), running-app indicator dots, tooltips, Launchpad rocket, and a **show-desktop edge** (minimize all / click again to restore)
- **Launchpad** — app grid with live search, opened from the dock
- **Windows with traffic lights** — red/yellow/green controls with hover glyphs, centered titles, rounded corners; **window positions persist** in localStorage and are restored on relaunch
- Sonoma/Sequoia-style gradient wallpapers · macOS blue accent · top-right notifications
- Real shortcuts: `⌘/Ctrl+Space` Spotlight · `` ⌘/Ctrl+` `` Mission Control · `⌘/Ctrl+N` new note · `⌘/Ctrl+T` terminal · `⌘/Ctrl+D` next wallpaper · `⌃⌘Q` lock

### Interactive desktop
- Boot sequence → desktop with **20 app icons** (right-aligned, like macOS)
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

### 20 applications
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
| 🤖 Android | **APK installer + Android runtime** — real archive parsing, app icons, session windows, web-bridge launch, App Center |
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
js/android.js     Android compatibility layer (APK parser, launcher, sessions, web bridges)
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
*Made with ♥ in the browser. v2.10.0 — Sound Edition*
