package com.lirune.reader.storage

import android.content.Context
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.FileInputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.channels.FileChannel
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

data class SessionHandle(
    val handleId: String,
    val pathOrUri: String,
    val size: Long,
    val seekable: Boolean,
    val channel: FileChannel?,
    val pfd: ParcelFileDescriptor?,
    val raf: RandomAccessFile?
)

class BookSessionManager(private val context: Context) {

    private val sessions = ConcurrentHashMap<String, SessionHandle>()

    /**
     * Opens a book for random-access reading without loading into memory.
     */
    fun openSession(pathOrUri: String): SessionHandle {
        val handleId = UUID.randomUUID().toString()
        val uri = Uri.parse(pathOrUri)

        if (pathOrUri.startsWith("file://") || pathOrUri.startsWith("/")) {
            val path = if (pathOrUri.startsWith("file://")) uri.path ?: pathOrUri.removePrefix("file://") else pathOrUri
            val file = File(path)
            if (!file.exists()) {
                throw IllegalArgumentException("File not found: $pathOrUri")
            }
            val raf = RandomAccessFile(file, "r")
            val channel = raf.channel
            val session = SessionHandle(
                handleId = handleId,
                pathOrUri = pathOrUri,
                size = file.length(),
                seekable = true,
                channel = channel,
                pfd = null,
                raf = raf
            )
            sessions[handleId] = session
            return session
        } else {
            val pfd = context.contentResolver.openFileDescriptor(uri, "r")
                ?: throw IllegalArgumentException("Cannot open file descriptor for: $pathOrUri")
            val size = pfd.statSize
            val fis = FileInputStream(pfd.fileDescriptor)
            val channel = fis.channel
            val session = SessionHandle(
                handleId = handleId,
                pathOrUri = pathOrUri,
                size = size,
                seekable = size >= 0,
                channel = channel,
                pfd = pfd,
                raf = null
            )
            sessions[handleId] = session
            return session
        }
    }

    /**
     * Reads a slice of bytes at offset.
     */
    fun readBytes(handleId: String, offset: Long, length: Int): ByteArray {
        val session = sessions[handleId] ?: throw IllegalArgumentException("Invalid session handle: $handleId")
        val channel = session.channel ?: throw IllegalStateException("Session channel is null")

        val safeLength = length.coerceAtLeast(0).coerceAtMost(10 * 1024 * 1024) // 10 MB cap per read
        val buffer = ByteBuffer.allocate(safeLength)

        var totalRead = 0
        var currentOffset = offset

        while (totalRead < safeLength) {
            val bytesRead = channel.read(buffer, currentOffset)
            if (bytesRead <= 0) break
            totalRead += bytesRead
            currentOffset += bytesRead
        }

        return if (totalRead == safeLength) {
            buffer.array()
        } else {
            buffer.array().copyOf(totalRead)
        }
    }

    /**
     * Closes the session and releases native file descriptors.
     */
    fun closeSession(handleId: String) {
        sessions.remove(handleId)?.let { session ->
            try { session.channel?.close() } catch (_: Exception) {}
            try { session.raf?.close() } catch (_: Exception) {}
            try { session.pfd?.close() } catch (_: Exception) {}
        }
    }

    fun closeAll() {
        for (handleId in sessions.keys) {
            closeSession(handleId)
        }
    }
}
