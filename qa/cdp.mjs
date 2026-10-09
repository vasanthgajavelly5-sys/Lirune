/**
 * QA-only Chrome DevTools Protocol driver for Lirune Reader.
 * Launches the real Electron app (same command as Launch-Lirune.bat, plus a
 * remote debugging port so the test script can inspect and drive the UI) and
 * exposes helpers to evaluate expressions, send real key events and capture
 * screenshots. Not shipped: this directory is dev tooling only.
 */
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT = Number(process.env.LIRUNE_CDP_PORT || 9222);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error(`CDP endpoint never came up: ${url}`);
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.logs = [];
    this.errors = [];
    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} ${JSON.stringify(msg.error.data || '')}`));
        else resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || [])
          .map(a => (a.value !== undefined ? a.value : a.description || a.type))
          .join(' ');
        this.logs.push({ type: msg.params.type, text });
        if (msg.params.type === 'error') this.errors.push(text);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        this.errors.push(d.exception?.description || d.text);
      }
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        // The URL is the only part that identifies a failed file load, so it
        // has to survive into the collected error or the failure is unreadable.
        const entry = msg.params.entry;
        this.errors.push(`[${entry.source}] ${entry.text}${entry.url ? ` (${entry.url})` : ''}`);
      }
    });
  }

  send(method, params = {}, timeout = 30000) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, timeout);
    });
  }

  async eval(expression, timeout = 30000) {
    const res = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true
    }, timeout);
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result.value;
  }

  async key(key, { code, ctrl = false, shift = false, alt = false, meta = false } = {}) {
    const modifiers = (alt ? 1 : 0) | (ctrl ? 2 : 0) | (meta ? 4 : 0) | (shift ? 8 : 0);
    const info = KEY_INFO[key] || { keyCode: key.toUpperCase().charCodeAt(0), code: code || '' };
    const base = { modifiers, key, code: code || info.code, windowsVirtualKeyCode: info.keyCode };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await sleep(60);
  }

  async click(selector) {
    return this.eval(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('no element for ' + ${JSON.stringify(selector)});
      el.click();
      return true;
    `);
  }

  async waitFor(expression, { timeout = 20000, label = expression } = {}) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = await this.eval(`return (${expression});`).catch(() => undefined);
      if (value) return value;
      await sleep(250);
    }
    throw new Error(`waitFor timed out: ${label}`);
  }

  async screenshot(file) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
    return file;
  }

  /** Import a local file through the app's real drop/import path. */
  async importFile(filePath) {
    const buf = fs.readFileSync(filePath);
    const name = path.basename(filePath);
    // Chunks are concatenated before atob, so a chunk must hold a whole
    // number of base64 triples. A chunk that is not a multiple of three bytes
    // shifts every byte after the first boundary, which quietly corrupts the
    // file instead of failing loudly.
    const CHUNK = 3 * 512 * 1024;
    await this.eval(`
      window.__qaChunks = [];
      window.__qaName = ${JSON.stringify(name)};
      window.__qaType = ${JSON.stringify(mimeFor(filePath))};
      return true;
    `);
    for (let off = 0; off < buf.length; off += CHUNK) {
      const slice = buf.subarray(off, Math.min(off + CHUNK, buf.length));
      // Chunks are concatenated before atob, so base64 padding must be
      // stripped from every chunk but the last one.
      const b64 = slice.toString('base64');
      const isLast = off + CHUNK >= buf.length;
      await this.eval(`window.__qaChunks.push("${isLast ? b64 : b64.replace(/=+$/, '')}"); return window.__qaChunks.length;`);
    }
    return this.eval(`
      const bin = atob(window.__qaChunks.join(''));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      window.__qaChunks = null;
      const file = new File([bytes], window.__qaName, { type: window.__qaType });
      const dt = new DataTransfer();
      dt.items.add(file);
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      return { name: window.__qaName, size: bytes.length };
    `, 120000);
  }
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.epub': 'application/epub+zip',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.fb2': 'application/x-fictionbook+xml',
    '.cbz': 'application/vnd.comicbook+zip',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.cbr': 'application/vnd.comicbook-rar',
    '.azw3': 'application/vnd.amazon.ebook',
    '.mobi': 'application/x-mobipocket-ebook'
  }[ext] || 'application/octet-stream';
}

const KEY_INFO = {
  ArrowRight: { keyCode: 39, code: 'ArrowRight' },
  ArrowLeft: { keyCode: 37, code: 'ArrowLeft' },
  ArrowUp: { keyCode: 38, code: 'ArrowUp' },
  ArrowDown: { keyCode: 40, code: 'ArrowDown' },
  Escape: { keyCode: 27, code: 'Escape' },
  Enter: { keyCode: 13, code: 'Enter' },
  ' ': { keyCode: 32, code: 'Space' },
  Tab: { keyCode: 9, code: 'Tab' }
};

export async function launch({ freshUserData = false, extraArgs = [] } = {}) {
  const userDataDir = process.env.LIRUNE_USER_DATA
    || path.join(ROOT, '.qa-userdata');
  if (freshUserData && fs.existsSync(userDataDir)) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
  const isPackaged = Boolean(process.env.LIRUNE_BIN);
  const electron = process.env.LIRUNE_BIN
    || path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
  // This machine exports ELECTRON_RUN_AS_NODE=1 for tooling, which would make
  // the Electron binary behave as plain Node. The launcher BAT does not inherit
  // that, so strip it here to reproduce real application behaviour.
  const env = { ...process.env, ELECTRON_ENABLE_LOGGING: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const launchArgs = isPackaged
    ? [`--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`, ...extraArgs]
    : ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`, ...extraArgs];
  const child = spawn(electron, launchArgs, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env });

  let stdout = '';
  child.stdout.on('data', d => { stdout += d.toString(); });
  child.stderr.on('data', d => { stdout += d.toString(); });

  const targets = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = targets.find(t => t.type === 'page' && t.url.includes('index.html')) || targets.find(t => t.type === 'page');
  if (!page) throw new Error('No page target found');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const cdp = new Cdp(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Log.enable');
  cdp.child = child;
  cdp.output = () => stdout;

  try {
    await cdp.waitFor(`typeof App !== 'undefined' && typeof Library !== 'undefined' && !document.getElementById('lib-loading')?.classList.contains('hidden') === false`, { label: 'app bootstrap', timeout: 40000 });
  } catch (error) {
    console.error('BOOT OUTPUT\n' + stdout.slice(-3000));
    throw error;
  }
  return cdp;
}

export async function shutdown(cdp) {
  try {
    await cdp.eval(`window.closeAllWindows && window.closeAllWindows(); return true;`).catch(() => {});
    await cdp.send('Browser.close').catch(() => {});
  } catch {
    /* ignore */
  }
  try {
    cdp.ws?.close();
  } catch {
    /* ignore */
  }
  if (cdp.child) {
    try {
      cdp.child.stdout?.destroy();
      cdp.child.stderr?.destroy();
    } catch {
      /* ignore */
    }
    if (process.platform === 'win32' && cdp.child.pid) {
      try {
        spawnSync('taskkill', ['/F', '/T', '/PID', String(cdp.child.pid)], { stdio: 'ignore' });
      } catch {
        /* ignore */
      }
    } else {
      cdp.child.kill();
      await sleep(600);
      if (!cdp.child.killed) cdp.child.kill('SIGKILL');
    }
  }
}

export { sleep };
