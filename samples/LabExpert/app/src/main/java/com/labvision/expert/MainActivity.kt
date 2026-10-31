package com.labvision.expert

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.JavascriptInterface
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.ConfirmationNumber
import androidx.compose.material.icons.filled.HeadsetMic
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.TextButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val Bg = Color(0xFF070B14)
private val BgMid = Color(0xFF0C1220)
private val Surface = Color(0xFF171E2C)
private val Accent = Color(0xFF3DDCFF)
private val TextMain = Color(0xFFF2F6FC)
private val TextMute = Color(0xFF9AA8BC)
private val EndRed = Color(0xFFFF3B30)
private val Ink = Color(0xFF041018)

class MainActivity : ComponentActivity() {
    private val permissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        askLockScreenPrivileges()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val prefs = getSharedPreferences("lab_expert", MODE_PRIVATE)
        ExpertBus.baseUrl.value = prefs.getString("base_url", ExpertBus.DEFAULT_BASE) ?: ExpertBus.DEFAULT_BASE
        val needed = missingPermissions()
        if (needed.isEmpty()) askLockScreenPrivileges() else permissions.launch(needed)
        WatchService.start(this)
        setContent { ExpertApp(onBaseChange = { saveBase(it) }) }
    }

    private fun missingPermissions() = listOf(
        Manifest.permission.RECORD_AUDIO,
        Manifest.permission.CAMERA,
        Manifest.permission.POST_NOTIFICATIONS,
    ).filter {
        ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
    }.toTypedArray()

    private fun askLockScreenPrivileges() {
        if (Build.VERSION.SDK_INT >= 34) {
            val notifications = getSystemService(NotificationManager::class.java)
            if (!notifications.canUseFullScreenIntent()) {
                startActivity(
                    Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$packageName")),
                )
                return
            }
        }
        val power = getSystemService(PowerManager::class.java)
        if (!power.isIgnoringBatteryOptimizations(packageName)) {
            startActivity(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")),
            )
        }
    }

    private fun saveBase(value: String) {
        val clean = value.trim().trimEnd('/')
        ExpertBus.baseUrl.value = clean
        getSharedPreferences("lab_expert", MODE_PRIVATE).edit().putString("base_url", clean).apply()
    }
}

@Composable
private fun ExpertApp(onBaseChange: (String) -> Unit) {
    val calls by ExpertBus.calls.collectAsStateWithLifecycle()
    val error by ExpertBus.linkError.collectAsStateWithLifecycle()
    val screen by ExpertBus.screen.collectAsStateWithLifecycle()
    val activeId by ExpertBus.activeId.collectAsStateWithLifecycle()
    val dismissed by ExpertBus.dismissed.collectAsStateWithLifecycle()
    val ticket by ExpertBus.ticketLine.collectAsStateWithLifecycle()
    val base by ExpertBus.baseUrl.collectAsStateWithLifecycle()
    val incoming = if (screen == ExpertScreen.Home && activeId == null) {
        calls.firstOrNull { it.waiting && it.id !in dismissed }
    } else {
        null
    }
    val active = calls.find { it.id == activeId }
    val brush = Brush.verticalGradient(listOf(Bg, BgMid, Color(0xFF101826)))
    var showIntro by remember { mutableStateOf(true) }
    LaunchedEffect(incoming, screen) {
        if (incoming != null || screen != ExpertScreen.Home) showIntro = false
    }

    Box(Modifier.fillMaxSize().background(brush)) {
        when {
            screen == ExpertScreen.Live -> LiveCall(active, base)
            screen == ExpertScreen.Ended -> EndedCall(ticket)
            incoming != null -> IncomingCall(incoming)
            showIntro -> WelcomeCarousel(onFinished = { showIntro = false })
            else -> HomeWait(base, error, calls.filter { it.ended }.take(3), onBaseChange)
        }
    }
}

private data class IntroPage(val title: String, val body: String, val icon: ImageVector)

private val IntroPages = listOf(
    IntroPage(
        "Answer from this phone",
        "When the glasses call Expert Engineer, this phone rings. Answer here or from Mission Control.",
        Icons.Filled.HeadsetMic,
    ),
    IntroPage(
        "See the lab live",
        "The glasses camera fills the screen. Mute, speaker, and end sit along the bottom.",
        Icons.Filled.Videocam,
    ),
    IntroPage(
        "The ticket is saved",
        "End the call and the support ticket, with the spoken lines, is stored in Mission Control.",
        Icons.Filled.ConfirmationNumber,
    ),
)

@Composable
private fun WelcomeCarousel(onFinished: () -> Unit) {
    val pagerState = rememberPagerState(pageCount = { IntroPages.size })
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    Column(
        Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 24.dp).padding(bottom = 18.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = onFinished) {
                Text("Skip", color = TextMute, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            }
        }
        HorizontalPager(state = pagerState, modifier = Modifier.weight(1f).fillMaxWidth()) { page ->
            val item = IntroPages[page]
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
                Spacer(Modifier.weight(0.4f))
                GlowMark(item.icon)
                Spacer(Modifier.height(36.dp))
                Text(item.title, color = TextMain, fontSize = 22.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                Text(item.body, color = TextMute, fontSize = 15.sp, lineHeight = 22.sp, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.weight(0.6f))
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(bottom = 22.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            repeat(IntroPages.size) { index ->
                val active = index == pagerState.currentPage
                Box(
                    Modifier
                        .height(if (active) 7.dp else 8.dp)
                        .width(if (active) 28.dp else 8.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(if (active) Accent else Color(0xFF222B3C)),
                )
            }
        }
        PrimaryButton(if (pagerState.currentPage < IntroPages.lastIndex) "Next" else "Start") {
            if (pagerState.currentPage < IntroPages.lastIndex) {
                scope.launch { pagerState.animateScrollToPage(pagerState.currentPage + 1) }
            } else {
                onFinished()
            }
        }
    }
}

@Composable
private fun GlowMark(icon: ImageVector, pulse: Boolean = false) {
    val transition = rememberInfiniteTransition(label = "ring")
    val value by transition.animateFloat(
        initialValue = 0.96f,
        targetValue = 1.06f,
        animationSpec = infiniteRepeatable(tween(1100), RepeatMode.Reverse),
        label = "ringScale",
    )
    val pulseScale = if (pulse) value else 1f
    Box(Modifier.size(230.dp).scale(pulseScale), contentAlignment = Alignment.Center) {
        Box(Modifier.size(228.dp).border(1.dp, Accent.copy(alpha = 0.18f), CircleShape))
        Box(Modifier.size(176.dp).border(1.5.dp, Accent.copy(alpha = 0.45f), CircleShape))
        Box(
            Modifier
                .size(124.dp)
                .clip(CircleShape)
                .background(Brush.radialGradient(listOf(Accent.copy(alpha = 0.38f), Color(0xFF102033)))),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = Accent, modifier = Modifier.size(48.dp))
        }
    }
}

@Composable
private fun PrimaryButton(label: String, onClick: () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(54.dp)
            .clip(RoundedCornerShape(999.dp))
            .background(Accent)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = Ink, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun HomeWait(
    base: String,
    error: String?,
    recent: List<SupportCall>,
    onBaseChange: (String) -> Unit,
) {
    Column(
        Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(
            Modifier.fillMaxWidth().padding(top = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text("Lab Expert", color = TextMain, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
                Text("Expert Engineer", color = TextMute, fontSize = 13.sp)
            }
            Text(
                if (error == null) "Available" else "Offline",
                color = if (error == null) Ink else TextMain,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(if (error == null) Accent else EndRed.copy(alpha = 0.85f))
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            )
        }
        Spacer(Modifier.weight(1f))
        GlowMark(Icons.Filled.HeadsetMic)
        Spacer(Modifier.height(20.dp))
        Text("Waiting for a call", color = TextMain, fontSize = 26.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Text(
            if (error == null) "A glasses support call rings this phone and Mission Control."
            else error,
            color = if (error == null) TextMute else EndRed,
            fontSize = 14.sp,
            textAlign = TextAlign.Center,
            lineHeight = 20.sp,
        )
        Spacer(Modifier.weight(1f))
        if (recent.isNotEmpty()) {
            Text("Recent", color = TextMute, fontSize = 13.sp, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            recent.forEach { call ->
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(bottom = 8.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(Surface)
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                ) {
                    Text(call.ticketCode.ifBlank { call.callCode }, color = Accent, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Text(call.title, color = TextMain, fontSize = 14.sp, maxLines = 1)
                }
            }
        }
        OutlinedTextField(
            value = base,
            onValueChange = onBaseChange,
            singleLine = true,
            label = { Text("Mission Control") },
            modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = TextMain,
                unfocusedTextColor = TextMain,
                focusedBorderColor = Accent,
                unfocusedBorderColor = Color(0xFF222B3C),
                focusedLabelColor = Accent,
                unfocusedLabelColor = TextMute,
                cursorColor = Accent,
            ),
        )
        Spacer(Modifier.height(18.dp))
    }
}

@Composable
private fun IncomingCall(call: SupportCall) {
    val context = LocalContext.current
    Column(
        Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(28.dp))
        Text("Incoming video call", color = Accent, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(18.dp))
        GlowMark(Icons.Filled.Call, pulse = true)
        Spacer(Modifier.height(18.dp))
        Text("Expert Engineer", color = TextMain, fontSize = 30.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
        Spacer(Modifier.height(10.dp))
        Text(call.who, color = TextMute, fontSize = 16.sp)
        Spacer(Modifier.height(18.dp))
        Text(call.title, color = TextMain, fontSize = 16.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(call.callCode, color = Accent, fontSize = 14.sp, fontWeight = FontWeight.Medium)
        Spacer(Modifier.weight(1f))
        Row(Modifier.fillMaxWidth().padding(bottom = 36.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
            RoundAction("Decline", EndRed, Icons.Filled.CallEnd, Color.White) {
                ExpertBus.dismissed.value = ExpertBus.dismissed.value + call.id
            }
            RoundAction("Answer", Accent, Icons.Filled.Call, Ink) {
                answer(context, call.id)
            }
        }
    }
}

private fun answer(context: Context, id: Int) {
    ExpertBus.activeId.value = id
    ExpertBus.screen.value = ExpertScreen.Live
    val app = context.applicationContext
    CoroutineScope(Dispatchers.IO).launch {
        try {
            MissionApi().accept(ExpertBus.baseUrl.value, id)
        } catch (err: Exception) {
            withContext(Dispatchers.Main) {
                Toast.makeText(app, err.message ?: "Could not answer", Toast.LENGTH_LONG).show()
            }
        }
    }
}

@Composable
private fun LiveCall(call: SupportCall?, base: String) {
    val context = LocalContext.current
    val room = call?.roomCode.orEmpty()
    var micOn by remember { mutableStateOf(true) }
    val started = remember { SystemClock.elapsedRealtime() }
    var now by remember { mutableLongStateOf(SystemClock.elapsedRealtime()) }
    var videoReady by remember { mutableStateOf(false) }
    var viewerError by remember { mutableStateOf<String?>(null) }
    val webView = remember {
        WebView(context).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            webChromeClient = object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest) {
                    post { request.grant(request.resources) }
                }
            }
            addJavascriptInterface(object {
                @JavascriptInterface
                fun onVideo() {
                    post { videoReady = true }
                }
            }, "LabExpert")
        }
    }
    LaunchedEffect(room, base) {
        if (room.length != 6) return@LaunchedEffect
        videoReady = false
        viewerError = null
        try {
            val html = withContext(Dispatchers.IO) { fetchViewerHtml(base, room) }
            webView.loadDataWithBaseURL(
                "https://localhost/support-viewer.html",
                html,
                "text/html",
                "UTF-8",
                null,
            )
        } catch (err: Exception) {
            viewerError = err.message ?: "Could not open the glasses video"
        }
    }
    LaunchedEffect(Unit) {
        val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audio.mode = AudioManager.MODE_IN_COMMUNICATION
        @Suppress("DEPRECATION")
        audio.isSpeakerphoneOn = true
        while (true) {
            now = SystemClock.elapsedRealtime()
            delay(1000)
        }
    }
    DisposableEffect(Unit) {
        onDispose {
            webView.destroy()
            val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            audio.mode = AudioManager.MODE_NORMAL
        }
    }
    val elapsed = ((now - started) / 1000).coerceAtLeast(0)
    val clock = "%02d:%02d".format(elapsed / 60, elapsed % 60)

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (room.length == 6) {
            AndroidView(factory = { webView }, modifier = Modifier.fillMaxSize())
        }
        if (!videoReady) {
            Box(Modifier.fillMaxSize().background(Bg), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(28.dp)) {
                    GlowMark(Icons.Filled.Videocam, pulse = room.length == 6)
                    Spacer(Modifier.height(18.dp))
                    Text(
                        viewerError ?: if (room.length == 6) "Joining glasses video" else "Waiting for glasses video",
                        color = if (viewerError == null) TextMain else EndRed,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(call?.callCode ?: "Live", color = TextMain, fontWeight = FontWeight.SemiBold)
            Text(clock, color = Accent, fontWeight = FontWeight.Medium)
        }
        Row(
            Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 28.dp).fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RoundAction(if (micOn) "Mute" else "Unmute", Surface, if (micOn) Icons.Filled.Mic else Icons.Filled.MicOff, TextMain) {
                micOn = !micOn
                webView.evaluateJavascript("toggleMic()", null)
            }
            RoundAction("End", EndRed, Icons.Filled.CallEnd, Color.White, large = true) {
                endCall(context, ExpertBus.activeId.value)
            }
            RoundAction("Speaker", Surface, Icons.AutoMirrored.Filled.VolumeUp, Accent) {
                val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
                @Suppress("DEPRECATION")
                audio.isSpeakerphoneOn = !audio.isSpeakerphoneOn
            }
        }
    }
}

private fun fetchViewerHtml(base: String, room: String): String {
    val page = base.trimEnd('/') + "/support-viewer.html"
    val request = okhttp3.Request.Builder().url(page).get().build()
    okhttp3.OkHttpClient().newCall(request).execute().use { response ->
        val raw = response.body?.string().orEmpty()
        if (!response.isSuccessful || !raw.contains("joinRoom")) {
            error("Mission Control did not return the video page")
        }
        val query = "room=$room&autojoin=1&signal=wss://visionclaw-signaling.fly.dev&v=6"
        val patched = raw.replace(
            "const params = new URLSearchParams(location.search);",
            "const params = new URLSearchParams(${org.json.JSONObject.quote(query)});",
        )
        val extra = """
            <style>
              #join-panel,#controls,#status,#enable-av-btn{display:none !important}
              body,#video-container{background:#070B14}
            </style>
            <script>
              setInterval(function(){
                var video=document.getElementById('glasses-video');
                if (video && video.videoWidth > 0 && window.LabExpert) LabExpert.onVideo();
              }, 400);
            </script>
        """.trimIndent()
        return if (patched.contains("</head>")) patched.replace("</head>", "$extra</head>") else extra + patched
    }
}

private fun endCall(context: Context, id: Int?) {
    if (id == null) {
        ExpertBus.screen.value = ExpertScreen.Home
        return
    }
    val app = context.applicationContext
    CoroutineScope(Dispatchers.IO).launch {
        val line = try {
            MissionApi().end(ExpertBus.baseUrl.value, id)
        } catch (err: Exception) {
            err.message ?: "Call ended"
        }
        withContext(Dispatchers.Main) {
            ExpertBus.ticketLine.value = line
            ExpertBus.activeId.value = null
            ExpertBus.dismissed.value = ExpertBus.dismissed.value + id
            ExpertBus.screen.value = ExpertScreen.Ended
            Toast.makeText(app, line, Toast.LENGTH_LONG).show()
        }
    }
}

@Composable
private fun EndedCall(ticket: String) {
    Column(
        Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 28.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.weight(1f))
        GlowMark(Icons.Filled.ConfirmationNumber)
        Spacer(Modifier.height(24.dp))
        Text("Call ended", color = TextMain, fontSize = 28.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(14.dp))
        Text(
            ticket.ifBlank { "Support ticket saved in Mission Control." },
            color = TextMain,
            fontSize = 16.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(18.dp))
                .background(Surface)
                .padding(18.dp),
        )
        Spacer(Modifier.weight(1f))
        PrimaryButton("Done") {
            ExpertBus.screen.value = ExpertScreen.Home
            ExpertBus.ticketLine.value = ""
        }
    }
}

@Composable
private fun RoundAction(
    label: String,
    color: Color,
    icon: ImageVector,
    iconTint: Color,
    large: Boolean = false,
    onClick: () -> Unit,
) {
    val size = if (large) 78.dp else 68.dp
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier
                .size(size)
                .clip(CircleShape)
                .background(color)
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = label, tint = iconTint, modifier = Modifier.size(if (large) 34.dp else 28.dp))
        }
        Spacer(Modifier.height(8.dp))
        Text(label, color = TextMain, fontSize = 13.sp)
    }
}
