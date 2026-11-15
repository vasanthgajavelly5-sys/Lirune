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

    val SUPPORTED_FORMATS = setOf(
        "epub", "kepub", "pdf", "txt", "html", "htm", "xhtml", "fb2", "fbz", "cbz", "cbr", "cbt", "cb7",
        "mobi", "azw", "azw3", "kf8", "prc", "djvu", "djv", "doc", "docx", "rtf", "odt", "chm", "md", "markdown",
        "xlsx", "xlsm", "xltx", "xltm", "xlsb", "xls",
        "pptx", "pptm", "ppsx", "ppsm", "potx", "potm", "ppt", "pps",
        "ods", "odp",
        "csv", "tsv", "json", "yaml", "yml", "xml", "log", "ics", "vcf", "eml", "mbox", "mht", "mhtml",
        "jpg", "jpeg", "png", "webp", "gif", "bmp", "svg", "tiff", "tif", "avif", "heic", "heif",
        "xps", "oxps", "wps", "msg", "pst", "ost", "pages", "numbers", "key"
    )

    val BLOCKED_EXTENSIONS = setOf(
        "apk", "jar", "aab", "xapk", "apks", "dex", "exe", "class", "arsc", "so", "dll"
    )

    private val BOOK_ARCHIVE_EXTENSIONS = setOf(
        "epub", "kepub", "pdf", "txt", "html", "htm", "xhtml", "fb2", "fbz", "cbz", "cbr", "cbt", "cb7",
        "mobi", "azw", "azw3", "kf8", "prc", "djvu", "djv", "doc", "docx", "rtf", "odt", "chm", "md", "markdown",
        "xlsx", "xlsm", "xltx", "xltm", "xlsb", "xls",
        "pptx", "pptm", "ppsx", "ppsm", "potx", "potm", "ppt", "pps",
        "ods", "odp",
        "csv", "tsv", "json", "yaml", "yml", "xml", "log", "ics", "vcf", "eml", "mbox", "mht", "mhtml",
        "jpg", "jpeg", "png", "webp", "bmp", "gif", "svg", "tiff", "tif", "avif", "heic", "heif",
        "xps", "oxps", "wps", "msg", "pst", "ost", "pages", "numbers", "key", "zip", "rar", "7z"
    )

    fun isSupported(format: String): Boolean {
        val lower = format.lowercase(Locale.ROOT)
        val normalized = if (lower == "kf8") "azw3" else lower
        return SUPPORTED_FORMATS.contains(normalized)
    }

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
            if (isSupported(ext)) {
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
            if (isSupported(ext)) {
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
            return if (isSupported(ext)) {
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
            val oleFormat = if (setOf("xls", "ppt", "pps", "wps", "msg").contains(ext)) ext else "doc"
            return SniffResult(oleFormat, 0.95f, "Microsoft OLE2 Compound Document (${oleFormat.uppercase(Locale.ROOT)})", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
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

        // 9. Raster Images & Vector Magic Bytes
        // JPEG: FF D8 FF
        if (bytes.size >= 3 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte() && bytes[2] == 0xFF.toByte()) {
            return SniffResult("jpg", 1.0f, "JPEG image signature", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }

        // PNG: 89 50 4E 47 0D 0A 1A 0A
        if (bytes.size >= 8 && bytes[0] == 0x89.toByte() && bytes[1] == 0x50.toByte() && bytes[2] == 0x4E.toByte() && bytes[3] == 0x47.toByte() &&
            bytes[4] == 0x0D.toByte() && bytes[5] == 0x0A.toByte() && bytes[6] == 0x1A.toByte() && bytes[7] == 0x0A.toByte()) {
            return SniffResult("png", 1.0f, "PNG image signature", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }

        // GIF: GIF87a / GIF89a
        if (bytes.size >= 6 && bytes[0] == 0x47.toByte() && bytes[1] == 0x49.toByte() && bytes[2] == 0x46.toByte() && bytes[3] == 0x38.toByte() &&
            (bytes[4] == 0x37.toByte() || bytes[4] == 0x39.toByte()) && bytes[5] == 0x61.toByte()) {
            return SniffResult("gif", 1.0f, "GIF image signature", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }

        // BMP: BM
        if (bytes.size >= 2 && bytes[0] == 0x42.toByte() && bytes[1] == 0x4D.toByte()) {
            return SniffResult("bmp", 1.0f, "BMP image signature", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }

        // TIFF: II*\0 or MM\0*
        if (bytes.size >= 4 && ((bytes[0] == 0x49.toByte() && bytes[1] == 0x49.toByte() && bytes[2] == 0x2A.toByte() && bytes[3] == 0x00.toByte()) ||
            (bytes[0] == 0x4D.toByte() && bytes[1] == 0x4D.toByte() && bytes[2] == 0x00.toByte() && bytes[3] == 0x2A.toByte()))) {
            return SniffResult("tiff", 1.0f, "TIFF image signature", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }

        // WebP: RIFF....WEBP
        if (bytes.size >= 12 && bytes[0] == 0x52.toByte() && bytes[1] == 0x49.toByte() && bytes[2] == 0x46.toByte() && bytes[3] == 0x46.toByte() &&
            bytes[8] == 0x57.toByte() && bytes[9] == 0x45.toByte() && bytes[10] == 0x42.toByte() && bytes[11] == 0x50.toByte()) {
            return SniffResult("webp", 1.0f, "WebP image signature", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }

        // ISOBMFF / AVIF / HEIC / HEIF: ....ftyp
        if (bytes.size >= 12 && bytes[4] == 0x66.toByte() && bytes[5] == 0x74.toByte() && bytes[6] == 0x79.toByte() && bytes[7] == 0x70.toByte()) {
            val brand = String(bytes, 8, 4, Charsets.US_ASCII).lowercase(Locale.ROOT)
            val formatId = when {
                brand.startsWith("avif") || brand.startsWith("avis") || ext == "avif" -> "avif"
                brand.startsWith("heic") || brand.startsWith("heix") || ext == "heic" -> "heic"
                brand.startsWith("mif1") || brand.startsWith("msf1") || ext == "heif" -> "heif"
                else -> if (ext == "avif" || ext == "heic" || ext == "heif") ext else "avif"
            }
            return SniffResult(formatId, 1.0f, "ISOBMFF media container ($brand)", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }

        // 10. ZIP-based containers: PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
        if (bytes[0] == 0x50.toByte() && bytes[1] == 0x4B.toByte() && bytes[2] == 0x03.toByte() && bytes[3] == 0x04.toByte()) {
            return inspectZipContainer(bytes, fallbackFilename, fileSize, supplier, channel)
        }

        // 11. XML / FB2 / HTML / SVG
        val textHead = String(bytes, 0, minOf(bytes.size, 512), Charsets.UTF_8).trim()
        if (textHead.contains("<FictionBook", ignoreCase = true)) {
            return SniffResult("fb2", 0.98f, "FictionBook2 XML root", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }
        if (textHead.contains("<!DOCTYPE html", ignoreCase = true) || textHead.contains("<html", ignoreCase = true)) {
            return SniffResult("html", 0.95f, "HTML document structure", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }
        if (textHead.contains("<svg", ignoreCase = true) || ext == "svg") {
            return SniffResult("svg", 0.95f, "Scalable Vector Graphics (SVG)", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }
        if (ext == "xml" || (textHead.startsWith("<?xml") && !textHead.contains("<FictionBook", ignoreCase = true))) {
            return SniffResult("xml", 0.95f, "XML structured data document", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }

        // 12. Plain Text / Markdown / Code / Structured Text
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
            if (textHead.startsWith("#") || textHead.contains("```") || ext == "md" || ext == "markdown") {
                return SniffResult("md", 0.95f, "Markdown text content", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
            }
            if (ext == "csv") {
                return SniffResult("csv", 0.95f, "Comma-separated values spreadsheet", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
            }
            if (ext == "tsv") {
                return SniffResult("tsv", 0.95f, "Tab-separated values spreadsheet", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
            }
            if (ext == "json" || textHead.startsWith("{") || textHead.startsWith("[")) {
                return SniffResult("json", 0.95f, "JSON structured document", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
            }
            if (ext == "yaml" || ext == "yml" || textHead.startsWith("---")) {
                return SniffResult("yaml", 0.95f, "YAML structured document", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
            }
            if (ext == "ics" || textHead.contains("BEGIN:VCALENDAR")) {
                return SniffResult("ics", 0.95f, "iCalendar appointment document", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
            }
            if (ext == "vcf" || textHead.contains("BEGIN:VCARD")) {
                return SniffResult("vcf", 0.95f, "vCard electronic business card", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
            }
            if (ext == "log") {
                return SniffResult("log", 0.95f, "Log file document", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
            }
            if (ext == "eml" || ext == "mbox" || ext == "mht" || ext == "mhtml" || textHead.contains("MIME-Version:") || textHead.contains("From:")) {
                val emailExt = if (ext.isNotBlank()) ext else "eml"
                return SniffResult(emailExt, 0.95f, "Email or web archive message ($emailExt)", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
            }
            if (isSupported(ext)) {
                return SniffResult(ext, 0.9f, "Text document matched by extension ($ext)", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
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

        val resolvedExt = if (ext == "kf8") "azw3" else ext
        if (isSupported(resolvedExt)) {
            return SniffResult(resolvedExt, 0.6f, "Matched by supported format extension ($resolvedExt)", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "book")
        }

        return SniffResult("unknown", 0.0f, "Unrecognized binary header or format", quickFp = computeQuickFingerprint(fileSize, bytes, null), kind = "blocked")
    }

    /**
     * Inspects ZIP-based containers using central directory records.
     */
    private fun inspectZipContainer(
        headBytes: ByteArray,
        fallbackFilename: String?,
        fileSize: Long,
        supplier: (() -> InputStream?)?,
        channel: FileChannel?
    ): SniffResult {
        val quickFp = computeQuickFingerprint(fileSize, headBytes, null)

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
    private fun readCentralDirectory(channel: FileChannel): List<ZipEntryMeta> {
        val size = channel.size()
        if (size < 22) return emptyList()

        val searchSize = minOf(size, 65536L + 22L).toInt()
        val searchBuf = ByteBuffer.allocate(searchSize).order(ByteOrder.LITTLE_ENDIAN)
        channel.position(size - searchSize)
        channel.read(searchBuf)
        searchBuf.flip()

        var eocdOffset = -1
        for (i in (searchSize - 22) downTo 0) {
            if (searchBuf.getInt(i) == 0x06054b50) {
                eocdOffset = i
                break
            }
        }
        if (eocdOffset == -1) return emptyList()

        searchBuf.position(eocdOffset)
        searchBuf.getInt() // signature
        searchBuf.getShort() // disk
        searchBuf.getShort() // cd disk
        val entriesOnDisk = searchBuf.getShort().toInt() and 0xFFFF
        val totalEntries = searchBuf.getShort().toInt() and 0xFFFF
        val cdSize = searchBuf.getInt().toLong() and 0xFFFFFFFFL
        val cdOffset = searchBuf.getInt().toLong() and 0xFFFFFFFFL

        val entries = ArrayList<ZipEntryMeta>(minOf(totalEntries, 500))
        val cdBuf = ByteBuffer.allocate(minOf(cdSize.toInt(), 500 * 1024)).order(ByteOrder.LITTLE_ENDIAN)
        channel.position(cdOffset)
        channel.read(cdBuf)
        cdBuf.flip()

        var count = 0
        while (cdBuf.remaining() >= 46 && count < 500) {
            val sig = cdBuf.getInt()
            if (sig != 0x02014b50) break

            cdBuf.getShort() // version made by
            cdBuf.getShort() // version needed
            val flags = cdBuf.getShort().toInt() and 0xFFFF
            val isEncrypted = (flags and 1) != 0
            val method = cdBuf.getShort().toInt() and 0xFFFF
            cdBuf.getInt() // time
            cdBuf.getInt() // crc32
            val cSize = cdBuf.getInt().toLong() and 0xFFFFFFFFL
            val uSize = cdBuf.getInt().toLong() and 0xFFFFFFFFL
            val nameLen = cdBuf.getShort().toInt() and 0xFFFF
            val extraLen = cdBuf.getShort().toInt() and 0xFFFF
            val commentLen = cdBuf.getShort().toInt() and 0xFFFF
            cdBuf.getShort() // disk start
            cdBuf.getShort() // int attrs
            cdBuf.getInt() // ext attrs
            cdBuf.getInt() // local header offset

            val nameBytes = ByteArray(nameLen)
            cdBuf.get(nameBytes)
            val name = String(nameBytes, Charsets.UTF_8)
            val isDir = name.endsWith("/") || name.endsWith("\\")

            if (extraLen > 0) cdBuf.position(cdBuf.position() + extraLen)
            if (commentLen > 0) cdBuf.position(cdBuf.position() + commentLen)

            entries.add(ZipEntryMeta(name, isDir, isEncrypted, uSize, cSize))
            count++
        }
        return entries
    }

    private fun readZipEntriesFromStream(supplier: (() -> InputStream?)?): List<ZipEntryMeta> {
        if (supplier == null) return emptyList()
        val list = ArrayList<ZipEntryMeta>()
        try {
            supplier()?.use { raw ->
                ZipInputStream(raw).use { zis ->
                    var count = 0
                    while (count < 300) {
                        val entry = zis.nextEntry ?: break
                        val name = entry.name
                        val isDir = entry.isDirectory || name.endsWith("/") || name.endsWith("\\")
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

        // 1. EPUB / KEPUB
        val hasContainerXml = namesLower.any { it.replace('\\', '/').contains("meta-inf/container.xml") }
        val hasMimetypeEpub = entries.any { it.name.trim().equals("mimetype", ignoreCase = true) }
        if (hasMimetypeEpub || hasContainerXml || ext == "epub" || ext == "kepub") {
            val drmInfo = if (hasContainerXml || hasMimetypeEpub) checkEpubDrm(supplier) else Pair(false, null)
            val formatId = if (ext == "kepub" || fallbackFilename?.lowercase(Locale.ROOT)?.contains(".kepub.epub") == true) "kepub" else "epub"
            return SniffResult(
                format = formatId,
                confidence = if (hasContainerXml || hasMimetypeEpub) 1.0f else 0.85f,
                reason = if (hasMimetypeEpub) "EPUB mimetype entry" else if (hasContainerXml) "EPUB container.xml present" else "EPUB matched by file extension",
                isDrm = drmInfo.first,
                drmReason = drmInfo.second,
                quickFp = quickFp,
                kind = "book"
            )
        }

        // 2. Office Open XML (DOCX, XLSX, PPTX, etc.)
        val hasContentTypes = namesLower.any { it == "[content_types].xml" }

        val hasWordDoc = namesLower.any { it.startsWith("word/document.xml") }
        if (hasWordDoc && hasContentTypes) {
            return SniffResult("docx", 0.98f, "DOCX WordprocessingML package", quickFp = quickFp, kind = "book")
        }

        val hasXlsxWb = namesLower.any { it == "xl/workbook.xml" }
        val hasXlsbWb = namesLower.any { it == "xl/workbook.bin" }
        if (hasXlsbWb && hasContentTypes) {
            return SniffResult("xlsb", 0.98f, "Excel Binary Workbook (.xlsb)", quickFp = quickFp, kind = "book")
        }
        if (hasXlsxWb && hasContentTypes) {
            val xlsxExt = if (ext == "xlsm" || ext == "xltx" || ext == "xltm") ext else "xlsx"
            return SniffResult(xlsxExt, 0.98f, "Excel OpenXML Workbook (.$xlsxExt)", quickFp = quickFp, kind = "book")
        }

        val hasPptxPresentation = namesLower.any { it.startsWith("ppt/presentation.xml") }
        if (hasPptxPresentation && hasContentTypes) {
            val pptxExt = if (ext == "ppsx" || ext == "pptm" || ext == "ppsm" || ext == "potx" || ext == "potm") ext else "pptx"
            return SniffResult(pptxExt, 0.98f, "PowerPoint OpenXML Presentation (.$pptxExt)", quickFp = quickFp, kind = "book")
        }

        // 3. OpenDocument (ODT, ODS, ODP)
        val hasContentXml = namesLower.any { it == "content.xml" }
        if (hasContentXml) {
            if (ext == "ods" || namesLower.any { it.contains("application/vnd.oasis.opendocument.spreadsheet") }) {
                return SniffResult("ods", 0.98f, "ODS spreadsheet package", quickFp = quickFp, kind = "book")
            }
            if (ext == "odp" || namesLower.any { it.contains("application/vnd.oasis.opendocument.presentation") }) {
                return SniffResult("odp", 0.98f, "ODP presentation package", quickFp = quickFp, kind = "book")
            }
            if (ext == "odt" || namesLower.any { it == "mimetype" }) {
                return SniffResult("odt", 0.98f, "ODT document package", quickFp = quickFp, kind = "book")
            }
        }

        // 4. XPS / OpenXPS
        val hasFixedDocSeq = namesLower.any { it.contains("fixeddocumentsequence.fdseq") }
        if (hasFixedDocSeq && hasContentTypes) {
            val xpsExt = if (ext == "oxps") "oxps" else "xps"
            return SniffResult(xpsExt, 0.98f, "XML Paper Specification (.$xpsExt)", quickFp = quickFp, kind = "book")
        }

        // 5. Android/Java packages -> blocked:app-package
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

        // 6. FB2: .fb2 XML inside single-entry zip (or filename .fb2.zip)
        val nonDirEntries = entries.filter { !it.isDirectory }
        val fb2Entries = nonDirEntries.filter { it.name.lowercase(Locale.ROOT).endsWith(".fb2") }
        val isFbz = fallbackFilename?.lowercase(Locale.ROOT)?.endsWith(".fbz") == true
        val isFb2ZipName = fallbackFilename?.lowercase(Locale.ROOT)?.endsWith(".fb2.zip") == true || isFbz
        if (fb2Entries.size == 1 && (nonDirEntries.size == 1 || isFb2ZipName)) {
            val formatId = if (isFbz) "fbz" else "fb2"
            return SniffResult(formatId, 0.98f, "Single FictionBook FB2 inside archive", quickFp = quickFp, kind = "book")
        }

        // 7. CBZ: All (or >= 90%) of entries are images after ignoring ComicInfo.xml, Thumbs.db, .DS_Store, __MACOSX/, *.txt|nfo
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

        // 8. ARCHIVE_CONTAINER: Archive contains >= 1 entry whose extension is a supported book format
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

        // If extension is a known supported format that happens to be ZIP-based
        if (isSupported(ext)) {
            return SniffResult(
                format = ext,
                confidence = 0.85f,
                reason = "ZIP package matched by supported format extension (.$ext)",
                quickFp = quickFp,
                kind = "book"
            )
        }

        return SniffResult(
            format = "unknown",
            confidence = 0.0f,
            reason = "ZIP archive with no supported books inside",
            quickFp = quickFp,
            kind = "blocked"
        )
    }

    private fun checkEpubDrm(supplier: (() -> InputStream?)?): Pair<Boolean, String?> {
        if (supplier == null) return Pair(false, null)
        return try {
            supplier()?.use { stream ->
                ZipInputStream(stream).use { zis ->
                    var count = 0
                    while (count < 200) {
                        val entry = zis.nextEntry ?: break
                        val nameLower = entry.name.lowercase(Locale.ROOT)
                        if (nameLower.contains("meta-inf/rights.xml")) {
                            return Pair(true, "Adobe ADEPT DRM (rights.xml present)")
                        }
                        if (nameLower.contains("meta-inf/encryption.xml")) {
                            val encBytes = readSample(zis, 2048)
                            val encText = String(encBytes, Charsets.UTF_8)
                            if (encText.contains("http://ns.adobe.com/adept")) {
                                return Pair(true, "Adobe ADEPT DRM encryption record")
                            }
                            if (encText.contains("http://www.idpf.org/2008/embedding") ||
                                encText.contains("http://www.w3.org/2001/04/xmlenc#")
                            ) {
                                // Standard font obfuscation or content encryption
                            }
                        }
                        count++
                    }
                    Pair(false, null)
                }
            } ?: Pair(false, null)
        } catch (_: Exception) {
            Pair(false, null)
        }
    }

    private fun getExt(name: String?): String {
        if (name == null) return ""
        val lastDot = name.lastIndexOf('.')
        return if (lastDot >= 0 && lastDot < name.length - 1) {
            name.substring(lastDot + 1).lowercase(Locale.ROOT)
        } else {
            ""
        }
    }

    private fun indexOfSequence(haystack: ByteArray, needle: ByteArray, maxScan: Int): Int {
        val limit = minOf(haystack.size - needle.size, maxScan)
        for (i in 0..limit) {
            var found = true
            for (j in needle.indices) {
                if (haystack[i + j] != needle[j]) {
                    found = false
                    break
                }
            }
            if (found) return i
        }
        return -1
    }
}
