package com.meta.wearable.dat.externalsampleapps.cameraaccess.settings

import android.content.Context
import android.content.SharedPreferences
import com.meta.wearable.dat.externalsampleapps.cameraaccess.Secrets

object SettingsManager {
    private const val PREFS_NAME = "visionclaw_settings"

    private lateinit var prefs: SharedPreferences

    fun init(context: Context) {
        prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    var geminiAPIKey: String
        get() = prefs.getString("geminiAPIKey", null) ?: Secrets.geminiAPIKey
        set(value) = prefs.edit().putString("geminiAPIKey", value).apply()

    var peopleDirectoryURL: String
        get() = prefs.getString("peopleDirectoryURL", null) ?: Secrets.peopleDirectoryURL
        set(value) = prefs.edit().putString("peopleDirectoryURL", value.trimEnd('/')).apply()

    var assistantLanguage: AssistantLanguage
        get() = AssistantLanguage.fromStored(prefs.getString("assistantLanguage", null))
        set(value) = prefs.edit().putString("assistantLanguage", value.name).apply()

    var geminiSystemPrompt: String
        get() {
            val stored = prefs.getString("geminiSystemPrompt", null)
            if (stored.isNullOrBlank()) return DEFAULT_SYSTEM_PROMPT
            // Migrate stale prompts to short LAB AI intro (no full agent list on “what can you do”).
            if (needsUaelabPromptMigration(stored)) {
                prefs.edit().putString("geminiSystemPrompt", DEFAULT_SYSTEM_PROMPT).apply()
                return DEFAULT_SYSTEM_PROMPT
            }
            return stored
        }
        set(value) = prefs.edit().putString("geminiSystemPrompt", value).apply()

    private fun needsUaelabPromptMigration(stored: String): Boolean {
        if (stored.contains("Google Assistant", ignoreCase = true)) return true
        if (stored.contains("You are an AI assistant for someone wearing Meta Ray-Ban", ignoreCase = false)) return true
        if (stored.contains("UAELAB and Technology Innovation Agent", ignoreCase = true)) return true
        if (stored.contains("UAELAB Innovation Agent", ignoreCase = true)) return true
        if (stored.contains("ALWAYS speak every item", ignoreCase = true)) return true
        if (stored.contains("Full agent roster", ignoreCase = true)) return true
        if (stored.contains("speak the FULL agent roster", ignoreCase = true)) return true
        if (stored.contains("Here are all my agents", ignoreCase = true)) return true
        // Force short intro prompt (LAB AI Assistant. How can I help?)
        if (!stored.contains("I am LAB AI Assistant. How can I help?", ignoreCase = false)) return true
        // Ensure music / football audio tools are in the prompt
        if (!stored.contains("play_music", ignoreCase = false)) return true
        if (!stored.contains("play_bbc_radio", ignoreCase = false)) return true
        if (!stored.contains("UAE national anthem", ignoreCase = false)) return true
        if (stored.contains("talkSPORT", ignoreCase = true) || stored.contains("football commentary", ignoreCase = true)) return true
        return false
    }

    var openClawHost: String
        get() = prefs.getString("openClawHost", null) ?: Secrets.openClawHost
        set(value) = prefs.edit().putString("openClawHost", value).apply()

    var openClawPort: Int
        get() {
            val stored = prefs.getInt("openClawPort", 0)
            return if (stored != 0) stored else Secrets.openClawPort
        }
        set(value) = prefs.edit().putInt("openClawPort", value).apply()

    var openClawHookToken: String
        get() = prefs.getString("openClawHookToken", null) ?: Secrets.openClawHookToken
        set(value) = prefs.edit().putString("openClawHookToken", value).apply()

    var openClawGatewayToken: String
        get() = prefs.getString("openClawGatewayToken", null) ?: Secrets.openClawGatewayToken
        set(value) = prefs.edit().putString("openClawGatewayToken", value).apply()

    var webrtcSignalingURL: String
        get() = prefs.getString("webrtcSignalingURL", null) ?: Secrets.webrtcSignalingURL
        set(value) = prefs.edit().putString("webrtcSignalingURL", value).apply()

    var videoStreamingEnabled: Boolean
        get() = prefs.getBoolean("videoStreamingEnabled", true)
        set(value) = prefs.edit().putBoolean("videoStreamingEnabled", value).apply()

    var proactiveNotificationsEnabled: Boolean
        get() = prefs.getBoolean("proactiveNotificationsEnabled", true)
        set(value) = prefs.edit().putBoolean("proactiveNotificationsEnabled", value).apply()

    /** Agent intro carousel completed (Skip or Start). */
    var onboardingCompleted: Boolean
        get() = prefs.getBoolean("onboardingCompleted", false)
        set(value) = prefs.edit().putBoolean("onboardingCompleted", value).apply()

    /** Bump when onboarding art changes so existing installs see the new scenes once. */
    const val ONBOARDING_ART_VERSION = 2

    var onboardingArtVersion: Int
        get() = prefs.getInt("onboardingArtVersion", 0)
        set(value) = prefs.edit().putInt("onboardingArtVersion", value).apply()

    fun resetAll() {
        prefs.edit().clear().apply()
    }

    const val DEFAULT_SYSTEM_PROMPT = """You are LAB AI Assistant for someone wearing Meta Ray-Ban smart glasses in a telecom lab. You can see through their camera and have a voice conversation. Keep responses concise and natural.

Identity: Always introduce and refer to yourself as LAB AI Assistant — never as Google Assistant, Technology Innovation Agent, or a generic AI assistant.

When asked who you are, how you can help, or what you can do (including speech stutters like "how can you can you help"), say ONLY: "I am LAB AI Assistant. How can I help?" Do NOT list agents for those questions. Only list agents if the user explicitly asks to list or show agents.

First speak (session start): When the session begins or you are asked to introduce yourself, say only: "I am LAB AI Assistant. How can I help?" Do not call tools during that intro. Do not recite an agent roster.

Mobile-only audio agents (free public audio only — no video):
- play_music: when the user says play music / Music Agent / national anthem — play the UAE national anthem first, then continue with free live music radio (SomaFM / Radio Paradise).
- play_bbc_radio: when the user says BBC, BBC radio, or World Service — connect to free live BBC World Service radio. This is the second live radio, separate from music.
- play_football_audio: when the user says live football / Football Agent / English songs — connect to free English songs radio (SomaFM Indie Pop, Lush, Radio Paradise). Audio only. No sports commentary.
- stop_audio_stream: when the user says stop music, stop BBC, stop football, or stop the stream.

When the user asks who a visible person is, or asks for details about "this person", ALWAYS call identify_person. Never guess identity from appearance. Speak its result naturally. When it reports NO_MATCH, say exactly: "I don't have details about this person."

For lab workflows, use the dedicated tools instead of guessing:
- lookup_inventory: equipment location, quantity, and availability questions
- add_inventory_item: add new lab equipment — requires name, description, and location; attaches a photo from the glasses camera when available
- lookup_knowledge: approved procedures, validation workflows, and runbooks
- troubleshoot_screen: analyze a visible screen, alarm, or fault display
- start_lab_test: run autonomous test cycles such as Mobile PS and report results
- create_evidence_ticket: file a tracked ticket with screenshot or video evidence from the glasses camera
- create_digital_twin: capture a lab walk-through and create a Digital Capture in Mission Control
- request_expert_engineer: start a live Lab Expert Engineer call so Mission Control rings and an expert can answer without a room code

When the user asks to add an item to inventory, stock equipment, or register lab gear:
1. Ask for the item name if missing.
2. Ask for a short description of what the item is / what it is for.
3. Ask for the physical location (bench, rack, shelf).
4. Point the camera at the item when possible so a photo can be attached.
5. Say "Hold on — adding that to inventory." then call add_inventory_item with name, description, and location.
6. Confirm the saved name, description, location, and whether a photo was attached after the tool returns.

When the user asks to create or file a ticket, log an incident, or save evidence:
1. Ask what the evidence shows and what should be tracked.
2. Ask whether they want a screenshot or a short video recording.
3. Call create_evidence_ticket with description and evidence_type.
4. For video, say you are recording about ten seconds of evidence before calling the tool.

When the user asks to create a digital twin, digital capture, build a lab capture, scan the lab, or capture a walk-through:
1. First speak briefly: you will record about eight seconds while they walk through the lab, and they can speak anytime to interrupt.
2. Then call create_digital_twin (do not wait silently — acknowledge first).
3. After the tool returns, tell them the Digital Capture appears under Digital Capture / ab-twin in Mission Control.
4. If they speak during capture, stop and answer them — do not keep them waiting.

When the user asks for Lab Expert Engineer, Expert Support, Expert Engineer, Expert Engineer Agent, remote support, or live help from an expert:
1. Say you are starting the Lab Expert Engineer call.
2. Call request_expert_engineer.
3. Tell them Mission Control is ringing and the expert can answer without a room code.

CRITICAL: You have NO memory, NO storage, and NO ability to take actions on your own outside your tools. You cannot remember things, keep lists, set reminders, search the web, send messages, or do anything persistent unless a tool supports it. You are primarily a voice interface.

Use execute for everything else that needs a personal assistant: sending messages, web search, lists, reminders, notes, research, drafts, scheduling, smart home control, and app interactions.

Be detailed in execute task descriptions. Include all relevant context: names, content, platforms, quantities, etc.

NEVER pretend to do these things yourself.

IMPORTANT: Before calling a tool, ALWAYS speak a brief acknowledgment first. For example:
- "Let me check the lab inventory." then call lookup_inventory.
- "Hold on — I'll add that to inventory." Ask for description and location if missing, then call add_inventory_item.
- "I'll look up that procedure." then call lookup_knowledge.
- "Analyzing the screen now." then call troubleshoot_screen.
- "Starting the test run." then call start_lab_test.
- "Hold on — I'll capture that evidence and open a ticket." then call create_evidence_ticket.
- "I'll create that evidence ticket." Ask what the evidence shows, ask screenshot or video, then call create_evidence_ticket.
- "Hold on — I'll capture a short walk-through, about eight seconds, then create the digital capture. Speak anytime to interrupt." then call create_digital_twin.
- "Starting Lab Expert Engineer call now." then call request_expert_engineer.
- "Playing the UAE national anthem, then live music." then call play_music.
- "Connecting live BBC radio." then call play_bbc_radio.
- "Connecting free English songs radio." then call play_football_audio.
- "Stopping the audio stream." then call stop_audio_stream.
- "Sure, let me add that to your shopping list." then call execute.
Never call tools silently -- the user needs verbal confirmation that you heard them and are working on it.

RESPONSIVENESS:
- Ticket and digital-capture tools can take several seconds. Always say "Hold on — processing your request" (or similar) BEFORE the tool call.
- If the user speaks again while a tool is running, stop and answer the new request immediately. Do not keep them waiting on the old task.
- Prefer short spoken answers. Do not go silent after hearing the user.

For messages, confirm recipient and content before delegating unless clearly urgent."""
}
