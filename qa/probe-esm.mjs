import { launch, shutdown } from './cdp.mjs';

const cdp = await launch({ freshUserData: true });
try {
  const res = await cdp.eval(`
    try {
      const m = await import('./node_modules/pdfjs-dist/build/pdf.min.mjs');
      return { ok: true, version: m.version, build: m.build, keys: Object.keys(m).slice(0, 12) };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  `);
  console.log('ESM import from file:// =>', JSON.stringify(res, null, 1));

  const res2 = await cdp.eval(`
    return {
      origin: location.origin,
      csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content,
      embedSupported: (() => { try { const e = document.createElement('embed'); e.type='application/pdf'; document.body.appendChild(e); const t = e.getAttribute('type'); e.remove(); return t; } catch(err){ return 'err'; } })()
    };
  `);
  console.log('page =>', JSON.stringify(res2, null, 1));
} catch (e) {
  console.error(e);
} finally {
  await shutdown(cdp);
}
