package com.meta.wearable.dat.externalsampleapps.cameraaccess.webrtc

import android.app.Application
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.webrtc.IceCandidate
import org.webrtc.PeerConnection
import org.webrtc.VideoTrack

sealed class WebRTCConnectionState {
    object Disconnected : WebRTCConnectionState()
    object Connecting : WebRTCConnectionState()
    object WaitingForPeer : WebRTCConnectionState()
    object Connected : WebRTCConnectionState()
    object Backgrounded : WebRTCConnectionState()
    data class Error(val message: String) : WebRTCConnectionState()
}

data class WebRTCUiState(
    val isActive: Boolean = false,
    val isSupportMode: Boolean = false,
    val supportCallCode: String = "",
    val connectionState: WebRTCConnectionState = WebRTCConnectionState.Disconnected,
    val roomCode: String = "",
    val isMuted: Boolean = false,
    val errorMessage: String? = null,
    val remoteVideoTrack: VideoTrack? = null,
    val hasRemoteVideo: Boolean = false,
)

/**
 * Streamer-side WebRTC session.
 * Keep offer / ICE handling simple — aggressive renegotiation was breaking Expert Engineer calls.
 */
class WebRTCSessionViewModel(application: Application) : AndroidViewModel(application) {
    companion object {
        private const val TAG = "WebRTCSessionVM"
    }

    private val _uiState = MutableStateFlow(WebRTCUiState())
    val uiState: StateFlow<WebRTCUiState> = _uiState.asStateFlow()

    private var webRTCClient: WebRTCClient? = null
    private var signalingClient: SignalingClient? = null
    private var savedRoomCode: String? = null
    private var reconnectAttempt = 0
    private var reconnectJob: kotlinx.coroutines.Job? = null
    private var signalingGeneration = 0
    private var sessionGeneration = 0
    /** True after ICE reaches Connected at least once in this support session. */
    private var supportEverConnected = false
    var onRoomCreated: ((String) -> Unit)? = null
    /** Fired when the remote expert leaves while a support session is still active. */
    var onSupportPeerLeft: (() -> Unit)? = null

    fun getEglBase() = webRTCClient?.eglBase

    fun startSupportSession(supportCallCode: String) {
        if (_uiState.value.isActive) {
            Log.d(TAG, "Restarting support session for $supportCallCode")
            stopSession()
        }
        _uiState.value = _uiState.value.copy(isSupportMode = true, supportCallCode = supportCallCode)
        startSession()
    }

    private val lifecycleObserver = object : DefaultLifecycleObserver {
        override fun onStart(owner: LifecycleOwner) {
            handleReturnToForeground()
        }
    }

    fun startSession() {
        if (_uiState.value.isActive) return

        if (!WebRTCConfig.isConfigured) {
            _uiState.value = _uiState.value.copy(
                errorMessage = "WebRTC signaling URL not configured."
            )
            return
        }

        reconnectAttempt = 0
        reconnectJob?.cancel()
        supportEverConnected = false
        val generation = ++sessionGeneration
        _uiState.value = _uiState.value.copy(
            isActive = true,
            connectionState = WebRTCConnectionState.Connecting,
            errorMessage = null,
        )
        savedRoomCode = null

        viewModelScope.launch {
            val iceServers = WebRTCConfig.fetchIceServers()
            // User may have ended the call while ICE servers were loading.
            if (generation != sessionGeneration || !_uiState.value.isActive) {
                Log.d(TAG, "Start aborted — session already stopped")
                return@launch
            }
            setupWebRTCClient(iceServers)
            if (generation != sessionGeneration || !_uiState.value.isActive) {
                webRTCClient?.close()
                webRTCClient = null
                Log.d(TAG, "Start aborted after peer setup — session already stopped")
                return@launch
            }
            connectSignaling(rejoinCode = null)
            observeForeground()
        }
    }

    fun stopSession() {
        Log.d(TAG, "stopSession")
        reconnectJob?.cancel()
        reconnectJob = null
        removeForegroundObserver()
        sessionGeneration += 1
        signalingGeneration += 1
        // Clear UI first so overlays disappear even if teardown is slow.
        _uiState.value = WebRTCUiState()
        savedRoomCode = null
        reconnectAttempt = 0
        val client = webRTCClient
        webRTCClient = null
        val signaling = signalingClient
        signalingClient = null
        runCatching { client?.close() }
        runCatching { signaling?.disconnect(notify = false) }
    }

    fun toggleMute() {
        val newMuted = !_uiState.value.isMuted
        _uiState.value = _uiState.value.copy(isMuted = newMuted)
        webRTCClient?.muteAudio(newMuted)
    }

    fun copyRoomCode() {
        val code = _uiState.value.roomCode
        if (code.isNotEmpty()) {
            val clipboard = getApplication<Application>()
                .getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("Room Code", code))
        }
    }

    fun pushVideoFrame(bitmap: Bitmap) {
        if (!_uiState.value.isActive) return
        // Push while waiting too so frames are ready as soon as ICE connects.
        when (_uiState.value.connectionState) {
            is WebRTCConnectionState.WaitingForPeer,
            is WebRTCConnectionState.Connected,
            is WebRTCConnectionState.Connecting -> webRTCClient?.pushVideoFrame(bitmap)
            else -> Unit
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }

    private fun setupWebRTCClient(iceServers: List<PeerConnection.IceServer>) {
        webRTCClient?.close()
        val client = WebRTCClient(getApplication())
        client.delegate = object : WebRTCClientDelegate {
            override fun onConnectionStateChanged(state: PeerConnection.IceConnectionState) {
                viewModelScope.launch { handleConnectionStateChange(state) }
            }
            override fun onIceCandidateGenerated(candidate: IceCandidate) {
                signalingClient?.sendCandidate(candidate)
            }
            override fun onRemoteVideoTrackReceived(track: VideoTrack) {
                viewModelScope.launch {
                    _uiState.value = _uiState.value.copy(
                        remoteVideoTrack = track,
                        hasRemoteVideo = true,
                    )
                    Log.d(TAG, "Remote video track received")
                }
            }
            override fun onRemoteVideoTrackRemoved(track: VideoTrack) {
                viewModelScope.launch {
                    _uiState.value = _uiState.value.copy(
                        remoteVideoTrack = null,
                        hasRemoteVideo = false,
                    )
                    Log.d(TAG, "Remote video track removed")
                }
            }
        }
        client.setup(iceServers)
        webRTCClient = client
    }

    private fun connectSignaling(rejoinCode: String?) {
        signalingClient?.disconnect(notify = false)
        val generation = ++signalingGeneration

        val signaling = SignalingClient()
        signalingClient = signaling

        signaling.onConnected = {
            viewModelScope.launch {
                if (generation != signalingGeneration || !_uiState.value.isActive) return@launch
                reconnectAttempt = 0
                if (rejoinCode != null) {
                    Log.d(TAG, "Reconnected, rejoining room: $rejoinCode")
                    signalingClient?.rejoinRoom(rejoinCode)
                } else {
                    signalingClient?.createRoom()
                }
            }
        }

        signaling.onMessageReceived = { message ->
            viewModelScope.launch {
                if (generation != signalingGeneration) return@launch
                handleSignalingMessage(message)
            }
        }

        signaling.onDisconnected = { reason ->
            viewModelScope.launch {
                if (generation != signalingGeneration || !_uiState.value.isActive) return@launch
                Log.w(TAG, "Signaling disconnected, scheduling reconnect: $reason")
                _uiState.value = _uiState.value.copy(
                    connectionState = WebRTCConnectionState.Backgrounded,
                    errorMessage = null,
                )
                scheduleReconnect()
            }
        }

        signaling.connect(WebRTCConfig.signalingServerURL)
    }

    private fun scheduleReconnect() {
        if (!_uiState.value.isActive) return
        reconnectJob?.cancel()
        val delayMs = (1000L * (1 shl reconnectAttempt.coerceAtMost(4))).coerceAtMost(15_000L)
        reconnectAttempt += 1
        reconnectJob = viewModelScope.launch {
            kotlinx.coroutines.delay(delayMs)
            if (!_uiState.value.isActive) return@launch
            val code = savedRoomCode
            Log.d(TAG, "Reconnecting signaling (attempt $reconnectAttempt), room=$code")
            _uiState.value = _uiState.value.copy(connectionState = WebRTCConnectionState.Connecting)
            connectSignaling(rejoinCode = code)
        }
    }

    private fun handleSignalingMessage(message: SignalingMessage) {
        when (message) {
            is SignalingMessage.RoomCreated -> {
                _uiState.value = _uiState.value.copy(
                    roomCode = message.room,
                    connectionState = WebRTCConnectionState.WaitingForPeer,
                    errorMessage = null,
                )
                savedRoomCode = message.room
                onRoomCreated?.invoke(message.room)
                Log.d(TAG, "Room created: ${message.room}")
            }
            is SignalingMessage.RoomRejoined -> {
                _uiState.value = _uiState.value.copy(
                    roomCode = message.room,
                    connectionState = WebRTCConnectionState.WaitingForPeer,
                    errorMessage = null,
                )
                savedRoomCode = message.room
                onRoomCreated?.invoke(message.room)
                Log.d(TAG, "Room rejoined: ${message.room}")
            }
            is SignalingMessage.PeerJoined -> {
                // Simple path that used to work: offer on the existing peer connection.
                Log.d(TAG, "Peer joined, creating offer")
                webRTCClient?.createOffer { sdp ->
                    signalingClient?.sendSdp(sdp)
                    Log.d(TAG, "Offer sent")
                }
            }
            is SignalingMessage.Answer -> {
                webRTCClient?.setRemoteSdp(message.sdp) { error ->
                    error?.let { Log.e(TAG, "Error setting remote SDP: $it") }
                }
            }
            is SignalingMessage.Candidate -> {
                webRTCClient?.addRemoteCandidate(message.candidate) { error ->
                    error?.let { Log.e(TAG, "Error adding ICE candidate: $it") }
                }
            }
            is SignalingMessage.PeerLeft -> {
                Log.d(TAG, "Peer left support=${_uiState.value.isSupportMode}")
                if (_uiState.value.isSupportMode && _uiState.value.isActive) {
                    // Expert hung up / closed viewer — end cleanly instead of sticky "Waiting…".
                    val callback = onSupportPeerLeft
                    stopSession()
                    callback?.invoke()
                } else {
                    _uiState.value = _uiState.value.copy(
                        connectionState = WebRTCConnectionState.WaitingForPeer,
                        remoteVideoTrack = null,
                        hasRemoteVideo = false,
                    )
                }
            }
            is SignalingMessage.Error -> {
                if (message.message.equals("Room not found", ignoreCase = true)) {
                    Log.d(TAG, "Room expired/not found — creating a new room")
                    savedRoomCode = null
                    signalingClient?.createRoom()
                    _uiState.value = _uiState.value.copy(
                        connectionState = WebRTCConnectionState.Connecting,
                        errorMessage = null,
                    )
                } else {
                    Log.w(TAG, "Signaling error: ${message.message}")
                    _uiState.value = _uiState.value.copy(errorMessage = message.message)
                }
            }
            is SignalingMessage.RoomJoined, is SignalingMessage.Offer -> Unit
        }
    }

    private fun handleConnectionStateChange(state: PeerConnection.IceConnectionState) {
        when (state) {
            PeerConnection.IceConnectionState.CONNECTED,
            PeerConnection.IceConnectionState.COMPLETED -> {
                if (_uiState.value.isSupportMode) supportEverConnected = true
                _uiState.value = _uiState.value.copy(
                    connectionState = WebRTCConnectionState.Connected,
                    errorMessage = null,
                )
                Log.d(TAG, "Peer connected")
            }
            PeerConnection.IceConnectionState.DISCONNECTED -> {
                // Transient for normal WebRTC. After a live Expert Engineer call, PC hangup
                // often skips peer_left — end cleanly instead of sticky "Waiting…".
                _uiState.value = _uiState.value.copy(
                    connectionState = WebRTCConnectionState.WaitingForPeer
                )
                maybeEndSupportAfterIceDrop("disconnected")
            }
            PeerConnection.IceConnectionState.FAILED -> {
                Log.w(TAG, "ICE failed")
                _uiState.value = _uiState.value.copy(
                    connectionState = WebRTCConnectionState.WaitingForPeer,
                    remoteVideoTrack = null,
                    hasRemoteVideo = false,
                    errorMessage = null,
                )
                maybeEndSupportAfterIceDrop("failed")
            }
            PeerConnection.IceConnectionState.CLOSED -> {
                if (_uiState.value.isActive) {
                    _uiState.value = _uiState.value.copy(
                        connectionState = WebRTCConnectionState.WaitingForPeer
                    )
                }
            }
            else -> {}
        }
    }

    private fun maybeEndSupportAfterIceDrop(reason: String) {
        if (!supportEverConnected) return
        if (!_uiState.value.isSupportMode || !_uiState.value.isActive) return
        val generation = sessionGeneration
        viewModelScope.launch {
            kotlinx.coroutines.delay(if (reason == "failed") 1_000L else 2_500L)
            val stillStuck = generation == sessionGeneration &&
                _uiState.value.isActive &&
                _uiState.value.isSupportMode &&
                supportEverConnected &&
                _uiState.value.connectionState is WebRTCConnectionState.WaitingForPeer &&
                !_uiState.value.hasRemoteVideo
            if (!stillStuck) return@launch
            Log.d(TAG, "Support ICE $reason after connect — ending as peer left")
            val callback = onSupportPeerLeft
            stopSession()
            callback?.invoke()
        }
    }

    private fun handleReturnToForeground() {
        val code = savedRoomCode ?: return
        if (!_uiState.value.isActive) return

        Log.d(TAG, "App returned to foreground, reconnecting to room: $code")
        _uiState.value = _uiState.value.copy(
            connectionState = WebRTCConnectionState.Connecting,
            remoteVideoTrack = null,
            hasRemoteVideo = false,
            errorMessage = null,
        )

        webRTCClient?.close()
        reconnectJob?.cancel()

        viewModelScope.launch {
            val iceServers = WebRTCConfig.fetchIceServers()
            setupWebRTCClient(iceServers)
            connectSignaling(rejoinCode = code)
        }
    }

    private fun observeForeground() {
        ProcessLifecycleOwner.get().lifecycle.addObserver(lifecycleObserver)
    }

    private fun removeForegroundObserver() {
        ProcessLifecycleOwner.get().lifecycle.removeObserver(lifecycleObserver)
    }

    override fun onCleared() {
        super.onCleared()
        stopSession()
    }
}
