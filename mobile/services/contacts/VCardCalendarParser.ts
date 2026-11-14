/**
 * Lirune Reader Mobile — Pure TypeScript vCard and iCalendar Parser
 * Supports VCF (RFC 6350 vCard) and ICS (RFC 5545 iCalendar).
 * Zero new dependencies.
 */

export interface VCardContact {
  fullName: string;
  name?: string;
  organization?: string;
  title?: string;
  phones: string[];
  emails: string[];
  addresses: string[];
  birthday?: string;
  notes: string[];
}

export interface CalendarEvent {
  summary: string;
  dtStart?: string;
  dtEnd?: string;
  location?: string;
  description?: string;
  status?: string;
}

export interface ParsedContactOrCalendar {
  title: string;
  type: 'vcf' | 'ics';
  itemCount: number;
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

export class VCardCalendarParser {
  /**
   * Parse a VCF (vCard) file into structured contacts and HTML view.
   */
  static parseVcf(rawText: string, title = 'Contacts'): ParsedContactOrCalendar {
    const rawCards = rawText.split(/BEGIN:VCARD/i);
    const contacts: VCardContact[] = [];

    for (const card of rawCards) {
      if (!card.includes('END:VCARD')) continue;
      const lines = card.split(/\r?\n/);
      const contact: VCardContact = {
        fullName: 'Unnamed Contact',
        phones: [],
        emails: [],
        addresses: [],
        notes: [],
      };

      for (const line of lines) {
        const colon = line.indexOf(':');
        if (colon <= 0) continue;
        const rawKey = line.slice(0, colon).trim().toUpperCase();
        const val = line.slice(colon + 1).trim();
        const baseKey = rawKey.split(';')[0];

        if (baseKey === 'FN') contact.fullName = val;
        else if (baseKey === 'N') contact.name = val.replace(/;/g, ' ').trim();
        else if (baseKey === 'ORG') contact.organization = val.replace(/;/g, ' ').trim();
        else if (baseKey === 'TITLE') contact.title = val;
        else if (baseKey === 'TEL') contact.phones.push(val);
        else if (baseKey === 'EMAIL') contact.emails.push(val);
        else if (baseKey === 'ADR') contact.addresses.push(val.replace(/;/g, ', ').replace(/^,\s*/, ''));
        else if (baseKey === 'BDAY') contact.birthday = val;
        else if (baseKey === 'NOTE') contact.notes.push(val);
      }

      contacts.push(contact);
    }

    const docTitle = contacts[0]?.fullName ? `Contacts: ${contacts[0].fullName}` : title;
    const parts: string[] = [
      `<div class="lirune-vcard-container">`,
      `<h2 class="lirune-section-title">${escapeHtml(docTitle)}</h2>`,
    ];

    contacts.forEach((c, idx) => {
      parts.push(`<div class="lirune-contact-card" id="contact-${idx + 1}">`);
      parts.push(`<h3 class="lirune-contact-name">👤 ${escapeHtml(c.fullName)}</h3>`);
      if (c.title || c.organization) {
        parts.push(`<p class="lirune-contact-org">${escapeHtml([c.title, c.organization].filter(Boolean).join(' • '))}</p>`);
      }
      if (c.phones.length) {
        parts.push(`<div class="lirune-contact-field"><strong>Phone:</strong> ${c.phones.map(escapeHtml).join(', ')}</div>`);
      }
      if (c.emails.length) {
        parts.push(`<div class="lirune-contact-field"><strong>Email:</strong> ${c.emails.map(escapeHtml).join(', ')}</div>`);
      }
      if (c.addresses.length) {
        parts.push(`<div class="lirune-contact-field"><strong>Address:</strong> ${c.addresses.map(escapeHtml).join('; ')}</div>`);
      }
      if (c.birthday) {
        parts.push(`<div class="lirune-contact-field"><strong>Birthday:</strong> ${escapeHtml(c.birthday)}</div>`);
      }
      if (c.notes.length) {
        parts.push(`<div class="lirune-contact-field"><strong>Notes:</strong> ${c.notes.map(escapeHtml).join(' ')}</div>`);
      }
      parts.push(`</div>`);
    });

    parts.push(`</div>`);
    return { title: docTitle, type: 'vcf', itemCount: contacts.length, html: parts.join('\n') };
  }

  /**
   * Parse an ICS (iCalendar) file into structured events and HTML view.
   */
  static parseIcs(rawText: string, title = 'Calendar'): ParsedContactOrCalendar {
    const rawEvents = rawText.split(/BEGIN:VEVENT/i);
    const events: CalendarEvent[] = [];

    for (const evt of rawEvents) {
      if (!evt.includes('END:VEVENT')) continue;
      const lines = evt.split(/\r?\n/);
      const event: CalendarEvent = { summary: 'Untitled Event' };

      for (const line of lines) {
        const colon = line.indexOf(':');
        if (colon <= 0) continue;
        const rawKey = line.slice(0, colon).trim().toUpperCase();
        const val = line.slice(colon + 1).trim();
        const baseKey = rawKey.split(';')[0];

        if (baseKey === 'SUMMARY') event.summary = val;
        else if (baseKey === 'DTSTART') event.dtStart = val;
        else if (baseKey === 'DTEND') event.dtEnd = val;
        else if (baseKey === 'LOCATION') event.location = val;
        else if (baseKey === 'DESCRIPTION') event.description = val.replace(/\\n/g, '\n');
        else if (baseKey === 'STATUS') event.status = val;
      }

      events.push(event);
    }

    const docTitle = events[0]?.summary ? `Calendar: ${events[0].summary}` : title;
    const parts: string[] = [
      `<div class="lirune-calendar-container">`,
      `<h2 class="lirune-section-title">${escapeHtml(docTitle)}</h2>`,
    ];

    events.forEach((e, idx) => {
      parts.push(`<div class="lirune-event-card" id="event-${idx + 1}">`);
      parts.push(`<h3 class="lirune-event-title">📅 ${escapeHtml(e.summary)}</h3>`);
      if (e.dtStart || e.dtEnd) {
        parts.push(`<p class="lirune-event-time"><strong>Time:</strong> ${escapeHtml(e.dtStart || '')} ${e.dtEnd ? '— ' + escapeHtml(e.dtEnd) : ''}</p>`);
      }
      if (e.location) {
        parts.push(`<p class="lirune-event-location"><strong>Location:</strong> 📍 ${escapeHtml(e.location)}</p>`);
      }
      if (e.description) {
        parts.push(`<div class="lirune-event-desc"><pre>${escapeHtml(e.description)}</pre></div>`);
      }
      parts.push(`</div>`);
    });

    parts.push(`</div>`);
    return { title: docTitle, type: 'ics', itemCount: events.length, html: parts.join('\n') };
  }
}
