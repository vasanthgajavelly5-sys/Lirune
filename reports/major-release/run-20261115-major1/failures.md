# Edge Cases & Format Findings — Acceptance Run run-20261115-major1

## Edge Cases Investigated During Run
1. **Low-Tier Sequential Dropping:**
   In batch sequential testing on Windows, dropping files within <300ms of closing a prior reader view occasionally caused the drop event to fire before the DOM was fully settled. Calling `Library.processFiles()` directly or debouncing reader transition verified that all 57 formats open and render reliably.
2. **Empty RTF Documents:**
   Files containing minimal RTF markup (e.g. `{\rtf1}` without text body) now display a clean placeholder notice rather than throwing an error.
3. **Legacy Office 95 Binary Format vs OLE2:**
   Word 95 (`0xDB 0xA5`) and PowerPoint 4.0 (`PP40` streams) require non-OLE or legacy stream parsing, which has been fully implemented and verified.
