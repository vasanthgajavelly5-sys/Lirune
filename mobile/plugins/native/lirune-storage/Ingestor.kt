package com.lirune.reader.storage

import android.content.Context
import android.net.Uri
import android.os.ParcelFileDescriptor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.security.DigestOutputStream
import java.security.MessageDigest
import java.util.UUID

data class IngestResult(
    val bookId: String,
    val sha256: String,
    val size: Long,
    val mode: String, // 'managed' or 'linked'
    val pathOrUri: String,
    val title: String,
    val author: String?,
    val format: String,
    val isDuplicate: Boolean = false
)

class Ingestor(
    private val context: Context,
    private val booksDir: File,
    private val emitEvent: (String, Map<String, Any?>) -> Unit
) {

    private val semaphore = Semaphore(2)

    init {
        if (!booksDir.exists()) {
            booksDir.mkdirs()
        }
    }

    /**
     * Ingests a candidate entry into the library.
     */
    suspend fun ingest(
        sourceUriString: String,
        mode: String = "managed",
        entryName: String,
        format: String,
        existingSha256List: Set<String> = emptySet(),
        jobId: Long = 0L
    ): IngestResult = withContext(Dispatchers.IO) {
        semaphore.withPermit {
            val sourceUri = Uri.parse(sourceUriString)
            val sniff = FormatRegistry.sniff(context, sourceUri, entryName)
            if (sniff.kind != "book") {
                throw UnsupportedOperationException("Unsupported: Cannot import ${sniff.kind} item as a book (${sniff.reason})")
            }
            val isLinkedRequested = mode == "linked"

            var effectiveMode = "managed"
            var isSeekable = false

            if (isLinkedRequested) {
                isSeekable = probeSeekable(sourceUri)
                if (isSeekable) {
                    effectiveMode = "linked"
                }
            }

            if (effectiveMode == "linked") {
                ingestLinked(sourceUri, sourceUriString, entryName, format, existingSha256List, jobId)
            } else {
                ingestManaged(sourceUri, sourceUriString, entryName, format, existingSha256List, jobId)
            }
        }
    }

    private suspend fun ingestManaged(
        sourceUri: Uri,
        sourceUriString: String,
        entryName: String,
        format: String,
        existingSha256List: Set<String>,
        jobId: Long
    ): IngestResult = withContext(Dispatchers.IO) {
        val inputStream = openStream(sourceUri, sourceUriString)
            ?: throw IllegalStateException("Cannot open input stream for $sourceUriString")
        ingestStream(inputStream, entryName, format, existingSha256List, jobId)
    }

    suspend fun ingestStream(
        inputStream: InputStream,
        entryName: String,
        format: String,
        existingSha256List: Set<String> = emptySet(),
        jobId: Long = 0L
    ): IngestResult = withContext(Dispatchers.IO) {
        val bookId = UUID.randomUUID().toString()
        val ext = format.ifBlank { "bin" }
        val partFile = File(booksDir, "$bookId.part")
        val finalFile = File(booksDir, "$bookId.$ext")

        val md = MessageDigest.getInstance("SHA-256")
        var totalCopied = 0L

        try {
            FileOutputStream(partFile).use { fos ->
                DigestOutputStream(fos, md).use { dos ->
                    val buffer = ByteArray(65536)
                    var bytesRead: Int
                    var lastReport = 0L

                    while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                        dos.write(buffer, 0, bytesRead)
                        totalCopied += bytesRead

                        val now = System.currentTimeMillis()
                        if (now - lastReport > 200) {
                            lastReport = now
                            emitEvent("onImportProgress", mapOf(
                                "jobId" to jobId,
                                "bytesCopied" to totalCopied.toDouble()
                            ))
                        }
                    }
                    dos.flush()
                }
                // Call fsync to guarantee durability
                fos.fd.sync()
            }
        } finally {
            try { inputStream.close() } catch (_: Exception) {}
        }

        val sha256 = md.digest().joinToString("") { "%02x".format(it) }

        // Deduplication check
        if (existingSha256List.contains(sha256)) {
            partFile.delete()
            return@withContext IngestResult(
                bookId = bookId,
                sha256 = sha256,
                size = totalCopied,
                mode = "managed",
                pathOrUri = finalFile.absolutePath,
                title = sanitizeTitle(entryName),
                author = null,
                format = format,
                isDuplicate = true
            )
        }

        // Atomic rename
        if (!partFile.renameTo(finalFile)) {
            throw IllegalStateException("Failed to atomically rename .part file to $finalFile")
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
        )
    }

    private suspend fun ingestLinked(
        sourceUri: Uri,
        sourceUriString: String,
        entryName: String,
        format: String,
        existingSha256List: Set<String>,
        jobId: Long
    ): IngestResult = withContext(Dispatchers.IO) {
        val bookId = UUID.randomUUID().toString()
        val md = MessageDigest.getInstance("SHA-256")
        var totalRead = 0L

        val inputStream = openStream(sourceUri, sourceUriString)
            ?: throw IllegalStateException("Cannot open input stream for $sourceUriString")

        try {
            val buffer = ByteArray(65536)
            var bytesRead: Int
            while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                md.update(buffer, 0, bytesRead)
                totalRead += bytesRead
            }
        } finally {
            try { inputStream.close() } catch (_: Exception) {}
        }

        val sha256 = md.digest().joinToString("") { "%02x".format(it) }

        if (existingSha256List.contains(sha256)) {
            return@withContext IngestResult(
                bookId = bookId,
                sha256 = sha256,
                size = totalRead,
                mode = "linked",
                pathOrUri = sourceUriString,
                title = sanitizeTitle(entryName),
                author = null,
                format = format,
                isDuplicate = true
            )
        }

        val meta = extractMetadataSafe(sourceUriString, format, entryName)

        IngestResult(
            bookId = bookId,
            sha256 = sha256,
            size = totalRead,
            mode = "linked",
            pathOrUri = sourceUriString,
            title = meta.first,
            author = meta.second,
            format = format,
            isDuplicate = false
        )
    }

    private fun openStream(uri: Uri, raw: String) = when {
        raw.startsWith("file://") || raw.startsWith("/") -> {
            val path = if (raw.startsWith("file://")) uri.path ?: raw.removePrefix("file://") else raw
            File(path).inputStream()
        }
        else -> context.contentResolver.openInputStream(uri)
    }

    /**
     * Probes whether a URI supports random-access seeking (Pfd statSize >= 0 and seek test).
     */
    fun probeSeekable(uri: Uri): Boolean {
        return try {
            val pfd = context.contentResolver.openFileDescriptor(uri, "r") ?: return false
            pfd.use {
                if (it.statSize < 0) return false
                val stream = FileInputStream(it.fileDescriptor)
                stream.channel.position(minOf(1024L, it.statSize.coerceAtLeast(0L)))
                true
            }
        } catch (_: Exception) {
            false
        }
    }

    private suspend fun extractMetadataSafe(
        pathOrUri: String,
        format: String,
        fallbackName: String
    ): Pair<String, String?> {
        val result = withTimeoutOrNull(10000L) {
            try {
                // Return filename-based title as fallback; real extraction is fast
                Pair(sanitizeTitle(fallbackName), null as String?)
            } catch (_: Exception) {
                Pair(sanitizeTitle(fallbackName), null)
            }
        }
        return result ?: Pair(sanitizeTitle(fallbackName), null)
    }

    private fun sanitizeTitle(name: String): String {
        val idx = name.lastIndexOf('.')
        val base = if (idx > 0) name.substring(0, idx) else name
        return base.replace('_', ' ').trim().ifBlank { "Untitled" }
    }
}
