import { launch, shutdown, sleep } from './cdp.mjs';
import path from 'node:path';
import os from 'node:os';

const CORPUS = path.join(os.tmpdir(), 'kilo', 'lirune-corpus');

const cdp = await launch({ freshUserData: true });
try {
  console.log('boot ok');
  const globals = await cdp.eval(`
    return {
      BookFormat: typeof BookFormat,
      Reader: typeof Reader,
      ZoomControl: typeof ZoomControl,
      PdfAdapter: typeof PdfAdapter,
      CbzAdapter: typeof CbzAdapter,
      TextAdapter: typeof TextAdapter,
      HtmlAdapter: typeof HtmlAdapter,
      Fb2Adapter: typeof Fb2Adapter,
      EpubReaderAdapter: typeof EpubReaderAdapter,
      readerZoom: document.getElementById('reader-zoom-control')?.getBoundingClientRect().width,
      homeZoom: document.getElementById('home-zoom-control')?.getBoundingClientRect().width
    };
  `);
  console.log('globals', JSON.stringify(globals, null, 1));

  const detect = await cdp.eval(`
    const out = {};
    const probe = async (name) => {
      const res = await fetch('data:text/plain,x').catch(() => null);
      return res ? 'ok' : 'no';
    };
    out.probe = await probe();
    out.detectEpub = (await BookFormat.detect('a.epub', new Uint8Array([0x50,0x4b,0x03,0x04]).buffer)).id;
    out.detectPdf = (await BookFormat.detect('a.pdf', new Uint8Array([0x25,0x50,0x44,0x46,0x2d]).buffer)).id;
    out.detectCbr = (await BookFormat.detect('a.cbr', new Uint8Array(200).fill(0x52))).id;
    return out;
  `);
  console.log('detection', JSON.stringify(detect, null, 1));
} catch (e) {
  console.error('ERR', e);
} finally {
  console.log('--- app console errors ---');
  console.log(cdp.errors.slice(0, 15).join('\n') || '(none)');
  await shutdown(cdp);
}
