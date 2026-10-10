package com.meta.wearable.dat.externalsampleapps.cameraaccess.people

import android.graphics.Bitmap
import android.util.Base64
import android.util.Log
import com.meta.wearable.dat.externalsampleapps.cameraaccess.gemini.GeminiConfig
import com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.ToolResult
import com.meta.wearable.dat.externalsampleapps.cameraaccess.settings.SettingsManager
import java.io.ByteArrayOutputStream
import java.net.URLEncoder
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

class PeopleRecognitionClient {
    private val client = OkHttpClient.Builder().connectTimeout(5, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).build()

    suspend fun identify(frame: Bitmap?): ToolResult = withContext(Dispatchers.IO) {
        if (frame == null) return@withContext ToolResult.Failure("No camera frame is available. Center the person and try again.")
        try {
            val base = SettingsManager.peopleDirectoryURL.trimEnd('/')
            val list = getJson("$base/api/people") as JSONArray
            val candidates = mutableListOf<JSONObject>()
            for (i in 0 until list.length()) {
                val item = list.getJSONObject(i)
                if (!item.optBoolean("consent") || item.optString("photo").isBlank()) continue
                candidates += getJson("$base/api/people/${item.getInt("id")}") as JSONObject
                if (candidates.size == 20) break
            }
            if (candidates.isEmpty()) return@withContext ToolResult.Success("NO_MATCH: I don't have details about this person.")

            val parts = JSONArray()
            parts.put(JSONObject().put("text", "Compare CURRENT with the consented REFERENCE face images. Return JSON only: {\"person_id\":integer|null,\"confidence\":number}. Match only when facial identity is strong and unambiguous. Otherwise return null. Never identify outside the references."))
            parts.put(JSONObject().put("text", "CURRENT"))
            parts.put(inlineImage("image/jpeg", bitmapData(frame)))
            candidates.forEach { person ->
                parts.put(JSONObject().put("text", "REFERENCE person_id=${person.getInt("id")}"))
                val photo = person.getString("photo")
                parts.put(inlineImage(photo.substringAfter("data:").substringBefore(';'), photo.substringAfter(',')))
            }
            val payload = JSONObject()
                .put("contents", JSONArray().put(JSONObject().put("parts", parts)))
                .put("generationConfig", JSONObject().put("responseMimeType", "application/json").put("temperature", 0))
            // Use the rolling Flash alias because model availability can differ by API-key project.
            val url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GeminiConfig.apiKey}"
            val response = client.newCall(Request.Builder().url(url).post(payload.toString().toRequestBody(JSON)).build()).execute()
            val responseText = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val apiMessage = runCatching {
                    JSONObject(responseText).getJSONObject("error").optString("message")
                }.getOrNull().orEmpty()
                throw IllegalStateException("matching service returned HTTP ${response.code}${if (apiMessage.isBlank()) "" else ": $apiMessage"}")
            }
            val envelope = JSONObject(responseText)
            val text = envelope.getJSONArray("candidates").getJSONObject(0).getJSONObject("content").getJSONArray("parts").getJSONObject(0).getString("text")
            // Even with responseMimeType set, some model versions occasionally wrap JSON
            // in a markdown fence or add a short sentence. Extract the object defensively.
            val jsonText = text.substringAfter("```json", text)
                .substringAfter("```", text)
                .substringBeforeLast("```", text)
                .let { candidate ->
                    val start = candidate.indexOf('{')
                    val end = candidate.lastIndexOf('}')
                    if (start >= 0 && end > start) candidate.substring(start, end + 1) else candidate
                }
                .trim()
            val result = JSONObject(jsonText)
            val id = if (result.isNull("person_id")) null else result.getInt("person_id")
            val confidence = result.optDouble("confidence", 0.0)
            val person = candidates.firstOrNull { id != null && it.getInt("id") == id }
            // Phone camera frames are usually softer and more oblique than enrollment photos.
            // Still require a strong match so the app does not confidently name the wrong person.
            if (person == null || confidence < 0.75) return@withContext ToolResult.Success("NO_MATCH: I don't have details about this person.")
            val name = URLEncoder.encode(person.getString("name"), "UTF-8")
            val lookup = getJson("$base/api/lookup?name=$name") as JSONObject
            ToolResult.Success("MATCH: ${lookup.getString("spoken_summary")}")
        } catch (e: Exception) {
            Log.e("PeopleRecognition", "Person identification failed", e)
            ToolResult.Failure("Person identification failed: ${e.message ?: e.javaClass.simpleName}")
        }
    }

    suspend fun enroll(frame: Bitmap?, args: Map<String, Any?>): ToolResult = withContext(Dispatchers.IO) {
        if (frame == null) return@withContext ToolResult.Failure("No camera frame is available. Center the person's face and try again.")
        val name = args["name"]?.toString()?.trim().orEmpty()
        val company = args["company"]?.toString()?.trim().orEmpty()
        val consentConfirmed = args["consent_confirmed"] == true || args["consent_confirmed"]?.toString()?.equals("true", true) == true
        if (name.isBlank()) return@withContext ToolResult.Failure("The person's name is required. Ask the user for the name.")
        if (!consentConfirmed) return@withContext ToolResult.Failure("Before saving the photo, ask the user to confirm that the person has consented to enrollment.")
        try {
            val payload = JSONObject()
                .put("name", name)
                .put("company", company)
                .put("title", args["title"]?.toString()?.trim().orEmpty())
                .put("notes", args["notes"]?.toString()?.trim().orEmpty())
                .put("consentConfirmed", true)
                .put("photo", "data:image/jpeg;base64,${bitmapData(frame)}")
            args["current_project"]?.toString()?.trim()?.takeIf { it.isNotBlank() }?.let {
                payload.put("projects", JSONArray().put(JSONObject().put("name", it).put("status", "Active")))
            }
            val base = SettingsManager.peopleDirectoryURL.trimEnd('/')
            val request = Request.Builder().url("$base/api/enroll")
                .header("ngrok-skip-browser-warning", "true")
                .post(payload.toString().toRequestBody(JSON)).build()
            val response = client.newCall(request).execute()
            val text = response.body?.string().orEmpty()
            if (response.code == 409) {
                val existing = runCatching { JSONObject(text).getJSONObject("person").getString("name") }.getOrDefault(name)
                return@withContext ToolResult.Failure("$existing is already in the lab staff database. I did not create a duplicate.")
            }
            if (!response.isSuccessful) {
                val message = runCatching { JSONObject(text).optString("error") }.getOrNull().orEmpty()
                throw IllegalStateException("directory returned HTTP ${response.code}${if (message.isBlank()) "" else ": $message"}")
            }
            val saved = JSONObject(text)
            ToolResult.Success(saved.optString("spoken_summary", "$name was added to the lab staff database."))
        } catch (e: Exception) {
            Log.e("PeopleRecognition", "Person enrollment failed", e)
            ToolResult.Failure("Person enrollment failed: ${e.message ?: e.javaClass.simpleName}")
        }
    }

    private fun bitmapData(bitmap: Bitmap): String { val out=ByteArrayOutputStream(); bitmap.compress(Bitmap.CompressFormat.JPEG,75,out); return Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP) }
    private fun inlineImage(mime:String,data:String)=JSONObject().put("inlineData",JSONObject().put("mimeType",mime).put("data",data))
    private fun getJson(url:String):Any { val request=Request.Builder().url(url).header("ngrok-skip-browser-warning","true").build(); val r=client.newCall(request).execute(); if(!r.isSuccessful)throw IllegalStateException("directory returned HTTP ${r.code}"); val text=r.body?.string().orEmpty(); return if(text.trimStart().startsWith("["))JSONArray(text) else JSONObject(text) }
    companion object { private val JSON="application/json".toMediaType() }
}
