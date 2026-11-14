# Code Quality Checklist

Use this checklist in every pull request and coding-agent task.

## Before coding

- [ ] Existing feature, tests, architecture, and dependencies inspected.
- [ ] Windows and Android code paths identified.
- [ ] Current stable official APIs verified.
- [ ] Existing modern implementation checked for reuse.
- [ ] Regression, compatibility, privacy, and security risks identified.
- [ ] Required desktop and Android validation selected.

## After coding

- [ ] `npm run check:modernization` passes.
- [ ] No newly deprecated API or legacy workaround was introduced.
- [ ] No unnecessary dependency or duplicate implementation was added.
- [ ] Unneeded replaced code was removed safely.
- [ ] Desktop lint, focused tests, and integration tests pass when applicable.
- [ ] Mobile lint, typecheck, and focused tests pass when applicable.
- [ ] Windows packaging validation passes when packaging/runtime is affected.
- [ ] Android native validation passes when native/configuration code is affected.
- [ ] Regression tests for the changed feature pass.
- [ ] Unrelated functionality remains intact.
- [ ] Untested platforms, warnings, and exceptions are explicitly documented.

## Release Candidate Checklist

- [ ] Release version and tag consistency verified in `package.json` and `mobile/package.json`.
- [ ] Complete automated test suites run on both platforms (402 mobile tests, 13+ desktop tests).
- [ ] Production dependency audits pass with 0 high/critical/moderate vulnerabilities.
- [ ] Windows silent installation, launch, and uninstallation lifecycle verified.
- [ ] Android fresh installation, permission grant, library init, and uninstallation verified.
- [ ] `Launch-Lirune.bat` launcher validated with `--test-dry-run` and `--validate-only`.
- [ ] Release artifacts generated, signed (v2 for APK, Authenticode/NSIS for Windows), and checksummed.
- [ ] All CI/CD release gate stages in `.github/workflows/release-gate.yml` passed.

## Evidence

Pull requests should list the commands run and their result. If a platform is
not available, write `NOT TESTED` and explain why; do not infer success.
