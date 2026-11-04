package com.meta.wearable.dat.externalsampleapps.cameraaccess.gemini

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.util.Log
import java.io.ByteArrayOutputStream

class AudioManager(context: Context) {
    companion object {
        private const val TAG = "AudioManager"
        private const val MIN_SEND_BYTES = 3200 // 100ms at 16kHz mono Int16 = 1600 frames * 2 bytes
    }

    var onAudioCaptured: ((ByteArray) -> Unit)? = null

    private var audioRecord: AudioRecord? = null
    private var audioTrack: AudioTrack? = null
    private var captureThread: Thread? = null
    private val systemAudioManager =
        context.applicationContext.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
    private var playbackDevice: AudioDeviceInfo? = null
    @Volatile
    private var isCapturing = false
    private val accumulatedData = ByteArrayOutputStream()
    private val accumulateLock = Any()

    @SuppressLint("MissingPermission")
    fun startCapture() {
        if (isCapturing) return

        selectPlaybackOutput()

        val bufferSize = AudioRecord.getMinBufferSize(
            GeminiConfig.INPUT_AUDIO_SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )

        audioRecord = AudioRecord(
            // Ray-Ban's microphone is owned by the Meta wearable service while
            // camera streaming and is not exposed as a reliable Android SCO
            // input. Capture speech with the phone mic instead.
            MediaRecorder.AudioSource.MIC,
            GeminiConfig.INPUT_AUDIO_SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize
        )

        val builtInMic = systemAudioManager.getDevices(android.media.AudioManager.GET_DEVICES_INPUTS)
            .firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_MIC }
        builtInMic?.let { device ->
            audioRecord?.setPreferredDevice(device)
        }

        // USAGE_MEDIA + builtin speaker: VOICE_COMMUNICATION routes to the quiet
        // earpiece on Samsung when Bluetooth is off, so AI replies seemed silent.
        audioTrack = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setSampleRate(GeminiConfig.OUTPUT_AUDIO_SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .build()
            )
            .setTransferMode(AudioTrack.MODE_STREAM)
            .setBufferSizeInBytes(
                AudioTrack.getMinBufferSize(
                    GeminiConfig.OUTPUT_AUDIO_SAMPLE_RATE,
                    AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_16BIT
                ) * 2
            )
            .build()

        playbackDevice?.let { device ->
            audioTrack?.setPreferredDevice(device)
        }

        check(audioRecord?.state == AudioRecord.STATE_INITIALIZED) {
            "Phone microphone could not be initialized"
        }
        audioRecord?.startRecording()
        check(audioRecord?.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
            "Phone microphone did not start"
        }
        audioTrack?.play()
        isCapturing = true

        synchronized(accumulateLock) {
            accumulatedData.reset()
        }

        captureThread = Thread({
            val buffer = ByteArray(bufferSize)
            var tapCount = 0
            while (isCapturing) {
                val read = audioRecord?.read(buffer, 0, buffer.size) ?: break
                if (read > 0) {
                    tapCount++
                    synchronized(accumulateLock) {
                        accumulatedData.write(buffer, 0, read)
                        if (accumulatedData.size() >= MIN_SEND_BYTES) {
                            val chunk = accumulatedData.toByteArray()
                            accumulatedData.reset()
                            if (tapCount <= 3) {
                                Log.d(TAG, "Sending chunk: ${chunk.size} bytes (~${chunk.size / 32}ms)")
                            }
                            onAudioCaptured?.invoke(chunk)
                        }
                    }
                } else if (read < 0) {
                    Log.e(TAG, "Microphone read failed: $read")
                    break
                }
            }
        }, "audio-capture").also { it.start() }

        val input = builtInMic?.productName?.toString() ?: "phone"
        val output = playbackDevice?.productName?.toString() ?: "default"
        Log.i(TAG, "Audio capture started (16kHz mono PCM16), input=$input, output=$output")
    }

    @SuppressLint("MissingPermission")
    private fun selectPlaybackOutput() {
        // Stay in MODE_NORMAL. MODE_IN_COMMUNICATION activates Ray-Ban SCO and
        // can silence phone-mic capture while glasses camera is streaming.
        systemAudioManager.mode = android.media.AudioManager.MODE_NORMAL
        runCatching { systemAudioManager.isSpeakerphoneOn = false }

        val devices = systemAudioManager.getDevices(android.media.AudioManager.GET_DEVICES_OUTPUTS)
        val bluetoothDevice = devices.firstOrNull {
            it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP
        } ?: devices.firstOrNull {
            it.type == AudioDeviceInfo.TYPE_BLE_HEADSET
        }
        val builtinSpeaker = devices.firstOrNull {
            it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
        }

        // Prefer glasses BT media when available; otherwise force loudspeaker
        // (not the earpiece) so AI replies are audible on the phone.
        playbackDevice = bluetoothDevice ?: builtinSpeaker
        when {
            bluetoothDevice != null ->
                Log.i(TAG, "Selected ${bluetoothDevice.productName} media output for AI playback")
            builtinSpeaker != null ->
                Log.i(TAG, "Selected builtin speaker for AI playback (Bluetooth off)")
            else ->
                Log.w(TAG, "No preferred output device; using system default media route")
        }
    }

    fun playAudio(data: ByteArray) {
        if (!isCapturing || data.isEmpty()) return
        audioTrack?.write(data, 0, data.size)
    }

    fun stopPlayback() {
        audioTrack?.pause()
        audioTrack?.flush()
        audioTrack?.play()
    }

    fun stopCapture() {
        if (!isCapturing) return
        isCapturing = false

        captureThread?.join(1000)
        captureThread = null

        // Flush remaining accumulated audio
        synchronized(accumulateLock) {
            if (accumulatedData.size() > 0) {
                val chunk = accumulatedData.toByteArray()
                accumulatedData.reset()
                onAudioCaptured?.invoke(chunk)
            }
        }

        audioRecord?.stop()
        audioRecord?.release()
        audioRecord = null

        audioTrack?.stop()
        audioTrack?.release()
        audioTrack = null

        systemAudioManager.mode = android.media.AudioManager.MODE_NORMAL
        playbackDevice = null

        Log.d(TAG, "Audio capture stopped")
    }
}
