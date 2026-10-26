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
import android.util.Base64
import android.webkit.MimeTypeMap
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.ArrayDeque
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

class LiruneStorageModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "LiruneStorage"

    private val moduleScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val sourceManager by lazy { SourceManager(reactContext) }
    private val sessionManager by lazy { BookSessionManager(reactContext) }
    private val resourceServer by lazy { ResourceServer(sessionManager).also { it.start() } }
    private val scanner by lazy { Scanner(reactContext, ::emitEventMap) }
    private val ingestor by lazy {
        val booksDir = File(reactContext.filesDir, "books")
        Ingestor(reactContext, booksDir, ::emitEventMap)
    }

    private val activeListings = ConcurrentHashMap<String, Job>()
    private val scanCancelled = AtomicBoolean(false)

    private fun emitEventMap(eventName: String, params: Map<String, Any?>) {
        try {
            val map = Arguments.createMap()
            for ((key, value) in params) {
                when (value) {
                    null -> map.putNull(key)
                    is String -> map.putString(key, value)
                    is Int -> map.putInt(key, value)
                    is Long -> map.putDouble(key, value.toDouble())
                    is Double -> map.putDouble(key, value)
                    is Float -> map.putDouble(key, value.toDouble())
                    is Boolean -> map.putBoolean(key, value)
                    is List<*> -> {
                        val arr = Arguments.createArray()
                        for (item in value) {
                            if (item is Map<*, *>) {
                                val itemMap = Arguments.createMap()
                                @Suppress("UNCHECKED_CAST")
                                for ((k, v) in item as Map<String, Any?>) {
                                    when (v) {
                                        null -> itemMap.putNull(k)
                                        is String -> itemMap.putString(k, v)
                                        is Int -> itemMap.putInt(k, v)
                                        is Long -> itemMap.putDouble(k, v.toDouble())
                                        is Double -> itemMap.putDouble(k, v)
                                        is Boolean -> itemMap.putBoolean(k, v)
                                        else -> itemMap.putString(k, v.toString())
                                    }
                                }
                                arr.pushMap(itemMap)
                            } else if (item is String) {
                                arr.pushString(item)
                            }
                        }
                        map.putArray(key, arr)
                    }
                }
            }
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, map)
        } catch (_: Exception) {}
    }

    // ==========================================
    // SAF Grants & Source Management
    // ==========================================

    @ReactMethod
    fun validatePersistedGrants(knownUris: ReadableArray, promise: Promise) {
        moduleScope.launch(Dispatchers.IO) {
            try {
                val list = ArrayList<String>()
                for (i in 0 until knownUris.size()) {
                    knownUris.getString(i)?.let { list.add(it) }
                }
                val result = sourceManager.validatePersistedGrants(list)
                val map = Arguments.createMap().apply {
                    val validArr = Arguments.createArray()
                    val revokedArr = Arguments.createArray()
                    result.validUris.forEach { validArr.pushString(it) }
                    result.revokedUris.forEach { revokedArr.pushString(it) }
                    putArray("validUris", validArr)
                    putArray("revokedUris", revokedArr)
                }
                promise.resolve(map)
            } catch (e: Exception) {
                promise.reject("VALIDATE_GRANTS_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun takePersistableGrant(treeUriString: String, promise: Promise) {
        moduleScope.launch(Dispatchers.IO) {
            try {
                val success = sourceManager.takePersistableGrant(Uri.parse(treeUriString))
                promise.resolve(success)
            } catch (e: Exception) {
                promise.reject("TAKE_GRANT_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun releasePersistableGrant(treeUriString: String, promise: Promise) {
        moduleScope.launch(Dispatchers.IO) {
            try {
                val success = sourceManager.releasePersistableGrant(Uri.parse(treeUriString))
                promise.resolve(success)
            } catch (e: Exception) {
                promise.reject("RELEASE_GRANT_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun pruneGrantsIfNeeded(lruUris: ReadableArray, promise: Promise) {
        moduleScope.launch(Dispatchers.IO) {
            try {
                val list = ArrayList<String>()
                for (i in 0 until lruUris.size()) {
                    lruUris.getString(i)?.let { list.add(it) }
                }
                sourceManager.pruneIfApproachingLimit(list)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("PRUNE_GRANTS_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun getStorageVolumes(promise: Promise) {
        moduleScope.launch(Dispatchers.IO) {
            try {
                val volumes = sourceManager.getStorageVolumes()
                val arr = Arguments.createArray()
                for (v in volumes) {
                    val map = Arguments.createMap().apply {
                        putString("id", v.id)
                        putString("label", v.label)
                        putBoolean("isRemovable", v.isRemovable)
                        putDouble("freeBytes", v.freeBytes.toDouble())
                        putDouble("totalBytes", v.totalBytes.toDouble())
                        putBoolean("isPrimary", v.isPrimary)
                        putString("path", v.path)
                    }
                    arr.pushMap(map)
                }
                promise.resolve(arr)
            } catch (e: Exception) {
                promise.reject("VOLUMES_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun buildInitialPickerIntent(volumeId: String?, hint: String?, promise: Promise) {
        try {
            val intent = sourceManager.buildInitialPickerIntent(volumeId, hint)
            promise.resolve(intent.toUri(0))
        } catch (e: Exception) {
            promise.reject("PICKER_INTENT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun observeDirectory(treeUri: String, docId: String?, promise: Promise) {
        try {
            val uri = if (docId != null) {
                DocumentsContract.buildDocumentUriUsingTree(Uri.parse(treeUri), docId).toString()
            } else {
                treeUri
            }
            sourceManager.observeDirectory(uri) {
                emitEventMap("onDirectoryChanged", mapOf("treeUri" to treeUri, "docId" to docId))
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OBSERVE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopObserving(treeUri: String, promise: Promise) {
        try {
            sourceManager.stopObserving(treeUri)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_OBSERVE_ERROR", e.message, e)
        }
    }

    // ==========================================
    // Streaming Scanner
    // ==========================================

    @ReactMethod
    fun startScan(options: ReadableMap, promise: Promise) {
        try {
            val treeUri = if (options.hasKey("treeUri")) options.getString("treeUri") else null
            val localPath = if (options.hasKey("localPath")) options.getString("localPath") else null
            val maxDepth = if (options.hasKey("maxDepth")) options.getInt("maxDepth") else 10

            scanner.startScan(treeUri, localPath, maxDepth, moduleScope)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_SCAN_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun cancelScan(promise: Promise) {
        try {
            scanner.cancelScan()
            scanCancelled.set(true)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CANCEL_SCAN_ERROR", e.message, e)
        }
    }

    // ==========================================
    // Content-Based Format Sniffer
    // ==========================================

    @ReactMethod
    fun sniffFile(uriOrPath: String, fallbackFilename: String?, promise: Promise) {
        moduleScope.launch(Dispatchers.IO) {
            try {
                val result = if (uriOrPath.startsWith("file://") || uriOrPath.startsWith("/")) {
                    val path = if (uriOrPath.startsWith("file://")) Uri.parse(uriOrPath).path ?: uriOrPath.removePrefix("file://") else uriOrPath
                    FormatRegistry.sniffFile(File(path), fallbackFilename)
                } else {
                    FormatRegistry.sniff(reactContext, Uri.parse(uriOrPath), fallbackFilename)
                }

                val map = Arguments.createMap().apply {
                    putString("format", result.format)
                    putDouble("confidence", result.confidence.toDouble())
                    putString("reason", result.reason)
                    putBoolean("isDrm", result.isDrm)
                    putString("drmReason", result.drmReason)
                    putString("quickFp", result.quickFp)
                }
                promise.resolve(map)
            } catch (e: Exception) {
                promise.reject("SNIFF_ERROR", e.message, e)
            }
        }
    }

    // ==========================================
    // Ingestor
    // ==========================================

    @ReactMethod
    fun ingestFile(options: ReadableMap, promise: Promise) {
        moduleScope.launch(Dispatchers.IO) {
            try {
                val uri = options.getString("uri") ?: throw IllegalArgumentException("Missing uri")
                val mode = if (options.hasKey("mode")) options.getString("mode") ?: "managed" else "managed"
                val name = options.getString("name") ?: "book"
                val format = if (options.hasKey("format")) options.getString("format") ?: "epub" else "epub"
                val jobId = if (options.hasKey("jobId")) options.getDouble("jobId").toLong() else 0L

                val existingShaList = HashSet<String>()
                if (options.hasKey("existingSha256List")) {
                    val arr = options.getArray("existingSha256List")
                    if (arr != null) {
                        for (i in 0 until arr.size()) {
                            arr.getString(i)?.let { existingShaList.add(it) }
                        }
                    }
                }

                val res = ingestor.ingest(uri, mode, name, format, existingShaList, jobId)
                val map = Arguments.createMap().apply {
                    putString("bookId", res.bookId)
                    putString("sha256", res.sha256)
                    putDouble("size", res.size.toDouble())
                    putString("mode", res.mode)
                    putString("pathOrUri", res.pathOrUri)
                    putString("title", res.title)
                    putString("author", res.author)
                    putString("format", res.format)
                    putBoolean("isDuplicate", res.isDuplicate)
                }
                promise.resolve(map)
            } catch (e: Exception) {
                promise.reject("INGEST_ERROR", e.message, e)
            }
        }
    }

    // ==========================================
    // BookSession & ResourceServer
    // ==========================================

    @ReactMethod
    fun openBookSession(pathOrUri: String, promise: Promise) {
        moduleScope.launch(Dispatchers.IO) {
            try {
                val session = sessionManager.openSession(pathOrUri)
                val map = Arguments.createMap().apply {
                    putString("handleId", session.handleId)
                    putDouble("size", session.size.toDouble())
                    putBoolean("seekable", session.seekable)
                }
                promise.resolve(map)
            } catch (e: Exception) {
                promise.reject("OPEN_SESSION_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun readBookSession(handleId: String, offset: Double, length: Double, promise: Promise) {
        moduleScope.launch(Dispatchers.IO) {
            try {
                val bytes = sessionManager.readBytes(handleId, offset.toLong(), length.toInt())
                val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                promise.resolve(base64)
            } catch (e: Exception) {
                promise.reject("READ_SESSION_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun closeBookSession(handleId: String, promise: Promise) {
        try {
            sessionManager.closeSession(handleId)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CLOSE_SESSION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getResourceServerUrl(handleId: String, promise: Promise) {
        try {
            val url = "http://127.0.0.1:${resourceServer.port}/book/$handleId"
            promise.resolve(url)
        } catch (e: Exception) {
            promise.reject("SERVER_URL_ERROR", e.message, e)
        }
    }

    // ==========================================
    // Custom In-App Directory Listing (Workstream C)
    // ==========================================

    @ReactMethod
    fun listDirectory(treeUri: String, docId: String?, options: ReadableMap, promise: Promise) {
        val requestId = java.util.UUID.randomUUID().toString()
        val batchSize = if (options.hasKey("batchSize")) options.getInt("batchSize") else 100
        val isAllFiles = options.hasKey("backend") && options.getString("backend") == "allFiles"

        val backend: StorageBackend = if (isAllFiles) AllFilesStorageBackend() else SafStorageBackend(reactContext)

        val job = moduleScope.launch(Dispatchers.IO) {
            try {
                val total = backend.listDirectory(treeUri, docId, batchSize) { batch ->
                    val arr = Arguments.createArray()
                    for (entry in batch) {
                        val item = Arguments.createMap().apply {
                            putString("docId", entry.docId)
                            putString("name", entry.name)
                            putBoolean("isDirectory", entry.isDirectory)
                            putDouble("size", entry.size.toDouble())
                            putDouble("mtime", entry.mtime.toDouble())
                            putString("mimeType", entry.mimeType)
                            putString("format", entry.format)
                            putString("uri", entry.uri)
                        }
                        arr.pushMap(item)
                    }
                    val payload = Arguments.createMap().apply {
                        putString("requestId", requestId)
                        putArray("entries", arr)
                    }
                    reactContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit("onDirBatch", payload)
                }

                val donePayload = Arguments.createMap().apply {
                    putString("requestId", requestId)
                    putInt("total", total)
                }
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onDirDone", donePayload)
            } catch (e: CancellationException) {
                // Cancelled
            } catch (e: Exception) {
                val errPayload = Arguments.createMap().apply {
                    putString("requestId", requestId)
                    putString("error", e.message ?: "Listing failed")
                }
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onDirError", errPayload)
            } finally {
                activeListings.remove(requestId)
            }
        }

        activeListings[requestId] = job
        val map = Arguments.createMap().apply {
            putString("requestId", requestId)
        }
        promise.resolve(map)
    }

    @ReactMethod
    fun cancelListing(requestId: String, promise: Promise) {
        activeListings.remove(requestId)?.cancel()
        promise.resolve(true)
    }

    @ReactMethod
    fun getDocumentInfo(treeUri: String, docId: String?, promise: Promise) {
        moduleScope.launch(Dispatchers.IO) {
            try {
                val backend = SafStorageBackend(reactContext)
                val entry = backend.stat(treeUri, docId)
                if (entry != null) {
                    val map = Arguments.createMap().apply {
                        putString("docId", entry.docId)
                        putString("name", entry.name)
                        putBoolean("isDirectory", entry.isDirectory)
                        putDouble("size", entry.size.toDouble())
                        putDouble("mtime", entry.mtime.toDouble())
                        putString("mimeType", entry.mimeType)
                        putString("format", entry.format)
                        putString("uri", entry.uri)
                    }
                    promise.resolve(map)
                } else {
                    promise.resolve(null)
                }
            } catch (e: Exception) {
                promise.reject("DOC_INFO_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun getParentChain(treeUri: String, docId: String?, promise: Promise) {
        moduleScope.launch(Dispatchers.IO) {
            try {
                val backend = SafStorageBackend(reactContext)
                val chain = backend.getParentChain(treeUri, docId)
                val arr = Arguments.createArray()
                for (p in chain) {
                    val map = Arguments.createMap().apply {
                        putString("docId", p.first)
                        putString("name", p.second)
                    }
                    arr.pushMap(map)
                }
                promise.resolve(arr)
            } catch (e: Exception) {
                promise.reject("PARENT_CHAIN_ERROR", e.message, e)
            }
        }
    }

    // ==========================================
    // Backward Compatibility Bridge Methods
    // ==========================================

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

    @ReactMethod
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

    @ReactMethod
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

    @ReactMethod
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

    @ReactMethod
    fun scanAllStorage(options: ReadableMap, promise: Promise) {
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

    @ReactMethod
    fun copyContentUriToStorage(sourceUriString: String, destPath: String, promise: Promise) {
        moduleScope.launch(Dispatchers.IO) {
            try {
                val sourceUri = Uri.parse(sourceUriString)
                val destFile = File(destPath)
                destFile.parentFile?.mkdirs()

                val inputStream = if (sourceUriString.startsWith("file://") || sourceUriString.startsWith("/")) {
                    val rawPath = if (sourceUriString.startsWith("file://")) sourceUri.path ?: sourceUriString.removePrefix("file://") else sourceUriString
                    File(rawPath).inputStream()
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
                    return@launch
                }
                promise.resolve(copiedBytes.toDouble())
            } catch (e: Exception) {
                promise.reject("COPY_STREAM_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun readZipEntryText(path: String, entryPath: String, maxBytes: Double, promise: Promise) {
        moduleScope.launch(Dispatchers.IO) {
            try {
                val file = File(path)
                if (!file.isFile) {
                    promise.resolve(null)
                    return@launch
                }
                val limit = if (maxBytes > 0 && maxBytes < Int.MAX_VALUE) maxBytes.toInt() else 1024 * 1024
                java.util.zip.ZipFile(file).use { zip ->
                    val entry = zip.getEntry(entryPath)
                        ?: zip.getEntry(entryPath.removePrefix("/"))
                        ?: return@use promise.resolve(null)
                    if (entry.size > Int.MAX_VALUE) {
                        promise.resolve(null)
                        return@use
                    }
                    zip.getInputStream(entry).use { stream ->
                        val buffer = ByteArray(minOf(limit.coerceAtLeast(1), 1024 * 1024))
                        var read = 0
                        while (read < buffer.size) {
                            val count = stream.read(buffer, read, buffer.size - read)
                            if (count <= 0) break
                            read += count
                        }
                        promise.resolve(String(buffer, 0, read, Charsets.UTF_8))
                    }
                }
            } catch (_: Exception) {
                promise.resolve(null)
            }
        }
    }

    @ReactMethod
    fun clearCurrentIntent(promise: Promise) {
        try {
            val activity = reactContext.currentActivity
            if (activity != null) {
                val freshIntent = Intent(Intent.ACTION_MAIN).apply {
                    addCategory(Intent.CATEGORY_LAUNCHER)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED
                }
                activity.setIntent(freshIntent)
            }
            promise.resolve(true)
        } catch (_: Exception) {
            promise.resolve(false)
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
