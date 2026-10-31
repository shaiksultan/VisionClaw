package com.meta.wearable.dat.externalsampleapps.cameraaccess.media

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.meta.wearable.dat.externalsampleapps.cameraaccess.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

enum class StreamKind { MUSIC, FOOTBALL, BBC }

/**
 * Free HTTP audio (no paid API).
 * Music: UAE national anthem, then SomaFM / Radio Paradise.
 * BBC: World Service live stream for listeners outside the UK.
 * Football button: free English-song radio (SomaFM Indie Pop, Lush, Radio Paradise).
 */
object FreeAudioStreams {
    val music = listOf(
        "https://ice6.somafm.com/groovesalad-128-mp3",
        "https://ice6.somafm.com/dronezone-128-mp3",
        "https://stream.radioparadise.com/mp3-128",
    )
    // Direct MP3. The HLS playlist currently returns a dead media URL and MediaPlayer waits a long time.
    val bbc = listOf(
        "https://stream.live.vc.bbcmedia.co.uk/bbc_world_service",
        "http://stream.live.vc.bbcmedia.co.uk/bbc_world_service",
    )
    val football = listOf(
        "https://ice6.somafm.com/indiepop-128-mp3",
        "https://ice6.somafm.com/lush-128-mp3",
        "https://stream.radioparadise.com/mp3-128",
        "https://ice6.somafm.com/poptron-128-mp3",
    )

    fun urlsFor(kind: StreamKind): List<String> = when (kind) {
        StreamKind.MUSIC -> music
        StreamKind.FOOTBALL -> football
        StreamKind.BBC -> bbc
    }

    fun labelFor(kind: StreamKind): String = when (kind) {
        StreamKind.MUSIC -> "live music"
        StreamKind.FOOTBALL -> "free English songs radio"
        StreamKind.BBC -> "live BBC radio"
    }
}

object AudioStreamPlayer {
    private const val TAG = "AudioStreamPlayer"
    private val mainHandler = Handler(Looper.getMainLooper())
    private val generation = AtomicInteger(0)
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
        val gen = generation.incrementAndGet()
        stopInternal()
        val app = context.applicationContext
        if (kind == StreamKind.MUSIC && startAnthem(app, gen)) {
            return@withContext "Playing the UAE national anthem, then live music."
        }
        if (startRemote(app, kind, gen)) playingMessage(kind)
        else "Could not connect to a free stream."
    }

    fun stop(): String {
        val was = currentKind
        generation.incrementAndGet()
        stopInternal()
        return if (was != null) "Stopped ${FreeAudioStreams.labelFor(was)}." else "No audio stream was playing."
    }

    private fun playingMessage(kind: StreamKind): String = when (kind) {
        StreamKind.MUSIC -> "Playing live music now (audio only). Say stop music to end."
        StreamKind.FOOTBALL -> "Playing free English songs radio now. Say stop football to end."
        StreamKind.BBC -> "Playing live BBC radio now (audio only). Say stop radio to end."
    }

    private fun startAnthem(app: Context, gen: Int): Boolean {
        return try {
            val mp = newPlayer()
            val afd = app.resources.openRawResourceFd(R.raw.uae_national_anthem)
            mp.setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
            afd.close()
            mp.setOnCompletionListener {
                mainHandler.post {
                    if (generation.get() != gen) return@post
                    Thread {
                        if (!startRemote(app, StreamKind.MUSIC, gen)) {
                            Log.w(TAG, "Live music failed after the anthem")
                        }
                    }.start()
                }
            }
            mp.prepare()
            if (generation.get() != gen) {
                mp.release()
                return false
            }
            mp.start()
            player = mp
            currentKind = StreamKind.MUSIC
            Log.i(TAG, "Playing UAE national anthem")
            true
        } catch (e: Exception) {
            Log.w(TAG, "Anthem failed: ${e.message}")
            false
        }
    }

    private fun startRemote(app: Context, kind: StreamKind, gen: Int): Boolean {
        if (generation.get() != gen) return false
        stopInternal()
        var lastError: String? = null
        for (url in FreeAudioStreams.urlsFor(kind)) {
            if (generation.get() != gen) return false
            try {
                val mp = newPlayer()
                mp.setDataSource(
                    app,
                    Uri.parse(url),
                    mapOf("Icy-MetaData" to "1"),
                )
                Log.i(TAG, "Connecting $kind $url")
                if (!prepareWithTimeout(mp, 6_000)) {
                    lastError = "timed out"
                    Log.w(TAG, "Timed out $url")
                    releaseQuietly(mp)
                    continue
                }
                if (generation.get() != gen) {
                    releaseQuietly(mp)
                    return false
                }
                mp.start()
                player = mp
                currentKind = kind
                Log.i(TAG, "Playing $kind via $url")
                return true
            } catch (e: Exception) {
                lastError = e.message
                Log.w(TAG, "Failed stream $url: ${e.message}")
            }
        }
        Log.w(TAG, "All streams failed for $kind: $lastError")
        return false
    }

    private fun prepareWithTimeout(mp: MediaPlayer, timeoutMs: Long): Boolean {
        val latch = CountDownLatch(1)
        val prepared = AtomicBoolean(false)
        mp.setOnPreparedListener {
            prepared.set(true)
            latch.countDown()
        }
        mp.setOnErrorListener { _, what, extra ->
            Log.w(TAG, "MediaPlayer error what=$what extra=$extra")
            latch.countDown()
            true
        }
        mp.prepareAsync()
        val finished = latch.await(timeoutMs, TimeUnit.MILLISECONDS)
        return finished && prepared.get()
    }

    private fun releaseQuietly(mp: MediaPlayer) {
        try {
            mp.reset()
            mp.release()
        } catch (e: Exception) {
            Log.w(TAG, "release: ${e.message}")
        }
    }

    private fun newPlayer(): MediaPlayer = MediaPlayer().apply {
        setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build(),
        )
    }

    private fun stopInternal() {
        try {
            player?.run {
                setOnCompletionListener(null)
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
