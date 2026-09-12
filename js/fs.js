/* ============================================================
   NEBULA OS — virtual filesystem
   A tiny in-memory tree persisted to localStorage.
   ============================================================ */
(function () {
  'use strict';

  const LS_KEY = 'nebula.fs.v1';

  function VNode(name, type, content) {
    this.name = name;
    this.type = type;              // 'dir' | 'file'
    this.content = content || '';
    this.children = type === 'dir' ? [] : null;
    this.updated = Date.now();
  }

  /** Normalize a path: collapse slashes, resolve '.' and '..' */
  function normPath(path) {
    const abs = String(path || '/').replace(/\\/g, '/');
    const parts = abs.split('/');
    const out = [];
    for (const p of parts) {
      if (p === '' || p === '.') continue;
      if (p === '..') { out.pop(); continue; }
      out.push(p);
    }
    return '/' + out.join('/');
  }

  class VirtualFS {
    constructor() {
      this.root = new VNode('/', 'dir');
      this.load();
    }

    serialize() {
      const walk = (n) => ({
        name: n.name, type: n.type, content: n.content, updated: n.updated,
        children: n.children ? n.children.map(walk) : null
      });
      return JSON.stringify(walk(this.root));
    }

    save() {
      try { localStorage.setItem(LS_KEY, this.serialize()); } catch (e) { /* storage full/blocked */ }
    }

    load() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return false;
        const revive = (d) => {
          const n = new VNode(d.name, d.type, d.content);
          n.updated = d.updated || Date.now();
          if (n.type === 'dir' && Array.isArray(d.children)) {
            n.children = d.children.map(revive);
          }
          return n;
        };
        this.root = revive(JSON.parse(raw));
        return true;
      } catch (e) { return false; }
    }

    nodeAt(path) {
      const p = normPath(path);
      if (p === '/') return this.root;
      const parts = p.slice(1).split('/');
      let cur = this.root;
      for (const part of parts) {
        if (!cur || cur.type !== 'dir') return null;
        cur = cur.children.find((c) => c.name === part) || null;
      }
      return cur;
    }

    list(path) {
      const n = this.nodeAt(path);
      if (!n || n.type !== 'dir') return null;
      return n.children;
    }

    mkdir(path) {
      const p = normPath(path);
      if (this.nodeAt(p)) return this.nodeAt(p);
      const parts = p.slice(1).split('/');
      let cur = this.root;
      for (const part of parts) {
        let next = cur.children.find((c) => c.name === part);
        if (!next) { next = new VNode(part, 'dir'); cur.children.push(next); }
        if (next.type !== 'dir') return null;
        cur = next;
      }
      this.save();
      return cur;
    }

    createFile(path, content) {
      const p = normPath(path);
      if (this.nodeAt(p)) return null;
      const idx = p.lastIndexOf('/');
      const dir = idx <= 0 ? '/' : p.slice(0, idx);
      const parent = this.mkdir(dir);
      if (!parent) return null;
      const n = new VNode(p.slice(idx + 1), 'file', content || '');
      parent.children.push(n);
      this.save();
      return n;
    }

    writeFile(path, content) {
      const n = this.nodeAt(path);
      if (n && n.type === 'file') {
        n.content = content;
        n.updated = Date.now();
        this.save();
        return true;
      }
      return false;
    }

    rm(path) {
      const p = normPath(path);
      if (p === '/') return false;
      const idx = p.lastIndexOf('/');
      const dir = idx <= 0 ? '/' : p.slice(0, idx);
      const parent = this.nodeAt(dir);
      if (!parent || parent.type !== 'dir') return false;
      const i = parent.children.findIndex((c) => c.name === p.slice(idx + 1));
      if (i === -1) return false;
      parent.children.splice(i, 1);
      this.save();
      return true;
    }

    home() { return this.mkdir('/home/guest'); }
  }

  function seed(fs) {
    fs.mkdir('/home/guest/Desktop');
    fs.mkdir('/home/guest/Documents');
    fs.mkdir('/home/guest/Music');
    fs.mkdir('/home/guest/Pictures');
    fs.mkdir('/home/guest/Apps');
    fs.mkdir('/home/guest/Documents/notes');

    const put = (p, c) => { if (!fs.nodeAt(p)) fs.createFile(p, c); };

    put('/home/guest/Desktop/welcome.txt',
`Welcome aboard, pilot. 🚀

This is Nebula OS — a full desktop environment that
lives 100% inside your browser tab.

Things to try:
  • Double-click any desktop icon to launch an app
  • Drag windows around — they snap to the screen edges
  • Open the Terminal and type:  neofetch
  • Right-click the desktop for quick actions
  • Open Beat Deck and press Play (yes, it makes music)
  • Change your wallpaper in Settings

Everything you save (notes, settings, files) is stored
in this browser via localStorage.

— The Nebula Team`);

    put('/home/guest/Documents/readme.md',
`# Nebula OS

A tiny operating system written in **vanilla JavaScript** —
no frameworks, no build step, no dependencies.

## Architecture

    index.html      page skeleton
    css/style.css   the entire design system
    js/fs.js        virtual filesystem (localStorage-backed)
    js/os.js        kernel: window manager, taskbar, dialogs
    js/apps.js      every application

## Console API

Open the browser devtools and try:

    Nebula.openApp('terminal')
    Nebula.FS.list('/home/guest')`);

    put('/home/guest/Documents/todo.txt',
`- [x] Boot the universe
- [x] Ship the window manager
- [ ] Take a spacewalk
- [ ] Feed the orb`);

    put('/home/guest/Documents/notes/ideas.txt',
`ideas
-----
• a web OS that fits in a single tab
• music you can program with a sequencer
• windows that snap like glass`);

    put('/home/guest/Music/loop-idea.txt',
`kick  : 0 4 8 12
snare : 4 12
hat   : every 2nd step
bass  : 0 3 6 10 14

(Try this pattern in Beat Deck.)`);

    put('/home/guest/Apps/readme.txt',
`All apps are compiled into the kernel.
Use the Terminal:  open <app-id>
(e.g.  open terminal, open beat-deck)`);

    // A binary-ish file with no text viewer, to demo the "no viewer" path
    if (!fs.nodeAt('/home/guest/Pictures/starfield.png')) {
      fs.createFile('/home/guest/Pictures/starfield.png', '');
    }
  }

  const fs = new VirtualFS();
  if (!localStorage.getItem(LS_KEY)) seed(fs);
  fs.home();

  window.NebulaFS = { fs, normPath, seed };
})();
