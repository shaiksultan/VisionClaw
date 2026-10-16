package com.meta.wearable.dat.externalsampleapps.cameraaccess.media

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

enum class StreamKind { MUSIC, FOOTBALL }

/**
 * Free HTTP audio streams (no paid API).
 * Music: SomaFM / Radio Paradise. Football: talkSPORT / BBC Radio 5 Live (commentary / sports talk).
 */
object FreeAudioStreams {
    val music = listOf(
        "https://ice6.somafm.com/groovesalad-128-mp3",
        "https://ice6.somafm.com/dronezone-128-mp3",
        "https://stream.radioparadise.com/mp3-128",
    )
    val football = listOf(
        "https://radio.talksport.com/stream",
        "https://media-ssl.musicradio.com/TalkSport",
        "https://stream.live.vc.bbcmedia.co.uk/bbc_radio_five_live",
    )

    fun urlsFor(kind: StreamKind): List<String> = when (kind) {
        StreamKind.MUSIC -> music
        StreamKind.FOOTBALL -> football
    }

    fun labelFor(kind: StreamKind): String = when (kind) {
        StreamKind.MUSIC -> "free music radio"
        StreamKind.FOOTBALL -> "live football / sports radio (audio only)"
    }
}

object AudioStreamPlayer {
    private const val TAG = "AudioStreamPlayer"
    @Volatile private var player: MediaPlayer? = null
    @Volatile var currentKind: StreamKind? = null
        private set

    val isPlaying: Boolean
        get() = try {
            player?.isPlaying == true
        } catch (_: Exception) {
            false
        }

    suspend fun play(context: Context, kind: StreamKind): String = withContext(Dispatchers.IO) {
        stopInternal()
        val app = context.applicationContext
        val urls = FreeAudioStreams.urlsFor(kind)
        var lastError: String? = null
        for (url in urls) {
            try {
                val mp = MediaPlayer()
                mp.setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build(),
                )
                mp.setDataSource(url)
                mp.setOnErrorListener { _, what, extra ->
                    Log.w(TAG, "MediaPlayer error what=$what extra=$extra url=$url")
                    true
                }
                mp.prepare()
                mp.start()
                player = mp
                currentKind = kind
                val label = FreeAudioStreams.labelFor(kind)
                Log.i(TAG, "Playing $kind via $url")
                return@withContext "Playing $label now (audio only). Say stop music or stop football to end."
            } catch (e: Exception) {
                lastError = e.message
                Log.w(TAG, "Failed stream $url: ${e.message}")
            }
        }
        "Could not connect to a free stream: ${lastError ?: "unknown error"}"
    }

    fun stop(): String {
        val was = currentKind
        stopInternal()
        return if (was != null) "Stopped ${FreeAudioStreams.labelFor(was)}." else "No audio stream was playing."
    }

    private fun stopInternal() {
        try {
            player?.run {
                stop()
                reset()
                release()
            }
        } catch (e: Exception) {
            Log.w(TAG, "stop: ${e.message}")
        }
        player = null
        currentKind = null
    }
}
