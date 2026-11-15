import fs from 'node:fs';

const pluginFile = 'mobile/plugins/native/lirune-storage/Ingestor.kt';
const appFile = 'mobile/android/app/src/main/java/com/lirune/reader/storage/Ingestor.kt';

let code = fs.readFileSync(appFile, 'utf8');

// Replace ingest logic to avoid double sniff and check partFile on disk
const oldIngest = `            val sourceUri = Uri.parse(sourceUriString)
            val sniff = FormatRegistry.sniff(context, sourceUri, entryName)
            if (sniff.kind != "book") {
                throw UnsupportedOperationException("Unsupported: Cannot import \${sniff.kind} item as a book (\${sniff.reason})")
            }
            val isLinkedRequested = mode == "linked"`;

const newIngest = `            val sourceUri = Uri.parse(sourceUriString)
            val isLinkedRequested = mode == "linked"`;

code = code.replace(oldIngest, newIngest);

const oldLinkedCheck = `            if (effectiveMode == "linked") {
                ingestLinked(sourceUri, sourceUriString, entryName, format, existingSha256List, jobId)
            } else {`;

const newLinkedCheck = `            if (effectiveMode == "linked") {
                val sniff = FormatRegistry.sniff(context, sourceUri, entryName)
                if (sniff.kind != "book") {
                    throw UnsupportedOperationException("Unsupported: Cannot import \${sniff.kind} item as a book (\${sniff.reason})")
                }
                ingestLinked(sourceUri, sourceUriString, entryName, format, existingSha256List, jobId)
            } else {`;

code = code.replace(oldLinkedCheck, newLinkedCheck);

// In ingestStream, sniff partFile before renaming
const oldRenameBlock = `        // Atomic rename
        if (!partFile.renameTo(finalFile)) {
            try { partFile.delete() } catch (_: Exception) {}
            throw IllegalStateException("Failed to atomically rename .part file to \$finalFile")
        }

        // Extract metadata native with 10s timeout
        val meta = extractMetadataSafe(finalFile.absolutePath, format, entryName)

        IngestResult(
            bookId = bookId,
            sha256 = sha256,
            size = totalCopied,
            mode = "managed",
            pathOrUri = finalFile.absolutePath,
            title = meta.first,
            author = meta.second,
            format = format,
            isDuplicate = false
        )`;

const newRenameBlock = `        // Sniff local file directly
        val sniff = FormatRegistry.sniffFile(partFile, entryName)
        if (sniff.kind != "book") {
            try { partFile.delete() } catch (_: Exception) {}
            throw UnsupportedOperationException("Unsupported: Cannot import \${sniff.kind} item as a book (\${sniff.reason})")
        }

        val detectedFormat = if (sniff.format != "unknown" && sniff.format.isNotBlank()) sniff.format else (format.ifBlank { "bin" })
        val finalFile = File(booksDir, "\$bookId.\$detectedFormat")

        // Atomic rename
        if (!partFile.renameTo(finalFile)) {
            try { partFile.delete() } catch (_: Exception) {}
            throw IllegalStateException("Failed to atomically rename .part file to \$finalFile")
        }

        // Extract metadata native with 10s timeout
        val meta = extractMetadataSafe(finalFile.absolutePath, detectedFormat, entryName)

        IngestResult(
            bookId = bookId,
            sha256 = sha256,
            size = totalCopied,
            mode = "managed",
            pathOrUri = finalFile.absolutePath,
            title = meta.first,
            author = meta.second,
            format = detectedFormat,
            isDuplicate = false
        )`;

code = code.replace(oldRenameBlock, newRenameBlock);

fs.writeFileSync(appFile, code, 'utf8');
fs.writeFileSync(pluginFile, code, 'utf8');
console.log('Successfully updated Ingestor.kt in both locations.');
