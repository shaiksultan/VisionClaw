package com.meta.wearable.dat.externalsampleapps.cameraaccess.webrtc

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.MediaRecorder
import android.util.Log
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import org.webrtc.audio.JavaAudioDeviceModule

interface WebRTCClientDelegate {
    fun onConnectionStateChanged(state: PeerConnection.IceConnectionState)
    fun onIceCandidateGenerated(candidate: IceCandidate)
    fun onRemoteVideoTrackReceived(track: VideoTrack)
    fun onRemoteVideoTrackRemoved(track: VideoTrack)
}

class WebRTCClient(private val context: Context) {
    companion object {
        private const val TAG = "WebRTCClient"
        @Volatile private var factoryInitialized = false

        private fun ensureFactoryInitialized(context: Context) {
            if (factoryInitialized) return
            synchronized(this) {
                if (factoryInitialized) return
                PeerConnectionFactory.initialize(
                    PeerConnectionFactory.InitializationOptions.builder(context.applicationContext)
                        .setEnableInternalTracer(false)
                        .createInitializationOptions()
                )
                factoryInitialized = true
            }
        }
    }

    var delegate: WebRTCClientDelegate? = null

    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var peerConnection: PeerConnection? = null
    private var localVideoTrack: VideoTrack? = null
    private var localAudioTrack: AudioTrack? = null
    private var remoteVideoTrack: VideoTrack? = null
    private var videoSource: VideoSource? = null
    private var audioSource: AudioSource? = null
    private var audioDeviceModule: JavaAudioDeviceModule? = null
    private var customCapturer: CustomVideoCapturer? = null
    private var previousAudioMode: Int = AudioManager.MODE_NORMAL

    val eglBase: EglBase = EglBase.create()

    @SuppressLint("MissingPermission")
    fun setup(iceServers: List<PeerConnection.IceServer>?) {
        ensureFactoryInitialized(context)
        configureAudioForCall(true)

        val encoderFactory = DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true)
        val decoderFactory = DefaultVideoDecoderFactory(eglBase.eglBaseContext)
        // Use the phone built-in mic. Ray-Ban SCO mic is owned by Meta while camera
        // streams — MODE_IN_COMMUNICATION / SCO routing silences WebRTC capture.
        val admBuilder = JavaAudioDeviceModule.builder(context.applicationContext)
            .setAudioSource(MediaRecorder.AudioSource.MIC)
            .setUseHardwareAcousticEchoCanceler(true)
            .setUseHardwareNoiseSuppressor(true)
        val adm = admBuilder.createAudioDeviceModule()
        preferBuiltinMic(adm)
        audioDeviceModule = adm

        peerConnectionFactory = PeerConnectionFactory.builder()
            .setAudioDeviceModule(adm)
            .setVideoEncoderFactory(encoderFactory)
            .setVideoDecoderFactory(decoderFactory)
            .createPeerConnectionFactory()

        val rtcConfig = PeerConnection.RTCConfiguration(
            iceServers ?: listOf(
                PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
            )
        )
        rtcConfig.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        rtcConfig.continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        rtcConfig.iceTransportsType = PeerConnection.IceTransportsType.ALL
        rtcConfig.bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
        rtcConfig.rtcpMuxPolicy = PeerConnection.RtcpMuxPolicy.REQUIRE
        rtcConfig.tcpCandidatePolicy = PeerConnection.TcpCandidatePolicy.ENABLED

        peerConnection = peerConnectionFactory?.createPeerConnection(
            rtcConfig,
            object : PeerConnection.Observer {
                override fun onSignalingChange(state: PeerConnection.SignalingState?) {
                    Log.d(TAG, "Signaling state: $state")
                }

                override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
                    Log.d(TAG, "ICE connection state: $state")
                    state?.let { delegate?.onConnectionStateChanged(it) }
                }

                override fun onIceConnectionReceivingChange(receiving: Boolean) {}

                override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {
                    Log.d(TAG, "ICE gathering state: $state")
                }

                override fun onIceCandidate(candidate: IceCandidate?) {
                    candidate?.let {
                        when {
                            it.sdp.contains("relay") -> Log.d(TAG, "ICE candidate: RELAY (TURN)")
                            it.sdp.contains("srflx") -> Log.d(TAG, "ICE candidate: SERVER REFLEXIVE (STUN)")
                            it.sdp.contains("host") -> Log.d(TAG, "ICE candidate: HOST (local)")
                        }
                        delegate?.onIceCandidateGenerated(it)
                    }
                }

                override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {}

                override fun onAddStream(stream: MediaStream?) {
                    Log.d(TAG, "Remote stream added: video=${stream?.videoTracks?.size} audio=${stream?.audioTracks?.size}")
                    stream?.videoTracks?.firstOrNull()?.let { track ->
                        remoteVideoTrack = track
                        delegate?.onRemoteVideoTrackReceived(track)
                    }
                }

                override fun onRemoveStream(stream: MediaStream?) {
                    remoteVideoTrack?.let { track ->
                        remoteVideoTrack = null
                        delegate?.onRemoteVideoTrackRemoved(track)
                    }
                }

                override fun onDataChannel(channel: DataChannel?) {}
                override fun onRenegotiationNeeded() {
                    Log.d(TAG, "Negotiation needed")
                }
                override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) {
                    val track = receiver?.track()
                    if (track is VideoTrack) {
                        Log.d(TAG, "Remote video track via onAddTrack")
                        remoteVideoTrack = track
                        delegate?.onRemoteVideoTrackReceived(track)
                    } else if (track != null) {
                        Log.d(TAG, "Remote track via onAddTrack kind=${track.kind()}")
                    }
                }
            }
        )

        val factory = peerConnectionFactory ?: return
        videoSource = factory.createVideoSource(false)
        customCapturer = CustomVideoCapturer().apply { initialize(videoSource!!) }
        localVideoTrack = factory.createVideoTrack("video0", videoSource).apply {
            setEnabled(true)
        }
        peerConnection?.addTrack(localVideoTrack, listOf("stream0"))

        val audioConstraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googNoiseSuppression", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googHighpassFilter", "true"))
        }
        audioSource = factory.createAudioSource(audioConstraints)
        localAudioTrack = factory.createAudioTrack("AUDIO", audioSource).apply {
            setEnabled(true)
        }
        peerConnection?.addTrack(localAudioTrack, listOf("stream0"))
        Log.d(TAG, "Local audio+video tracks added")
    }

    fun pushVideoFrame(bitmap: Bitmap) {
        customCapturer?.pushFrame(bitmap)
    }

    fun createOffer(onSuccess: (SessionDescription) -> Unit) {
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "true"))
        }

        peerConnection?.createOffer(object : SdpObserver {
            override fun onCreateSuccess(sdp: SessionDescription?) {
                sdp?.let { offer ->
                    peerConnection?.setLocalDescription(object : SdpObserver {
                        override fun onSetSuccess() {
                            Log.d(TAG, "Local offer set (audio m-line present=${offer.description.contains("m=audio")})")
                            onSuccess(offer)
                        }
                        override fun onSetFailure(error: String?) {
                            Log.e(TAG, "Failed to set local description: $error")
                        }
                        override fun onCreateSuccess(p0: SessionDescription?) {}
                        override fun onCreateFailure(p0: String?) {}
                    }, offer)
                }
            }
            override fun onCreateFailure(error: String?) {
                Log.e(TAG, "Failed to create offer: $error")
            }
            override fun onSetSuccess() {}
            override fun onSetFailure(p0: String?) {}
        }, constraints)
    }

    fun setRemoteSdp(sdp: SessionDescription, onComplete: (String?) -> Unit) {
        peerConnection?.setRemoteDescription(object : SdpObserver {
            override fun onSetSuccess() {
                onComplete(null)
            }
            override fun onSetFailure(error: String?) {
                onComplete(error)
            }
            override fun onCreateSuccess(p0: SessionDescription?) {}
            override fun onCreateFailure(p0: String?) {}
        }, sdp)
    }

    fun addRemoteCandidate(candidate: IceCandidate, onComplete: (String?) -> Unit) {
        val success = peerConnection?.addIceCandidate(candidate) ?: false
        onComplete(if (success) null else "Failed to add ICE candidate")
    }

    fun muteAudio(mute: Boolean) {
        localAudioTrack?.setEnabled(!mute)
    }

    fun close() {
        localVideoTrack?.setEnabled(false)
        localAudioTrack?.setEnabled(false)
        localVideoTrack?.dispose()
        localAudioTrack?.dispose()
        localVideoTrack = null
        localAudioTrack = null
        remoteVideoTrack = null
        customCapturer?.dispose()
        customCapturer = null
        videoSource?.dispose()
        videoSource = null
        audioSource?.dispose()
        audioSource = null
        peerConnection?.close()
        peerConnection?.dispose()
        peerConnection = null
        peerConnectionFactory?.dispose()
        peerConnectionFactory = null
        runCatching { audioDeviceModule?.release() }
        audioDeviceModule = null
        configureAudioForCall(false)
        Log.d(TAG, "Peer connection closed")
    }

    private fun preferBuiltinMic(adm: JavaAudioDeviceModule) {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        val builtin = am.getDevices(AudioManager.GET_DEVICES_INPUTS)
            .firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_MIC }
            ?: return
        runCatching {
            val method = adm.javaClass.methods.firstOrNull {
                it.name == "setPreferredInputDevice" && it.parameterTypes.size == 1
            }
            method?.invoke(adm, builtin)
            Log.i(TAG, "Preferred WebRTC input: ${builtin.productName}")
        }.onFailure {
            Log.d(TAG, "setPreferredInputDevice unavailable: ${it.message}")
        }
    }

    private fun configureAudioForCall(active: Boolean) {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        try {
            if (active) {
                previousAudioMode = am.mode
                // Stay in MODE_NORMAL. MODE_IN_COMMUNICATION activates Ray-Ban SCO
                // while glasses camera streams; Meta owns that route and Android
                // silences our WebRTC/phone mic capture (same as Gemini AudioManager).
                am.mode = AudioManager.MODE_NORMAL
                runCatching { am.clearCommunicationDevice() }
            } else {
                am.mode = previousAudioMode
            }
        } catch (e: Exception) {
            Log.w(TAG, "AudioManager configure failed: ${e.message}")
        }
    }
}
