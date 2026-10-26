package com.lirune.reader.storage

import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.provider.DocumentsContract
import kotlinx.coroutines.*
import java.io.File
import java.util.ArrayDeque
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

data class DiscoveredEntry(
    val docId: String,
    val uri: String,
    val parentDocId: String?,
    val name: String,
    val size: Long,
    val mtime: Long,
    val sniffFormat: String,
    val confidence: Float,
    val quickFp: String,
    val state: String,
    val failReason: String? = null,
    val path: String? = null
)

class Scanner(
    private val context: Context,
    private val emitEvent: (String, Map<String, Any?>) -> Unit
) {

    private val isScanning = AtomicBoolean(false)
    private var scanJob: Job? = null

    companion object {
        private val SKIPPED_NAMES = setOf(
            "android", ".thumbnails", "lost.dir", "node_modules", "dcim", "obb"
        )
        private const val BATCH_SIZE = 200
        private const val MIN_FILE_BYTES = 1024L // Skip files under 1 KB
    }

    fun isBusy(): Boolean = isScanning.get()

    fun cancelScan() {
        isScanning.set(false)
        scanJob?.cancel()
    }

    /**
     * Starts queue-based BFS streaming scan over a SAF tree URI or local filesystem root.
     */
    fun startScan(
        treeUriString: String?,
        localPath: String?,
        maxDepth: Int = 10,
        scope: CoroutineScope
    ): Job {
        cancelScan()
        isScanning.set(true)

        val job = scope.launch(Dispatchers.IO) {
            val startTime = System.currentTimeMillis()
            var totalDiscovered = 0
            val batch = ArrayList<DiscoveredEntry>(BATCH_SIZE)

            try {
                if (!treeUriString.isNullOrBlank()) {
                    scanSafTree(
                        Uri.parse(treeUriString),
                        maxDepth,
                        onEntry = { entry ->
                            totalDiscovered++
                            batch.add(entry)
                            if (batch.size >= BATCH_SIZE) {
                                emitBatch(batch)
                                batch.clear()
                            }
                        },
                        onProgress = { found, currentDir ->
                            emitProgress(found, currentDir)
                        }
                    )
                } else if (!localPath.isNullOrBlank()) {
                    scanLocalPath(
                        File(localPath),
                        maxDepth,
                        onEntry = { entry ->
                            totalDiscovered++
                            batch.add(entry)
                            if (batch.size >= BATCH_SIZE) {
                                emitBatch(batch)
                                batch.clear()
                            }
                        },
                        onProgress = { found, currentDir ->
                            emitProgress(found, currentDir)
                        }
                    )
                }

                if (batch.isNotEmpty()) {
                    emitBatch(batch)
                    batch.clear()
                }

                val duration = System.currentTimeMillis() - startTime
                emitDone(totalDiscovered, duration)
            } catch (e: CancellationException) {
                emitEvent("onScanCancelled", mapOf("total" to totalDiscovered))
            } catch (e: Exception) {
                emitEvent("onScanError", mapOf("error" to (e.message ?: "Scan failed")))
            } finally {
                isScanning.set(false)
            }
        }
        scanJob = job
        return job
    }

    private suspend fun scanSafTree(
        treeUri: Uri,
        maxDepth: Int,
        onEntry: (DiscoveredEntry) -> Unit,
        onProgress: (Int, String) -> Unit
    ) = withContext(Dispatchers.IO) {
        val resolver = context.contentResolver
        val rootDocId = DocumentsContract.getTreeDocumentId(treeUri)

        // Queue: Pair of docId, currentDepth, parentDocId
        val queue = ArrayDeque<Triple<String, Int, String?>>()
        queue.add(Triple(rootDocId, 0, null))

        val visitedDocIds = HashSet<String>()
        visitedDocIds.add(rootDocId)

        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED
        )

        var foundCount = 0
        var lastProgressAt = 0L

        while (queue.isNotEmpty() && isScanning.get() && isActive) {
            val (currentDocId, currentDepth, parentDocId) = queue.poll() ?: break

            val now = System.currentTimeMillis()
            if (now - lastProgressAt > 200) {
                lastProgressAt = now
                onProgress(foundCount, currentDocId)
            }

            // Always rebuild children URI using the current directory's document ID
            val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, currentDocId)
            val cursor: Cursor? = try {
                resolver.query(childrenUri, projection, null, null, null)
            } catch (_: Exception) {
                null
            }

            cursor?.use { c ->
                val idCol = c.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
                val nameCol = c.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
                val mimeCol = c.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)
                val sizeCol = c.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE)
                val mtimeCol = c.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)

                while (c.moveToNext() && isScanning.get() && isActive) {
                    val childDocId = if (idCol >= 0) c.getString(idCol) ?: "" else ""
                    val name = if (nameCol >= 0) c.getString(nameCol) ?: "" else ""
                    val mime = if (mimeCol >= 0) c.getString(mimeCol) ?: "" else ""
                    val size = if (sizeCol >= 0) c.getLong(sizeCol) else 0L
                    val mtime = if (mtimeCol >= 0) c.getLong(mtimeCol) else 0L

                    if (childDocId.isBlank()) continue

                    val isDir = mime == DocumentsContract.Document.MIME_TYPE_DIR
                    val nameLower = name.lowercase(Locale.ROOT)

                    if (isDir) {
                        if (nameLower.startsWith(".") || SKIPPED_NAMES.contains(nameLower)) continue
                        if (currentDepth + 1 <= maxDepth && visitedDocIds.add(childDocId)) {
                            queue.add(Triple(childDocId, currentDepth + 1, currentDocId))
                        }
                    } else {
                        if (nameLower.startsWith(".") || size < MIN_FILE_BYTES) continue

                        // Pass 1: candidate filter by extension (also keep extensionless files and .bin)
                        val ext = getExt(name)
                        val isCandidate = ext.isEmpty() || ext == "bin" || FormatRegistry.isSupported(ext)

                        if (!isCandidate) continue

                        val docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, childDocId)

                        // Pass 2: content-sniff candidates
                        val sniff = FormatRegistry.sniff(context, docUri, name, size)
                        val quickFp = sniff.quickFp ?: "$size:$childDocId"

                        val (state, failReason) = when {
                            sniff.isDrm -> Pair("failed:drm", sniff.drmReason ?: "DRM protection detected")
                            sniff.format == "unknown" -> Pair("failed:unrecognized", sniff.reason)
                            else -> Pair("identified", null)
                        }

                        val entry = DiscoveredEntry(
                            docId = childDocId,
                            uri = docUri.toString(),
                            parentDocId = currentDocId,
                            name = name,
                            size = size,
                            mtime = mtime,
                            sniffFormat = sniff.format,
                            confidence = sniff.confidence,
                            quickFp = quickFp,
                            state = state,
                            failReason = failReason
                        )
                        foundCount++
                        onEntry(entry)
                    }
                }
            }
        }
    }

    private suspend fun scanLocalPath(
        rootDir: File,
        maxDepth: Int,
        onEntry: (DiscoveredEntry) -> Unit,
        onProgress: (Int, String) -> Unit
    ) = withContext(Dispatchers.IO) {
        val queue = ArrayDeque<Triple<File, Int, String?>>()
        queue.add(Triple(rootDir, 0, null))

        var foundCount = 0
        var lastProgressAt = 0L

        while (queue.isNotEmpty() && isScanning.get() && isActive) {
            val (currentDir, currentDepth, parentDocId) = queue.poll() ?: break

            val now = System.currentTimeMillis()
            if (now - lastProgressAt > 200) {
                lastProgressAt = now
                onProgress(foundCount, currentDir.name)
            }

            val files = try {
                currentDir.listFiles()
            } catch (_: Exception) {
                null
            } ?: continue

            for (file in files) {
                if (!isScanning.get() || !isActive) break

                val name = file.name
                val nameLower = name.lowercase(Locale.ROOT)

                if (file.isDirectory) {
                    if (nameLower.startsWith(".") || SKIPPED_NAMES.contains(nameLower)) continue
                    if (currentDepth + 1 <= maxDepth) {
                        queue.add(Triple(file, currentDepth + 1, currentDir.absolutePath))
                    }
                } else if (file.isFile) {
                    val size = file.length()
                    if (nameLower.startsWith(".") || size < MIN_FILE_BYTES) continue

                    val ext = getExt(name)
                    val isCandidate = ext.isEmpty() || ext == "bin" || FormatRegistry.isSupported(ext)
                    if (!isCandidate) continue

                    val sniff = FormatRegistry.sniffFile(file, name)
                    val quickFp = sniff.quickFp ?: "$size:${file.name}"

                    val (state, failReason) = when {
                        sniff.isDrm -> Pair("failed:drm", sniff.drmReason ?: "DRM protection detected")
                        sniff.format == "unknown" -> Pair("failed:unrecognized", sniff.reason)
                        else -> Pair("identified", null)
                    }

                    val entry = DiscoveredEntry(
                        docId = file.absolutePath,
                        uri = "file://${file.absolutePath}",
                        parentDocId = parentDocId,
                        name = name,
                        size = size,
                        mtime = file.lastModified(),
                        sniffFormat = sniff.format,
                        confidence = sniff.confidence,
                        quickFp = quickFp,
                        state = state,
                        failReason = failReason,
                        path = file.absolutePath
                    )
                    foundCount++
                    onEntry(entry)
                }
            }
        }
    }

    private fun emitBatch(batch: List<DiscoveredEntry>) {
        val list = batch.map { entry ->
            mapOf(
                "docId" to entry.docId,
                "uri" to entry.uri,
                "parentDocId" to entry.parentDocId,
                "name" to entry.name,
                "size" to entry.size.toDouble(),
                "mtime" to entry.mtime.toDouble(),
                "sniffFormat" to entry.sniffFormat,
                "confidence" to entry.confidence.toDouble(),
                "quickFp" to entry.quickFp,
                "state" to entry.state,
                "failReason" to entry.failReason,
                "path" to entry.path
            )
        }
        emitEvent("onScanBatch", mapOf("entries" to list))
    }

    private fun emitProgress(found: Int, currentDir: String) {
        emitEvent("onScanProgress", mapOf("found" to found, "currentDir" to currentDir))
    }

    private fun emitDone(total: Int, durationMs: Long) {
        emitEvent("onScanDone", mapOf("total" to total, "durationMs" to durationMs.toDouble()))
    }

    private fun getExt(name: String): String {
        val idx = name.lastIndexOf('.')
        return if (idx >= 0 && idx < name.length - 1) {
            name.substring(idx + 1).lowercase(Locale.ROOT)
        } else ""
    }
}
