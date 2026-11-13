import { launch, shutdown, sleep } from '../../qa/cdp.mjs';
import os from 'node:os';
import JSZip from 'jszip';

console.log('================================================================');
console.log('             LIRUNE READER PERFORMANCE BENCHMARK SUITE          ');
console.log('================================================================');
console.log(`OS: ${os.type()} ${os.release()} (${os.arch()})`);
console.log(`Node: ${process.version}`);
console.log(`CPUs: ${os.cpus().length} × ${os.cpus()[0]?.model || 'Generic'}`);
console.log(`Total RAM: ${(os.totalmem() / (1024 * 1024 * 1024)).toFixed(2)} GB`);
console.log('----------------------------------------------------------------\n');

function stats(timings) {
  const sorted = [...timings].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const median = sorted[Math.floor(sorted.length / 2)];
  const avg = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  const spread = max - min;
  return { min, max, median, avg, spread };
}

let cdp = null;

try {
  // 1. App Startup Benchmark (Enforced Gate: < 8,000ms)
  console.log('[Gate 1/4] Measuring App Cold Startup Latency...');
  const startupStart = performance.now();
  cdp = await launch({ freshUserData: true });
  const startupDuration = performance.now() - startupStart;
  console.log(`  Startup Time: ${startupDuration.toFixed(1)}ms [Threshold: < 8,000ms]`);
  if (startupDuration > 8000) {
    throw new Error(`Startup took ${startupDuration.toFixed(1)}ms, exceeding 8,000ms budget`);
  }

  // 2. Large Text Document Parsing Benchmark (10,000 lines) (Enforced Gate: median < 700ms)
  console.log('\n[Gate 2/4] Benchmarking Large Document Parse & Flow (10,000 lines)...');
  const parseTimings = [];
  for (let iter = 0; iter < 5; iter++) {
    const duration = await cdp.eval(`
      const lines = [];
      for (let i = 0; i < 10000; i++) {
        lines.push('Paragraph ' + i + ': It was the best of times, it was the worst of times in the digital reading world.');
      }
      const rawText = lines.join('\\n\\n');
      const bytes = new TextEncoder().encode(rawText);

      const record = { id: 'perf-doc-' + ${iter}, title: 'Perf Book', format: 'txt', fileData: bytes.buffer };
      const host = document.createElement('div');
      document.body.appendChild(host);

      const t0 = performance.now();
      const adapter = new TextAdapter.Adapter(host, record);
      await adapter.open();
      const elapsed = performance.now() - t0;

      adapter.destroy();
      host.remove();

      return elapsed;
    `);
    parseTimings.push(duration);
  }

  const parseStats = stats(parseTimings);
  console.log(`  5 Runs: min=${parseStats.min.toFixed(1)}ms, median=${parseStats.median.toFixed(1)}ms, max=${parseStats.max.toFixed(1)}ms, spread=${parseStats.spread.toFixed(1)}ms [Threshold: median < 700ms]`);
  if (parseStats.median > 700) {
    throw new Error(`Document parsing median ${parseStats.median.toFixed(1)}ms exceeded 700ms budget`);
  }

  // 3. Application Archive Inspection Pipeline (Enforced Gate: median < 400ms)
  console.log('\n[Gate 3/4] Benchmarking Application Archive Inspection Pipeline (BookFormat.detect)...');
  const testZip = new JSZip();
  testZip.file('mimetype', 'application/epub+zip');
  testZip.file('META-INF/container.xml', '<container/>');
  for (let i = 0; i < 300; i++) {
    testZip.file(`OEBPS/ch_${i}.xhtml`, `chapter content ${i}`);
  }
  const zipBuffer = await testZip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
  const zipBase64 = zipBuffer.toString('base64');

  const archiveTimings = [];
  for (let iter = 0; iter < 5; iter++) {
    const duration = await cdp.eval(`
      const b64 = "${zipBase64}";
      const bin = atob(b64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);

      const t0 = performance.now();
      const detected = await BookFormat.detect('archive_test.epub', buf.buffer);
      const elapsed = performance.now() - t0;
      if (detected.id !== 'epub') throw new Error('Failed to detect EPUB in archive benchmark');
      return elapsed;
    `);
    archiveTimings.push(duration);
  }

  const archiveStats = stats(archiveTimings);
  console.log(`  5 Runs: min=${archiveStats.min.toFixed(1)}ms, median=${archiveStats.median.toFixed(1)}ms, max=${archiveStats.max.toFixed(1)}ms, spread=${archiveStats.spread.toFixed(1)}ms [Threshold: median < 400ms]`);
  if (archiveStats.median > 400) {
    throw new Error(`Archive inspection median ${archiveStats.median.toFixed(1)}ms exceeded 400ms budget`);
  }

  // 4. Memory Growth Regression Gate (Enforced Gate: net heap growth < 40MB across 10 document cycles)
  console.log('\n[Gate 4/4] Benchmarking Renderer Memory Footprint & Lifecycle Growth Budget...');
  const memResult = await cdp.eval(`
    const getHeap = () => performance && performance.memory ? performance.memory.usedJSHeapSize : null;
    const initialHeap = getHeap();

    // Repeated document mount/destroy cycles
    for (let c = 0; c < 10; c++) {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const bytes = new TextEncoder().encode('Cycle ' + c + ': Sample narrative content paragraph.\\n\\nSecond line.');
      const adapter = new TextAdapter.Adapter(host, { id: 'mem-' + c, title: 'Mem', format: 'txt', fileData: bytes.buffer });
      await adapter.open();
      adapter.destroy();
      host.remove();
    }

    const finalHeap = getHeap();
    if (initialHeap && finalHeap) {
      const deltaBytes = finalHeap - initialHeap;
      const deltaMB = deltaBytes / (1024 * 1024);
      return {
        initialMB: (initialHeap / (1024 * 1024)).toFixed(2),
        finalMB: (finalHeap / (1024 * 1024)).toFixed(2),
        deltaMB: deltaMB.toFixed(2),
        supported: true
      };
    }
    return { supported: false, note: 'performance.memory not exposed in this environment' };
  `);

  if (!memResult.supported) {
    throw new Error('Renderer memory measurement unavailable: ' + (memResult.note || 'performance.memory is undefined'));
  }
  console.log(`  Memory Lifecycle (10 cycles): Initial=${memResult.initialMB}MB, Final=${memResult.finalMB}MB, Delta=${memResult.deltaMB}MB [Threshold: growth < 40MB]`);
  if (Number(memResult.deltaMB) > 40) {
    throw new Error(`Memory heap grew by ${memResult.deltaMB}MB, exceeding 40MB budget`);
  }

  // Diagnostic (Non-enforced metric for contributor info)
  console.log('\n[Diagnostic] Measuring Reader Theme Switching Latency (14 Themes)...');
  const themeTimings = await cdp.eval(`
    const themes = ThemeManager.READER_THEMES.filter(t => t !== 'custom');
    const timings = [];
    for (const theme of themes) {
      const t0 = performance.now();
      ThemeManager.setReaderTheme(theme);
      timings.push(performance.now() - t0);
    }
    return timings;
  `);
  const themeStats = stats(themeTimings);
  console.log(`  14 Theme Switches: min=${themeStats.min.toFixed(2)}ms, median=${themeStats.median.toFixed(2)}ms, max=${themeStats.max.toFixed(2)}ms, spread=${themeStats.spread.toFixed(2)}ms`);

  console.log('\n================================================================');
  console.log('          ALL PERFORMANCE REGRESSION GATES PASSED!              ');
  console.log('================================================================\n');
} catch (err) {
  console.error('✖ Performance Benchmark Failed:', err);
  process.exitCode = 1;
} finally {
  if (cdp) {
    try {
      await shutdown(cdp);
    } catch {}
  }
  process.exit(process.exitCode || 0);
}
