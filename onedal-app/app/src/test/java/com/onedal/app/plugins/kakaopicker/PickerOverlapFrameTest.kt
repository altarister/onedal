package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertNotNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📐 **겹친 틀 — 목록이 움직이는 중간 틀은 목록으로 믿지 않는다** (라이브 09-30 19:45:39 · 19:46:00 · onedal-1f «가»).
 * 그 틀에서 두 카드 글자가 한 줄로 섞여(«송파 수정 → 서대문 태평2 12,250») 광남2 카드를 못 뽑았고, 손으로 연 그 콜이 «요금 없음»으로 버려졌다.
 * - 요금 두 개의 좌표는 19:46:00 «👁️ [리스트 스캔]» 줄 그대로(«14,168»·«13,783»@(878,823,1052,889))
 * - 거리 노드는 «📐» 줄의 글자·top 그대로 · x 는 로그에 없어 «같은 카드 칸» 한 값으로 뒀다
 */
class PickerOverlapFrameTest {
    private fun c(text: String, l: Int, t: Int, r: Int, b: Int) = Triple(text, (t + b) / 2, (l + r) / 2)

    @Test fun `서로 다른 요금 둘이 같은 칸 - 19시46분00초 리스트 스캔 좌표`() =
        assertNotNull(KakaoPickerParser.overlappedFrame(listOf(c("14,168", 878, 823, 1052, 889), c("13,783", 878, 823, 1052, 889))))

    @Test fun `거리 셋이 같은 줄 같은 칸 - 19시46분00초 4토막 줄`() =
        assertNotNull(KakaoPickerParser.overlappedFrame(listOf(
            c("19.9km", 40, 1023, 180, 1063), c("19.8km", 40, 1023, 180, 1063), c("15.9km", 40, 1023, 180, 1063),
            c("송파", 300, 1019, 380, 1059), c("12,250", 878, 986, 1052, 1052))))

    /** 14:29:40 실물 카드 두 장(top 은 로그 · 카드 간격 163px) + 목록 머리 «20km» 칩 */
    @Test fun `정상 목록은 안 걸린다 - 카드 둘과 목록 머리 20km`() =
        assertNull(KakaoPickerParser.overlappedFrame(listOf(
            c("20km", 560, 300, 680, 340),
            c("15.7km", 40, 1617, 180, 1657), c("15,246", 878, 1580, 1052, 1646),
            c("16.9km", 40, 1780, 180, 1820), c("10,010", 878, 1743, 1052, 1809))))

    /**
     * 🧩 **한 카드에 거리 둘 = 두 카드가 어긋나게 포갠 틀** (라이브 09-30 20:11:32 · 20:11:33 — y 가 40~70px 어긋나 «같은 칸»에 안 걸렸다).
     * 오늘 «📐» 2,207줄 전수: 거리 둘 이상 17줄 · 전부 섞인 카드(«수지 송파 → 수정 위례» 꼴) · 정상 카드는 0줄.
     */
    @Test fun `한 카드에 거리 둘 - 20시11분 섞인 카드`() {
        assertNotNull(KakaoPickerParser.mixedCard(listOf("예약", "은행2", "14.5km", "급송", "중형", "중원", "10/3(토)", "처인", "9,394", "퀵", "퀵", "승", "예약", "17.3km", "처인", "중앙", "역북")))
        assertNotNull(KakaoPickerParser.mixedCard(listOf("퀵", "승", "예약", "내일", "남양주", "19.4km", "퀵", "반나절", "소형", "하남", "예약", "천현", "내일", "수지", "와부", "15.0km", "중원", "성남", "죽전1", "9,317")))
    }

    @Test fun `정상 카드는 거리 하나 - 안 걸린다`() =
        assertNull(KakaoPickerParser.mixedCard(listOf("퀵", "승", "예약", "14:30", "분당", "16.9km", "수지", "죽전2", "서현1", "10,010")))
}

/**
 * ✂️ **윗줄이 잘린 카드는 덜 읽힌 카드** (라이브 09-30 20:23:37 · 20:24:21 · onedal-1f «가»).
 * - 20:23:37 목록 글 «4.7km 광주 경안 한남 16,093 …» — 태그 줄(«퀵 반나절 중형 예약 내일»)과 도착 구 «용산»이 화면 위로 잘려
 *   «예약 없음 · 도착 한남»으로 읽혀 **내일 콜에 알람이 울렸다**
 * - 20:24:21 «📐 퀵@-67 … 수정@-67 8,610@-67 14.8km@0 …» — 화면 위(y<0)에 걸린 카드가 «수정 → 수정»으로 조립돼 손 상세 후보가 둘이 됐다
 * 오늘 «📐» 2,285장 가운데 태그 낱말 없는 카드 5장 — 전부 그리는 중간 틀(정상 카드는 늘 «퀵»·«도보» 같은 배지가 있다).
 * 잘린 카드 11장 가운데 10장은 앞서 온전히 읽혔다(1~39번) · 1장(13:56 중원 금광2 2,985)은 한 번도 온전히 안 읽혔다.
 */
class PickerClippedCardTest {
    private val tagSet = setOf("퀵", "도보", "한차", "급송", "단거리", "예약", "반나절", "승", "내일", "오늘", "비즈")

    @Test fun `태그 줄이 잘렸다 - 20시23분37초 목록 글`() =
        assertNotNull(KakaoPickerParser.clippedCard(listOf("4.7km", "광주", "경안", "한남", "16,093"), listOf(1000, 996, 996, 996, 963), tagSet))

    @Test fun `화면 위에 걸렸다 - 20시24분21초 4토막 줄`() =
        assertNotNull(KakaoPickerParser.clippedCard(
            listOf("퀵", "급송", "승", "예약", "내일", "수정", "8,610", "14.8km", "수정", "양지", "위례"),
            listOf(-67, -67, -67, -67, -67, -67, -67, 0, 0, 0, 0), tagSet))

    @Test fun `온전한 카드는 남긴다 - 14시29분40초`() =
        assertNull(KakaoPickerParser.clippedCard(
            listOf("퀵", "승", "예약", "14:30", "분당", "16.9km", "수지", "죽전2", "서현1", "10,010"),
            listOf(1556, 1556, 1556, 1558, 1553, 1617, 1613, 1613, 1613, 1580), tagSet))
}

/** 📐 버림 로그가 스스로 말하게 — 거리가 같은 섞임인가 · 잘린 카드가 목록 위 끝인가 한가운데인가 (onedal-ab 검토 (c) · 1f «가») */
class PickerDiscardWordsTest {
    @Test fun `거리 둘이 같으면 같음`() =
        assertTrue(KakaoPickerParser.mixedCard(listOf("수지", "14.5km", "송파", "14.5km", "9,394"))!!.contains("거리 같음"))

    @Test fun `거리 둘이 다르면 다름`() =
        assertTrue(KakaoPickerParser.mixedCard(listOf("수지", "14.5km", "송파", "17.3km", "9,394"))!!.contains("거리 다름"))

    @Test fun `머리줄 바로 밑 카드는 위 끝`() = assertEquals("위 끝", KakaoPickerParser.clipPlace(250, 400, 200))

    @Test fun `화면 위에 걸린 카드는 머리줄이 없어도 위 끝`() = assertEquals("위 끝", KakaoPickerParser.clipPlace(-20, 130, null))

    @Test fun `목록 한가운데 카드`() = assertEquals("한가운데(y=1500)", KakaoPickerParser.clipPlace(1500, 1650, 200))
}
