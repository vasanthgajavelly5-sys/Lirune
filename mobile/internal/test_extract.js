const fs = require('fs');
const JSZip = require('jszip');

function resolveZipPath(baseDir, relativePath) {
  if (!baseDir || relativePath.startsWith('/')) {
    return relativePath.replace(/^\/+/, '');
  }
  const parts = (baseDir + relativePath).split('/');
  const normalized = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      normalized.pop();
    } else {
      normalized.push(part);
    }
  }
  return normalized.join('/');
}

async function run() {
  const buf = fs.readFileSync('mobile/internal/test_book_binary.epub');
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file('OEBPS/Text/Cover.xhtml');
  let rawHtml = await file.async('text');
  console.log('Original:\n', rawHtml);

  const chapterDir = 'OEBPS/Text/';
  const imgRegex = /<(?:img|image)\b[^>]*\b(?:src|xlink:href|href)=["']([^"']+)["'][^>]*\/?>/gi;
  let imgMatch;
  const foundImages = [];
  while ((imgMatch = imgRegex.exec(rawHtml)) !== null) {
    foundImages.push(imgMatch[1]);
  }
  console.log('foundImages:', foundImages);

  for (const imgSrc of foundImages) {
    if (imgSrc.startsWith('data:') || imgSrc.startsWith('http')) continue;
    const fullImgPath = resolveZipPath(chapterDir, imgSrc);
    console.log('fullImgPath:', fullImgPath);
    const imgEntry = zip.file(fullImgPath);
    if (imgEntry) {
      const b64 = await imgEntry.async('base64');
      const dataUri = `data:image/jpeg;base64,${b64.slice(0, 30)}...`;
      rawHtml = rawHtml.split(imgSrc).join(dataUri);
    }
  }

  rawHtml = rawHtml.replace(
    /<svg\b[^>]*>[\s\S]*?<image\b[^>]*\b(?:xlink:href|href)=["']([^"']+)["'][^>]*\/?>[\s\S]*?<\/svg>/gi,
    '<div class="epub-cover-container" style="display:flex;justify-content:center;align-items:center;min-height:75vh;"><img src="$1" style="max-width:100%;max-height:80vh;object-fit:contain;margin:auto;display:block;" /></div>'
  );
  rawHtml = rawHtml.replace(
    /<image\b[^>]*\b(?:xlink:href|href)=["']([^"']+)["'][^>]*\/?>/gi,
    '<img src="$1" style="max-width:100%;height:auto;display:block;margin:12px auto;" />'
  );

  const bodyMatch = rawHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const chapterHtmlContent = bodyMatch ? bodyMatch[1] : rawHtml;
  console.log('Processed:\n', chapterHtmlContent);
}

run().catch(console.error);
