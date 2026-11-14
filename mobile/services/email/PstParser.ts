import { PSTFile } from 'pst-parser';
import type { EmailMessage, ParsedEmailArchive } from './EmailParser';
import { EmailParser } from './EmailParser';

const MAX_MESSAGES = 1000;

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function collectMessages(folder: {
  contentCount: number;
  hasSubfolders: boolean;
  getSubFolderEntries(): Array<{ nid: number }>;
  getSubFolder(nid: number): {
    contentCount: number;
    hasSubfolders: boolean;
    getSubFolderEntries(): Array<{ nid: number }>;
    getSubFolder(nid: number): unknown;
    getContents(start?: number, end?: number): Array<{ nid: number }>;
    getMessage(nid: number): {
      subject?: string;
      body?: string;
      bodyHTML?: string;
      hasAttachments?: boolean;
      getAllRecipients(): Array<Record<string, string>>;
      getAttachmentEntries(): Array<Record<string, string>>;
    };
  };
  getContents(start?: number, end?: number): Array<{ nid: number }>;
  getMessage(nid: number): {
    subject?: string;
    body?: string;
    bodyHTML?: string;
    hasAttachments?: boolean;
    getAllRecipients(): Array<Record<string, string>>;
    getAttachmentEntries(): Array<Record<string, string>>;
  };
}, output: EmailMessage[]): void {
  if (output.length >= MAX_MESSAGES) return;
  for (const entry of folder.getContents(0, Math.min(folder.contentCount, MAX_MESSAGES - output.length))) {
    const message = folder.getMessage(entry.nid);
    const recipients = message.getAllRecipients();
    const attachments = message.getAttachmentEntries();
    output.push({
      headers: {
        from: '',
        to: recipients.map((recipient) => recipient.displayName || recipient.emailAddress || '').filter(Boolean).join('; '),
        subject: message.subject || 'Outlook message',
        date: '',
      },
      textBody: message.body || undefined,
      htmlBody: message.bodyHTML || undefined,
      attachments: attachments.map((attachment) => ({
        filename: attachment.displayName || attachment.longFilename || 'attachment',
        contentType: attachment.attachMimeTag || 'application/octet-stream',
      })),
    });
    if (output.length >= MAX_MESSAGES) return;
  }
  if (!folder.hasSubfolders) return;
  for (const entry of folder.getSubFolderEntries()) {
    collectMessages(folder.getSubFolder(entry.nid) as Parameters<typeof collectMessages>[0], output);
    if (output.length >= MAX_MESSAGES) return;
  }
}

export class PstParser {
  static parse(buffer: ArrayBuffer | Uint8Array): ParsedEmailArchive {
    const bytes = buffer instanceof Uint8Array
      ? bytesToArrayBuffer(buffer)
      : buffer;
    const pst = new PSTFile(bytes);
    const messages: EmailMessage[] = [];
    collectMessages(pst.getMessageStore().getRootFolder(), messages);
    if (!messages.length) throw new Error('The Outlook archive contains no readable messages.');
    const title = pst.getMessageStore().displayName || 'Outlook archive';
    return { title, messages, html: EmailParser.renderHtml(messages, title) };
  }
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function sanitizePstHtml(value: string): string {
  return escapeHtml(value);
}
