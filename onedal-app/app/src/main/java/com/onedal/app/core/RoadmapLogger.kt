package com.onedal.app.core

import android.util.Log
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object RoadmapLogger {
    private const val TAG = "1DAL_MVP"

    fun log(message: String, pageName: String = "") {
        val ts = SimpleDateFormat("HH:mm:ss.SSS", Locale.getDefault()).format(Date())
        val pageStr = if (pageName.isNotEmpty()) " [$pageName]" else ""
        Log.d(TAG, "🚦 [ROADMAP $ts] [📱앱]$pageStr $message")
    }
}
