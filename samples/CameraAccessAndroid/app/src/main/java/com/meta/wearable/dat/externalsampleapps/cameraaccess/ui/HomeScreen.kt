/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

package com.meta.wearable.dat.externalsampleapps.cameraaccess.ui

import android.widget.Toast
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Smartphone
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meta.wearable.dat.externalsampleapps.cameraaccess.wearables.WearablesViewModel
import java.util.Calendar

@Composable
fun HomeScreen(
    viewModel: WearablesViewModel,
    modifier: Modifier = Modifier,
) {
    val scrollState = rememberScrollState()
    val activity = LocalActivity.current
    val context = LocalContext.current
    val greeting = remember {
        when (Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) {
            in 5..11 -> "Good morning"
            in 12..16 -> "Good afternoon"
            in 17..21 -> "Good evening"
            else -> "Hello"
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(LabVisionBackgroundBrush),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(horizontal = 22.dp)
                .navigationBarsPadding()
                .systemBarsPadding(),
        ) {
            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "$greeting, Sultan",
                        color = LabVisionColors.TextPrimary,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Medium,
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "How can I help you?",
                        color = LabVisionColors.AccentBright,
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Bold,
                        lineHeight = 34.sp,
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { viewModel.showSettings() }) {
                        Icon(
                            imageVector = Icons.Default.Settings,
                            contentDescription = "Settings",
                            tint = LabVisionColors.TextSecondary,
                            modifier = Modifier.size(22.dp),
                        )
                    }
                    Box(
                        modifier = Modifier
                            .size(42.dp)
                            .clip(CircleShape)
                            .background(LabVisionColors.AccentDeep.copy(alpha = 0.55f))
                            .border(1.dp, LabVisionColors.Accent.copy(alpha = 0.35f), CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "SU",
                            color = LabVisionColors.TextPrimary,
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Simple text labels — not buttons
            AgentNameLabels()

            Spacer(modifier = Modifier.height(20.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(320.dp),
                contentAlignment = Alignment.Center,
            ) {
                AnimatedOrb()
            }

            Spacer(modifier = Modifier.height(8.dp))

            FancyConnectPanel(
                onConnectGlasses = {
                    activity?.let { viewModel.startRegistration(it) }
                        ?: Toast.makeText(context, "Activity not available", Toast.LENGTH_SHORT).show()
                },
                onConnectPhone = { viewModel.navigateToPhoneMode() },
            )

            Spacer(modifier = Modifier.height(18.dp))

            HomeBottomNav(
                onHome = {},
                onHistory = {
                    Toast.makeText(context, "Session history coming soon", Toast.LENGTH_SHORT).show()
                },
                onGlasses = {
                    activity?.let { viewModel.startRegistration(it) }
                        ?: Toast.makeText(context, "Activity not available", Toast.LENGTH_SHORT).show()
                },
            )

            Spacer(modifier = Modifier.height(20.dp))
        }
    }
}

@Composable
private fun FancyConnectPanel(
    onConnectGlasses: () -> Unit,
    onConnectPhone: () -> Unit,
) {
    val shape = RoundedCornerShape(22.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(
                Brush.linearGradient(
                    colors = listOf(
                        LabVisionColors.SurfaceCard,
                        LabVisionColors.SurfaceElevated.copy(alpha = 0.85f),
                    ),
                ),
            )
            .border(1.dp, LabVisionColors.Accent.copy(alpha = 0.22f), shape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(
            text = "Get started",
            color = LabVisionColors.TextPrimary,
            fontSize = 17.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = "Connect UAELAB Vision to glasses or this phone",
            color = LabVisionColors.TextSecondary,
            fontSize = 13.sp,
            lineHeight = 18.sp,
        )

        FancyDeviceRow(
            title = "Ray-Ban Meta glasses",
            subtitle = "Hands-free lab agents · live video",
            icon = Icons.Default.Visibility,
            actionLabel = "Connect",
            onClick = onConnectGlasses,
            primary = true,
        )
        FancyDeviceRow(
            title = "This phone",
            subtitle = "Camera + mic · same agent roster",
            icon = Icons.Default.Smartphone,
            actionLabel = "Start",
            onClick = onConnectPhone,
            primary = false,
        )
    }
}

@Composable
private fun FancyDeviceRow(
    title: String,
    subtitle: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    actionLabel: String,
    onClick: () -> Unit,
    primary: Boolean,
) {
    val rowShape = RoundedCornerShape(16.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(rowShape)
            .background(LabVisionColors.BackgroundMid.copy(alpha = 0.65f))
            .border(1.dp, LabVisionColors.SurfaceElevated, rowShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(
                    Brush.linearGradient(
                        colors = listOf(LabVisionColors.AccentMuted, LabVisionColors.AccentDeep),
                    ),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = LabVisionColors.TextPrimary, modifier = Modifier.size(22.dp))
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, color = LabVisionColors.TextPrimary, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            Text(subtitle, color = LabVisionColors.TextSecondary, fontSize = 11.sp, lineHeight = 14.sp)
        }
        Spacer(modifier = Modifier.width(8.dp))
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(if (primary) LabVisionColors.AccentMuted else LabVisionColors.SurfaceElevated)
                .padding(horizontal = 14.dp, vertical = 8.dp),
        ) {
            Text(
                text = actionLabel,
                color = LabVisionColors.TextPrimary,
                fontWeight = FontWeight.Bold,
                fontSize = 12.sp,
            )
        }
    }
}

@Composable
private fun HomeBottomNav(
    onHome: () -> Unit,
    onHistory: () -> Unit,
    onGlasses: () -> Unit,
) {
    val shape = RoundedCornerShape(999.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(LabVisionColors.SurfaceCard.copy(alpha = 0.95f))
            .border(1.dp, LabVisionColors.SurfaceElevated, shape)
            .padding(horizontal = 28.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onHome) {
            Icon(Icons.Default.AutoAwesome, contentDescription = "Home", tint = LabVisionColors.AccentBright)
        }
        IconButton(onClick = onHistory) {
            Icon(Icons.Default.History, contentDescription = "History", tint = LabVisionColors.TextSecondary)
        }
        IconButton(onClick = onGlasses) {
            Icon(Icons.Default.Visibility, contentDescription = "Glasses", tint = LabVisionColors.TextSecondary)
        }
    }
}
