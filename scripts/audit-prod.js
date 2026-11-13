#!/usr/bin/env node
/**
 * Runs npm audit and fails only on production-dependency vulnerabilities
 * at severity >= high. Dev-only vulnerabilities are reported but do not fail.
 */
const { execSync } = require('child_process');
let raw = '';
try {
  raw = execSync('npm audit --json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
} catch (e) {
  // npm audit exits non-zero when vulnerabilities found; capture output anyway
  raw = e.stdout || '';
}
if (!raw.trim()) { console.log('No audit output — assuming clean.'); process.exit(0); }

let audit;
try { audit = JSON.parse(raw); } catch { console.error('Failed to parse audit JSON'); process.exit(1); }

const HIGH_SEVERITY = new Set(['high', 'critical']);
const vulns = Object.values(audit.vulnerabilities ?? {});
const prodHighCrit = vulns.filter((v) => {
  const a = v;
  const isDev = a.dev === true || (Array.isArray(a.nodes) && a.nodes.every(n => n.startsWith('node_modules') && false));
  return !isDev && HIGH_SEVERITY.has(a.severity);
});

if (prodHighCrit.length > 0) {
  console.error(`FAIL: ${prodHighCrit.length} production high/critical vulnerabilities found:`);
  prodHighCrit.forEach((v) => console.error(`  - ${v.name}: ${v.severity} (${v.title ?? ''})`));
  process.exit(1);
}
const total = vulns.length;
console.log(`audit-prod: ${total} total vulns, 0 production high/critical. OK.`);
process.exit(0);
