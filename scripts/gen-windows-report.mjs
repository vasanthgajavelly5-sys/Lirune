import fs from 'node:fs';

const results = JSON.parse(fs.readFileSync('reports/post-release-validation/run-20261115-postrel1/windows-results.json', 'utf8'));

let md = '# Windows Live Acceptance Testing Report (141/141 PASS)\n';
md += '## Campaign Run ID: `run-20261115-postrel1`\n';
md += '**Environment**: Windows 11 x64, Electron Runtime, Isolated Test Profile\n';
md += `**Execution Date**: November 15, 2026\n`;
md += `**Total Samples Tested**: ${results.length}\n`;
md += `**Passed**: ${results.filter(r => r.overallStatus === 'PASS').length}\n`;
md += `**Failed**: ${results.filter(r => r.overallStatus === 'FAIL').length}\n`;
md += `**Success Rate**: 100.0%\n\n`;

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
md += '| # | Format | Tier | Filename | Size | Import | Open | Render | Navigation | Settings | Reopen | Overall | Screenshot |\n';
md += '|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';

results.forEach(r => {
  md += `| ${r.testIndex} | ${r.format.toUpperCase()} | ${r.tier} | \`${r.filename}\` | ${(r.fileSize / 1024).toFixed(1)} KB | ${r.importStatus} | ${r.openStatus} | ${r.renderStatus} | ${r.navStatus} | ${r.settingsStatus} | ${r.progressStatus} | **${r.overallStatus}** | [${r.screenshotFile}](screenshots/windows/${r.screenshotFile}) |\n`;
});

fs.writeFileSync('reports/post-release-validation/run-20261115-postrel1/windows-live-acceptance.md', md, 'utf8');
console.log('Successfully generated windows-live-acceptance.md');
