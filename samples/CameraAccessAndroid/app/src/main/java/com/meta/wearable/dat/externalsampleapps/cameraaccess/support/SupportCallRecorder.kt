package com.meta.wearable.dat.externalsampleapps.cameraaccess.support

import android.graphics.Bitmap
import com.meta.wearable.dat.externalsampleapps.cameraaccess.tickets.EvidenceRecorder

object SupportCallRecorder {
    private const val FRAME_INTERVAL_MS = 500L
    private const val MAX_FRAMES = 40

    private val frames = mutableListOf<String>()
    @Volatile private var active = false
    @Volatile private var startedAtMs = 0L
    @Volatile private var lastCaptureMs = 0L

    fun start() {
        synchronized(frames) {
            frames.clear()
        }
        startedAtMs = System.currentTimeMillis()
        lastCaptureMs = 0L
        active = true
    }

    fun captureFrame(frame: Bitmap?) {
        if (!active || frame == null) return
        val now = System.currentTimeMillis()
        if (now - lastCaptureMs < FRAME_INTERVAL_MS) return
        lastCaptureMs = now
        synchronized(frames) {
            if (frames.size >= MAX_FRAMES) return
            val maxW = 640
            val scaled = if (frame.width > maxW) {
                val h = (frame.height.toFloat() * maxW / frame.width).toInt().coerceAtLeast(1)
                Bitmap.createScaledBitmap(frame, maxW, h, true)
            } else {
                frame
            }
            frames.add(EvidenceRecorder.screenshotDataUri(scaled, quality = 55))
            if (scaled !== frame) scaled.recycle()
        }
    }

    fun durationSeconds(): Int {
        if (startedAtMs <= 0L) return 0
        return ((System.currentTimeMillis() - startedAtMs) / 1000L).toInt().coerceAtLeast(0)
    }

    fun stop(): List<String> {
        active = false
        return synchronized(frames) { frames.toList().take(MAX_FRAMES) }
    }
}
