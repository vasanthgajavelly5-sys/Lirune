import { launch, shutdown, sleep } from './cdp.mjs';
import path from 'node:path';
import os from 'node:os';

const CORPUS = path.join(os.tmpdir(), 'kilo', 'lirune-corpus');

const cdp = await launch({ freshUserData: true });
try {
  await cdp.importFile(path.join(CORPUS, 'pg1342-ni.epub'));
  await cdp.waitFor(`document.querySelectorAll('#books-grid .book-card').length === 1`, { label: 'import', timeout: 60000 });
  await cdp.eval(`document.querySelector('#books-grid .book-card').click(); return true;`);
  await cdp.waitFor(`!document.getElementById('reader-view').classList.contains('hidden') && EpubLoader.isLoaded()`, { label: 'open', timeout: 60000 });

  for (const wait of [500, 1500, 4000]) {
    await sleep(wait);
    const snap = await cdp.eval(`
      const f = document.querySelector('#epub-container iframe');
      const d = f?.contentDocument;
      return {
        iframeSrc: f?.getAttribute('srcdoc') ? '(srcdoc)' : (f?.src || '(none)'),
        bodyHTML: (d?.body?.innerHTML || '').slice(0, 300),
        bodyTextLen: (d?.body?.innerText || '').length,
        imgs: d?.querySelectorAll('img')?.length,
        sheets: d?.styleSheets?.length,
        scrollW: d?.documentElement?.scrollWidth,
        clientW: d?.documentElement?.clientWidth,
        scrollH: d?.documentElement?.scrollHeight,
        clientH: d?.documentElement?.clientHeight
      };
    `);
    console.log(`t+${wait}`, JSON.stringify(snap, null, 1));
  }

  // Deep navigation diagnostics
  const nav = await cdp.eval(`
    const out = [];
    const f = () => document.querySelector('#epub-container iframe');
    for (let i = 0; i < 5; i++) {
      const before = f()?.contentDocument?.body?.innerText?.trim().slice(0, 30);
      document.getElementById('next-btn').click();
      await new Promise(r => setTimeout(r, 1000));
      const after = f()?.contentDocument?.body?.innerText?.trim().slice(0, 30);
      out.push({ before, after, pct: document.getElementById('page-info').textContent, cfi: (EpubLoader.getDebugCfi?.() || '').slice(0, 40) });
    }
    return out;
  `);
  console.log('NAV', JSON.stringify(nav, null, 1));

  const spine = await cdp.eval(`
    return {
      epubCount: document.querySelectorAll('#epub-container iframe').length,
      flow: ReaderSettings.getSettings().flow,
      containerClass: document.getElementById('epub-container').className,
      epubContainerChildren: document.getElementById('epub-container').children.length
    };
  `);
  console.log('STRUCT', JSON.stringify(spine, null, 1));
} catch (e) {
  console.error('ERR', e);
} finally {
  await shutdown(cdp);
}
