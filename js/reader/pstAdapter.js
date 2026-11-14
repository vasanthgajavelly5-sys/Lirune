/**
 * Lirune Reader - Outlook PST/OST adapter.
 * Uses the bundled pure-JavaScript pst-parser package and never writes to the
 * archive or executes embedded content.
 */
const PstAdapter = (() => {
  class Adapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.format = record.format;
      this.formatLabel = record.format === 'ost' ? 'Outlook offline archive' : 'Outlook personal archive';
      this.flow = 'scrolled';
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      const module = await import('../../node_modules/pst-parser/src/index.js');
      const pst = new module.PSTFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      const messages = [];
      collectFolder(pst.getMessageStore().getRootFolder(), messages);
      if (!messages.length) throw new Error(`This ${this.formatLabel} contains no readable messages.`);
      return messages.map((message, index) => ({
        id: `message-${index + 1}`,
        label: message.subject || `Message ${index + 1}`,
        depth: 0,
        html: `<article class="expansion-message"><h2>${escapeHtml(message.subject || 'Outlook message')}</h2>${message.bodyHTML ? (typeof DocumentAdapter !== 'undefined' && DocumentAdapter.sanitizeHtml ? DocumentAdapter.sanitizeHtml(message.bodyHTML, { allowRemote: false }) : escapeHtml(message.bodyHTML)) : `<pre>${escapeHtml(message.body || '')}</pre>`}</article>`
      }));
    }

    async loadBytes() {
      if (this.record.fileData) return new Uint8Array(this.record.fileData);
      const desktopApi = window.noveraDesktop || window.liruneDesktop;
      if (this.record.storageId && desktopApi?.readManagedBook) {
        const buffer = await desktopApi.readManagedBook(this.record.storageId, this.record.fingerprint, this.record.fileSize);
        return new Uint8Array(buffer);
      }
      throw new Error(`This ${this.formatLabel} is unavailable.`);
    }
  }

  function collectFolder(folder, output) {
    if (output.length >= 1000) return;
    for (const entry of folder.getContents(0, Math.min(folder.contentCount, 1000 - output.length))) {
      const message = folder.getMessage(entry.nid);
      output.push({ subject: message.subject, body: message.body, bodyHTML: message.bodyHTML });
    }
    if (!folder.hasSubfolders) return;
    for (const entry of folder.getSubFolderEntries()) {
      collectFolder(folder.getSubFolder(entry.nid), output);
      if (output.length >= 1000) return;
    }
  }

  function escapeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return { Adapter };
})();
