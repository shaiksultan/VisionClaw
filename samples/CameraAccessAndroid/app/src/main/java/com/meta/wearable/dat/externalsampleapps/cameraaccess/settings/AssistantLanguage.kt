package com.meta.wearable.dat.externalsampleapps.cameraaccess.settings

import java.util.Locale

/** Spoken language for the live AI session. Native audio follows the system instruction. */
enum class AssistantLanguage(
    val shortLabel: String,
    val displayName: String,
    val greeting: String,
    val locale: Locale,
) {
    ENGLISH(
        shortLabel = "EN",
        displayName = "English",
        greeting = "I am LAB AI Assistant. How can I help?",
        locale = Locale.US,
    ),
    ARABIC(
        shortLabel = "AR",
        displayName = "Arabic",
        greeting = "أنا مساعد LAB AI. كيف يمكنني مساعدتك؟",
        locale = Locale("ar"),
    ),
    HINDI(
        shortLabel = "HI",
        displayName = "Hindi",
        greeting = "मैं LAB AI असिस्टेंट हूँ। मैं आपकी कैसे मदद कर सकता हूँ?",
        locale = Locale("hi", "IN"),
    ),
    URDU(
        shortLabel = "UR",
        displayName = "Urdu",
        greeting = "میں LAB AI اسسٹنٹ ہوں۔ میں آپ کی کیسے مدد کر سکتا ہوں؟",
        locale = Locale("ur"),
    ),
    MALAYALAM(
        shortLabel = "ML",
        displayName = "Malayalam",
        greeting = "ഞാൻ LAB AI അസിസ്റ്റന്റ് ആണ്. ഞാൻ എങ്ങനെ സഹായിക്കാം?",
        locale = Locale("ml", "IN"),
    ),
    FILIPINO(
        shortLabel = "FIL",
        displayName = "Filipino",
        greeting = "Ako ang LAB AI Assistant. Paano kita matutulungan?",
        locale = Locale("fil", "PH"),
    ),
    FRENCH(
        shortLabel = "FR",
        displayName = "French",
        greeting = "Je suis l'assistant LAB AI. Comment puis-je vous aider ?",
        locale = Locale.FRANCE,
    );

    val instruction: String
        get() = "Language lock: The user selected $displayName. Listen in $displayName and reply only in $displayName, even if they mix in another language. Do not switch language on your own. The opening line must be exactly: $greeting"

    companion object {
        fun fromStored(value: String?): AssistantLanguage =
            entries.firstOrNull { it.name == value } ?: ENGLISH
    }
}
