package com.labvision.expert

import kotlinx.coroutines.flow.MutableStateFlow
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class SupportCall(
    val id: Int,
    val callCode: String,
    val roomCode: String,
    val description: String,
    val status: String,
    val callPhase: String,
    val device: String,
    val ticketCode: String,
) {
    val waiting: Boolean
        get() = status != "ended" && (callPhase == "waiting" || callPhase.isBlank())

    val ended: Boolean
        get() = status == "ended" || callPhase == "ended"

    val who: String
        get() = when (device) {
            "ray-ban" -> "Ray-Ban Meta glasses"
            "mobile" -> "Lab phone"
            "iphone" -> "iPhone"
            "web" -> "Web console"
            else -> "Lab glasses"
        }

    val title: String
        get() = description.ifBlank { "Lab bench" }.take(80)
}

enum class ExpertScreen { Home, Live, Ended }

object ExpertBus {
    const val DEFAULT_BASE = "http://192.168.0.121:8090"
    val calls = MutableStateFlow<List<SupportCall>>(emptyList())
    val linkError = MutableStateFlow<String?>(null)
    val screen = MutableStateFlow(ExpertScreen.Home)
    val activeId = MutableStateFlow<Int?>(null)
    val dismissed = MutableStateFlow<Set<Int>>(emptySet())
    val ticketLine = MutableStateFlow("")
    val baseUrl = MutableStateFlow(DEFAULT_BASE)

    fun incoming(): SupportCall? {
        if (screen.value != ExpertScreen.Home || activeId.value != null) return null
        val skip = dismissed.value
        return calls.value.firstOrNull { it.waiting && it.id !in skip }
    }
}

class MissionApi {
    private val http = OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()
    private val json = "application/json; charset=utf-8".toMediaType()

    fun list(base: String): List<SupportCall> {
        val body = get(base.trimEnd('/') + "/api/support/sessions?phase=all")
        val arr = JSONArray(body)
        return buildList {
            for (i in 0 until arr.length()) add(arr.getJSONObject(i).toCall())
        }
    }

    fun accept(base: String, id: Int) {
        post(base.trimEnd('/') + "/api/support/sessions/$id/accept", """{"expert_label":"Lab Expert"}""")
    }

    fun end(base: String, id: Int): String {
        val body = post(base.trimEnd('/') + "/api/support/end", """{"support_call_id":$id,"expert_label":"Lab Expert"}""")
        val obj = JSONObject(body)
        val code = obj.optString("ticket_code").ifBlank {
            obj.optJSONObject("ticket")?.optString("ticket_code").orEmpty()
        }
        return if (code.isNotBlank()) "Ticket $code created" else obj.optString("spoken_summary").ifBlank { "Call ended" }
    }

    private fun get(url: String): String {
        val request = Request.Builder().url(url).get().build()
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) error(text.ifBlank { "Mission Control returned ${response.code}" })
            return text
        }
    }

    private fun post(url: String, payload: String): String {
        val request = Request.Builder().url(url).post(payload.toRequestBody(json)).build()
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val message = runCatching { JSONObject(text).optString("error") }.getOrNull().orEmpty()
                error(message.ifBlank { text.ifBlank { "Mission Control returned ${response.code}" } })
            }
            return text
        }
    }
}

private fun JSONObject.toCall() = SupportCall(
    id = optInt("id"),
    callCode = optString("call_code"),
    roomCode = optString("room_code"),
    description = optString("description"),
    status = optString("status"),
    callPhase = optString("call_phase"),
    device = optString("device"),
    ticketCode = optString("ticket_code"),
)
