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
    private var communicationDevice: AudioDeviceInfo? = null
    @Volatile
    private var isCapturing = false
    private val accumulatedData = ByteArrayOutputStream()
    private val accumulateLock = Any()

    @SuppressLint("MissingPermission")
    fun startCapture() {
        if (isCapturing) return

        selectGlassesForPlayback()

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

        audioTrack = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
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

        communicationDevice?.let { device ->
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
        val output = communicationDevice?.productName?.toString() ?: "phone"
        Log.i(TAG, "Audio capture started (16kHz mono PCM16), input=$input, output=$output")
    }

    @SuppressLint("MissingPermission")
    private fun selectGlassesForPlayback() {
        // MODE_IN_COMMUNICATION makes Samsung activate the Ray-Ban SCO voice
        // route. Meta's wearable service owns that route while its camera is
        // streaming, and Android consequently marks our AudioRecord as
        // "silenced". Stay in normal media mode and route output only; this
        // leaves the built-in phone microphone available for transcription.
        systemAudioManager.mode = android.media.AudioManager.MODE_NORMAL

        val devices = systemAudioManager.getDevices(android.media.AudioManager.GET_DEVICES_OUTPUTS)
        val bluetoothDevice = devices.firstOrNull {
            it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP
        } ?: devices.firstOrNull {
            it.type == AudioDeviceInfo.TYPE_BLE_HEADSET
        }

        communicationDevice = bluetoothDevice
        if (bluetoothDevice == null) {
            Log.w(TAG, "No Bluetooth communication device available; using phone audio")
            return
        }

        // Do not call setCommunicationDevice here: it also redirects microphone
        // input to SCO, which Meta owns during glasses camera streaming. The
        // AudioTrack preferred device below affects playback only.
        Log.i(TAG, "Selected ${bluetoothDevice.productName} media output for AI playback")
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
        communicationDevice = null

        Log.d(TAG, "Audio capture stopped")
    }
}
