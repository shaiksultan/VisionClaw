package com.meta.wearable.dat.externalsampleapps.cameraaccess.tickets

import android.graphics.Bitmap
import android.util.Log
import com.meta.wearable.dat.externalsampleapps.cameraaccess.lab.LabDemoClient
import com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.ToolResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import kotlin.coroutines.coroutineContext

class TicketClient(
    private val labDemoClient: LabDemoClient,
) {
    suspend fun createEvidenceTicket(
        frameProvider: () -> Bitmap?,
        args: Map<String, Any?>,
        onProgress: ((String) -> Unit)? = null,
    ): ToolResult = withContext(Dispatchers.IO) {
        val description = args["description"]?.toString()?.trim().orEmpty()
        if (description.isBlank()) {
            return@withContext ToolResult.Failure(
                "Ask the user to describe the evidence first: what happened, what fault they see, and what should be tracked on the ticket."
            )
        }

        val evidenceType = args["evidence_type"]?.toString()?.trim()?.lowercase().orEmpty()
        if (evidenceType !in setOf("screenshot", "video")) {
            return@withContext ToolResult.Failure(
                "Ask whether the evidence should be saved as a screenshot or a short video recording, then call this tool again."
            )
        }

        try {
            labDemoClient.ensureConnected()
            val payload = JSONObject()
                .put("title", args["title"]?.toString()?.trim().orEmpty())
                .put("description", description)
                .put("evidence_type", evidenceType)

            if (evidenceType == "screenshot") {
                onProgress?.invoke("Capturing screenshot for the ticket…")
                val frame = frameProvider()
                    ?: return@withContext ToolResult.Failure("No camera frame is available. Point the glasses at the evidence and try again.")
                payload.put("screenshot", EvidenceRecorder.screenshotDataUri(frame))
            } else {
                onProgress?.invoke("Recording about ten seconds of video evidence… speak to cancel.")
                val frames = EvidenceRecorder.captureVideoFrames(
                    getFrame = { frameProvider() },
                    onProgress = onProgress,
                )
                coroutineContext.ensureActive()
                if (frames.isEmpty()) {
                    return@withContext ToolResult.Failure("No video frames were captured. Point the glasses at the evidence and try again.")
                }
                payload.put("video_frames", JSONArray(frames))
            }

            onProgress?.invoke("Uploading ticket to Mission Control… almost done.")
            val saved = labDemoClient.postTicket(payload)
            val summary = saved.optString("spoken_summary").ifBlank {
                "Ticket ${saved.optString("ticket_code")} was created and is now tracked."
            }
            ToolResult.Success(summary)
        } catch (e: kotlinx.coroutines.CancellationException) {
            Log.i(TAG, "Evidence ticket cancelled by user speech")
            throw e
        } catch (e: Exception) {
            Log.e(TAG, "Evidence ticket creation failed", e)
            ToolResult.Failure("Evidence ticket creation failed: ${e.message ?: e.javaClass.simpleName}")
        }
    }

    companion object {
        private const val TAG = "TicketClient"
    }
}
