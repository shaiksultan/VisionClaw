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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LinkOff
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Smartphone
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.PermissionStatus
import com.meta.wearable.dat.core.types.RegistrationState
import com.meta.wearable.dat.externalsampleapps.cameraaccess.R
import com.meta.wearable.dat.externalsampleapps.cameraaccess.wearables.WearablesViewModel
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NonStreamScreen(
    viewModel: WearablesViewModel,
    onRequestWearablesPermission: suspend (Permission) -> PermissionStatus,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val gettingStartedSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    var dropdownExpanded by remember { mutableStateOf(false) }
    val isDisconnectEnabled = uiState.registrationState is RegistrationState.Registered
    val activity = LocalActivity.current
    val context = LocalContext.current
    val scrollState = rememberScrollState()

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(LabVisionBackgroundBrush),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .systemBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp)
                .padding(bottom = 20.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = "LAB VISION AI",
                        color = LabVisionColors.Accent,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.4.sp,
                    )
                    Text(
                        text = "Ready to stream",
                        color = LabVisionColors.TextPrimary,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    IconButton(onClick = { viewModel.showSettings() }) {
                        Icon(
                            imageVector = Icons.Default.Settings,
                            contentDescription = "Settings",
                            tint = LabVisionColors.TextSecondary,
                        )
                    }
                    Box {
                        IconButton(onClick = { dropdownExpanded = true }) {
                            Icon(
                                imageVector = Icons.Default.LinkOff,
                                contentDescription = "Disconnect",
                                tint = LabVisionColors.TextSecondary,
                            )
                        }
                        DropdownMenu(
                            expanded = dropdownExpanded,
                            onDismissRequest = { dropdownExpanded = false },
                            modifier = Modifier.background(LabVisionColors.Surface),
                        ) {
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        stringResource(R.string.unregister_button_title),
                                        color = if (isDisconnectEnabled) {
                                            AppColor.Red
                                        } else {
                                            LabVisionColors.TextSecondary
                                        },
                                    )
                                },
                                enabled = isDisconnectEnabled,
                                onClick = {
                                    activity?.let { viewModel.startUnregistration(it) }
                                        ?: Toast.makeText(context, "Activity not available", Toast.LENGTH_SHORT).show()
                                    dropdownExpanded = false
                                },
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(18.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(20.dp))
                    .background(LabVisionColors.Surface.copy(alpha = 0.92f))
                    .border(1.dp, LabVisionColors.SurfaceElevated, RoundedCornerShape(20.dp))
                    .padding(18.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .clip(RoundedCornerShape(14.dp))
                                .background(
                                    Brush.linearGradient(
                                        listOf(LabVisionColors.Accent, LabVisionColors.AccentMuted),
                                    ),
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = "AI",
                                color = LabVisionColors.BackgroundTop,
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp,
                            )
                        }
                        Column {
                            Text(
                                text = stringResource(R.string.non_stream_screen_title),
                                color = LabVisionColors.TextPrimary,
                                fontSize = 17.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                text = if (uiState.hasActiveDevice) {
                                    "Glasses connected · choose how to start"
                                } else {
                                    stringResource(R.string.waiting_for_active_device)
                                },
                                color = LabVisionColors.TextSecondary,
                                fontSize = 13.sp,
                            )
                        }
                    }
                    Text(
                        text = stringResource(R.string.non_stream_screen_description),
                        color = LabVisionColors.TextSecondary,
                        fontSize = 13.sp,
                        lineHeight = 18.sp,
                    )
                }
            }

            Spacer(modifier = Modifier.height(22.dp))

            AgentShowcaseHeader(
                title = "MISSION AGENTS",
                subtitle = "Voice-ready agents available once you start streaming. Showcase only — no action yet.",
            )

            Spacer(modifier = Modifier.height(12.dp))

            AgentShowcaseGrid()

            Spacer(modifier = Modifier.height(22.dp))

            if (!uiState.hasActiveDevice) {
                Text(
                    text = stringResource(R.string.waiting_for_active_device),
                    color = LabVisionColors.TextSecondary,
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                )
            }

            SwitchButton(
                label = stringResource(R.string.stream_button_title),
                onClick = { viewModel.navigateToStreaming(onRequestWearablesPermission) },
                enabled = uiState.hasActiveDevice,
                accent = true,
                leadingIcon = Icons.Default.Videocam,
            )

            Spacer(modifier = Modifier.height(10.dp))

            SwitchButton(
                label = stringResource(R.string.home_phone_mode_button),
                onClick = { viewModel.navigateToPhoneMode() },
                outlined = true,
                leadingIcon = Icons.Default.Smartphone,
            )
        }

        if (uiState.isGettingStartedSheetVisible) {
            ModalBottomSheet(
                onDismissRequest = { viewModel.hideGettingStartedSheet() },
                sheetState = gettingStartedSheetState,
                containerColor = LabVisionColors.Surface,
                contentColor = LabVisionColors.TextPrimary,
            ) {
                GettingStartedSheetContent(
                    onContinue = {
                        scope.launch {
                            gettingStartedSheetState.hide()
                            viewModel.hideGettingStartedSheet()
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun GettingStartedSheetContent(onContinue: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp)
            .padding(bottom = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        Text(
            text = stringResource(R.string.getting_started_title),
            color = LabVisionColors.TextPrimary,
            fontSize = 20.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
        )

        Column(
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            TipItem(
                iconResId = R.drawable.video_icon,
                text = stringResource(R.string.getting_started_tip_permission),
            )
            TipItem(
                iconResId = R.drawable.tap_icon,
                text = stringResource(R.string.getting_started_tip_photo),
            )
            TipItem(
                iconResId = R.drawable.smart_glasses_icon,
                text = stringResource(R.string.getting_started_tip_led),
            )
        }

        SwitchButton(
            label = stringResource(R.string.getting_started_continue),
            onClick = onContinue,
            accent = true,
            modifier = Modifier.navigationBarsPadding(),
        )
    }
}

@Composable
private fun TipItem(iconResId: Int, text: String, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(LabVisionColors.BackgroundTop.copy(alpha = 0.55f))
            .padding(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            painter = painterResource(id = iconResId),
            contentDescription = null,
            tint = LabVisionColors.Accent,
            modifier = Modifier.size(22.dp).padding(top = 2.dp),
        )
        Spacer(modifier = Modifier.size(10.dp))
        Text(
            text = text,
            color = LabVisionColors.TextSecondary,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
    }
}
