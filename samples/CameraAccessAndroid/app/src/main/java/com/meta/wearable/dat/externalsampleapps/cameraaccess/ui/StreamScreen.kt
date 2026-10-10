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
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
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
import com.meta.wearable.dat.externalsampleapps.cameraaccess.webrtc.WebRTCSessionViewModel
import kotlinx.coroutines.Dispatchers
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
    val endingSupportRef = remember { AtomicBoolean(false) }

    LaunchedEffect(isPhoneMode) {
        labDemoClient.setStreamingMode(if (isPhoneMode) StreamingMode.PHONE else StreamingMode.GLASSES)
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
        SupportSessionBridge.starts.collect { event ->
            activeSupportCallId = event.callId
            activeSupportCallIdRef.set(event.callId)
            // Stop AI voice session so mic/WebRTC can take over, then start live support.
            if (geminiViewModel.uiState.value.isGeminiActive) {
                geminiViewModel.stopSession()
            }
            SupportCallRecorder.start()
            streamViewModel.supportRecordingActive = true
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

    // Start stream or phone camera
    LaunchedEffect(isPhoneMode) {
        if (isPhoneMode) {
            geminiViewModel.streamingMode = StreamingMode.PHONE
            streamViewModel.startPhoneCamera(lifecycleOwner)
        } else {
            geminiViewModel.streamingMode = StreamingMode.GLASSES
            streamViewModel.startStream()
        }
    }

    // Clean up on exit
    DisposableEffect(Unit) {
        onDispose {
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

    Box(modifier = modifier.fillMaxSize()) {
        // Video feed
        streamUiState.videoFrame?.let { videoFrame ->
            Image(
                bitmap = videoFrame.asImageBitmap(),
                contentDescription = stringResource(R.string.live_stream),
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        }

        if (streamUiState.streamSessionState == StreamSessionState.STARTING) {
            CircularProgressIndicator(
                modifier = Modifier.align(Alignment.Center),
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
            Column(modifier = Modifier.align(Alignment.TopStart).statusBarsPadding().padding(top = 8.dp)) {
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

            // Controls at bottom
            ControlsRow(
                onStopStream = {
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
                },
                onCapturePhoto = { streamViewModel.capturePhoto() },
                onToggleAI = {
                    if (geminiUiState.isGeminiActive) {
                        geminiViewModel.stopSession()
                    } else {
                        geminiViewModel.startSession()
                    }
                },
                isAIActive = geminiUiState.isGeminiActive,
                onToggleLive = {
                    if (webrtcUiState.isActive) {
                        if (!endingSupportRef.compareAndSet(false, true)) return@ControlsRow
                        isEndingSupport = true
                        scope.launch {
                            try {
                                endSupportCallIfNeeded(
                                    supportCallClient = supportCallClient,
                                    supportCallId = activeSupportCallId,
                                    webrtcViewModel = webrtcViewModel,
                                    streamViewModel = streamViewModel,
                                    context = context,
                                ) { activeSupportCallId = 0; activeSupportCallIdRef.set(0) }
                            } finally {
                                endingSupportRef.set(false)
                                isEndingSupport = false
                            }
                        }
                    } else {
                        supportDescription = ""
                        showSupportDialog = true
                    }
                },
                isLiveActive = webrtcUiState.isActive,
                isSupportMode = true,
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
                            if (geminiUiState.isGeminiActive) geminiViewModel.stopSession()
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
