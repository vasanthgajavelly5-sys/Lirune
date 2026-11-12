package com.lirune.reader.screen

import android.view.WindowManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

/**
 * Window-level display controls for the reader.
 *
 * Keeping the screen on uses `FLAG_KEEP_SCREEN_ON` rather than a `PowerManager`
 * wake lock: a wake lock would need `android.permission.WAKE_LOCK`, has to be
 * released by hand when the reader closes, and outlives the window that asked
 * for it if the release is ever missed. A window flag is dropped by the system
 * when the window goes away, which is exactly the lifetime "Keep Screen Awake"
 * wants.
 */
class LiruneScreenModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "LiruneScreen"

    /**
     * Holds the display on, or releases it, for as long as the reader is open.
     *
     * Resolves `true` when the flag was applied to a live window and `false`
     * when there was no activity to apply it to — a call that arrives while the
     * reader is being torn down is a no-op, not an error.
     */
    @ReactMethod
    fun setKeepScreenOn(enabled: Boolean, promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }
        UiThreadUtil.runOnUiThread {
            try {
                if (enabled) {
                    activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                } else {
                    activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                }
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("KEEP_SCREEN_ON_ERROR", e.message, e)
            }
        }
    }
}