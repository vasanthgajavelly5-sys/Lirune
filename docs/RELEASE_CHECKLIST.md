# Lirune Reader 4.0.0 Release Checklist

## Automated

- [ ] `npm ci`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run audit` reviewed
- [ ] `npm run validate:corpus`
- [ ] `npm run pack`
- [ ] `npm run dist:win`
- [ ] `npm run validate:release`
- [ ] `npm run dist:store` with configured Store identity

## Windows smoke tests

- [ ] Clean install
- [ ] First launch
- [ ] Import and read an EPUB
- [ ] Close and reopen with progress preserved
- [ ] Open EPUB through Explorer association
- [ ] Second instance focuses the first instance
- [ ] Uninstall while closed
- [ ] Uninstall while running
- [ ] Application files and shortcuts removed
- [ ] EPUB association cleaned up
- [ ] Existing `%APPDATA%\\Lirune Reader` user data preserved
- [ ] Upgrade from previous release preserves user data
- [ ] Metadata backup and restore merge preserve books, progress, annotations, preferences, and collections

The current repository has not completed these Windows smoke tests on this machine because Application Control blocks unsigned installers.
