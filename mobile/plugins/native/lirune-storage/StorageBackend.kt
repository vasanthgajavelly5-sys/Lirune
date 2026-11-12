package com.lirune.reader.storage

import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.provider.DocumentsContract
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

data class DirEntry(
    val docId: String,
    val name: String,
    val isDirectory: Boolean,
    val size: Long,
    val mtime: Long,
    val mimeType: String?,
    val format: String?,
    val uri: String
)

interface StorageBackend {
    suspend fun listDirectory(
        treeUriOrPath: String,
        docId: String?,
        batchSize: Int = 100,
        onBatch: (List<DirEntry>) -> Unit
    ): Int

    suspend fun stat(treeUriOrPath: String, docId: String?): DirEntry?
    suspend fun getParentChain(treeUriOrPath: String, docId: String?): List<Pair<String, String>>
}

class SafStorageBackend(private val context: Context) : StorageBackend {

    override suspend fun listDirectory(
        treeUriOrPath: String,
        docId: String?,
        batchSize: Int,
        onBatch: (List<DirEntry>) -> Unit
    ): Int = withContext(Dispatchers.IO) {
        val treeUri = Uri.parse(treeUriOrPath)
        val resolver = context.contentResolver
        val targetDocId = docId ?: DocumentsContract.getTreeDocumentId(treeUri)

        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, targetDocId)
        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED
        )

        var total = 0
        val batch = ArrayList<DirEntry>(batchSize)

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

            while (c.moveToNext()) {
                val childDocId = if (idCol >= 0) c.getString(idCol) ?: "" else ""
                val name = if (nameCol >= 0) c.getString(nameCol) ?: "" else ""
                val mime = if (mimeCol >= 0) c.getString(mimeCol) ?: "" else ""
                val size = if (sizeCol >= 0) c.getLong(sizeCol) else 0L
                val mtime = if (mtimeCol >= 0) c.getLong(mtimeCol) else 0L

                if (childDocId.isBlank()) continue

                val isDir = mime == DocumentsContract.Document.MIME_TYPE_DIR
                val docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, childDocId).toString()

                val ext = getExt(name)
                val format = if (isDir) null else if (FormatRegistry.isSupported(ext)) ext else null

                batch.add(
                    DirEntry(
                        docId = childDocId,
                        name = name,
                        isDirectory = isDir,
                        size = size,
                        mtime = mtime,
                        mimeType = mime,
                        format = format,
                        uri = docUri
                    )
                )
                total++

                if (batch.size >= batchSize) {
                    onBatch(ArrayList(batch))
                    batch.clear()
                }
            }
        }

        if (batch.isNotEmpty()) {
            onBatch(batch)
        }
        total
    }

    override suspend fun stat(treeUriOrPath: String, docId: String?): DirEntry? = withContext(Dispatchers.IO) {
        val treeUri = Uri.parse(treeUriOrPath)
        val targetDocId = docId ?: DocumentsContract.getTreeDocumentId(treeUri)
        val docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, targetDocId)

        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED
        )

        context.contentResolver.query(docUri, projection, null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                val name = c.getString(1) ?: ""
                val mime = c.getString(2) ?: ""
                val size = c.getLong(3)
                val mtime = c.getLong(4)
                val isDir = mime == DocumentsContract.Document.MIME_TYPE_DIR
                val ext = getExt(name)
                return@withContext DirEntry(
                    docId = targetDocId,
                    name = name,
                    isDirectory = isDir,
                    size = size,
                    mtime = mtime,
                    mimeType = mime,
                    format = if (isDir) null else if (FormatRegistry.isSupported(ext)) ext else null,
                    uri = docUri.toString()
                )
            }
        }
        null
    }

    override suspend fun getParentChain(treeUriOrPath: String, docId: String?): List<Pair<String, String>> = withContext(Dispatchers.IO) {
        val chain = ArrayList<Pair<String, String>>()
        val treeUri = Uri.parse(treeUriOrPath)
        val rootDocId = DocumentsContract.getTreeDocumentId(treeUri)
        val current = docId ?: rootDocId

        chain.add(Pair(rootDocId, decodeFolderName(rootDocId)))
        if (current != rootDocId) {
            // For nested documents, decode subsegments if formatted as root:path/to/child
            if (current.contains('/')) {
                val parts = current.split('/')
                var accumulated = ""
                for (p in parts) {
                    accumulated = if (accumulated.isEmpty()) p else "$accumulated/$p"
                    chain.add(Pair(accumulated, p))
                }
            } else {
                chain.add(Pair(current, decodeFolderName(current)))
            }
        }
        chain
    }

    private fun decodeFolderName(docId: String): String {
        return docId.substringAfterLast(':').substringAfterLast('/').ifBlank { "Storage" }
    }

    private fun getExt(name: String): String {
        val idx = name.lastIndexOf('.')
        return if (idx >= 0 && idx < name.length - 1) name.substring(idx + 1).lowercase() else ""
    }
}

class AllFilesStorageBackend : StorageBackend {

    override suspend fun listDirectory(
        treeUriOrPath: String,
        docId: String?,
        batchSize: Int,
        onBatch: (List<DirEntry>) -> Unit
    ): Int = withContext(Dispatchers.IO) {
        val path = docId ?: treeUriOrPath.removePrefix("file://")
        val dir = File(path)
        if (!dir.exists() || !dir.isDirectory) return@withContext 0

        val files = dir.listFiles() ?: return@withContext 0
        var total = 0
        val batch = ArrayList<DirEntry>(batchSize)

        for (file in files) {
            val isDir = file.isDirectory
            val name = file.name
            val ext = getExt(name)
            val format = if (isDir) null else if (FormatRegistry.isSupported(ext)) ext else null

            batch.add(
                DirEntry(
                    docId = file.absolutePath,
                    name = name,
                    isDirectory = isDir,
                    size = if (isDir) 0L else file.length(),
                    mtime = file.lastModified(),
                    mimeType = null,
                    format = format,
                    uri = "file://${file.absolutePath}"
                )
            )
            total++

            if (batch.size >= batchSize) {
                onBatch(ArrayList(batch))
                batch.clear()
            }
        }

        if (batch.isNotEmpty()) {
            onBatch(batch)
        }
        total
    }

    override suspend fun stat(treeUriOrPath: String, docId: String?): DirEntry? = withContext(Dispatchers.IO) {
        val path = docId ?: treeUriOrPath.removePrefix("file://")
        val file = File(path)
        if (!file.exists()) return@withContext null
        val isDir = file.isDirectory
        val name = file.name
        val ext = getExt(name)
        DirEntry(
            docId = file.absolutePath,
            name = name,
            isDirectory = isDir,
            size = if (isDir) 0L else file.length(),
            mtime = file.lastModified(),
            mimeType = null,
            format = if (isDir) null else if (FormatRegistry.isSupported(ext)) ext else null,
            uri = "file://${file.absolutePath}"
        )
    }

    override suspend fun getParentChain(treeUriOrPath: String, docId: String?): List<Pair<String, String>> = withContext(Dispatchers.IO) {
        val path = docId ?: treeUriOrPath.removePrefix("file://")
        val chain = ArrayList<Pair<String, String>>()
        var cur: File? = File(path)
        while (cur != null && cur.absolutePath != "/") {
            chain.add(0, Pair(cur.absolutePath, cur.name.ifBlank { cur.absolutePath }))
            cur = cur.parentFile
        }
        chain
    }

    private fun getExt(name: String): String {
        val idx = name.lastIndexOf('.')
        return if (idx >= 0 && idx < name.length - 1) name.substring(idx + 1).lowercase() else ""
    }
}
