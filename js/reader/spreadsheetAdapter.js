/**
 * Lirune Reader - bounded, read-only spreadsheet adapter.
 * Parses XLSX-family Open XML workbooks and ODS tables without executing
 * formulas, macros, relationships, or embedded active content.
 */
const SpreadsheetAdapter = (() => {
  const MAX_ROWS = 5000;
  const MAX_COLS = 100;
  const MAX_BYTES = 64 * 1024 * 1024;

  const escape = value => Utils.escapeHTML(String(value ?? ''));
  const decodeXml = value => Utils.decodeXmlEntities(value);

  function rowsToHtml(name, rows) {
    const [header = [], ...body] = rows;
    return `<section class="spreadsheet-sheet"><h3>${escape(name)}</h3><div class="expansion-table-wrap"><table class="expansion-table"><thead><tr>${header.map((cell, index) => `<th>${escape(cell || `Col ${index + 1}`)}</th>`).join('')}</tr></thead><tbody>${body.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  }

  function parseRows(xml, sharedStrings) {
    const rows = [];
    const rowMatches = xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi);
    for (const rowMatch of rowMatches) {
      if (rows.length >= MAX_ROWS) break;
      const row = [];
      for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
        if (row.length >= MAX_COLS) break;
        const attrs = cellMatch[1];
        const content = cellMatch[2];
        const value = content.match(/<v>([\s\S]*?)<\/v>/i)?.[1];
        const inline = content.match(/<t\b[^>]*>([\s\S]*?)<\/t>/i)?.[1];
        let cell = inline === undefined ? decodeXml(value) : decodeXml(inline);
        if (attrs.includes('t="s"') && value !== undefined) cell = sharedStrings[Number(value)] || '';
        row.push(cell.trim());
      }
      if (row.some(Boolean)) rows.push(row);
    }
    return rows;
  }

  async function parseOpenXml(zip) {
    const sharedStrings = [];
    const sharedFile = zip.file('xl/sharedStrings.xml');
    if (sharedFile) {
      const xml = await sharedFile.async('text');
      for (const item of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)) {
        sharedStrings.push([...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)]
          .map(match => decodeXml(match[1])).join(''));
      }
    }
    const names = [];
    const workbook = zip.file('xl/workbook.xml');
    if (workbook) {
      const xml = await workbook.async('text');
      for (const match of xml.matchAll(/<sheet\b[^>]*\bname="([^"]+)"/gi)) names.push(decodeXml(match[1]));
    }
    const sheetFiles = Object.keys(zip.files)
      .filter(name => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
      .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
    const sheets = [];
    for (let index = 0; index < sheetFiles.length; index++) {
      const file = zip.file(sheetFiles[index]);
      if (!file) continue;
      sheets.push({ name: names[index] || `Sheet ${index + 1}`, rows: parseRows(await file.async('text'), sharedStrings) });
    }
    return sheets;
  }

  async function parseOds(zip) {
    const file = zip.file('content.xml');
    if (!file) throw new Error('Invalid ODS: missing content.xml.');
    const xml = await file.async('text');
    const sheets = [];
    for (const table of xml.matchAll(/<table:table\b[^>]*\btable:name="([^"]+)"[^>]*>([\s\S]*?)<\/table:table>/gi)) {
      const rows = [];
      for (const rowMatch of table[2].matchAll(/<table:table-row\b[^>]*>([\s\S]*?)<\/table:table-row>/gi)) {
        if (rows.length >= MAX_ROWS) break;
        const row = [];
        for (const cell of rowMatch[1].matchAll(/<table:table-cell\b[^>]*>([\s\S]*?)<\/table:table-cell>/gi)) {
          if (row.length >= MAX_COLS) break;
          row.push(decodeXml(Utils.stripTagsToText(cell[1].match(/<text:p[^>]*>([\s\S]*?)<\/text:p>/i)?.[1])));
        }
        if (row.some(Boolean)) rows.push(row);
      }
      sheets.push({ name: decodeXml(table[1]), rows });
    }
    return sheets;
  }

  class Adapter extends DocumentAdapter.Adapter {
    constructor(host, record) {
      super(host, record);
      this.format = record.format;
      this.flow = 'scrolled';
    }

    async buildSections() {
      const bytes = await this.loadBytes();
      if (bytes.length > MAX_BYTES) throw new Error('This spreadsheet exceeds the safe 64 MB limit.');
      if (typeof JSZip === 'undefined') throw new Error('Spreadsheet ZIP support is unavailable.');
      const zip = await JSZip.loadAsync(bytes);
      if (typeof DocumentAdapter !== 'undefined' && DocumentAdapter.validateZipBudget) {
        DocumentAdapter.validateZipBudget(zip);
      }
      const sheets = this.format === 'ods' ? await parseOds(zip) : await parseOpenXml(zip);
      const sections = sheets.filter(sheet => sheet.rows.length).map(sheet => ({
        id: `sheet-${sheet.name}`,
        label: sheet.name,
        depth: 0,
        html: rowsToHtml(sheet.name, sheet.rows)
      }));
      if (!sections.length) throw new Error('This spreadsheet contains no readable sheets.');
      return sections;
    }
  }

  return { Adapter };
})();
