package com.meta.wearable.dat.externalsampleapps.cameraaccess.webrtc

import android.util.Log
import com.meta.wearable.dat.externalsampleapps.cameraaccess.settings.SettingsManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import org.webrtc.PeerConnection
import java.util.concurrent.TimeUnit

object WebRTCConfig {
    private const val TAG = "WebRTCConfig"
    private const val ICE_CACHE_TTL_MS = 5 * 60 * 1000L

    // Video encoding
    const val VIDEO_BITRATE = 2_500_000 // 2.5 Mbps
    const val VIDEO_FRAMERATE = 24
    const val VIDEO_WIDTH = 1280
    const val VIDEO_HEIGHT = 720

    // STUN server
    private const val STUN_URL = "stun:stun.l.google.com:19302"
    private const val STUN_URL_2 = "stun:stun1.l.google.com:19302"

    @Volatile
    private var cachedIceServers: List<PeerConnection.IceServer>? = null
    @Volatile
    private var cachedIceAtMs: Long = 0

    val signalingServerURL: String
        get() = SettingsManager.webrtcSignalingURL

    /** HTTPS TURN API on the same host as the signaling WebSocket. */
    val turnCredentialsURL: String
        get() {
            val signal = signalingServerURL.trimEnd('/')
            return when {
                signal.startsWith("wss://") -> "https://${signal.removePrefix("wss://")}/api/turn"
                signal.startsWith("ws://") -> "http://${signal.removePrefix("ws://")}/api/turn"
                else -> "https://visionclaw-signaling.fly.dev/api/turn"
            }
        }

    val isConfigured: Boolean
        get() = signalingServerURL.isNotBlank() &&
            (signalingServerURL.startsWith("wss://") || signalingServerURL.startsWith("ws://")) &&
            !signalingServerURL.contains("YOUR_SIGNALING_SERVER", ignoreCase = true)

    /**
     * Fetch TURN credentials from the signaling server, falling back to STUN-only if unavailable.
     * Cached briefly so the first Expert Engineer call is not stuck waiting on a cold TURN fetch.
     */
    suspend fun fetchIceServers(forceRefresh: Boolean = false): List<PeerConnection.IceServer> {
        val now = System.currentTimeMillis()
        if (!forceRefresh) {
            val cached = cachedIceServers
            if (cached != null && now - cachedIceAtMs < ICE_CACHE_TTL_MS) {
                return cached
            }
        }

        val servers = mutableListOf<PeerConnection.IceServer>()

        servers.add(PeerConnection.IceServer.builder(STUN_URL).createIceServer())
        servers.add(PeerConnection.IceServer.builder(STUN_URL_2).createIceServer())

        try {
            val turnServers = fetchTurnCredentials()
            servers.addAll(turnServers)
            Log.d(TAG, "Fetched ${turnServers.size} TURN servers from $turnCredentialsURL")
        } catch (e: Exception) {
            Log.w(TAG, "TURN API failed (${e.message}), using ExpressTURN fallback")
            servers.add(expressTurnFallback())
        }

        cachedIceServers = servers
        cachedIceAtMs = now
        return servers
    }

    /** Warm ICE/TURN before the user asks for Expert Engineer (first call is much faster). */
    suspend fun prefetchIceServers() {
        runCatching { fetchIceServers(forceRefresh = false) }
            .onFailure { Log.w(TAG, "ICE prefetch failed: ${it.message}") }
    }

    /** Public ExpressTURN credentials also served by visionclaw-signaling /api/turn. */
    private fun expressTurnFallback(): PeerConnection.IceServer {
        return PeerConnection.IceServer.builder(
            listOf(
                "turn:free.expressturn.com:3478",
                "turn:free.expressturn.com:3478?transport=tcp",
                "turn:free.expressturn.com:80",
                "turn:free.expressturn.com:80?transport=tcp",
                "turns:free.expressturn.com:443?transport=tcp",
            )
        )
            .setUsername("efPU52K4SLOQ34W2QY")
            .setPassword("1TJPNFxHKXrZfelz")
            .createIceServer()
    }

    private suspend fun fetchTurnCredentials(): List<PeerConnection.IceServer> =
        withContext(Dispatchers.IO) {
            val client = OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(10, TimeUnit.SECONDS)
                .build()

            val request = Request.Builder()
                .url(turnCredentialsURL)
                .get()
                .build()

            val response = client.newCall(request).execute()
            if (!response.isSuccessful) {
                throw Exception("TURN credentials request failed: ${response.code}")
            }

            val body = response.body?.string() ?: throw Exception("Empty TURN response")
            val json = JSONObject(body)
            val servers = mutableListOf<PeerConnection.IceServer>()

            val iceServers = json.optJSONArray("iceServers")
            if (iceServers != null) {
                for (i in 0 until iceServers.length()) {
                    val server = iceServers.getJSONObject(i)
                    val username = server.optString("username", "")
                    val credential = server.optString("credential", "")
                    val urlList = mutableListOf<String>()
                    val urls = server.optJSONArray("urls")
                    if (urls != null) {
                        for (j in 0 until urls.length()) urlList.add(urls.getString(j))
                    } else {
                        server.optString("urls").takeIf { it.isNotBlank() }?.let { urlList.add(it) }
                    }
                    if (urlList.isEmpty()) continue
                    val builder = PeerConnection.IceServer.builder(urlList)
                    if (username.isNotEmpty()) builder.setUsername(username)
                    if (credential.isNotEmpty()) builder.setPassword(credential)
                    servers.add(builder.createIceServer())
                }
            } else if (json.has("urls")) {
                val urls = json.optJSONArray("urls")
                val urlList = mutableListOf<String>()
                if (urls != null) {
                    for (j in 0 until urls.length()) urlList.add(urls.getString(j))
                } else {
                    json.optString("urls").takeIf { it.isNotBlank() }?.let { urlList.add(it) }
                }
                if (urlList.isNotEmpty()) {
                    val builder = PeerConnection.IceServer.builder(urlList)
                    val username = json.optString("username", "")
                    val credential = json.optString("credential", "")
                    if (username.isNotEmpty()) builder.setUsername(username)
                    if (credential.isNotEmpty()) builder.setPassword(credential)
                    servers.add(builder.createIceServer())
                }
            }

            if (servers.isEmpty()) throw Exception("No TURN servers in response")
            servers
        }
}
