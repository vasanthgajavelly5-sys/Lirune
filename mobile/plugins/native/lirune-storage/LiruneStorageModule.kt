package com.lirune.reader.storage

import android.Manifest
import android.content.ContentUris
import android.content.Intent
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.ArrayDeque
import java.util.Locale

class LiruneStorageModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "LiruneStorage"

    companion object {
        private val SUPPORTED_EXTENSIONS = setOf(
            "epub", "pdf", "mobi", "azw", "azw3", "cbz", "cbr",
            "fb2", "txt", "html", "htm", "djvu", "docx", "doc", "odt", "rtf", "chm"
        )

        private fun getFormatFromExtension(ext: String): String {
            return when (ext.lowercase(Locale.ROOT)) {
                "htm" -> "html"
                "azw", "azw3" -> "mobi"
                else -> ext.lowercase(Locale.ROOT)
            }
        }

        private fun getExtensionFromName(name: String): String {
            val idx = name.lastIndexOf('.')
            return if (idx >= 0 && idx < name.length - 1) {
                name.substring(idx + 1).lowercase(Locale.ROOT)
            } else ""
        }
    }

    /**
     * Checks if the app has All Files Access (MANAGE_EXTERNAL_STORAGE) on Android 11+
     * or standard storage permissions on older Android.
     */
    @ReactMethod
    fun hasAllFilesAccess(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                promise.resolve(Environment.isExternalStorageManager())
            } else {
                val granted = ContextCompat.checkSelfPermission(
                    reactContext,
                    Manifest.permission.READ_EXTERNAL_STORAGE
                ) == PackageManager.PERMISSION_GRANTED
                promise.resolve(granted)
            }
        } catch (e: Exception) {
            promise.reject("CHECK_PERMISSION_ERROR", e.message, e)
        }
    }

    /**
     * Launches the system settings screen for MANAGE_APP_ALL_FILES_ACCESS_PERMISSION.
     */
    @ReactMethod
    fun requestAllFilesAccess(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                if (Environment.isExternalStorageManager()) {
                    promise.resolve(true)
                    return
                }
                try {
                    val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                        data = Uri.parse("package:" + reactContext.packageName)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    reactContext.startActivity(intent)
                    promise.resolve(false)
                } catch (e: Exception) {
                    val fallbackIntent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    reactContext.startActivity(fallbackIntent)
                    promise.resolve(false)
                }
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("REQUEST_PERMISSION_ERROR", e.message, e)
        }
    }

    /**
     * Checks if the app has basic storage permissions (READ_EXTERNAL_STORAGE or media permissions).
     */
    @ReactMethod
    fun hasStoragePermission(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager()) {
                promise.resolve(true)
                return
            }
            val readGranted = ContextCompat.checkSelfPermission(
                reactContext,
                Manifest.permission.READ_EXTERNAL_STORAGE
            ) == PackageManager.PERMISSION_GRANTED
            promise.resolve(readGranted)
        } catch (e: Exception) {
            promise.reject("STORAGE_PERMISSION_ERROR", e.message, e)
        }
    }

    /**
     * Scans Android MediaStore for supported book and document files.
     * Works on modern Android without MANAGE_EXTERNAL_STORAGE.
     */
    @ReactMethod
    fun scanMediaStore(promise: Promise) {
        Thread {
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

                // Query external files table
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
                        val ext = getExtensionFromName(effectiveName)

                        if (SUPPORTED_EXTENSIONS.contains(ext)) {
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
                                    putString("format", getFormatFromExtension(ext))
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

                // Also query MediaStore.Downloads directly on API 29+ if available
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    try {
                        val downloadUri = MediaStore.Downloads.EXTERNAL_CONTENT_URI
                        val dlCursor = resolver.query(
                            downloadUri,
                            projection,
                            null,
                            null,
                            "${MediaStore.Downloads.DATE_MODIFIED} DESC"
                        )
                        dlCursor?.use { c ->
                            val idCol = c.getColumnIndex(MediaStore.Downloads._ID)
                            val nameCol = c.getColumnIndex(MediaStore.Downloads.DISPLAY_NAME)
                            val dataCol = c.getColumnIndex(MediaStore.Downloads.DATA)
                            val mimeCol = c.getColumnIndex(MediaStore.Downloads.MIME_TYPE)
                            val sizeCol = c.getColumnIndex(MediaStore.Downloads.SIZE)

                            while (c.moveToNext()) {
                                val id = if (idCol >= 0) c.getLong(idCol) else -1L
                                val name = if (nameCol >= 0) c.getString(nameCol) ?: "" else ""
                                val path = if (dataCol >= 0) c.getString(dataCol) ?: "" else ""
                                val mime = if (mimeCol >= 0) c.getString(mimeCol) ?: "" else ""
                                val size = if (sizeCol >= 0) c.getLong(sizeCol) else 0L

                                val effectiveName = if (name.isNotBlank()) name else File(path).name
                                val ext = getExtensionFromName(effectiveName)

                                if (SUPPORTED_EXTENSIONS.contains(ext)) {
                                    val contentUri = if (id >= 0) {
                                        ContentUris.withAppendedId(downloadUri, id).toString()
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
                                            putString("format", getFormatFromExtension(ext))
                                            putString("folderName", "Downloads")
                                        }
                                        results.pushMap(item)
                                    }
                                }
                            }
                        }
                    } catch (e: Exception) {
                        // MediaStore.Downloads might not be available on all devices
                    }
                }

                promise.resolve(results)
            } catch (e: Exception) {
                promise.reject("MEDIA_STORE_SCAN_ERROR", e.message, e)
            }
        }.start()
    }

    /**
     * Fast native directory tree scanner for accessible filesystem paths.
     * Recursively traverses folders using java.io.File up to maxDepth.
     */
    @ReactMethod
    fun scanDirectories(paths: ReadableArray, maxDepth: Int, promise: Promise) {
        Thread {
            try {
                val results = Arguments.createArray()
                val seenPaths = HashSet<String>()
                val depthLimit = if (maxDepth in 1..10) maxDepth else 5

                for (i in 0 until paths.size()) {
                    val rootPath = paths.getString(i) ?: continue
                    val rootDir = File(rootPath)
                    if (!rootDir.exists() || !rootDir.isDirectory) continue

                    // BFS queue: Pair of Directory and current depth
                    val queue = ArrayDeque<Pair<File, Int>>()
                    queue.add(Pair(rootDir, 0))

                    while (!queue.isEmpty()) {
                        val (currentDir, currentDepth) = queue.poll() ?: break
                        val files = try {
                            currentDir.listFiles()
                        } catch (e: Exception) {
                            null
                        } ?: continue

                        for (file in files) {
                            try {
                                if (file.isDirectory) {
                                    val name = file.name
                                    // Skip hidden and restricted system folders
                                    if (name.startsWith(".") || name.equals("Android", ignoreCase = true)) {
                                        continue
                                    }
                                    if (currentDepth + 1 <= depthLimit) {
                                        queue.add(Pair(file, currentDepth + 1))
                                    }
                                } else if (file.isFile) {
                                    val ext = getExtensionFromName(file.name)
                                    if (SUPPORTED_EXTENSIONS.contains(ext)) {
                                        val absPath = file.absolutePath
                                        if (seenPaths.add(absPath)) {
                                            val fileUri = "file://$absPath"
                                            val item = Arguments.createMap().apply {
                                                putString("id", fileUri)
                                                putString("uri", fileUri)
                                                putString("path", absPath)
                                                putString("name", file.name)
                                                putDouble("size", file.length().toDouble())
                                                putString("format", getFormatFromExtension(ext))
                                                putString("folderName", file.parentFile?.name ?: rootDir.name)
                                            }
                                            results.pushMap(item)
                                        }
                                    }
                                }
                            } catch (_: Exception) {
                                // Ignore individual file inspection failure
                            }
                        }
                    }
                }

                promise.resolve(results)
            } catch (e: Exception) {
                promise.reject("DIRECTORY_SCAN_ERROR", e.message, e)
            }
        }.start()
    }

    /**
     * Traverses a Storage Access Framework (SAF) tree URI recursively using DocumentsContract.
     */
    @ReactMethod
    fun scanSafTree(treeUriString: String, maxDepth: Int, promise: Promise) {
        Thread {
            try {
                val results = Arguments.createArray()
                val treeUri = Uri.parse(treeUriString)
                val resolver = reactContext.contentResolver

                // Persist read permission if not already done
                try {
                    resolver.takePersistableUriPermission(
                        treeUri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                    )
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
                    } catch (e: Exception) {
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
                                val ext = getExtensionFromName(name)
                                if (SUPPORTED_EXTENSIONS.contains(ext)) {
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
                                        putString("format", getFormatFromExtension(ext))
                                        val folder = decodeFolderName(treeUriString)
                                        putString("folderName", folder)
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
        }.start()
    }

    private fun decodeFolderName(uriString: String): String {
        return try {
            val decoded = Uri.decode(uriString)
            decoded.substringAfterLast(':').substringAfterLast('/')
        } catch (_: Exception) {
            "Storage"
        }
    }

    /**
     * Efficient native streaming copy from content:// or file:// URI to app destination.
     * Completely avoids Base64 memory overhead.
     */
    @ReactMethod
    fun copyContentUriToStorage(sourceUriString: String, destPath: String, promise: Promise) {
        Thread {
            try {
                val sourceUri = Uri.parse(sourceUriString)
                val destFile = File(destPath)
                destFile.parentFile?.mkdirs()

                val inputStream = if (sourceUriString.startsWith("file://")) {
                    File(sourceUri.path ?: sourceUriString.removePrefix("file://")).inputStream()
                } else {
                    reactContext.contentResolver.openInputStream(sourceUri)
                        ?: throw IOException("Cannot open input stream for $sourceUriString")
                }

                val outputStream = FileOutputStream(destFile)
                var copiedBytes: Long = 0

                inputStream.use { input ->
                    outputStream.use { output ->
                        val buffer = ByteArray(65536)
                        var bytesRead: Int
                        while (input.read(buffer).also { bytesRead = it } != -1) {
                            output.write(buffer, 0, bytesRead)
                            copiedBytes += bytesRead
                        }
                        output.flush()
                    }
                }

                if (!destFile.exists() || destFile.length() == 0L) {
                    destFile.delete()
                    promise.reject("COPY_ERROR", "Copied file is empty or missing")
                    return@Thread
                }

                promise.resolve(copiedBytes.toDouble())
            } catch (e: Exception) {
                promise.reject("COPY_STREAM_ERROR", e.message, e)
            }
        }.start()
    }
}
