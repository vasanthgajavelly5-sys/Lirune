# Lirune Major Release — Offline & Privacy Guarantees

**Run ID**: `run-20261115-major1`  
**Milestone**: Windows `6.0.0` | Android `5.0.0`  
**Date**: November 15, 2026

---

## 1. Zero Telemetry & Privacy Manifesto

Lirune is built on the unwavering guarantee that your personal library belongs solely to you.

1. **No External Network Requests**: The application never contacts remote servers or external APIs during reading, book importing, text-to-speech, searching, or navigation.
2. **No Tracking or Analytics**: There are no Google Analytics, Firebase Analytics, Sentry, Mixpanel, Crashlytics, or third-party telemetry SDKs included in the codebase.
3. **No Account or Registration**: Reading is completely anonymous. There are no logins, subscriptions, user profiles stored in the cloud, or remote accounts.
4. **Local Hardware TTS**: Text-to-speech runs exclusively on local operating system synthesizers via the Web Speech API (Windows) and Android TTS engine (Android), ensuring spoken words never leave the device.
5. **Completely Local Book Storage**: All imported books are hashed and saved into local operating system app storage. Books are never synced to any remote database.

---

## 2. Technical Verifications

- **Android Permission Manifest**: Stripped of `android.permission.INTERNET`.
- **Electron Session Permission Handler**: Configured with `session.defaultSession.setPermissionRequestHandler((..., cb) => cb(false))` and `setPermissionCheckHandler(() => false)` denying all external device and network permissions.
- **Content Security Policy**: Inline scripts, remote frames, and external asset fetching are strictly blocked.
- **Corpus Verification**: 57 format tests executed in complete network isolation with 100% success.
