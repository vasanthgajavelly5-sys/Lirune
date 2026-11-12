package com.lirune.reader.storage

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.UriPermission
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.storage.StorageManager
import android.os.storage.StorageVolume
import android.provider.DocumentsContract
import java.io.File
import java.util.concurrent.ConcurrentHashMap

data class VolumeInfo(
    val id: String,
    val label: String,
    val isRemovable: Boolean,
    val freeBytes: Long,
    val totalBytes: Long,
    val isPrimary: Boolean,
    val path: String?
)

data class GrantValidationResult(
    val validUris: List<String>,
    val revokedUris: List<String>
)

class SourceManager(private val context: Context) {

    private val contentResolver = context.contentResolver
    private val activeObservers = ConcurrentHashMap<String, ContentObserver>()

    /**
     * Max persisted grants allowed by Android SAF:
     * 128 on API <= 30 (Android 11 and below)
     * 512 on API >= 31 (Android 12+)
     */
    val maxPersistedGrants: Int
        get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) 512 else 128

    /**
     * Takes persistable read URI permission safely.
     */
    fun takePersistableGrant(uri: Uri): Boolean {
        return try {
            pruneIfApproachingLimit()
            contentResolver.takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            )
            true
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Releases a persistable read URI permission.
     */
    fun releasePersistableGrant(uri: Uri): Boolean {
        return try {
            contentResolver.releasePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            )
            true
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Validates stored URIs against active ContentResolver persisted grants.
     */
    fun validatePersistedGrants(knownUris: List<String>): GrantValidationResult {
        val activeGrants = contentResolver.persistedUriPermissions
        val activeUriStrings = activeGrants.map { it.uri.toString() }.toSet()

        val valid = ArrayList<String>()
        val revoked = ArrayList<String>()

        for (uriStr in knownUris) {
            if (activeUriStrings.contains(uriStr)) {
                valid.add(uriStr)
            } else {
                revoked.add(uriStr)
            }
        }
        return GrantValidationResult(valid, revoked)
    }

    /**
     * Returns all currently persisted URI permissions.
     */
    fun getPersistedGrants(): List<UriPermission> {
        return contentResolver.persistedUriPermissions
    }

    /**
     * Releases least-recently-used grants when approaching limit (within 8 of max).
     */
    fun pruneIfApproachingLimit(lruUris: List<String> = emptyList()) {
        try {
            val permissions = contentResolver.persistedUriPermissions
            val limit = maxPersistedGrants
            if (permissions.size >= limit - 8) {
                // If approaching limit, release oldest from lruUris or oldest permissions
                val excess = (permissions.size - (limit - 16)).coerceAtLeast(1)
                var released = 0
                for (lru in lruUris) {
                    if (released >= excess) break
                    val targetUri = Uri.parse(lru)
                    if (permissions.any { it.uri == targetUri }) {
                        releasePersistableGrant(targetUri)
                        released++
                    }
                }
            }
        } catch (_: Exception) {}
    }

    /**
     * Returns detected storage volumes with free and total bytes.
     */
    fun getStorageVolumes(): List<VolumeInfo> {
        val list = ArrayList<VolumeInfo>()
        val sm = context.getSystemService(Context.STORAGE_SERVICE) as? StorageManager ?: return list

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                val volumes = sm.storageVolumes
                for (volume in volumes) {
                    val isPrimary = volume.isPrimary
                    val isRemovable = volume.isRemovable
                    val label = volume.getDescription(context)
                    val id = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        volume.mediaStoreVolumeName ?: (if (isPrimary) "primary" else "external")
                    } else {
                        if (isPrimary) "primary" else "external"
                    }

                    var freeBytes = 0L
                    var totalBytes = 0L
                    var path: String? = null

                    try {
                        val getPathMethod = volume.javaClass.getMethod("getPathFile")
                        val file = getPathMethod.invoke(volume) as? File
                        if (file != null && file.exists()) {
                            path = file.absolutePath
                            freeBytes = file.freeSpace
                            totalBytes = file.totalSpace
                        }
                    } catch (_: Exception) {}

                    if (totalBytes <= 0L && isPrimary) {
                        val root = android.os.Environment.getExternalStorageDirectory()
                        if (root != null) {
                            path = root.absolutePath
                            freeBytes = root.freeSpace
                            totalBytes = root.totalSpace
                        }
                    }

                    list.add(
                        VolumeInfo(
                            id = id,
                            label = if (label.isNotBlank()) label else (if (isPrimary) "Internal Storage" else "SD Card"),
                            isRemovable = isRemovable,
                            freeBytes = freeBytes,
                            totalBytes = totalBytes,
                            isPrimary = isPrimary,
                            path = path
                        )
                    )
                }
            } catch (_: Exception) {}
        }

        if (list.isEmpty()) {
            val root = android.os.Environment.getExternalStorageDirectory()
            if (root != null) {
                list.add(
                    VolumeInfo(
                        id = "primary",
                        label = "Internal Storage",
                        isRemovable = false,
                        freeBytes = root.freeSpace,
                        totalBytes = root.totalSpace,
                        isPrimary = true,
                        path = root.absolutePath
                    )
                )
            }
        }

        return list
    }

    /**
     * Builds initial picker Intent or URI hint for opening document trees.
     */
    fun buildInitialPickerIntent(volumeId: String? = null, hint: String? = null): Intent {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION or
                        Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or
                        Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
            )
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val initialUri = resolvePickerInitialUri(volumeId, hint)
            if (initialUri != null) {
                intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, initialUri)
            }
        }
        return intent
    }

    private fun resolvePickerInitialUri(volumeId: String?, hint: String?): Uri? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null
        val targetVolume = volumeId ?: "primary"
        val folder = hint ?: "Documents"
        return try {
            val sm = context.getSystemService(Context.STORAGE_SERVICE) as? StorageManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && sm != null) {
                val vol = sm.storageVolumes.firstOrNull {
                    it.mediaStoreVolumeName == volumeId || (it.isPrimary && volumeId == "primary")
                }
                if (vol != null) {
                    val rootUri = vol.createOpenDocumentTreeIntent().getParcelableExtra<Uri>(DocumentsContract.EXTRA_INITIAL_URI)
                    if (rootUri != null) return rootUri
                }
            }
            DocumentsContract.buildDocumentUri(
                "com.android.externalstorage.documents",
                "$targetVolume:$folder"
            )
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Registers a ContentObserver on a directory URI for live changes.
     */
    fun observeDirectory(uriString: String, onChange: () -> Unit) {
        val uri = Uri.parse(uriString)
        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) {
                onChange()
            }
        }
        activeObservers[uriString]?.let { contentResolver.unregisterContentObserver(it) }
        activeObservers[uriString] = observer
        contentResolver.registerContentObserver(uri, true, observer)
    }

    fun stopObserving(uriString: String) {
        activeObservers.remove(uriString)?.let {
            contentResolver.unregisterContentObserver(it)
        }
    }
}
