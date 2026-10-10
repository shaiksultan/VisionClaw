package com.meta.wearable.dat.externalsampleapps.cameraaccess.support

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

data class ExpertSupportStartEvent(
    val callId: Int,
    val callCode: String,
    val description: String,
)

/**
 * Bridges voice tool / API start into StreamScreen so WebRTC can start
 * without the user typing a room code on Mission Control.
 */
object SupportSessionBridge {
    private val _starts = MutableSharedFlow<ExpertSupportStartEvent>(
        replay = 1,
        extraBufferCapacity = 1,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val starts: SharedFlow<ExpertSupportStartEvent> = _starts.asSharedFlow()

    fun emitStart(callId: Int, callCode: String, description: String) {
        _starts.tryEmit(ExpertSupportStartEvent(callId, callCode, description))
    }
}
