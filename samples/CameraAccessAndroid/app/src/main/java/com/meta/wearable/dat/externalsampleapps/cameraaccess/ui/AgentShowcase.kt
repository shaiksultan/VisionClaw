package com.meta.wearable.dat.externalsampleapps.cameraaccess.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.ConfirmationNumber
import androidx.compose.material.icons.filled.HeadsetMic
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Science
import androidx.compose.material.icons.filled.ViewInAr
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

data class LabAgentUi(
    val id: String,
    val title: String,
    val subtitle: String,
    val badge: String,
    val icon: ImageVector,
    val tint: Color,
)

val LabAgentCatalog: List<LabAgentUi> = listOf(
    LabAgentUi("chat", "UAELAB AI Assistant", "Voice co-pilot · full agent roster", "AI", Icons.Filled.AutoAwesome, LabVisionColors.Accent),
    LabAgentUi("inventory", "Lab Inventory Agent", "Locate gear & stock", "01", Icons.Filled.Inventory2, Color(0xFF7DD3A7)),
    LabAgentUi("knowledge", "Lab Knowledge Assistant", "Procedures & runbooks", "02", Icons.Filled.MenuBook, Color(0xFF8EC5FF)),
    LabAgentUi("tests", "Mobile PS Agent", "Dual-UE packet core validation", "03", Icons.Filled.Science, Color(0xFFD9F06F)),
    LabAgentUi("tickets", "Evidence Ticket Agent", "Screenshot & video proof", "04", Icons.Filled.ConfirmationNumber, Color(0xFFF0A8C8)),
    LabAgentUi("support", "Lab Expert Engineer", "Live remote support call", "05", Icons.Filled.HeadsetMic, Color(0xFF6EE7B7)),
    LabAgentUi("ab-twin", "Digital Capture Agent", "Walk-through digital capture", "06", Icons.Filled.ViewInAr, Color(0xFFA5B4FC)),
    LabAgentUi("visual", "Visual Troubleshoot", "Analyze screens & alarms", "07", Icons.Filled.Visibility, Color(0xFFFFB86B)),
)

@Composable
fun AgentShowcaseGrid(
    modifier: Modifier = Modifier,
    agents: List<LabAgentUi> = LabAgentCatalog,
    onAgentClick: ((LabAgentUi) -> Unit)? = null,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        agents.chunked(2).forEach { rowAgents ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                rowAgents.forEach { agent ->
                    AgentShowcaseCard(
                        agent = agent,
                        modifier = Modifier.weight(1f),
                        onClick = onAgentClick?.let { handler -> { handler(agent) } },
                    )
                }
                if (rowAgents.size == 1) {
                    Box(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
fun AgentShowcaseCard(
    agent: LabAgentUi,
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    onClick: (() -> Unit)? = null,
) {
    val shape = RoundedCornerShape(16.dp)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(if (selected) agent.tint.copy(alpha = 0.18f) else LabVisionColors.Surface.copy(alpha = 0.95f))
            .border(1.dp, if (selected) agent.tint.copy(alpha = 0.7f) else LabVisionColors.SurfaceElevated, shape)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(
                        Brush.linearGradient(
                            colors = listOf(
                                agent.tint.copy(alpha = 0.28f),
                                agent.tint.copy(alpha = 0.08f),
                            ),
                        ),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                OpenAiAgentMark(
                    tint = agent.tint,
                    size = 36.dp,
                    reverse = agent.id.hashCode() % 2 == 0,
                    spinMs = 3800 + (kotlin.math.abs(agent.id.hashCode()) % 5) * 700,
                )
            }
            Text(
                text = agent.badge,
                color = agent.tint.copy(alpha = 0.9f),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.6.sp,
            )
        }
        Text(
            text = agent.title,
            color = LabVisionColors.TextPrimary,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = agent.subtitle,
            color = LabVisionColors.TextSecondary,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun AgentShowcaseHeader(
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = title,
            color = LabVisionColors.Accent,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.2.sp,
        )
        Text(
            text = subtitle,
            color = LabVisionColors.TextSecondary,
            fontSize = 13.sp,
            lineHeight = 18.sp,
        )
    }
}
