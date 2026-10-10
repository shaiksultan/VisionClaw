/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

package com.meta.wearable.dat.externalsampleapps.cameraaccess.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun SwitchButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    isDestructive: Boolean = false,
    enabled: Boolean = true,
    accent: Boolean = false,
    outlined: Boolean = false,
    leadingIcon: ImageVector? = null,
) {
    val shape = RoundedCornerShape(16.dp)

    if (outlined) {
        OutlinedButton(
            modifier = modifier.height(54.dp).fillMaxWidth(),
            onClick = onClick,
            enabled = enabled,
            shape = shape,
            border = BorderStroke(1.dp, LabVisionColors.SurfaceElevated),
            colors = ButtonDefaults.outlinedButtonColors(
                contentColor = LabVisionColors.TextPrimary,
                disabledContentColor = LabVisionColors.TextSecondary.copy(alpha = 0.45f),
            ),
        ) {
            if (leadingIcon != null) {
                Icon(leadingIcon, contentDescription = null, modifier = Modifier.size(18.dp), tint = LabVisionColors.Accent)
                Spacer(modifier = Modifier.width(8.dp))
            }
            Text(label, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
        }
        return
    }

    Button(
        modifier = modifier.height(54.dp).fillMaxWidth(),
        onClick = onClick,
        shape = shape,
        colors = ButtonDefaults.buttonColors(
            containerColor = when {
                isDestructive -> AppColor.DestructiveBackground
                accent -> LabVisionColors.Accent
                else -> LabVisionColors.SurfaceElevated
            },
            disabledContainerColor = LabVisionColors.SurfaceElevated.copy(alpha = 0.45f),
            disabledContentColor = LabVisionColors.TextSecondary.copy(alpha = 0.5f),
            contentColor = when {
                isDestructive -> AppColor.DestructiveForeground
                accent -> LabVisionColors.BackgroundTop
                else -> LabVisionColors.TextPrimary
            },
        ),
        enabled = enabled,
    ) {
        if (leadingIcon != null) {
            Icon(
                leadingIcon,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = if (accent) LabVisionColors.BackgroundTop else LabVisionColors.Accent,
            )
            Spacer(modifier = Modifier.width(8.dp))
        }
        Text(label, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
    }
}
