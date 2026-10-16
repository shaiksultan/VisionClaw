package com.meta.wearable.dat.externalsampleapps.cameraaccess.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.cos
import kotlin.math.sin

/**
 * Big assistant orb: thin overlapping curved ellipses + soft glowing dots,
 * matching the premium voice-home visual (not a filled green badge).
 */
@Composable
fun AnimatedOrb(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "orb")
    val spinSlow by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(32000, easing = LinearEasing), RepeatMode.Restart),
        label = "spin_slow",
    )
    val spinMid by transition.animateFloat(
        initialValue = 0f,
        targetValue = -360f,
        animationSpec = infiniteRepeatable(tween(24000, easing = LinearEasing), RepeatMode.Restart),
        label = "spin_mid",
    )
    val spinFast by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(18000, easing = LinearEasing), RepeatMode.Restart),
        label = "spin_fast",
    )
    val breathe by transition.animateFloat(
        initialValue = 0.97f,
        targetValue = 1.03f,
        animationSpec = infiniteRepeatable(tween(3200, easing = LinearEasing), RepeatMode.Reverse),
        label = "breathe",
    )
    val shimmer by transition.animateFloat(
        initialValue = 0.2f,
        targetValue = 0.55f,
        animationSpec = infiniteRepeatable(tween(2600, easing = LinearEasing), RepeatMode.Reverse),
        label = "shimmer",
    )

    Canvas(
        modifier = modifier
            .fillMaxWidth(0.92f)
            .aspectRatio(1f),
    ) {
        val cx = size.width / 2f
        val cy = size.height / 2f
        val r = size.minDimension * 0.36f * breathe

        // Soft cyan core glow (no green)
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    Color(0xFF3DDCFF).copy(alpha = shimmer * 0.28f),
                    Color(0xFF1E90FF).copy(alpha = shimmer * 0.12f),
                    Color.Transparent,
                ),
                center = Offset(cx, cy),
                radius = r * 1.65f,
            ),
            radius = r * 1.65f,
            center = Offset(cx, cy),
        )

        fun curve(
            angle: Float,
            rx: Float,
            ry: Float,
            color: Color,
            stroke: Float,
            dash: Boolean = false,
        ) {
            rotate(angle, pivot = Offset(cx, cy)) {
                drawOval(
                    color = color,
                    topLeft = Offset(cx - rx, cy - ry),
                    size = Size(rx * 2f, ry * 2f),
                    style = Stroke(
                        width = stroke,
                        pathEffect = if (dash) PathEffect.dashPathEffect(floatArrayOf(10f, 14f)) else null,
                    ),
                )
            }
        }

        // Many thin curved rings at different tilts (like the reference)
        curve(spinSlow, r * 1.08f, r * 0.62f, Color(0xFF7DD3FC).copy(alpha = 0.35f), 1.2f)
        curve(spinSlow + 18f, r * 1.02f, r * 0.7f, Color(0xFF3DDCFF).copy(alpha = 0.4f), 1.1f)
        curve(spinMid, r * 0.95f, r * 0.88f, Color(0xFF60A5FA).copy(alpha = 0.45f), 1.35f)
        curve(spinMid + 32f, r * 0.9f, r * 0.98f, Color(0xFF93C5FD).copy(alpha = 0.32f), 1.05f)
        curve(spinFast, r * 0.82f, r * 0.68f, Color.White.copy(alpha = 0.28f), 1.0f)
        curve(spinFast + 48f, r * 0.78f, r * 0.92f, Color(0xFF38BDF8).copy(alpha = 0.5f), 1.25f)
        curve(spinSlow * 0.4f + 70f, r * 0.72f, r * 0.55f, Color(0xFFBAE6FD).copy(alpha = 0.3f), 0.95f, dash = true)
        curve(spinMid * 0.6f + 12f, r * 0.66f, r * 0.8f, Color(0xFF22D3EE).copy(alpha = 0.42f), 1.15f)
        curve(spinFast * 0.5f, r * 0.58f, r * 0.58f, Color(0xFF67E8F9).copy(alpha = 0.55f), 1.5f)
        curve(spinSlow + 95f, r * 0.5f, r * 0.72f, Color(0xFFE0F2FE).copy(alpha = 0.25f), 0.9f)

        // Glowing dots riding the curves
        val dots = 22
        for (i in 0 until dots) {
            val phase = (i / dots.toFloat()) * Math.PI * 2.0
            val orbit = r * (0.72f + (i % 4) * 0.07f)
            val dir = if (i % 2 == 0) 1.0 else -0.55
            val ang = phase + Math.toRadians(spinFast.toDouble() * dir)
            val squash = 0.82f + (i % 3) * 0.06f
            val x = cx + (orbit * cos(ang)).toFloat()
            val y = cy + (orbit * sin(ang)).toFloat() * squash
            val bright = i % 5 == 0
            val dotR = if (bright) 3.8f else 2.2f
            drawCircle(
                color = if (bright) Color.White.copy(alpha = 0.92f) else Color(0xFF7DD3FC).copy(alpha = 0.8f),
                radius = dotR,
                center = Offset(x, y),
            )
            if (bright) {
                drawCircle(
                    color = Color(0xFF3DDCFF).copy(alpha = 0.22f),
                    radius = dotR * 3.5f,
                    center = Offset(x, y),
                )
            }
        }
    }
}

/** Compact cyan orbital mark — replaces the old green “AI” square logo. */
@Composable
fun BrandOrbLogo(
    modifier: Modifier = Modifier,
    size: Dp = 48.dp,
) {
    val transition = rememberInfiniteTransition(label = "logo_orb")
    val spin by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(9000, easing = LinearEasing), RepeatMode.Restart),
        label = "logo_spin",
    )

    Canvas(modifier = modifier.size(size)) {
        val cx = this.size.width / 2f
        val cy = this.size.height / 2f
        val r = this.size.minDimension * 0.32f
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(Color(0x553DDCFF), Color.Transparent),
                center = Offset(cx, cy),
                radius = r * 1.8f,
            ),
            radius = r * 1.8f,
            center = Offset(cx, cy),
        )
        rotate(spin, pivot = Offset(cx, cy)) {
            drawOval(
                color = Color(0xFF3DDCFF).copy(alpha = 0.85f),
                topLeft = Offset(cx - r * 1.15f, cy - r * 0.7f),
                size = Size(r * 2.3f, r * 1.4f),
                style = Stroke(width = 2.2f),
            )
            drawOval(
                color = Color(0xFF60A5FA).copy(alpha = 0.55f),
                topLeft = Offset(cx - r * 0.7f, cy - r * 1.1f),
                size = Size(r * 1.4f, r * 2.2f),
                style = Stroke(width = 1.6f),
            )
        }
        drawCircle(color = Color(0xFF7DD3FC), radius = r * 0.28f, center = Offset(cx, cy))
        drawCircle(color = Color.White.copy(alpha = 0.9f), radius = r * 0.12f, center = Offset(cx, cy))
    }
}
