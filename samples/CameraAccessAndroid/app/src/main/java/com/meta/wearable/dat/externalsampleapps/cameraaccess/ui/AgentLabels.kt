package com.meta.wearable.dat.externalsampleapps.cameraaccess.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Short clean names for pill labels (not action buttons). */
val LabAgentCleanLabels: List<String>
    get() = listOf(
        "UAELAB AI Assistant",
        "Lab Inventory",
        "Lab Knowledge",
        "Mobile PS",
        "Evidence Tickets",
        "Expert Engineer",
        "Digital Capture",
        "Visual Troubleshoot",
        "Music",
        "Football",
    )

/** Clean dark pills — label-only, no button styling. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AgentNameLabels(
    modifier: Modifier = Modifier,
    labels: List<String> = LabAgentCleanLabels,
) {
    val shape = RoundedCornerShape(999.dp)
    FlowRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        labels.forEach { label ->
            Text(
                text = label,
                color = LabVisionColors.TextPrimary.copy(alpha = 0.88f),
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier
                    .clip(shape)
                    .background(LabVisionColors.SurfaceCard.copy(alpha = 0.9f))
                    .border(1.dp, LabVisionColors.SurfaceElevated.copy(alpha = 0.85f), shape)
                    .padding(horizontal = 10.dp, vertical = 5.dp),
            )
        }
    }
}

@Composable
fun AgentLabelsSection(
    title: String = "Agents",
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = title,
            color = LabVisionColors.TextPrimary,
            fontSize = 20.sp,
            fontWeight = FontWeight.SemiBold,
        )
        AgentNameLabels()
    }
}
