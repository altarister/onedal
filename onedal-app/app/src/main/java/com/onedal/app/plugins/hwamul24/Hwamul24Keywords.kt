package com.onedal.app.plugins.hwamul24

import com.onedal.app.core.ScreenKeywords

object Hwamul24Keywords {
    /** 24시콜 전용 키워드 (향후 실제 앱 분석 후 채워넣기) */
    val TWENTYFOUR = ScreenKeywords(
        listRequired = listOf("TODO_LIST_KEYWORD"),
        completedListRequired = listOf("TODO_COMPLETED_KEYWORD"),
        detailKeywords = listOf("TODO_DETAIL_KEYWORD"),
        confirmKeywords = listOf("TODO_CONFIRM_KEYWORD"),
        pickupKeywords = listOf("TODO_PICKUP_KEYWORD"),
        dropoffKeywords = listOf("TODO_DROPOFF_KEYWORD"),
        memoKeywords = listOf("TODO_MEMO_KEYWORD"),
        errorKeywords = listOf("TODO_ERROR_KEYWORD"),
        loadingKeywords = listOf("TODO_LOADING_KEYWORD")
    )
}
