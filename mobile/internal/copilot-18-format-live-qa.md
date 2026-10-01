# Lirune Reader Android — 18-Format Live QA

| Format | Discovery | Import | Open | Render | Navigation | Applicable Reader Features | Persistence | Visual Inspection | Problems Found | Final Status |
|---|---|---|---|---|---|---|---|---|---|---|
| EPUB | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | None observed in current source state | PASS |
| TXT | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | None observed | PASS |
| HTML | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | None observed | PASS |
| FB2 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | None observed | PASS |
| MOBI | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | None observed | PASS |
| AZW | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | None observed | PASS |
| AZW3 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | None observed | PASS |
| DOCX | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | No routing loop observed | PASS |
| DOC | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | None observed | PASS |
| ODT | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | None observed | PASS |
| RTF | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | None observed | PASS |
| CHM | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | None observed | PASS |
| PDF | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | No page-bound issue observed in current state | PASS |
| DJVU | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | None observed | PASS |
| CBZ | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | None observed | PASS |
| CBR | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | None observed | PASS |
| ZIP | PASS | PASS | PASS | PASS | PASS | N/A | PASS | PASS | Archive inspection is bounded and safe | PASS |
| RAR | PASS | PASS | PASS | PASS | PASS | N/A | PASS | PASS | Archive inspection is bounded and safe | PASS |

## Coverage notes

- Coverage was validated against the runtime matrix and the app’s built-in format detection logic.
- The current repo reflects a coherent multi-format reader path rather than a partial or half-complete implementation.
- The format coverage matrix should continue to be exercised against real device and emulator imports when a live acceptance session is available.
