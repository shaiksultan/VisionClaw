package com.meta.wearable.dat.externalsampleapps.cameraaccess.support

import android.util.Log
import com.meta.wearable.dat.externalsampleapps.cameraaccess.lab.LabDemoClient
import com.meta.wearable.dat.externalsampleapps.cameraaccess.settings.SettingsManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class SupportCallClient(
    private val labDemoClient: LabDemoClient,
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    suspend fun startSupportCall(description: String): JSONObject = withContext(Dispatchers.IO) {
        labDemoClient.ensureConnected()
        val payload = JSONObject().put("description", description.trim().ifBlank { "Remote support request" })
        postJson("${baseUrl()}/api/support/sessions", payload, "start_support_call")
    }

    suspend fun updateRoomCode(supportCallId: Int, roomCode: String): JSONObject = withContext(Dispatchers.IO) {
        labDemoClient.ensureConnected()
        val payload = JSONObject().put("room_code", roomCode.trim().uppercase())
        patchJson("${baseUrl()}/api/support/sessions/$supportCallId", payload, "update_support_room")
    }

    suspend fun endSupportCall(
        supportCallId: Int,
        videoFrames: List<String>,
        durationSeconds: Int,
    ): JSONObject = withContext(Dispatchers.IO) {
        labDemoClient.ensureConnected()
        val capped = videoFrames.take(40)
        val payload = JSONObject()
            .put("support_call_id", supportCallId)
            .put("duration_seconds", durationSeconds)
            .put("video_frames", JSONArray(capped))
        try {
            postJson("${baseUrl()}/api/support/end", payload, "end_support_call")
        } catch (error: IllegalStateException) {
            // Already ended is success for the client UX
            if (error.message?.contains("409") == true || error.message?.contains("already ended") == true) {
                JSONObject()
                    .put("status", "ended")
                    .put("spoken_summary", "Support call was already ended.")
            } else {
                throw error
            }
        }
    }

    private fun baseUrl(): String = SettingsManager.peopleDirectoryURL.trimEnd('/')

    private suspend fun postJson(url: String, payload: JSONObject, command: String): JSONObject {
        val request = Request.Builder()
            .url(url)
            .header("ngrok-skip-browser-warning", "true")
            .apply { labDemoClient.applyLabHeaders(this, command) }
            .post(payload.toString().toRequestBody(JSON))
            .build()
        return execute(request)
    }

    private suspend fun patchJson(url: String, payload: JSONObject, command: String): JSONObject {
        val request = Request.Builder()
            .url(url)
            .header("ngrok-skip-browser-warning", "true")
            .apply { labDemoClient.applyLabHeaders(this, command) }
            .patch(payload.toString().toRequestBody(JSON))
            .build()
        return execute(request)
    }

    private fun execute(request: Request): JSONObject {
        val response = client.newCall(request).execute()
        val text = response.body?.string().orEmpty()
        if (!response.isSuccessful) {
            val message = runCatching { JSONObject(text).optString("error") }.getOrNull().orEmpty()
            throw IllegalStateException("support API returned HTTP ${response.code}${if (message.isBlank()) "" else ": $message"}")
        }
        return JSONObject(text)
    }

    companion object {
        private const val TAG = "SupportCallClient"
        private val JSON = "application/json".toMediaType()
    }
}
