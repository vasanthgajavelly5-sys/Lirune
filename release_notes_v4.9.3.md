# Lirune Reader v4.9.3 — Scroll Engine v2 Exclusivity & Hardened Zero-Permission Release

Scroll Engine v2 is now the exclusive, unified continuous-scroll engine across Lirune Android. Scroll Engine v1 and its experimental feature toggle have been permanently retired, shedding legacy code while preserving backwards-compatible reading positions and low-memory device stability.

Furthermore, release builds have been hardened: `android.permission.SYSTEM_ALERT_WINDOW` and `android.permission.WRITE_EXTERNAL_STORAGE` have been stripped alongside `android.permission.INTERNET` using release manifest overlay rules (`tools:node="remove"`).

---

### Highlights

- **Scroll Engine v2 Exclusivity:**
  - Continuous-mode EPUB reading is now powered unconditionally by Scroll Engine v2's virtualized block locator architecture.
  - Legacy Scroll Engine v1 code paths (monolithic chapter injection, sentinel-based DOM intersection observers, and host drain timers) have been permanently deleted.
  - Experimental "Scroll Engine (v1 / v2)" toggle row removed from Settings Sheet; continuous reading now seamlessly defaults to v2.
- **Backward Compatibility & Seamless Migration:**
  - Preserved full backward compatibility for saved reading positions (`loc:v2:...`, legacy `spine:N:scroll:Y`, `spine:N:frac:F`, and simple `spine:N`). Upgrading users will resume reading at the exact same location with zero position drift or loss.
  - Legacy `scrollEngine` values in stored settings, backups, and per-book overrides are silently sanitized and ignored without error.
  - Retained `scrollEngineCache` host setting (default `false`) for low-memory devices (such as 2GB RAM Galaxy Tab A tablets), properly purging evicted chapter ASTs from host memory.
- **Hardened Release Permissions (Zero Internet, Zero Alert Window, Zero Write Storage):**
  - Standalone release APK maintains zero network permissions (`android.permission.INTERNET` stripped via `tools:node="remove"`).
  - Development overlay permission `android.permission.SYSTEM_ALERT_WINDOW` is stripped from release builds.
  - Legacy `android.permission.WRITE_EXTERNAL_STORAGE` is stripped from release builds. All file operations, exports, and backups write either to app-private storage (`/data/user/0/com.lirune.reader/files/`) or use the Storage Access Framework (SAF), making raw shared external storage write permissions completely obsolete.

---

### Security & Integrity Verification

#### 1. Signing Fingerprint
The release APK is signed with the official repository release key:
```text
Owner: CN=Lirune Reader Release, OU=Android
SHA-256 Digest: ef68ec8a2182a7870debc0eceb28311a758d449219b84e7a9833379cdee516d1
SHA-1 Digest:   ef668b29ba556c4d425558c3f26e87f40c3f3bdc
```
Verify via `apksigner`:
```bash
apksigner verify --print-certs Lirune-Reader-v4.9.3-release.apk
```

#### 2. Verify Release Permissions
Permissions dump via `aapt2 dump permissions`:
```bash
aapt2 dump permissions Lirune-Reader-v4.9.3-release.apk
```
Actual output:
```text
package: com.lirune.reader
uses-permission: name='android.permission.READ_EXTERNAL_STORAGE' maxSdkVersion='32'
uses-permission: name='android.permission.VIBRATE'
permission: com.lirune.reader.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION
uses-permission: name='com.lirune.reader.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'
```
*(Confirmed: zero `INTERNET`, zero `SYSTEM_ALERT_WINDOW`, and zero `WRITE_EXTERNAL_STORAGE`).*

#### 3. SHA-256 Checksum
```text
6d0699a54496884fa19caedf92f705188babe1efe50a1fd8772e3eef0097fc67  Lirune-Reader-v4.9.3-release.apk
```
