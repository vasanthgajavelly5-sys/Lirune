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
import os from 'node:os';
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

  /** Executes a function in page context passing structured JSON arguments via CDP CallArgument. */
  async callFn(fn, args = [], timeout = 30000) {
    const ctx = await this.send('Runtime.evaluate', { expression: 'globalThis' }, timeout);
    const res = await this.send('Runtime.callFunctionOn', {
      objectId: ctx.result.objectId,
      functionDeclaration: fn.toString(),
      arguments: args.map(value => ({ value })),
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
    const resolved = path.resolve(file);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(resolved, Buffer.from(res.data, 'base64'));
    return resolved;
  }

  /** Import a local file through the app's native file-input element via CDP DOM.setFileInputFiles. */
  async importFile(filePath) {
    const resolvedPath = path.resolve(filePath);
    const name = path.basename(resolvedPath);
    const stat = fs.statSync(resolvedPath);
    const doc = await this.send('DOM.getDocument', { depth: 1 });
    const input = await this.send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: '#file-input'
    });
    if (!input?.nodeId) {
      throw new Error('Could not locate #file-input element in DOM');
    }
    await this.send('DOM.setFileInputFiles', {
      nodeId: input.nodeId,
      files: [resolvedPath]
    });
    return { name, size: stat.size };
  }
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
  let userDataDir = process.env.LIRUNE_USER_DATA;
  let tempUserDataDir = null;

  if (freshUserData) {
    // Isolate this test run in its own unique temporary profile.
    // NEVER delete or mutate .qa-userdata or a user-specified LIRUNE_USER_DATA directory.
    tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lirune-qa-profile-'));
    userDataDir = tempUserDataDir;
  } else if (!userDataDir) {
    userDataDir = path.join(ROOT, '.qa-userdata');
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }
  }
  const isPackaged = Boolean(process.env.LIRUNE_BIN);
  const electron = process.env.LIRUNE_BIN
    || path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
  if (!isPackaged && !fs.existsSync(electron)) {
    const installScript = path.join(ROOT, 'node_modules', 'electron', 'install.js');
    if (fs.existsSync(installScript)) {
      console.log('Downloading Electron binary via install.js...');
      spawnSync(process.execPath, [installScript], { stdio: 'inherit', cwd: ROOT });
    }
  }
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

  let earlyExit = null;
  const onExit = (code, signal) => {
    earlyExit = { code, signal };
  };
  child.once('exit', onExit);

  let page = null;
  for (let i = 0; i < 40; i++) {
    if (earlyExit) {
      throw new Error(`Electron exited prematurely before CDP connection (code=${earlyExit.code}, signal=${earlyExit.signal}). Diagnostics output:\n${stdout.slice(-2000)}`);
    }
    try {
      const targets = await fetchJson(`http://127.0.0.1:${PORT}/json/list`, 5);
      page = targets.find(t => t.type === 'page' && t.url && t.url.includes('index.html'));
      if (page) break;
    } catch {}
    await sleep(300);
  }
  child.removeListener('exit', onExit);

  if (!page && earlyExit) {
    throw new Error(`Electron terminated during launch (code=${earlyExit.code}). Diagnostics output:\n${stdout.slice(-2000)}`);
  }
  if (!page) {
    throw new Error(`CDP connection failed: No page target found on port ${PORT}. Running: ${!child.killed}. Diagnostics output:\n${stdout.slice(-2000)}`);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const cdp = new Cdp(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');
  await cdp.send('Page.enable');
  await cdp.send('Log.enable');
  cdp.child = child;
  cdp.tempUserDataDir = tempUserDataDir;
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
    cdp.send('Browser.close', {}, 1000).catch(() => {});
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
      await sleep(300);
      if (!cdp.child.killed) cdp.child.kill('SIGKILL');
    }
  }

  // Clean up isolated temporary profile created for this test run
  if (cdp.tempUserDataDir && fs.existsSync(cdp.tempUserDataDir)) {
    try {
      fs.rmSync(cdp.tempUserDataDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export { sleep };
