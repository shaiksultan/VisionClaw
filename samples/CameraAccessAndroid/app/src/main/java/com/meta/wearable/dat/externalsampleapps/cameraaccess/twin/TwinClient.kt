package com.meta.wearable.dat.externalsampleapps.cameraaccess.twin

import android.graphics.Bitmap
import android.util.Log
import com.meta.wearable.dat.externalsampleapps.cameraaccess.lab.LabDemoClient
import com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.ToolResult
import com.meta.wearable.dat.externalsampleapps.cameraaccess.tickets.EvidenceRecorder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import kotlin.coroutines.coroutineContext

class TwinClient(
    private val labDemoClient: LabDemoClient,
) {
    suspend fun createDigitalTwin(
        frameProvider: () -> Bitmap?,
        args: Map<String, Any?>,
        onProgress: ((String) -> Unit)? = null,
    ): ToolResult = withContext(Dispatchers.IO) {
        val title = args["title"]?.toString()?.trim().orEmpty()
        val description = args["description"]?.toString()?.trim().orEmpty()
            .ifBlank { "Digital twin from AI-glasses lab walk-through" }
        val labName = args["lab_name"]?.toString()?.trim().orEmpty().ifBlank { "Telecom Lab" }

        try {
            labDemoClient.ensureConnected()
            onProgress?.invoke("Recording a short lab walk-through… you can speak anytime to interrupt.")
            val frames = captureWalkthroughFrames(frameProvider, onProgress)
            coroutineContext.ensureActive()
            if (frames.size < 4) {
                return@withContext ToolResult.Failure(
                    "Not enough walk-through frames were captured. Walk slowly for about 8 seconds while looking at racks and benches, then ask again. You can interrupt mid-capture by speaking."
                )
            }

            onProgress?.invoke("Uploading ${frames.size} frames to Mission Control…")
            val payload = JSONObject()
                .put("title", title.ifBlank { "Lab twin · glasses walk-through" })
                .put("description", description)
                .put("lab_name", labName)
                .put("device", labDemoClient.currentDeviceType())
                .put("video_frames", JSONArray(frames))

            val saved = labDemoClient.postTwin(payload)
            val twinId = saved.optString("twin_id")
            val spoken = saved.optString("spoken_summary").ifBlank {
                "Digital twin job $twinId started and is processing in Mission Control."
            }
            val viewer = saved.optString("viewer_url")
            ToolResult.Success(
                "$spoken Open Mission Control ab-twin to watch progress" +
                    if (viewer.isNotBlank()) " and viewer $viewer." else "."
            )
        } catch (e: kotlinx.coroutines.CancellationException) {
            Log.i(TAG, "Digital twin capture cancelled by user speech")
            throw e
        } catch (e: Exception) {
            Log.e(TAG, "Digital twin creation failed", e)
            ToolResult.Failure("Digital twin creation failed: ${e.message ?: e.javaClass.simpleName}")
        }
    }

    private suspend fun captureWalkthroughFrames(
        getFrame: () -> Bitmap?,
        onProgress: ((String) -> Unit)?,
    ): List<String> {
        val frames = mutableListOf<String>()
        val startedAt = System.currentTimeMillis()
        var lastProgressAt = 0L
        while (System.currentTimeMillis() - startedAt < WALKTHROUGH_MS) {
            coroutineContext.ensureActive()
            getFrame()?.let { frame ->
                frames.add(EvidenceRecorder.screenshotDataUri(scaleForTwin(frame), JPEG_QUALITY))
            }
            val elapsedSec = ((System.currentTimeMillis() - startedAt) / 1000L).toInt()
            val now = System.currentTimeMillis()
            if (now - lastProgressAt >= 1500L) {
                lastProgressAt = now
                val remaining = ((WALKTHROUGH_MS - (now - startedAt)).coerceAtLeast(0) / 1000L).toInt()
                onProgress?.invoke(
                    "Capturing twin frames… ${frames.size}/$MAX_FRAMES · ${elapsedSec}s · ~${remaining}s left. Speak to cancel."
                )
            }
            if (frames.size >= MAX_FRAMES) break
            delay(FRAME_INTERVAL_MS)
        }
        return frames
    }

    private fun scaleForTwin(frame: Bitmap): Bitmap {
        val maxW = MAX_FRAME_WIDTH
        if (frame.width <= maxW) return frame
        val h = (frame.height.toFloat() / frame.width * maxW).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(frame, maxW, h, true)
    }

    companion object {
        private const val TAG = "TwinClient"
        // Mobile uploads stall on long 20s / 36-frame captures — keep this short and light.
        private const val WALKTHROUGH_MS = 8_000L
        private const val FRAME_INTERVAL_MS = 700L
        private const val MAX_FRAMES = 12
        private const val MAX_FRAME_WIDTH = 640
        private const val JPEG_QUALITY = 52
    }
}
