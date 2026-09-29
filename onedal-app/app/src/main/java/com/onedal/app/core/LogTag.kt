package com.onedal.app.core

/**
 * 🏷️ **로그 태그 — 한 줄의 종류를 기계가 찾게 하는 열 낱말** (reviews/22 2단계).
 * 서버·관제웹·원달앱이 같은 낱말을 쓴다 — 짝은 `onedal-web/shared/src/logTags.ts` (`LogTagPairTest` 가 «같다»를 문다).
 * 줄에는 말머리 맨 앞 `#낱말` 로 붙는다. 이모지는 그대로 — 눈은 이모지, 기계는 태그.
 */
enum class LogTag(val word: String) {
    CALL_STAGE("콜단계"),   // 잡음 · 도착 · 완료 · 취소 · 탈락 · 보류
    JUDGE("판정"),         // 점수 · 색 · 합짐 방향 · 요율
    DECISION("결재"),      // KEEP · CANCEL · ACK
    FILTER("필터"),        // 목록 판정 · 상차 목록 · 필터 변경
    TAP("누름"),           // 터치 발사 · 성공 · 실패 · 안 먹힘
    SCREEN("화면"),        // 화면 종류 바뀜 · 상세 진입 · 복귀
    LOCATION("위치"),      // GPS
    NETWORK("통신"),       // 보고 · 응답 · 실패
    WARN("경고"),          // W · E · 이상 징후
    BOOT("부팅");          // 서비스 붙음 · 끊김 · 로그 파일

    companion object {
        /** 태그 없이 찍힌 줄에 로거가 붙이는 표지 — 태깅이 끝나면 이 수가 0 이 된다 */
        const val NO_TAG = "없음"
    }
}
