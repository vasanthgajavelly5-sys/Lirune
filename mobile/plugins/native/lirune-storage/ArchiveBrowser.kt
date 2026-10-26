package com.lirune.reader.storage

import android.content.Context
import android.net.Uri
import android.os.ParcelFileDescriptor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.*
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel
import java.nio.charset.Charset
import java.security.MessageDigest
import java.util.*
import java.util.concurrent.ConcurrentHashMap
import java.util.zip.Inflater
import java.util.zip.InflaterInputStream

/**
 * Lirune Reader Mobile — Archive Browser Engine
 * Provides random-access browsing, paginated directory listing, format sniffing,
 * and secure streaming ingestion for ZIP archives and nested containers.
 *
 * Designed around the ArchiveReader interface to allow future RAR/7z extensions.
 */

data class ArchiveEntryItem(
    val path: String,
    val name: String,
    val isDirectory: Boolean,
    val size: Long,
    val compressedSize: Long,
    val mtime: Long,
    val sniffFormat: String?,
    val kind: String, // "book" | "container" | "blocked"
    val encrypted: Boolean,
    val isNestedArchive: Boolean = false,
    val depth: Int = 1
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "path" to path,
        "name" to name,
        "isDirectory" to isDirectory,
        "size" to size.toDouble(),
        "compressedSize" to compressedSize.toDouble(),
        "mtime" to mtime.toDouble(),
        "sniffFormat" to sniffFormat,
        "kind" to kind,
        "encrypted" to encrypted,
        "isNestedArchive" to isNestedArchive
    )
}

data class ArchiveInfo(
    val handleId: String,
    val entryCount: Int,
    val needsPassword: Boolean,
    val encoding: String
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "handleId" to handleId,
        "entryCount" to entryCount,
        "needsPassword" to needsPassword,
        "encoding" to encoding
    )
}

interface ArchiveReader : AutoCloseable {
    fun open(password: String? = null, encoding: String? = null): ArchiveInfo
    fun list(virtualPath: String, offset: Int, limit: Int): List<ArchiveEntryItem>
    fun openEntry(entryPath: String): InputStream
    fun sniffEntry(entryPath: String): SniffResult
    fun getEncoding(): String
    fun getEntryCount(): Int
    fun needsPassword(): Boolean
}

class ArchiveBrowser(
    private val context: Context,
    private val ingestor: Ingestor
) {
    private val sessions = ConcurrentHashMap<String, ArchiveSession>()
    private val lruHandles = LinkedList<String>()
    private val lock = Any()

    companion object {
        const val MAX_OPEN_HANDLES = 4
        const val IDLE_TIMEOUT_MS = 5 * 60 * 1000L // 5 minutes
        const val MAX_DECLARED_SIZE = 2L * 1024 * 1024 * 1024 // 2 GB
        const val MAX_ENTRIES_COUNT = 100_000
        const val MAX_NESTED_ZIP_SIZE = 512L * 1024 * 1024 // 512 MB
    }

    private data class ArchiveSession(
        val handleId: String,
        val reader: ArchiveReader,
        var lastAccessedAt: Long,
        val tempFiles: MutableList<File> = mutableListOf(),
        val depth: Int = 1
    )

    suspend fun openArchive(
        uriString: String,
        password: String? = null,
        encoding: String? = null,
        parentHandleId: String? = null
    ): ArchiveInfo = withContext(Dispatchers.IO) {
        cleanIdleHandles()

        synchronized(lock) {
            while (lruHandles.size >= MAX_OPEN_HANDLES) {
                val oldestHandle = lruHandles.removeFirst()
                closeHandleInternal(oldestHandle)
            }
        }

        val handleId = UUID.randomUUID().toString()
        val tempFilesToClean = mutableListOf<File>()
        var reader: ArchiveReader? = null

        try {
            val uri = Uri.parse(uriString)
            val scheme = uri.scheme?.lowercase(Locale.ROOT)

            if (scheme == "file" || scheme == null) {
                val file = if (scheme == "file") File(uri.path ?: uriString) else File(uriString)
                if (!file.exists()) throw FileNotFoundException("Archive file does not exist: $uriString")
                reader = ZipArchiveReader(RandomAccessFile(file, "r"), file.length(), encoding, password)
            } else {
                // Content URI: check if seekable via ParcelFileDescriptor
                val pfd = try {
                    context.contentResolver.openFileDescriptor(uri, "r")
                } catch (e: Exception) {
                    null
                }

                if (pfd != null && isSeekablePfd(pfd)) {
                    val channel = FileInputStream(pfd.fileDescriptor).channel
                    val size = channel.size()
                    reader = ZipArchiveReader(pfd, channel, size, encoding, password)
                } else {
                    pfd?.close()
                    // Non-seekable provider: copy to temporary cache file once
                    val cacheDir = File(context.cacheDir, "archive_cache")
                    if (!cacheDir.exists()) cacheDir.mkdirs()
                    val tempFile = File(cacheDir, "arch_$handleId.tmp")
                    tempFilesToClean.add(tempFile)

                    context.contentResolver.openInputStream(uri)?.use { input ->
                        FileOutputStream(tempFile).use { output ->
                            val buf = ByteArray(65536)
                            var read: Int
                            var total = 0L
                            while (input.read(buf).also { read = it } != -1) {
                                total += read
                                if (total > MAX_NESTED_ZIP_SIZE) {
                                    throw IllegalStateException("Archive size exceeds maximum allowed cache limit of 512 MB")
                                }
                                output.write(buf, 0, read)
                            }
                            output.flush()
                        }
                    } ?: throw FileNotFoundException("Cannot read URI: $uriString")

                    reader = ZipArchiveReader(RandomAccessFile(tempFile, "r"), tempFile.length(), encoding, password)
                }
            }

            val info = reader.open(password, encoding)
            val session = ArchiveSession(
                handleId = handleId,
                reader = reader,
                lastAccessedAt = System.currentTimeMillis(),
                tempFiles = tempFilesToClean,
                depth = 1
            )

            synchronized(lock) {
                sessions[handleId] = session
                lruHandles.add(handleId)
            }

            info.copy(handleId = handleId)
        } catch (e: Exception) {
            reader?.close()
            for (f in tempFilesToClean) {
                try { f.delete() } catch (_: Exception) {}
            }
            throw e
        }
    }

    suspend fun listArchive(
        handleId: String,
        path: String,
        offset: Int,
        limit: Int
    ): List<ArchiveEntryItem> = withContext(Dispatchers.IO) {
        val session = getSession(handleId)
        session.reader.list(path, offset, limit)
    }

    suspend fun sniffArchiveEntry(
        handleId: String,
        entryPath: String
    ): SniffResult = withContext(Dispatchers.IO) {
        val session = getSession(handleId)
        session.reader.sniffEntry(entryPath)
    }

    suspend fun extractEntryToImport(
        handleId: String,
        entryPath: String,
        jobId: Long,
        existingSha256List: Set<String> = emptySet()
    ): IngestResult = withContext(Dispatchers.IO) {
        val session = getSession(handleId)
        val entryStream = session.reader.openEntry(entryPath)
        val cleanName = File(entryPath).name
        val sniff = session.reader.sniffEntry(entryPath)
        val format = if (sniff.kind == "book") sniff.format else getExt(cleanName)

        if (sniff.kind != "book") {
            try { entryStream.close() } catch (_: Exception) {}
            throw UnsupportedOperationException("Unsupported: Cannot import ${sniff.kind} item as a book (${sniff.reason})")
        }

        ingestor.ingestStream(
            inputStream = entryStream,
            entryName = cleanName,
            format = format,
            existingSha256List = existingSha256List,
            jobId = jobId
        )
    }

    fun closeArchive(handleId: String): Boolean {
        synchronized(lock) {
            lruHandles.remove(handleId)
            return closeHandleInternal(handleId)
        }
    }

    private fun getSession(handleId: String): ArchiveSession {
        cleanIdleHandles()
        val session = sessions[handleId]
            ?: throw IllegalStateException("Archive handle not found or already closed: $handleId")
        session.lastAccessedAt = System.currentTimeMillis()
        synchronized(lock) {
            lruHandles.remove(handleId)
            lruHandles.addLast(handleId)
        }
        return session
    }

    private fun closeHandleInternal(handleId: String): Boolean {
        val session = sessions.remove(handleId) ?: return false
        try {
            session.reader.close()
        } catch (_: Exception) {}
        for (f in session.tempFiles) {
            try { f.delete() } catch (_: Exception) {}
        }
        return true
    }

    private fun cleanIdleHandles() {
        val now = System.currentTimeMillis()
        synchronized(lock) {
            val it = lruHandles.iterator()
            while (it.hasNext()) {
                val handleId = it.next()
                val session = sessions[handleId]
                if (session == null || now - session.lastAccessedAt > IDLE_TIMEOUT_MS) {
                    it.remove()
                    closeHandleInternal(handleId)
                }
            }
        }
    }

    private fun isSeekablePfd(pfd: ParcelFileDescriptor): Boolean {
        return try {
            val channel = FileInputStream(pfd.fileDescriptor).channel
            channel.size() >= 0
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun getExt(name: String): String {
        val idx = name.lastIndexOf('.')
        return if (idx >= 0 && idx < name.length - 1) name.substring(idx + 1).lowercase(Locale.ROOT) else ""
    }
}

/**
 * Concrete ArchiveReader for ZIP containers (including ZIP64, self-extractors, and data descriptors).
 */
class ZipArchiveReader : ArchiveReader {
    private var raf: RandomAccessFile? = null
    private var pfd: ParcelFileDescriptor? = null
    private var channel: FileChannel
    private val fileSize: Long
    private var encodingOverride: String?
    private var password: String?

    private var activeCharset: Charset = Charsets.UTF_8
    private var needsPass: Boolean = false
    private var totalEntriesCount = 0

    // Virtual directory index
    private val entriesByPath = LinkedHashMap<String, ZipRawEntry>()
    private var rootNode: VirtualDirectoryNode = VirtualDirectoryNode("", "")

    constructor(raf: RandomAccessFile, fileSize: Long, encoding: String?, password: String?) {
        this.raf = raf
        this.channel = raf.channel
        this.fileSize = fileSize
        this.encodingOverride = encoding
        this.password = password
    }

    constructor(pfd: ParcelFileDescriptor, channel: FileChannel, fileSize: Long, encoding: String?, password: String?) {
        this.pfd = pfd
        this.channel = channel
        this.fileSize = fileSize
        this.encodingOverride = encoding
        this.password = password
    }

    private data class ZipRawEntry(
        val fullPath: String,
        val cleanName: String,
        val isDir: Boolean,
        val flags: Int,
        val method: Int,
        val mtime: Long,
        val crc32: Long,
        val compSize: Long,
        val uncompSize: Long,
        val localOffset: Long
    )

    private class VirtualDirectoryNode(val name: String, val fullPath: String) {
        val subdirs = LinkedHashMap<String, VirtualDirectoryNode>()
        val files = ArrayList<ArchiveEntryItem>()
    }

    override fun open(password: String?, encoding: String?): ArchiveInfo {
        if (password != null) this.password = password
        if (encoding != null) this.encodingOverride = encoding

        if (fileSize < 22) {
            throw IOException("Corrupt: file too small to be a ZIP archive ($fileSize bytes)")
        }

        readCentralDirectoryIndex()

        return ArchiveInfo(
            handleId = "",
            entryCount = totalEntriesCount,
            needsPassword = needsPass,
            encoding = activeCharset.name()
        )
    }

    override fun list(virtualPath: String, offset: Int, limit: Int): List<ArchiveEntryItem> {
        val norm = normalizeVirtualPath(virtualPath)
        val targetNode = findNode(rootNode, norm) ?: return emptyList()

        val results = ArrayList<ArchiveEntryItem>()

        // 1. Subdirectories
        for ((_, subNode) in targetNode.subdirs) {
            results.add(
                ArchiveEntryItem(
                    path = subNode.fullPath,
                    name = subNode.name,
                    isDirectory = true,
                    size = 0L,
                    compressedSize = 0L,
                    mtime = 0L,
                    sniffFormat = null,
                    kind = "container",
                    encrypted = false
                )
            )
        }

        // 2. Files in directory
        results.addAll(targetNode.files)

        // Pagination
        val start = minOf(maxOf(0, offset), results.size)
        val end = minOf(start + maxOf(1, limit), results.size)
        return results.subList(start, end)
    }

    override fun openEntry(entryPath: String): InputStream {
        val norm = normalizeVirtualPath(entryPath)
        val entry = entriesByPath[norm]
            ?: throw FileNotFoundException("Entry not found in archive: $entryPath")

        if (entry.isDir) {
            throw IllegalArgumentException("Cannot open stream for directory entry: $entryPath")
        }

        // Security check: zip-slip
        validateSafeEntryPath(entry.fullPath)

        // Security check: zip-bomb
        if (entry.uncompSize > ArchiveBrowser.MAX_DECLARED_SIZE) {
            throw SecurityException("Corrupt: suspicious entry size exceeds 2 GB limit (${entry.uncompSize} bytes)")
        }
        if (entry.uncompSize > 100 * 1024 * 1024 && entry.compSize > 0) {
            val ratio = entry.uncompSize.toDouble() / entry.compSize.toDouble()
            if (ratio > 200.0) {
                throw SecurityException("Corrupt: suspicious compression ratio (${ratio.toInt()}:1)")
            }
        }

        if ((entry.flags and 1) != 0 && password.isNullOrEmpty()) {
            throw SecurityException("Archive entry is password-protected and needs password")
        }

        // Seek to local header
        channel.position(entry.localOffset)
        val localHeaderBuf = ByteBuffer.allocate(30).order(ByteOrder.LITTLE_ENDIAN)
        channel.read(localHeaderBuf)
        localHeaderBuf.flip()

        if (localHeaderBuf.remaining() < 30) {
            throw IOException("Truncated local file header at offset ${entry.localOffset}")
        }

        val sig = localHeaderBuf.getInt()
        if (sig != 0x04034b50) {
            throw IOException("Invalid local file header signature 0x${Integer.toHexString(sig)} at offset ${entry.localOffset}")
        }

        localHeaderBuf.getShort() // version
        val localFlags = localHeaderBuf.getShort().toInt() and 0xFFFF
        val method = localHeaderBuf.getShort().toInt() and 0xFFFF
        localHeaderBuf.getShort() // mtime
        localHeaderBuf.getShort() // mdate
        localHeaderBuf.getInt() // crc32
        val localCompSize = localHeaderBuf.getInt().toLong() and 0xFFFFFFFFL
        val localUncompSize = localHeaderBuf.getInt().toLong() and 0xFFFFFFFFL
        val localNameLen = localHeaderBuf.getShort().toInt() and 0xFFFF
        val localExtraLen = localHeaderBuf.getShort().toInt() and 0xFFFF

        // Data start offset = localOffset + 30 + localNameLen + localExtraLen
        val dataOffset = entry.localOffset + 30 + localNameLen + localExtraLen
        val compDataLen = if (entry.compSize > 0) entry.compSize else localCompSize

        val rawSliceStream = ChannelBoundedInputStream(channel, dataOffset, compDataLen)

        // Check encryption
        val isEncrypted = (localFlags and 1) != 0 || (entry.flags and 1) != 0
        val baseStream: InputStream = if (isEncrypted) {
            if (password.isNullOrEmpty()) {
                throw SecurityException("Password required for encrypted entry")
            }
            // Standard ZipCrypto decryption stream
            ZipCryptoInputStream(rawSliceStream, password!!)
        } else {
            rawSliceStream
        }

        val decompressedStream = when (method) {
            0 -> baseStream // STORED
            8 -> InflaterInputStream(baseStream, Inflater(true), 65536) // DEFLATED (nowrap=true)
            else -> throw UnsupportedOperationException("Unsupported compression method: $method")
        }

        // Wrap in safety counting stream to enforce 2 GB max read and ratio guard dynamically
        return SafeGuardInputStream(
            stream = decompressedStream,
            maxBytes = ArchiveBrowser.MAX_DECLARED_SIZE,
            compSize = compDataLen
        )
    }

    override fun sniffEntry(entryPath: String): SniffResult {
        return try {
            openEntry(entryPath).use { stream ->
                val sample = ByteArray(4096)
                var read = 0
                while (read < sample.size) {
                    val r = stream.read(sample, read, sample.size - read)
                    if (r == -1) break
                    read += r
                }
                val cleanSample = if (read < sample.size) sample.copyOf(read) else sample
                val cleanName = File(entryPath).name
                FormatRegistry.sniffBytes(
                    bytes = cleanSample,
                    fallbackFilename = cleanName,
                    fileSize = entriesByPath[normalizeVirtualPath(entryPath)]?.uncompSize ?: -1L
                )
            }
        } catch (e: Exception) {
            val cleanName = File(entryPath).name
            val ext = getExt(cleanName)
            if (FormatRegistry.SUPPORTED_FORMATS.contains(ext)) {
                SniffResult(ext, 0.4f, "Failed to read entry content: ${e.message}", kind = "book")
            } else {
                SniffResult("unknown", 0.0f, "Failed to inspect entry: ${e.message}", kind = "blocked")
            }
        }
    }

    override fun getEncoding(): String = activeCharset.name()
    override fun getEntryCount(): Int = totalEntriesCount
    override fun needsPassword(): Boolean = needsPass

    override fun close() {
        try { channel.close() } catch (_: Exception) {}
        try { raf?.close() } catch (_: Exception) {}
        try { pfd?.close() } catch (_: Exception) {}
    }

    // ==========================================
    // Central Directory Parsing & Tree Building
    // ==========================================
    private fun readCentralDirectoryIndex() {
        entriesByPath.clear()
        rootNode = VirtualDirectoryNode("", "")

        val searchLen = minOf(fileSize, 65536L + 22L).toInt()
        val searchBuffer = ByteBuffer.allocate(searchLen)
        channel.position(fileSize - searchLen)
        channel.read(searchBuffer)
        val bytes = searchBuffer.array()

        var eocdPos = -1
        for (i in searchLen - 22 downTo 0) {
            if (bytes[i] == 0x50.toByte() && bytes[i + 1] == 0x4B.toByte() &&
                bytes[i + 2] == 0x05.toByte() && bytes[i + 3] == 0x06.toByte()
            ) {
                eocdPos = i
                break
            }
        }

        if (eocdPos == -1) {
            throw IOException("Corrupt: central directory not found")
        }

        val eocdBuf = ByteBuffer.wrap(bytes, eocdPos, searchLen - eocdPos).order(ByteOrder.LITTLE_ENDIAN)
        eocdBuf.getInt() // signature
        eocdBuf.getShort() // disk
        eocdBuf.getShort() // start disk
        var numEntriesDisk = eocdBuf.getShort().toInt() and 0xFFFF
        var totalEntries = eocdBuf.getShort().toInt() and 0xFFFF
        var cdSize = eocdBuf.getInt().toLong() and 0xFFFFFFFFL
        var cdOffset = eocdBuf.getInt().toLong() and 0xFFFFFFFFL

        val actualEocdOffset = fileSize - searchLen + eocdPos

        // Check for ZIP64 EOCD Locator
        if (totalEntries == 0xFFFF || cdOffset == 0xFFFFFFFFL || cdSize == 0xFFFFFFFFL) {
            val zip64LocatorPos = eocdPos - 20
            if (zip64LocatorPos >= 0) {
                val locatorBuf = ByteBuffer.wrap(bytes, zip64LocatorPos, 20).order(ByteOrder.LITTLE_ENDIAN)
                if (locatorBuf.getInt() == 0x07064b50) { // ZIP64 locator signature
                    locatorBuf.getInt() // disk
                    val zip64EocdOffset = locatorBuf.getLong()
                    channel.position(zip64EocdOffset)
                    val zip64Buf = ByteBuffer.allocate(56).order(ByteOrder.LITTLE_ENDIAN)
                    channel.read(zip64Buf)
                    zip64Buf.flip()
                    if (zip64Buf.getInt() == 0x06064b50) {
                        zip64Buf.getLong() // size
                        zip64Buf.getShort() // version made
                        zip64Buf.getShort() // version needed
                        zip64Buf.getInt() // disk
                        zip64Buf.getInt() // start disk
                        zip64Buf.getLong() // entries on disk
                        totalEntries = zip64Buf.getLong().toInt()
                        cdSize = zip64Buf.getLong()
                        cdOffset = zip64Buf.getLong()
                    }
                }
            }
        }

        if (totalEntries > ArchiveBrowser.MAX_ENTRIES_COUNT) {
            throw SecurityException("Corrupt: entry count exceeds maximum limit of 100,000")
        }

        // Adjust for leading junk / self-extracting executable prefix
        val expectedEocdOffset = cdOffset + cdSize
        val offsetDelta = if (actualEocdOffset > expectedEocdOffset) actualEocdOffset - expectedEocdOffset else 0L
        val effectiveCdOffset = cdOffset + offsetDelta

        if (effectiveCdOffset + cdSize > fileSize) {
            throw IOException("Corrupt: central directory offset out of file bounds")
        }

        val cdBuffer = ByteBuffer.allocate(cdSize.toInt()).order(ByteOrder.LITTLE_ENDIAN)
        channel.position(effectiveCdOffset)
        channel.read(cdBuffer)
        cdBuffer.flip()

        val rawEntryList = ArrayList<ZipRawEntry>()
        val sampleNamesBytes = ArrayList<ByteArray>()

        while (cdBuffer.remaining() >= 46) {
            val sig = cdBuffer.getInt()
            if (sig != 0x02014b50) break

            cdBuffer.getShort() // version made by
            cdBuffer.getShort() // version needed
            val flags = cdBuffer.getShort().toInt() and 0xFFFF
            val method = cdBuffer.getShort().toInt() and 0xFFFF
            val mtime = cdBuffer.getShort().toLong() and 0xFFFF
            val mdate = cdBuffer.getShort().toLong() and 0xFFFF
            val crc = cdBuffer.getInt().toLong() and 0xFFFFFFFFL
            var compSize = cdBuffer.getInt().toLong() and 0xFFFFFFFFL
            var uncompSize = cdBuffer.getInt().toLong() and 0xFFFFFFFFL
            val nameLen = cdBuffer.getShort().toInt() and 0xFFFF
            val extraLen = cdBuffer.getShort().toInt() and 0xFFFF
            val commentLen = cdBuffer.getShort().toInt() and 0xFFFF
            cdBuffer.getShort() // disk
            cdBuffer.getShort() // internal attr
            cdBuffer.getInt() // external attr
            var localOffset = cdBuffer.getInt().toLong() and 0xFFFFFFFFL

            if (cdBuffer.remaining() < nameLen + extraLen + commentLen) break
            val nameBytes = ByteArray(nameLen)
            cdBuffer.get(nameBytes)

            // Parse ZIP64 extra field if present
            if (extraLen > 0) {
                val extraEnd = cdBuffer.position() + extraLen
                while (cdBuffer.remaining() >= 4 && cdBuffer.position() + 4 <= extraEnd) {
                    val headerId = cdBuffer.getShort().toInt() and 0xFFFF
                    val dataSize = cdBuffer.getShort().toInt() and 0xFFFF
                    val nextFieldPos = cdBuffer.position() + dataSize
                    if (headerId == 0x0001) { // ZIP64 Extended Information
                        if (uncompSize == 0xFFFFFFFFL && cdBuffer.remaining() >= 8) uncompSize = cdBuffer.getLong()
                        if (compSize == 0xFFFFFFFFL && cdBuffer.remaining() >= 8) compSize = cdBuffer.getLong()
                        if (localOffset == 0xFFFFFFFFL && cdBuffer.remaining() >= 8) localOffset = cdBuffer.getLong()
                    }
                    cdBuffer.position(nextFieldPos)
                }
                cdBuffer.position(extraEnd)
            }

            cdBuffer.position(cdBuffer.position() + commentLen)

            if ((flags and 1) != 0) {
                needsPass = true
            }

            sampleNamesBytes.add(nameBytes)
            val isDir = nameBytes.isNotEmpty() && (nameBytes.last() == '/'.code.toByte() || nameBytes.last() == '\\'.code.toByte())

            rawEntryList.add(
                ZipRawEntry(
                    fullPath = "", // will populate after charset detection
                    cleanName = "",
                    isDir = isDir,
                    flags = flags,
                    method = method,
                    mtime = dosToJavaTime(mdate, mtime),
                    crc32 = crc,
                    compSize = compSize,
                    uncompSize = uncompSize,
                    localOffset = localOffset + offsetDelta
                )
            )
        }

        // Determine Charset
        activeCharset = detectBestCharset(sampleNamesBytes, encodingOverride)

        // Populate tree and index with decoded filenames
        for (i in 0 until rawEntryList.size) {
            val raw = rawEntryList[i]
            val nameBytes = sampleNamesBytes[i]

            val decodedPath = if ((raw.flags and 0x800) != 0) {
                String(nameBytes, Charsets.UTF_8)
            } else {
                String(nameBytes, activeCharset)
            }

            val sanitizedPath = sanitizeEntryPath(decodedPath)
            if (sanitizedPath.isBlank()) continue

            val isDirectory = raw.isDir || sanitizedPath.endsWith("/")
            val cleanFullPath = sanitizedPath.trimEnd('/')
            val cleanFileName = File(cleanFullPath).name

            val finalEntry = raw.copy(
                fullPath = cleanFullPath,
                cleanName = cleanFileName,
                isDir = isDirectory
            )

            entriesByPath[cleanFullPath] = finalEntry
            insertIntoTree(rootNode, finalEntry)
        }

        totalEntriesCount = entriesByPath.size
    }

    private fun detectBestCharset(samples: List<ByteArray>, override: String?): Charset {
        if (!override.isNullOrBlank()) {
            return try {
                Charset.forName(override)
            } catch (_: Exception) {
                Charsets.UTF_8
            }
        }

        // Check if all samples are valid UTF-8
        var hasNonAscii = false
        var isValidUtf8 = true
        for (bytes in samples) {
            for (b in bytes) {
                if (b < 0) hasNonAscii = true
            }
            if (!isValidUtf8ByteArray(bytes)) {
                isValidUtf8 = false
                break
            }
        }

        if (!hasNonAscii || isValidUtf8) {
            return Charsets.UTF_8
        }

        // Fallback candidate list: CP437 -> CP866 -> GBK -> Shift_JIS -> Big5 -> EUC-KR
        val candidates = listOf("IBM437", "CP866", "GBK", "Shift_JIS", "Big5", "EUC-KR", "ISO-8859-1")
        for (cand in candidates) {
            try {
                val cs = Charset.forName(cand)
                var decodedClean = true
                for (b in samples) {
                    val s = String(b, cs)
                    if (s.contains("\uFFFD")) {
                        decodedClean = false
                        break
                    }
                }
                if (decodedClean) return cs
            } catch (_: Exception) {}
        }

        return Charsets.ISO_8859_1
    }

    private fun isValidUtf8ByteArray(bytes: ByteArray): Boolean {
        var i = 0
        while (i < bytes.size) {
            val b = bytes[i].toInt() and 0xFF
            if (b <= 0x7F) {
                i++
            } else if (b in 0xC2..0xDF) {
                if (i + 1 >= bytes.size) return false
                val b2 = bytes[i + 1].toInt() and 0xFF
                if (b2 !in 0x80..0xBF) return false
                i += 2
            } else if (b in 0xE0..0xEF) {
                if (i + 2 >= bytes.size) return false
                val b2 = bytes[i + 1].toInt() and 0xFF
                val b3 = bytes[i + 2].toInt() and 0xFF
                if (b2 !in 0x80..0xBF || b3 !in 0x80..0xBF) return false
                i += 3
            } else if (b in 0xF0..0xF4) {
                if (i + 3 >= bytes.size) return false
                val b2 = bytes[i + 1].toInt() and 0xFF
                val b3 = bytes[i + 2].toInt() and 0xFF
                val b4 = bytes[i + 3].toInt() and 0xFF
                if (b2 !in 0x80..0xBF || b3 !in 0x80..0xBF || b4 !in 0x80..0xBF) return false
                i += 4
            } else {
                return false
            }
        }
        return true
    }

    private fun insertIntoTree(root: VirtualDirectoryNode, entry: ZipRawEntry) {
        val parts = entry.fullPath.split('/').filter { it.isNotBlank() }
        if (parts.isEmpty()) return

        var current = root
        for (i in 0 until parts.size - 1) {
            val part = parts[i]
            val nextPath = if (current.fullPath.isBlank()) part else "${current.fullPath}/$part"
            current = current.subdirs.getOrPut(part) {
                VirtualDirectoryNode(part, nextPath)
            }
        }

        val leafName = parts.last()
        if (entry.isDir) {
            val dirPath = if (current.fullPath.isBlank()) leafName else "${current.fullPath}/$leafName"
            current.subdirs.getOrPut(leafName) {
                VirtualDirectoryNode(leafName, dirPath)
            }
        } else {
            val ext = getExt(leafName)
            val isBlocked = FormatRegistry.BLOCKED_EXTENSIONS.contains(ext)
            val isBook = FormatRegistry.SUPPORTED_FORMATS.contains(ext)
            val isNestedZip = ext == "zip"
            val kind = when {
                isBlocked -> "blocked"
                isNestedZip -> "container"
                isBook -> "book"
                else -> "blocked"
            }

            current.files.add(
                ArchiveEntryItem(
                    path = entry.fullPath,
                    name = entry.cleanName,
                    isDirectory = false,
                    size = entry.uncompSize,
                    compressedSize = entry.compSize,
                    mtime = entry.mtime,
                    sniffFormat = if (isBook) ext else null,
                    kind = kind,
                    encrypted = (entry.flags and 1) != 0,
                    isNestedArchive = isNestedZip
                )
            )
        }
    }

    private fun findNode(root: VirtualDirectoryNode, path: String): VirtualDirectoryNode? {
        if (path.isBlank() || path == "/") return root
        val parts = path.split('/').filter { it.isNotBlank() }
        var current = root
        for (part in parts) {
            current = current.subdirs[part] ?: return null
        }
        return current
    }

    private fun normalizeVirtualPath(path: String): String {
        return path.replace('\\', '/').trim('/').trim()
    }

    private fun sanitizeEntryPath(raw: String): String {
        val normalized = raw.replace('\\', '/').replace("\u0000", "")
        val segments = normalized.split('/').filter { it.isNotBlank() && it != "." }
        val safe = ArrayList<String>()
        for (seg in segments) {
            if (seg == "..") continue
            safe.add(seg)
        }
        return safe.joinToString("/")
    }

    private fun validateSafeEntryPath(path: String) {
        if (path.contains("..") || path.startsWith("/") || path.contains("\u0000")) {
            throw SecurityException("Zip-slip vector detected: invalid entry path '$path'")
        }
    }

    private fun dosToJavaTime(dDate: Long, dTime: Long): Long {
        val year = ((dDate shr 9) and 0x7F).toInt() + 1980
        val month = ((dDate shr 5) and 0x0F).toInt() - 1
        val day = (dDate and 0x1F).toInt()
        val hour = ((dTime shr 11) and 0x1F).toInt()
        val min = ((dTime shr 5) and 0x3F).toInt()
        val sec = ((dTime and 0x1F) * 2).toInt()

        val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        cal.set(year, maxOf(0, month), maxOf(1, day), hour, min, sec)
        return cal.timeInMillis
    }

    private fun getExt(name: String): String {
        val idx = name.lastIndexOf('.')
        return if (idx >= 0 && idx < name.length - 1) name.substring(idx + 1).lowercase(Locale.ROOT) else ""
    }
}

/**
 * Reads a bounded window of bytes directly from a FileChannel without buffering the entire file.
 */
class ChannelBoundedInputStream(
    private val channel: FileChannel,
    private val startOffset: Long,
    private val length: Long
) : InputStream() {
    private var currentPos = 0L

    override fun read(): Int {
        if (currentPos >= length) return -1
        val buf = ByteBuffer.allocate(1)
        synchronized(channel) {
            channel.position(startOffset + currentPos)
            val read = channel.read(buf)
            if (read <= 0) return -1
        }
        currentPos++
        return buf.get(0).toInt() and 0xFF
    }

    override fun read(b: ByteArray, off: Int, len: Int): Int {
        if (currentPos >= length) return -1
        val toRead = minOf(len.toLong(), length - currentPos).toInt()
        val buf = ByteBuffer.wrap(b, off, toRead)
        val count: Int
        synchronized(channel) {
            channel.position(startOffset + currentPos)
            count = channel.read(buf)
        }
        if (count > 0) currentPos += count
        return count
    }

    override fun available(): Int = maxOf(0, (length - currentPos).toInt())
}

/**
 * Standard ZipCrypto Decryption Stream for PKZIP password-protected entries.
 */
class ZipCryptoInputStream(
    private val wrapped: InputStream,
    password: String
) : InputStream() {
    private val keys = IntArray(3)

    init {
        initKeys(password)
        // Skip 12-byte encryption header
        val header = ByteArray(12)
        var total = 0
        while (total < 12) {
            val r = wrapped.read(header, total, 12 - total)
            if (r == -1) throw IOException("Truncated ZipCrypto encryption header")
            total += r
        }
        for (b in header) {
            decryptByte(b.toInt() and 0xFF)
        }
    }

    private fun initKeys(pass: String) {
        keys[0] = 305419896
        keys[1] = 591751049
        keys[2] = 878082192
        for (ch in pass.toCharArray()) {
            updateKeys(ch.code)
        }
    }

    private fun updateKeys(b: Int) {
        keys[0] = crc32(keys[0], b)
        keys[1] = ((keys[1] + (keys[0] and 0xFF)) * 134775813 + 1)
        keys[2] = crc32(keys[2], (keys[1] ushr 24) and 0xFF)
    }

    private fun decryptByte(cipherByte: Int): Int {
        val temp = (keys[2] and 0xFFFF) or 2
        val k = ((temp * (temp xor 1)) ushr 8) and 0xFF
        val plain = cipherByte xor k
        updateKeys(plain)
        return plain
    }

    private fun crc32(oldCrc: Int, byteVal: Int): Int {
        var crc = oldCrc xor byteVal
        for (i in 0 until 8) {
            crc = if ((crc and 1) != 0) (crc ushr 1) xor -306674912 else crc ushr 1
        }
        return crc
    }

    override fun read(): Int {
        val b = wrapped.read()
        if (b == -1) return -1
        return decryptByte(b)
    }

    override fun read(b: ByteArray, off: Int, len: Int): Int {
        val read = wrapped.read(b, off, len)
        if (read <= 0) return read
        for (i in 0 until read) {
            b[off + i] = decryptByte(b[off + i].toInt() and 0xFF).toByte()
        }
        return read
    }

    override fun close() {
        wrapped.close()
    }
}

/**
 * Protects against zip bombs dynamically during entry streaming.
 */
class SafeGuardInputStream(
    private val stream: InputStream,
    private val maxBytes: Long,
    private val compSize: Long
) : InputStream() {
    private var totalBytesRead = 0L

    override fun read(): Int {
        val b = stream.read()
        if (b != -1) {
            totalBytesRead++
            checkBudget()
        }
        return b
    }

    override fun read(b: ByteArray, off: Int, len: Int): Int {
        val count = stream.read(b, off, len)
        if (count > 0) {
            totalBytesRead += count
            checkBudget()
        }
        return count
    }

    private fun checkBudget() {
        if (totalBytesRead > maxBytes) {
            throw SecurityException("Decompressed size exceeded maximum safety limit of 2 GB")
        }
        if (totalBytesRead > 100 * 1024 * 1024 && compSize > 0) {
            val ratio = totalBytesRead.toDouble() / compSize.toDouble()
            if (ratio > 200.0) {
                throw SecurityException("Corrupt: suspicious compression ratio ($ratio:1)")
            }
        }
    }

    override fun close() {
        stream.close()
    }
}
