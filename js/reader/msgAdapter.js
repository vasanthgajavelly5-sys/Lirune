/**
 * Lirune Reader - read-only Outlook MSG adapter.
 * Uses msg-parser for Compound File message properties and never writes or
 * executes embedded content.
 */
const MsgAdapter = (() => {
  const escape = value => Utils.escapeHTML(String(value ?? ''));

  class Adapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.flow = 'scrolled';
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      const module = await import('../../node_modules/msg-parser/dist/index.js');
      const properties = await import('../../node_modules/msg-parser/dist/property/KnownProperties.js');
      const message = module.Msg.fromUint8Array(bytes);
      const read = property => {
        try { return message.getProperty(property) || ''; } catch { return ''; }
      };
      const subject = read(properties.PidTagSubject) || read(properties.PidTagNormalizedSubject) || this.record.title || 'Outlook message';
      const sender = read(properties.PidTagSenderSmtpAddress) || read(properties.PidTagSenderName);
      const recipients = read(properties.PidTagDisplayTo);
      const html = read(properties.PidTagBodyHtml);
      const body = read(properties.PidTagBody);
      const header = [
        sender && `<p><strong>From:</strong> ${escape(sender)}</p>`,
        recipients && `<p><strong>To:</strong> ${escape(recipients)}</p>`
      ].filter(Boolean).join('');
      const bodyHtml = html
        ? (typeof DocumentAdapter !== 'undefined' && DocumentAdapter.sanitizeHtml ? DocumentAdapter.sanitizeHtml(html, { allowRemote: false }) : escape(html))
        : `<pre>${escape(body)}</pre>`;
      return [{
        id: 'message-1',
        label: subject,
        depth: 0,
        html: `<article class="expansion-message"><h2>${escape(subject)}</h2><header>${header}</header>${bodyHtml}</article>`
      }];
    }
  }

  return { Adapter };
})();
