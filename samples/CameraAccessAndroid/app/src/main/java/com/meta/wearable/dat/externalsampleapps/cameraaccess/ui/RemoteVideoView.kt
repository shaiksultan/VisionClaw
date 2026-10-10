package com.meta.wearable.dat.externalsampleapps.cameraaccess.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import org.webrtc.EglBase
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack

@Composable
fun RemoteVideoView(
    videoTrack: VideoTrack?,
    eglBase: EglBase?,
    modifier: Modifier = Modifier,
) {
    if (videoTrack == null || eglBase == null) return

    val rendererState = remember { mutableStateOf<SurfaceViewRenderer?>(null) }

    AndroidView(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Color.Black),
        factory = { context ->
            SurfaceViewRenderer(context).apply {
                init(eglBase.eglBaseContext, null)
                setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
                setEnableHardwareScaler(true)
                setMirror(false)
                rendererState.value = this
            }
        },
        onRelease = { renderer ->
            videoTrack.removeSink(renderer)
            renderer.release()
            rendererState.value = null
        },
    )

    DisposableEffect(videoTrack, rendererState.value) {
        val renderer = rendererState.value
        if (renderer != null) {
            videoTrack.addSink(renderer)
        }
        onDispose {
            renderer?.let { videoTrack.removeSink(it) }
        }
    }
}
