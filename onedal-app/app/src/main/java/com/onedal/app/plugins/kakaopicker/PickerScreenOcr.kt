package com.onedal.app.plugins.kakaopicker

/**
 * 📷 **픽커 상세 화면을 «그림으로» 읽은 줄들을 콜 한 건으로 옮긴다.**
 *
 * 🔴 **일부러 둔 두 벌이다** — 서버 `onedal-web/server/src/core/plugins/kakaopicker/pickerScreenOcr.ts`
 *    와 같은 규칙이다. 폰이 상세를 연 뒤 **0.5초 안에** 찍고 읽고 대조까지 끝내야 해서(기사님 지시)
 *    서버 왕복 없이 폰 안에서 나눈다. 규칙을 고치면 **양쪽을 같이** 고치고, 두 검사가 같은 문제지
 *    (2026-09-13 실측 OCR 출력)를 문다.
 *
 * 왜 그림인가: 접근성 트리로는 픽커 상세의 **배송지가 아예 안 온다.** 거리도 화면에 없는 값이 섞이고
 * 건물명 끝에 픽커 앱 버그인 `kotlin.Unit` 이 붙는다. 우리가 고칠 자리가 아니라 그림으로 우회한다.
 *
 * 무엇을 믿고 나누나: 화면은 「픽업 Nkm」/「배송 Nkm」 가 각 주소 덩어리의 머리다. 그 둘을 경계로
 * 위에서 아래로 자른다. 지도(잡음이 많다)는 첫 머리 앞이라 저절로 잘려 나간다.
 *
 * 🔴 여기서 좌표를 구하지 않는다 — «줄 → 칸» 하나만 한다.
 * 🔴 `straightKm` 은 직선거리다 — 도로는 1.23~1.24 배다. 그대로 쓰면 나쁜 콜이 24% 좋아 보인다.
 */

/** OCR 한 줄 — `y` 는 위에서부터의 자리(위가 작다). 엔진이 무엇이든 이 둘만 주면 된다 */
data class OcrLine(val y: Int, val text: String)

data class PickerStopFromImage(
    /** 행정동까지 — `경기 성남시 수정구 위례동` */
    val admin: String,
    /** 건물·상호 — 없을 수 있다 (규칙 ④: 없으면 `null`, 지어내지 않는다) */
    val place: String?,
    /** 🔴 직선거리다. 도로가 아니다 */
    val straightKm: Double,
    /** 화면에 적힌 시각 그대로 — `내일 15:00`. 못 읽으면 `null` */
    val at: String?,
)

data class PickerDetailFromImage(
    val pickup: PickerStopFromImage,
    val dropoff: PickerStopFromImage,
    /** `초소형 세 변의 합 70cm · 2kg 이하` 같은 줄 그대로 */
    val itemSize: String?,
    /** 🔴 예약 콜인가 — 「내일 15:00 픽업예약」 줄이 있으면 참. 시각을 모르면 시급도 상차버퍼도 틀린다 */
    val reserved: Boolean,
)

object PickerScreenOcr {
    /** 시·도 이름 — 행정동 줄의 머리다 */
    private val PROVINCES = listOf(
        "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
        "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
    )

    /** `픽업 16.9km` · `배송 10.1km` — 덩어리의 머리 */
    private val HEAD_RE = Regex("^(픽업|배송)\\s*([0-9]+(?:\\.[0-9]+)?)\\s*km")

    /** `내일 15:00` · `오늘 9:20` · `15:00` */
    private val TIME_RE = Regex("^(오늘|내일|모레)?\\s*([0-9]{1,2}:[0-9]{2})$")

    /**
     * `10:00까지 픽업` · `12:39까지 배송` — **오늘 콜**은 시각이 이 꼴로 온다 (2026-09-19 A24 실측).
     * 🔴 이 줄을 시각으로 안 보면 **건물명 자리에 들어간다** — 첫 판에서 그랬다.
     */
    private val DEADLINE_RE = Regex("^([0-9]{1,2}:[0-9]{2}까지)\\s*(픽업|배송)$")

    private val SIZE_RE = Regex("^(초소형|소형|중형|대형)")

    /** OCR 이 줄 앞에 붙이는 불릿(`•`·`·`·`*`) — 한글·숫자·영문이 나오는 첫 자리부터 남긴다 */
    private val BULLET_RE = Regex("^[^0-9A-Za-z가-힣]+")

    /** 같은 줄로 볼 위아래 여유 — 머리와 행정동은 같은 가로줄이라 y 가 몇 px 뒤집힐 수 있다 (실측 3px) */
    private const val SLACK = 20

    private data class Head(val y: Int, val km: Double)

    fun stripBullet(text: String): String = text.replace(BULLET_RE, "").trim()

    fun isAdminLine(text: String): Boolean = PROVINCES.any { text.startsWith("$it ") }

    /** 시각 줄이면 화면에 적힌 시각 그대로(`내일 15:00` · `10:00까지`), 아니면 null */
    private fun timeOf(text: String): String? =
        TIME_RE.find(text)?.value?.trim() ?: DEADLINE_RE.find(text)?.groupValues?.get(1)

    /**
     * 머리(`픽업 Nkm`·`배송 Nkm`) 둘이 다 없으면 **`null`** — 반쪽짜리를 만들지 않는다 (규칙 ④).
     * 상세가 아닌 화면(홈·리스트)을 찍었을 때가 그 경우다.
     */
    fun parseDetail(lines: List<OcrLine>): PickerDetailFromImage? {
        val sorted = lines
            .map { OcrLine(it.y, stripBullet(it.text)) }
            .filter { it.text.isNotEmpty() }
            .sortedBy { it.y }

        // ① 머리 둘을 찾는다 — 먼저 나오는 것 하나씩만 본다 (지도 라벨에 같은 말이 있다)
        var pickupHead: Head? = null
        var dropoffHead: Head? = null
        for (l in sorted) {
            val m = HEAD_RE.find(l.text) ?: continue
            val km = m.groupValues[2].toDoubleOrNull() ?: continue
            if (m.groupValues[1] == "픽업" && pickupHead == null) pickupHead = Head(l.y, km)
            if (m.groupValues[1] == "배송" && dropoffHead == null) dropoffHead = Head(l.y, km)
        }
        if (pickupHead == null || dropoffHead == null) return null

        // ② 머리를 경계로 잘라 각 덩어리를 읽는다
        val pickup = readStop(sorted, pickupHead, dropoffHead.y) ?: return null
        val dropoff = readStop(sorted, dropoffHead, Int.MAX_VALUE) ?: return null

        // ③ 물품 정보 — 크기 낱말로 시작하는 줄 그대로. 우리 적재 체계로 환산하지 않는다 (규칙 ④)
        val itemSize = sorted.firstOrNull { SIZE_RE.containsMatchIn(it.text) }?.text

        // ④ 예약 콜인가 — 「…픽업예약」 줄 하나로 판단한다
        val reserved = sorted.any { it.text.contains("픽업예약") }

        return PickerDetailFromImage(pickup, dropoff, itemSize, reserved)
    }

    /** 한 덩어리(머리 − 여유 ~ 다음 머리 − 여유)에서 행정동·건물명·시각을 뽑는다 */
    private fun readStop(sorted: List<OcrLine>, head: Head, nextHeadY: Int): PickerStopFromImage? {
        val upper = if (nextHeadY == Int.MAX_VALUE) Int.MAX_VALUE else nextHeadY - SLACK
        val block = sorted.filter { it.y >= head.y - SLACK && it.y < upper }

        val admin = block.firstOrNull { isAdminLine(it.text) }?.text ?: return null
        val at = block.firstNotNullOfOrNull { timeOf(it.text) }

        // 건물명 — 머리·행정동·시각을 뺀 나머지 첫 줄
        val place = block.firstOrNull {
            it.text != admin && !HEAD_RE.containsMatchIn(it.text) && timeOf(it.text) == null
        }?.text

        return PickerStopFromImage(admin = admin, place = place, straightKm = head.km, at = at)
    }
}
