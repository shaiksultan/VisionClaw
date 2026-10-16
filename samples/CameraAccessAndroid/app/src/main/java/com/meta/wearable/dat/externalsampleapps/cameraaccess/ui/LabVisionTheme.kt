package com.meta.wearable.dat.externalsampleapps.cameraaccess.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/** Dark cyan / neon blue theme inspired by premium voice-assistant homes. */
object LabVisionColors {
    val BackgroundTop = Color(0xFF070B14)
    val BackgroundMid = Color(0xFF0C1220)
    val BackgroundBottom = Color(0xFF101826)
    val Surface = Color(0xFF171E2C)
    val SurfaceElevated = Color(0xFF222B3C)
    val SurfaceCard = Color(0xFF1A2233)
    val Accent = Color(0xFF3DDCFF)
    val AccentBright = Color(0xFF5CE1FF)
    val AccentMuted = Color(0xFF1E90FF)
    val AccentDeep = Color(0xFF2563EB)
    val TextPrimary = Color(0xFFF2F6FC)
    val TextSecondary = Color(0xFF9AA8BC)
    val Glow = Color(0x663DDCFF)
    val Ring = Color(0xFF7DD3FC)
    val RingSoft = Color(0x667DD3FC)
}

val LabVisionBackgroundBrush: Brush
    get() = Brush.verticalGradient(
        colors = listOf(
            LabVisionColors.BackgroundTop,
            LabVisionColors.BackgroundMid,
            LabVisionColors.BackgroundBottom,
        ),
    )

@Composable
fun LabVisionTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = LabVisionColors.Accent,
            onPrimary = Color(0xFF041018),
            secondary = LabVisionColors.AccentMuted,
            background = LabVisionColors.BackgroundTop,
            surface = LabVisionColors.Surface,
            onBackground = LabVisionColors.TextPrimary,
            onSurface = LabVisionColors.TextPrimary,
            onSurfaceVariant = LabVisionColors.TextSecondary,
        ),
        content = content,
    )
}
