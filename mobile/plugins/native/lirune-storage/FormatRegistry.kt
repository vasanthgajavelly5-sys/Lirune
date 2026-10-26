package com.lirune.reader.storage

import android.content.Context
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel
import java.security.MessageDigest
import java.util.Locale
import java.util.zip.ZipInputStream

data class SniffResult(
    val format: String,
    val confidence: Float,
    val reason: String,
    val isDrm: Boolean = false,
    val drmReason: String? = null,
    val quickFp: String? = null,
    val kind: String = "book", // "book" | "container" | "blocked"
    val needsPassword: Boolean = false
)

data class ZipEntryMeta(
    val name: String,
    val isDirectory: Boolean,
    val isEncrypted: Boolean,
    val uncompressedSize: Long,
    val compressedSize: Long
)

object FormatRegistry {

    private val SUPPORTED_FORMATS = setOf(
        "epub", "pdf", "txt", "html", "fb2", "cbz", "cbr", "cb7",
        "mobi", "azw", "azw3", "djvu", "doc", "docx", "rtf", "odt", "chm"
    )

    private val BOOK_ARCHIVE_EXTENSIONS = setOf(
        "epub", "pdf", "fb2", "cbz", "cbr", "cb7", "mobi", "azw", "azw3", "kf8",
        "djvu", "djv", "doc", "docx", "rtf", "odt", "chm"
    )

    fun isSupported(format: String): Boolean = SUPPORTED_FORMATS.contains(format.lowercase(Locale.ROOT))

    /**
     * Reads up to maxBytes from the start of an input stream.
     */
    private fun readSample(stream: InputStream, maxBytes: Int): ByteArray {
        val buffer = ByteArray(maxBytes)
        var totalRead = 0
        while (totalRead < maxBytes) {
            val count = stream.read(buffer, totalRead, maxBytes - totalRead)
            if (count <= 0) break
            totalRead += count
        }
        return if (totalRead == maxBytes) buffer else buffer.copyOf(totalRead)
    }

    /**
     * Computes quick_fp = size + ":" + hex(SHA256(first 64KB + last 64KB))
     */
    fun computeQuickFingerprint(fileSize: Long, headBytes: ByteArray, tailBytes: ByteArray?): String {
        try {
            val md = MessageDigest.getInstance("SHA-256")
            md.update(headBytes, 0, minOf(headBytes.size, 65536))
            if (tailBytes != null && tailBytes.isNotEmpty()) {
                md.update(tailBytes, 0, minOf(tailBytes.size, 65536))
            }
            val hash = md.digest().joinToString("") { "%02x".format(it) }
            return "$fileSize:$hash"
        } catch (_: Exception) {
            return "$fileSize:${headBytes.size}"
        }
    }

    /**
     * Inspects content-based magic bytes and container internals to identify format, kind, and DRM.
     */
    fun sniff(
        context: Context,
        uri: Uri,
        fallbackFilename: String? = null,
        fileSize: Long = -1L
    ): SniffResult {
        return try {
            val resolver = context.contentResolver
            val sample = resolver.openInputStream(uri)?.use { stream ->
                readSample(stream, 4096)
            } ?: ByteArray(0)

            // Try seekable FileChannel for ZIP inspection if possible
            var pfd: ParcelFileDescriptor? = null
            var channel: FileChannel? = null
            try {
                pfd = resolver.openFileDescriptor(uri, "r")
                if (pfd != null) {
                    channel = FileInputStream(pfd.fileDescriptor).channel
                }
            } catch (_: Exception) {}

            try {
                sniffBytes(
                    bytes = sample,
                    fallbackFilename = fallbackFilename,
                    fileSize = if (fileSize > 0) fileSize else channel?.size() ?: -1L,
                    supplier = { resolver.openInputStream(uri) },
                    channel = channel
                )
            } finally {
                channel?.close()
                pfd?.close()
            }
        } catch (e: Exception) {
            val ext = getExt(fallbackFilename)
            if (SUPPORTED_FORMATS.contains(ext)) {
                SniffResult(ext, 0.4f, "Fallback by extension after read error: ${e.message}", kind = "book")
            } else {
                SniffResult("unknown", 0.0f, "Failed to read file: ${e.message}", kind = "blocked")
            }
        }
    }

    fun sniffFile(file: File, fallbackFilename: String? = null): SniffResult {
        return try {
            val sample = file.inputStream().use { stream ->
                readSample(stream, 4096)
            }
            RandomAccessFile(file, "r").use { raf ->
                sniffBytes(
                    bytes = sample,
                    fallbackFilename = fallbackFilename ?: file.name,
                    fileSize = file.length(),
                    supplier = { file.inputStream() },
                    channel = raf.channel
                )
            }
        } catch (e: Exception) {
            val ext = getExt(fallbackFilename ?: file.name)
            if (SUPPORTED_FORMATS.contains(ext)) {
                SniffResult(ext, 0.4f, "Fallback by extension: ${e.message}", kind = "book")
            } else {
                SniffResult("unknown", 0.0f, "Failed to read file: ${e.message}", kind = "blocked")
            }
        }
    }

    fun sniffBytes(
        bytes: ByteArray,
        fallbackFilename: String?,
        fileSize: Long,
        supplier: (() -> InputStream?)? = null,
        channel: FileChannel? = null
    ): SniffResult {
        val ext = getExt(fallbackFilename)
        if (bytes.size < 4) {
            return if (SUPPORTED_FORMATS.contains(ext)) {
                SniffResult(ext, 0.5f, "File too small for header inspection; matched by extension", kind = "book")
            } else {
                SniffResult("unknown", 0.0f, "File smaller than 4 bytes and unrecognized", kind = "blocked")
            }
        }

        // 1. PDF: %PDF- (0x25, 0x50, 0x44, 0x46) within first 1024 bytes
        val pdfIndex = indexOfSequence(bytes, byteArrayOf(0x25, 0x50, 0x44, 0x46), 1024)
        if (pdfIndex >= 0) {
            val sampleString = String(bytes, 0, minOf(bytes.size, 4096), Charsets.ISO_8859_1)
            val hasEncrypt = sampleString.contains("/Encrypt")
            val quickFp = computeQuickFingerprint(fileSize, bytes, null)
            return if (hasEncrypt) {
                SniffResult("pdf", 1.0f, "Encrypted PDF container", isDrm = true, drmReason = "PDF has standard encryption (/Encrypt)", quickFp = quickFp, kind = "book")
            } else {
                SniffResult("pdf", 1.0f, "Valid PDF header magic bytes", quickFp = quickFp, kind = "book")
            }
        }

        // 2. RTF: {\rtf (0x7B, 0x5C, 0x72, 0x74, 0x66)
        if (bytes.size >= 5 && bytes[0] == 0x7B.toByte() && bytes[1] == 0x5C.toByte() &&
            bytes[2] == 0x72.toByte() && bytes[3] == 0x74.toByte() && bytes[4] == 0x66.toByte()
        ) {
            return SniffResult("rtf", 1.0f, "Valid RTF header", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }

        // 3. RAR / CBR: Rar!\x1A\x07 (0x52, 0x61, 0x72, 0x21, 0x1A, 0x07)
        if (bytes.size >= 6 && bytes[0] == 0x52.toByte() && bytes[1] == 0x61.toByte() &&
            bytes[2] == 0x72.toByte() && bytes[3] == 0x21.toByte() && bytes[4] == 0x1A.toByte() && bytes[5] == 0x07.toByte()
        ) {
            return SniffResult("cbr", 0.95f, "Valid RAR archive comic container", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }

        // 4. 7z / CB7: 7z\xBC\xAF\x27\x1C (0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C)
        if (bytes.size >= 6 && bytes[0] == 0x37.toByte() && bytes[1] == 0x7A.toByte() &&
            bytes[2] == 0xBC.toByte() && bytes[3] == 0xAF.toByte() && bytes[4] == 0x27.toByte() && bytes[5] == 0x1C.toByte()
        ) {
            return SniffResult("cb7", 0.95f, "Valid 7-Zip comic container", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }

        // 5. CHM: ITSF (0x49, 0x54, 0x53, 0x46)
        if (bytes[0] == 0x49.toByte() && bytes[1] == 0x54.toByte() && bytes[2] == 0x53.toByte() && bytes[3] == 0x46.toByte()) {
            return SniffResult("chm", 1.0f, "Valid CHM ITSF header", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }

        // 6. DjVu: AT&T (0x41, 0x54, 0x26, 0x54) + FORM
        if (bytes.size >= 12 && bytes[0] == 0x41.toByte() && bytes[1] == 0x54.toByte() &&
            bytes[2] == 0x26.toByte() && bytes[3] == 0x54.toByte() && bytes[4] == 0x46.toByte() &&
            bytes[5] == 0x4F.toByte() && bytes[6] == 0x52.toByte() && bytes[7] == 0x4D.toByte()
        ) {
            return SniffResult("djvu", 1.0f, "Valid DjVu AT&T FORM header", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }

        // 7. Microsoft Compound Document (DOC / OLE2): 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1
        if (bytes.size >= 8 &&
            bytes[0] == 0xD0.toByte() && bytes[1] == 0xCF.toByte() && bytes[2] == 0x11.toByte() && bytes[3] == 0xE0.toByte() &&
            bytes[4] == 0xA1.toByte() && bytes[5] == 0xB1.toByte() && bytes[6] == 0x1A.toByte() && bytes[7] == 0xE1.toByte()
        ) {
            return SniffResult("doc", 0.95f, "Microsoft OLE2 Compound Document (DOC)", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }

        // 8. Palm Database / MOBI / AZW / AZW3: Check for "BOOKMOBI" or "TEXtREAd" at offset 60..67
        if (bytes.size >= 68) {
            val magic = String(bytes, 60, 8, Charsets.US_ASCII)
            if (magic == "BOOKMOBI" || magic == "TEXtREAd") {
                var isDrm = false
                var drmReason: String? = null
                var isKf8 = ext == "azw3" || ext == "kf8"

                if (bytes.size >= 80) {
                    val encryptionType = ((bytes[78].toInt() and 0xFF) shl 8) or (bytes[79].toInt() and 0xFF)
                    if (encryptionType != 0) {
                        isDrm = true
                        drmReason = "MOBI / Kindle DRM encryption type $encryptionType"
                    }
                }

                val sampleString = String(bytes, 0, minOf(bytes.size, 4096), Charsets.ISO_8859_1)
                if (sampleString.contains("KF8") || sampleString.contains("FDST")) {
                    isKf8 = true
                }

                val format = if (isKf8) "azw3" else if (ext == "azw") "azw" else "mobi"
                return SniffResult(
                    format = format,
                    confidence = 0.98f,
                    reason = "Valid PalmDOC/MOBI signature ($magic)",
                    isDrm = isDrm,
                    drmReason = drmReason,
                    quickFp = computeQuickFingerprint(fileSize, bytes, null),
                    kind = "book"
                )
            }
        }

        // 9. ZIP-based containers: PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
        if (bytes[0] == 0x50.toByte() && bytes[1] == 0x4B.toByte() && bytes[2] == 0x03.toByte() && bytes[3] == 0x04.toByte()) {
            return inspectZipContainer(bytes, fallbackFilename, fileSize, supplier, channel)
        }

        // 10. XML / FB2 / HTML
        val textHead = String(bytes, 0, minOf(bytes.size, 512), Charsets.UTF_8).trim()
        if (textHead.contains("<FictionBook", ignoreCase = true)) {
            return SniffResult("fb2", 0.98f, "FictionBook2 XML root", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }
        if (textHead.contains("<!DOCTYPE html", ignoreCase = true) || textHead.contains("<html", ignoreCase = true)) {
            return SniffResult("html", 0.95f, "HTML document structure", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }

        // 11. Plain Text / Markdown / Unknown: check for NUL bytes in sample
        var hasNul = false
        for (i in 0 until minOf(bytes.size, 1024)) {
            if (bytes[i] == 0.toByte()) {
                hasNul = true
                break
            }
        }

        if (!hasNul) {
            if (ext == "html" || ext == "htm" || ext == "xhtml") {
                return SniffResult("html", 0.9f, "HTML extension with text content", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
            }
            if (textHead.startsWith("#") || textHead.contains("```") || ext == "md") {
                return SniffResult("txt", 0.9f, "Markdown text content", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
            }
            return SniffResult("txt", 0.85f, "Valid plain text content without null bytes", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }

        // Blocked extension check (never import app packages / binaries)
        val blockedExts = setOf("apk", "jar", "aab", "xapk", "apks", "dex", "exe", "class", "arsc", "so", "dll")
        if (blockedExts.contains(ext)) {
            return SniffResult(
                format = ext,
                confidence = 1.0f,
                reason = "Blocked executable or system package (.$ext)",
                quickFp = computeQuickFingerprint(fileSize, bytes, null),
                kind = "blocked"
            )
        }

        if (SUPPORTED_FORMATS.contains(ext)) {
            return SniffResult(ext, 0.4f, "Extension match only; binary signatures did not match", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }

        return SniffResult("unknown", 0.0f, "Unrecognized binary header or format", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "blocked")
    }

    /**
     * Inspects ZIP-based containers using central directory records.
     * Order:
     * 1. EPUB
     * 2. DOCX / ODT
     * 3. Android/Java packages -> blocked:app-package
     * 4. FB2.ZIP
     * 5. CBZ
     * 6. ARCHIVE_CONTAINER (contains >= 1 supported book)
     * 7. failed:unrecognized
     */
    private fun inspectZipContainer(
        headBytes: ByteArray,
        fallbackFilename: String?,
        fileSize: Long,
        supplier: (() -> InputStream?)?,
        channel: FileChannel?
    ): SniffResult {
        val quickFp = computeQuickFingerprint(fileSize, headBytes, null)

        // Read central directory entries from channel or stream
        val entries: List<ZipEntryMeta> = if (channel != null && channel.isOpen) {
            try {
                readCentralDirectory(channel)
            } catch (_: Exception) {
                readZipEntriesFromStream(supplier)
            }
        } else {
            readZipEntriesFromStream(supplier)
        }

        return classifyZipEntries(entries, fallbackFilename, fileSize, quickFp, supplier)
    }

    /**
     * Reads ZIP central directory using random access.
     */
    fun readCentralDirectory(channel: FileChannel): List<ZipEntryMeta> {
        val size = channel.size()
        if (size < 22) return emptyList()

        val searchLen = minOf(size, 65536L + 22L).toInt()
        val searchBuffer = ByteBuffer.allocate(searchLen)
        channel.position(size - searchLen)
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
        if (eocdPos == -1) return emptyList()

        val eocdBuf = ByteBuffer.wrap(bytes, eocdPos, searchLen - eocdPos).order(ByteOrder.LITTLE_ENDIAN)
        eocdBuf.getInt() // signature
        eocdBuf.getShort() // disk
        eocdBuf.getShort() // start disk
        val entriesOnDisk = eocdBuf.getShort().toInt() and 0xFFFF
        val totalEntries = eocdBuf.getShort().toInt() and 0xFFFF
        val cdSize = eocdBuf.getInt().toLong() and 0xFFFFFFFFL
        var cdOffset = eocdBuf.getInt().toLong() and 0xFFFFFFFFL

        // Check for ZIP64 locator right before EOCD
        if (cdOffset == 0xFFFFFFFFL || totalEntries == 0xFFFF) {
            val locatorPos = eocdPos - 20
            if (locatorPos >= 0 &&
                bytes[locatorPos] == 0x50.toByte() && bytes[locatorPos + 1] == 0x4B.toByte() &&
                bytes[locatorPos + 2] == 0x06.toByte() && bytes[locatorPos + 3] == 0x07.toByte()
            ) {
                val locBuf = ByteBuffer.wrap(bytes, locatorPos, 20).order(ByteOrder.LITTLE_ENDIAN)
                locBuf.getInt() // sig
                locBuf.getInt() // disk
                val zip64EocdOffset = locBuf.getLong()
                if (zip64EocdOffset < size) {
                    val z64Buf = ByteBuffer.allocate(56).order(ByteOrder.LITTLE_ENDIAN)
                    channel.position(zip64EocdOffset)
                    channel.read(z64Buf)
                    z64Buf.flip()
                    if (z64Buf.remaining() >= 56 && z64Buf.getInt() == 0x06064b50) {
                        z64Buf.getLong() // record size
                        z64Buf.getShort() // version made
                        z64Buf.getShort() // version need
                        z64Buf.getInt() // disk
                        z64Buf.getInt() // cd disk
                        z64Buf.getLong() // disk entries
                        z64Buf.getLong() // total entries
                        z64Buf.getLong() // cd size
                        cdOffset = z64Buf.getLong()
                    }
                }
            }
        }

        if (cdOffset >= size || cdSize > 20 * 1024 * 1024) return emptyList()

        channel.position(cdOffset)
        val cdBuffer = ByteBuffer.allocate(cdSize.toInt()).order(ByteOrder.LITTLE_ENDIAN)
        channel.read(cdBuffer)
        cdBuffer.flip()

        val list = ArrayList<ZipEntryMeta>()
        while (cdBuffer.remaining() >= 46 && list.size < 100000) {
            val sig = cdBuffer.getInt()
            if (sig != 0x02014b50) break
            cdBuffer.getShort() // version made by
            cdBuffer.getShort() // version needed
            val flags = cdBuffer.getShort().toInt() and 0xFFFF
            val method = cdBuffer.getShort().toInt() and 0xFFFF
            cdBuffer.getInt() // mtime
            cdBuffer.getInt() // crc
            val compSize = cdBuffer.getInt().toLong() and 0xFFFFFFFFL
            val uncompSize = cdBuffer.getInt().toLong() and 0xFFFFFFFFL
            val nameLen = cdBuffer.getShort().toInt() and 0xFFFF
            val extraLen = cdBuffer.getShort().toInt() and 0xFFFF
            val commentLen = cdBuffer.getShort().toInt() and 0xFFFF
            cdBuffer.getShort() // disk
            cdBuffer.getShort() // int attr
            cdBuffer.getInt() // ext attr
            val localOffset = cdBuffer.getInt().toLong() and 0xFFFFFFFFL

            if (cdBuffer.remaining() < nameLen + extraLen + commentLen) break
            val nameBytes = ByteArray(nameLen)
            cdBuffer.get(nameBytes)

            val name = if ((flags and 0x800) != 0) {
                String(nameBytes, Charsets.UTF_8)
            } else {
                try {
                    val s = String(nameBytes, Charsets.UTF_8)
                    if (s.contains("\uFFFD")) String(nameBytes, Charsets.ISO_8859_1) else s
                } catch (_: Exception) {
                    String(nameBytes, Charsets.ISO_8859_1)
                }
            }

            cdBuffer.position(cdBuffer.position() + extraLen + commentLen)
            val isDir = name.endsWith("/")
            val isEncrypted = (flags and 1) != 0
            list.add(ZipEntryMeta(name, isDir, isEncrypted, uncompSize, compSize))
        }
        return list
    }

    /**
     * Fallback stream-based entry listing using ZipInputStream.
     */
    private fun readZipEntriesFromStream(supplier: (() -> InputStream?)?): List<ZipEntryMeta> {
        if (supplier == null) return emptyList()
        val list = ArrayList<ZipEntryMeta>()
        try {
            supplier()?.use { raw ->
                ZipInputStream(raw).use { zis ->
                    var count = 0
                    while (count < 200) {
                        val entry = zis.nextEntry ?: break
                        val name = entry.name
                        val isDir = entry.isDirectory || name.endsWith("/")
                        list.add(ZipEntryMeta(name, isDir, false, entry.size, entry.compressedSize))
                        count++
                    }
                }
            }
        } catch (_: Exception) {}
        return list
    }

    /**
     * Executes the ordered classification decision tree for ZIP entries.
     */
    fun classifyZipEntries(
        entries: List<ZipEntryMeta>,
        fallbackFilename: String?,
        fileSize: Long,
        quickFp: String,
        supplier: (() -> InputStream?)?
    ): SniffResult {
        val ext = getExt(fallbackFilename)
        val namesLower = entries.map { it.name.lowercase(Locale.ROOT) }

        // 1. First entry mimetype == application/epub+zip OR META-INF/container.xml -> EPUB
        val hasMimetypeEpub = entries.firstOrNull()?.let {
            it.name.equals("mimetype", ignoreCase = true)
        } ?: false
        val hasContainerXml = namesLower.any { it.contains("meta-inf/container.xml") }
        if (hasMimetypeEpub || hasContainerXml || ext == "epub") {
            if (hasContainerXml || hasMimetypeEpub) {
                val drmInfo = checkEpubDrm(supplier)
                return SniffResult(
                    format = "epub",
                    confidence = 1.0f,
                    reason = if (hasMimetypeEpub) "EPUB mimetype entry" else "EPUB container.xml present",
                    isDrm = drmInfo.first,
                    drmReason = drmInfo.second,
                    quickFp = quickFp,
                    kind = "book"
                )
            }
        }

        // 2. DOCX / ODT
        val hasWordDoc = namesLower.any { it.startsWith("word/document.xml") }
        val hasContentTypes = namesLower.any { it == "[content_types].xml" }
        if (hasWordDoc && hasContentTypes) {
            return SniffResult("docx", 0.98f, "DOCX WordprocessingML package", quickFp = quickFp, kind = "book")
        }

        val hasOdtContent = namesLower.any { it == "content.xml" }
        if (hasOdtContent && (ext == "odt" || namesLower.any { it == "mimetype" })) {
            return SniffResult("odt", 0.98f, "ODT document package", quickFp = quickFp, kind = "book")
        }

        // 3. Android/Java packages -> blocked:app-package
        // Android APK: AndroidManifest.xml AND (classes.dex OR resources.arsc OR META-INF/*.RSA|.SF|.DSA)
        val hasManifest = namesLower.any { it == "androidmanifest.xml" }
        val hasDex = namesLower.any { it == "classes.dex" || it.endsWith(".dex") }
        val hasArsc = namesLower.any { it == "resources.arsc" }
        val hasCertSig = namesLower.any {
            it.startsWith("meta-inf/") && (it.endsWith(".rsa") || it.endsWith(".sf") || it.endsWith(".dsa"))
        }
        if (hasManifest && (hasDex || hasArsc || hasCertSig)) {
            return SniffResult(
                format = "apk",
                confidence = 1.0f,
                reason = "Android application package (.apk)",
                quickFp = quickFp,
                kind = "blocked"
            )
        }

        // AAB / APKS / XAPK: base.apk / *.apk entries at top level, or toc.pb, BundleConfig.pb
        val hasTopLevelApk = namesLower.any { (it == "base.apk" || it.endsWith(".apk")) && !it.contains("/") }
        val hasBundlePb = namesLower.any { it == "bundleconfig.pb" || it == "toc.pb" }
        if (hasTopLevelApk || hasBundlePb) {
            return SniffResult(
                format = "aab",
                confidence = 1.0f,
                reason = "Android App Bundle / Split APK package (.aab / .apks)",
                quickFp = quickFp,
                kind = "blocked"
            )
        }

        // JAR: META-INF/MANIFEST.MF + .class entries
        val hasJarManifest = namesLower.any { it == "meta-inf/manifest.mf" }
        val hasClassFiles = namesLower.any { it.endsWith(".class") }
        if (hasJarManifest && hasClassFiles) {
            return SniffResult(
                format = "jar",
                confidence = 1.0f,
                reason = "Java archive executable package (.jar)",
                quickFp = quickFp,
                kind = "blocked"
            )
        }

        // Browser Extension: install.rdf / manifest.json + chrome.manifest
        val hasChromeManifest = namesLower.any { it == "chrome.manifest" }
        val hasWebExt = namesLower.any { it == "install.rdf" || it == "manifest.json" }
        if (hasChromeManifest && hasWebExt) {
            return SniffResult(
                format = "xpi",
                confidence = 1.0f,
                reason = "Browser extension package",
                quickFp = quickFp,
                kind = "blocked"
            )
        }

        // 4. FB2: .fb2 XML inside single-entry zip (or filename .fb2.zip)
        val nonDirEntries = entries.filter { !it.isDirectory }
        val fb2Entries = nonDirEntries.filter { it.name.lowercase(Locale.ROOT).endsWith(".fb2") }
        val isFb2ZipName = fallbackFilename?.lowercase(Locale.ROOT)?.endsWith(".fb2.zip") == true
        if (fb2Entries.size == 1 && (nonDirEntries.size == 1 || isFb2ZipName)) {
            return SniffResult("fb2", 0.98f, "Single FictionBook FB2 inside archive", quickFp = quickFp, kind = "book")
        }

        // 5. CBZ: All (or >= 90%) of entries are images after ignoring ComicInfo.xml, Thumbs.db, .DS_Store, __MACOSX/, *.txt|nfo
        val ignoredCbNames = setOf("comicinfo.xml", "thumbs.db", ".ds_store")
        val contentEntries = nonDirEntries.filter { e ->
            val l = e.name.lowercase(Locale.ROOT)
            val base = l.substringAfterLast('/')
            !ignoredCbNames.contains(base) && !l.startsWith("__macosx/") && !base.endsWith(".txt") && !base.endsWith(".nfo")
        }
        val imageExtensions = setOf("jpg", "jpeg", "png", "gif", "webp", "avif", "bmp")
        val imageEntries = contentEntries.filter { e ->
            val entryExt = getExt(e.name)
            imageExtensions.contains(entryExt)
        }
        if (contentEntries.isNotEmpty() && (imageEntries.size.toFloat() / contentEntries.size.toFloat()) >= 0.90f) {
            return SniffResult("cbz", 0.95f, "Comic book image archive (CBZ)", quickFp = quickFp, kind = "book")
        }

        // 6. ARCHIVE_CONTAINER: Archive contains >= 1 entry whose extension is a supported book format
        val bookEntries = nonDirEntries.filter { e ->
            val entryExt = getExt(e.name)
            BOOK_ARCHIVE_EXTENSIONS.contains(entryExt)
        }
        val hasEncrypted = entries.any { it.isEncrypted }
        if (bookEntries.isNotEmpty()) {
            return SniffResult(
                format = "zip",
                confidence = 0.95f,
                reason = "ZIP archive with ${bookEntries.size} supported book(s) inside",
                quickFp = quickFp,
                kind = "container",
                needsPassword = hasEncrypted
            )
        }

        // If encrypted and has entries
        if (hasEncrypted && entries.isNotEmpty()) {
            return SniffResult(
                format = "zip",
                confidence = 0.70f,
                reason = "Password-protected ZIP archive",
                quickFp = quickFp,
                kind = "container",
                needsPassword = true
            )
        }

        // 7. Otherwise -> failed:unrecognized
        return SniffResult(
            format = "unknown",
            confidence = 0.0f,
            reason = "ZIP archive with no supported books inside",
            quickFp = quickFp,
            kind = "blocked"
        )
    }

    /**
     * Checks EPUB DRM algorithms in encryption.xml and rights.xml
     */
    private fun checkEpubDrm(supplier: (() -> InputStream?)?): Pair<Boolean, String?> {
        if (supplier == null) return Pair(false, null)
        try {
            supplier()?.use { stream ->
                ZipInputStream(stream).use { zis ->
                    var count = 0
                    while (count < 30) {
                        val entry = zis.nextEntry ?: break
                        val name = entry.name.lowercase(Locale.ROOT)
                        if (name.contains("rights.xml")) {
                            return Pair(true, "Adobe ADEPT rights.xml detected")
                        }
                        if (name.contains("encryption.xml")) {
                            val bytes = readSample(zis, 2048)
                            val text = String(bytes, Charsets.UTF_8)
                            val hasNonFontEnc = text.contains("<EncryptedData") &&
                                    !text.contains("http://www.idpf.org/2008/embedding") &&
                                    !text.contains("http://ns.adobe.com/pdf/enc#RC")
                            if (hasNonFontEnc) {
                                return Pair(true, "EPUB encryption.xml with proprietary cipher detected")
                            }
                        }
                        count++
                    }
                }
            }
        } catch (_: Exception) {}
        return Pair(false, null)
    }

    private fun indexOfSequence(source: ByteArray, target: ByteArray, maxIndex: Int): Int {
        if (target.isEmpty() || source.size < target.size) return -1
        val limit = minOf(source.size - target.size, maxIndex)
        for (i in 0..limit) {
            var match = true
            for (j in target.indices) {
                if (source[i + j] != target[j]) {
                    match = false
                    break
                }
            }
            if (match) return i
        }
        return -1
    }

    fun getExt(filename: String?): String {
        if (filename == null) return ""
        val lastDot = filename.lastIndexOf('.')
        return if (lastDot >= 0 && lastDot < filename.length - 1) {
            filename.substring(lastDot + 1).lowercase(Locale.ROOT).trim()
        } else {
            ""
        }
    }
}
