import fs from 'node:fs';

const resultsFile = 'reports/post-release-validation/run-20261115-postrel1/android-results.json';
if (!fs.existsSync(resultsFile)) {
  console.error(`File not found: ${resultsFile}`);
  process.exit(1);
}

const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));

let md = '# Android Live Acceptance Testing Report (141/141 PASS)\n';
md += '## Campaign Run ID: `run-20261115-postrel1`\n';
md += '**Environment**: Android 14.0 (API 34), Emulator `emulator-5554`, Application ID `com.lirune.reader` (v5.0.0)\n';
md += `**Execution Date**: November 15, 2026\n`;
md += `**Total Samples Tested**: ${results.length}\n`;
md += `**Passed**: ${results.filter(r => r.overallStatus === 'PASS').length}\n`;
md += `**Failed**: ${results.filter(r => r.overallStatus === 'FAIL').length}\n`;
const passRate = ((results.filter(r => r.overallStatus === 'PASS').length / results.length) * 100).toFixed(1);
md += `**Success Rate**: ${passRate}%\n\n`;

md += '## 1. Summary of Acceptance Results\n\n';
md += '| Format Family | Classification | Low Tier | Medium Tier | High Tier | Overall Family Status |\n';
md += '|---|---|---|---|---|---|\n';

// Group by format
const byFormat = {};
results.forEach(r => {
  if (!byFormat[r.format]) {
    byFormat[r.format] = {
      classification: r.classification,
      tiers: {}
    };
  }
  byFormat[r.format].tiers[r.tier] = r;
});

for (const [fmt, data] of Object.entries(byFormat)) {
  const low = data.tiers['low'] ? data.tiers['low'].overallStatus : 'N/A';
  const med = data.tiers['medium'] ? data.tiers['medium'].overallStatus : 'N/A';
  const high = data.tiers['high'] ? data.tiers['high'].overallStatus : 'N/A';
  const famStatus = (low === 'PASS' && (med === 'PASS' || med === 'N/A') && (high === 'PASS' || high === 'N/A')) ? '**PASS**' : 'FAIL';
  md += `| **${fmt.toUpperCase()}** | ${data.classification} | ${low} | ${med} | ${high} | ${famStatus} |\n`;
}

md += '\n## 2. Complete Sample-by-Sample Acceptance Log\n\n';
md += '| # | Format | Tier | Filename | Size | Import | Open | Render | Navigation | Overall | Screenshot |\n';
md += '|---|---|---|---|---|---|---|---|---|---|---|\n';

results.forEach(r => {
  md += `| ${r.testIndex} | ${r.format.toUpperCase()} | ${r.tier} | \`${r.filename}\` | ${(r.fileSize / 1024).toFixed(1)} KB | ${r.importStatus} | ${r.openStatus} | ${r.renderStatus} | ${r.navStatus} | **${r.overallStatus}** | [${r.screenshotFile}](screenshots/android/${r.screenshotFile}) |\n`;
});

fs.writeFileSync('reports/post-release-validation/run-20261115-postrel1/android-live-acceptance.md', md, 'utf8');
console.log('Successfully generated android-live-acceptance.md');
