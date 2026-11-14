# Lirune Development Standards

These standards are mandatory for every feature, bug fix, refactor, dependency
change, and platform-specific change.

## Supported implementation approach

- Use the latest compatible stable API for the actual Electron/Node,
  Expo/React Native, Android, and browser runtime.
- Prefer official platform guidance and repository utilities over tutorials,
  workarounds, or duplicate implementations.
- Preserve Electron context isolation, disabled renderer Node integration,
  strict content security policy, offline behavior, and Android storage
  permission boundaries.
- Keep shared contracts and domain logic consistent between Windows and Android.

## Before implementation

1. Read the affected implementation, tests, architecture documentation, and
   dependency manifest.
2. Map the Windows and Android call paths affected by the change.
3. Check for deprecated APIs, obsolete workarounds, duplicate utilities, and
   existing modern services that can be reused.
4. Verify the current stable API and compatibility requirements from official
   documentation.
5. Identify regression, storage, privacy, security, and platform risks.
6. Define the desktop and Android tests required for the change.

## After implementation

1. Run `npm run check:modernization`.
2. Run focused tests, linting, and typechecking for each affected platform.
3. Run Windows packaging validation for desktop packaging/runtime changes.
4. Run Android native validation when Android code, configuration, or plugins
   change.
5. Check that no unnecessary dependency, duplicate implementation, or obsolete
   code was introduced.
6. Verify unrelated functionality remains intact.
7. Record warnings, exceptions, and unavailable checks as `NOT TESTED` or
   explicitly documented limitations.

## Completion rule

A change is complete only when the applicable modernization, quality,
regression, and platform checks pass. A fix that resolves only the immediate
symptom is not complete if it introduces deprecated APIs, unsupported
dependencies, or an unvalidated platform behavior.

The automated deprecated-pattern gate is intentionally conservative and
baseline-aware. It catches newly introduced high-confidence legacy patterns;
official API migrations and platform behavior still require manual review.
Reviewers must manually verify platform lifecycle, storage, permissions,
WebView/rendering, accessibility, and framework API guidance when static
scanning cannot establish correctness. The checker scans maintained JavaScript/TypeScript, Kotlin/Java, Gradle,
PowerShell, and batch build/configuration sources. It excludes generated
dependencies, build outputs, test fixtures, and the generated PDF.js payload;
the PDF.js pipeline has its own integrity check.

## Mandatory Release Gate Standard

For every release version:
1. **Multi-Platform Mandatory**: Both Windows and Android builds and tests must execute.
2. **Hard Gate**: CI/CD release workflow (`.github/workflows/release-gate.yml`) enforces blocking checks across source validation, modernization gate, production dependency audit, unit/integration suites, native packaging, and silent installation/uninstallation lifecycle tests.
3. **No Silent Skips**: Any stage or platform that cannot execute in the test environment must be recorded as `NOT TESTED`. Releases must not proceed on incomplete validations.
4. **Zero Actionable Vulnerabilities**: Dependency audits must show 0 critical, high, or moderate vulnerabilities in production dependencies. All actionable GitHub bot and CodeQL security alerts must be addressed.
