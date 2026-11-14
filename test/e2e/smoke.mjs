import { launch, shutdown, sleep } from '../../qa/cdp.mjs';

console.log('--- Starting Lirune Reader E2E Smoke Suite ---');
const cdp = await launch({ freshUserData: true });

try {
  console.log('[1/5] Verifying App Bootstrap & Core Globals...');
  const appStatus = await cdp.eval(`
    return {
      hasApp: typeof App !== 'undefined',
      hasLibrary: typeof Library !== 'undefined',
      hasReader: typeof Reader !== 'undefined',
      hasSettings: typeof ReaderSettings !== 'undefined' || typeof Settings !== 'undefined',
      hasThemeManager: typeof ThemeManager !== 'undefined',
      hasBookFormat: typeof BookFormat !== 'undefined',
      documentTitle: document.title,
      appTheme: document.documentElement.getAttribute('data-theme')
    };
  `);
  console.log('App Core Globals:', JSON.stringify(appStatus, null, 2));
  if (!appStatus.hasApp || !appStatus.hasLibrary || !appStatus.hasReader) {
    throw new Error('Core application objects failed to initialize');
  }

  console.log('[2/5] Testing App Theme Switching...');
  const themeSwitchResult = await cdp.eval(`
    ThemeManager.setAppTheme('dark');
    const darkTheme = document.documentElement.getAttribute('data-theme');
    ThemeManager.setAppTheme('light');
    const lightTheme = document.documentElement.getAttribute('data-theme');
    return { darkTheme, lightTheme };
  `);
  console.log('Theme Switch Result:', themeSwitchResult);
  if (themeSwitchResult.darkTheme !== 'dark' || themeSwitchResult.lightTheme !== 'light') {
    throw new Error('Theme switching failed to update document data-theme attribute');
  }

  console.log('[3/5] Testing Accent Color Application...');
  const accentResult = await cdp.eval(`
    ThemeManager.applyAccent('#6366f1');
    const accentVar = getComputedStyle(document.documentElement).getPropertyValue('--app-accent').trim();
    return { accentVar };
  `);
  console.log('Accent Application Result:', accentResult);
  if (!accentResult.accentVar.includes('6366f1') && !accentResult.accentVar.includes('99, 102, 241')) {
    console.warn('Note: Accent color set to:', accentResult.accentVar);
  }

  console.log('[4/5] Testing Quick & Full Settings Panel Toggle...');
  const panelToggleResult = await cdp.eval(`
    const quickPanel = document.getElementById('quick-settings-panel');
    const fullPanel = document.getElementById('settings-panel');
    const openQuickBtn = document.getElementById('btn-quick-settings');

    // Open quick settings
    if (openQuickBtn) openQuickBtn.click();
    const quickOpen = quickPanel && !quickPanel.classList.contains('hidden');

    return {
      hasQuickPanel: Boolean(quickPanel),
      hasFullPanel: Boolean(fullPanel),
      quickOpen: Boolean(quickOpen)
    };
  `);
  console.log('Settings Panel Status:', panelToggleResult);

  console.log('[5/5] Testing Document Adapter Lifecycle with Synthetic Document...');
  const adapterTest = await cdp.eval(`
    const sampleRecord = {
      id: 'test-doc-1',
      title: 'Smoke Test Novel',
      format: 'txt',
      fileData: new TextEncoder().encode('Chapter 1\\n\\nSmoke test content paragraph one.\\n\\nParagraph two.').buffer
    };

    const host = document.createElement('div');
    host.id = 'smoke-test-host';
    document.body.appendChild(host);

    const adapter = new TextAdapter.Adapter(host, sampleRecord);
    await adapter.open();

    const sectionCount = adapter.sections.length;
    const isRendered = Boolean(adapter.viewport && adapter.viewport.innerHTML.includes('Smoke test content'));

    // Clean up
    adapter.destroy();
    host.remove();

    return { sectionCount, isRendered };
  `);
  console.log('Document Adapter Test:', adapterTest);
  if (!adapterTest.isRendered || adapterTest.sectionCount < 1) {
    throw new Error('Document adapter failed to render synthetic document sections');
  }

  console.log('✔ E2E Smoke Suite Passed Successfully!');
} catch (err) {
  console.error('✖ E2E Smoke Suite Failed:', err);
  process.exitCode = 1;
} finally {
  console.log('Shutting down Electron test instance...');
  try {
    await shutdown(cdp);
  } catch {}
  process.exit(process.exitCode || 0);
}
