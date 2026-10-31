package com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw

import org.json.JSONArray
import org.json.JSONObject

// Gemini Tool Call (parsed from server JSON)

data class GeminiFunctionCall(
    val id: String,
    val name: String,
    val args: Map<String, Any?>
)

data class GeminiToolCall(
    val functionCalls: List<GeminiFunctionCall>
) {
    companion object {
        fun fromJSON(json: JSONObject): GeminiToolCall? {
            val toolCall = json.optJSONObject("toolCall") ?: return null
            val calls = toolCall.optJSONArray("functionCalls") ?: return null
            val functionCalls = mutableListOf<GeminiFunctionCall>()
            for (i in 0 until calls.length()) {
                val call = calls.getJSONObject(i)
                val id = call.optString("id", "")
                val name = call.optString("name", "")
                if (id.isEmpty() || name.isEmpty()) continue
                val argsObj = call.optJSONObject("args")
                val args = mutableMapOf<String, Any?>()
                if (argsObj != null) {
                    for (key in argsObj.keys()) {
                        args[key] = argsObj.opt(key)
                    }
                }
                functionCalls.add(GeminiFunctionCall(id, name, args))
            }
            return if (functionCalls.isNotEmpty()) GeminiToolCall(functionCalls) else null
        }
    }
}

// Gemini Tool Call Cancellation

data class GeminiToolCallCancellation(
    val ids: List<String>
) {
    companion object {
        fun fromJSON(json: JSONObject): GeminiToolCallCancellation? {
            val cancellation = json.optJSONObject("toolCallCancellation") ?: return null
            val idsArray = cancellation.optJSONArray("ids") ?: return null
            val ids = mutableListOf<String>()
            for (i in 0 until idsArray.length()) {
                ids.add(idsArray.getString(i))
            }
            return if (ids.isNotEmpty()) GeminiToolCallCancellation(ids) else null
        }
    }
}

// Tool Result

sealed class ToolResult {
    data class Success(val result: String) : ToolResult()
    data class Failure(val error: String) : ToolResult()

    fun toJSON(): JSONObject = when (this) {
        is Success -> JSONObject().put("result", result)
        is Failure -> JSONObject().put("error", error)
    }
}

// Tool Call Status (for UI)

sealed class ToolCallStatus {
    data object Idle : ToolCallStatus()
    data class Executing(val name: String) : ToolCallStatus()
    data class Completed(val name: String) : ToolCallStatus()
    data class Failed(val name: String, val error: String) : ToolCallStatus()
    data class Cancelled(val name: String) : ToolCallStatus()

    val displayText: String
        get() = when (this) {
            is Idle -> ""
            is Executing -> if (name.contains(' ') || name.length > 24) name else "Running: $name..."
            is Completed -> "Done: $name"
            is Failed -> "Failed: $name - $error"
            is Cancelled -> "Cancelled: $name"
        }

    val isActive: Boolean
        get() = this is Executing
}

// OpenClaw Connection State

sealed class OpenClawConnectionState {
    data object NotConfigured : OpenClawConnectionState()
    data object Checking : OpenClawConnectionState()
    data object Connected : OpenClawConnectionState()
    data class Unreachable(val message: String) : OpenClawConnectionState()
}

// Tool Declarations (for Gemini setup message)

object ToolDeclarations {
    fun allDeclarationsJSON(): JSONArray {
        return JSONArray()
            .put(executeJSON())
            .put(lookupInventoryJSON())
            .put(addInventoryItemJSON())
            .put(lookupKnowledgeJSON())
            .put(troubleshootScreenJSON())
            .put(startLabTestJSON())
            .put(identifyPersonJSON())
            .put(createEvidenceTicketJSON())
            .put(createDigitalTwinJSON())
            .put(requestExpertEngineerJSON())
            .put(playMusicJSON())
            .put(playBbcRadioJSON())
            .put(playFootballAudioJSON())
            .put(stopAudioStreamJSON())
            .put(startMeetingJSON())
            .put(stopMeetingJSON())
    }

    private fun playMusicJSON(): JSONObject = JSONObject().apply {
        put("name", "play_music")
        put("description", "Play the UAE national anthem first, then continue with free live music radio (audio only). Use when the user says play music, start music, national anthem, or Music Agent.")
        put("parameters", JSONObject().put("type", "object").put("properties", JSONObject()))
        put("behavior", "BLOCKING")
    }

    private fun playBbcRadioJSON(): JSONObject = JSONObject().apply {
        put("name", "play_bbc_radio")
        put("description", "Start free live BBC radio (audio only), BBC World Service. Use when the user says BBC, BBC radio, World Service, or play the radio.")
        put("parameters", JSONObject().put("type", "object").put("properties", JSONObject()))
        put("behavior", "BLOCKING")
    }

    private fun playFootballAudioJSON(): JSONObject = JSONObject().apply {
        put("name", "play_football_audio")
        put("description", "Start free English songs radio (audio only): SomaFM Indie Pop, Lush, or Radio Paradise. Use when the user says live football, Football Agent, or English songs. Audio only — no video.")
        put("parameters", JSONObject().put("type", "object").put("properties", JSONObject()))
        put("behavior", "BLOCKING")
    }

    private fun stopAudioStreamJSON(): JSONObject = JSONObject().apply {
        put("name", "stop_audio_stream")
        put("description", "Stop the currently playing music, BBC radio, or football audio stream. Use when the user says stop music, stop BBC, stop football, stop radio, or stop the stream.")
        put("parameters", JSONObject().put("type", "object").put("properties", JSONObject()))
        put("behavior", "BLOCKING")
    }

    private fun requestExpertEngineerJSON(): JSONObject = JSONObject().apply {
        put("name", "request_expert_engineer")
        put("description", "Start a live Expert Engineer Agent call. Use when the user says Expert Support, Expert Engineer, Expert Engineer Agent, remote support, or asks for live expert help. Rings Mission Control so the expert can answer without a room code.")
        put("parameters", JSONObject().apply {
            put("type", "object")
            put("properties", JSONObject().apply {
                put("description", JSONObject().put("type", "string").put("description", "Optional short description of the problem"))
            })
            put("required", JSONArray())
        })
        put("behavior", "BLOCKING")
    }

    private fun addInventoryItemJSON(): JSONObject = JSONObject().apply {
        put("name", "add_inventory_item")
        put("description", "Add a new item to the lab inventory. REQUIRED: item name, a clear description of what the item is, and the physical location in the lab (bench, rack, shelf). Ask for any missing field before calling. Automatically attaches a photo from the glasses camera when available. Use when the user says add to inventory, stock this item, or register equipment.")
        put("parameters", JSONObject().apply {
            put("type", "object")
            put("properties", JSONObject().apply {
                put("name", JSONObject().put("type", "string").put("description", "Item name, e.g. RF shield box"))
                put("description", JSONObject().put("type", "string").put("description", "What the item is / what it is used for"))
                put("location", JSONObject().put("type", "string").put("description", "Where it is stored, e.g. Bench A · Rack 3 · Shelf 2"))
                put("quantity", JSONObject().put("type", "integer").put("description", "Quantity to stock, default 1"))
                put("category", JSONObject().put("type", "string").put("description", "Optional category, e.g. RF, handset, tool"))
                put("status", JSONObject().put("type", "string").put("description", "Optional status: Available, In use, Reserved, Maintenance, Missing"))
            })
            put("required", JSONArray().put("name").put("description").put("location"))
        })
        put("behavior", "BLOCKING")
    }

    private fun lookupInventoryJSON(): JSONObject = JSONObject().apply {
        put("name", "lookup_inventory")
        put("description", "Search the lab inventory for equipment location, quantity, and availability. Use when the user asks where something is, how many units are available, or whether lab gear is in stock.")
        put("parameters", JSONObject().apply {
            put("type", "object")
            put("properties", JSONObject().put("query", JSONObject().put("type", "string").put("description", "Equipment or item to search for, e.g. RF shield box or 5G test phone")))
            put("required", JSONArray().put("query"))
        })
        put("behavior", "BLOCKING")
    }

    private fun lookupKnowledgeJSON(): JSONObject = JSONObject().apply {
        put("name", "lookup_knowledge")
        put("description", "Look up approved lab procedures, validation workflows, and technical runbooks. Use when the user asks to explain a procedure, validation process, or lab workflow.")
        put("parameters", JSONObject().apply {
            put("type", "object")
            put("properties", JSONObject().put("query", JSONObject().put("type", "string").put("description", "Procedure or topic to look up, e.g. Packet Core Upgrade validation procedure")))
            put("required", JSONArray().put("query"))
        })
        put("behavior", "BLOCKING")
    }

    private fun troubleshootScreenJSON(): JSONObject = JSONObject().apply {
        put("name", "troubleshoot_screen")
        put("description", "Analyze the screen or fault display currently visible through the glasses camera. Use when the user asks what is wrong with a screen, alarm, error, or lab UI they are looking at.")
        put("parameters", JSONObject().apply {
            put("type", "object")
            put("properties", JSONObject().put("question", JSONObject().put("type", "string").put("description", "Optional troubleshooting question. Defaults to analyzing what is wrong with the visible screen.")))
            put("required", JSONArray())
        })
        put("behavior", "BLOCKING")
    }

    private fun startLabTestJSON(): JSONObject = JSONObject().apply {
        put("name", "start_lab_test")
        put("description", "Start an autonomous lab test run, wait for completion, and return the report summary. Use when the user asks to run test cycles such as Mobile PS and analyze failures.")
        put("parameters", JSONObject().apply {
            put("type", "object")
            put("properties", JSONObject().apply {
                put("test_type", JSONObject().put("type", "string").put("description", "Test type to run, e.g. Mobile PS"))
                put("cycles", JSONObject().put("type", "integer").put("description", "Number of cycles to run, between 1 and 20"))
                put("name", JSONObject().put("type", "string").put("description", "Optional label for the test run"))
            })
            put("required", JSONArray())
        })
        put("behavior", "BLOCKING")
    }

    private fun startMeetingJSON(): JSONObject = JSONObject().apply {
        put("name", "start_meeting_recording")
        put("description", "Start recording the current meeting from the glasses microphone and camera stream. Only call after the user explicitly confirms that meeting participants consent to recording. Stay quiet after confirming recording has started.")
        put("parameters", JSONObject().apply {
            put("type", "object")
            put("properties", JSONObject().put("participant_consent_confirmed", JSONObject().put("type", "boolean").put("description", "True only after explicit confirmation that meeting participants agree")))
            put("required", JSONArray().put("participant_consent_confirmed"))
        })
        put("behavior", "BLOCKING")
    }

    private fun stopMeetingJSON(): JSONObject = JSONObject().apply {
        put("name", "stop_meeting_recording")
        put("description", "Stop the active meeting recording, create minutes from its transcript, and send those minutes to the user's connected Telegram bot.")
        put("parameters", JSONObject().put("type", "object").put("properties", JSONObject()))
        put("behavior", "BLOCKING")
    }

    private fun createEvidenceTicketJSON(): JSONObject = JSONObject().apply {
        put("name", "create_evidence_ticket")
        put("description", "Create a tracked lab ticket with camera evidence. Use when the user asks to create a ticket, log evidence, or record proof of a fault, alarm, screen, or lab issue. First ask what the evidence shows and capture a clear description. Then ask whether they want a screenshot or a short video clip. Before calling, speak: Hold on — processing your ticket request. The tool may take several seconds; if the user speaks again, stop and answer them.")
        put("parameters", JSONObject().apply {
            put("type", "object")
            put("properties", JSONObject().apply {
                put("description", JSONObject().put("type", "string").put("description", "The user's spoken description of what the evidence shows"))
                put("evidence_type", JSONObject().put("type", "string").put("description", "Either screenshot or video"))
                put("title", JSONObject().put("type", "string").put("description", "Optional short ticket title"))
                put("reporter", JSONObject().put("type", "string").put("description", "Optional reporter name"))
            })
            put("required", JSONArray().put("description").put("evidence_type"))
        })
        put("behavior", "BLOCKING")
    }

    private fun createDigitalTwinJSON(): JSONObject = JSONObject().apply {
        put("name", "create_digital_twin")
        put("description", "Create an ab-twin digital twin of the telecom lab from an AI-glasses walk-through. Use when the user says create digital twin, build a lab twin, capture the lab for 3D Gaussian Splatting, or scan the lab into a navigable twin. Before calling, speak: Hold on — recording a short walk-through for the digital twin; speak anytime to interrupt. Keep capture short so conversation resumes quickly. If the user speaks during capture, cancel and answer them.")
        put("parameters", JSONObject().apply {
            put("type", "object")
            put("properties", JSONObject().apply {
                put("title", JSONObject().put("type", "string").put("description", "Optional twin title"))
                put("description", JSONObject().put("type", "string").put("description", "Optional description of the area being scanned"))
                put("lab_name", JSONObject().put("type", "string").put("description", "Optional lab name, defaults to Telecom Lab"))
            })
            put("required", JSONArray())
        })
        put("behavior", "BLOCKING")
    }

    private fun identifyPersonJSON(): JSONObject = JSONObject().apply {
        put("name", "identify_person")
        put("description", "Compare the person currently visible with consented profiles in the private directory. Use only when explicitly asked about the person in view. Never provide a name yourself.")
        put("parameters", JSONObject().put("type", "object").put("properties", JSONObject()))
        put("behavior", "BLOCKING")
    }

    private fun executeJSON(): JSONObject {
        return JSONObject().apply {
            put("name", "execute")
            put("description", "Delegate to your personal assistant for actions not covered by the lab tools: sending messages, web search, lists, reminders, notes, research, drafts, scheduling, smart home control, and app interactions.")
            put("parameters", JSONObject().apply {
                put("type", "object")
                put("properties", JSONObject().apply {
                    put("task", JSONObject().apply {
                        put("type", "string")
                        put("description", "Clear, detailed description of what to do. Include all relevant context: names, content, platforms, quantities, etc.")
                    })
                })
                put("required", JSONArray().put("task"))
            })
            put("behavior", "BLOCKING")
        }
    }
}
