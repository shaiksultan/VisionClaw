package com.labvision.expert

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class WatchService : Service() {
    private val api = MissionApi()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val main = Handler(Looper.getMainLooper())
    private var loop: Job? = null
    private var ringtone: Ringtone? = null
    private var ringingId: Int? = null
    private var cpuLock: PowerManager.WakeLock? = null
    private var screenLock: PowerManager.WakeLock? = null
    private var focusRequest: AudioFocusRequest? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        createChannels()
        val note = statusNotification("Available", "Waiting for a support call")
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(STATUS_ID, note, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(STATUS_ID, note)
        }
        holdCpu()
        if (loop == null) {
            loop = scope.launch {
                while (isActive) {
                    pollOnce()
                    delay(2000)
                }
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        loop?.cancel()
        main.post { stopRing() }
        cpuLock?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }

    private fun pollOnce() {
        val base = ExpertBus.baseUrl.value.ifBlank { ExpertBus.DEFAULT_BASE }
        try {
            val calls = api.list(base)
            ExpertBus.calls.value = calls
            ExpertBus.linkError.value = null
            val incoming = ExpertBus.incoming()
            if (incoming != null) {
                ring(incoming)
            } else if (ringingId != null) {
                main.post {
                    stopRing()
                    cancelIncoming()
                }
            }
            val active = ExpertBus.activeId.value
            if (active != null && ExpertBus.screen.value == ExpertScreen.Live) {
                val call = calls.find { it.id == active }
                if (call == null || call.ended) {
                    ExpertBus.ticketLine.value = call?.ticketCode?.takeIf { it.isNotBlank() }?.let { "Ticket $it created" }
                        ?: "Call ended"
                    ExpertBus.screen.value = ExpertScreen.Ended
                    ExpertBus.activeId.value = null
                }
            }
        } catch (err: Exception) {
            ExpertBus.linkError.value = err.message ?: "Cannot reach Mission Control"
        }
    }

    private fun ring(call: SupportCall) {
        val first = ringingId != call.id
        if (first) ringingId = call.id
        main.post {
            if (first) {
                wakeScreen()
                startRing()
                openCallScreen()
            }
            getSystemService(NotificationManager::class.java).notify(CALL_ID, incomingNotification(call))
        }
    }

    private fun openCallScreen() {
        val launch = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        try {
            startActivity(launch)
        } catch (_: Exception) {
        }
    }

    private fun holdCpu() {
        if (cpuLock?.isHeld == true) return
        val power = getSystemService(PowerManager::class.java)
        cpuLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "labexpert:watch").apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    @Suppress("DEPRECATION")
    private fun wakeScreen() {
        val power = getSystemService(PowerManager::class.java)
        if (screenLock?.isHeld == true) screenLock?.release()
        screenLock = power.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
            "labexpert:incoming",
        ).apply {
            setReferenceCounted(false)
            acquire(45_000)
        }
    }

    private fun startRing() {
        if (ringtone?.isPlaying == true) return
        val audio = getSystemService(AudioManager::class.java)
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        if (Build.VERSION.SDK_INT >= 26) {
            val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(attrs)
                .build()
            focusRequest = request
            audio.requestAudioFocus(request)
        }
        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        ringtone = RingtoneManager.getRingtone(applicationContext, uri)?.apply {
            audioAttributes = attrs
            if (Build.VERSION.SDK_INT >= 28) isLooping = true
            play()
        }
        val pattern = longArrayOf(0, 700, 500, 700)
        val vibrator = getSystemService(Vibrator::class.java)
        if (Build.VERSION.SDK_INT >= 33) {
            vibrator.vibrate(
                VibrationEffect.createWaveform(pattern, 0),
                VibrationAttributes.createForUsage(VibrationAttributes.USAGE_RINGTONE),
            )
        } else if (Build.VERSION.SDK_INT >= 26) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0))
        }
    }

    private fun stopRing() {
        ringingId = null
        ringtone?.stop()
        ringtone = null
        getSystemService(Vibrator::class.java).cancel()
        if (Build.VERSION.SDK_INT >= 26) {
            focusRequest?.let { getSystemService(AudioManager::class.java).abandonAudioFocusRequest(it) }
        }
        focusRequest = null
        screenLock?.let { if (it.isHeld) it.release() }
        screenLock = null
    }

    private fun cancelIncoming() {
        getSystemService(NotificationManager::class.java).cancel(CALL_ID)
    }

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < 26) return
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CH_STATUS, "Expert status", NotificationManager.IMPORTANCE_LOW),
        )
        val ringUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        val ringAttrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        manager.createNotificationChannel(
            NotificationChannel(CH_CALL, "Incoming calls", NotificationManager.IMPORTANCE_MAX).apply {
                description = "Rings on the lock screen when glasses start an Expert Engineer call"
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setSound(ringUri, ringAttrs)
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 700, 500, 700)
                setBypassDnd(true)
            },
        )
    }

    private fun openIntent(): PendingIntent {
        val launch = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        return PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun statusNotification(title: String, text: String) =
        NotificationCompat.Builder(this, CH_STATUS)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setContentIntent(openIntent())
            .build()

    private fun incomingNotification(call: SupportCall) =
        NotificationCompat.Builder(this, CH_CALL)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle("Incoming Expert Engineer")
            .setContentText(call.title)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setFullScreenIntent(openIntent(), true)
            .setContentIntent(openIntent())
            .build()

    companion object {
        private const val STATUS_ID = 41
        private const val CALL_ID = 42
        private const val CH_STATUS = "expert_status"
        private const val CH_CALL = "expert_calls_v2"

        fun start(context: Context) {
            val intent = Intent(context, WatchService::class.java)
            if (Build.VERSION.SDK_INT >= 26) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }
}
