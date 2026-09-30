const fs = require('fs');
const JSZip = require('jszip');

function resolveZipPath(baseDir, href) {
  let cleanHref = href.split('#')[0].split('?')[0];
  try {
    cleanHref = decodeURIComponent(cleanHref);
  } catch (_e) {}

  if (cleanHref.startsWith('/')) {
    cleanHref = cleanHref.substring(1);
  }

  const combined = baseDir ? `${baseDir}${cleanHref}` : cleanHref;
  const parts = combined.split('/');
  const resolved = [];

  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (resolved.length > 0) resolved.pop();
    } else {
      resolved.push(part);
    }
  }

  return resolved.join('/');
}

async function simulateLoad(file) {
  console.log('=== Simulating EpubReaderView on:', file);
  const data = fs.readFileSync(file);
  const zip = await JSZip.loadAsync(data);
  const containerFile = zip.file('META-INF/container.xml');
  const containerXml = await containerFile.async('text');
  const opfMatch = containerXml.match(/full-path=["']([^"']+)["']/i);
  const opfPath = opfMatch ? opfMatch[1] : 'OEBPS/content.opf';
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

  const opfXml = await zip.file(opfPath).async('text');

  // Parse manifest
  const manifest = {};
  const itemRegex = /<item\b[^>]*\bid=["']([^"']+)["'][^>]*\bhref=["']([^"']+)["'][^>]*\bmedia-type=["']([^"']+)["'][^>]*\/?>/gi;
  let itemMatch;
  while ((itemMatch = itemRegex.exec(opfXml)) !== null) {
    manifest[itemMatch[1]] = { href: itemMatch[2], mediaType: itemMatch[3] };
  }

  // Parse spine
  const spineIdrefs = [];
  const spineRegex = /<itemref\b[^>]*\bidref=["']([^"']+)["'][^>]*\/?>/gi;
  let spineMatch;
  while ((spineMatch = spineRegex.exec(opfXml)) !== null) {
    spineIdrefs.push(spineMatch[1]);
  }
  console.log('spineIdrefs length:', spineIdrefs.length);

  const loadedChapters = [];
  for (let i = 0; i < spineIdrefs.length; i++) {
    const idref = spineIdrefs[i];
    const manItem = manifest[idref];
    if (!manItem) {
      console.log('Item not in manifest:', idref);
      continue;
    }
    const itemPath = resolveZipPath(opfDir, manItem.href);
    const fileEntry = zip.file(itemPath);
    if (!fileEntry) {
      console.log('File entry not in zip:', itemPath);
      continue;
    }
    let rawHtml = await fileEntry.async('text');
    loadedChapters.push({ id: idref, title: `Chapter ${i + 1}`, len: rawHtml.length });
  }

  console.log('Loaded chapters count:', loadedChapters.length);
  if (loadedChapters.length > 0) {
    console.log('First chapter len:', loadedChapters[0].len);
  }
}

(async () => {
  await simulateLoad('mobile/test-fixtures/LiruneQA/epub-short.epub');
  await simulateLoad('mobile/test-fixtures/LiruneQA/epub-long.epub');
  await simulateLoad('mobile/test-fixtures/LiruneQA/epub-image-heavy.epub');
})();
