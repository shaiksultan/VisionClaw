package com.meta.wearable.dat.externalsampleapps.cameraaccess.ui

/** Maps voice / tool activity onto Mission Control agent ids (same ids as the web UI). */
object AgentRouter {
    const val CHAT = "chat"
    const val INVENTORY = "inventory"
    const val KNOWLEDGE = "knowledge"
    const val TESTS = "tests"
    const val TICKETS = "tickets"
    const val SUPPORT = "support"
    const val AB_TWIN = "ab-twin"
    const val VISUAL = "visual"
    const val MUSIC = "music"
    const val FOOTBALL = "football"

    fun fromToolName(toolName: String): String {
        val name = toolName.lowercase()
        return when {
            name.contains("inventory") -> INVENTORY
            name.contains("knowledge") -> KNOWLEDGE
            name.contains("troubleshoot") -> VISUAL
            name.contains("lab_test") || name == "start_lab_test" -> TESTS
            name.contains("evidence_ticket") || name.contains("ticket") -> TICKETS
            name.contains("expert_engineer") || name.contains("support") -> SUPPORT
            name.contains("digital_twin") || name.contains("twin") -> AB_TWIN
            name.contains("play_music") || name == "music" -> MUSIC
            name.contains("football") || name.contains("soccer") -> FOOTBALL
            name.contains("stop_audio") -> CHAT
            else -> CHAT
        }
    }

    fun fromUtterance(text: String): String? {
        val t = text.lowercase()
        return when {
            Regex("""\b(play\s+music|music\s+agent|listen to music|start music)\b""").containsMatchIn(t) -> MUSIC
            Regex("""\b(football|soccer|premier league|live\s+match|match\s+audio|sports\s+radio)\b""").containsMatchIn(t) -> FOOTBALL
            Regex("""\b(ticket|evidence|screenshot|incident|fault)\b""").containsMatchIn(t) -> TICKETS
            Regex("""\b(inventory|stock|equipment|add item|where is)\b""").containsMatchIn(t) -> INVENTORY
            Regex("""\b(knowledge|procedure|runbook|documentation)\b""").containsMatchIn(t) -> KNOWLEDGE
            Regex("""\b(digital twin|ab-?twin|walk-?through|gaussian)\b""").containsMatchIn(t) -> AB_TWIN
            Regex("""\b(lab expert engineer|expert engineer|remote support|live (help|call|support))\b""").containsMatchIn(t) -> SUPPORT
            Regex("""\b(mobile ps|lab test|run test|test cycle)\b""").containsMatchIn(t) -> TESTS
            Regex("""\b(troubleshoot|alarm|what.?s wrong|analyze (the )?screen)\b""").containsMatchIn(t) -> VISUAL
            Regex("""\b(how can (you|u)|who are you|list agents|what can you do)\b""").containsMatchIn(t) -> CHAT
            else -> null
        }
    }

    fun displayName(agentId: String): String =
        LabAgentCatalog.firstOrNull { it.id == agentId }?.title
            ?: if (agentId == CHAT) "LAB AI Assistant" else agentId
}
