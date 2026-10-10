package com.meta.wearable.dat.externalsampleapps.cameraaccess.gemini

import android.app.Application
import android.graphics.Bitmap
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.OpenClawBridge
import com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.OpenClawEventClient
import com.meta.wearable.dat.externalsampleapps.cameraaccess.settings.SettingsManager
import com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.OpenClawConnectionState
import com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.ToolCallRouter
import com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.ToolCallStatus
import com.meta.wearable.dat.externalsampleapps.cameraaccess.stream.StreamingMode
import com.meta.wearable.dat.externalsampleapps.cameraaccess.people.PeopleRecognitionClient
import com.meta.wearable.dat.externalsampleapps.cameraaccess.lab.LabDemoClient
import com.meta.wearable.dat.externalsampleapps.cameraaccess.meeting.MeetingRecorder
import com.meta.wearable.dat.externalsampleapps.cameraaccess.tickets.TicketClient
import com.meta.wearable.dat.externalsampleapps.cameraaccess.twin.TwinClient
import com.meta.wearable.dat.externalsampleapps.cameraaccess.support.SupportCallClient
import com.meta.wearable.dat.externalsampleapps.cameraaccess.support.SupportSessionBridge
import com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.ToolResult
import com.meta.wearable.dat.externalsampleapps.cameraaccess.ui.AgentRouter
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class AgentChatMessage(
    val id: String,
    val role: String,
    val content: String,
    val agentId: String,
    val agentName: String,
)

data class GeminiUiState(
    val isGeminiActive: Boolean = false,
    val connectionState: GeminiConnectionState = GeminiConnectionState.Disconnected,
    val isModelSpeaking: Boolean = false,
    val errorMessage: String? = null,
    val userTranscript: String = "",
    val aiTranscript: String = "",
    val toolCallStatus: ToolCallStatus = ToolCallStatus.Idle,
    val openClawConnectionState: OpenClawConnectionState = OpenClawConnectionState.NotConfigured,
    /** Mission Control style: which agent panel is focused. */
    val activeAgentId: String = AgentRouter.CHAT,
    /** Per-agent chat threads (left rail selects these). */
    val agentMessages: Map<String, List<AgentChatMessage>> = emptyMap(),
    /** Agent currently showing a typing indicator on the right panel. */
    val agentTypingId: String? = null,
)

class GeminiSessionViewModel(application: Application) : AndroidViewModel(application) {
    companion object {
        private const val TAG = "GeminiSessionVM"
    }

    private val _uiState = MutableStateFlow(GeminiUiState())
    val uiState: StateFlow<GeminiUiState> = _uiState.asStateFlow()

    private val geminiService = GeminiLiveService()
    private val openClawBridge = OpenClawBridge()
    private var toolCallRouter: ToolCallRouter? = null
    private val audioManager = AudioManager(application)
    private val eventClient = OpenClawEventClient()
    private var lastVideoFrameTime: Long = 0
    @Volatile private var latestVideoFrame: Bitmap? = null
    private val peopleRecognitionClient = PeopleRecognitionClient()
    private val labDemoClient = LabDemoClient()
    private val ticketClient = TicketClient(labDemoClient)
    private val twinClient = TwinClient(labDemoClient)
    private val supportCallClient = SupportCallClient(labDemoClient)
    private val meetingRecorder = MeetingRecorder(application)
    private val voiceAnnouncer = VoiceAnnouncer(application)
    private var stateObservationJob: Job? = null
    @Volatile private var interruptingForSpeech = false
    private var lastUserChunkAgent: String = AgentRouter.CHAT
    private var streamingAiMessageId: String? = null
    private var streamingUserMessageId: String? = null

    var streamingMode: StreamingMode = StreamingMode.GLASSES

    fun selectAgent(agentId: String) {
        _uiState.value = _uiState.value.copy(activeAgentId = agentId)
    }

    fun startSession() {
        if (_uiState.value.isGeminiActive) return

        if (!GeminiConfig.isConfigured) {
            _uiState.value = _uiState.value.copy(
                errorMessage = "Gemini API key not configured. Open Settings and add your key from https://aistudio.google.com/apikey"
            )
            return
        }

        _uiState.value = _uiState.value.copy(
            isGeminiActive = true,
            activeAgentId = AgentRouter.CHAT,
            agentMessages = emptyMap(),
            agentTypingId = null,
        )
        lastUserChunkAgent = AgentRouter.CHAT
        streamingAiMessageId = null
        streamingUserMessageId = null

        // Wire audio callbacks
        audioManager.onAudioCaptured = lambda@{ data ->
            meetingRecorder.appendAudio(data)
            // Phone mode: mute mic while model speaks to prevent echo
            if (streamingMode == StreamingMode.PHONE && geminiService.isModelSpeaking.value) return@lambda
            geminiService.sendAudio(data)
        }

        geminiService.onAudioReceived = { data ->
            audioManager.playAudio(data)
        }

        geminiService.onInterrupted = {
            audioManager.stopPlayback()
            voiceAnnouncer.stop()
            if (toolCallRouter?.hasInFlight() == true) {
                toolCallRouter?.cancelAll()
                voiceAnnouncer.speak("Okay — cancelled. What do you need?")
            }
        }

        // Transcription messages are delivered independently from turnComplete
        // and may arrive before or after it. Keep the latest text visible instead
        // of clearing it here, otherwise a valid transcript can flash or vanish.
        geminiService.onTurnComplete = {
            streamingAiMessageId = null
            streamingUserMessageId = null
            _uiState.value = _uiState.value.copy(agentTypingId = null)
        }

        geminiService.onInputTranscription = input@{ text ->
            meetingRecorder.appendTranscript(text)
            val trimmed = text.trim()
            if (trimmed.isEmpty()) return@input
            val fullUser = (_uiState.value.userTranscript + text).takeLast(600)
            val routed = AgentRouter.fromUtterance(fullUser) ?: AgentRouter.fromUtterance(trimmed) ?: lastUserChunkAgent
            lastUserChunkAgent = routed
            streamingAiMessageId = null
            upsertStreamingUser(routed, text, seed = fullUser)
            _uiState.value = _uiState.value.copy(
                userTranscript = fullUser,
                aiTranscript = "",
                activeAgentId = routed,
                agentTypingId = routed,
            )
            if (
                trimmed.length >= 3 &&
                toolCallRouter?.hasLongRunningInFlight() == true &&
                !interruptingForSpeech
            ) {
                interruptingForSpeech = true
                toolCallRouter?.cancelAll()
                voiceAnnouncer.speak("Hold on — got your next request.")
                viewModelScope.launch {
                    delay(2500)
                    interruptingForSpeech = false
                }
            }
        }

        geminiService.onOutputTranscription = { text ->
            val agentId = _uiState.value.activeAgentId
            upsertStreamingAssistant(agentId, text)
            _uiState.value = _uiState.value.copy(
                aiTranscript = (_uiState.value.aiTranscript + text).takeLast(600),
                agentTypingId = if (geminiService.isModelSpeaking.value) agentId else null,
            )
        }

        geminiService.onDisconnected = { reason ->
            if (_uiState.value.isGeminiActive) {
                stopSession()
                _uiState.value = _uiState.value.copy(
                    errorMessage = "Connection lost: ${reason ?: "Unknown error"}"
                )
            }
        }

        // Check OpenClaw and start session
        viewModelScope.launch {
            labDemoClient.setStreamingMode(streamingMode)
            openClawBridge.checkConnection()
            openClawBridge.resetSession()

            // Wire tool call handling
            toolCallRouter = ToolCallRouter(
                openClawBridge,
                viewModelScope,
                lookupInventory = { args -> labDemoClient.lookupInventory(args) },
                addInventoryItem = { args -> labDemoClient.addInventoryItem(args, latestVideoFrame) },
                lookupKnowledge = { args -> labDemoClient.lookupKnowledge(args) },
                troubleshootScreen = { args -> labDemoClient.troubleshootScreen(latestVideoFrame, args, openClawBridge) },
                startLabTest = { args -> labDemoClient.startLabTest(args) },
                identifyPerson = { peopleRecognitionClient.identify(latestVideoFrame) },
                createEvidenceTicket = { args ->
                    ticketClient.createEvidenceTicket(
                        frameProvider = { latestVideoFrame },
                        args = args,
                        onProgress = { msg ->
                            openClawBridge.setToolCallStatus(ToolCallStatus.Executing(msg))
                        },
                    )
                },
                createDigitalTwin = { args ->
                    twinClient.createDigitalTwin(
                        frameProvider = { latestVideoFrame },
                        args = args,
                        onProgress = { msg ->
                            openClawBridge.setToolCallStatus(ToolCallStatus.Executing(msg))
                        },
                    )
                },
                requestExpertEngineer = { args -> requestExpertEngineer(args) },
                startMeeting = { args -> startMeetingRecording(args) },
                stopMeeting = { stopMeetingRecording() },
                announce = { line -> voiceAnnouncer.speak(line) },
            )

            geminiService.onToolCall = { toolCall ->
                for (call in toolCall.functionCalls) {
                    val agentId = AgentRouter.fromToolName(call.name)
                    lastUserChunkAgent = agentId
                    _uiState.value = _uiState.value.copy(
                        activeAgentId = agentId,
                        agentTypingId = agentId,
                    )
                    appendAgentMessage(
                        agentId = agentId,
                        role = "assistant",
                        content = "Hold on — working in ${AgentRouter.displayName(agentId)}…",
                        activate = true,
                    )
                    toolCallRouter?.handleToolCall(call) { response ->
                        geminiService.sendToolResponse(response)
                        val summary = toolResultSummary(call.name, response)
                        appendAgentMessage(
                            agentId = agentId,
                            role = "assistant",
                            content = summary,
                            activate = true,
                        )
                        // Keep focus + typing until the model speaks the follow-up.
                        _uiState.value = _uiState.value.copy(
                            activeAgentId = agentId,
                            agentTypingId = agentId,
                        )
                    }
                }
            }

            geminiService.onToolCallCancellation = { cancellation ->
                toolCallRouter?.cancelToolCalls(cancellation.ids)
            }

            // Observe service state
            stateObservationJob = viewModelScope.launch {
                while (isActive) {
                    delay(100)
                    _uiState.value = _uiState.value.copy(
                        connectionState = geminiService.connectionState.value,
                        isModelSpeaking = geminiService.isModelSpeaking.value,
                        toolCallStatus = openClawBridge.lastToolCallStatus.value,
                        openClawConnectionState = openClawBridge.connectionState.value,
                    )
                }
            }

            // Connect to Gemini
            geminiService.connect { setupOk ->
                if (!setupOk) {
                    val msg = when (val state = geminiService.connectionState.value) {
                        is GeminiConnectionState.Error -> state.message
                        else -> "Failed to connect to Gemini"
                    }
                    _uiState.value = _uiState.value.copy(errorMessage = msg)
                    geminiService.disconnect()
                    stateObservationJob?.cancel()
                    _uiState.value = _uiState.value.copy(
                        isGeminiActive = false,
                        connectionState = GeminiConnectionState.Disconnected
                    )
                    return@connect
                }

                // Start mic capture
                try {
                    audioManager.startCapture()
                } catch (e: Exception) {
                    _uiState.value = _uiState.value.copy(
                        errorMessage = "Mic capture failed: ${e.message}"
                    )
                    geminiService.disconnect()
                    stateObservationJob?.cancel()
                    _uiState.value = _uiState.value.copy(
                        isGeminiActive = false,
                        connectionState = GeminiConnectionState.Disconnected
                    )
                }

                // Connect to OpenClaw event stream for proactive notifications
                if (SettingsManager.proactiveNotificationsEnabled) {
                    eventClient.onNotification = { text ->
                        val state = _uiState.value
                        if (state.isGeminiActive && state.connectionState == GeminiConnectionState.Ready) {
                            geminiService.sendTextMessage(text)
                        }
                    }
                    eventClient.connect()
                }
            }
        }
    }

    fun stopSession() {
        eventClient.disconnect()
        toolCallRouter?.cancelAll()
        toolCallRouter = null
        voiceAnnouncer.stop()
        viewModelScope.launch { labDemoClient.disconnect() }
        audioManager.stopCapture()
        geminiService.disconnect()
        stateObservationJob?.cancel()
        stateObservationJob = null
        interruptingForSpeech = false
        _uiState.value = GeminiUiState()
    }

    fun sendVideoFrameIfThrottled(bitmap: Bitmap) {
        latestVideoFrame = bitmap.copy(Bitmap.Config.ARGB_8888, false)
        meetingRecorder.captureFrame(bitmap)
        if (!SettingsManager.videoStreamingEnabled) return
        if (!_uiState.value.isGeminiActive) return
        if (_uiState.value.connectionState != GeminiConnectionState.Ready) return
        val now = System.currentTimeMillis()
        if (now - lastVideoFrameTime < GeminiConfig.VIDEO_FRAME_INTERVAL_MS) return
        lastVideoFrameTime = now
        geminiService.sendVideoFrame(bitmap)
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }

    override fun onCleared() {
        super.onCleared()
        stopSession()
        voiceAnnouncer.shutdown()
    }



    private fun upsertStreamingUser(agentId: String, chunk: String, seed: String = chunk) {
        val current = _uiState.value.agentMessages.toMutableMap()
        val list = (current[agentId] ?: emptyList()).toMutableList()
        val existingId = streamingUserMessageId
        if (existingId != null) {
            val idx = list.indexOfLast { it.id == existingId && it.role == "user" }
            if (idx >= 0) {
                val prev = list[idx]
                list[idx] = prev.copy(content = (prev.content + chunk).trim().takeLast(1200))
                current[agentId] = list.takeLast(40)
                _uiState.value = _uiState.value.copy(agentMessages = current, activeAgentId = agentId)
                return
            }
        }
        // New user turn, or utterance re-routed to another agent — seed full transcript.
        val msg = AgentChatMessage(
            id = "u-${System.nanoTime()}",
            role = "user",
            content = seed.trim().ifEmpty { chunk.trim() }.takeLast(1200),
            agentId = agentId,
            agentName = "You",
        )
        streamingUserMessageId = msg.id
        list.add(msg)
        current[agentId] = list.takeLast(40)
        _uiState.value = _uiState.value.copy(agentMessages = current, activeAgentId = agentId)
    }

    private fun toolResultSummary(toolName: String, response: org.json.JSONObject): String {
        return try {
            val fr = response
                .optJSONObject("toolResponse")
                ?.optJSONArray("functionResponses")
                ?.optJSONObject(0)
                ?.optJSONObject("response")
            when {
                fr == null -> "Finished $toolName."
                fr.has("error") -> "Failed: ${fr.optString("error").take(400)}"
                else -> {
                    val result = fr.optString("result").ifBlank { fr.toString() }
                    result.take(500)
                }
            }
        } catch (_: Exception) {
            "Finished $toolName."
        }
    }

    private fun appendAgentMessage(
        agentId: String,
        role: String,
        content: String,
        activate: Boolean,
    ) {
        val text = content.trim()
        if (text.isEmpty()) return
        val msg = AgentChatMessage(
            id = "m-${System.nanoTime()}",
            role = role,
            content = text,
            agentId = agentId,
            agentName = AgentRouter.displayName(agentId),
        )
        val current = _uiState.value.agentMessages.toMutableMap()
        val list = (current[agentId] ?: emptyList()) + msg
        current[agentId] = list.takeLast(40)
        _uiState.value = _uiState.value.copy(
            agentMessages = current,
            activeAgentId = if (activate) agentId else _uiState.value.activeAgentId,
        )
    }

    private fun upsertStreamingAssistant(agentId: String, chunk: String) {
        val piece = chunk.trim()
        if (piece.isEmpty()) return
        val current = _uiState.value.agentMessages.toMutableMap()
        val list = (current[agentId] ?: emptyList()).toMutableList()
        val existingId = streamingAiMessageId
        if (existingId != null) {
            val idx = list.indexOfLast { it.id == existingId }
            if (idx >= 0) {
                val prev = list[idx]
                list[idx] = prev.copy(content = (prev.content + chunk).takeLast(1200))
                current[agentId] = list.takeLast(40)
                _uiState.value = _uiState.value.copy(agentMessages = current, activeAgentId = agentId)
                return
            }
        }
        val msg = AgentChatMessage(
            id = "a-${System.nanoTime()}",
            role = "assistant",
            content = piece,
            agentId = agentId,
            agentName = AgentRouter.displayName(agentId),
        )
        streamingAiMessageId = msg.id
        list.add(msg)
        current[agentId] = list.takeLast(40)
        _uiState.value = _uiState.value.copy(agentMessages = current, activeAgentId = agentId)
    }

    private suspend fun requestExpertEngineer(args: Map<String, Any?>): ToolResult {
        val description = args["description"]?.toString()?.trim().orEmpty()
            .ifBlank { "Expert Engineer request from AI glasses" }
        return try {
            labDemoClient.ensureConnected()
            val started = supportCallClient.startSupportCall(description)
            val callId = started.optInt("id", 0)
            val callCode = started.optString("call_code").ifBlank { "CALL" }
            if (callId > 0) {
                SupportSessionBridge.emitStart(callId, callCode, description)
            }
            val spoken = started.optString("spoken_summary").ifBlank {
                "Expert Engineer request $callCode sent. Mission Control is ringing."
            }
            ToolResult.Success(spoken)
        } catch (e: Exception) {
            Log.e(TAG, "Expert engineer request failed", e)
            ToolResult.Failure("Could not start Expert Engineer call: ${e.message ?: e.javaClass.simpleName}")
        }
    }

    private suspend fun startMeetingRecording(args: Map<String, Any?>): com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.ToolResult {
        val consent = args["participant_consent_confirmed"] == true || args["participant_consent_confirmed"]?.toString()?.equals("true", true) == true
        if (!consent) return com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.ToolResult.Failure("Please confirm that all meeting participants consent to recording before I start.")
        return meetingRecorder.start().fold(
            onSuccess = { com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.ToolResult.Success("Meeting recording started. Say stop recording when finished.") },
            onFailure = { com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.ToolResult.Failure(it.message ?: "Could not start recording") },
        )
    }

    private suspend fun stopMeetingRecording(): com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.ToolResult {
        val archive = meetingRecorder.stop().getOrElse {
            return com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.ToolResult.Failure(it.message ?: "Could not stop recording")
        }
        if (archive.transcript.isBlank()) return com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.ToolResult.Failure("The recording was saved, but no speech transcript was captured, so minutes could not be generated.")
        val task = """Create concise professional Minutes of Meeting from the transcript below. Include date/time, summary, decisions, action items with owners and deadlines when stated, open questions, and next steps. Clearly mark anything not stated instead of inventing it. Send the finished minutes to the owner through the already-connected Telegram bot. Confirm only after Telegram delivery succeeds. Meeting duration: ${archive.durationSeconds} seconds. Transcript:\n${archive.transcript}"""
        return when (val delivered = openClawBridge.delegateTask(task, "meeting_minutes_to_telegram")) {
            is com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.ToolResult.Success -> com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.ToolResult.Success("Meeting stopped and saved. ${delivered.result}")
            is com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.ToolResult.Failure -> com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.ToolResult.Failure("Meeting was saved, but Telegram delivery failed: ${delivered.error}")
        }
    }
}
