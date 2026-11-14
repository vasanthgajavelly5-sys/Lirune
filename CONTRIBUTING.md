# Contributing to Lirune Reader

Thank you for helping improve Lirune Reader, a private, open-source Windows EPUB reader.

## Development Setup

1. Install Node.js 20 or newer.
2. Clone the repository.
3. Run `npm install`.
4. Start the desktop app with `npm start`.
5. Build the unpacked Windows app with `npm run pack`.

## Making Changes

- Keep changes focused and compatible with the existing Electron architecture.
- Preserve local library data and existing user preferences.
- Keep Electron security settings intact: context isolation stays enabled and renderer Node integration stays disabled.
- Prefer existing APIs and styles before adding dependencies.
- Add or update focused validation for behavior changes.
- Follow [DEVELOPMENT_STANDARDS.md](DEVELOPMENT_STANDARDS.md) and complete
  [CODE_QUALITY_CHECKLIST.md](CODE_QUALITY_CHECKLIST.md) for every change.
- Run `npm run check:modernization` and report any platform checks that are
  `NOT TESTED`.
- Do not commit private books, personal data, credentials, build secrets, or generated user storage.

## Pull Requests

Please include:

- A concise explanation of the problem and solution.
- Screenshots or a short recording for visible UI changes.
- Tests or validation commands run, including `npm run pack` when packaging is affected.
- Any known limitations, especially EPUB-specific compatibility limitations.

Use clear commit messages and keep unrelated formatting changes out of the pull request.

## EPUB Test Corpus

When changing EPUB import or rendering behavior, run the corpus validator against `Master_EPUB_Library_All/` when that folder is available. Do not redistribute copyrighted EPUB files in commits, pull requests, releases, or issue attachments.

## Code of Conduct

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
