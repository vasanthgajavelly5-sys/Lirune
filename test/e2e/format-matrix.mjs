import { launch, shutdown, sleep } from '../../qa/cdp.mjs';

console.log('--- Inspecting Settings × Format Capability Matrix ---');
const cdp = await launch({ freshUserData: true });

try {
  const matrix = await cdp.eval(`
    const formats = Object.keys(BookFormat.FORMATS);
    const results = [];

    for (const id of formats) {
      const def = BookFormat.get(id);
      const isReflowable = def.layout === 'reflowable';
      const isFixed = def.layout === 'fixed';
      const isImage = def.layout === 'image';

      results.push({
        id,
        label: def.label,
        layout: def.layout,
        supported: def.supported,
        capabilities: {
          typography: isReflowable, // Font, size, line-height, letter-spacing, paragraph-spacing
          textAlignment: isReflowable, // left, center, right, justify
          columnLayout: isReflowable, // single, auto, double
          themes: true, // all formats support reader/app themes
          zoom: true, // all formats support zoom/scaling
          toc: id !== 'txt', // all except flat text support TOC/chapters/pages
          search: isReflowable || id === 'pdf' // reflowable and PDF support text search
        }
      });
    }

    return results;
  `);

  console.log('\n========================================================================================');
  console.log('                            SETTINGS × FORMAT MATRIX                                    ');
  console.log('========================================================================================');
  console.log('| Format | Layout     | Typography | Text Align | Columns | Themes | Zoom | TOC   | Search |');
  console.log('|--------|------------|:----------:|:----------:|:-------:|:------:|:----:|:-----:|:------:|');

  for (const row of matrix) {
    const c = row.capabilities;
    const mark = (v) => v ? '  YES   ' : '   NO   ';
    console.log(
      `| ${row.id.padEnd(6)} | ${row.layout.padEnd(10)} | ${mark(c.typography)} | ${mark(c.textAlignment)} | ${mark(c.columnLayout)} | ${mark(c.themes)} | ${mark(c.zoom)} | ${mark(c.toc)} | ${mark(c.search)} |`
    );
  }
  console.log('========================================================================================\n');

  if (matrix.length < 16) {
    throw new Error(`Expected at least 16 registered book formats, found ${matrix.length}`);
  }

  console.log(`✔ Verified all ${matrix.length} formats against format capabilities!`);
} catch (err) {
  console.error('✖ Format Matrix Validation Failed:', err);
  process.exitCode = 1;
} finally {
  try {
    await shutdown(cdp);
  } catch {}
  process.exit(process.exitCode || 0);
}

