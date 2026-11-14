/**
 * Lirune Reader - bounded legacy OLE presentation/text reader.
 * Extracts document text from the format's typed OLE streams without
 * evaluating macros, links, or embedded objects.
 */
const LegacyOfficeAdapter = (() => {
  const escape = value => Utils.escapeHTML(String(value ?? ''));
  const u16 = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8);
  const u32 = (bytes, offset) => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;

  function readPptText(bytes) {
    const parts = [];
    for (let offset = 0; offset + 8 <= bytes.length;) {
      const type = u16(bytes, offset + 2);
      const length = u32(bytes, offset + 4);
      const start = offset + 8;
      const end = start + length;
      if (end > bytes.length) break;
      if (type === 0x0FA8) parts.push(new TextDecoder('utf-16le').decode(bytes.subarray(start, end)));
      if (type === 0x0FAA) parts.push(new TextDecoder('latin1').decode(bytes.subarray(start, end)));
      offset = end;
    }
    const filtered = parts.map(value => value.replace(/\0/g, '').trim()).filter(Boolean);
    if (filtered.length > 0) return filtered;

    // Fallback for PP40 / early PowerPoint streams: extract printable character sequences
    const l1Text = new TextDecoder('latin1').decode(bytes)
      .split(/[\u0000\r\n\t]+/)
      .map(v => v.trim())
      .filter(v => v.length > 3 && /^[\x20-\x7e\s]+$/.test(v));
    const u16Text = new TextDecoder('utf-16le').decode(bytes)
      .split(/[\u0000\r\n\t]+/)
      .map(v => v.trim())
      .filter(v => v.length > 3 && /^[\x20-\x7e\s]+$/.test(v));
    return l1Text.length >= u16Text.length ? l1Text : u16Text;
  }

  function readWordText(bytes) {
    const decoder = new TextDecoder('utf-16le');
    const text = decoder.decode(bytes);
    const u16Text = text.split(/[\u0000\r\n]+/).map(value => value.trim()).filter(value => value.length > 2 && /[\p{L}\p{N}]/u.test(value));
    if (u16Text.length > 0) return u16Text;
    const l1Text = new TextDecoder('latin1').decode(bytes).split(/[\u0000\r\n]+/).map(value => value.trim()).filter(value => value.length > 2 && /[\p{L}\p{N}]/u.test(value));
    return l1Text;
  }

  class Adapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.format = record.format;
      this.flow = 'scrolled';
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      let cfb = (typeof window !== 'undefined' && window.CFB) || (typeof CFB !== 'undefined' ? CFB : null);
      if (!cfb) {
        const module = await import('../../node_modules/cfb/cfb.js');
        cfb = module.default || module;
      }
      const container = cfb.read(bytes, { type: 'array' });
      let streamEntry = null;
      if (this.format === 'ppt' || this.format === 'pps') {
        streamEntry = cfb.find(container, 'PowerPoint Document') ||
                      cfb.find(container, 'PP40') ||
                      cfb.find(container, '\x05SummaryInformation') ||
                      cfb.find(container, 'Current User');
      } else if (this.format === 'wps') {
        streamEntry = cfb.find(container, 'WPS Office Doc') ||
                      cfb.find(container, 'Contents') ||
                      cfb.find(container, 'WpsCustomData') ||
                      cfb.find(container, 'WordDocument');
      } else {
        streamEntry = cfb.find(container, 'WordDocument');
      }
      const stream = streamEntry?.content;
      if (!stream) throw new Error(`Legacy ${this.format.toUpperCase()} document stream is missing.`);
      const values = this.format === 'ppt' || this.format === 'pps'
        ? readPptText(new Uint8Array(stream))
        : readWordText(new Uint8Array(stream));
      if (!values.length) {
        return [{
          id: 'page-1',
          label: 'Page 1',
          depth: 0,
          html: `<article class="word-page-card"><div class="word-page-content"><p><em>(Empty presentation)</em></p></div><div class="word-page-footer">Page 1</div></article>`
        }];
      }
      const sections = [];
      for (let i = 0; i < values.length; i += 25) {
        const page = values.slice(i, i + 25);
        const number = Math.floor(i / 25) + 1;
        sections.push({
          id: `page-${number}`,
          label: `Page ${number}`,
          depth: 0,
          html: `<article class="word-page-card"><div class="word-page-content">${page.map(value => `<p>${escape(value)}</p>`).join('')}</div><div class="word-page-footer">Page ${number}</div></article>`
        });
      }
      return sections;
    }
  }

  return { Adapter };
})();
