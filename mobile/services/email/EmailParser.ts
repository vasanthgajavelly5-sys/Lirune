/**
 * Lirune Reader Mobile — Pure TypeScript Email & Web Archive Parser
 * Supports EML (RFC 2822 / MIME), MHT / MHTML (RFC 2557), MBOX (RFC 4155), and MSG.
 * Zero new dependencies.
 *
 * Security:
 * - Sanitizes rendered HTML; strips scripts, event handlers, and iframe elements.
 * - Blocks automatic loading of external images or tracking pixels.
 * - Safely lists attachments without auto-executing them.
 */

import { sanitizeHtml } from '../security/sanitizeHtml.ts';

export interface EmailHeader {
  from: string;
  to: string;
  subject: string;
  date: string;
  cc?: string;
}

export interface EmailMessage {
  headers: EmailHeader;
  textBody?: string;
  htmlBody?: string;
  attachments: { filename: string; contentType: string; size?: number }[];
}

export interface ParsedEmailArchive {
  title: string;
  messages: EmailMessage[];
  html: string;
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeQuotedPrintable(str: string): string {
  return str
    .replace(/=\r?\n/g, '') // Soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export class EmailParser {
  /**
   * Parse a single RFC 2822 / MIME message (EML or MHT/MHTML).
   */
  static parseMime(rawText: string): EmailMessage {
    const lines = rawText.split(/\r?\n/);
    const headerLines: string[] = [];
    let lineIdx = 0;

    // Header continues until the first empty line
    while (lineIdx < lines.length && lines[lineIdx].trim() !== '') {
      const line = lines[lineIdx];
      if (/^\s/.test(line) && headerLines.length > 0) {
        // Folded header line
        headerLines[headerLines.length - 1] += ' ' + line.trim();
      } else {
        headerLines.push(line);
      }
      lineIdx++;
    }

    // Skip the separator line
    lineIdx++;
    const bodyText = lines.slice(lineIdx).join('\n');

    // Parse header dictionary
    const headersMap: Record<string, string> = {};
    for (const h of headerLines) {
      const colon = h.indexOf(':');
      if (colon > 0) {
        const key = h.slice(0, colon).trim().toLowerCase();
        const val = h.slice(colon + 1).trim();
        headersMap[key] = val;
      }
    }

    const headers: EmailHeader = {
      from: headersMap['from'] || 'Unknown Sender',
      to: headersMap['to'] || '',
      subject: headersMap['subject'] || 'No Subject',
      date: headersMap['date'] || '',
      cc: headersMap['cc'],
    };

    const contentType = headersMap['content-type'] || 'text/plain';
    const contentTransferEncoding = (headersMap['content-transfer-encoding'] || '').toLowerCase();

    // Check for multipart boundary
    const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/i);
    let textBody: string | undefined;
    let htmlBody: string | undefined;
    const attachments: { filename: string; contentType: string; size?: number }[] = [];

    if (boundaryMatch) {
      const boundary = boundaryMatch[1];
      const parts = bodyText.split(`--${boundary}`);

      for (const part of parts) {
        if (!part.trim() || part.trim() === '--') continue;
        const subMsg = EmailParser.parseMime(part.trim());
        if (subMsg.htmlBody && !htmlBody) htmlBody = subMsg.htmlBody;
        if (subMsg.textBody && !textBody) textBody = subMsg.textBody;
        if (subMsg.attachments.length) attachments.push(...subMsg.attachments);
      }
    } else {
      let decoded = bodyText;
      if (contentTransferEncoding === 'quoted-printable') {
        decoded = decodeQuotedPrintable(decoded);
      } else if (contentTransferEncoding === 'base64') {
        try {
          decoded = atob(decoded.replace(/\s+/g, ''));
        } catch {
          // keep as is if decode fails
        }
      }

      if (contentType.toLowerCase().includes('text/html')) {
        htmlBody = decoded;
      } else {
        textBody = decoded;
      }
    }

    return { headers, textBody, htmlBody, attachments };
  }

  /**
   * Parse an EML buffer.
   */
  static parseEml(buffer: ArrayBuffer | Uint8Array): ParsedEmailArchive {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    const msg = EmailParser.parseMime(text);
    const title = msg.headers.subject || 'Email Message';
    const html = EmailParser.renderHtml([msg], title);
    return { title, messages: [msg], html };
  }

  /**
   * Parse an MHTML / MHT web archive buffer.
   */
  static parseMhtml(buffer: ArrayBuffer | Uint8Array): ParsedEmailArchive {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    const msg = EmailParser.parseMime(text);
    const title = msg.headers.subject || 'Web Archive';
    const html = EmailParser.renderHtml([msg], title);
    return { title, messages: [msg], html };
  }

  /**
   * Parse an MBOX buffer containing multiple RFC 2822 messages.
   */
  static parseMbox(buffer: ArrayBuffer | Uint8Array): ParsedEmailArchive {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    // Split messages on "^From " line boundaries
    const rawMessages = text.split(/\n(?=From\s)/);
    const messages: EmailMessage[] = [];

    for (const raw of rawMessages) {
      if (raw.trim().length > 10) {
        messages.push(EmailParser.parseMime(raw));
      }
    }

    const title = messages[0]?.headers.subject ? `MBOX: ${messages[0].headers.subject}` : 'Mailbox Archive';
    const html = EmailParser.renderHtml(messages, title);
    return { title, messages, html };
  }

  /**
   * Parse an MSG (Outlook) buffer (extracts readable ASCII/Unicode text streams).
   */
  static parseMsg(buffer: ArrayBuffer | Uint8Array): ParsedEmailArchive {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    // Extract readable text chunks from OLE2 container
    let text = '';
    for (let i = 0; i < bytes.length - 1; i += 2) {
      const b1 = bytes[i];
      const b2 = bytes[i + 1];
      if (b2 === 0 && ((b1 >= 32 && b1 <= 126) || b1 === 10 || b1 === 13 || b1 === 9)) {
        text += String.fromCharCode(b1);
      }
    }

    // Find headers
    const subjectMatch = text.match(/Subject:\s*([^\r\n]+)/i);
    const fromMatch = text.match(/From:\s*([^\r\n]+)/i);

    const msg: EmailMessage = {
      headers: {
        from: fromMatch ? fromMatch[1].trim() : 'Outlook User',
        to: '',
        subject: subjectMatch ? subjectMatch[1].trim() : 'Outlook Message',
        date: '',
      },
      textBody: text.slice(0, 50000), // bounded sample
      attachments: [],
    };

    const title = msg.headers.subject;
    const html = EmailParser.renderHtml([msg], title);
    return { title, messages: [msg], html };
  }

  /**
   * Render email messages into clean, readable HTML.
   */
  static renderHtml(messages: EmailMessage[], title: string): string {
    const parts: string[] = [
      `<div class="lirune-email-container">`,
      `<h2 class="lirune-email-archive-title">${escapeHtml(title)}</h2>`,
    ];

    messages.forEach((msg, idx) => {
      parts.push(`<div class="lirune-email-message" id="msg-${idx + 1}">`);
      parts.push(`<div class="lirune-email-headers">`);
      parts.push(`<div class="lirune-email-header-row"><strong>Subject:</strong> ${escapeHtml(msg.headers.subject)}</div>`);
      parts.push(`<div class="lirune-email-header-row"><strong>From:</strong> ${escapeHtml(msg.headers.from)}</div>`);
      if (msg.headers.to) parts.push(`<div class="lirune-email-header-row"><strong>To:</strong> ${escapeHtml(msg.headers.to)}</div>`);
      if (msg.headers.date) parts.push(`<div class="lirune-email-header-row"><strong>Date:</strong> ${escapeHtml(msg.headers.date)}</div>`);
      parts.push(`</div>`);

      parts.push(`<div class="lirune-email-body">`);
      if (msg.htmlBody) {
        // Robust parser-based sanitization via sanitizeHtml
        const clean = sanitizeHtml(msg.htmlBody);
        parts.push(clean);
      } else if (msg.textBody) {
        parts.push(`<pre class="lirune-email-text">${escapeHtml(msg.textBody)}</pre>`);
      } else {
        parts.push(`<p><em>(Empty message body)</em></p>`);
      }
      parts.push(`</div>`);

      if (msg.attachments.length > 0) {
        parts.push(`<div class="lirune-email-attachments"><strong>Attachments (${msg.attachments.length}):</strong><ul>`);
        for (const att of msg.attachments) {
          parts.push(`<li>📎 ${escapeHtml(att.filename)} (${escapeHtml(att.contentType)})</li>`);
        }
        parts.push(`</ul></div>`);
      }

      parts.push(`</div><hr class="lirune-message-divider"/>`);
    });

    parts.push(`</div>`);
    return parts.join('\n');
  }
}
