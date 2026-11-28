package com.lirune.reader.storage

import android.content.ContentUris
import android.database.Cursor
import android.net.Uri
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.File
import java.util.ArrayDeque
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Storage scanning collaborator extracted from LiruneStorageModule to keep the
 * React Native bridge class focused on method dispatch and marshalling.
 */
internal class StorageScanEngine(
    private val reactContext: ReactApplicationContext,
    private val sourceManager: SourceManager,
    private val moduleScope: CoroutineScope,
    private val scanCancelled: AtomicBoolean,
) {
    fun scanMediaStore(promise: Promise) {
        moduleScope.launch(Dispatchers.IO) {
            try {
                val results = Arguments.createArray()
                val seenUris = HashSet<String>()
                val resolver = reactContext.contentResolver

                val projection = arrayOf(
                    MediaStore.Files.FileColumns._ID,
                    MediaStore.Files.FileColumns.DISPLAY_NAME,
                    MediaStore.Files.FileColumns.DATA,
                    MediaStore.Files.FileColumns.MIME_TYPE,
                    MediaStore.Files.FileColumns.SIZE,
                    MediaStore.Files.FileColumns.DATE_MODIFIED
                )

                val queryUri = MediaStore.Files.getContentUri("external")
                val cursor: Cursor? = resolver.query(
                    queryUri,
                    projection,
                    null,
                    null,
                    "${MediaStore.Files.FileColumns.DATE_MODIFIED} DESC"
                )

                cursor?.use { c ->
                    val idCol = c.getColumnIndex(MediaStore.Files.FileColumns._ID)
                    val nameCol = c.getColumnIndex(MediaStore.Files.FileColumns.DISPLAY_NAME)
                    val dataCol = c.getColumnIndex(MediaStore.Files.FileColumns.DATA)
                    val mimeCol = c.getColumnIndex(MediaStore.Files.FileColumns.MIME_TYPE)
                    val sizeCol = c.getColumnIndex(MediaStore.Files.FileColumns.SIZE)

                    while (c.moveToNext()) {
                        val id = if (idCol >= 0) c.getLong(idCol) else -1L
                        val name = if (nameCol >= 0) c.getString(nameCol) ?: "" else ""
                        val path = if (dataCol >= 0) c.getString(dataCol) ?: "" else ""
                        val mime = if (mimeCol >= 0) c.getString(mimeCol) ?: "" else ""
                        val size = if (sizeCol >= 0) c.getLong(sizeCol) else 0L

                        val effectiveName = if (name.isNotBlank()) name else File(path).name
                        val ext = getExt(effectiveName)

                        if (FormatRegistry.isSupported(ext)) {
                            val contentUri = if (id >= 0) {
                                ContentUris.withAppendedId(queryUri, id).toString()
                            } else if (path.isNotBlank()) {
                                "file://$path"
                            } else continue

                            if (seenUris.add(contentUri)) {
                                val item = Arguments.createMap().apply {
                                    putString("id", contentUri)
                                    putString("uri", contentUri)
                                    putString("path", path)
                                    putString("name", effectiveName)
                                    putDouble("size", size.toDouble())
                                    putString("mimeType", mime)
                                    putString("format", ext)
                                    val parentName = if (path.isNotBlank()) {
                                        File(path).parentFile?.name ?: "Downloads"
                                    } else "Downloads"
                                    putString("folderName", parentName)
                                }
                                results.pushMap(item)
                            }
                        }
                    }
                }
                promise.resolve(results)
            } catch (e: Exception) {
                promise.reject("MEDIA_STORE_SCAN_ERROR", e.message, e)
            }
        }
    }

    fun scanDirectories(paths: ReadableArray, maxDepth: Int, promise: Promise) {
        moduleScope.launch(Dispatchers.IO) {
            try {
                val results = Arguments.createArray()
                val seenPaths = HashSet<String>()
                val depthLimit = if (maxDepth in 1..10) maxDepth else 5

                for (i in 0 until paths.size()) {
                    val rootPath = paths.getString(i) ?: continue
                    val rootDir = File(rootPath)
                    if (!rootDir.exists() || !rootDir.isDirectory) continue

                    val queue = ArrayDeque<Pair<File, Int>>()
                    queue.add(Pair(rootDir, 0))

                    while (!queue.isEmpty()) {
                        val (currentDir, currentDepth) = queue.poll() ?: break
                        val files = try {
                            currentDir.listFiles()
                        } catch (_: Exception) {
                            null
                        } ?: continue

                        for (file in files) {
                            try {
                                if (file.isDirectory) {
                                    val name = file.name
                                    if (name.startsWith(".") || name.equals("Android", ignoreCase = true)) {
                                        continue
                                    }
                                    if (currentDepth + 1 <= depthLimit) {
                                        queue.add(Pair(file, currentDepth + 1))
                                    }
                                } else if (file.isFile) {
                                    val ext = getExt(file.name)
                                    if (FormatRegistry.isSupported(ext)) {
                                        val absPath = file.absolutePath
                                        if (seenPaths.add(absPath)) {
                                            val fileUri = "file://$absPath"
                                            val item = Arguments.createMap().apply {
                                                putString("id", fileUri)
                                                putString("uri", fileUri)
                                                putString("path", absPath)
                                                putString("name", file.name)
                                                putDouble("size", file.length().toDouble())
                                                putString("format", ext)
                                                putString("folderName", file.parentFile?.name ?: rootDir.name)
                                            }
                                            results.pushMap(item)
                                        }
                                    }
                                }
                            } catch (_: Exception) {}
                        }
                    }
                }
                promise.resolve(results)
            } catch (e: Exception) {
                promise.reject("DIRECTORY_SCAN_ERROR", e.message, e)
            }
        }
    }

    fun scanSafTree(treeUriString: String, maxDepth: Int, promise: Promise) {
        moduleScope.launch(Dispatchers.IO) {
            try {
                val results = Arguments.createArray()
                val treeUri = Uri.parse(treeUriString)
                val resolver = reactContext.contentResolver

                try {
                    sourceManager.takePersistableGrant(treeUri)
                } catch (_: Exception) {}

                val rootDocId = DocumentsContract.getTreeDocumentId(treeUri)
                val depthLimit = if (maxDepth in 1..10) maxDepth else 5

                val queue = ArrayDeque<Pair<String, Int>>()
                queue.add(Pair(rootDocId, 0))

                val visitedDocIds = HashSet<String>()
                visitedDocIds.add(rootDocId)

                val projection = arrayOf(
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE,
                    DocumentsContract.Document.COLUMN_SIZE
                )

                while (!queue.isEmpty()) {
                    val (currentDocId, currentDepth) = queue.poll() ?: break
                    val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(
                        treeUri,
                        currentDocId
                    )

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

                        while (c.moveToNext()) {
                            val childDocId = if (idCol >= 0) c.getString(idCol) ?: "" else ""
                            val name = if (nameCol >= 0) c.getString(nameCol) ?: "" else ""
                            val mime = if (mimeCol >= 0) c.getString(mimeCol) ?: "" else ""
                            val size = if (sizeCol >= 0) c.getLong(sizeCol) else 0L

                            if (childDocId.isBlank()) continue

                            val isDir = mime == DocumentsContract.Document.MIME_TYPE_DIR
                            if (isDir) {
                                if (currentDepth + 1 <= depthLimit && visitedDocIds.add(childDocId)) {
                                    queue.add(Pair(childDocId, currentDepth + 1))
                                }
                            } else {
                                val ext = getExt(name)
                                if (FormatRegistry.isSupported(ext)) {
                                    val docUri = DocumentsContract.buildDocumentUriUsingTree(
                                        treeUri,
                                        childDocId
                                    ).toString()

                                    val item = Arguments.createMap().apply {
                                        putString("id", docUri)
                                        putString("uri", docUri)
                                        putString("name", name)
                                        putDouble("size", size.toDouble())
                                        putString("mimeType", mime)
                                        putString("format", ext)
                                        putString("folderName", "Storage")
                                    }
                                    results.pushMap(item)
                                }
                            }
                        }
                    }
                }
                promise.resolve(results)
            } catch (e: Exception) {
                promise.reject("SAF_SCAN_ERROR", e.message, e)
            }
        }
    }

    fun scanAllStorage(promise: Promise) {
        moduleScope.launch(Dispatchers.IO) {
            try {
                scanCancelled.set(false)
                val results = Arguments.createArray()
                val roots = storageRoots()
                val seenPaths = HashSet<String>()

                for (root in roots) {
                    if (scanCancelled.get()) break
                    if (!root.exists() || !root.isDirectory) continue

                    val queue = ArrayDeque<Pair<File, Int>>()
                    queue.add(Pair(root, 0))

                    while (queue.isNotEmpty()) {
                        if (scanCancelled.get()) break
                        val (currentDir, currentDepth) = queue.poll() ?: break
                        if (currentDepth > 8) continue

                        val files = try { currentDir.listFiles() } catch (_: Exception) { null } ?: continue
                        for (child in files) {
                            if (scanCancelled.get()) break
                            if (child.isDirectory) {
                                val n = child.name.lowercase(Locale.ROOT)
                                if (!n.startsWith(".") && n != "android") {
                                    queue.add(Pair(child, currentDepth + 1))
                                }
                            } else if (child.isFile) {
                                val ext = getExt(child.name)
                                if (FormatRegistry.isSupported(ext) && child.length() >= 1024L) {
                                    if (seenPaths.add(child.absolutePath)) {
                                        val fileUri = "file://${child.absolutePath}"
                                        val item = Arguments.createMap().apply {
                                            putString("id", fileUri)
                                            putString("uri", fileUri)
                                            putString("path", child.absolutePath)
                                            putString("name", child.name)
                                            putDouble("size", child.length().toDouble())
                                            putString("format", ext)
                                            putString("folderName", child.parentFile?.name ?: root.name)
                                        }
                                        results.pushMap(item)
                                    }
                                }
                            }
                        }
                    }
                }
                promise.resolve(results)
            } catch (e: Exception) {
                promise.reject("FULL_SCAN_ERROR", e.message, e)
            }
        }
    }

    private fun storageRoots(): List<File> {
        val roots = ArrayList<File>()
        val seen = HashSet<String>()
        fun add(path: String?) {
            if (path.isNullOrBlank()) return
            val normalized = path.trimEnd('/')
            if (seen.add(normalized)) roots.add(File(normalized))
        }
        add(Environment.getExternalStorageDirectory()?.absolutePath)
        add("/storage/emulated/0")
        try {
            reactContext.getExternalFilesDirs(null)?.forEach { dir ->
                val marker = dir.absolutePath.indexOf("/Android/")
                if (marker > 0) add(dir.absolutePath.substring(0, marker))
            }
        } catch (_: Exception) {}
        return roots
    }

    private fun getExt(name: String): String {
        val idx = name.lastIndexOf('.')
        return if (idx >= 0 && idx < name.length - 1) name.substring(idx + 1).lowercase(Locale.ROOT) else ""
    }
}
