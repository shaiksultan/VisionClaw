package com.meta.wearable.dat.externalsampleapps.cameraaccess.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meta.wearable.dat.externalsampleapps.cameraaccess.gemini.AgentChatMessage
import com.meta.wearable.dat.externalsampleapps.cameraaccess.gemini.GeminiConnectionState
import com.meta.wearable.dat.externalsampleapps.cameraaccess.gemini.GeminiUiState
import com.meta.wearable.dat.externalsampleapps.cameraaccess.openclaw.ToolCallStatus

/**
 * Web-style Mission Control shell for phone / stream AI:
 * agents on the left, the active agent's chat on the right.
 */
@Composable
fun MissionControlStreamPanel(
    uiState: GeminiUiState,
    onSelectAgent: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val activeId = uiState.activeAgentId
    val activeAgent = LabAgentCatalog.firstOrNull { it.id == activeId }
    val messages = uiState.agentMessages[activeId].orEmpty()
    val shape = RoundedCornerShape(18.dp)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(LabVisionColors.BackgroundTop.copy(alpha = 0.92f))
            .border(1.dp, LabVisionColors.SurfaceElevated, shape)
            .padding(10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // Left: agents
        Column(
            modifier = Modifier
                .width(148.dp)
                .fillMaxHeight(),
        ) {
            Text(
                text = "Agents",
                color = LabVisionColors.TextSecondary,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(8.dp))
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(6.dp),
                contentPadding = PaddingValues(bottom = 8.dp),
            ) {
                items(LabAgentCatalog, key = { it.id }) { agent ->
                    AgentRailItem(
                        agent = agent,
                        selected = agent.id == activeId,
                        busy = uiState.agentTypingId == agent.id ||
                            (uiState.toolCallStatus is ToolCallStatus.Executing && uiState.activeAgentId == agent.id),
                        onClick = { onSelectAgent(agent.id) },
                    )
                }
            }
        }

        // Right: chat for selected agent
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .clip(RoundedCornerShape(14.dp))
                .background(LabVisionColors.Surface.copy(alpha = 0.95f))
                .border(1.dp, LabVisionColors.SurfaceElevated, RoundedCornerShape(14.dp))
                .padding(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = activeAgent?.title ?: "Mission Control",
                        color = LabVisionColors.TextPrimary,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = activeAgent?.subtitle ?: "Voice / glasses chat",
                        color = LabVisionColors.TextSecondary,
                        fontSize = 11.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                StatusPill(
                    label = when (uiState.connectionState) {
                        is GeminiConnectionState.Ready -> "Live"
                        is GeminiConnectionState.Connecting,
                        is GeminiConnectionState.SettingUp -> "Connecting"
                        is GeminiConnectionState.Error -> "Error"
                        else -> "Off"
                    },
                    color = when (uiState.connectionState) {
                        is GeminiConnectionState.Ready -> Color(0xFF4CAF50)
                        is GeminiConnectionState.Connecting,
                        is GeminiConnectionState.SettingUp -> Color(0xFFFF9800)
                        is GeminiConnectionState.Error -> Color(0xFFF44336)
                        else -> Color(0xFF9E9E9E)
                    },
                )
            }

            Spacer(Modifier.height(10.dp))

            val listState = rememberLazyListState()
            LaunchedEffect(messages.size, uiState.agentTypingId, activeId) {
                if (messages.isNotEmpty()) {
                    listState.animateScrollToItem(messages.lastIndex)
                }
            }

            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (messages.isEmpty()) {
                    item {
                        Text(
                            text = "Speak to route into this agent. Evidence ticket / inventory / twin requests open the matching chat automatically.",
                            color = LabVisionColors.TextSecondary,
                            fontSize = 12.sp,
                        )
                    }
                }
                items(messages, key = { it.id }) { msg ->
                    AgentChatBubble(message = msg)
                }
                if (uiState.agentTypingId == activeId) {
                    item {
                        TypingBubble(agentTitle = activeAgent?.title ?: "Agent")
                    }
                }
            }

            val tool = uiState.toolCallStatus
            if (tool is ToolCallStatus.Executing && uiState.activeAgentId == activeId) {
                Spacer(Modifier.height(8.dp))
                ToolCallStatusView(status = tool)
            }
        }
    }
}

@Composable
private fun AgentRailItem(
    agent: LabAgentUi,
    selected: Boolean,
    busy: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) agent.tint.copy(alpha = 0.22f) else Color.Transparent)
            .border(
                1.dp,
                if (selected) agent.tint.copy(alpha = 0.65f) else LabVisionColors.SurfaceElevated.copy(alpha = 0.5f),
                RoundedCornerShape(12.dp),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(agent.tint.copy(alpha = 0.25f)),
            contentAlignment = Alignment.Center,
        ) {
            OpenAiAgentMark(
                tint = agent.tint,
                size = 22.dp,
                reverse = agent.id.hashCode() % 2 == 0,
                spinMs = 3600 + (kotlin.math.abs(agent.id.hashCode()) % 5) * 600,
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = agent.title,
                color = LabVisionColors.TextPrimary,
                fontSize = 11.sp,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = agent.badge,
                color = LabVisionColors.TextSecondary,
                fontSize = 9.sp,
            )
        }
        if (busy) {
            Box(
                modifier = Modifier
                    .size(7.dp)
                    .clip(CircleShape)
                    .background(LabVisionColors.Accent),
            )
        }
    }
}

@Composable
private fun AgentChatBubble(message: AgentChatMessage) {
    val isUser = message.role == "user"
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .clip(RoundedCornerShape(12.dp))
                .background(if (isUser) Color(0xFF1C1F24) else Color.White.copy(alpha = 0.06f))
                .padding(horizontal = 10.dp, vertical = 8.dp),
        ) {
            Text(
                text = if (isUser) "You" else message.agentName,
                color = LabVisionColors.TextSecondary,
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = message.content,
                color = LabVisionColors.TextPrimary,
                fontSize = 13.sp,
            )
        }
    }
}

@Composable
private fun TypingBubble(agentTitle: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Start,
    ) {
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(Color.White.copy(alpha = 0.06f))
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(14.dp),
                strokeWidth = 2.dp,
                color = LabVisionColors.Accent,
            )
            Text(
                text = "$agentTitle is typing…",
                color = LabVisionColors.TextSecondary,
                fontSize = 12.sp,
            )
        }
    }
}
