package com.meta.wearable.dat.externalsampleapps.cameraaccess.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meta.wearable.dat.externalsampleapps.cameraaccess.settings.AssistantLanguage

@Composable
fun ControlsRow(
    onToggleAI: () -> Unit,
    isAIActive: Boolean,
    language: AssistantLanguage,
    onLanguageSelected: (AssistantLanguage) -> Unit,
    onToggleStream: () -> Unit,
    isStreaming: Boolean,
    modifier: Modifier = Modifier,
) {
    var languageMenuOpen by remember { mutableStateOf(false) }
    val panelShape = RoundedCornerShape(22.dp)

    Column(
        modifier = modifier
            .navigationBarsPadding()
            .fillMaxWidth()
            .clip(panelShape)
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        LabVisionColors.SurfaceCard.copy(alpha = 0.92f),
                        LabVisionColors.BackgroundMid.copy(alpha = 0.96f),
                    ),
                ),
            )
            .border(1.dp, LabVisionColors.Accent.copy(alpha = 0.22f), panelShape)
            .padding(horizontal = 14.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            StreamActionButton(
                label = if (isAIActive) "AI On" else "AI",
                icon = Icons.Default.AutoAwesome,
                active = isAIActive,
                onClick = onToggleAI,
                modifier = Modifier.weight(1f),
            )
            Box(modifier = Modifier.weight(1f)) {
                StreamActionButton(
                    label = language.shortLabel,
                    icon = Icons.Default.Language,
                    active = languageMenuOpen,
                    onClick = { languageMenuOpen = true },
                    modifier = Modifier.fillMaxWidth(),
                )
                MaterialTheme(colorScheme = lightColorScheme()) {
                    DropdownMenu(
                        expanded = languageMenuOpen,
                        onDismissRequest = { languageMenuOpen = false },
                    ) {
                        AssistantLanguage.entries.forEach { option ->
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        text = option.displayName,
                                        color = if (option == language) Color(0xFF0369A1) else Color.Black,
                                        fontWeight = if (option == language) FontWeight.Bold else FontWeight.Medium,
                                    )
                                },
                                onClick = {
                                    languageMenuOpen = false
                                    if (option != language) onLanguageSelected(option)
                                },
                            )
                        }
                    }
                }
            }
            StreamActionButton(
                label = if (isStreaming) "Stream On" else "Stream",
                icon = Icons.Default.Videocam,
                active = isStreaming,
                onClick = onToggleStream,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun StreamActionButton(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    active: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(14.dp)
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.height(48.dp),
        shape = shape,
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            if (active) LabVisionColors.Accent.copy(alpha = 0.7f) else LabVisionColors.SurfaceElevated,
        ),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = if (active) LabVisionColors.AccentMuted.copy(alpha = 0.35f) else Color.Transparent,
            contentColor = LabVisionColors.TextPrimary,
        ),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 8.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(16.dp),
            tint = if (active) LabVisionColors.AccentBright else LabVisionColors.Accent,
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = label,
            fontWeight = FontWeight.SemiBold,
            fontSize = 12.sp,
            maxLines = 1,
        )
    }
}
