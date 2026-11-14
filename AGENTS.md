# Lirune Engineering Instructions

These instructions apply to all changes in this repository. Read
[DEVELOPMENT_STANDARDS.md](DEVELOPMENT_STANDARDS.md) and
[CODE_QUALITY_CHECKLIST.md](CODE_QUALITY_CHECKLIST.md) before modifying code.

- Inspect the existing implementation and both platform call paths before editing.
- Use the latest compatible stable Electron, Android, Expo, React Native, and
  web APIs supported by the current runtime; do not copy deprecated patterns
  from older code.
- Reuse existing services, repositories, security boundaries, and shared
  utilities before adding new implementations or dependencies.
- Preserve Windows and Android behavior, privacy guarantees, storage formats,
  and security settings.
- Run the smallest relevant desktop and mobile checks after changes. Run
  `npm run check:modernization` for every code change.
- Run `npm run pack` for packaging or desktop runtime changes and the Android
  typecheck, lint, tests, and native build checks for mobile changes when the
  environment supports them.
- For shared code changes, validate both platforms or record each unavailable
  platform as `NOT TESTED`.
- Report platform checks that could not run as `NOT TESTED`; never imply that
  an unavailable platform was validated.
- Keep dependency changes explicit and follow
  [DEPENDENCY_POLICY.md](DEPENDENCY_POLICY.md). Document exceptions and
  remaining warnings in the pull request.

## Mandatory Release Gate Policy

Every time a new Lirune release version is prepared (patch, minor, or major):
- Both Android and Windows are mandatory release targets; neither platform may be skipped.
- The complete engineering, security, testing, installation, and release-readiness process must be executed.
- Routine changes require lint, typecheck, modernization gate, and unit/integration tests.
- Release candidates require the full pipeline: unit, integration, E2E, performance, security, fresh installation, upgrade, uninstallation, and Windows launcher validation.
- Missing test infrastructure must NEVER be reported as a passing result; record as `NOT TESTED`.
- Release publication is hard-blocked in CI/CD until every required validation stage passes without error.
- All actionable GitHub security alerts (Dependabot, CodeQL, Secret scanning) must be resolved prior to release authorization.
