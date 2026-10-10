package com.meta.wearable.dat.externalsampleapps.cameraaccess.lab

import android.graphics.Bitmap
import android.util.Base64
import android.util.Log
import com.meta.wearable.dat.externalsampleapps.cameraaccess.gemini.GeminiConfig
import com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.OpenClawBridge
import com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.ToolResult
import com.meta.wearable.dat.externalsampleapps.cameraaccess.settings.SettingsManager
import com.meta.wearable.dat.externalsampleapps.cameraaccess.stream.StreamingMode
import java.io.ByteArrayOutputStream
import java.net.URLEncoder
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class LabDemoClient {
    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()
    private val largeClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(180, TimeUnit.SECONDS)
        .readTimeout(180, TimeUnit.SECONDS)
        .build()
    private val connectMutex = Mutex()
    private var sessionId: String? = null
    @Volatile private var deviceType: String = "ray-ban"
    @Volatile private var presenceRunning: Boolean = false
    @Volatile private var currentPage: String = "Camera"
    @Volatile private var currentLocation: String = "Telecom Lab"

    fun setStreamingMode(mode: StreamingMode) {
        deviceType = when (mode) {
            StreamingMode.GLASSES -> "ray-ban"
            StreamingMode.PHONE -> "mobile"
        }
    }

    fun currentDeviceType(): String = deviceType

    fun setPresenceContext(page: String, location: String = "Telecom Lab") {
        currentPage = page.trim().ifBlank { "Camera" }
        currentLocation = location.trim().ifBlank { "Telecom Lab" }
    }

    /**
     * Keep this phone/glasses visible on Mission Control "Agents connected"
     * while the app is open. Heartbeats every ~25s (server drops after 90s idle).
     */
    suspend fun startPresence(mode: StreamingMode = StreamingMode.PHONE) {
        setStreamingMode(mode)
        if (presenceRunning) {
            runCatching { ensureConnected() }
            return
        }
        presenceRunning = true
        try {
            while (presenceRunning) {
                runCatching { ensureConnected() }
                    .onFailure { Log.w(TAG, "Presence connect/heartbeat failed: ${it.message}") }
                delay(25_000)
            }
        } finally {
            presenceRunning = false
        }
    }

    fun stopPresence() {
        presenceRunning = false
    }

    suspend fun ensureConnected() = withContext(Dispatchers.IO) {
        connectMutex.withLock {
            if (sessionId != null) {
                val ok = runCatching { heartbeat() }.isSuccess
                if (ok) return@withContext
                Log.w(TAG, "Heartbeat failed; reconnecting agent session")
                sessionId = null
            }
            val agentName = if (deviceType == "ray-ban") "Ray-Ban Meta" else "Mobile camera"
            val payload = JSONObject()
                .put("device", deviceType)
                .put("label", "$agentName · $currentPage")
                .put("agent_name", agentName)
                .put("page", currentPage)
                .put("location", currentLocation)
            val data = postJson("${baseUrl()}/api/agents/connect", payload, "agent_connect")
            sessionId = data.getString("session_id")
            Log.i(TAG, "Connected to lab platform as $deviceType ($sessionId) page=$currentPage")
        }
    }

    suspend fun addInventoryItem(args: Map<String, Any?>, frame: Bitmap? = null): ToolResult = withContext(Dispatchers.IO) {
        val name = args["name"]?.toString()?.trim().orEmpty()
        val description = (args["description"] ?: args["notes"])?.toString()?.trim().orEmpty()
        val location = args["location"]?.toString()?.trim().orEmpty()
        if (name.isBlank()) {
            return@withContext ToolResult.Failure("Ask for the item name before adding it to inventory.")
        }
        if (description.isBlank()) {
            return@withContext ToolResult.Failure("Ask for a short description of the item (what it is / what it is for) before adding.")
        }
        if (location.isBlank()) {
            return@withContext ToolResult.Failure("Ask where the item is located in the lab (bench, rack, shelf) before adding.")
        }
        val quantity = when (val q = args["quantity"]) {
            is Number -> q.toInt()
            else -> q?.toString()?.toIntOrNull() ?: 1
        }.coerceAtLeast(0)
        try {
            ensureConnected()
            val payload = JSONObject()
                .put("name", name)
                .put("description", description)
                .put("notes", description)
                .put("location", location)
                .put("quantity", quantity)
                .put("category", args["category"]?.toString()?.trim().orEmpty())
                .put("status", args["status"]?.toString()?.trim().orEmpty().ifBlank { "Available" })
            // Attach the current glasses/phone frame as the item photo when available.
            if (frame != null) {
                payload.put("media_type", "image")
                payload.put("image", "data:image/jpeg;base64,${bitmapData(frame)}")
            }
            val clientForPost = if (frame != null) largeClient else client
            val saved = postJsonWithClient(
                "${baseUrl()}/api/inventory",
                payload,
                "add_inventory_item",
                clientForPost,
            )
            val spoken = saved.optString("spoken_summary").ifBlank {
                val photoNote = if (frame != null) " Photo attached." else ""
                "Added $name to inventory. Description: $description. Location: $location. Quantity $quantity.$photoNote"
            }
            ToolResult.Success(spoken)
        } catch (e: Exception) {
            Log.e(TAG, "Add inventory item failed", e)
            ToolResult.Failure("Could not add inventory item: ${e.message ?: e.javaClass.simpleName}")
        }
    }

    suspend fun lookupInventory(args: Map<String, Any?>): ToolResult = withContext(Dispatchers.IO) {
        val query = args["query"]?.toString()?.trim().orEmpty()
        if (query.isBlank()) {
            return@withContext ToolResult.Failure("An inventory search query is required. Ask what item or equipment the user is looking for.")
        }
        try {
            ensureConnected()
            val encoded = URLEncoder.encode(query, "UTF-8")
            val data = getJson("${baseUrl()}/api/inventory/lookup?q=$encoded", "lookup_inventory") as JSONObject
            ToolResult.Success(data.getString("spoken_summary"))
        } catch (e: Exception) {
            Log.e(TAG, "Inventory lookup failed", e)
            ToolResult.Failure("Inventory lookup failed: ${e.message ?: e.javaClass.simpleName}")
        }
    }

    suspend fun lookupKnowledge(args: Map<String, Any?>): ToolResult = withContext(Dispatchers.IO) {
        val query = args["query"]?.toString()?.trim().orEmpty()
        if (query.isBlank()) {
            return@withContext ToolResult.Failure("A knowledge search query is required. Ask which procedure or topic the user wants explained.")
        }
        try {
            ensureConnected()
            val encoded = URLEncoder.encode(query, "UTF-8")
            val article = getJson("${baseUrl()}/api/knowledge/lookup?q=$encoded", "lookup_knowledge") as JSONObject
            val summary = article.optString("spoken_summary").ifBlank {
                "${article.getString("title")}. ${article.optString("summary")}"
            }
            ToolResult.Success(summary)
        } catch (e: Exception) {
            Log.e(TAG, "Knowledge lookup failed", e)
            ToolResult.Failure("Knowledge lookup failed: ${e.message ?: e.javaClass.simpleName}")
        }
    }

    suspend fun troubleshootScreen(
        frame: Bitmap?,
        args: Map<String, Any?>,
        openClaw: OpenClawBridge? = null,
    ): ToolResult = withContext(Dispatchers.IO) {
        if (frame == null) {
            return@withContext ToolResult.Failure("No camera frame is available. Point the glasses at the screen and try again.")
        }
        val question = args["question"]?.toString()?.trim()?.ifBlank { null }
            ?: "Analyze this screen and tell me what's wrong."
        val imageDataUrl = "data:image/jpeg;base64,${bitmapData(frame)}"

        // Prefer OpenClaw → ChatGPT when gateway is configured; Gemini speaks the answer back.
        if (openClaw != null && GeminiConfig.isOpenClawConfigured) {
            val prompt = buildString {
                appendLine("You are the Visual Troubleshooting agent for a telecom lab.")
                appendLine("Analyze the attached screen capture from AI glasses.")
                appendLine("Explain what is wrong, likely root cause, and concrete next steps.")
                appendLine("Keep the answer short enough to speak aloud (under ~120 words).")
                appendLine()
                append("Question: ").append(question)
            }
            Log.d(TAG, "Routing troubleshoot_screen via OpenClaw/ChatGPT")
            val result = openClaw.delegateVisionTask(
                task = prompt,
                imageDataUrl = imageDataUrl,
                toolName = "troubleshoot_screen",
            )
            if (result is ToolResult.Success) return@withContext result
            Log.w(TAG, "OpenClaw troubleshoot failed, falling back to Mission Control: $result")
        }

        try {
            ensureConnected()
            val payload = JSONObject()
                .put("image", imageDataUrl)
                .put("question", question)
            val data = postJson("${baseUrl()}/api/troubleshoot", payload, "troubleshoot_screen")
            val analysis = data.optString("analysis").ifBlank { data.optString("spoken_summary") }
            if (analysis.isBlank()) {
                throw IllegalStateException("Troubleshooting service returned no analysis")
            }
            ToolResult.Success(analysis)
        } catch (e: Exception) {
            Log.e(TAG, "Screen troubleshooting failed", e)
            ToolResult.Failure("Screen troubleshooting failed: ${e.message ?: e.javaClass.simpleName}")
        }
    }

    suspend fun startLabTest(args: Map<String, Any?>): ToolResult = withContext(Dispatchers.IO) {
        try {
            ensureConnected()
            val cyclesRaw = args["cycles"]?.toString()?.trim().orEmpty()
            val cycles = cyclesRaw.toIntOrNull() ?: 5
            if (cycles !in 1..20) {
                return@withContext ToolResult.Failure("Test cycles must be between 1 and 20.")
            }
            val testType = args["test_type"]?.toString()?.trim()?.ifBlank { null } ?: "Mobile PS"
            val payload = JSONObject()
                .put("test_type", testType)
                .put("cycles", cycles)
            args["name"]?.toString()?.trim()?.takeIf { it.isNotBlank() }?.let { payload.put("name", it) }

            val run = postJson("${baseUrl()}/api/tests/start", payload, "start_lab_test")
            val runId = run.getInt("id")
            val report = getJson("${baseUrl()}/api/tests/$runId/report", "get_test_report") as JSONObject
            val spoken = report.optString("spoken_summary").ifBlank {
                report.optString("report").lines().take(6).joinToString(" ")
            }
            val status = report.optString("status", run.optString("status"))
            ToolResult.Success("Test run $runId ($status): $spoken")
        } catch (e: Exception) {
            Log.e(TAG, "Lab test start failed", e)
            ToolResult.Failure("Lab test start failed: ${e.message ?: e.javaClass.simpleName}")
        }
    }

    suspend fun postTicket(payload: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        ensureConnected()
        if (sessionId != null) payload.put("session_id", sessionId)
        payload.put("device", deviceType)
        postJson("${baseUrl()}/api/tickets", payload, "create_evidence_ticket")
    }

    suspend fun postSupportSession(payload: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        ensureConnected()
        if (sessionId != null) payload.put("session_id", sessionId)
        payload.put("device", deviceType)
        postJson("${baseUrl()}/api/support/sessions", payload, "support_request")
    }

    suspend fun patchSupportSession(callId: Int, payload: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        ensureConnected()
        patchJson("${baseUrl()}/api/support/sessions/$callId", payload, "support_room_update")
    }

    suspend fun postSupportMessage(callId: Int, sender: String, message: String): JSONObject = withContext(Dispatchers.IO) {
        ensureConnected()
        postJson(
            "${baseUrl()}/api/support/sessions/$callId/messages",
            JSONObject().put("sender", sender).put("message", message),
            "support_message",
        )
    }

    suspend fun endSupportSession(payload: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        ensureConnected()
        postJson("${baseUrl()}/api/support/end", payload, "end_support_call")
    }

    suspend fun postTwin(payload: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        ensureConnected()
        if (sessionId != null) payload.put("session_id", sessionId)
        payload.put("device", deviceType)
        // Twin uploads can be large (many frames)
        postJsonLarge("${baseUrl()}/api/twins", payload, "create_digital_twin")
    }

    suspend fun disconnect() = withContext(Dispatchers.IO) {
        stopPresence()
        val activeSession = sessionId ?: return@withContext
        runCatching {
            postJson("${baseUrl()}/api/agents/disconnect", JSONObject().put("session_id", activeSession), "agent_disconnect")
        }
        sessionId = null
    }

    private suspend fun heartbeat() {
        val activeSession = sessionId ?: return
        val agentName = if (deviceType == "ray-ban") "Ray-Ban Meta" else "Mobile camera"
        val payload = JSONObject()
            .put("session_id", activeSession)
            .put("label", "$agentName · $currentPage")
            .put("agent_name", agentName)
            .put("page", currentPage)
            .put("location", currentLocation)
        postJson("${baseUrl()}/api/agents/heartbeat", payload, "agent_heartbeat")
    }

    private fun baseUrl(): String = SettingsManager.peopleDirectoryURL.trimEnd('/')

    private fun bitmapData(bitmap: Bitmap): String {
        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 75, out)
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }

    private suspend fun getJson(url: String, command: String): Any {
        val request = Request.Builder()
            .url(url)
            .header("ngrok-skip-browser-warning", "true")
            .apply { applyLabHeaders(this, command) }
            .build()
        val response = client.newCall(request).execute()
        val text = response.body?.string().orEmpty()
        if (!response.isSuccessful) {
            val message = runCatching { JSONObject(text).optString("error") }.getOrNull().orEmpty()
            throw IllegalStateException("lab demo API returned HTTP ${response.code}${if (message.isBlank()) "" else ": $message"}")
        }
        return JSONObject(text)
    }

    private suspend fun postJson(url: String, payload: JSONObject, command: String): JSONObject =
        postJsonWithClient(url, payload, command, client)

    private suspend fun postJsonWithClient(
        url: String,
        payload: JSONObject,
        command: String,
        httpClient: OkHttpClient,
    ): JSONObject {
        val request = Request.Builder()
            .url(url)
            .header("ngrok-skip-browser-warning", "true")
            .apply { applyLabHeaders(this, command) }
            .post(payload.toString().toRequestBody(JSON))
            .build()
        val response = httpClient.newCall(request).execute()
        val text = response.body?.string().orEmpty()
        if (!response.isSuccessful) {
            val message = runCatching { JSONObject(text).optString("error") }.getOrNull().orEmpty()
            throw IllegalStateException("lab demo API returned HTTP ${response.code}${if (message.isBlank()) "" else ": $message"}")
        }
        return JSONObject(text)
    }

    private suspend fun postJsonLarge(url: String, payload: JSONObject, command: String): JSONObject {
        val request = Request.Builder()
            .url(url)
            .header("ngrok-skip-browser-warning", "true")
            .apply { applyLabHeaders(this, command) }
            .post(payload.toString().toRequestBody(JSON))
            .build()
        val response = largeClient.newCall(request).execute()
        val text = response.body?.string().orEmpty()
        if (!response.isSuccessful) {
            val message = runCatching { JSONObject(text).optString("error") }.getOrNull().orEmpty()
            throw IllegalStateException("lab demo API returned HTTP ${response.code}${if (message.isBlank()) "" else ": $message"}")
        }
        return JSONObject(text)
    }

    private suspend fun patchJson(url: String, payload: JSONObject, command: String): JSONObject {
        val request = Request.Builder()
            .url(url)
            .header("ngrok-skip-browser-warning", "true")
            .apply { applyLabHeaders(this, command) }
            .patch(payload.toString().toRequestBody(JSON))
            .build()
        val response = client.newCall(request).execute()
        val text = response.body?.string().orEmpty()
        if (!response.isSuccessful) {
            val message = runCatching { JSONObject(text).optString("error") }.getOrNull().orEmpty()
            throw IllegalStateException("lab demo API returned HTTP ${response.code}${if (message.isBlank()) "" else ": $message"}")
        }
        return JSONObject(text)
    }

    fun applyLabHeaders(builder: Request.Builder, command: String) {
        builder.header("X-Lab-Device", deviceType)
        builder.header("X-Lab-Command", command)
        sessionId?.let { builder.header("X-Lab-Session", it) }
    }

    companion object {
        private const val TAG = "LabDemoClient"
        private val JSON = "application/json".toMediaType()
    }
}
