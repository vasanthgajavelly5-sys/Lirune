package com.lirune.reader.storage

import java.io.*
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class ResourceServer(private val sessionManager: BookSessionManager) {

    private var serverSocket: ServerSocket? = null
    private val isRunning = AtomicBoolean(false)
    private val threadPool = Executors.newCachedThreadPool()
    var port: Int = 0
        private set

    fun start() {
        if (isRunning.get()) return
        try {
            val socket = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
            serverSocket = socket
            port = socket.localPort
            isRunning.set(true)

            threadPool.execute {
                while (isRunning.get() && !socket.isClosed) {
                    try {
                        val client = socket.accept()
                        threadPool.execute { handleClient(client) }
                    } catch (_: Exception) {
                        break
                    }
                }
            }
        } catch (_: Exception) {}
    }

    fun stop() {
        isRunning.set(false)
        try { serverSocket?.close() } catch (_: Exception) {}
    }

    private fun handleClient(client: Socket) {
        try {
            client.use { s ->
                val reader = BufferedReader(InputStreamReader(s.getInputStream()))
                val out = BufferedOutputStream(s.getOutputStream())

                val requestLine = reader.readLine() ?: return
                val parts = requestLine.split(" ")
                if (parts.size < 2) return

                val method = parts[0]
                val path = parts[1] // e.g., /book/<handleId>

                var rangeHeader: String? = null
                var line = reader.readLine()
                while (!line.isNullOrBlank()) {
                    if (line.startsWith("Range:", ignoreCase = true)) {
                        rangeHeader = line.substring(6).trim()
                    }
                    line = reader.readLine()
                }

                if (!path.startsWith("/book/")) {
                    send404(out)
                    return
                }

                val handleId = path.removePrefix("/book/").substringBefore("?")
                serveRange(out, handleId, rangeHeader, method == "HEAD")
            }
        } catch (_: Exception) {}
    }

    private fun serveRange(out: OutputStream, handleId: String, rangeHeader: String?, isHead: Boolean) {
        val bytes: ByteArray
        try {
            // Read 2MB or requested range chunk
            if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
                val range = rangeHeader.removePrefix("bytes=").trim()
                val rParts = range.split("-")
                val start = rParts[0].toLongOrNull() ?: 0L
                val end = if (rParts.size > 1 && rParts[1].isNotBlank()) rParts[1].toLongOrNull() else null

                val chunkSize = if (end != null) (end - start + 1).toInt().coerceAtMost(2 * 1024 * 1024) else 1024 * 1024
                bytes = sessionManager.readBytes(handleId, start, chunkSize)

                val effectiveEnd = start + bytes.size - 1
                val headers = "HTTP/1.1 206 Partial Content\r\n" +
                        "Content-Type: application/octet-stream\r\n" +
                        "Accept-Ranges: bytes\r\n" +
                        "Content-Range: bytes $start-$effectiveEnd/*\r\n" +
                        "Content-Length: ${bytes.size}\r\n" +
                        "Connection: close\r\n" +
                        "\r\n"

                out.write(headers.toByteArray(Charsets.US_ASCII))
                if (!isHead) {
                    out.write(bytes)
                }
                out.flush()
                return
            }

            // Normal GET without range: stream first 1 MB with Accept-Ranges header
            bytes = sessionManager.readBytes(handleId, 0L, 1024 * 1024)
            val headers = "HTTP/1.1 200 OK\r\n" +
                    "Content-Type: application/octet-stream\r\n" +
                    "Accept-Ranges: bytes\r\n" +
                    "Content-Length: ${bytes.size}\r\n" +
                    "Connection: close\r\n" +
                    "\r\n"

            out.write(headers.toByteArray(Charsets.US_ASCII))
            if (!isHead) {
                out.write(bytes)
            }
            out.flush()
        } catch (e: Exception) {
            send404(out)
        }
    }

    private fun send404(out: OutputStream) {
        try {
            val response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            out.write(response.toByteArray(Charsets.US_ASCII))
            out.flush()
        } catch (_: Exception) {}
    }
}
