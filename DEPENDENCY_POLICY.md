# Dependency Policy

## Selection

- Prefer platform-provided APIs and existing dependencies over new packages.
- Add a dependency only when it has a clear maintained purpose, compatible
  license, active support, and no suitable existing alternative.
- Use stable versions compatible with the repository's Node, Electron, Expo,
  React Native, and Android baselines.
- Do not add deprecated, abandoned, duplicate, or development-only packages to
  production bundles.

## Changes

When touching a dependency:

1. Check current support status, security advisories, and release notes.
2. Review migration requirements before upgrading.
3. Update the correct lockfile with `npm ci`/`npm install` as appropriate.
4. Run affected desktop and Android checks.
5. Document compatibility decisions and any intentionally deferred upgrade.

Do not perform broad upgrades during an unrelated bug fix. Critical security
issues remain actionable regardless of task size.

## Update priority

- **Security updates:** prioritize immediately; run the affected production
  audit and platform regression checks before merging.
- **Routine compatible stable updates:** review regularly and adopt when they
  remain within the supported runtime and framework range.
- **Major upgrades:** require migration notes, explicit compatibility review,
  lockfile updates, and desktop/Android regression testing.
- **Unsupported dependencies:** replace them when a maintained compatible
  alternative exists; otherwise document the exception, risk, and owner.
- **Compatibility-sensitive dependencies:** keep the current version when an
  upgrade would break supported devices, offline rendering, native plugins, or
  packaging. Record the reason and revisit it during maintenance review.

## Recurring maintenance

Dependabot monitors root npm, mobile npm, and GitHub Actions dependencies.
CI runs production audits and dependency review. Maintainers should review
Dependabot updates weekly and retain only supported, compatible versions.
