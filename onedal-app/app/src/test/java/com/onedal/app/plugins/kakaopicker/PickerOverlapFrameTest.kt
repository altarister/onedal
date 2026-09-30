package com.onedal.app.plugins.kakaopicker

import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
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
