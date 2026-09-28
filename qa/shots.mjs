/** Captures the settings views to the temp folder for a visual check. */
import { launch, shutdown, sleep } from './cdp.mjs';
import path from 'node:path';
import os from 'node:os';

const OUT = path.join(os.tmpdir(), 'kilo', 'lirune-shots');
const cdp = await launch({ freshUserData: true });
try {
  await sleep(1500);
  await cdp.screenshot(path.join(OUT, '1-library.png'));

  await cdp.eval(`
    document.getElementById('library-settings-btn').click();
    await new Promise(r => setTimeout(r, 700));
    return true;
  `);
  await cdp.screenshot(path.join(OUT, '2-quick-library.png'));

  await cdp.eval(`
    document.getElementById('expand-settings-btn').click();
    await new Promise(r => setTimeout(r, 700));
    return true;
  `);
  await cdp.screenshot(path.join(OUT, '3-full-library.png'));

  for (const id of ['reading', 'storage', 'about', 'accessibility', 'shortcuts']) {
    await cdp.eval(`
      document.querySelector('#full-settings-nav [data-section-target="${id}"]').click();
      await new Promise(r => setTimeout(r, 500));
      return true;
    `);
    await cdp.screenshot(path.join(OUT, `4-full-${id}.png`));
  }

  console.log('shots written to', OUT);
} finally {
  await shutdown(cdp);
}
