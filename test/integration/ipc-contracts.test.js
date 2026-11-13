const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Mock Electron before loading main.js
let permissionRequestHandler = null;
let permissionCheckHandler = null;
const registeredHandlers = new Map();
const registeredListeners = new Map();

const mockApp = {
  setAppUserModelId: () => {},
  requestSingleInstanceLock: () => true,
  on: () => {},
  quit: () => {},
  getPath: (name) => path.join(require('os').tmpdir(), 'lirune-test', name),
  whenReady: () => new Promise(() => {})
};

require.cache[require.resolve('electron')] = {
  exports: {
    app: mockApp,
    BrowserWindow: class {
      constructor() {
        this.webContents = {
          on: () => {},
          setWindowOpenHandler: () => {},
          send: () => {}
        };
      }
      isDestroyed() { return false; }
      isVisible() { return true; }
      isMaximized() { return false; }
      isFullScreen() { return false; }
      on() {}
      once() {}
      loadFile() {}
      show() {}
    },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    shell: { openExternal: () => {} },
    ipcMain: {
      handle: (channel, fn) => { registeredHandlers.set(channel, fn); },
      on: (channel, fn) => { registeredListeners.set(channel, fn); }
    },
    session: {
      defaultSession: {
        setPermissionRequestHandler: (fn) => { permissionRequestHandler = fn; },
        setPermissionCheckHandler: (fn) => { permissionCheckHandler = fn; }
      }
    }
  }
};

const mainModule = require('../../main.js');

test('IPC Contracts - Complete Parity Between Preload Invocations and Main Handlers', () => {
  const preloadSrc = fs.readFileSync(path.join(__dirname, '../../preload.js'), 'utf8');

  // Extract all ipcRenderer.invoke('channel') and ipcRenderer.send('channel')
  const invokeMatches = [...preloadSrc.matchAll(/ipcRenderer\.invoke\(['"]([^'"]+)['"]/g)].map(m => m[1]);
  const sendMatches = [...preloadSrc.matchAll(/ipcRenderer\.send\(['"]([^'"]+)['"]/g)].map(m => m[1]);

  assert.ok(invokeMatches.length > 10, 'Preload must define multiple IPC invoke channels');
  assert.ok(sendMatches.length >= 3, 'Preload must define window control send channels');

  // Check every invoke channel has a registered handler in main.js
  for (const channel of invokeMatches) {
    assert.ok(
      registeredHandlers.has(channel),
      `IPC invoke channel "${channel}" called by preload.js must have a matching handler registered in main.js`
    );
  }

  // Check every send channel has a registered listener in main.js
  for (const channel of sendMatches) {
    assert.ok(
      registeredListeners.has(channel),
      `IPC send channel "${channel}" called by preload.js must have a matching listener registered in main.js`
    );
  }
});

test('IPC Security - Sender Validation Against Untrusted Origins', () => {
  // Test isTrustedSender against trusted vs malicious frames
  const trustedSenderEvent = {
    senderFrame: {
      url: mainModule.EXPECTED_SHELL_URL
    }
  };

  assert.equal(mainModule.isTrustedSender(trustedSenderEvent), true, 'Internal shell URL must be authorized');

  const untrustedSenders = [
    { senderFrame: { url: 'https://evil.attacker.com' } },
    { senderFrame: { url: 'http://localhost:8080/injected.html' } },
    { senderFrame: { url: 'about:blank' } },
    { senderFrame: { url: 'data:text/html,<script>' } },
    { senderFrame: null },
    {}
  ];

  for (const maliciousEvent of untrustedSenders) {
    assert.equal(
      mainModule.isTrustedSender(maliciousEvent),
      false,
      `Untrusted sender (${maliciousEvent?.senderFrame?.url || 'null'}) must be rejected`
    );
  }
});

test('IPC Security - Pending Path Authorization Token Lifecycle', () => {
  const testPath = 'C:\\Books\\Secret Novel.epub';

  // 1. Issue token
  mainModule.authorizeBookPath(testPath);

  // 2. Consume token successfully
  const consumed = mainModule.consumeAuthorizedBookPath(testPath);
  assert.equal(consumed, true, 'First consumption of authorized path must succeed');

  // 3. Replay attack: second consumption must fail
  const replayConsumed = mainModule.consumeAuthorizedBookPath(testPath);
  assert.equal(replayConsumed, false, 'Replay consumption of same path must fail');

  // 4. Unauthorized arbitrary path must fail
  const unauthorizedConsumed = mainModule.consumeAuthorizedBookPath('C:\\Windows\\System32\\cmd.exe');
  assert.equal(unauthorizedConsumed, false, 'Arbitrary unissued path must fail');

  // 5. Revocation lifecycle
  const revokePath = 'C:\\Books\\ToRevoke.epub';
  mainModule.authorizeBookPath(revokePath);
  mainModule.revokeAuthorizedBookPath(revokePath);
  const afterRevoke = mainModule.consumeAuthorizedBookPath(revokePath);
  assert.equal(afterRevoke, false, 'Revoked path must not be consumable');
});
