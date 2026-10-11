import { launch, shutdown, sleep } from './cdp.mjs';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const cdp = await launch({ freshUserData: true });
try {
  console.log('--- Step 1: Open Welcome Book in Reader ---');
  await cdp.eval(`Library.generateSampleBook(); return true;`);
  await cdp.waitFor(`EpubLoader.isLoaded() && !document.getElementById('reader-view').classList.contains('hidden')`, { label: 'welcome book open', timeout: 30000 });
  await sleep(1000);
  check('Reader view loaded', true);

  console.log('--- Step 2: Test Fullscreen Mode and Floating Controls ---');
  // Click fullscreen toggle button
  await cdp.eval(`document.getElementById('fullscreen-btn').click(); return true;`);
  await sleep(500);

  const focusState = await cdp.eval(`
    const body = document.body;
    const controls = document.getElementById('focus-floating-controls');
    const tocBtn = document.getElementById('focus-toc-btn');
    const settingsBtn = document.getElementById('focus-settings-btn');
    const cs = window.getComputedStyle(controls);
    return {
      isFocusMode: body.classList.contains('focus-mode'),
      controlsVisible: cs.display !== 'none' && cs.visibility !== 'hidden',
      hasTocBtn: !!tocBtn,
      tocBtnDisabled: tocBtn ? tocBtn.hasAttribute('disabled') : null,
      hasSettingsBtn: !!settingsBtn
    };
  `);
  check('Focus mode activated on body', focusState.isFocusMode, JSON.stringify(focusState));
  check('Floating controls visible in fullscreen', focusState.controlsVisible, `display=${focusState.controlsVisible}`);
  check('TOC button present and enabled in fullscreen', focusState.hasTocBtn && !focusState.tocBtnDisabled);

  console.log('--- Step 3: Test TOC Drawer in Fullscreen Mode ---');
  // Click the fullscreen TOC button
  await cdp.eval(`document.getElementById('focus-toc-btn').click(); return true;`);
  await sleep(500);

  const tocState = await cdp.eval(`
    const panel = document.getElementById('toc-panel');
    const entries = panel.querySelectorAll('.toc-entry');
    const overlay = document.getElementById('panel-overlay');
    return {
      isOpen: panel.classList.contains('open'),
      entryCount: entries.length,
      firstEntryText: entries[0]?.textContent?.trim(),
      overlayVisible: overlay.classList.contains('visible')
    };
  `);
  check('TOC drawer opens in fullscreen mode', tocState.isOpen && tocState.entryCount > 0, JSON.stringify(tocState));
  check('TOC overlay is visible in fullscreen mode', tocState.overlayVisible);

  // Close TOC drawer using close button
  const closeDiag = await cdp.eval(`
    const btn = document.getElementById('close-toc-btn');
    const panel = document.getElementById('toc-panel');
    const beforeOpen = panel.classList.contains('open');
    if (btn) btn.click();
    return {
      beforeOpen,
      btnExists: !!btn,
      afterOpen: panel.classList.contains('open'),
      panelClasses: [...panel.classList]
    };
  `);
  check('TOC drawer closes cleanly in fullscreen mode', !closeDiag.afterOpen, JSON.stringify(closeDiag));

  // Exit fullscreen via setFocusMode or toggleFullscreen
  await cdp.eval(`
    if (typeof App !== 'undefined' && App.toggleFullscreen) App.toggleFullscreen();
    else document.getElementById('fullscreen-btn').click();
    return true;
  `);
  await sleep(400);
  const exitedFocus = await cdp.eval(`
    return {
      isFocusMode: document.body.classList.contains('focus-mode')
    };
  `);
  check('Focus mode cleanly exited', !exitedFocus.isFocusMode, JSON.stringify(exitedFocus));

  console.log('--- Step 4: Test Non-Fullscreen Desktop Window Widths & Congestion ---');
  // Test various non-fullscreen window widths
  const testWidths = [1200, 1000, 850, 720];

  for (const width of testWidths) {
    // Set device metrics to simulate window resize
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 700,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(300);

    const layout = await cdp.eval(`
      const toolbar = document.getElementById('reader-toolbar');
      const left = toolbar.querySelector('.toolbar-left');
      const center = toolbar.querySelector('.toolbar-center');
      const right = toolbar.querySelector('.toolbar-right');
      const actions = toolbar.querySelector('.toolbar-actions');
      const buttons = [...actions.querySelectorAll('.icon-btn')];
      const winControls = toolbar.querySelector('.window-controls');
      const title = document.getElementById('reader-title');
      const chapter = document.getElementById('progress-chapter');

      const actionsRect = actions.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      const centerRect = center.getBoundingClientRect();
      const leftRect = left.getBoundingClientRect();
      const winRect = winControls.getBoundingClientRect();

      // Check button bounding boxes: no button should wrap to a new line (all share roughly same top)
      const tops = buttons.map(b => Math.round(b.getBoundingClientRect().top));
      const allSameRow = tops.every(t => Math.abs(t - tops[0]) <= 2);

      // Check no horizontal overlap between actions and window controls
      const noWinOverlap = actionsRect.right <= winRect.left + 8; // allowing divider gap

      // Check center and right do not collide
      const noCenterOverlap = centerRect.right <= rightRect.left + 5;

      // Check left and center do not collide
      const noLeftOverlap = leftRect.right <= centerRect.left + 5;

      return {
        width: window.innerWidth,
        allSameRow,
        noWinOverlap,
        noCenterOverlap,
        noLeftOverlap,
        actionsWidth: Math.round(actionsRect.width),
        titleTruncated: title.scrollWidth >= title.clientWidth,
        buttonsCount: buttons.length
      };
    `);

    check(`Window width ${width}px: action buttons stay on a single row`, layout.allSameRow, `allSameRow=${layout.allSameRow}`);
    check(`Window width ${width}px: no overlap between actions and window controls`, layout.noWinOverlap);
    check(`Window width ${width}px: layout fits comfortably without congestion`, layout.noCenterOverlap && layout.noLeftOverlap, JSON.stringify(layout));
  }

  // Clear device metrics override
  await cdp.send('Emulation.clearDeviceMetricsOverride');

  console.log('\n=======================================');
  console.log(`FULLSCREEN & CONGESTION QA SUMMARY:`);
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}`);
  console.log('=======================================\n');

  if (failed > 0) process.exitCode = 1;
} catch (err) {
  console.error('Test execution error:', err);
  process.exitCode = 1;
} finally {
  await shutdown(cdp);
}
