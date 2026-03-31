package com.onedal.app.models

data class OrderData(
    val type: String = "NEW_ORDER",
    val pickup: String,
    val dropoff: String,
    val fare: Int,
    val timestamp: String,
    val rawText: String? = null
)
