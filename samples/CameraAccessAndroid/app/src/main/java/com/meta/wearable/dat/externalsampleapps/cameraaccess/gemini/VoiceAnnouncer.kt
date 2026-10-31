package com.meta.wearable.dat.externalsampleapps.cameraaccess.gemini

import android.content.Context
import android.speech.tts.TextToSpeech
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Immediate local spoken feedback while Gemini/tools are still working.
 * Used so the wearer hears "hold on" without waiting for the model turn.
 */
class VoiceAnnouncer(context: Context) {
    companion object {
        private const val TAG = "VoiceAnnouncer"
    }

    private val ready = AtomicBoolean(false)
    private var tts: TextToSpeech? = TextToSpeech(context.applicationContext) { status ->
        if (status == TextToSpeech.SUCCESS) {
            tts?.language = com.meta.wearable.dat.externalsampleapps.cameraaccess.settings.SettingsManager.assistantLanguage.locale
            tts?.setSpeechRate(1.05f)
            ready.set(true)
            Log.i(TAG, "TTS ready")
        } else {
            Log.w(TAG, "TTS init failed: $status")
        }
    }

    fun speak(text: String) {
        val message = text.trim()
        if (message.isEmpty()) return
        val engine = tts ?: return
        if (!ready.get()) {
            Log.d(TAG, "TTS not ready, skip: $message")
            return
        }
        engine.language = com.meta.wearable.dat.externalsampleapps.cameraaccess.settings.SettingsManager.assistantLanguage.locale
        engine.speak(message, TextToSpeech.QUEUE_FLUSH, null, "announce-${System.nanoTime()}")
    }

    fun stop() {
        try {
            tts?.stop()
        } catch (e: Exception) {
            Log.w(TAG, "TTS stop failed", e)
        }
    }

    fun shutdown() {
        try {
            tts?.stop()
            tts?.shutdown()
        } catch (e: Exception) {
            Log.w(TAG, "TTS shutdown failed", e)
        }
        tts = null
        ready.set(false)
    }
}
