package com.onedal.app.models

data class OrderData(
    val type: String = "NEW_ORDER",
    val origin: String,
    val destination: String,
    val price: Int,
    val timestamp: String
)
