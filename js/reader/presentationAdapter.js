/**
 * Lirune Reader - read-only presentation adapter.
 * Extracts slide order, text, and internal images from PPTX-family packages
 * and ODP without executing macros, relationships, or external resources.
 */
const PresentationAdapter = (() => {
  const MAX_SLIDES = 1000;
  const escape = value => Utils.escapeHTML(String(value ?? ''));
  const decode = value => Utils.decodeXmlEntities(value);

  function imageMime(path) {
    const ext = path.split('.').pop()?.toLowerCase();
    return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' }[ext] || 'image/png';
  }

  async function parsePptx(zip) {
    const rels = zip.file('ppt/_rels/presentation.xml.rels');
    const presentation = zip.file('ppt/presentation.xml');
    if (!presentation) throw new Error('Invalid presentation: missing presentation.xml.');
    const relMap = {};
    if (rels) {
      for (const match of (await rels.async('text')).matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/gi)) {
        relMap[match[1]] = `ppt/${match[2].replace(/^\/?ppt\//, '')}`;
      }
    }
    const ids = [...(await presentation.async('text')).matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/gi)].map(match => match[1]);
    const slides = [];
    for (let index = 0; index < Math.min(ids.length, MAX_SLIDES); index++) {
      const path = relMap[ids[index]];
      const file = path && zip.file(path);
      if (!file) continue;
      const xml = await file.async('text');
      const text = [...xml.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi)].map(match => decode(match[1])).filter(Boolean);
      const images = [];
      const slideRels = zip.file(path.replace(/slides\/([^/]+)$/, 'slides/_rels/$1.rels'));
      if (slideRels) {
        for (const match of (await slideRels.async('text')).matchAll(/<Relationship\b[^>]*\bTarget="([^"]+)"/gi)) {
          const target = match[1];
          if (/^(https?:|data:|\/\/)/i.test(target)) continue;
          const mediaPath = `ppt/slides/${target}`.replace(/slides\/[^/]+\/\.\.\//g, '').replace(/\/\.\//g, '/');
          const media = zip.file(mediaPath) || zip.file(`ppt/media/${target.split('/').pop()}`);
          if (media) images.push(`data:${imageMime(media.name)};base64,${await media.async('base64')}`);
        }
      }
      slides.push(`<section class="presentation-slide"><h3>Slide ${index + 1}</h3>${text.map(value => `<p>${escape(value)}</p>`).join('')}${images.map(src => `<img src="${src}" alt="Slide image">`).join('')}</section>`);
    }
    if (!slides.length) throw new Error('This presentation contains no readable slides.');
    return slides;
  }

  async function parseOdp(zip) {
    const file = zip.file('content.xml');
    if (!file) throw new Error('Invalid ODP: missing content.xml.');
    const xml = await file.async('text');
    const slides = [];
    for (const match of xml.matchAll(/<draw:page\b[^>]*>([\s\S]*?)<\/draw:page>/gi)) {
      if (slides.length >= MAX_SLIDES) break;
      const text = [...match[1].matchAll(/<text:p\b[^>]*>([\s\S]*?)<\/text:p>/gi)]
        .map(item => decode(Utils.stripTagsToText(item[1]))).filter(Boolean);
      slides.push(`<section class="presentation-slide"><h3>Slide ${slides.length + 1}</h3>${text.map(value => `<p>${escape(value)}</p>`).join('')}</section>`);
    }
    if (!slides.length) throw new Error('This presentation contains no readable slides.');
    return slides;
  }

  class Adapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.format = record.format;
      this.flow = 'scrolled';
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      if (bytes.length > 64 * 1024 * 1024) throw new Error('This presentation exceeds the safe 64 MB limit.');
      const zip = await JSZip.loadAsync(bytes);
      if (typeof DocumentAdapter !== 'undefined' && DocumentAdapter.validateZipBudget) {
        DocumentAdapter.validateZipBudget(zip);
      }
      const slides = this.format === 'odp' ? await parseOdp(zip) : await parsePptx(zip);
      return slides.map((html, index) => ({ id: `slide-${index + 1}`, label: `Slide ${index + 1}`, depth: 0, html }));
    }
  }

  return { Adapter };
})();
