package com.onedal.app.plugins.kakaopicker

import android.content.Context
import org.json.JSONObject
import com.onedal.app.core.IScrapParser
import com.onedal.app.core.ScreenTextNode
import com.onedal.app.models.FilterTally
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 🌐 카카오T픽커 리스트 파서 — **수집 전용** (기사님 확정 2026-08-30 · 픽커_수집.md).
 *
 * 목적은 하나다: 리스트에 뜬 모든 콜을 읽어 서버(intel)에 표본으로 쌓는다.
 * 잡지 않는다 · 알람도 아직 없다 · 판정하지 않는다 — 그래서 `shouldClick` 은 늘 false 다.
 *
 * ── 카드의 실물 구조 (덤프 08-28 · 08-30 실측) ──
 *
 *   태그줄   퀵 · 단거리 · 준비 29분 · 소형 · [도착 시]     ← y 가 같은 한 줄
 *   요금     6,400                                          ← 오른쪽 정렬, 줄 사이에 낌
 *   지역줄   14.9km · 분당 · 야탑1 · [도착 동]              ← 픽업거리 + 출발 시·동
 *
 * 🔴 요금 노드가 태그줄과 지역줄 **사이 높이**에 있어서, 인성·24시처럼 «요금 나오면
 *    직전까지를 카드로 자르는» 순차 분할을 쓰면 카드가 반 토막 난다.
 *    → 요금 노드를 닻으로 **위아래 ±60픽셀 띠**를 한 카드로 묶는다 (실측 줄 간격 ±35).
 */
// Context 는 알람 조건(프리퍼런스의 피기백 필터)을 읽을 때만 쓴다 — 유닛 테스트는 null (그때 decide 를 직접 부른다)
class KakaoPickerParser(private val context: Context?) : IScrapParser {

    companion object {
        /** 픽커 요금은 «2,529» 꼴 (원 표기 없음 · 쉼표 필수 — 실측 전 카드 일치) */
        private val FARE_REGEX = Regex("""^\d{1,3}(,\d{3})+$""")
        private val KM_REGEX = Regex("""^(\d+(?:\.\d+)?)km$""")
        /** 1km 미만 픽업거리는 «581m» 로 온다 (0831 실측) — km 만 알면 거리가 도착지로 샌다 */
        private val M_REGEX = Regex("""^(\d+)m$""")
        private val TIME_REGEX = Regex("""^\d{1,2}:\d{2}$""")

        /**
         * 📅 **예약 날짜 배지 — «9/23(수)»** (실물 카카오T픽커 · 09-16 라이브).
         *
         * 시각(«17:30»)은 알아보면서 날짜는 못 알아봐, 날짜가 **지역 이름 자리로 들어갔다.**
         * 그러면 지역 칸이 한 칸씩 밀려 출발·도착이 통째로 틀어진다
         * (서버 장부 537건 중 24건이 «9/23(수) 광주 → 수정 수진2» 꼴로 저장됐다).
         * 🔴 **버리지 않고 꼬리표로 챙긴다** — 예약이 언제인지는 콜을 고르는 정보다.
         */
        private val DATE_REGEX = Regex("""^\d{1,2}/\d{1,2}\([월화수목금토일]\)$""")

        /**
         * ⏳ **도보 콜의 남은 시간 — «31분» «내»** (실물 카카오T픽커 · 09-16 라이브).
         *
         * 도보 카드는 «31분 내 … 가게 이름 … 건물 이름 …» 꼴이다. «준비 29분» 은 한 덩어리로 와서
         * 챙기는데, 앞에 **따로 떨어져 오는 «31분» 과 «내» 는 어디에도 안 걸려 지역 이름으로 샜다** —
         * 서버 장부 537건 중 **144건**이 주소 칸에 «N분 내» 를 달고 저장됐다 (`pnpm db parse` 가 찾았다).
         * 🔴 **버리지 않고 꼬리표로 챙긴다** — 언제까지 가야 하는지가 콜을 고르는 정보다.
         */
        private val MINUTES_REGEX = Regex("""^\d{1,3}분( 내)?$""")

        /**
         * ⏳ «31분» 뒤에 **따로** 오는 «내» — 남은 시간 표시의 꼬리다 (지역 이름이 아니다).
         * 🔴 실물은 «31분 내» 가 **한 덩어리**로 온다 (`MINUTES_REGEX` 가 그쪽을 잡는다).
         *    쪼개져 오는 판도 있을 수 있어 둘 다 막는다 — 「준비 완료」와 같은 계열이다.
         */
        private const val WITHIN_WORD = "내"
        /** 태그줄에 오는 낱말들 — 지역 이름과 구분하는 근거 (덤프 전수에서 수집) */
        private val TAG_WORDS = setOf(
            "퀵", "도보", "한차", "급송", "단거리", "예약", "준비 완료",
            // 0830 실계정 첫 수집에서 발견 — 지역으로 오인됐던 태그들 (덤프 04_리스트_예약카드)
            "반나절",        // 반나절 배송 상품
            "승",            // 배송수단 표시 (승용차)
            "내일", "오늘",  // 예약 콜의 날짜 표식 (시각 노드와 별개)
            "서포트모드",    // 서포트 모드 관련 배지
            "착불",          // 결제 배지 — 실수집에서 도착동으로 오인됐다 («착불 분당»)
            // 09-16 라이브에서 더 찾은 것 — 🔴 서버 사전(`tagWords`)과 **짝**이다. 한쪽만 넣으면
            //    서버가 죽었을 때(또는 검사에서) 그 낱말이 통째로 지역 이름으로 샌다.
            "경유",          // 들를 곳이 여럿인 콜 (6만 원짜리도 있었다)
            "비즈",          // 상세 머리의 상품 표시
        )
        private val ITEM_SIZES = setOf("초소형", "소형", "중형", "대형", "특대형")
        /** 화면 붙박이 UI 낱말 — 카드 띠에 섞여 들어와 지역으로 오인되던 것들 (0830 실수집에서 발견) */
        private val NOISE_WORDS = setOf(
            "카드설정", "수요지도",                       // 하단 메뉴 (맨 아래 카드 띠에 걸침)
            "리스트 설정", "추천순", "높은 가격순", "낮은 가격순", "가까운순",  // 상단 헤더
            "수락",                                       // 오더카드(화면 위 제안 카드)의 초록 버튼 (0830 실물)
            // 🔴 서버 사전(`uiNoiseWords`)과 **짝** — 픽커 앱이 뱉는 잡음 글자다 (그쪽 버그)
            "kotlin.Unit", "DerivedState",
            // 🎈 화면 위에 겹쳐 뜨는 메뉴 — 카드 글자 사이에 섞여 지역 자리를 차지했다 (09-16 라이브 3건)
            "서포트 모드", "1장 받기", "0/1건",
        )

        /**
         * 🧹 **건물 이름에 달라붙는 잡음 글자** — 떼어내되 **이름은 살린다**.
         * «동물의료센터kotlin.Unit» · «멜로즈핑크kotlin.Unit» 처럼 픽커 앱이 뒤에 붙여 보낸다 (그쪽 버그).
         * 🔴 통째로 버리면 건물 이름을 잃는다 — 버릴 것(떠 있는 메뉴)과 뗄 것(잡음)은 다루는 법이 다르다.
         */
        private val STICKY_NOISE = listOf("kotlin.Unit", "DerivedState")

        /** 🧹 달라붙은 잡음을 뗀 글자 — 뗄 것이 없으면 그대로 */
        fun stripSticky(text: String): String =
            STICKY_NOISE.fold(text) { acc, n -> acc.replace(n, "") }.trim()
        /** 카드 띠의 반높이 — 요금 중심에서 태그줄·지역줄까지 실측 ±35, 여유 포함 (알람 테두리도 같은 값 · #83) */
        const val CARD_BAND_PX = 60
        /** 요금은 화면 오른쪽에 정렬된다 — 왼쪽의 km·거리 숫자와 구분 */
        private const val FARE_MIN_CENTER_X = 600

        /** 카드를 가르는 기준점(요금 글자)인가 — 글자꼴과 위치(오른쪽 정렬)를 함께 본다. 순수 함수(검사용 공개) */
        fun isFareAnchor(text: String, centerX: Int): Boolean =
            text.matches(FARE_REGEX) && centerX >= FARE_MIN_CENTER_X

        /** 같은 카드 띠인가 — 요금 중심에서 ±60픽셀 (실측 줄 간격 ±35 · 다음 카드 ±163) */
        fun inCardBand(fareCenterY: Int, nodeCenterY: Int): Boolean =
            kotlin.math.abs(fareCenterY - nodeCenterY) <= CARD_BAND_PX

        /**
         * 🧲 노드가 붙을 닻 인덱스 — **가장 가까운 닻 하나에만** 붙는다 (0830 실사고 · #86).
         * «±60 안이면 전부» 방식은 리스트 갱신 애니메이션으로 닻들이 눌리는 순간 한 노드를
         * **두 카드에 모두** 넣었다 — 위 카드 시 + 아래 카드 동이 합쳐진 «처인 대치2»가
         * 그렇게 태어나 지문·테두리까지 흔들었다. ±60 밖이면 -1 (어디에도 안 붙는다).
         */
        /**
         * 🔴 **알람 상태에서** 이 카드를 자동 클릭해도 되는가 — 오더카드와 상세 잔상은 금지 (0830 실물).
         * 오더카드(제안 카드)는 요금 숫자가 **수락 버튼 안에** 있어서, 요금 닻을 탭하는
         * 자동 진입이 그대로 **계약 클릭**이 된다. 상세 화면 잔상을 리스트로 오인한 유령
         * 카드(«수락하기» 포함)도 같다. «수락»이 띠 안에 보이면 알람은 울리되 **손은 대지 않는다**.
         * ⚠️ 범위는 알람 경로다 (기사님 교정 0830) — 훗날 픽커 잡기 판(자동 선점)에서는
         *    수락 클릭이 곧 목적이므로, 이 검사를 그 경로에 끌어다 쓰지 말 것.
         */
        fun clickSafe(rawText: String?): Boolean = rawText?.contains("수락") != true

        /** 리스트 머리줄의 낱말 — 오더카드(위)와 리스트 카드(아래)를 가르는 경계 (NOISE_WORDS 에도 있다) */
        private const val LIST_HEADER_WORD = "리스트 설정"

        /**
         * 🚧 **화면 맨 아래 탭 막대의 글자** — 이 낱말들만 버린다.
         *
         * 🔴 **자리로 자르지 않는다.** 탭 막대는 경계가 아니라 **목록 위에 겹쳐 떠 있는 막대**이고,
         *    목록은 그 뒤로 이어진다. 아래를 통째로 버렸더니 마지막 카드의 아랫줄(출발동·도착동·거리)이
         *    늘 잘렸고, 카드 키가 큰 도보 콜은 **요금까지 막대 아래로 내려가 콜 한 건이 통째로** 사라졌다.
         * 🔴 이름으로 버리므로 픽커가 탭을 바꾸면 **서버 사전 `bottomTabWords` 한 줄**로 따라간다
         *    (앱 재설치 없음). 잠그는 검사는 `PickerBottomTabTest`(퀵)·`PickerListWholeScreenTest`(도보).
         */
        private val BOTTOM_TAB_WORDS = setOf("서포트모드", "카드설정", "수요지도", "신규", "내 오더")

        /**
         * 📢 **광고 구간의 표시** — 목록 맨 아래, 마지막 카드와 탭 줄 사이에 구인 광고가 붙는다.
         * 그 안에 «정기배송·운전» · «경기 포천시» · «모집 중» 처럼 **콜처럼 생긴 글자**가 섞여 있어
         * 그냥 두면 지역·배지로 샌다.
         *
         * 🔴 **제목 문구로 막지 않는다** (기사님 지시 — 문구는 바뀐다). «이런 일거리 어떤가요?» 는
         *    오늘 본 제목일 뿐이고, 늘 붙는 것은 **광고 표시 «Ad»** 다.
         *    실측: 목록 269줄 중 «Ad» 가 든 줄 3개 · 그 뒤에 요금이 또 나온 줄 **0개**.
         * 🔴 낱말 하나라 **정확히 같을 때만** 본다 — 주소·상호에 든 «Ad» 를 광고로 삼지 않으려고.
         *    제목 문구는 서버 사전 `adStartWords` 로 **덧붙일 수** 있다 (모양이 또 바뀌면 그쪽에 더한다).
         */
        private val AD_START_WORDS = setOf("Ad")

        /**
         * 🗺️ 주요 자치구 및 시 약칭 (카카오픽커 리스트 카드에서 '구'/'시' 접미사가 생략되어 나타나는 토큰)
         */
        val KNOWN_GU_OR_CITY_SET = setOf(
            // 서울 25개 자치구
            "강남", "강동", "강북", "강서", "관악", "광진", "구로", "금천", "노원", "도봉",
            "동대문", "동작", "마포", "서대문", "서초", "성동", "성북", "송파", "양천", "영등포",
            "용산", "은평", "종로", "중구", "중랑",
            // 경기/인천 주요 구 및 시 약칭
            "분당", "수지", "기흥", "처인", "일산동", "일산서", "덕양", "단원", "상록",
            "권선", "팔달", "영통", "장안", "만안", "동안", "원미", "소사", "오정", "중원", "수정",
            "수원", "성남", "안양", "부천", "광명", "평택", "안산", "고양", "과천", "구리",
            "남양주", "오산", "시흥", "군포", "의왕", "하남", "용인", "파주", "이천", "안성",
            "김포", "화성", "광주", "양주", "포천", "여주", "연천", "가평", "양평", "인천"
        )

        fun isGuOrCity(token: String): Boolean {
            val t = token.trim()
            if (t.isEmpty()) return false
            return t.endsWith("구") || t.endsWith("시") || t.endsWith("군") || t in KNOWN_GU_OR_CITY_SET
        }

        fun isDongLike(token: String): Boolean {
            val t = token.trim()
            if (t.isEmpty()) return false
            return t.endsWith("동") || t.endsWith("읍") || t.endsWith("면") || t.endsWith("리") ||
                   (t.length >= 2 && t.last().isDigit())
        }

        /**
         * 📢 광고가 시작하는 **맨 위** 중심 Y — 광고가 없으면 **null** (0 이 아니다 · 규칙 ④).
         * 위쪽 경계(`listHeaderCenterY`) · 아래쪽 경계(`bottomTabTopY`)와 같은 꼴이다.
         */
        fun adTopY(nodes: List<Pair<String, Int>>, words: Set<String> = AD_START_WORDS): Int? =
            nodes.filter { n -> n.first.trim().let { t -> words.any { w -> t == w || t.startsWith(w) } } }
                .minOfOrNull { it.second }

        /** 📢 그 글자가 광고 자리이거나 그 아래인가 — **광고를 못 찾았으면 아무것도 안 버린다** */
        fun isBelowAd(nodeCenterY: Int, adTopY: Int?): Boolean =
            adTopY != null && nodeCenterY >= adTopY

        /**
         * 🔀 **경유 콜 — 들를 곳이 쉼표로 이어진 한 덩어리로 온다** (실물: «수지, 영통, 상록, …»).
         * 첫 곳만 주소로 쓰고 나머지는 잃지 않게 개수를 꼬리표에 남긴다 (기사님: 버리지 말 것).
         * 서버 경로는 상차 한 곳 · 하차 한 곳으로 세므로 주소 칸에는 첫 곳이 들어간다.
         */
        fun viaFirst(text: String): String = text.substringBefore(',').trim()

        /** 🔀 들를 곳이 몇 곳인가 — 쉼표로 센다 (한 곳이면 1) */
        fun viaCount(text: String): Int = text.split(',').count { it.isNotBlank() }

        /**
         * 🩹 **상세 화면에만 있는 낱말** — 목록 글자에 이것이 섞였으면 두 화면이 겹쳐 읽힌 것이다.
         * 🔴 «배송»은 쓰지 않는다 — 아래 탭에 «도보배송»·«한차배송»이 늘 있어서 목록에도 나온다.
         */
        // 🔴 서버 사전(`detailOnlyWords`)과 **짝** — 한쪽만 넣으면 서버가 죽었을 때 겹친 화면을 못 가른다
        private val DETAIL_ONLY_WORDS = setOf("픽업지", "물품 정보", "최종 수익", "배송비", "수락하기", "넘기기", "유의사항")

        /**
         * 🩹 **상세에서 목록으로 넘어오는 찰나, 두 화면 글자가 섞여 들어온다** (09-16 실측: 목록 208번 중 23번).
         *
         * 그 판으로 만든 카드는 출발·도착이 뒤섞이고(«만안 분당 → 픽업지 서울 송파구…»), 그 이름으로
         * 기억되므로 **같은 콜이 다른 콜로 보인다** — 그래서 이미 누른 콜을 또 누른다.
         * 🔴 그런 판은 통째로 건너뛴다. 다음 읽기(1초 뒤)에는 깨끗하게 들어온다 (규칙 ④ — 모르면 손대지 않는다).
         */
        fun detailLeaked(texts: List<String>, words: Set<String> = DETAIL_ONLY_WORDS): Boolean =
            texts.any { t -> words.any { t.contains(it) } }

        /**
         * 📏 「리스트 설정」 머리줄의 중심 Y — 없으면 **null** (0 이 아니다 · 규칙 ④).
         * 입력은 `(글자, 중심Y)` 짝이다 — 순수 함수라 JVM 검사에서 그대로 돈다.
         */
        fun listHeaderCenterY(nodes: List<Pair<String, Int>>): Int? =
            nodes.firstOrNull { it.first.contains(LIST_HEADER_WORD) }?.second

        /**
         * 🔴 **이 요금 닻을 눌러도 되는가** (2026-09-13 · 라이브 오배차 조사에서 신설).
         *
         * 09-13 새벽, 기사님이 주무시는 사이 앱이 픽커 카드를 눌러 두 건이 배차됐다.
         * 앱은 낱말을 안 보고 **«쉼표 든 숫자 + 화면 오른쪽»** 만 보고 그 **정중앙**을 찍는다
         * (`isFareAnchor` → `performSimulatedTouch`). 그런데 **오더카드**(리스트 맨 위
         * 제안 띠)는 **요금 숫자가 「수락」 버튼 안에 있어서**, 그 요금을 찍으면 상세로
         * 가는 게 아니라 **그 자리에서 계약이 성립한다.**
         *
         * 종전 방어는 `clickSafe` 하나였고 그것은 요금 중심 **±60픽셀**(`CARD_BAND_PX`)
         * 안의 글자만 본다. 실물에서 「수락」은 요금 **약 70픽셀 아래**라 **띠 밖이고
         * 그대로 통과한다** — 계약이 문자열 한 개에 걸려 있었다.
         *
         * 🟢 그래서 **구조로 가른다.** 「리스트 설정」 머리줄 **위면 오더카드, 아래면 리스트
         *    카드**다. 실물 덤프 8장에서 요금 닻은 전부 머리줄보다 **166픽셀 아래**였고
         *    (`log/카카오픽커/화면덤프` 8장), 오더카드 요금은 머리줄 **위**였다
         *    (`ex_images/카카오픽커/실물_2026/04_오더카드_리스트상단띠_픽업배송km.jpeg`).
         *
         * ⚠️ **머리줄을 못 찾으면 false** — 리스트인지 아닌지 모르는 판이다. 규칙 ④
         *    (*"빈 필터는 «제한 없음»이 아니라 «고장»이다"*)를 그대로 따른다.
         * ⚠️ 같은 높이도 false — 경계는 닫아 둔다. 계약 쪽으로 기울지 않는다.
         */
        fun isListCardAnchor(fareCenterY: Int, listHeaderCenterY: Int?): Boolean =
            listHeaderCenterY != null && fareCenterY > listHeaderCenterY

        /** «리스트 설정» 머리줄 칸인가 — 찍기 직전 그 칸을 다시 읽을 때 쓴다 */
        fun isListHeaderText(text: String): Boolean = text.contains(LIST_HEADER_WORD)

        /**
         * 🔴 **찍기 직전에 한 번 더** (#111 틈 ①) — 스캔 때 잰 좌표로 «리스트 카드»라 판단한 뒤, 누르기 바로 전에
         * 요금 칸 · 머리줄을 **둘 다 다시 읽어** 요금이 여전히 머리줄 아래일 때만 누른다.
         * 09-13 11:46 은 새 카드가 뜬 1초 뒤에 눌렀다 — 스캔과 누름 사이에 구조가 바뀌면 그 자리는 오더카드(곧 계약)일 수 있다.
         * 다시 못 읽으면(`null`) 누르지 않는다 (규칙 ④). ⚠️ 이 확인과 실제 주입 사이 수십 ms 는 원리상 못 막는다.
         */
        fun stillListCardAtTap(fareRefreshedY: Int?, headerRefreshedY: Int?): Boolean =
            fareRefreshedY != null && isListCardAnchor(fareRefreshedY, headerRefreshedY)

        /**
         * 👻 이 리스트 스캔이 **상세 화면 잔상**인가 (0830 23:04 실측 — 복귀 직후 첫 스캔에
         * 상세 글자가 남아 카드 도착지에 «픽업지 경기 성남시…»가 섞였다).
         * 판별자는 «수락하기» — 상세에만 있는 버튼이다 (리스트·오더카드의 버튼은 «수락»,
         * 노드 단위 completeness 로 구분). 잔상이면 그 판은 통째로 버린다 — 인성 팝업
         * 잔상 방어(isPopupResidue)와 같은 계열이다.
         */
        fun isDetailResidue(texts: List<String>): Boolean = texts.any { it.contains("수락하기") }

        /** 📏 요금이 하나뿐이라 이웃이 없을 때 쓰는 카드 한 장 높이 (실측 카드 간격 163~185의 절반보다 넉넉히) */
        private const val LONE_CARD_PX = 100

        /**
         * 📏 **묶는 칸은 «이웃 요금까지 간격의 절반» 이다 — 고정 픽셀이 아니다** (기사님 지시).
         *
         * 카드 높이는 **배지 줄 수에 따라 다르다** — 예약 카드는 줄이 하나 더 있어 맨 윗줄이
         * 요금에서 80픽셀 떨어진다. 실물 덤프에서 재면 제 카드 글자는 최대 80px, 남의 카드는
         * 최소 83px 이라 **간격의 절반이면 둘을 정확히 가른다**.
         *
         * 🔴 **고정값을 쓰지 않는 까닭**: 카드 높이는 배지 줄 수에 따라 달라진다. 실측값 하나를 박아 두면
         *    줄이 하나 더 붙는 날 또 잘린다. 간격의 절반은 화면이 바뀌어도 스스로 맞는다
         *    (덤프 전체 570글자로 재니 잘리는 글자 60px 규칙 1개 → 새 규칙 0개).
         * 🔴 **한 글자는 한 카드에만 붙는다** — 두 카드에 겹쳐 들어가던 사고(0830 «처인 대치2»)는 그대로 막는다.
         */
        fun nearestAnchorIndex(anchorCentersY: List<Int>, nodeCenterY: Int): Int {
            var best = -1
            var bestDist = Int.MAX_VALUE
            anchorCentersY.forEachIndexed { i, c ->
                val d = kotlin.math.abs(c - nodeCenterY)
                if (d < bestDist) { bestDist = d; best = i }
            }
            if (best < 0) return -1
            val limit = anchorCentersY.indices
                .filter { it != best }
                .minOfOrNull { kotlin.math.abs(anchorCentersY[it] - anchorCentersY[best]) / 2 }
                ?: LONE_CARD_PX
            return if (bestDist <= limit) best else -1
        }

        /**
         * 🖼️ **화면 글자를 요금 기준으로 카드에 나눠 담는다 — 순수 함수라 폰 없이 실물 좌표로 검사된다.**
         *
         * 🔴 **조각만 검사하면 합쳐진 결과가 틀린 것을 못 본다.** 묶는 칸 · 위 경계 · 아래 탭 · 광고가
         *    저마다 초록인데 화면 맨 아래 카드가 통째로 빠지고 있었다 (`PickerListWholeScreenTest`).
         *
         * @param nodes (글자, 중심Y, 중심X) — 화면에 보이는 차례(위→아래, 왼→오른쪽)로 들어온다
         * @return (기준점이 된 요금 글자의 자리번호, 그 카드에 담긴 글자들)
         */
        fun groupByFare(
            nodes: List<Triple<String, Int, Int>>,
            tabWords: Set<String> = BOTTOM_TAB_WORDS,
            adWords: Set<String> = AD_START_WORDS,
        ): List<Pair<Int, List<String>>> {
            /**
             * 📢 **광고 줄부터 아래는 뺀다** (기사님 지시 — «이 일거리 어떤가요부터는 광고, 거기는 볼 거 없어»).
             * 실측: 광고는 홈 화면에만 붙고, 광고 아래에 요금이 또 나온 판은 0개다.
             */
            val adY = adTopY(nodes.map { it.first to it.second }, adWords)
            /**
             * 🚧 **아래 탭 막대는 «이름»으로만 버린다 — 자리로 자르지 않는다** (`BOTTOM_TAB_WORDS` 주석).
             * 막대는 목록 위에 겹쳐 떠 있을 뿐이라, 그 아래에도 멀쩡한 카드가 이어진다.
             */
            val body = nodes.withIndex().filterNot { (_, n) ->
                n.first.trim() in tabWords || isBelowAd(n.second, adY)
            }
            val anchors = body.filter { isFareAnchor(it.value.first, it.value.third) }
            if (anchors.isEmpty()) return emptyList()
            val anchorCenters = anchors.map { it.value.second }
            // 🧲 각 글자를 가장 가까운 요금 하나에만 배정 — 두 카드에 겹쳐 들어가는 것을 막는다 (#86)
            val cardTexts = List(anchors.size) { mutableListOf<String>() }
            for ((_, n) in body) {
                val i = nearestAnchorIndex(anchorCenters, n.second)
                if (i >= 0) cardTexts[i].add(n.first)
            }
            return anchors.mapIndexed { i, a -> Pair(a.index, cardTexts[i] as List<String>) }
        }

        /**
         * 🔔 **픽커 알람 판정 — 축은 셋이다** (기사님 확정 2026-08-30 · 픽커_수집.md 3단계).
         *
         *   ① 요금 ≥ 픽커 알람 하한 (원천 DB user_settings.picker_alarm_min_fare · 기본 1만)
         *   ② 픽업거리 ≤ 상차 반경 (기존 국면 값 재사용 — 뜻이 같다)
         *   ③ 도착 구·동 ↔ 국면의 도착목표 (destinationKeywords·keywordTraps 재사용 —
         *      노선 국면이면 그 방향만, 도착목표가 비면 제한 없음. RegionMatch 는 인성과 같은 규약)
         *
         * 픽커엔 배송거리가 없어 단가식이 불가능하고(§2), 차종·경로 순서 축도 없다.
         * 픽업거리·도착지를 **모르면 막지 않는다** (규칙 ⑤ — 모르는 값으로 거르지 않는다).
         * 예약·내일 콜도 울린다 (기사님 확정 08-30 — 미리 확보할 가치가 있다).
         * 🔴 이 판정은 «알람을 울릴까»만 정한다 — 클릭은 supportsCatching 이 원천 차단한다.
         */
        /**
         * 🗺️ 픽커 줄임 표기 ↔ 도착목표 정규화 대조 (0830 실사고 — 성남행 전부 탈락).
         * 서버 키워드는 «정자동»·«수정구» 같은 전체 이름인데 픽커 화면은 «정자3»·«수정»으로
         * 줄인다 — 부분 문자열(RegionMatch)로는 영영 안 만난다. 양쪽에서 행정 접미(동·구)와
         * 꼬리 숫자를 벗겨 **토큰 단위로 똑같은지** 본다. 토큰 단위라 «남동구» 류의
         * 부분 문자열 오탐은 없고, 남는 오탐은 동명이동뿐 — 알람은 느슨한 쪽이 맞다 (규칙 ⑤).
         */
        fun normalizeRegion(s: String): String =
            s.removeSuffix("동").removeSuffix("구").trimEnd { it.isDigit() }

        private fun dongTokenMatch(dropoff: String, keys: List<String>): Boolean {
            val normKeys = keys.map(::normalizeRegion).filter { it.length >= 2 }.toSet()
            return dropoff.split(' ').map { normalizeRegion(it.trim()) }
                .any { it.length >= 2 && it in normKeys }
        }

        /** 👀 상세 화면 ↔ 리스트 카드 대조 결과 — 못 고르면 `card = null` 과 그 까닭 (#119) */
        data class ListCardMatch(val card: SimplifiedOfficeOrder?, val why: String)

        private val DETAIL_FARE_REGEX = Regex("""최종 수익\s*([\d,]+)""")
        /** 상세의 «픽업 7.2km» — 이 앞은 픽업지 칸, 뒤는 배송지 칸이다 */
        private val DETAIL_PICKUP_KM_REGEX = Regex("""픽업\s*[\d.]+\s*k?m""")

        /** 지역 한 토막의 대조 열쇠 — «광주시»→«광주» · «중원구»→«중원» · «금광2동»→«금광» (리스트 줄임 표기와 만나게) */
        private fun regionKey(s: String): String = normalizeRegion(s.trim().removeSuffix("시").removeSuffix("군"))

        private fun regionKeys(text: String): Set<String> =
            text.split(Regex("""\s+""")).map(::regionKey).filter { it.isNotEmpty() }.toSet()

        private fun cardKeys(region: String): List<String> =
            region.split(' ').map(::regionKey).filter { it.isNotEmpty() }

        /**
         * 👀 **이 상세가 리스트의 어느 카드인가 — 누가 열었든 여기 한 곳** (2026-09-14 폰 시험 · 버그 대장 #119).
         *
         * 예전엔 알람이 누를 때만 카드를 쥐여 줘서, 기사님이 **손으로 연 상세**는 «리스트 원본이 없다»로
         * 서버에 아무것도 안 갔다 (클래스 «판단이 한쪽 경로에만 있다» — #75 · #77 과 같은 뿌리).
         *
         * 고르는 법 — **최종 수익이 같고, 카드의 픽업 구·동이 상세 픽업지 칸에 다 있는** 카드.
         *   · 🔴 요금만으로는 안 된다 — 7지점 문제지에 1만 원 카드가 넷이다
         *   · 🔴 실물 픽커는 배송지를 원달앱이 읽는 글자에 안 올린다 (09-13 `83af36b`) — 그래서 픽업지가 먼저다
         *   · 여럿이면 배송지로 한 번 더 가르고(시뮬레이터 상세에는 있다), 그래도 못 가르면 **고르지 않는다** (규칙 ④)
         */
        fun matchListCard(detailTexts: List<String>, recent: List<SimplifiedOfficeOrder>): ListCardMatch {
            val joined = detailTexts.joinToString(" ")
            /**
             * 🔴 **실물 픽커 상세는 «최종 수익»을 읽는 글자에 안 올린다** (09-16 04:49 라이브) — 요금은 리스트 카드에 있다.
             *    요금이 없으면 픽업지(+물품 크기)로 찾고 요금은 카드 것을 쓴다. 못 찾은 콜은 보내지 않는다 (기사님: «못 찾은 콜은 내 콜이 아닌 거지»).
             */
            val fare = DETAIL_FARE_REGEX.find(joined)?.groupValues?.get(1)?.replace(",", "")?.toIntOrNull()
            val size = DETAIL_SIZE_REGEX.find(joined)?.groupValues?.get(1)
            val how = if (fare != null) "요금 ${fare}원 · 픽업지" else "요금 없이 픽업지${if (size != null) " · 크기 $size" else ""}"
            val marker = DETAIL_PICKUP_KM_REGEX.find(joined)
            val pickupPart = regionKeys(if (marker != null) joined.substring(0, marker.range.first) else joined)
            val dropoffPart = regionKeys(if (marker != null) joined.substring(marker.range.last + 1) else "")
            val byPickup = recent
                .filter { fare == null || it.fare == fare }
                .filter { c -> cardKeys(c.pickup).let { k -> k.isNotEmpty() && k.all { it in pickupPart } } }
                // 요금이 없을 때만 크기로 거른다 — 크기를 모르는 카드는 빼지 않는다 (규칙 ⑤-2 · 모르는 값으로 거르지 않는다)
                .filter { c -> fare != null || size == null || c.itemSize == null || c.itemSize == size }
                .distinctBy { Triple(it.pickup, it.dropoff, it.fare) }
            val picked = if (byPickup.size <= 1) byPickup
                else byPickup.filter { c -> cardKeys(c.dropoff).let { k -> k.isNotEmpty() && k.all { it in dropoffPart } } }
            return when {
                picked.size == 1 -> ListCardMatch(picked[0], "$how 이 맞는 카드 하나")
                byPickup.isEmpty() -> ListCardMatch(null, "리스트 카드 중 $how 이 맞는 것이 없다")
                picked.isEmpty() -> ListCardMatch(null, "$how 이 맞는 카드 ${byPickup.size}장 — 배송지로도 못 가른다")
                else -> ListCardMatch(null, "$how · 배송지가 맞는 카드 ${picked.size}장 — 어느 것인지 모른다")
            }
        }

        /** 상세의 «물품 정보 소형 …» — 🔴 «초소형»을 «소형»보다 먼저 본다 */
        private val DETAIL_SIZE_REGEX = Regex("""물품\s*정보\s*(초소형|소형|중형|대형|특대형)""")

        /**
         * 🔔 **축별 판정 결과** (2026-09-14 · 카카오픽커_시뮬레이터.md 3단계 3-2).
         * 시뮬레이터 채점기(`onedal-sim/scripts/pickerAlarmGrade.mjs`)가 판정 순간의 필터로 정답을 다시 계산해 맞춰 본다 —
         * 어긋나면 «요금·상차·도착 중 어디서» 갈렸는지가 고칠 곳(앱 판정 vs 서버 필터)을 가른다.
         */
        data class AlarmAxes(val fare: Boolean, val pickup: Boolean, val destination: Boolean) {
            val pass: Boolean get() = fare && pickup && destination
        }

        /** 배송 종류 태그 — 퀵은 지역이 넷(출발 시·동 · 도착 시·동), 도보는 가게 이름이라 넷이 안 된다 */
        private const val QUICK_TAG = "퀵"
        private const val WALK_TAG = "도보"

        /**
         * ⏸️ **퀵 콜인데 하차지를 못 읽었나** (기사님 지시).
         *
         * 목록을 넘기는 중에는 픽커가 글자를 **반만** 올린다 — 실측 원문
         * «퀵 승 예약 16:10 14.4km 분당 서초 방배본 15,540» 처럼 지역 한 토막이 빠진다.
         * 그 상태로 울리면 하차지를 모른 채 상세로 들어가고, 30초 동안 목록을 못 본다.
         *
         * 🔴 **거르는 것이 아니라 미루는 것이다** — 다음 화면 읽기에서 읽히면 그때 운다.
         *    모르는 값을 불리하게 보지 않는다는 규칙(⑤-2)은 그대로다. 여기서 막는 것은
         *    «아직 덜 읽힌 화면»이지 «조건이 나쁜 콜»이 아니다.
         * 🔴 **도보는 원래 하차지가 빈다** — 함께 막으면 도보 알람이 통째로 죽는다.
         * 🔴 **무엇인지 모르면(태그가 없으면) 막지 않는다.**
         */
        fun quickDropoffUnread(tagsText: String?, dropoff: String): Boolean {
            val tags = tagsText.orEmpty()
            if (tags.isBlank() || tags.contains(WALK_TAG)) return false
            return tags.contains(QUICK_TAG) && dropoff.isBlank()
        }

        /** 🔴 계산은 여기 한 벌이다 — `decide` 는 이것의 `pass` 를 돌려준다 (채점기의 사본은 «일부러 두 벌» · 그 파일 머리 주석) */
        fun decideAxes(
            order: SimplifiedOfficeOrder,
            minFare: Int,
            pickupRadiusKm: Double,
            destKeywords: List<String> = emptyList(),
            keywordTraps: Map<String, List<String>> = emptyMap(),
            cityAliases: List<String> = emptyList(),
        ): AlarmAxes {
            val fareOk = order.fare >= minFare
            val pickupOk = order.pickupDistance == null || order.pickupDistance <= pickupRadiusKm
            val destOk = when {
                // ⏸️ 퀵인데 하차지가 안 읽혔다 — 화면이 덜 올라온 것이라 이번 판은 미룬다 (`quickDropoffUnread`)
                quickDropoffUnread(order.tagsText, order.dropoff) -> false
                destKeywords.isEmpty() || order.dropoff.isBlank() -> true
                else -> com.onedal.app.plugins.RegionMatch.anyHit(order.dropoff, destKeywords, keywordTraps) ||
                    dongTokenMatch(order.dropoff, destKeywords + cityAliases)
            }
            return AlarmAxes(fareOk, pickupOk, destOk)
        }

        /**
         * 🗳️ **떨어진 까닭을 한 낱말로 — 통과면 null** (기사님 지시 — 탈락 원본이 잘 들어가는지 보다 드러났다).
         *
         * 탈락한 콜은 원문과 함께 장부에 잘 들어가는데 **어느 축에서 떨어졌는지가 안 남아**,
         * «왜 이 콜이 안 울렸나» 를 폰 로그로만 되짚을 수 있었다. 폰 로그는 3일치뿐이다.
         *
         * 🔴 **성적표(`decide`)와 같은 분기다** — 따로 세면 «성적표는 요금, 장부는 지역» 으로 갈라진다.
         * 🔴 **축 낱말은 서버가 쓰는 말 그대로** — `fare` · `pickup` · `region` (`simScenario.ts` 의 `blockBy`).
         */
        fun verdictAxisOf(
            order: SimplifiedOfficeOrder,
            minFare: Int,
            pickupRadiusKm: Double,
            destKeywords: List<String> = emptyList(),
            keywordTraps: Map<String, List<String>> = emptyMap(),
            cityAliases: List<String> = emptyList(),
        ): String? {
            val a = decideAxes(order, minFare, pickupRadiusKm, destKeywords, keywordTraps, cityAliases)
            return when {
                a.pass -> null          // 통과 — 빈 칸이 «통과» 라는 뜻이다
                !a.fare -> "fare"
                !a.pickup -> "pickup"
                else -> "region"
            }
        }

        fun decide(
            order: SimplifiedOfficeOrder,
            minFare: Int,
            pickupRadiusKm: Double,
            destKeywords: List<String> = emptyList(),
            keywordTraps: Map<String, List<String>> = emptyMap(),
            cityAliases: List<String> = emptyList(),
            tally: FilterTally? = null,
        ): Boolean {
            val a = decideAxes(order, minFare, pickupRadiusKm, destKeywords, keywordTraps, cityAliases)
            tally?.let { t ->
                t.seen++
                when {
                    a.pass -> t.passed++
                    !a.fare -> t.fare++      // 첫 번째로 걸린 축에만 센다 (인성과 같은 규칙)
                    !a.pickup -> t.pickup++
                    else -> t.region++
                }
            }
            return a.pass
        }

        /**
         * 🧾 **알람 필터 한 줄** — 채점기가 «그 순간 폰이 가진 필터»로 읽는 JSON (2026-09-14 · 3단계 3-2).
         * 서버 필터는 콜을 잡고 위치가 움직일 때마다 바뀌므로, 판정 줄과 같은 로그 파일에 **바뀔 때마다** 남긴다.
         * ⚠️ `org.json` 은 JVM 검사에서 비어 있어 Gson 으로 만든다.
         */
        fun alarmFilterJson(
            minFare: Int,
            pickupRadiusKm: Double,
            destKeywords: List<String>,
            keywordTraps: Map<String, List<String>>,
            cityAliases: List<String>,
        ): String = com.google.gson.Gson().toJson(linkedMapOf(
            "minFare" to minFare,
            "pickupRadiusKm" to pickupRadiusKm,
            "destKeywords" to destKeywords,
            "keywordTraps" to keywordTraps,
            "cityAliases" to cityAliases,
        ))

        /** 마지막으로 남긴 알람 필터 — 같으면 다시 안 적는다 (판정은 스캔마다 돈다 · 로그가 그 줄로 덮이지 않게) */
        @Volatile private var lastAlarmFilterJson: String? = null
    }

    /** 알람 조건 묶음 — 피기백 필터에서 읽는다. 기본값은 서버 미응답 시 안전망 */
    private data class AlarmConfig(
        val minFare: Int = 10000,
        val pickupRadiusKm: Double = 10.0,   // 🔴 소수로 받는다 — 자동 반경이면 서버가 4.55 처럼 보낸다
        val destKeywords: List<String> = emptyList(),   // 비면 도착지 제한 없음 (관내·구서버)
        val keywordTraps: Map<String, List<String>> = emptyMap(),
        val cityAliases: List<String> = emptyList(),    // 시 별칭(customCityFilters) — «수정»처럼 구만 남는 카드용
    )

    /** 피기백 필터에서 알람 조건을 읽는다 — 못 읽으면 기본값 (서버 미응답 안전망) */
    private fun alarmConfig(): AlarmConfig {
        val prefs = context?.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
            ?: return AlarmConfig()
        return try {
            val json = JSONObject(prefs.getString("activeFilter", null) ?: return AlarmConfig())
            val keywords = json.optJSONArray("destinationKeywords")?.let { arr ->
                (0 until arr.length()).map { arr.getString(it) }.filter { it.isNotEmpty() }
            } ?: emptyList()
            val traps = json.optJSONObject("keywordTraps")?.let { obj ->
                obj.keys().asSequence().associateWith { k ->
                    val arr = obj.optJSONArray(k)
                    if (arr == null) emptyList()
                    else (0 until arr.length()).map { arr.getString(it) }
                }
            } ?: emptyMap()
            val aliases = json.optJSONArray("customCityFilters")?.let { arr ->
                (0 until arr.length()).map { arr.getString(it) }.filter { it.isNotEmpty() }
            } ?: emptyList()
            AlarmConfig(
                minFare = json.optInt("pickerAlarmMinFare", 10000),
                pickupRadiusKm = json.optDouble("pickupRadiusKm", 10.0),
                destKeywords = keywords,
                keywordTraps = traps,
                cityAliases = aliases,
            )
        } catch (e: Exception) {
            AlarmConfig()
        }
    }

    /**
     * 🧹 **버릴 화면 메뉴 글자 — 서버에서 받는다** (기사님 지시).
     *
     * 인성·화물24와 같은 길(`GET /api/config/keywords?app=픽커` → `targetAppKeywords`)을 픽커도 쓴다.
     * 화면 아래 탭 글자(«신규»·«내 오더» 등)가 마지막 카드에 섞이면 **픽업지가 그 글자가 된다** —
     * 낱말을 서버에서 받으면 그런 글자가 새로 생겨도 앱을 다시 깔지 않고 막을 수 있다.
     *
     * 🔴 **서버 목록과 앱 기본값을 합쳐서 쓴다** — 서버가 죽거나 목록이 비어도 최소한은 걸러야 한다
     *    (규칙 ④ — 비면 «전부 통과»가 아니다).
     */
    private fun wordsFrom(key: String, fallback: Set<String>): Set<String> {
        val prefs = context?.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE) ?: return fallback
        return try {
            val saved = prefs.getString("targetAppKeywords", null) ?: return fallback
            val arr = JSONObject(saved).optJSONArray(key) ?: return fallback
            val fromServer = (0 until arr.length()).map { arr.getString(it) }.filter { it.isNotEmpty() }.toSet()
            if (fromServer.isEmpty()) fallback else fromServer + fallback
        } catch (e: Exception) {
            fallback
        }
    }

    /** 🧹 버릴 화면 메뉴 글자 */
    private fun noiseWords(): Set<String> = wordsFrom("uiNoiseWords", NOISE_WORDS)

    /** 🏷️ 배송 종류·조건 표시 — 지역 이름이 아니다. 콜에 실어 서버로 보낸다 (`tagsText`) */
    private fun tagWords(): Set<String> = wordsFrom("tagWords", TAG_WORDS)

    /** 📦 물품 크기 — 픽커에는 차종 대신 이 축이 있다 */
    private fun itemSizeWords(): Set<String> = wordsFrom("itemSizes", ITEM_SIZES)

    /** 🚧 화면 맨 아래 탭 줄의 글자 — 이 줄부터 아래는 콜이 아니다 */
    private fun bottomTabWords(): Set<String> = wordsFrom("bottomTabWords", BOTTOM_TAB_WORDS)

    /** 🩹 상세 화면에만 있는 글자 — 목록에 섞였으면 두 화면이 겹쳐 읽힌 것이다 */
    private fun detailOnlyWords(): Set<String> = wordsFrom("detailOnlyWords", DETAIL_ONLY_WORDS)

    /** 📢 광고가 시작하는 글자 — 이 줄부터 아래는 콜이 아니다 */
    private fun adStartWords(): Set<String> = wordsFrom("adStartWords", AD_START_WORDS)

    override fun groupListNodes(allNodes: List<ScreenTextNode>): List<Pair<ScreenTextNode, List<String>>> {
        /**
         * 🩹 **두 화면이 겹쳐 읽힌 판은 통째로 건너뛴다** (`detailLeaked`).
         * 상세에서 목록으로 넘어오는 찰나에 상세 글자가 섞여 들어오면, 그 판으로 만든 카드는
         * 출발·도착이 뒤섞여 **같은 콜이 다른 콜로 보인다**. 다음 읽기에는 깨끗하게 들어온다.
         */
        if (detailLeaked(allNodes.map { it.text }, detailOnlyWords())) {
            com.onedal.app.core.AppLogger.d("1DAL_PICKER",
                "🩹 [겹친 화면] 목록에 상세 글자가 섞였다 — 이 판은 건너뛴다 (다음 읽기에 다시 본다)")
            return emptyList()
        }

        // 🖼️ 나누는 셈은 순수 함수 `groupByFare` 에 있다 — 실물 좌표로 통째로 검사하려고 떼어 놨다
        val sorted = allNodes.sortedWith(compareBy({ it.rect.top }, { it.rect.left }))
        return groupByFare(
            sorted.map { Triple(it.text, (it.rect.top + it.rect.bottom) / 2, (it.rect.left + it.rect.right) / 2) },
            bottomTabWords(),
            adStartWords(),
        ).map { (i, texts) -> Pair(sorted[i], texts) }
    }

    override fun parse(texts: List<String>): SimplifiedOfficeOrder {
        // 🗂️ 낱말은 배차망 사전에서 온다 — 서버가 내려준 것 + 앱 기본값 (못 받아도 최소한은 돈다)
        val noise = noiseWords()
        val tagSet = tagWords()
        val sizeSet = itemSizeWords()
        var fare = 0
        var pickupKm: Double? = null
        var itemSize: String? = null
        var scheduleTime: String? = null
        val tags = mutableListOf<String>()
        val locations = mutableListOf<String>()
        val tagLocations = mutableListOf<String>()
        val bodyLocations = mutableListOf<String>()
        var seenFareOrDistance = false

        for (raw in texts) {
            // 🧹 달라붙은 잡음(«…kotlin.Unit»)을 먼저 뗀다 — 건물 이름은 살린다
            val t = stripSticky(raw.trim())
            when {
                t.matches(FARE_REGEX) -> {
                    fare = t.replace(",", "").toIntOrNull() ?: 0
                    seenFareOrDistance = true
                }
                KM_REGEX.matches(t) -> {
                    pickupKm = KM_REGEX.find(t)?.groupValues?.get(1)?.toDoubleOrNull()
                    seenFareOrDistance = true
                }
                M_REGEX.matches(t) -> {
                    pickupKm = M_REGEX.find(t)?.groupValues?.get(1)?.toDoubleOrNull()?.div(1000)
                    seenFareOrDistance = true
                }
                t in sizeSet -> itemSize = t
                t in tagSet -> tags.add(t)
                t.startsWith("준비 ") -> tags.add(t)                 // «준비 29분»
                MINUTES_REGEX.matches(t) -> tags.add(t)             // 도보 «31분» — 남은 시간이지 지역이 아니다
                t == WITHIN_WORD -> tags.add(t)                     // 그 뒤의 «내» («31분 내»)
                TIME_REGEX.matches(t) -> { scheduleTime = t; tags.add(t) }   // «예약» 뒤의 «17:00»
                DATE_REGEX.matches(t) -> { scheduleTime = t; tags.add(t) }   // «예약» 뒤의 «9/23(수)» — 지역이 아니다
                t in noise -> { /* 화면 메뉴 글자 — 콜 정보가 아니다, 버린다 (서버 목록 + 앱 기본값) */ }
                // 🚫 배정 완료 토스트가 카드 띠에 섞였다 — 지역이 아니다 (09-02 실주행 가짜 콜 3건 · `AssignedToastTest`)
                t.contains(KakaoPickerKeywords.ASSIGNED_TOAST_WORD) -> { }
                // «내일 착불» 처럼 태그 여럿이 한 노드로 붙어 오는 판 — 낱낱이 전부 태그면 태그다
                t.contains(' ') && t.split(' ').all { it in tagSet } -> tags.addAll(t.split(' '))
                /**
                 * 🎈 **떠 있는 메뉴가 한 덩어리로 끼어든다** — «퀵 서포트 모드 1장 받기» (09-16 라이브 3건).
                 *
                 * 낱말 목록으로는 못 막는다 — 화면이 붙여서 주면 목록에 없는 새 글자가 된다.
                 * 낱낱으로 갈라 봐도 안 된다: 사전에는 «서포트 모드» · «1장 받기» 가 **두 낱말짜리**로
                 * 들어 있어 «서포트» 하나로는 안 걸린다.
                 * 🔴 그래서 **덩어리 안에 메뉴 낱말이 들어 있으면** 콜 정보가 아니다 —
                 *    지역 이름에는 메뉴 글자가 들어갈 일이 없다 (건물 이름의 잡음은 위에서 이미 뗐다).
                 */
                t.contains(' ') && noise.any { it.length >= 2 && t.contains(it) } -> { }
                t.endsWith("km") -> { /* «20km» 같은 헤더 반경 — 콜 정보가 아니다 */ }
                /**
                 * 🔀 **경유 콜의 들를 곳 목록** — «수지, 영통, 상록, …» 이 한 덩어리로 온다.
                 * 첫 곳만 지역으로 쓰고 **몇 곳인지는 꼬리표에 남긴다** (버리지 않는다).
                 */
                t.contains(',') -> {
                    val first = viaFirst(t)
                    locations.add(first)
                    if (!seenFareOrDistance) tagLocations.add(first) else bodyLocations.add(first)
                    val n = viaCount(t)
                    if (n > 1) tags.add("경유 ${n}곳")
                }
                // 🔀 경유 콜은 «기흥 신갈» 처럼 시·동이 한 덩어리로 온다 — 넷을 채우려면 쪼갠다
                tags.contains("경유") && t.contains(' ') -> {
                    val parts = t.split(' ')
                    locations.addAll(parts)
                    if (!seenFareOrDistance) tagLocations.addAll(parts) else bodyLocations.addAll(parts)
                }
                t.isNotEmpty() -> {
                    locations.add(t)
                    if (!seenFareOrDistance) tagLocations.add(t) else bodyLocations.add(t)
                }
            }
        }

        /**
         * 🗺️ 픽커 카드의 지역 토큰 분리 및 조립:
         * 1) 상단 태그줄(요금/거리 이전)에 위치한 토큰 = 도착 시/구 전담
         * 2) 본문(요금/거리 이후)에 위치한 토큰 = 출발지 및 도착 상세 동
         * 3) 태그줄에 지역이 없는 경우: 전체 locations를 순서 및 행정구역 패턴에 따라 조립
         */
        val pickup: String
        val dropoff: String

        if (tagLocations.isNotEmpty()) {
            val destTag = tagLocations[0]
            when {
                bodyLocations.isEmpty() -> {
                    pickup = ""
                    dropoff = destTag
                }
                bodyLocations.size == 1 -> {
                    // [도착구] + [출발구] (2토막 콜: 종로 + 하남 -> 하남 ➔ 종로)
                    pickup = bodyLocations[0]
                    dropoff = destTag
                }
                bodyLocations.size == 2 -> {
                    // [도착구] + [출발구, 출발동] (3토막 콜: 종로 + 하남, 감일 -> 하남 감일 ➔ 종로)
                    pickup = "${bodyLocations[0]} ${bodyLocations[1]}"
                    dropoff = destTag
                }
                else -> {
                    // 4개 이상 토막: [도착구] + [출발구, 출발동, 도착동...]
                    pickup = "${bodyLocations[0]} ${bodyLocations[1]}"
                    val dropDong = bodyLocations.drop(2).firstOrNull { isDongLike(it) } ?: bodyLocations[2]
                    dropoff = "$destTag $dropDong"
                }
            }
        } else {
            // 상단 태그에 도착 지역이 없는 경우: 전체 locations로 조립
            when {
                locations.size >= 4 -> {
                    pickup = "${locations[0]} ${locations[1]}"
                    val dropDong = locations.drop(3).firstOrNull { isDongLike(it) } ?: locations[3]
                    dropoff = "${locations[2]} $dropDong"
                }
                locations.size == 3 -> {
                    // Case 1: [구, 구, 동] -> 출발구 ➔ 도착구+도착동 (예: 분당 ➔ 서초 방배본)
                    // Case 2: [구, 동, 구] -> 출발구+출발동 ➔ 도착구 (예: 하남 감일 ➔ 종로)
                    if (isGuOrCity(locations[1])) {
                        pickup = locations[0]
                        dropoff = "${locations[1]} ${locations[2]}"
                    } else {
                        pickup = "${locations[0]} ${locations[1]}"
                        dropoff = locations[2]
                    }
                }
                locations.size == 2 -> {
                    // 태그가 없는 순수 2토막은 앞이 출발, 뒤가 도착
                    pickup = locations[0]
                    dropoff = locations[1]
                }
                locations.size == 1 -> {
                    pickup = locations[0]
                    dropoff = ""
                }
                else -> {
                    pickup = ""
                    dropoff = ""
                }
            }
        }

        return SimplifiedOfficeOrder(
            id = "",                          // 리스트에는 ID 가 없다 — 상세에만 오더번호가 있다 (0830 실측)
            type = "NEW_ORDER",
            pickup = pickup,
            dropoff = dropoff,
            fare = fare,
            timestamp = java.time.OffsetDateTime.now().toString(),
            scheduleText = scheduleTime,
            vehicleType = null,               // 픽커에 차종 축이 없다 — 물품 크기가 대신한다. 섞어 싣지 않는다
            itemSize = itemSize,
            tagsText = tags.joinToString(" ").ifEmpty { null },
            rawText = texts.joinToString(" "),
            pickupDistance = pickupKm,
            deliveryDistance = null,          // 리스트에 배송거리가 없다 (인성과의 결정적 차이)
        )
    }

    /**
     * 🔔 알람 판정 위임 — 조건은 피기백 필터(원천 DB)에서 읽는다.
     * true 면 소리·진동·테두리 + **상세까지 이동** (기사님 확정 0830 — 요금 최고 콜 하나,
     * 30초 무응답 시 자동 복귀). **수락(계약) 클릭은 없다** — 상세 화면의 잡기 수순은
     * supportsCatching=false 가 입구에서 차단한다. 지문 기억 덕에 콜당 한 번이다 (#79 배선).
     */
    override fun shouldClick(order: SimplifiedOfficeOrder, tally: FilterTally?): Boolean {
        val c = alarmConfig()
        // 🧾 판정에 쓴 필터가 바뀌었으면 먼저 한 줄 — 채점기가 이 판정의 정답을 이 필터로 다시 계산한다 (3단계 3-2)
        val filterJson = alarmFilterJson(c.minFare, c.pickupRadiusKm, c.destKeywords, c.keywordTraps, c.cityAliases)
        if (filterJson != lastAlarmFilterJson) {
            lastAlarmFilterJson = filterJson
            com.onedal.app.core.AppLogger.i("1DAL_PICKER", "🧾 [알람 필터] $filterJson")
        }
        val pass = decide(order, c.minFare, c.pickupRadiusKm, c.destKeywords, c.keywordTraps, c.cityAliases, tally)
        val a = decideAxes(order, c.minFare, c.pickupRadiusKm, c.destKeywords, c.keywordTraps, c.cityAliases)
        val mark = { ok: Boolean -> if (ok) "✅" else "❌" }
        // 👁️ 축별 판정을 한 줄 남긴다 — «왜 안 울었나»를 로그로 답하기 위해 (첫 실검증 때 수집 데이터로 역추적했다)
        //    🔴 채점기(`pickerAlarmGrade.mjs`)가 이 줄의 모양을 읽는다 — 바꾸면 그 정규식도 같이 바꾼다
        com.onedal.app.core.AppLogger.d("1DAL_PICKER",
            "🔔 [알람 판정] ${order.fare}원·픽업 ${order.pickupDistance ?: "?"}km·도착 ${order.dropoff.ifEmpty { "?" }} — " +
            "하한 ${c.minFare}·반경 ${c.pickupRadiusKm}km·도착목표 ${c.destKeywords.size}개 → ${if (pass) "통과" else "탈락"}" +
            " · 축 요금${mark(a.fare)} 상차${mark(a.pickup)} 도착${mark(a.destination)}")
        return pass
    }

    /** 알람 테두리는 요금 닻이 아니라 **카드 띠 전체**를 두른다 — 묶기(inCardBand)와 같은 값 (#83) */
    override fun alarmBandHalfPx(): Int = CARD_BAND_PX

    override fun parsePickupDistance(rawText: String): Double? =
        Regex("""(\d+(?:\.\d+)?)km""").find(rawText)?.groupValues?.get(1)?.toDoubleOrNull()

    /**
     * 🗳️ **알람 판정에서 떨어진 축을 장부에 싣는다** (기사님 지시).
     *
     * 픽커는 «수집 전용이라 잡기 판정이 없다» 며 오래 비워 뒀는데, 알람 판정(요금·상차·도착)이
     * 생긴 뒤로는 실을 것이 있다. 이게 없으면 «왜 이 콜이 안 울렸나» 를 3일치 폰 로그로만 볼 수 있다.
     * 🔴 `InsungParser.withVerdict` 와 같은 꼴 — **판정 함수가 고른 축**을 그대로 넣어,
     *    성적표와 장부가 «성적표는 요금, 장부는 지역» 으로 갈라지지 않게 한다.
     */
    override fun withVerdict(order: SimplifiedOfficeOrder, tally: FilterTally?): SimplifiedOfficeOrder {
        val c = alarmConfig()
        return order.copy(
            verdict = verdictAxisOf(order, c.minFare, c.pickupRadiusKm, c.destKeywords, c.keywordTraps, c.cityAliases),
        )
    }

    override fun matchDetailOrder(screenTexts: List<String>, recentOrders: List<SimplifiedOfficeOrder>): SimplifiedOfficeOrder? {
        return matchListCard(screenTexts, recentOrders).card
    }
}
