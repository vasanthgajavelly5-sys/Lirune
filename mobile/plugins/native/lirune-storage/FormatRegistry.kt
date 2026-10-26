package com.lirune.reader.storage

import android.content.Context
import android.net.Uri
import java.io.File
import java.io.InputStream
import java.security.MessageDigest
import java.util.Locale
import java.util.zip.ZipInputStream

data class SniffResult(
    val format: String,
    val confidence: Float,
    val reason: String,
    val isDrm: Boolean = false,
    val drmReason: String? = null,
    val quickFp: String? = null
)

object FormatRegistry {

    private val SUPPORTED_FORMATS = setOf(
        "epub", "pdf", "txt", "html", "fb2", "cbz", "cbr", "cb7",
        "mobi", "azw", "azw3", "djvu", "doc", "docx", "rtf", "odt", "chm"
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
     * Inspects content-based magic bytes and container internals to identify format and DRM.
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

            sniffBytes(sample, fallbackFilename, fileSize, supplier = { resolver.openInputStream(uri) })
        } catch (e: Exception) {
            val ext = getExt(fallbackFilename)
            if (SUPPORTED_FORMATS.contains(ext)) {
                SniffResult(ext, 0.4f, "Fallback by extension after read error: ${e.message}")
            } else {
                SniffResult("unknown", 0.0f, "Failed to read file: ${e.message}")
            }
        }
    }

    fun sniffFile(file: File, fallbackFilename: String? = null): SniffResult {
        return try {
            val sample = file.inputStream().use { stream ->
                readSample(stream, 4096)
            }
            sniffBytes(sample, fallbackFilename ?: file.name, file.length(), supplier = { file.inputStream() })
        } catch (e: Exception) {
            val ext = getExt(fallbackFilename ?: file.name)
            if (SUPPORTED_FORMATS.contains(ext)) {
                SniffResult(ext, 0.4f, "Fallback by extension: ${e.message}")
            } else {
                SniffResult("unknown", 0.0f, "Failed to read file: ${e.message}")
            }
        }
    }

    fun sniffBytes(
        bytes: ByteArray,
        fallbackFilename: String?,
        fileSize: Long,
        supplier: (() -> InputStream?)? = null
    ): SniffResult {
        val ext = getExt(fallbackFilename)
        if (bytes.size < 4) {
            return if (SUPPORTED_FORMATS.contains(ext)) {
                SniffResult(ext, 0.5f, "File too small for header inspection; matched by extension")
            } else {
                SniffResult("unknown", 0.0f, "File smaller than 4 bytes and unrecognized")
            }
        }

        // 1. PDF: %PDF- (0x25, 0x50, 0x44, 0x46) within first 1024 bytes
        val pdfIndex = indexOfSequence(bytes, byteArrayOf(0x25, 0x50, 0x44, 0x46), 1024)
        if (pdfIndex >= 0) {
            // Check DRM / Encrypted PDF
            val sampleString = String(bytes, 0, minOf(bytes.size, 4096), Charsets.ISO_8859_1)
            val hasEncrypt = sampleString.contains("/Encrypt")
            val quickFp = computeQuickFingerprint(fileSize, bytes, null)
            return if (hasEncrypt) {
                SniffResult("pdf", 1.0f, "Encrypted PDF container", isDrm = true, drmReason = "PDF has standard encryption (/Encrypt)", quickFp = quickFp)
            } else {
                SniffResult("pdf", 1.0f, "Valid PDF header magic bytes", quickFp = quickFp)
            }
        }

        // 2. RTF: {\rtf (0x7B, 0x5C, 0x72, 0x74, 0x66)
        if (bytes.size >= 5 && bytes[0] == 0x7B.toByte() && bytes[1] == 0x5C.toByte() &&
            bytes[2] == 0x72.toByte() && bytes[3] == 0x74.toByte() && bytes[4] == 0x66.toByte()
        ) {
            return SniffResult("rtf", 1.0f, "Valid RTF header", quickFp = computeQuickFingerprint(fileSize, bytes, null))
        }

        // 3. RAR / CBR: Rar!\x1A\x07 (0x52, 0x61, 0x72, 0x21, 0x1A, 0x07)
        if (bytes.size >= 6 && bytes[0] == 0x52.toByte() && bytes[1] == 0x61.toByte() &&
            bytes[2] == 0x72.toByte() && bytes[3] == 0x21.toByte() && bytes[4] == 0x1A.toByte() && bytes[5] == 0x07.toByte()
        ) {
            return SniffResult("cbr", 0.95f, "Valid RAR archive comic container", quickFp = computeQuickFingerprint(fileSize, bytes, null))
        }

        // 4. 7z / CB7: 7z\xBC\xAF\x27\x1C (0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C)
        if (bytes.size >= 6 && bytes[0] == 0x37.toByte() && bytes[1] == 0x7A.toByte() &&
            bytes[2] == 0xBC.toByte() && bytes[3] == 0xAF.toByte() && bytes[4] == 0x27.toByte() && bytes[5] == 0x1C.toByte()
        ) {
            val format = if (ext == "cb7") "cb7" else "cb7"
            return SniffResult(format, 0.95f, "Valid 7-Zip comic container", quickFp = computeQuickFingerprint(fileSize, bytes, null))
        }

        // 5. CHM: ITSF (0x49, 0x54, 0x53, 0x46)
        if (bytes[0] == 0x49.toByte() && bytes[1] == 0x54.toByte() && bytes[2] == 0x53.toByte() && bytes[3] == 0x46.toByte()) {
            return SniffResult("chm", 1.0f, "Valid CHM ITSF header", quickFp = computeQuickFingerprint(fileSize, bytes, null))
        }

        // 6. DjVu: AT&T (0x41, 0x54, 0x26, 0x54) + FORM
        if (bytes.size >= 12 && bytes[0] == 0x41.toByte() && bytes[1] == 0x54.toByte() &&
            bytes[2] == 0x26.toByte() && bytes[3] == 0x54.toByte() && bytes[4] == 0x46.toByte() &&
            bytes[5] == 0x4F.toByte() && bytes[6] == 0x52.toByte() && bytes[7] == 0x4D.toByte()
        ) {
            return SniffResult("djvu", 1.0f, "Valid DjVu AT&T FORM header", quickFp = computeQuickFingerprint(fileSize, bytes, null))
        }

        // 7. Microsoft Compound Document (DOC / OLE2): 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1
        if (bytes.size >= 8 &&
            bytes[0] == 0xD0.toByte() && bytes[1] == 0xCF.toByte() && bytes[2] == 0x11.toByte() && bytes[3] == 0xE0.toByte() &&
            bytes[4] == 0xA1.toByte() && bytes[5] == 0xB1.toByte() && bytes[6] == 0x1A.toByte() && bytes[7] == 0xE1.toByte()
        ) {
            return SniffResult("doc", 0.95f, "Microsoft OLE2 Compound Document (DOC)", quickFp = computeQuickFingerprint(fileSize, bytes, null))
        }

        // 8. Palm Database / MOBI / AZW / AZW3: Check for "BOOKMOBI" or "TEXtREAd" at offset 60..67
        if (bytes.size >= 68) {
            val magic = String(bytes, 60, 8, Charsets.US_ASCII)
            if (magic == "BOOKMOBI" || magic == "TEXtREAd") {
                // Check encryption flag in MOBI header (MOBI header starts at offset within PalmDOC)
                var isDrm = false
                var drmReason: String? = null
                var isKf8 = ext == "azw3" || ext == "kf8"

                // Check MOBI encryption type: PalmDOC header is at offset 78. Encryption type is at offset 78 + 0 or MOBI header offset
                if (bytes.size >= 80) {
                    val encryptionType = ((bytes[78].toInt() and 0xFF) shl 8) or (bytes[79].toInt() and 0xFF)
                    if (encryptionType != 0) {
                        isDrm = true
                        drmReason = "MOBI / Kindle DRM encryption type $encryptionType"
                    }
                }

                // Check for KF8 flag in EXTH header
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
                    quickFp = computeQuickFingerprint(fileSize, bytes, null)
                )
            }
        }

        // 9. ZIP-based containers: PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
        if (bytes[0] == 0x50.toByte() && bytes[1] == 0x4B.toByte() && bytes[2] == 0x03.toByte() && bytes[3] == 0x04.toByte()) {
            return inspectZipContainer(bytes, fallbackFilename, fileSize, supplier)
        }

        // 10. XML / FB2 / HTML
        val textHead = String(bytes, 0, minOf(bytes.size, 512), Charsets.UTF_8).trim()
        if (textHead.contains("<FictionBook", ignoreCase = true)) {
            return SniffResult("fb2", 0.98f, "FictionBook2 XML root", quickFp = computeQuickFingerprint(fileSize, bytes, null))
        }
        if (textHead.contains("<!DOCTYPE html", ignoreCase = true) || textHead.contains("<html", ignoreCase = true)) {
            return SniffResult("html", 0.95f, "HTML document structure", quickFp = computeQuickFingerprint(fileSize, bytes, null))
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
            // Text or HTML or Markdown
            if (ext == "html" || ext == "htm" || ext == "xhtml") {
                return SniffResult("html", 0.9f, "HTML extension with text content", quickFp = computeQuickFingerprint(fileSize, bytes, null))
            }
            if (textHead.startsWith("#") || textHead.contains("```") || ext == "md") {
                return SniffResult("txt", 0.9f, "Markdown text content", quickFp = computeQuickFingerprint(fileSize, bytes, null))
            }
            return SniffResult("txt", 0.85f, "Valid plain text content without null bytes", quickFp = computeQuickFingerprint(fileSize, bytes, null))
        }

        // If binary and extension matches a supported format, low confidence fallback
        if (SUPPORTED_FORMATS.contains(ext)) {
            return SniffResult(ext, 0.4f, "Extension match only; binary signatures did not match", quickFp = computeQuickFingerprint(fileSize, bytes, null))
        }

        return SniffResult("unknown", 0.0f, "Unrecognized binary header or format", quickFp = computeQuickFingerprint(fileSize, bytes, null))
    }

    /**
     * Inspects ZIP-based publications (EPUB, CBZ, DOCX, ODT, FB2.ZIP).
     */
    private fun inspectZipContainer(
        headBytes: ByteArray,
        fallbackFilename: String?,
        fileSize: Long,
        supplier: (() -> InputStream?)?
    ): SniffResult {
        val quickFp = computeQuickFingerprint(fileSize, headBytes, null)
        val ext = getExt(fallbackFilename)

        // Cheap pass: search first 2048 bytes
        val headStr = String(headBytes, 0, minOf(headBytes.size, 2048), Charsets.ISO_8859_1)
        if (headStr.contains("mimetypeapplication/epub+zip") || headStr.contains("META-INF/container.xml")) {
            val drmInfo = checkEpubDrm(supplier)
            return SniffResult("epub", 1.0f, "EPUB mimetype/container header", isDrm = drmInfo.first, drmReason = drmInfo.second, quickFp = quickFp)
        }
        if (headStr.contains("mimetypeapplication/vnd.oasis.opendocument.text")) {
            return SniffResult("odt", 1.0f, "ODT document mimetype", quickFp = quickFp)
        }
        if (headStr.contains("word/") || headStr.contains("[Content_Types].xml")) {
            return SniffResult("docx", 0.95f, "DOCX WordprocessingML package", quickFp = quickFp)
        }
        if (headStr.contains("ComicInfo.xml")) {
            return SniffResult("cbz", 0.98f, "CBZ ComicInfo metadata entry", quickFp = quickFp)
        }

        // Deeper pass: stream first entries of ZIP if supplier provided
        if (supplier != null) {
            try {
                supplier()?.use { raw ->
                    ZipInputStream(raw).use { zis ->
                        var entryCount = 0
                        var onlyImages = true
                        var hasFb2 = false
                        var hasEpubContainer = false
                        var hasWordDoc = false
                        var hasOdt = false

                        while (entryCount < 50) {
                            val entry = zis.nextEntry ?: break
                            val name = entry.name
                            val nameLower = name.lowercase(Locale.ROOT)

                            if (nameLower.contains("meta-inf/container.xml") || nameLower == "mimetype") {
                                if (nameLower == "mimetype") {
                                    val content = readSample(zis, 128)
                                    val mime = String(content, Charsets.US_ASCII).trim()
                                    if (mime == "application/epub+zip") {
                                        val drmInfo = checkEpubDrm(supplier)
                                        return SniffResult("epub", 1.0f, "EPUB mimetype entry", isDrm = drmInfo.first, drmReason = drmInfo.second, quickFp = quickFp)
                                    }
                                    if (mime == "application/vnd.oasis.opendocument.text") {
                                        return SniffResult("odt", 1.0f, "ODT mimetype entry", quickFp = quickFp)
                                    }
                                }
                                hasEpubContainer = true
                            }
                            if (nameLower.endsWith(".fb2")) hasFb2 = true
                            if (nameLower.startsWith("word/document.xml")) hasWordDoc = true
                            if (nameLower == "content.xml") hasOdt = true

                            val isImage = nameLower.endsWith(".jpg") || nameLower.endsWith(".jpeg") ||
                                    nameLower.endsWith(".png") || nameLower.endsWith(".webp") ||
                                    nameLower.endsWith(".gif") || nameLower.endsWith(".avif") ||
                                    nameLower.endsWith("comicinfo.xml") || entry.isDirectory

                            if (!isImage) {
                                onlyImages = false
                            }
                            entryCount++
                        }

                        if (hasEpubContainer) {
                            val drmInfo = checkEpubDrm(supplier)
                            return SniffResult("epub", 0.98f, "EPUB container.xml present", isDrm = drmInfo.first, drmReason = drmInfo.second, quickFp = quickFp)
                        }
                        if (hasWordDoc) return SniffResult("docx", 0.95f, "DOCX document.xml present", quickFp = quickFp)
                        if (hasOdt) return SniffResult("odt", 0.95f, "ODT content.xml present", quickFp = quickFp)
                        if (hasFb2) return SniffResult("fb2", 0.95f, "FB2 archive container", quickFp = quickFp)
                        if (onlyImages && entryCount > 0) return SniffResult("cbz", 0.95f, "CBZ image archive container", quickFp = quickFp)
                    }
                }
            } catch (_: Exception) {}
        }

        // Extension tie-breaker for ambiguous ZIP
        return when (ext) {
            "epub" -> {
                val drmInfo = checkEpubDrm(supplier)
                SniffResult("epub", 0.85f, "ZIP container with .epub extension", isDrm = drmInfo.first, drmReason = drmInfo.second, quickFp = quickFp)
            }
            "cbz" -> SniffResult("cbz", 0.85f, "ZIP container with .cbz extension", quickFp = quickFp)
            "docx" -> SniffResult("docx", 0.85f, "ZIP container with .docx extension", quickFp = quickFp)
            "odt" -> SniffResult("odt", 0.85f, "ZIP container with .odt extension", quickFp = quickFp)
            else -> SniffResult("cbz", 0.5f, "ZIP archive treated as comic container", quickFp = quickFp)
        }
    }

    /**
     * Checks EPUB DRM algorithms in encryption.xml and rights.xml
     */
    private fun checkEpubDrm(supplier: (() -> InputStream?)?): Pair<Boolean, String?> {
        if (supplier == null) return Pair(false, null)
        try {
            supplier()?.use { stream ->
                ZipInputStream(stream).use { zis ->
                    while (true) {
                        val entry = zis.nextEntry ?: break
                        val name = entry.name.lowercase(Locale.ROOT)
                        if (name == "meta-inf/rights.xml") {
                            return Pair(true, "Adobe ADEPT DRM rights.xml found")
                        }
                        if (name == "meta-inf/encryption.xml") {
                            val bytes = readSample(zis, 8192)
                            val xml = String(bytes, Charsets.UTF_8)
                            // IDPF font obfuscation algorithms are allowed
                            val isFontObfuscation = xml.contains("http://www.idpf.org/2008/embedding") ||
                                    xml.contains("http://ns.adobe.com/pdf/enc#RC")
                            val hasCipherData = xml.contains("<CipherData") || xml.contains("<EncryptedData")
                            if (hasCipherData && !isFontObfuscation) {
                                return Pair(true, "EPUB encryption.xml contains DRM encryption algorithm")
                            }
                        }
                    }
                }
            }
        } catch (_: Exception) {}
        return Pair(false, null)
    }

    private fun indexOfSequence(src: ByteArray, target: ByteArray, maxLimit: Int): Int {
        val limit = minOf(src.size - target.size, maxLimit)
        for (i in 0..limit) {
            var match = true
            for (j in target.indices) {
                if (src[i + j] != target[j]) {
                    match = false
                    break
                }
            }
            if (match) return i
        }
        return -1
    }

    private fun getExt(name: String?): String {
        if (name.isNullOrBlank()) return ""
        val idx = name.lastIndexOf('.')
        return if (idx >= 0 && idx < name.length - 1) {
            name.substring(idx + 1).lowercase(Locale.ROOT)
        } else ""
    }
}
