/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

package com.meta.wearable.dat.externalsampleapps.cameraaccess.ui

import android.util.Log
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.meta.wearable.dat.camera.types.StreamSessionState
import com.meta.wearable.dat.externalsampleapps.cameraaccess.R
import com.meta.wearable.dat.externalsampleapps.cameraaccess.gemini.GeminiSessionViewModel
import com.meta.wearable.dat.externalsampleapps.cameraaccess.lab.LabDemoClient
import com.meta.wearable.dat.externalsampleapps.cameraaccess.settings.SettingsManager
import com.meta.wearable.dat.externalsampleapps.cameraaccess.stream.StreamViewModel
import com.meta.wearable.dat.externalsampleapps.cameraaccess.stream.StreamingMode
import com.meta.wearable.dat.externalsampleapps.cameraaccess.support.SupportCallClient
import com.meta.wearable.dat.externalsampleapps.cameraaccess.support.SupportCallRecorder
import com.meta.wearable.dat.externalsampleapps.cameraaccess.support.SupportSessionBridge
import com.meta.wearable.dat.externalsampleapps.cameraaccess.wearables.WearablesViewModel
import com.meta.wearable.dat.externalsampleapps.cameraaccess.webrtc.WebRTCConfig
import com.meta.wearable.dat.externalsampleapps.cameraaccess.webrtc.WebRTCSessionViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun StreamScreen(
    wearablesViewModel: WearablesViewModel,
    isPhoneMode: Boolean = false,
    modifier: Modifier = Modifier,
    streamViewModel: StreamViewModel =
        viewModel(
            factory =
                StreamViewModel.Factory(
                    application = (LocalActivity.current as ComponentActivity).application,
                    wearablesViewModel = wearablesViewModel,
                ),
        ),
    geminiViewModel: GeminiSessionViewModel = viewModel(),
    webrtcViewModel: WebRTCSessionViewModel = viewModel(),
) {
    val streamUiState by streamViewModel.uiState.collectAsStateWithLifecycle()
    val geminiUiState by geminiViewModel.uiState.collectAsStateWithLifecycle()
    val webrtcUiState by webrtcViewModel.uiState.collectAsStateWithLifecycle()
    val lifecycleOwner = LocalLifecycleOwner.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val labDemoClient = remember { LabDemoClient() }
    val supportCallClient = remember { SupportCallClient(labDemoClient) }
    var showSupportDialog by remember { mutableStateOf(false) }
    var supportDescription by remember { mutableStateOf("") }
    var activeSupportCallId by remember { mutableIntStateOf(0) }
    val activeSupportCallIdRef = remember { AtomicInteger(0) }
    var isEndingSupport by remember { mutableStateOf(false) }
    var assistantLanguage by remember {
        mutableStateOf(com.meta.wearable.dat.externalsampleapps.cameraaccess.settings.SettingsManager.assistantLanguage)
    }
    val endingSupportRef = remember { AtomicBoolean(false) }
    val resumeAiAfterSupport = remember { AtomicBoolean(false) }
    val screenAlive = remember { AtomicBoolean(true) }

    LaunchedEffect(isPhoneMode) {
        labDemoClient.setStreamingMode(if (isPhoneMode) StreamingMode.PHONE else StreamingMode.GLASSES)
    }

    // Warm TURN/ICE so the first Expert Engineer call can open a room quickly.
    LaunchedEffect(Unit) {
        WebRTCConfig.prefetchIceServers()
    }

    // When Mission Control ends the call (PC hangup), clear "Waiting for expert engineer".
    LaunchedEffect(activeSupportCallId) {
        val callId = activeSupportCallId
        if (callId <= 0) return@LaunchedEffect
        while (activeSupportCallIdRef.get() == callId && screenAlive.get()) {
            delay(2_000)
            val session = runCatching { supportCallClient.getSession(callId) }.getOrNull() ?: continue
            val status = session.optString("status")
            val phase = session.optString("call_phase")
            if (status.equals("ended", ignoreCase = true) || phase.equals("ended", ignoreCase = true)) {
                if (endingSupportRef.compareAndSet(false, true)) {
                    isEndingSupport = true
                    try {
                        endSupportCallIfNeeded(
                            supportCallClient = supportCallClient,
                            supportCallId = callId,
                            webrtcViewModel = webrtcViewModel,
                            streamViewModel = streamViewModel,
                            context = context,
                            alreadyStoppedWebRtc = false,
                        ) { activeSupportCallId = 0; activeSupportCallIdRef.set(0) }
                    } finally {
                        endingSupportRef.set(false)
                        isEndingSupport = false
                        if (resumeAiAfterSupport.compareAndSet(true, false)) {
                            delay(700)
                            if (screenAlive.get()) {
                                geminiViewModel.startSession(resumeAfterExpert = true)
                            }
                        }
                    }
                }
                break
            }
        }
    }

    // When the expert disconnects from Mission Control, finish the support call on-device.
    DisposableEffect(webrtcViewModel) {
        webrtcViewModel.onSupportPeerLeft = {
            val callId = activeSupportCallIdRef.get()
            if (callId > 0 && endingSupportRef.compareAndSet(false, true)) {
                isEndingSupport = true
                scope.launch {
                    try {
                        endSupportCallIfNeeded(
                            supportCallClient = supportCallClient,
                            supportCallId = callId,
                            webrtcViewModel = webrtcViewModel,
                            streamViewModel = streamViewModel,
                            context = context,
                            alreadyStoppedWebRtc = true,
                        ) { activeSupportCallId = 0; activeSupportCallIdRef.set(0) }
                    } finally {
                        endingSupportRef.set(false)
                        isEndingSupport = false
                        if (resumeAiAfterSupport.compareAndSet(true, false)) {
                            delay(700)
                            if (screenAlive.get()) {
                                geminiViewModel.startSession(resumeAfterExpert = true)
                            }
                        }
                    }
                }
            }
        }
        onDispose { webrtcViewModel.onSupportPeerLeft = null }
    }

    webrtcViewModel.onRoomCreated = roomCallback@{ roomCode ->
        val callId = activeSupportCallIdRef.get()
        if (callId <= 0) return@roomCallback
        scope.launch {
            runCatching { supportCallClient.updateRoomCode(callId, roomCode) }
                .onFailure { Log.w("StreamScreen", "Failed to publish room code: ${it.message}") }
        }
    }

    // Wire Gemini VM to Stream VM for frame forwarding
    LaunchedEffect(geminiViewModel) {
        streamViewModel.geminiViewModel = geminiViewModel
    }

    // Voice / tool-started Expert Engineer calls → start live video session
    LaunchedEffect(Unit) {
        val seenCallIds = mutableSetOf<Int>()
        SupportSessionBridge.starts.collect { event ->
            if (!seenCallIds.add(event.callId)) return@collect
            activeSupportCallId = event.callId
            activeSupportCallIdRef.set(event.callId)
            // Pause AI voice so the expert call can use the mic, then bring it back when the expert hangs up.
            if (geminiViewModel.uiState.value.isGeminiActive) {
                resumeAiAfterSupport.set(true)
                geminiViewModel.stopSession()
                // Brief settle so the first call does not race Gemini for the mic / audio path.
                delay(350)
            }
            SupportCallRecorder.start()
            streamViewModel.supportRecordingActive = true
            if (streamViewModel.uiState.value.streamSessionState != StreamSessionState.STREAMING &&
                streamViewModel.uiState.value.streamSessionState != StreamSessionState.STARTING
            ) {
                if (isPhoneMode) streamViewModel.startPhoneCamera(lifecycleOwner)
                else streamViewModel.startStream()
            }
            webrtcViewModel.startSupportSession(event.callCode)
            withContext(Dispatchers.Main) {
                Toast.makeText(
                    context,
                    context.getString(R.string.support_request_started, event.callCode),
                    Toast.LENGTH_LONG,
                ).show()
            }
        }
    }

    // Wire WebRTC VM to Stream VM for frame forwarding
    LaunchedEffect(webrtcViewModel) {
        streamViewModel.webrtcViewModel = webrtcViewModel
    }

    // Stay on the assistant screen until Stream is pressed.
    LaunchedEffect(isPhoneMode) {
        geminiViewModel.streamingMode = if (isPhoneMode) StreamingMode.PHONE else StreamingMode.GLASSES
    }

    val videoStreaming = streamUiState.streamSessionState == StreamSessionState.STREAMING ||
        streamUiState.streamSessionState == StreamSessionState.STARTING

    fun startVideo() {
        if (isPhoneMode) streamViewModel.startPhoneCamera(lifecycleOwner)
        else streamViewModel.startStream()
    }

    fun leaveScreen() {
        screenAlive.set(false)
        resumeAiAfterSupport.set(false)
        if (geminiUiState.isGeminiActive) geminiViewModel.stopSession()
        if (webrtcUiState.isActive) {
            scope.launch {
                endSupportCallIfNeeded(
                    supportCallClient = supportCallClient,
                    supportCallId = activeSupportCallId,
                    webrtcViewModel = webrtcViewModel,
                    streamViewModel = streamViewModel,
                    context = context,
                ) { activeSupportCallId = 0; activeSupportCallIdRef.set(0) }
            }
        }
        streamViewModel.stopStream()
        wearablesViewModel.navigateToDeviceSelection()
    }

    BackHandler(onBack = { leaveScreen() })

    // Clean up on exit
    DisposableEffect(Unit) {
        onDispose {
            screenAlive.set(false)
            resumeAiAfterSupport.set(false)
            streamViewModel.supportRecordingActive = false
            if (geminiUiState.isGeminiActive) {
                geminiViewModel.stopSession()
            }
            if (webrtcUiState.isActive) {
                webrtcViewModel.stopSession()
            }
        }
    }

    // Show errors as toasts
    LaunchedEffect(geminiUiState.errorMessage) {
        geminiUiState.errorMessage?.let { msg ->
            Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
            geminiViewModel.clearError()
        }
    }
    LaunchedEffect(webrtcUiState.errorMessage) {
        webrtcUiState.errorMessage?.let { msg ->
            Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
            webrtcViewModel.clearError()
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(LabVisionColors.BackgroundTop),
    ) {
        val showVideo = videoStreaming && streamUiState.videoFrame != null
        if (showVideo) {
            Image(
                bitmap = streamUiState.videoFrame!!.asImageBitmap(),
                contentDescription = stringResource(R.string.live_stream),
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        } else {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(LabVisionBackgroundBrush)
                    .padding(bottom = 96.dp),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    if (!geminiUiState.isGeminiActive) {
                        Text(
                            text = "Lab Vision AI is ready now.",
                            color = LabVisionColors.TextPrimary,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Medium,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            modifier = Modifier.padding(horizontal = 24.dp),
                        )
                        Spacer(modifier = Modifier.height(18.dp))
                    }
                    AnimatedOrb(modifier = Modifier.fillMaxWidth(0.72f))
                }
            }
        }

        // Soft bottom fade so controls match app chrome
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(220.dp)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color.Transparent, LabVisionColors.BackgroundTop.copy(alpha = 0.85f)),
                    ),
                ),
        )

        if (streamUiState.streamSessionState == StreamSessionState.STARTING) {
            CircularProgressIndicator(
                modifier = Modifier.align(Alignment.Center),
                color = LabVisionColors.AccentBright,
            )
        }

        // Mode chip top
        Box(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .statusBarsPadding()
                .padding(top = 10.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(LabVisionColors.SurfaceCard.copy(alpha = 0.88f))
                .padding(horizontal = 14.dp, vertical = 7.dp),
        ) {
            Text(
                text = if (isPhoneMode) "Phone live" else "Glasses live",
                color = LabVisionColors.AccentBright,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }

        // Remote expert video (PiP)
        if (webrtcUiState.hasRemoteVideo) {
            RemoteVideoView(
                videoTrack = webrtcUiState.remoteVideoTrack,
                eglBase = webrtcViewModel.getEglBase(),
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .statusBarsPadding()
                    .padding(top = 72.dp, end = 16.dp)
                    .width(140.dp)
                    .height(186.dp),
            )
        }

        // Overlays + controls
        Box(modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
            // Top overlays (below status bar)
            Column(modifier = Modifier.align(Alignment.TopStart).statusBarsPadding().padding(top = 44.dp)) {
                // Compact AI overlay (kept light so Expert Engineer / WebRTC video stays clear)
                if (geminiUiState.isGeminiActive && !webrtcUiState.isActive) {
                    GeminiOverlay(uiState = geminiUiState)
                }

                // WebRTC overlay
                if (webrtcUiState.isActive) {
                    Spacer(modifier = Modifier.height(4.dp))
                    WebRTCOverlay(uiState = webrtcUiState)
                }
            }

            // Controls at bottom — same card/button language as Start on Glasses / Phone
            ControlsRow(
                onToggleAI = {
                    if (geminiUiState.isGeminiActive) {
                        geminiViewModel.stopSession()
                    } else {
                        geminiViewModel.startSession()
                    }
                },
                isAIActive = geminiUiState.isGeminiActive,
                language = assistantLanguage,
                onLanguageSelected = { selected ->
                    assistantLanguage = selected
                    com.meta.wearable.dat.externalsampleapps.cameraaccess.settings.SettingsManager.assistantLanguage = selected
                    if (geminiUiState.isGeminiActive) {
                        geminiViewModel.stopSession()
                        geminiViewModel.startSession()
                    }
                },
                onToggleStream = {
                    if (videoStreaming) streamViewModel.stopStream() else startVideo()
                },
                isStreaming = videoStreaming,
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }
    }

    // Share photo dialog
    streamUiState.capturedPhoto?.let { photo ->
        if (streamUiState.isShareDialogVisible) {
            SharePhotoDialog(
                photo = photo,
                onDismiss = { streamViewModel.hideShareDialog() },
                onShare = { bitmap ->
                    streamViewModel.sharePhoto(bitmap)
                    streamViewModel.hideShareDialog()
                },
            )
        }
    }

    if (showSupportDialog) {
        AlertDialog(
            onDismissRequest = { showSupportDialog = false },
            title = { Text(stringResource(R.string.support_request_title)) },
            text = {
                OutlinedTextField(
                    value = supportDescription,
                    onValueChange = { supportDescription = it },
                    label = { Text(stringResource(R.string.support_request_description)) },
                    minLines = 3,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showSupportDialog = false
                        scope.launch {
                            if (geminiUiState.isGeminiActive) {
                                resumeAiAfterSupport.set(true)
                                geminiViewModel.stopSession()
                            }
                            val description = supportDescription.ifBlank { "Expert Engineer request from AI glasses" }
                            var callCode = "LOCAL"
                            val hubUrl = SettingsManager.peopleDirectoryURL.trimEnd('/')
                            val hubResult = runCatching {
                                labDemoClient.ensureConnected()
                                supportCallClient.startSupportCall(description)
                            }
                            hubResult.onSuccess { started ->
                                activeSupportCallId = started.getInt("id")
                                activeSupportCallIdRef.set(activeSupportCallId)
                                callCode = started.optString("call_code").ifBlank { "LOCAL" }
                            }.onFailure { error ->
                                activeSupportCallId = 0
                                activeSupportCallIdRef.set(0)
                                Toast.makeText(
                                    context,
                                    "Hub unreachable ($hubUrl): ${error.message}. Starting live video anyway.",
                                    Toast.LENGTH_LONG,
                                ).show()
                            }
                            SupportCallRecorder.start()
                            streamViewModel.supportRecordingActive = true
                            webrtcViewModel.startSupportSession(callCode)
                            if (hubResult.isSuccess) {
                                Toast.makeText(
                                    context,
                                    context.getString(R.string.support_request_started, callCode),
                                    Toast.LENGTH_LONG,
                                ).show()
                            }
                        }
                    },
                ) { Text(stringResource(R.string.support_request_start)) }
            },
            dismissButton = {
                TextButton(onClick = { showSupportDialog = false }) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }
}

private suspend fun endSupportCallIfNeeded(
    supportCallClient: SupportCallClient,
    supportCallId: Int,
    webrtcViewModel: WebRTCSessionViewModel,
    streamViewModel: StreamViewModel,
    context: android.content.Context,
    alreadyStoppedWebRtc: Boolean = false,
    onCleared: () -> Unit,
) {
    try {
        streamViewModel.supportRecordingActive = false
        val duration = runCatching { SupportCallRecorder.durationSeconds() }.getOrDefault(0)
        val frames = runCatching { SupportCallRecorder.stop() }.getOrDefault(emptyList())
        if (!alreadyStoppedWebRtc) {
            runCatching { webrtcViewModel.stopSession() }
        }
        if (supportCallId > 0) {
            val result = runCatching {
                supportCallClient.endSupportCall(supportCallId, frames, duration)
            }
            withContext(Dispatchers.Main) {
                result.onSuccess { payload ->
                    val ticketCode = payload.optJSONObject("ticket")?.optString("ticket_code").orEmpty()
                    val message = payload.optString("spoken_summary").ifBlank {
                        context.getString(R.string.support_request_saved, ticketCode.ifBlank { "saved" })
                    }
                    Toast.makeText(context, message, Toast.LENGTH_LONG).show()
                }.onFailure { error ->
                    Toast.makeText(context, error.message ?: "Failed to save support ticket", Toast.LENGTH_LONG).show()
                }
            }
        }
    } catch (error: Exception) {
        withContext(Dispatchers.Main) {
            Toast.makeText(context, error.message ?: "Support session end failed", Toast.LENGTH_LONG).show()
        }
    } finally {
        withContext(Dispatchers.Main) {
            // Guarantee Live overlay / support flags are cleared.
            if (webrtcViewModel.uiState.value.isActive) {
                runCatching { webrtcViewModel.stopSession() }
            }
            streamViewModel.supportRecordingActive = false
            onCleared()
        }
    }
}
