package com.meta.wearable.dat.externalsampleapps.cameraaccess.meeting

import android.content.Context
import android.graphics.Bitmap
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class MeetingArchive(val folder: File, val transcript: String, val durationSeconds: Long)

class MeetingRecorder(context: Context) {
    private val root = File(context.filesDir, "meetings")
    private var folder: File? = null
    private var pcmFile: File? = null
    private var pcmOut: FileOutputStream? = null
    private val transcript = StringBuilder()
    private var startedAt = 0L
    private var lastFrameAt = 0L
    @Volatile var isRecording = false
        private set

    @Synchronized fun start(): Result<String> = runCatching {
        check(!isRecording) { "A meeting is already being recorded" }
        val stamp = SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.US).format(Date())
        folder = File(root, stamp).also { it.mkdirs() }
        pcmFile = File(folder, "meeting.pcm")
        pcmOut = FileOutputStream(pcmFile)
        transcript.clear()
        startedAt = System.currentTimeMillis()
        lastFrameAt = 0L
        isRecording = true
        folder!!.absolutePath
    }

    @Synchronized fun appendAudio(data: ByteArray) {
        if (isRecording) pcmOut?.write(data)
    }

    @Synchronized fun appendTranscript(text: String) {
        if (isRecording && text.isNotBlank()) transcript.append(text)
    }

    @Synchronized fun captureFrame(bitmap: Bitmap) {
        if (!isRecording) return
        val now = System.currentTimeMillis()
        if (now - lastFrameAt < 5_000) return
        lastFrameAt = now
        val elapsed = (now - startedAt) / 1000
        FileOutputStream(File(folder, "view_${elapsed.toString().padStart(6, '0')}.jpg")).use {
            bitmap.compress(Bitmap.CompressFormat.JPEG, 70, it)
        }
    }

    @Synchronized fun stop(): Result<MeetingArchive> = runCatching {
        check(isRecording) { "No meeting recording is active" }
        isRecording = false
        pcmOut?.flush(); pcmOut?.close(); pcmOut = null
        val currentFolder = checkNotNull(folder)
        val text = transcript.toString().trim()
        File(currentFolder, "transcript.txt").writeText(text)
        pcmFile?.let { pcm -> writeWave(pcm, File(currentFolder, "meeting.wav")) }
        MeetingArchive(currentFolder, text, (System.currentTimeMillis() - startedAt) / 1000)
    }

    @Synchronized fun cancel() {
        isRecording = false
        runCatching { pcmOut?.close() }
        pcmOut = null
    }

    private fun writeWave(pcm: File, wav: File) {
        val dataLength = pcm.length()
        FileOutputStream(wav).use { out ->
            fun le(value: Long, bytes: Int) { repeat(bytes) { out.write(((value shr (8 * it)) and 0xff).toInt()) } }
            out.write("RIFF".toByteArray()); le(dataLength + 36, 4); out.write("WAVEfmt ".toByteArray())
            le(16, 4); le(1, 2); le(1, 2); le(16_000, 4); le(32_000, 4); le(2, 2); le(16, 2)
            out.write("data".toByteArray()); le(dataLength, 4)
            pcm.inputStream().use { it.copyTo(out) }
        }
        pcm.delete()
    }
}
