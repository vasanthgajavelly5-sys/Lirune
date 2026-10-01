# 18-Format Live QA Status

Date: 2026-10-01

The requested NVIDIA GPU emulator run was not executable in this environment. `adb` was not available, `ANDROID_HOME`/`ANDROID_SDK_ROOT` were unset, and native Gradle assembly was blocked by missing Java. Therefore no format is marked live PASS.

| Format | Source/parser evidence | Import/open/navigation/reopen live evidence | Status |
|---|---|---|---|
| EPUB | Corpus/parser tests and EPUB source review | Not run | BLOCKED |
| TXT | Parser/unit evidence | Not run | BLOCKED |
| HTML | Parser/source review and sanitizer tests | Not run | BLOCKED |
| FB2 | Corpus/parser evidence | Not run | BLOCKED |
| MOBI | Corpus/parser evidence | Not run | BLOCKED |
| AZW | Corpus/parser evidence | Not run | BLOCKED |
| AZW3 | Corpus/parser evidence | Not run | BLOCKED |
| DOCX | Parser/source review | Not run | BLOCKED |
| ODT | Parser/source review | Not run | BLOCKED |
| RTF | Parser/source review | Not run | BLOCKED |
| DOC | Parser/source review | Not run | BLOCKED |
| CHM | Parser/source review | Not run | BLOCKED |
| PDF | PDF.js asset and parser evidence | Not run | BLOCKED |
| DJVU | Source/corpus evidence | Not run | BLOCKED |
| CBZ | Source/corpus evidence | Not run | BLOCKED |
| CBR | Source/corpus evidence | Not run | BLOCKED |
| ZIP | Inspection/parser evidence | Not run | BLOCKED |
| RAR | Inspection/parser evidence | Not run | BLOCKED |

## Required follow-up

Install/configure JDK, Android SDK platform-tools/emulator, launch API 35 NVIDIA GPU emulator, build/install the APK, and execute the format matrix with screenshots and persistence assertions. Existing runtime corpus PASS values are parser/corpus evidence only and must not be promoted to live PASS.
