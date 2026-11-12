# Windows Release Validation

Lirune Reader uses electron-builder's standard NSIS installer. No custom NSIS script or uninstall hook is configured. `deleteAppDataOnUninstall` is intentionally unset, so the default uninstall keeps the user's `%APPDATA%\Lirune Reader` library, metadata, annotations, backups, and settings for compatibility with existing installations. The folder is named from the app's `productName`; installs created before the rename may still hold their data in the older `%APPDATA%\Novera` folder.

## Build targets

- `npm run pack` builds an unpacked application.
- `npm run dist:win` builds the x64 NSIS installer. With no signing variables configured, it requests an unsigned local build. Configure `CSC_LINK` or `WIN_CSC_LINK` and the related password for a signed release.
- `npm run dist:store` is the separate MSIX target and requires Store identity/signing configuration when applicable.
- `npm run validate:release` checks the versioned installer and unpacked executable. It cannot prove uninstall behavior.

A valid NSIS build must finish successfully and produce `dist/Lirune Reader-<version>-Setup.exe`. Do not publish a small or partially generated installer left by a failed build.

## Manual smoke test

On a Windows machine where the generated installer is allowed to run:

1. Install Lirune Reader and confirm the Start Menu and optional Desktop shortcuts.
2. Launch Lirune Reader, import a test EPUB, close the app, and confirm the process exits.
3. Reopen the app and open an EPUB through the Windows association.
4. Uninstall from Installed apps / Apps & features.
5. Confirm the application directory, shortcuts, uninstall registration, association, and Lirune Reader processes are removed.
6. Confirm the existing `%APPDATA%\Lirune Reader` data remains unless an explicit future remove-data option is selected.
7. Repeat once while Lirune Reader is running and confirm the uninstaller prompts or safely closes it.
8. Test upgrade from the previous release and confirm library data remains.

Current repository work has not completed this install/uninstall smoke test. It remains **NOT VERIFIED** until a complete installer is built and run on Windows.

## Signing

Do not commit certificates or passwords. GitHub/release or Store builds should provide signing credentials through protected CI secrets and documented electron-builder variables. A local machine without a certificate may produce an unsigned installer, but Windows Application Control or SmartScreen can block it; that is an environment restriction, not evidence that uninstall works.
