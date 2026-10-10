package com.meta.wearable.dat.externalsampleapps.cameraaccess.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.cos
import kotlin.math.sin

/** OpenAI-style orbiting-dot character with unique spin/pulse per agent tint. */
@Composable
fun OpenAiAgentMark(
    tint: Color,
    modifier: Modifier = Modifier,
    size: Dp = 44.dp,
    reverse: Boolean = false,
    spinMs: Int = 5200,
) {
    val transition = rememberInfiniteTransition(label = "agent_mark")
    val angle by transition.animateFloat(
        initialValue = 0f,
        targetValue = if (reverse) -360f else 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = spinMs, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "orbit_angle",
    )
    val pulse by transition.animateFloat(
        initialValue = 0.72f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1400, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "dot_pulse",
    )

    val palette = listOf(
        tint,
        tint.copy(alpha = 0.85f),
        tint.copy(alpha = 0.65f),
        Color.White.copy(alpha = 0.9f),
    )

    Canvas(modifier = modifier.size(size)) {
        val cx = this.size.width / 2f
        val cy = this.size.height / 2f
        val radius = this.size.minDimension * 0.34f
        val dotR = this.size.minDimension * 0.085f
        val coreR = this.size.minDimension * 0.1f

        rotate(angle, pivot = Offset(cx, cy)) {
            for (i in 0 until 8) {
                val theta = Math.toRadians((i * 45).toDouble())
                val x = cx + (radius * cos(theta)).toFloat()
                val y = cy + (radius * sin(theta)).toFloat()
                val color = palette[i % palette.size]
                drawCircle(
                    color = color.copy(alpha = pulse.coerceIn(0.55f, 1f)),
                    radius = dotR,
                    center = Offset(x, y),
                )
            }
        }
        drawCircle(
            color = tint.copy(alpha = 0.95f),
            radius = coreR * pulse,
            center = Offset(cx, cy),
        )
    }
}
