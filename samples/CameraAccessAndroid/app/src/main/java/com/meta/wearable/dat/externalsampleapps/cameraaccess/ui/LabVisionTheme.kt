package com.meta.wearable.dat.externalsampleapps.cameraaccess.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

object LabVisionColors {
    val BackgroundTop = Color(0xFF0A1614)
    val BackgroundBottom = Color(0xFF142923)
    val Surface = Color(0xFF1B332C)
    val SurfaceElevated = Color(0xFF244038)
    val Accent = Color(0xFFD9F06F)
    val AccentMuted = Color(0xFF8FB339)
    val TextPrimary = Color(0xFFEAF6F1)
    val TextSecondary = Color(0xFFA8C3BA)
    val Glow = Color(0x6643D9A0)
}

val LabVisionBackgroundBrush: Brush
    get() = Brush.verticalGradient(
        colors = listOf(LabVisionColors.BackgroundTop, LabVisionColors.BackgroundBottom),
    )

@Composable
fun LabVisionTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = LabVisionColors.Accent,
            onPrimary = Color(0xFF17392F),
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
