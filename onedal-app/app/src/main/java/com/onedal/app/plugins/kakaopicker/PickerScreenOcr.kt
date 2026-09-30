package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.OcrLine

/**
 * 📷 **픽커 상세 화면을 «그림으로» 읽은 줄들을 콜 한 건으로 옮긴다.**
 *
 * 🔴 **일부러 둔 두 벌이다** — 서버 `onedal-web/server/src/core/plugins/kakaopicker/pickerScreenOcr.ts`
 *    와 같은 규칙이다. 폰이 상세를 연 뒤 **0.5초 안에** 찍고 읽고 대조까지 끝내야 해서(기사님 지시)
 *    서버 왕복 없이 폰 안에서 나눈다. 규칙을 고치면 **양쪽을 같이** 고치고, 두 검사가 같은 문제지
 *    (실측 OCR 출력)를 문다.
 *
 * 왜 그림인가: 접근성 트리로는 픽커 상세의 **배송지가 아예 안 온다.** 거리도 화면에 없는 값이 섞이고
 * 건물명 끝에 픽커 앱 버그인 `kotlin.Unit` 이 붙는다. 우리가 고칠 자리가 아니라 그림으로 우회한다.
 *
 * 무엇을 믿고 나누나: 화면은 「픽업 Nkm」/「배송 Nkm」 가 각 주소 덩어리의 머리다. 그 둘을 경계로
 * 위에서 아래로 자른다. 지도(잡음이 많다)는 첫 머리 앞이라 저절로 잘려 나간다.
 */

/**
 * 🔴 여기서 좌표를 구하지 않는다 — «줄 → 칸» 하나만 한다.
 * 🔴 `straightKm` 은 직선거리다 — 도로는 1.23~1.24 배다. 그대로 쓰면 나쁜 콜이 24% 좋아 보인다.
 */

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
    val unreadLines: List<String> = emptyList(),
    val finalIncome: Int? = null,
    /** 📅 «오늘 17:00 픽업예약» 띠 줄 그대로 — 예약 날·시각은 여기서 먼저 읽는다(픽업 줄은 «17:00까지 픽업»처럼 날이 없다) */
    val reservedLine: String? = null,
)

object PickerScreenOcr {
    /** 시·도 이름 — 행정동 줄의 머리다 */
    private val PROVINCES = listOf(
        "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
        "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
    )

    /** `픽업 16.9km` · `배송 10.1km` — 덩어리의 머리 */
    /**
     * 🔴 **줄 처음만 보지 않는다** — 픽커 상세는 모양이 둘이다.
     *    「픽업 2.2km …」처럼 줄 처음에 오기도 하고, 「…모다아울렛 곤지암점 **픽업 2.2km** 17:48까지 픽업」처럼
     *    **주소 뒤에** 붙기도 한다. `^` 로 묶어 두면 뒤 모양을 통째로 놓친다 —
     *    사진에 배송지가 또렷한데 「머리 둘 누락」으로 버렸다 (이상 기록 #46·#48·#39).
     *    지도 라벨과 섞이는 것은 `^` 가 아니라 «먼저 나오는 것 하나만» 이 막는다.
     * 🔴 **숫자와 km 사이 오독 한 글자는 봐준다** — 실물 «픽업 14.7가km»(09-30 12:52 · 이상 기록 id 33)로 머리를 못 찾아 콜을 놓쳤다.
     *    한 글자(숫자·빈칸 아닌 것)까지만 — 더 느슨하면 지도 라벨이 걸린다.
     */
    private val HEAD_RE = Regex("(?:^|\\s)(\\S?업|배송)\\s*([0-9]+(?:\\.[0-9]+)?)\\s*[^\\s\\d]?\\s*km")

    /** 머리 낱말 → 픽업/배송 — «업» 앞 한 글자 오독(«찍업» · 실물 09-30 13:23 #41)은 픽업이다. 뒤에 숫자·km 가 붙을 때만 머리다(HEAD_RE) */
    private fun headSide(word: String): String = if (word.endsWith("업")) "픽업" else "배송"

    /**
     * 📑 **상세의 제목 줄 — 장소(건물 이름)가 아니다** (실물 09-30 13:25 #44 하차 «…논현2동 물품 정보»).
     * 하차 덩어리는 화면 끝까지라, 건물 줄이 없으면 제목이 건물 자리에 들어갔다.
     */
    private val SECTION_TITLES = listOf("물품 정보", "유의사항", "최종 수익", "배송비", "프로모션", "픽업 장소")
    private fun isSectionTitle(text: String) = SECTION_TITLES.any { text.startsWith(it) }

    /** `내일 15:00` · `오늘 9:20` · `15:00` */
    private val TIME_RE = Regex("^(오늘|내일|모레)?\\s*([0-9]{1,2}:[0-9]{2})$")

    /**
     * `10:00까지 픽업` · `12:39까지 배송` — **오늘 콜**은 시각이 이 꼴로 온다 (A24 실측).
     * 🔴 이 줄을 시각으로 안 보면 **건물명 자리에 들어간다** — 첫 판에서 그랬다.
     * 🔴 시각과 «픽업|배송» 사이 두 글자까지는 오독을 봐준다 — 실물 «16:55가지 배송»(09-30 12:54 · 이상 기록 id 34).
     *    화면에 적힌 뜻대로 «HH:MM까지»로 돌려준다.
     */
    private val DEADLINE_RE = Regex("^([0-9]{1,2}:[0-9]{2})\\s*\\S{0,2}\\s*(픽업|배송)$")

    /** 🔴 시각으로 시작하는 줄은 장소(건물 이름)가 아니다 — 오독으로 시각 꼴이 깨져도 건물 이름 자리에 들어가지 않게 */
    private val CLOCK_START = Regex("^[0-9]{1,2}:[0-9]{2}")

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
        TIME_RE.find(text)?.value?.trim() ?: DEADLINE_RE.find(text)?.groupValues?.get(1)?.let { "${it}까지" }

    /**
     * 📸 **머리가 없는 쪽** — 판독 실패 까닭을 «픽업 머리 없음»처럼 이름으로 (`PickerDetailOcrParser.failureReason`).
     * 머리 둘이 다 있는데 실패했으면 빈 목록 — 행정동 줄을 못 찾은 것이다.
     */
    /**
     * 🔢 **머리 km 숫자 안에서만 오독 글자를 숫자로** — 실물 «배송 19.Okm»(09-30 13:14:38 · 이상 기록 id 38 · 0 → 영문 O).
     * 머리(«픽업|배송» 바로 뒤) 숫자 토막 안의 O/o → 0 · l/I → 1 만 바꾼다 — 건물 이름 같은 다른 글자는 그대로.
     * HEAD_RE 에 글자를 늘리지 않고 숫자를 바로잡는 한 곳이다.
     */
    private val HEAD_NUMBER = Regex("""(\S?업|배송)(\s*)([0-9OoIl]+(?:\.[0-9OoIl]+)?)""")

    fun normalizeHeadDigits(text: String): String = HEAD_NUMBER.replace(text) { m ->
        val num = m.groupValues[3]
        if (num.none { it.isDigit() }) m.value
        else m.groupValues[1] + m.groupValues[2] + num.replace('O', '0').replace('o', '0').replace('I', '1').replace('l', '1')
    }

    /** 💰 사진의 «최종 수익» — y 차례로 읽어 `PickerFinalIncome` 한 규칙(숫자 줄이 글자 줄 바로 위·아래로 갈라져 온다) */
    private fun finalIncomeOf(sorted: List<OcrLine>): Int? = PickerFinalIncome.of(sorted.map { it.text })

    fun missingHeads(lines: List<OcrLine>): List<String> {
        val found = lines.mapNotNull { HEAD_RE.find(normalizeHeadDigits(stripBullet(it.text)))?.groupValues?.get(1)?.let(::headSide) }.toSet()
        return listOf("픽업", "배송").filter { it !in found }
    }

    /**
     * 머리(`픽업 Nkm`·`배송 Nkm`) 둘이 다 없으면 **`null`** — 반쪽짜리를 만들지 않는다 (규칙 ④).
     * 상세가 아닌 화면(홈·리스트)을 찍었을 때가 그 경우다.
     */
    fun parseDetail(lines: List<OcrLine>): PickerDetailFromImage? {
        val sorted = lines
            .map { OcrLine(it.y, normalizeHeadDigits(stripBullet(it.text))) }
            .filter { it.text.isNotEmpty() }
            .sortedBy { it.y }

        // ① 머리 둘을 찾는다 — 먼저 나오는 것 하나씩만 본다 (지도 라벨에 같은 말이 있다)
        var pickupHead: Head? = null
        var dropoffHead: Head? = null
        for (l in sorted) {
            val m = HEAD_RE.find(l.text) ?: continue
            val km = m.groupValues[2].toDoubleOrNull() ?: continue
            val side = headSide(m.groupValues[1])
            if (side == "픽업" && pickupHead == null) pickupHead = Head(l.y, km)
            if (side == "배송" && dropoffHead == null) dropoffHead = Head(l.y, km)
        }
        if (pickupHead == null || dropoffHead == null) return null

        // ② 머리를 경계로 잘라 각 덩어리를 읽는다
        val pickup = readStop(sorted, pickupHead, dropoffHead.y) ?: return null
        val dropoff = readStop(sorted, dropoffHead, Int.MAX_VALUE) ?: return null

        // ③ 물품 정보 — 크기 낱말로 시작하는 줄 그대로. 우리 적재 체계로 환산하지 않는다 (규칙 ④)
        val itemSize = sorted.firstOrNull { SIZE_RE.containsMatchIn(it.text) }?.text

        // ④ 예약 콜인가 — 「…픽업예약」 줄 하나로 판단한다
        val reservedLine = sorted.firstOrNull { it.text.contains("픽업예약") }?.text
        val reserved = reservedLine != null

        // ⑤ 칸에 안 넣은 줄 — 버리지 않고 돌려준다(유의사항 · 꼬리표 · 버튼 …). 픽커가 상세를 바꾸면 여기서 먼저 보인다
        val used = setOfNotNull(pickup.admin, pickup.place, dropoff.admin, dropoff.place, itemSize)
        val unreadLines = sorted.map { it.text }.filter {
            it !in used && !HEAD_RE.containsMatchIn(it) && timeOf(it) == null && !CLOCK_START.containsMatchIn(it) && !it.contains("픽업예약") &&
                !isSectionTitle(it)
        }

        return PickerDetailFromImage(pickup, dropoff, itemSize, reserved, unreadLines, finalIncomeOf(sorted), reservedLine)
    }

    /** 한 덩어리(머리 − 여유 ~ 다음 머리 − 여유)에서 행정동·건물명·시각을 뽑는다 */
    private fun readStop(sorted: List<OcrLine>, head: Head, nextHeadY: Int): PickerStopFromImage? {
        val upper = if (nextHeadY == Int.MAX_VALUE) Int.MAX_VALUE else nextHeadY - SLACK
        val block = sorted.filter { it.y >= head.y - SLACK && it.y < upper }

        val adminLine = block.firstOrNull { isAdminLine(it.text) }?.text ?: return null
        // 머리가 행정동 줄에 붙어 오면(«…상대원1동 찍업 12.7km») 주소는 머리 앞까지
        val admin = HEAD_RE.find(adminLine)?.let { adminLine.substring(0, it.range.first).trim() } ?: adminLine
        val at = block.firstNotNullOfOrNull { timeOf(it.text) }

        // 건물명 — 머리·행정동·시각을 뺀 나머지 첫 줄
        val place = block.firstOrNull {
            it.text != adminLine && !HEAD_RE.containsMatchIn(it.text) && timeOf(it.text) == null && !CLOCK_START.containsMatchIn(it.text) &&
                !isSectionTitle(it.text) && !SIZE_RE.containsMatchIn(it.text)
        }?.text

        return PickerStopFromImage(admin = admin, place = place, straightKm = head.km, at = at)
    }
}
