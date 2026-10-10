package com.meta.wearable.dat.externalsampleapps.cameraaccess.webrtc

import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import org.webrtc.IceCandidate
import org.webrtc.SessionDescription
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

sealed class SignalingMessage {
    data class RoomCreated(val room: String) : SignalingMessage()
    data class RoomRejoined(val room: String) : SignalingMessage()
    object RoomJoined : SignalingMessage()
    object PeerJoined : SignalingMessage()
    object PeerLeft : SignalingMessage()
    data class Offer(val sdp: SessionDescription) : SignalingMessage()
    data class Answer(val sdp: SessionDescription) : SignalingMessage()
    data class Candidate(val candidate: IceCandidate) : SignalingMessage()
    data class Error(val message: String) : SignalingMessage()
}

class SignalingClient {
    companion object {
        private const val TAG = "SignalingClient"
        private const val PING_INTERVAL_SEC = 20L
    }

    var onMessageReceived: ((SignalingMessage) -> Unit)? = null
    var onConnected: (() -> Unit)? = null
    var onDisconnected: ((String?) -> Unit)? = null

    private var webSocket: WebSocket? = null
    private val intentionalClose = AtomicBoolean(false)
    private val sendExecutor = Executors.newSingleThreadExecutor()
    private val pingExecutor = Executors.newSingleThreadScheduledExecutor()
    private var pingTask: ScheduledFuture<*>? = null
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(PING_INTERVAL_SEC, TimeUnit.SECONDS)
        .connectTimeout(30, TimeUnit.SECONDS)
        .build()

    fun connect(url: String) {
        disconnect(notify = false)
        intentionalClose.set(false)

        val request = Request.Builder()
            .url(url)
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d(TAG, "Connected to $url")
                startAppPing(webSocket)
                onConnected?.invoke()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleMessage(text)
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "Closing: $reason")
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "Closed: $reason")
                stopAppPing()
                if (!intentionalClose.get()) {
                    onDisconnected?.invoke(reason.ifEmpty { null })
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "Failure: ${t.message}")
                stopAppPing()
                if (!intentionalClose.get()) {
                    onDisconnected?.invoke(t.message)
                }
            }
        })
    }

    fun createRoom() {
        sendJSON(JSONObject().put("type", "create"))
    }

    fun joinRoom(code: String) {
        sendJSON(JSONObject().put("type", "join").put("room", code))
    }

    fun rejoinRoom(code: String) {
        sendJSON(JSONObject().put("type", "rejoin").put("room", code))
    }

    fun sendSdp(sdp: SessionDescription) {
        val type = if (sdp.type == SessionDescription.Type.OFFER) "offer" else "answer"
        sendJSON(JSONObject().put("type", type).put("sdp", sdp.description))
    }

    fun sendCandidate(candidate: IceCandidate) {
        sendJSON(
            JSONObject()
                .put("type", "candidate")
                .put("candidate", candidate.sdp)
                .put("sdpMid", candidate.sdpMid ?: "")
                .put("sdpMLineIndex", candidate.sdpMLineIndex)
        )
    }

    fun disconnect(notify: Boolean = true) {
        if (!notify) intentionalClose.set(true)
        stopAppPing()
        webSocket?.close(1000, "Going away")
        webSocket = null
    }

    private fun startAppPing(socket: WebSocket) {
        stopAppPing()
        pingTask = pingExecutor.scheduleAtFixedRate({
            runCatching {
                socket.send(JSONObject().put("type", "ping").toString())
            }
        }, PING_INTERVAL_SEC, PING_INTERVAL_SEC, TimeUnit.SECONDS)
    }

    private fun stopAppPing() {
        pingTask?.cancel(false)
        pingTask = null
    }

    private fun sendJSON(json: JSONObject) {
        sendExecutor.execute {
            val ws = webSocket ?: return@execute
            ws.send(json.toString())
        }
    }

    private fun handleMessage(text: String) {
        try {
            val json = JSONObject(text)
            when (json.optString("type", "")) {
                "pong", "ping" -> Unit
                "room_created" -> {
                    val room = json.optString("room", "")
                    if (room.isNotEmpty()) onMessageReceived?.invoke(SignalingMessage.RoomCreated(room))
                }
                "room_joined" -> onMessageReceived?.invoke(SignalingMessage.RoomJoined)
                "room_rejoined" -> {
                    val room = json.optString("room", "")
                    if (room.isNotEmpty()) onMessageReceived?.invoke(SignalingMessage.RoomRejoined(room))
                }
                "peer_joined" -> onMessageReceived?.invoke(SignalingMessage.PeerJoined)
                "peer_left" -> onMessageReceived?.invoke(SignalingMessage.PeerLeft)
                "offer" -> {
                    val sdp = json.optString("sdp", "")
                    if (sdp.isNotEmpty()) {
                        onMessageReceived?.invoke(
                            SignalingMessage.Offer(SessionDescription(SessionDescription.Type.OFFER, sdp))
                        )
                    }
                }
                "answer" -> {
                    val sdp = json.optString("sdp", "")
                    if (sdp.isNotEmpty()) {
                        onMessageReceived?.invoke(
                            SignalingMessage.Answer(SessionDescription(SessionDescription.Type.ANSWER, sdp))
                        )
                    }
                }
                "candidate" -> {
                    val candidate = json.optString("candidate", "")
                    val sdpMid = json.optString("sdpMid", "")
                    val sdpMLineIndex = json.optInt("sdpMLineIndex", 0)
                    if (candidate.isNotEmpty()) {
                        onMessageReceived?.invoke(
                            SignalingMessage.Candidate(IceCandidate(sdpMid, sdpMLineIndex, candidate))
                        )
                    }
                }
                "error" -> {
                    val msg = json.optString("message", "Unknown signaling error")
                    onMessageReceived?.invoke(SignalingMessage.Error(msg))
                }
                else -> Log.w(TAG, "Unknown message type: ${json.optString("type")}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse signaling message: ${e.message}")
        }
    }
}
