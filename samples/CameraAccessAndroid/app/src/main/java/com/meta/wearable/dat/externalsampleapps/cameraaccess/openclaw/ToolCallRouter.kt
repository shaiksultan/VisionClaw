package com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

class ToolCallRouter(
    private val bridge: OpenClawBridge,
    private val scope: CoroutineScope,
    private val lookupInventory: suspend (Map<String, Any?>) -> ToolResult,
    private val addInventoryItem: suspend (Map<String, Any?>) -> ToolResult,
    private val lookupKnowledge: suspend (Map<String, Any?>) -> ToolResult,
    private val troubleshootScreen: suspend (Map<String, Any?>) -> ToolResult,
    private val startLabTest: suspend (Map<String, Any?>) -> ToolResult,
    private val identifyPerson: suspend () -> ToolResult,
    private val createEvidenceTicket: suspend (Map<String, Any?>) -> ToolResult,
    private val createDigitalTwin: suspend (Map<String, Any?>) -> ToolResult,
    private val requestExpertEngineer: suspend (Map<String, Any?>) -> ToolResult,
    private val playMusic: suspend () -> ToolResult,
    private val playBbcRadio: suspend () -> ToolResult,
    private val playFootballAudio: suspend () -> ToolResult,
    private val stopAudioStream: suspend () -> ToolResult,
    private val startMeeting: suspend (Map<String, Any?>) -> ToolResult,
    private val stopMeeting: suspend () -> ToolResult,
    /** Immediate local spoken feedback (TTS) so the user hears "hold on" right away. */
    private val announce: ((String) -> Unit)? = null,
) {
    companion object {
        private const val TAG = "ToolCallRouter"
        private const val MAX_CONSECUTIVE_FAILURES = 3
        private val LONG_RUNNING = setOf(
            "add_inventory_item",
            "create_evidence_ticket",
            "create_digital_twin",
            "start_lab_test",
            "request_expert_engineer",
            "play_music",
            "play_bbc_radio",
            "play_football_audio",
            "start_meeting_recording",
            "stop_meeting_recording",
            "execute",
        )
    }

    private val inFlightJobs = mutableMapOf<String, Job>()
    private var consecutiveFailures = 0

    fun hasInFlight(): Boolean = inFlightJobs.isNotEmpty()

    fun hasLongRunningInFlight(): Boolean =
        inFlightJobs.keys.any { id ->
            // Jobs are keyed by call id; track long-running via job metadata map
            longRunningCallIds.contains(id)
        }

    private val longRunningCallIds = mutableSetOf<String>()

    fun handleToolCall(
        call: GeminiFunctionCall,
        sendResponse: (JSONObject) -> Unit
    ) {
        val callId = call.id
        val callName = call.name

        Log.d(TAG, "Received: $callName (id: $callId) args: ${call.args}")

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            Log.d(TAG, "Circuit breaker open ($consecutiveFailures consecutive failures), rejecting $callId")
            val errorResult = ToolResult.Failure(
                "Tool execution is temporarily unavailable after $consecutiveFailures consecutive failures. " +
                "Please tell the user you cannot complete this action right now and suggest they check their OpenClaw gateway connection."
            )
            sendResponse(buildToolResponse(callId, callName, errorResult))
            return
        }

        val job = scope.launch {
            if (callName in LONG_RUNNING) {
                longRunningCallIds.add(callId)
                announceHoldOn(callName)
            }

            try {
                val result = when (callName) {
                "lookup_inventory" -> {
                    bridge.setToolCallStatus(ToolCallStatus.Executing(callName))
                    lookupInventory(call.args)
                }
                "add_inventory_item" -> {
                    bridge.setToolCallStatus(ToolCallStatus.Executing("Hold on — adding item to inventory…"))
                    addInventoryItem(call.args)
                }
                "lookup_knowledge" -> {
                    bridge.setToolCallStatus(ToolCallStatus.Executing(callName))
                    lookupKnowledge(call.args)
                }
                "troubleshoot_screen" -> {
                    bridge.setToolCallStatus(ToolCallStatus.Executing(callName))
                    troubleshootScreen(call.args)
                }
                "start_lab_test" -> {
                    bridge.setToolCallStatus(ToolCallStatus.Executing("Hold on — starting lab test…"))
                    startLabTest(call.args)
                }
                "identify_person" -> {
                    bridge.setToolCallStatus(ToolCallStatus.Executing(callName))
                    identifyPerson()
                }
                "create_evidence_ticket" -> {
                    bridge.setToolCallStatus(ToolCallStatus.Executing("Hold on — creating evidence ticket…"))
                    createEvidenceTicket(call.args)
                }
                "create_digital_twin" -> {
                    bridge.setToolCallStatus(
                        ToolCallStatus.Executing("Hold on — recording twin walk-through… speak to interrupt")
                    )
                    createDigitalTwin(call.args)
                }
                "request_expert_engineer" -> {
                    bridge.setToolCallStatus(ToolCallStatus.Executing("Hold on — starting Expert Engineer call…"))
                    requestExpertEngineer(call.args)
                }
                "play_music" -> {
                    bridge.setToolCallStatus(ToolCallStatus.Executing("Hold on — playing the UAE anthem, then live music…"))
                    playMusic()
                }
                "play_bbc_radio" -> {
                    bridge.setToolCallStatus(ToolCallStatus.Executing("Hold on — connecting live BBC radio…"))
                    playBbcRadio()
                }
                "play_football_audio" -> {
                    bridge.setToolCallStatus(ToolCallStatus.Executing("Hold on — connecting free English songs radio…"))
                    playFootballAudio()
                }
                "stop_audio_stream" -> {
                    bridge.setToolCallStatus(ToolCallStatus.Executing("Stopping audio…"))
                    stopAudioStream()
                }
                "start_meeting_recording" -> {
                    bridge.setToolCallStatus(ToolCallStatus.Executing("Hold on — starting meeting recording…"))
                    startMeeting(call.args)
                }
                "stop_meeting_recording" -> {
                    bridge.setToolCallStatus(ToolCallStatus.Executing("Hold on — saving meeting minutes…"))
                    stopMeeting()
                }
                else -> {
                    val taskDesc = call.args["task"]?.toString() ?: call.args.toString()
                    bridge.setToolCallStatus(ToolCallStatus.Executing("Hold on — working on that…"))
                    bridge.delegateTask(task = taskDesc, toolName = callName)
                }
                }

                Log.d(TAG, "Result for $callName (id: $callId): $result")
                when (result) {
                    is ToolResult.Success -> consecutiveFailures = 0
                    is ToolResult.Failure -> consecutiveFailures++
                }
                sendResponse(buildToolResponse(callId, callName, result))
            } catch (e: kotlinx.coroutines.CancellationException) {
                Log.d(TAG, "Task $callId cancelled — notifying model so it can answer the new ask")
                sendResponse(
                    buildToolResponse(
                        callId,
                        callName,
                        ToolResult.Failure(
                            "Cancelled because the user spoke again. Answer their latest request now. " +
                                "Do not restart the cancelled tool unless they ask again."
                        ),
                    )
                )
                throw e
            } finally {
                longRunningCallIds.remove(callId)
                inFlightJobs.remove(callId)
            }
        }

        inFlightJobs[callId] = job
    }

    fun cancelToolCalls(ids: List<String>) {
        for (id in ids) {
            inFlightJobs[id]?.let { job ->
                Log.d(TAG, "Cancelling in-flight call: $id")
                job.cancel()
                inFlightJobs.remove(id)
                longRunningCallIds.remove(id)
            }
        }
        bridge.setToolCallStatus(ToolCallStatus.Cancelled(ids.firstOrNull() ?: "unknown"))
    }

    fun cancelAll() {
        for ((id, job) in inFlightJobs) {
            Log.d(TAG, "Cancelling in-flight call: $id")
            job.cancel()
        }
        inFlightJobs.clear()
        longRunningCallIds.clear()
        consecutiveFailures = 0
        bridge.setToolCallStatus(ToolCallStatus.Cancelled("user_interrupt"))
    }

    private fun announceHoldOn(callName: String) {
        val line = when (callName) {
            "create_evidence_ticket" ->
                "Hold on — processing your ticket request."
            "create_digital_twin" ->
                "Hold on — recording a short walk-through for the digital twin. Speak anytime to interrupt."
            "start_lab_test" ->
                "Hold on — starting the lab test."
            "request_expert_engineer" ->
                "Hold on — starting the Expert Engineer call."
            "start_meeting_recording" ->
                "Hold on — starting meeting recording."
            "stop_meeting_recording" ->
                "Hold on — saving the meeting and preparing minutes."
            "add_inventory_item" ->
                "Hold on — adding that item to inventory."
            "play_music" ->
                "Hold on — playing the UAE national anthem, then live music."
            "play_bbc_radio" ->
                "Hold on — connecting live BBC radio."
            "play_football_audio" ->
                "Hold on — connecting free English songs radio."
            "execute" ->
                "Hold on — working on that request."
            else ->
                "Hold on — processing your request."
        }
        announce?.invoke(line)
    }

    private fun buildToolResponse(
        callId: String,
        name: String,
        result: ToolResult
    ): JSONObject {
        return JSONObject().apply {
            put("toolResponse", JSONObject().apply {
                put("functionResponses", JSONArray().put(JSONObject().apply {
                    put("id", callId)
                    put("name", name)
                    put("response", result.toJSON())
                }))
            })
        }
    }
}
