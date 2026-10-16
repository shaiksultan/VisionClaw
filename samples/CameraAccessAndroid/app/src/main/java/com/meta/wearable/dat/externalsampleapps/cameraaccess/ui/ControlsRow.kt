package com.meta.wearable.dat.externalsampleapps.cameraaccess.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun ControlsRow(
    onStopStream: () -> Unit,
    onCapturePhoto: () -> Unit,
    onToggleAI: () -> Unit,
    isAIActive: Boolean,
    onToggleLive: () -> Unit,
    isLiveActive: Boolean,
    isSupportMode: Boolean = true,
    modifier: Modifier = Modifier,
) {
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
        // Stop — same full-width style as Start on Glasses / Phone
        Button(
            onClick = onStopStream,
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp),
            shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFFDC2626),
                contentColor = LabVisionColors.TextPrimary,
            ),
        ) {
            Icon(
                imageVector = Icons.Default.Stop,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = LabVisionColors.TextPrimary,
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "Stop",
                fontWeight = FontWeight.SemiBold,
                fontSize = 15.sp,
            )
        }

        // Secondary actions — outlined chips matching the phone button style
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
            StreamActionButton(
                label = "Photo",
                icon = Icons.Default.PhotoCamera,
                active = false,
                onClick = onCapturePhoto,
                modifier = Modifier.weight(1f),
            )
            StreamActionButton(
                label = when {
                    isLiveActive && isSupportMode -> "End Call"
                    isLiveActive -> "Live On"
                    else -> "Expert"
                },
                icon = Icons.Default.Videocam,
                active = isLiveActive,
                onClick = onToggleLive,
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
