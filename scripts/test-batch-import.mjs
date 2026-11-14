import { launch, shutdown, sleep } from '../qa/cdp.mjs';
import path from 'node:path';

const SAMPLES = [
  'C:/Users/vasanth/Downloads/Lirune_Live_Format_Tests/samples/primary/md/low/md_sample_low.md',
  'C:/Users/vasanth/Downloads/Lirune_Live_Format_Tests/samples/primary/rtf/medium/rtf_sample_medium.rtf',
  'C:/Users/vasanth/Downloads/Lirune_Live_Format_Tests/samples/primary/html/low/html_sample_low.html'
];

console.log('Testing sequential batch imports...');
const cdp = await launch({ freshUserData: true });

try {
  for (const samplePath of SAMPLES) {
    const filename = path.basename(samplePath);
    console.log(`\n--- Importing ${filename} ---`);

    // Ensure library view
    await cdp.eval(`
      if (typeof Reader !== 'undefined' && Reader.getAdapter && Reader.getAdapter()) {
        try { await Reader.close(); } catch {}
      }
      document.getElementById('archive-import-modal')?.classList.add('hidden');
      document.getElementById('reader-view')?.classList.add('hidden');
      document.getElementById('library-view')?.classList.remove('hidden');
      return true;
    `);

    const importRes = await cdp.importFile(samplePath);
    console.log('  Import dispatched:', importRes);

    // Wait for book in DB
    let found = null;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      found = await cdp.eval(`
        const list = await NoveraDB.getAllBooks();
        return list.find(b => b.originalName === ${JSON.stringify(filename)}) || null;
      `);
      if (found) break;
    }

    if (!found) {
      throw new Error(`Failed to find ${filename} in database!`);
    }
    console.log(`  Found in DB: ${found.id} ("${found.title}")`);

    // Open in reader
    await cdp.eval(`
      const b = await NoveraDB.getBook(${JSON.stringify(found.id)});
      document.getElementById('library-view')?.classList.add('hidden');
      document.getElementById('reader-view')?.classList.remove('hidden');
      await Reader.open(b);
      return true;
    `);

    await sleep(800);

    const check = await cdp.eval(`
      const isVisible = !document.getElementById('reader-view').classList.contains('hidden');
      const adapter = Reader.getAdapter();
      const content = document.getElementById('flow-content')?.textContent || document.getElementById('book-content')?.textContent || '';
      return {
        isVisible,
        hasAdapter: !!adapter,
        adapterName: adapter?.constructor?.name || null,
        contentLength: content.trim().length
      };
    `);
    console.log(`  Reader state for ${filename}:`, check);

    if (!check.isVisible || !check.hasAdapter) {
      throw new Error(`Reader failed to initialize adapter for ${filename}`);
    }

    // Immediately close reader and proceed
    await cdp.eval(`
      await Reader.close();
      document.getElementById('reader-view')?.classList.add('hidden');
      document.getElementById('library-view')?.classList.remove('hidden');
      return true;
    `);
    console.log(`  Closed reader for ${filename}.`);
  }
  console.log('\nALL 3 SAMPLES IMPORTED AND OPENED SUCCESSFULLY IN SEQUENTIAL BATCH!');
} finally {
  await shutdown(cdp);
}
