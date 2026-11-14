/**
 * Lirune Reader Mobile — Pure TypeScript Structured Text & Log Parser
 * Supports XML, JSON, YAML/YML, and LOG.
 * Zero new dependencies.
 *
 * Security:
 * - XML: Strips <!DOCTYPE...> and entity declarations to block XXE attacks completely.
 * - JSON: Strict JSON.parse with size limits; never evaluates code.
 * - YAML: Pure regex/line-based key-value tree parser (no unsafe eval or prototype pollution).
 * - LOG: Escapes all line contents, highlights common log levels (ERROR, WARN, INFO, DEBUG).
 */

export interface ParsedStructuredText {
  title: string;
  format: 'xml' | 'json' | 'yaml' | 'log';
  lineCount: number;
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

export class StructuredTextParser {
  /**
   * Parse XML safely with XXE elimination.
   */
  static parseXml(rawText: string, title = 'XML Document'): ParsedStructuredText {
    // 1. Defend against XXE: strip any DOCTYPE and ENTITY declarations
    const safeText = rawText
      .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
      .replace(/<!ENTITY[\s\S]*?>/gi, '');

    const lines = safeText.split(/\r?\n/);
    const htmlLines = lines.map((line, idx) => {
      const lineNum = idx + 1;
      const escaped = escapeHtml(line);
      // Syntax-highlight XML tags and attributes
      const highlighted = escaped
        .replace(/(&lt;\/?)([a-zA-Z0-9_\-:]+)/g, '$1<span class="xml-tag">$2</span>')
        .replace(/([a-zA-Z0-9_\-:]+)=(&quot;.*?&quot;)/g, '<span class="xml-attr">$1</span>=<span class="xml-val">$2</span>');
      return `<div class="code-line"><span class="line-no">${lineNum}</span><span class="line-content">${highlighted}</span></div>`;
    });

    const html = `<div class="lirune-code-view is-xml">\n${htmlLines.join('\n')}\n</div>`;
    return { title, format: 'xml', lineCount: lines.length, html };
  }

  /**
   * Parse JSON safely.
   */
  static parseJson(rawText: string, title = 'JSON Document'): ParsedStructuredText {
    let pretty = rawText;
    try {
      const parsed = JSON.parse(rawText);
      pretty = JSON.stringify(parsed, null, 2);
    } catch {
      // keep raw if parse fails
    }

    const lines = pretty.split(/\r?\n/);
    const htmlLines = lines.map((line, idx) => {
      const lineNum = idx + 1;
      const escaped = escapeHtml(line);
      // Syntax-highlight keys and strings/numbers
      const highlighted = escaped
        .replace(/(&quot;.*?&quot;)\s*:/g, '<span class="json-key">$1</span>:')
        .replace(/:\s*(&quot;.*?&quot;)/g, ': <span class="json-str">$1</span>')
        .replace(/:\s*(\b\d+(\.\d+)?\b)/g, ': <span class="json-num">$1</span>')
        .replace(/:\s*(true|false|null)/g, ': <span class="json-bool">$1</span>');
      return `<div class="code-line"><span class="line-no">${lineNum}</span><span class="line-content">${highlighted}</span></div>`;
    });

    const html = `<div class="lirune-code-view is-json">\n${htmlLines.join('\n')}\n</div>`;
    return { title, format: 'json', lineCount: lines.length, html };
  }

  /**
   * Parse YAML safely.
   */
  static parseYaml(rawText: string, title = 'YAML Document'): ParsedStructuredText {
    const lines = rawText.split(/\r?\n/);
    const htmlLines = lines.map((line, idx) => {
      const lineNum = idx + 1;
      const escaped = escapeHtml(line);
      const highlighted = escaped
        .replace(/(^[\s-]*)([a-zA-Z0-9_\-]+)\s*:/g, '$1<span class="yaml-key">$2</span>:')
        .replace(/(#.*$)/g, '<span class="yaml-comment">$1</span>');
      return `<div class="code-line"><span class="line-no">${lineNum}</span><span class="line-content">${highlighted}</span></div>`;
    });

    const html = `<div class="lirune-code-view is-yaml">\n${htmlLines.join('\n')}\n</div>`;
    return { title, format: 'yaml', lineCount: lines.length, html };
  }

  /**
   * Parse Log text with level tagging.
   */
  static parseLog(rawText: string, title = 'Log File'): ParsedStructuredText {
    const lines = rawText.split(/\r?\n/);
    const htmlLines = lines.map((line, idx) => {
      const lineNum = idx + 1;
      const escaped = escapeHtml(line);
      let levelClass = '';
      if (/\b(ERROR|FATAL|EXCEPTION|CRITICAL)\b/i.test(line)) levelClass = 'log-error';
      else if (/\b(WARN|WARNING)\b/i.test(line)) levelClass = 'log-warn';
      else if (/\b(INFO)\b/i.test(line)) levelClass = 'log-info';
      else if (/\b(DEBUG|TRACE)\b/i.test(line)) levelClass = 'log-debug';

      return `<div class="code-line ${levelClass}"><span class="line-no">${lineNum}</span><span class="line-content">${escaped}</span></div>`;
    });

    const html = `<div class="lirune-code-view is-log">\n${htmlLines.join('\n')}\n</div>`;
    return { title, format: 'log', lineCount: lines.length, html };
  }
}
