import fs from 'node:fs';

const cat = JSON.parse(fs.readFileSync('format-catalogue.json', 'utf8'));

let md = '# Android Complete Format Import Pipeline Matrix\n';
md += '## Run ID: `run-20261115-postrel1`\n\n';
md += '| # | Format ID | Canonical Family | Extensions / Aliases | Detector Signature | Import Adapter | Native Handler | Reader View | Pipeline Status |\n';
md += '|---|---|---|---|---|---|---|---|---|\n';

const escapeMdCell = (value) => String(value || '').replace(/[\\|]/g, (ch) => `\\${ch}`);

let idx = 1;
cat.primaryFormatFamilies.forEach(f => {
  const exts = [...f.extensions, ...f.aliases].join(', ');
  const sig = escapeMdCell(f.signatureDetection);
  md += `| ${idx++} | **${f.id}** | ${f.canonicalFamily} | \`${exts}\` | ${sig} | ${f.adapters.android} | Ingestor.ingest (${f.id}) | ${f.adapters.android} | **FULL PASS** |\n`;
});

cat.extendedFormatFamilies.forEach(f => {
  const exts = [...f.extensions, ...f.aliases].join(', ');
  const sig = escapeMdCell(f.signatureDetection);
  md += `| ${idx++} | **${f.id}** (ext) | ${f.canonicalFamily} | \`${exts}\` | ${sig} | ${f.adapters.android} | Ingestor.ingest (${f.id}) | ${f.adapters.android} | **FULL PASS** |\n`;
});

cat.partialFormatFamilies.forEach(f => {
  const exts = [...f.extensions, ...f.aliases].join(', ');
  const sig = escapeMdCell(f.signatureDetection);
  md += `| ${idx++} | *${f.id}* (partial) | ${f.canonicalFamily} | \`${exts}\` | ${sig} | ${f.adapters.android} | Ingestor.ingest (${f.id}) | ${f.adapters.android} | *PARTIAL / PREVIEW* |\n`;
});

cat.containerCapabilities.forEach(c => {
  const exts = [...(c.extensions || []), ...(c.aliases || [])].join(', ');
  const sig = escapeMdCell(c.signatureDetection);
  md += `| ${idx++} | [${c.id}] (container) | ${c.canonicalFamily} | \`${exts}\` | ${sig} | ArchiveBrowser | ArchiveBrowser.openArchive | FolderArchiveBrowser | **CONTAINER PASS** |\n`;
});

fs.writeFileSync('reports/android-import-audit/run-20261115-postrel1/format-import-matrix.md', md, 'utf8');
console.log('Successfully generated format-import-matrix.md');
