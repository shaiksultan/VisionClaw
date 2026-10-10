package com.meta.wearable.dat.externalsampleapps.cameraaccess.tickets

import android.graphics.Bitmap
import android.util.Base64
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlin.coroutines.coroutineContext

object EvidenceRecorder {
    private const val VIDEO_DURATION_MS = 10_000L
    private const val VIDEO_FRAME_INTERVAL_MS = 500L

    fun screenshotDataUri(frame: Bitmap, quality: Int = 80): String {
        val out = ByteArrayOutputStream()
        frame.compress(Bitmap.CompressFormat.JPEG, quality.coerceIn(40, 95), out)
        return "data:image/jpeg;base64,${Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)}"
    }

    suspend fun captureVideoFrames(
        getFrame: () -> Bitmap?,
        onProgress: ((String) -> Unit)? = null,
    ): List<String> {
        val frames = mutableListOf<String>()
        val startedAt = System.currentTimeMillis()
        var lastProgressAt = 0L
        while (System.currentTimeMillis() - startedAt < VIDEO_DURATION_MS) {
            coroutineContext.ensureActive()
            getFrame()?.let { frame ->
                frames.add(screenshotDataUri(frame))
            }
            val now = System.currentTimeMillis()
            if (now - lastProgressAt >= 2000L) {
                lastProgressAt = now
                val elapsed = ((now - startedAt) / 1000L).toInt()
                val left = ((VIDEO_DURATION_MS - (now - startedAt)).coerceAtLeast(0) / 1000L).toInt()
                onProgress?.invoke("Recording evidence… ${elapsed}s · ~${left}s left. Speak to cancel.")
            }
            delay(VIDEO_FRAME_INTERVAL_MS)
        }
        return frames
    }
}
