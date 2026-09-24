/**
 * 🎯 **문제지 — 정해진 콜을 순서대로 흘린다** (기사님 요청)
 *
 * 시뮬레이터는 콜을 랜덤으로 만든다. 그래서 *"인천 남동구행 콜이 뜨면 앱이 거르는가"* 같은
 * **특정 조건을 시험하려면 복권을 긁어야 했다.** 문제지는 그 조건을 바로 세운다 —
 * 리허설 13~16(고수 4콜)과 같은 생각이다: **재현 가능한 문제로 채점한다.**
 *
 * 쓰는 법:  http://<PC IP>:5173/dispatch?net=insung&preset=오탐
 *
 * 🔴 `expect` 는 **앱 1차 필터가 어떻게 해야 하는가**다 — 채점의 정답지다.
 *    BLOCK 인데 콜을 잡으면 오탐(잘못 잡음), PASS 인데 안 잡으면 미탐(놓침).
 *    미탐이 오탐보다 아프다 (규칙 ⑤ — 앱의 목적은 놓치지 않는 것).
 */
import { findMockEntry, MOCK_DATA, type MockEntry, type ForcedPair } from './generator';
import { calculateDistanceKm } from './geo';

export interface PresetProblem {
    label: string;
    /** 상차·하차 주소 조각 — 모의 데이터(mockLocationData)에서 찾는다 */
    pickup?: string;
    dropoff?: string;
    /**
     * 📍 **주소 대신 «거리 띠»로 낸다 — 어디서 돌리든 같은 정답** (기사님 확정).
     *
     * 주소를 박아 두면 그 동네에서만 참인 문제가 된다 — 다른 곳에서 돌리면 실제로는 33.5km 먼
     * 상차지를 시뮬이 고정 좌표에서 0.2km 로 재 보내 **먼 콜이 필터를 통과**한다. 띠로 내면 서울이든 부산이든 같은 축을 시험한다.
     *
     *   near — 상차 반경 **안** (설정의 절반쯤)
     *   far  — 상차 반경 **밖** (설정 + 5km 이상)
     */
    pickupBand?: 'near' | 'far';
    /** 하차지 거리 띠 — 배송거리(요금/단가 축의 입력)를 만든다 */
    dropoffBand?: 'near' | 'far';
    /** 모의 데이터에 없는 곳은 여기에 직접 (좌표의 출처를 주석으로 밝힌다) */
    pickupFallback?: MockEntry;
    dropoffFallback?: MockEntry;
    fare?: number;
    vehicleType?: string;
    /**
     * 앱 1차 필터의 **정답**. 채점용 문제지에만 있다 —
     * 무대 재현용은 결과가 그날 필터 상태에 달렸으므로 비워 둔다.
     */
    expect?: 'BLOCK' | 'PASS';
    /**
     * 🧱 **시간을 만드는 채움 콜** — 개수를 줄여도 시나리오가 안 깨지는 문제.
     *
     * 기사님: *"모의 주행 시간이 얼마인지 알 거니까 텀은 조절 가능하니까, 역산해서
     * 적당한 순서에 주행중 합짐이 나오게 해 줄 수 있지 않을까?"*
     *
     * 실측: 모의 주행 **40초**(15배속·25km) · 실주행 **40분**. 800배 차이라 텀 하나로는
     * 둘을 못 맞춘다 — 텀을 1초로 내리면 첫짐·합짐을 결재할 시간이 사라진다.
     * 그래서 **채움 개수**를 따로 조절한다: 집 5초·3개 · 차 30초·20개.
     *
     * 🔴 깃발이 없는 문제(잡는 콜 · 국면 전용 축)는 **언제나 남는다.**
     */
    filler?: boolean;
    /**
     * 🧩 **배차망만 아는 칸** — 공통 코드는 이름도 뜻도 모르고 그대로 넘긴다.
     * 예: 픽커 문제지의 예약 시각 `{ reservedAt: '17:00' }` 은 픽커 입히기 함수가 읽는다.
     */
    netFields?: Record<string, string | number | boolean>;
    why: string;
}

/**
 * 광주시 "남동" — 모의 데이터에 없어서 문제지가 직접 세운다.
 * ⚠️ 지금 이 지점을 쓰는 문제지는 없다 (`PRESETS` 에 오탐 문제지가 없다).
 * ⚠️ 좌표는 경안동 인근 **근사값**이다 (행정 경계 데이터는 서버에만 있다).
 *    이 문제의 채점 대상은 **이름 매칭**이라 좌표 정확도는 결과를 바꾸지 않는다.
 */
const GWANGJU_NAMDONG: MockEntry = {
    customerName: '남동 물류창고',
    contactName: '김반장',
    phone1: '010-0000-0001',
    // 🔴 `region` 이 **화면에 그려지는 글자**다 (SimDispatchBoard 가 이걸 먼저 쓴다) —
    //    앱은 화면을 읽으므로 여기가 "광주시"면 "남동" 매칭 자체가 일어나지 않아
    //    2번 문제(통과해야 한다)가 성립하지 않는다. 모의 데이터의 다른 항목들과 같은 규칙(동 이름).
    region: '남동',
    addressDetail: '경기 광주시 남동 32-1 남동 물류창고',
    lon: 127.2450,
    lat: 37.3950,
};

// ══════════════════════════════════════════════════════════════════════
//  🚚 서진(西進) 합짐 지점 — 초월 → 강서 (기사님 실주행)
//  ⚠️ 지금 이 지점을 쓰는 문제지는 없다 (`PRESETS` 에 서진이 없다).
//  좌표는 전부 카카오에서 확인했다 (`주소검증` 스킬).
//  🔴 이름으로 찾으면 폴백이 엉뚱한 곳을 문다 — 「진일텍푸라」는 오산 쪽(37.13)을 물어왔다.
//     그래서 **주소로** 박는다.
//  🔴 `region` 은 **반드시 «동» 이름이다**. 도착 목표 «서울»이 만드는 키워드 359개가
//     **전부 동 이름**이라 «강서구»처럼 구 이름을 적으면 도착지 축에서 떨어진다
//     — `도착지(359중 강서구)=❌`. 실제 동은 카카오 역지오코딩으로 확인했다:
//     서부간선=가산동 · 진일텍푸라=구로동 · 장례식장=방화동 (셋 다 키워드에 있다).
// ══════════════════════════════════════════════════════════════════════
const SB_CHOWOL: MockEntry = {
    customerName: '스타벅스 경기광주초월역DT점', contactName: '점장', phone1: '010-0000-0101',
    region: '초월읍', addressDetail: '경기 광주시 초월읍 스타벅스 경기광주초월역DT점',
    lon: 127.298238, lat: 37.374409,
};
const SN_TAXI: MockEntry = {
    customerName: '성남시 택시쉼터', contactName: '관리인', phone1: '010-0000-0102',
    region: '여수동', addressDetail: '경기 성남시 중원구 여수동 성남시 택시쉼터',
    lon: 127.122541, lat: 37.422620,
};
const AY_OIL: MockEntry = {
    customerName: '안양석유주유소', contactName: '소장', phone1: '010-0000-0103',
    region: '석수동', addressDetail: '경기 안양시 만안구 석수동 안양석유주유소',
    lon: 126.904770, lat: 37.429537,
};
const SEOBU_TOLL: MockEntry = {
    customerName: '서부간선영업소', contactName: '담당', phone1: '010-0000-0104',
    region: '가산동', addressDetail: '서울 금천구 가산동 서서울도시고속도로 서부간선영업소',
    lon: 126.883619, lat: 37.468967,
};
const JININ_TEX: MockEntry = {
    customerName: '진일텍푸라', contactName: '사장', phone1: '010-0000-0105',
    region: '구로동', addressDetail: '서울 구로구 구로동 경인로53길 111 진일텍푸라',
    lon: 126.874476, lat: 37.505685,
};
const GS_FUNERAL: MockEntry = {
    customerName: '강서개화장례식장', contactName: '실장', phone1: '010-0000-0106',
    region: '방화동', addressDetail: '서울 강서구 방화동 양천로 35 지층 강서개화장례식장',
    lon: 126.807692, lat: 37.572971,
};

// ══════════════════════════════════════════════════════════════════════
//  🚚 볼첨지 이틀 지점 — 실측 표(유튜브 자막 + 기사님 화면 캡처)의 상·하차지. 「볼트 오전」이 쓴다.
//
//  🔴 좌표는 **읍면동 중심점**이다 (`merged_map.geojson` 충청 확장본에서 turf.centroid).
//     표가 동 단위까지만 알기 때문이다 — 번지를 지어내면 문제지가 실제와 다른 거리를 낸다
//     (*"앱은 잘못한 게 없다. 문제지가 거짓말을 했다"*).
//  🔴 `region` 은 **동 이름**이다 — 구 이름을 적으면 도착지 축에서 떨어진다.
//  ⚠️ 「정중리」는 지도에 없다 — 리(里)는 8자리 **오송읍**으로 병합돼 있다 (REPG-001 §3.3).
//  ⚠️ 표의 「안산 송곡」은 지도에 없다. 같은 날 화면에 `@성곡동`·`@안산성곡동` 이 찍혔으므로
//     **성곡동(안산 단원구)** 으로 읽는다.
// ══════════════════════════════════════════════════════════════════════
const DJ_GALMA: MockEntry = {
    customerName: '대전 갈마동 상차지', contactName: '담당', phone1: '010-0000-0201',
    region: '갈마동', addressDetail: '대전 서구 갈마동',
    lon: 127.369643, lat: 36.346412,
};
const DJ_MUNJI: MockEntry = {
    customerName: '대전 문지동 상차지', contactName: '담당', phone1: '010-0000-0202',
    region: '문지동', addressDetail: '대전 유성구 문지동 문지로 188',
    lon: 127.398192, lat: 36.390957,
};
const CJ_OSONG: MockEntry = {
    customerName: '청주 오송 상차지', contactName: '담당', phone1: '010-0000-0203',
    region: '오송읍', addressDetail: '충북 청주시 흥덕구 오송읍',
    lon: 127.314502, lat: 36.626391,
};
const CA_SEONGGEO: MockEntry = {
    customerName: '천안 성거읍 물류', contactName: '담당', phone1: '010-0000-0204',
    region: '성거읍', addressDetail: '충남 천안시 서북구 성거읍',
    lon: 127.185034, lat: 36.878830,
};
const SEONGSU: MockEntry = {
    customerName: '성수동 상차지', contactName: '담당', phone1: '010-0000-0205',
    region: '성수동', addressDetail: '서울 성동구 성수동2가',
    lon: 127.047002, lat: 37.544678,
};
const MUNJEONG: MockEntry = {
    customerName: '문정동 상차지', contactName: '담당', phone1: '010-0000-0206',
    region: '문정동', addressDetail: '서울 송파구 문정동',
    lon: 127.124098, lat: 37.484904,
};
// ── 하차지 ──
const OSAN_GASU: MockEntry = {
    customerName: '오산 가수동 하차지', contactName: '담당', phone1: '010-0000-0211',
    region: '가수동', addressDetail: '경기 오산시 가수동 황새로 211',
    lon: 127.056415, lat: 37.146055,
};
/**
 * 🔴 「논현동」은 **서울 강남구에도 있다.** 볼첨지의 것은 **인천 남동구**다.
 *
 * 🔴 **동 이름과 도로명을 둘 다 적는다** — 바로 위 「경기 오산시 가수동 황새로 211」과 같은 모양이다.
 *
 *    **도로명이 빠지면** 「인천 남동구 논현동」으로 물은 카카오가 **동 중심점**(126.747372, 37.412410)을
 *    주는데 그 점이 도로 밖이라 길찾기가 «도착 지점 주변의 도로를 탐색할 수 없음»으로 실패한다.
 *    그 콜이 경유지 묶음에 끼면 **요청 전체가 에러 101 로 죽어** 그 뒤 잡은 콜까지 «🔴 잴 수 없음»이 된다.
 *
 *    **동 이름이 빠지면** 경유 필터가 이 콜을 버린다 — 「도착지(인천 남동구 논현로) 경유 이탈».
 *    하차 목록에 「논현동」이 있어도 주소 문자열에 그 글자가 없으면 못 맞춘다 (`anyRegionHit`).
 *    🔴 `region` 은 목록 화면에만 쓰이고, **상세와 서버 판정은 이 `addressDetail` 을 본다.**
 *
 *    좌표는 카카오 키워드 검색 실측 — 인천남동우체국(논현동 638-1) · 길찾기 성공 확인.
 */
const IC_NONHYEON: MockEntry = {
    customerName: '인천 논현동 하차지', contactName: '담당', phone1: '010-0000-0212',
    region: '논현동', addressDetail: '인천 남동구 논현동 논현로46번길 7',
    lon: 126.711883, lat: 37.401863,
};
const AS_SEONGGOK: MockEntry = {
    customerName: '안산 성곡동 하차지', contactName: '담당', phone1: '010-0000-0213',
    region: '성곡동', addressDetail: '경기 안산시 단원구 성곡동',
    lon: 126.761092, lat: 37.315691,
};
/** 🔴 인천 서구는 2026년 개편으로 **서해구**가 됐다 (지도 확장에서 드러남) */
const IC_GYEONGSEO: MockEntry = {
    customerName: '인천 경서동 하차지', contactName: '담당', phone1: '010-0000-0214',
    region: '경서동', addressDetail: '인천 서해구 경서동',
    lon: 126.651880, lat: 37.557424,
};
const IC_SONGDO: MockEntry = {
    customerName: '인천 송도동 하차지', contactName: '담당', phone1: '010-0000-0215',
    region: '송도동', addressDetail: '인천 연수구 송도동',
    lon: 126.631121, lat: 37.390040,
};
const SINDORIM: MockEntry = {
    customerName: '신도림동 하차지', contactName: '담당', phone1: '010-0000-0216',
    region: '신도림동', addressDetail: '서울 구로구 신도림동',
    lon: 126.878727, lat: 37.510097,
};

// ══════════════════════════════════════════════════════════════════════
//  🗺️ 지도 확장 시험 지점 — 인천 남동공단 상차 · 청주 방면 하차 (콜창 캡처의 실제 값)
//  ⚠️ 지금 이 지점을 쓰는 문제지는 없다 (`PRESETS` 에 지도청주가 없다).
// ══════════════════════════════════════════════════════════════════════
const IC_NAMDONG: MockEntry = {
    customerName: '남동공단 상차지', contactName: '담당', phone1: '010-0000-0301',
    region: '남촌동', addressDetail: '인천 남동구 남촌동 남동국가산업단지',
    lon: 126.714309, lat: 37.428026,
};
const IC_NONHYEON2: MockEntry = {
    customerName: '남동 논현동 상차지', contactName: '담당', phone1: '010-0000-0302',
    region: '논현동', addressDetail: '인천 남동구 논현동',
    lon: 126.722093, lat: 37.398184,
};
const SIHWA: MockEntry = {
    customerName: '시화공단 상차지', contactName: '담당', phone1: '010-0000-0303',
    region: '정왕동', addressDetail: '경기 시흥시 정왕동 시화국가산업단지',
    lon: 126.721019, lat: 37.340941,
};
const CJ_OCHANG: MockEntry = {
    customerName: '청주 오창읍 하차지', contactName: '담당', phone1: '010-0000-0311',
    region: '오창읍', addressDetail: '충북 청주시 청원구 오창읍',
    lon: 127.407401, lat: 36.733465,
};
const CJ_OKSAN: MockEntry = {
    customerName: '청주 옥산면 하차지', contactName: '담당', phone1: '010-0000-0312',
    region: '옥산면', addressDetail: '충북 청주시 흥덕구 옥산면',
    lon: 127.370322, lat: 36.687614,
};
const ES_SAMSEONG: MockEntry = {
    customerName: '음성 삼성면 하차지', contactName: '담당', phone1: '010-0000-0313',
    region: '삼성면', addressDetail: '충북 음성군 삼성면',
    lon: 127.499579, lat: 37.011227,
};
const OSAN_JIGOT: MockEntry = {
    customerName: '오산 지곶동 하차지', contactName: '담당', phone1: '010-0000-0314',
    region: '지곶동', addressDetail: '경기 오산시 지곶동',
    lon: 127.025937, lat: 37.176599,
};

/* ───────────────────────────────────────────────────────────────
   🚚 **볼트 하루 — 오전·저녁**

   🔴 **상·하차지는 동사무소·읍사무소다** (기사님 확정:
      *"상하차지는 동사무소 읍사무소로 하자"*). 동 무게중심은 **산속에 찍히는 곳**이 있어
      카카오가 길을 못 낸다 — 행정복지센터는 시가지 한복판이라 도로에 붙는다.
   좌표 원천: `client-app/src/pages/labProblems.ts` (목업 문제지) 그대로.
   ─────────────────────────────────────────────────────────────── */

const BD_SAMPYEONG: MockEntry = {
    customerName: '분당 삼평동 하차지', contactName: '담당', phone1: '010-0000-0401',
    region: '삼평동', addressDetail: '경기 성남시 분당구 삼평동',
    lon: 127.11115, lat: 37.39593,
};
const PANGYO_SW: MockEntry = {
    customerName: '판교 소프트웨어드림센터', contactName: '담당', phone1: '010-0000-0402',
    region: '시흥동', addressDetail: '경기 성남시 수정구 시흥동 창업로40번길 20 소프트웨어드림센터',
    lon: 127.09471, lat: 37.41297,
};
const GP_YANGCHON: MockEntry = {
    customerName: '김포 양촌읍 상차지', contactName: '담당', phone1: '010-0000-0403',
    region: '양촌읍', addressDetail: '경기 김포시 양촌읍',
    lon: 126.62550, lat: 37.65713,
};
const SEOUL_GASAN: MockEntry = {
    customerName: '서울 가산동 하차지', contactName: '담당', phone1: '010-0000-0404',
    region: '가산동', addressDetail: '서울 금천구 가산동',
    lon: 126.89178, lat: 37.47688,
};
/**
 * 🔴 **«김포 고촌읍» 이 아니라 «인천 오류동» 이다** (원문 대조).
 *
 * 「경기 김포시 고촌읍 오류동」으로 적으면 주소와 좌표가 서로 다른 곳을 가리킨다 — 그 이름에 붙던
 * 좌표(126.63762, 37.59704)를 카카오에 물으면 **인천 검단구 왕길동**이 나오고,
 * 카카오는 「김포 고촌읍 오류동」을 아예 모른다(인천 계양구 오류동만 나온다).
 *
 * 원문이 답을 갖고 있다 — 노하우 표 「볼트 저녁」 ②:
 *   *"상차지: **인천 서구 오류동** (자막의 «원창» 쪽)"*
 * 자막의 동선도 «인천 원창 → 검단 → 가산 → 안양 → 용인» 이라 인천이 맞다.
 * 좌표는 카카오 주소검색이 준 **오류동 중심**이다 (2026년 서구에서 검단구로 갈렸다).
 */
const IC_ORYU: MockEntry = {
    customerName: '인천 오류동 상차지', contactName: '담당', phone1: '010-0000-0405',
    region: '오류동', addressDetail: '인천 검단구 오류동',
    lon: 126.613712, lat: 37.592490,
};
const YI_WONSAM: MockEntry = {
    customerName: '용인 원삼면 하차지', contactName: '담당', phone1: '010-0000-0406',
    region: '원삼면', addressDetail: '경기 용인시 처인구 원삼면',
    lon: 127.31321, lat: 37.16661,
};
const IC_BULLO: MockEntry = {
    customerName: '인천 불로동 상차지', contactName: '담당', phone1: '010-0000-0407',
    region: '불로동', addressDetail: '인천 서해구 불로동',
    lon: 126.68895, lat: 37.61709,
};
const AY_BAKDAL: MockEntry = {
    customerName: '안양 박달동 하차지', contactName: '담당', phone1: '010-0000-0408',
    region: '박달동', addressDetail: '경기 안양시 만안구 박달동',
    lon: 126.90913, lat: 37.40367,
};
const IC_SINGEOMDAN: MockEntry = {
    customerName: '신검단중앙역 상차지', contactName: '담당', phone1: '010-0000-0409',
    region: '원당동', addressDetail: '인천 서해구 원당동 신검단중앙역',
    lon: 126.69848, lat: 37.60265,
};
const AY_ANYANG: MockEntry = {
    customerName: '안양동 하차지', contactName: '담당', phone1: '010-0000-0410',
    region: '안양동', addressDetail: '경기 안양시 만안구 안양동',
    lon: 126.91783, lat: 37.40510,
};


/**
 * 🏥 **경충대로 한 줄에 꿰인 아홉** — 두 문제지가 **같은 아홉을 쓴다**.
 *
 * 「병원 복귀」(올 때)와 「병원 방면」(갈 때)은 **같은 지점을 반대로 도는 문제지**다.
 * 좌표를 양쪽에 복붙하면 두 벌이 되고, 한쪽만 고쳐져 두 문제지가 갈라진다 (규칙 ③).
 * 그래서 **장소는 여기 한 곳에서만** 만들고, 방향마다 다른 것(번호·설명)만 각자 붙인다.
 *
 * 좌표는 카카오 실측이다 (`주소검증` 스킬).
 * 🔴 `region` 은 **동 이름**이다 — 「강서구」처럼 구 이름을 적으면 도착지 축에서 떨어진다.
 *    화면에 그려지는 글자가 이것이고, 앱은 화면을 읽는다.
 */
const stop = (region: string, addressDetail: string, lon: number, lat: number): MockEntry =>
    ({ region, addressDetail, lon, lat });

/** 🏠 집 — 기사님 실제 집을 문제지에 박지 않는다. 같은 읍이라 거리·방향 판정은 같다 */
const CHOWOL_STATION = stop('초월읍', '경기 광주시 초월읍 경충대로 1066 초월역', 127.299905, 37.373379);
/** 🏥 분당서울대병원 — 구미동(동 이름). 도로명 쪽 좌표라 길찾기가 선다 */
const BUNDANG_HOSPITAL = stop('구미동', '경기 성남시 분당구 구미동 구미로173번길 82 분당서울대학교병원', 127.124485, 37.352025);

/** 서 → 동. 집에서 잰 거리를 함께 적는다 (상차 반경 축이 여기서 갈린다) */
const BEAUTIFUL_CHURCH = stop('구미동', '경기 성남시 분당구 구미동 금곡로 182 아름다운교회', 127.120139, 37.351104);          // 집에서 16.1km
const EMART_BUNDANG    = stop('정자동', '경기 성남시 분당구 정자동 불정로 134 이마트 분당점', 127.119758, 37.358797);          // 16.0km
const SOGONGWON        = stop('서현동', '경기 성남시 분당구 서현동 324 소공원어린이공원 개방화장실', 127.13685, 37.379519); // 14.4km
const TIREPRO_SEOHYEON = stop('서현동', '경기 성남시 분당구 서현동 돌마로 572 타이어프로 분당서현점', 127.138682, 37.383986);   // 14.3km
const SUDOGOL          = stop('야탑동', '경기 성남시 분당구 야탑동 수도골', 127.141754, 37.405639);                     // 14.4km
const BULSAJO_OIL      = stop('갈현동', '경기 성남시 중원구 갈현동 경충대로 2441 디오티디 성남불사조주유소', 127.179635, 37.423321); // 12.0km
const ODBIKE_GWANGJU   = stop('장지동', '경기 광주시 장지동 경충대로 1871 오디바이크 광주물류센터', 127.231962, 37.405302);     // 7.0km
const SAE_GWANGJU_GAS  = stop('쌍령동', '경기 광주시 쌍령동 경충대로 1523 새광주충전소', 127.268235, 37.4043);                 // 4.4km
const NOBRAND_CHOWOL   = stop('초월읍', '경기 광주시 초월읍 경충대로 1215 노브랜드 광주초월점', 127.290318, 37.383855);  // 1.4km

/**
 * 🔴 **요금은 20만 고정 · 차종은 승용차** — 두 문제지가 같다.
 *   · 요금 축을 꺼야 **«방향인가»만** 남는다. 축을 둘 이상 켜면 무엇 때문에 막혔는지 갈리지 않는다
 *   · 승용차는 5박스라 아홉을 다 잡아도 45박스(1t=100박스 안). 다마스(30박스)면 넷째부터
 *     적재에 막혀 **«방향인가»가 아니라 «자리가 있나»를 재게 된다**
 */
const ride = (label: string, from: MockEntry, to: MockEntry, why: string, expect?: 'PASS' | 'BLOCK'): PresetProblem => ({
    label,
    pickup: from.addressDetail, pickupFallback: from,
    dropoff: to.addressDetail, dropoffFallback: to,
    fare: 200000, vehicleType: '승용차', expect, why,
});

/**
 * 🏥 **병원 복귀 — 분당에서 집까지, 아홉을 주우며 온다** (기사님 설계).
 *
 * 기사님: *"분당서울대학교병원에서 출발해서 아래 지점들을 **경유지로 집에오는** 테스트를
 * 진행할꺼야"* — 그리고 묶는 법을 정해 주셨다: *"**전부 집 방향 — 아홉 곳이 모두 상차지**"*.
 *
 * 🔴 **하차지가 아홉 다 같다(집).** 그래서 이 문제지는 «우회 비용이 0에 가까운 합짐»이
 *    얼마나 붙는지를 본다 — 복귀의 본뜻이다. 상차지만 서→동으로 늘어서 있어서
 *    **경충대로 한 줄에 아홉이 꿰인다.**
 *
 * ```
 * 출발  분당서울대병원 (127.12449, 37.35203)
 *   ① 아름다운교회 ② 이마트 분당점 ③ 소공원 ④ 타이어프로 서현   ← 분당
 *   ⑤ 수도골 ⑥ 불사조주유소                                    ← 야탑·중원
 *   ⑦ 오디바이크 광주 ⑧ 새광주충전소 ⑨ 노브랜드 초월            ← 광주
 * 집    초월역 (127.29991, 37.37338)
 * ```
 */
export const BYEONGWON_BOKGWI: PresetProblem[] = [
    ride('① ⭕ 아름다운교회 → 집(초월역)', BEAUTIFUL_CHURCH, CHOWOL_STATION,
         '병원 바로 옆(0.3km) — 첫짐으로 가장 가깝다', 'PASS'),
    ride('② ⭕ 이마트 분당점 → 집(초월역)', EMART_BUNDANG, CHOWOL_STATION,
         '정자동 — 아직 분당 안쪽이라 집까지 거리가 거의 그대로다', 'PASS'),
    ride('③ ⭕ 소공원어린이공원 개방화장실 → 집(초월역)', SOGONGWON, CHOWOL_STATION,
         '서현 — 여기서부터 동쪽으로 꺾인다', 'PASS'),
    ride('④ ⭕ 타이어프로 분당서현점 → 집(초월역)', TIREPRO_SEOHYEON, CHOWOL_STATION,
         '서현 끝 — 소공원에서 0.6km, 거의 같은 자리다', 'PASS'),
    ride('⑤ ⭕ 수도골 → 집(초월역)', SUDOGOL, CHOWOL_STATION,
         '야탑 — 분당의 마지막 지점', 'PASS'),
    ride('⑥ ⭕ 디오티디 성남불사조주유소 → 집(초월역)', BULSAJO_OIL, CHOWOL_STATION,
         '경충대로에 올라탔다 — 여기부터 집까지 한 길이다', 'PASS'),
    ride('⑦ ⭕ 오디바이크 광주물류센터 → 집(초월역)', ODBIKE_GWANGJU, CHOWOL_STATION,
         '광주 진입 — 경충대로를 그대로 탄다', 'PASS'),
    ride('⑧ ⭕ 새광주충전소 → 집(초월역)', SAE_GWANGJU_GAS, CHOWOL_STATION,
         '집까지 4km — 거의 다 왔다', 'PASS'),
    ride('⑨ ⭕ 노브랜드 광주초월점 → 집(초월역)', NOBRAND_CHOWOL, CHOWOL_STATION,
         '초월읍 — 집과 같은 읍이다. 우회가 사실상 0', 'PASS'),
];

/**
 * 🏥 **병원 방면 — 집에서 분당까지, 아홉에 들르며 간다** (기사님 지시:
 * *"그럼 병원 방면으로도 문제 만들어줘"*).
 *
 * 「병원 복귀」를 **뒤집은 문제지**다. 같은 아홉 지점을 **동→서**로 밟고, 하차지는 아홉 다
 * 분당서울대병원 하나다. 복귀가 «집으로 모이는 합짐»을 봤다면 이 문제지는 **«목적지 하나로
 * 모이는 합짐»** — 하루 운행 모델의 «노선»쪽이다 (노선 3 + 복귀 3).
 *
 * ── 🔴 복귀와 결정적으로 다른 것: **상차 반경이 살아 있다** ──
 *
 * 복귀는 출발이 분당이라 아홉이 차례로 가까워진다. 이 문제지는 **집에서 출발**하므로 거리가
 * 뒤집힌다 — 집에서 잰 값으로 ①1.4 · ②4.4 · ③7.0 · ④12.0 · ⑤14.4 · ⑥14.3 · ⑦14.4 ·
 * **⑧16.0 · ⑨16.1km** 다. 기본 상차 반경 **15km** 로는 **⑧⑨ 가 처음엔 안 들어온다.**
 *
 * 🔴 그래서 ⑧⑨ 에는 `expect` 를 **비워 뒀다.** 정답이 «지금 어디»에 달려 있기 때문이다 —
 *    서 있으면 BLOCK 이 맞고, 서쪽으로 움직이면 들어온다. 둘 중 하나로 못박으면
 *    **어느 쪽으로 채점해도 거짓**이 된다 (`expect` 는 채점의 정답지다).
 *    *그 자리가 이 문제지가 보려는 것이다 — «가면서 잡는다»가 실제로 일어나는지.*
 *
 * ```
 * 집    초월역 (127.29991, 37.37338)
 *   ① 노브랜드 초월 ② 새광주충전소 ③ 오디바이크 광주        ← 광주
 *   ④ 불사조주유소 ⑤ 수도골                                ← 중원·야탑
 *   ⑥ 타이어프로 서현 ⑦ 소공원 ⑧ 이마트 분당 ⑨ 아름다운교회  ← 분당
 * 병원  분당서울대병원 (127.12449, 37.35203)
 * ```
 */
export const BYEONGWON_BANGMYEON: PresetProblem[] = [
    ride('① ⭕ 노브랜드 광주초월점 → 병원', NOBRAND_CHOWOL, BUNDANG_HOSPITAL,
         '집과 같은 읍(1.4km) — 첫짐으로 가장 가깝다', 'PASS'),
    ride('② ⭕ 새광주충전소 → 병원', SAE_GWANGJU_GAS, BUNDANG_HOSPITAL,
         '집에서 4.4km — 경충대로를 그대로 탄다', 'PASS'),
    ride('③ ⭕ 오디바이크 광주물류센터 → 병원', ODBIKE_GWANGJU, BUNDANG_HOSPITAL,
         '7.0km — 아직 광주다. 우회가 거의 없다', 'PASS'),
    ride('④ ⭕ 디오티디 성남불사조주유소 → 병원', BULSAJO_OIL, BUNDANG_HOSPITAL,
         '12.0km — 성남으로 넘어왔다', 'PASS'),
    ride('⑤ ⭕ 수도골 → 병원', SUDOGOL, BUNDANG_HOSPITAL,
         '야탑 14.4km — 반경 15km 의 문턱이다', 'PASS'),
    ride('⑥ ⭕ 타이어프로 분당서현점 → 병원', TIREPRO_SEOHYEON, BUNDANG_HOSPITAL,
         '서현 14.3km — 여기서 남쪽으로 꺾어 병원으로 내려간다', 'PASS'),
    ride('⑦ ⭕ 소공원어린이공원 개방화장실 → 병원', SOGONGWON, BUNDANG_HOSPITAL,
         '서현 14.4km — 타이어프로에서 0.6km, 거의 같은 자리다', 'PASS'),
    ride('⑧ 🚗 이마트 분당점 → 병원', EMART_BUNDANG, BUNDANG_HOSPITAL,
         '집에서 16.0km 라 반경 15km 밖인데 **병원까지는 0.9km** 다 — 가서 잡으면 배송이 거의 공짜다'),
    ride('⑨ 🚗 아름다운교회 → 병원', BEAUTIFUL_CHURCH, BUNDANG_HOSPITAL,
         '집에서 16.1km 로 가장 멀지만 **병원까지 0.4km** — 상차 반경 축이 가장 또렷하게 드러나는 자리다'),
];

/* ═══════════════════════════════════════════════════════════════════════════
   🛣️ 경충대로·서이천로 — 집(초월) ↔ 롯데아울렛 이천 (기사님 지시)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 🔽🔼 **가는 방향과 오는 방향은 다른 지점이다** (기사님: *"가는 방향과
 * 오는방향이 다르다. **따로 기억해야해**"*).
 *
 * 기사님이 카카오내비 경유지 두 장을 주셨다 — 가는 길 일곱, 오는 길 여섯, 거기에 넷을 더.
 * 좌표는 전부 **카카오 장소검색 실값**이고 거리는 길찾기 실측이다 (동 중심점이 아니다).
 *
 * 🔴 **경충대로·서이천로는 왕복이 갈려 있다.** 마주 보는 주유소는 «가까운 같은 곳»이 아니다:
 *
 *    | 마주 보는 쌍 | 직선 | 남행지→북행지 | 실제/직선 |
 *    |---|---|---|---|
 *    | HD현대 서이천 ↔ 바디프랜드 | 0.57km | **2.9km** | **5.1배** |
 *    | HD현대 서이천 ↔ HD현대 신둔 | 1.64km | 4.5km | 2.7배 |
 *    | 승승장구 ↔ 마장주유소 | 1.12km | 2.9km | 2.6배 |
 *    | 곤지암IC 스벅 ↔ 곤지암스타 | 0.67km | 1.5km | 2.2배 |
 *
 * 🔴 그래서 **남행 지점과 북행 지점을 갈라 적는다.** 섞어 쓰면 «길 옆 600m»인데 실제로는
 *    중앙분리대를 돌아야 하는 콜이 꿀콜로 올라온다 — 잡고 나면 U턴이다.
 */

/* 🔽 남행 — 가는 길 (집 → 아울렛). 집에서 잰 거리를 함께 적는다 (상차 반경 축) */
const CJ_EXPRESS_OIL   = stop('초월읍', '경기 광주시 초월읍 경충대로 1021 CJ대한통운 경기고속주유소', 127.30277, 37.37010);   // 집에서 1.5km
const SB_GONJIAM_IC    = stop('곤지암읍', '경기 광주시 곤지암읍 경충대로 765 스타벅스 곤지암IC DT점', 127.32524, 37.35565);   // 4.0km
const GEUMGANG_OIL     = stop('곤지암읍', '경기 광주시 곤지암읍 경충대로 487 금강에너지주유소', 127.35158, 37.34365);         // 6.8km
const SEOMIN_OIL       = stop('곤지암읍', '경기 광주시 곤지암읍 경충대로 41 서민행복주유소', 127.39493, 37.32814);           // 12.9km
const SEOICHEON_OIL    = stop('신둔면', '경기 이천시 신둔면 서이천로 811 HD현대오일뱅크직영 서이천주유소', 127.39548, 37.29264); // 18.0km
const SEUNGSEUNG_OIL   = stop('마장면', '경기 이천시 마장면 서이천로 683 승승장구주유소', 127.39829, 37.28175);             // 16.5km
const NEW_MAJANG_OIL   = stop('마장면', '경기 이천시 마장면 서이천로 393 SK에너지 뉴마장주유소', 127.39426, 37.25936);      // 18.6km
const LOTTE_OUTLET     = stop('호법면', '경기 이천시 호법면 프리미엄아울렛로 177-74 롯데프리미엄아울렛 이천점', 127.40048, 37.24236); // 21.3km

/* 🔼 북행 — 오는 길 (아울렛 → 집). 아울렛에서 잰 거리 */
const MAJANG_OIL       = stop('마장면', '경기 이천시 마장면 서이천로 564 마장주유소', 127.40176, 37.27208);                // 아울렛에서 4.4km
const BODYFRIEND_ICH   = stop('신둔면', '경기 이천시 신둔면 서이천로 878 바디프랜드 이천라운지', 127.39960, 37.29654);       // 7.5km
const SINDUN_OIL       = stop('신둔면', '경기 이천시 신둔면 경충대로 3126 HD현대오일뱅크직영 신둔주유소', 127.40410, 37.30574); // 9.1km
const WOORI_OIL        = stop('신둔면', '경기 이천시 신둔면 경충대로 3282 우리주유소', 127.39719, 37.31740);                // 10.7km
const DONGWON_JJAJANG  = stop('곤지암읍', '경기 광주시 곤지암읍 경충대로 222 동원옛날짜장', 127.37733, 37.33385);           // 13.9km
const SEONGYEONG_OIL   = stop('곤지암읍', '경기 광주시 곤지암읍 경충대로 426 선경오일주유소', 127.35852, 37.34244);         // 15.9km
const GONJIAM_STAR_OIL = stop('곤지암읍', '경기 광주시 곤지암읍 경충대로 698 곤지암스타주유소', 127.33209, 37.35310);       // 18.6km

/**
 * 🔽✅ **이천행 · 순행** — 남행 지점만. 네 콜이 경충대로 한 줄에 얹힌다.
 * 전부 들러도 23.3km/40분/톨 0 이다 (고속을 타면 21.3km/26분/1,500원).
 * ④ 는 ③(서이천→아울렛) 구간 **안에 포개지는 «공짜 합짐»**이다.
 * 🔴 ③④ 의 상차지는 집에서 18.0 · 16.5km 라 **반경 15km 밖**이다 — 서 있으면 안 들어온다.
 *    병원방면 ⑧⑨ 와 같은 자리라 `expect` 를 **비워 뒀다** (정답이 «지금 어디»에 달렸다).
 */
export const ICHEON_SUNHAENG: PresetProblem[] = [
    ride('① ⭕ CJ대한통운 경기고속 → 곤지암IC 스벅', CJ_EXPRESS_OIL, SB_GONJIAM_IC,
         '집에서 1.5km — 첫짐으로 가장 가깝다. 배송 2.6km', 'PASS'),
    ride('② ⭕ 금강에너지 → 서민행복', GEUMGANG_OIL, SEOMIN_OIL,
         '상차 6.8km · 배송 4.4km — 라인 위에 그대로 얹힌다', 'PASS'),
    ride('③ 🚗 HD현대 서이천 → 롯데아울렛 이천', SEOICHEON_OIL, LOTTE_OUTLET,
         '상차가 집에서 18.0km 라 반경 밖이다. 달려가면 잡힌다 — 배송 6.9km 로 목적지까지 끌고 간다'),
    ride('④ 🚗 승승장구 → SK 뉴마장', SEUNGSEUNG_OIL, NEW_MAJANG_OIL,
         '상차 16.5km(반경 밖). 배송 2.9km 가 ③ 구간 **안에 완전히 포개진다** — 우회가 사실상 0'),
];

/**
 * 🔽🔴 **이천행 · 상차지가 반대편 차선** — ①② 는 남행인데 ③④ 의 상차지가 **북행 지점**이다.
 *
 * 🔴 **③④ 는 좌표만 보면 나무랄 데가 없다** — 상차가 집에서 5.4 · 8.2km(반경 안)이고
 *    하차도 이천 쪽으로 전진한다. 그런데 **들어가려면 중앙분리대를 돌아야 한다.**
 *    거리·방향 식으로는 잡을 방법이 없다 — 그래서 `expect` 를 비웠다.
 *    **넷 다 통과하면 그것이 답이다: 필터가 «차선»을 안 본다.**
 * ⚠️ 되돌아가는 콜(좌표 역주행)은 지금도 잡힌다 — 그건 이미 되는 것이라 이 문제지에서 뺐다.
 */
export const ICHEON_BANDAE: PresetProblem[] = [
    ride('① ⭕ CJ대한통운 경기고속 → 서민행복', CJ_EXPRESS_OIL, SEOMIN_OIL,
         '정상 콜 — 상차 1.5km · 배송 9.8km, 둘 다 남행 차선이다', 'PASS'),
    ride('② ⭕ 금강에너지 → 롯데아울렛 이천', GEUMGANG_OIL, LOTTE_OUTLET,
         '정상 콜 — 상차 6.8km · 배송 16.4km 로 목적지 직행', 'PASS'),
    ride('③ 🔴 곤지암스타(북행) → 우리주유소(북행)', GONJIAM_STAR_OIL, WOORI_OIL,
         '상차 5.4km 에 배송 10.5km 로 이천 쪽 전진 — **좌표로는 꿀콜**이다. 그런데 곤지암스타는 **집 방향 차선**이라 남행 중엔 못 들어간다 (맞은편 곤지암IC 스벅과 직선 0.67km)'),
    ride('④ 🔴 선경오일(북행) → 바디프랜드 이천(북행)', SEONGYEONG_OIL, BODYFRIEND_ICH,
         '상차 8.2km · 배송 9.3km — 역시 전진으로 보인다. 선경오일은 맞은편 금강에너지와 **직선 0.63km** 인데 건너가는 데 1.4km 다'),
];

/**
 * 🔼✅ **복귀 · 순행** — 아울렛에서 집으로. 북행 지점만. 전부 들러도 23.3km/45분/톨 0.
 * ④ 는 ③(동원옛날짜장→집) 구간 안에 포개진다 — 이천행 순행의 ③④ 와 **같은 모양**이다.
 * 🔴 ④ 상차지는 아울렛에서 15.9km 라 반경 밖이다 — `expect` 를 비웠다.
 */
export const BOKGWI_SUNHAENG: PresetProblem[] = [
    ride('① ⭕ 마장주유소 → 바디프랜드 이천', MAJANG_OIL, BODYFRIEND_ICH,
         '아울렛에서 4.4km — 복귀 첫짐. 배송 3.1km', 'PASS'),
    ride('② ⭕ HD현대 신둔 → 우리주유소', SINDUN_OIL, WOORI_OIL,
         '상차 9.1km · 배송 1.6km — 경충대로에 올라탔다', 'PASS'),
    ride('③ ⭕ 동원옛날짜장 → 집(초월역)', DONGWON_JJAJANG, CHOWOL_STATION,
         '상차 13.9km(반경 15km 문턱 안) · 배송 9.4km 로 집까지 끌고 간다', 'PASS'),
    ride('④ 🚗 선경오일 → 곤지암스타', SEONGYEONG_OIL, GONJIAM_STAR_OIL,
         '상차 15.9km 라 반경 밖. 달려가면 잡히고, 배송 2.7km 는 ③ 구간 안에 포개진다'),
];

/**
 * 🔼🔴 **복귀 · 상차지가 반대편 차선** — 집으로 오는 중인데 ③④ 의 상차지가 **남행 지점**이다.
 * 이천행 함정과 **같은 모양**이다 — 상차가 아울렛에서 4.4 · 6.0km(반경 안)이고 하차는
 * 집 쪽으로 전진한다. 좌표로는 꿀콜인데 상차지가 맞은편이다.
 */
export const BOKGWI_BANDAE: PresetProblem[] = [
    ride('① ⭕ 마장주유소 → HD현대 신둔', MAJANG_OIL, SINDUN_OIL,
         '정상 콜 — 상차 4.4km · 배송 4.7km, 둘 다 북행 차선이다', 'PASS'),
    ride('② ⭕ 우리주유소 → 집(초월역)', WOORI_OIL, CHOWOL_STATION,
         '정상 콜 — 상차 10.7km · 배송 12.6km 로 집 직행', 'PASS'),
    ride('③ 🔴 SK 뉴마장(남행) → 동원옛날짜장(북행)', NEW_MAJANG_OIL, DONGWON_JJAJANG,
         '상차가 아울렛에서 4.4km 에 배송 12.7km 로 집 쪽 전진 — **좌표로는 꿀콜**이다. 그런데 뉴마장은 **이천 방향 차선**이라 복귀 중엔 못 들어간다 (맞은편 마장주유소와 직선 1.56km)'),
    ride('④ 🔴 승승장구(남행) → 우리주유소(북행)', SEUNGSEUNG_OIL, WOORI_OIL,
         '상차 6.0km · 배송 5.4km — 역시 전진으로 보인다. 승승장구는 맞은편 마장주유소와 **직선 1.12km** 인데 건너가는 데 2.9km 다'),
];

export const PRESETS: Record<string, PresetProblem[]> = {
    '병원복귀': BYEONGWON_BOKGWI,
    '병원방면': BYEONGWON_BANGMYEON,
    '이천행': ICHEON_SUNHAENG,
    '이천행반대': ICHEON_BANDAE,
    '집복귀': BOKGWI_SUNHAENG,
    '집복귀반대': BOKGWI_BANDAE,
    /**
     * 🌅 **볼트 오전 — 하루를 한 문제지로**
     *
     * 8/10(월) 대전에서 시작해 김포(집)로 올라오며 **일곱 콜**을 모은 하루.
     * 목업(`labProblems.ts`)과 같은 묶음이다 — 폰으로 같은 하루를 밟으려면 시뮬에도
     * 그 묶음이 있어야 «하루가 어떻게 흐르는가»가 보인다.
     *
     * 🔴 **출발 자리는 진차이나 대전점** (127.43654, 36.35187) — 「📍 내 위치 찍기」로 맞춘다.
     * 🔴 **도착 목표는 김포시** · 주행은 기사님이 직접 하신다 (목업과 같다 — 이벤트를 안 적는다).
     * ⚠️ **요금은 전부 20만원이다** — 실측 운임을 그대로 쓰면 단가 축에 걸려 «지도가 통과했는가»를
     *    못 본다. 실제 운임은 라벨에 남겼다.
     * ⚠️ **그날 취소된 콜(7번)은 없다** — 상차지가 «대전 (구체 미상)»이라 좌표가 없다.
     */
    '볼트오전': [
        {
            label: '① 대전 갈마동 → 천안 성거읍 · 50,050',
            pickup: '대전 갈마동 상차지', dropoff: '천안 성거읍 물류',
            pickupFallback: DJ_GALMA, dropoffFallback: CA_SEONGGEO,
            fare: 50050, vehicleType: '오토바이',
            why: '🚚 그날의 첫짐. 하차 주변이 넉넉해야 천안 성거읍이 그물에 든다',
        },
        {
            label: '② 대전 문지로 188 → 오산 황새로 211 · 38,500',
            pickup: '대전 문지동 상차지', dropoff: '오산 가수동 하차지',
            pickupFallback: DJ_MUNJI, dropoffFallback: OSAN_GASU,
            fare: 38500, vehicleType: '오토바이',
            why: '🚚 첫짐을 잡은 자리 근처에서 하나 더 — 합짐 1',
        },
        {
            label: '③ 오송 정중리 → 인천 논현동 · 38,500',
            pickup: '청주 오송읍 상차지', dropoff: '인천 논현동 하차지',
            pickupFallback: CJ_OSONG, dropoffFallback: IC_NONHYEON,
            /* 🏍️ 오토바이 — 짐칸이 거의 찬 뒤에도 받을 수 있는 콜이 하나는 있어야 한다 (기사님 확정).
               다마스이던 때는 실측에서 「차종(다마스) 불일치」로 막혔다 (그때 96칸 사용 중) */
            fare: 38500, vehicleType: '오토바이',
            why: '🚚 북상 길목의 오송 — 세 콜이 **같은 상차지**에서 갈린다',
        },
        {
            label: '④ 오송 정중리 → 안산 성곡동 · 38,500',
            pickup: '청주 오송읍 상차지', dropoff: '안산 성곡동 하차지',
            pickupFallback: CJ_OSONG, dropoffFallback: AS_SEONGGOK,
            fare: 38500, vehicleType: '오토바이',
            why: '🚚 같은 오송에서 다른 곳으로 — 0km 구간이 생기는 판',
        },
        {
            label: '⑤ 오송 정중리 → 분당 삼평동 · 60,000',
            pickup: '청주 오송읍 상차지', dropoff: '분당 삼평동 하차지',
            pickupFallback: CJ_OSONG, dropoffFallback: BD_SAMPYEONG,
            fare: 60000, vehicleType: '오토바이',
            why: '🚚 오송 셋째. 그날 최고 단가(6만)이고 하차지가 다음 상차지가 된다',
        },
        {
            label: '⑥ 천안 성거읍 → 인천 경서동 · 46,200',
            pickup: '천안 성거읍 물류', dropoff: '인천 경서동 하차지',
            pickupFallback: CA_SEONGGEO, dropoffFallback: IC_GYEONGSEO,
            /* 🏍️ 오토바이 — ③과 같은 까닭이다 (기사님 확정).
               다마스이던 때는 짐칸이 차서 앱이 서버에 올리지도 않았다 (그날 96칸 사용 중) */
            fare: 46200, vehicleType: '오토바이',
            why: '🚚 ①을 내린 자리에서 바로 실었다 — 하차지가 다음 상차지가 되는 흐름',
        },
        {
            label: '⑦ 성남 시흥동 → 인천 송도 · 34,650',
            pickup: '판교 소프트웨어드림센터', dropoff: '인천 송도동 하차지',
            pickupFallback: PANGYO_SW, dropoffFallback: IC_SONGDO,
            fare: 34650, vehicleType: '오토바이',
            why: '🚚 **일곱째다** — 자막은 «여섯 개»라 했지만 ⑤를 분당에 내리는 중에 하나 더 잡았다 (13:05 잡고 13:30 상차)',
        },
    ],

    /**
     * 🌆 **볼트 저녁 — 앉은 채로 셋, 달리며 하나** (목업 `labProblems.ts` 와 같은 묶음)
     *
     * 8/10(월) 저녁, 김포 두원타워(본업 자리)에서 시작해 용인 원삼까지 한 줄로 흘린 하루.
     *
     * 🔴 **잡은 자리가 둘이다** — 앞 셋은 **두원타워에 앉은 채로 17:46 동시에**,
     *    넷째는 **검단양촌 나들목에서 달리며 18:10** 에 잡았다. 그래서 ④ 전에 주행이 하나 들어간다.
     * 🔴 **출발 자리는 김포 두원타워** (126.62448, 37.64492) — 「📍 내 위치 찍기」로 맞춘다.
     * ⚠️ **도착 목표는 용인 처인구**(마지막 하차지) — 자막이 선언하지 않아 흐름의 끝으로 잡았다.
     */
    '볼트저녁': [
        {
            label: '① 김포 양촌읍 → 서울 가산동 · 200,000 (실측 34,650)',
            pickup: '김포 양촌읍 상차지', dropoff: '서울 가산동 하차지',
            pickupFallback: GP_YANGCHON, dropoffFallback: SEOUL_GASAN,
            fare: 200000, vehicleType: '다마스',
            why: '🚚 두원타워에 **앉은 채로** 잡은 셋 중 하나 (17:46)',
        },
        {
            label: '② 인천 오류동 → 용인 원삼면 · 200,000 (실측 46,200)',
            pickup: '인천 오류동 상차지', dropoff: '용인 원삼면 하차지',
            pickupFallback: IC_ORYU, dropoffFallback: YI_WONSAM,
            fare: 200000, vehicleType: '다마스',
            why: '🚚 그날의 끝까지 가는 콜 — 도착 목표가 여기서 나온다',
        },
        {
            label: '③ 인천 불로동 → 안양 박달동 · 200,000 (실측 34,650)',
            pickup: '인천 불로동 상차지', dropoff: '안양 박달동 하차지',
            pickupFallback: IC_BULLO, dropoffFallback: AY_BAKDAL,
            fare: 200000, vehicleType: '다마스',
            why: '🚚 앉은 채로 잡은 셋째 — 여기까지가 17:46 한 묶음이다',
        },
        {
            label: '④ 신검단중앙역 → 안양동 · 200,000 (실측 38,000)',
            pickup: '신검단중앙역 상차지', dropoff: '안양동 하차지',
            pickupFallback: IC_SINGEOMDAN, dropoffFallback: AY_ANYANG,
            fare: 200000, vehicleType: '다마스',
            why: '🚚 **달리며 주운 콜** (18:10 · 검단양촌 나들목) — 앞 셋과 달리 주행 중 합짐이다',
        },
    ],

    /**
     * 🚚 **7지점 한 바퀴** — 기사님이 뽑아 주신 7개 지점 그대로 (기사님 지시).
     *
     *   집 ─2.2─ 모다 ─3.7─ 성당 ─6.2─ 신둔 ─2.2─ 이조 ─1.6─ 제일 ─1.8─ 터미널  (17.6km)
     *
     * `pnpm drive` 검사와 같은 코스·같은 좌표(카카오 실측, drive.mjs)다 — 화면으로 도는 문제지.
     * 7문제뿐이라 45초 간격이면 **5분 15초에 끝난다.** 채움 문제는 없다 (기사님: 불필요한 문제 삭제).
     *
     * 정답: 정지 상태에서 **알람(통과) 2번 — 01·03.** 05 는 집 기점 상차 19.1km 라 정지 상태에서는
     * 걸리는 것이 정답이고 주행 중 신둔 근처에서만 잡힌다. 나머지 다섯은 조용해야 맞는다.
     * ⚠️ 07(상차 반경)은 집 기점 17.6km 라 15km 필터에서 걸리는 것이 정답이다.
     */
    '칠지점': [
        {
            label: '01 ⭕ 첫짐 · 모다아울렛 → 신둔농협 예스파크',
            pickup: '경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점',
            pickupFallback: { region: '초월읍', addressDetail: '경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점', lon: 127.312587, lat: 37.363298 },
            dropoff: '경기 이천시 신둔면 도자예술로 72 신둔농협하나로마트 예스파크점',
            dropoffFallback: { region: '신둔면', addressDetail: '경기 이천시 신둔면 도자예술로 72 신둔농협하나로마트 예스파크점', lon: 127.401207, lat: 37.309733 },
            fare: 50000, vehicleType: '다마스', expect: 'PASS',
            why: '정상 첫짐 — 상차 2.2km·하차 신둔면(이천)·다마스·5만. 이걸 놓치면 미탐',
        },
        {
            label: '02 ✖ 요금 · 곤지암성당 → 이천제일 · 5천원',
            pickup: '경기 광주시 곤지암읍 경충대로543번길 19 곤지암성당',
            pickupFallback: { region: '곤지암읍', addressDetail: '경기 광주시 곤지암읍 경충대로543번길 19 곤지암성당', lon: 127.348642, lat: 37.346213 },
            dropoff: '경기 이천시 관고동 107-5 이천제일식자재마트',
            dropoffFallback: { region: '관고동', addressDetail: '경기 이천시 관고동 107-5 이천제일식자재마트', lon: 127.429230, lat: 37.285068 },
            fare: 5000, vehicleType: '다마스', expect: 'BLOCK',
            why: '앱의 요금 축은 단가식(9.8km×616=6,036원 하한)이다 — min_fare 2만은 보류 칸. 5천 원이라야 진짜로 걸린다 (8천이던 1판에서 통과해 배웠다 · 2026-08-30)',
        },
        {
            label: '03 ⭕ 합짐 · 곤지암성당 → 이천제일',
            pickup: '경기 광주시 곤지암읍 경충대로543번길 19 곤지암성당',
            pickupFallback: { region: '곤지암읍', addressDetail: '경기 광주시 곤지암읍 경충대로543번길 19 곤지암성당', lon: 127.348642, lat: 37.346213 },
            dropoff: '경기 이천시 관고동 107-5 이천제일식자재마트',
            dropoffFallback: { region: '관고동', addressDetail: '경기 이천시 관고동 107-5 이천제일식자재마트', lon: 127.429230, lat: 37.285068 },
            fare: 50000, vehicleType: '다마스', expect: 'PASS',
            why: '성당은 신둔 가는 길목(5.9km) — 지나는 길에 줍는 합짐',
        },
        {
            label: '04 ✖ 차종 · 모다아울렛 → 이천터미널 · 5t',
            pickup: '경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점',
            pickupFallback: { region: '초월읍', addressDetail: '경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점', lon: 127.312587, lat: 37.363298 },
            dropoff: '경기 이천시 중리동 219-1 이천터미널',
            dropoffFallback: { region: '중리동', addressDetail: '경기 이천시 중리동 219-1 이천터미널', lon: 127.446936, lat: 37.277421 },
            fare: 150000, vehicleType: '5t', expect: 'BLOCK',
            why: '5t 는 허용 차종(오·다·라·승·1t) 밖 — 차종 축이 도는지',
        },
        {
            label: '05 ⭕ 합짐2 · 이조갈비 → 이천터미널',
            pickup: '경기 이천시 사음동 452-4 이조갈비함흥냉면',
            pickupFallback: { region: '사음동', addressDetail: '경기 이천시 사음동 452-4 이조갈비함흥냉면', lon: 127.416293, lat: 37.294522 },
            dropoff: '경기 이천시 중리동 219-1 이천터미널',
            dropoffFallback: { region: '중리동', addressDetail: '경기 이천시 중리동 219-1 이천터미널', lon: 127.446936, lat: 37.277421 },
            fare: 50000, vehicleType: '다마스', expect: 'BLOCK',
            why: '집(정지) 기준 상차 19.1km > 반경 15km — 차단이 정답. 이조는 «주행 중» 신둔 근처에서만 잡히는 콜이다 (1판 실측 2026-08-30)',
        },
        {
            label: '06 ✖ 역주행 · 이천터미널 → 모다아울렛 (하차가 광주)',
            pickup: '경기 이천시 중리동 219-1 이천터미널',
            pickupFallback: { region: '중리동', addressDetail: '경기 이천시 중리동 219-1 이천터미널', lon: 127.446936, lat: 37.277421 },
            dropoff: '경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점',
            dropoffFallback: { region: '초월읍', addressDetail: '경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점', lon: 127.312587, lat: 37.363298 },
            fare: 50000, vehicleType: '다마스', expect: 'BLOCK',
            why: '하차가 광주 초월읍 — 이천 목록 밖. 역주행을 도착지 축이 막는다',
        },
        {
            label: '07 ✖ 상차 반경 · 이천터미널 → 신둔농협 (집에서 17.6km)',
            pickup: '경기 이천시 중리동 219-1 이천터미널',
            pickupFallback: { region: '중리동', addressDetail: '경기 이천시 중리동 219-1 이천터미널', lon: 127.446936, lat: 37.277421 },
            dropoff: '경기 이천시 신둔면 도자예술로 72 신둔농협하나로마트 예스파크점',
            dropoffFallback: { region: '신둔면', addressDetail: '경기 이천시 신둔면 도자예술로 72 신둔농협하나로마트 예스파크점', lon: 127.401207, lat: 37.309733 },
            fare: 30000, vehicleType: '다마스', expect: 'BLOCK',
            why: '상차가 집에서 17.6km > 반경 15km — 상차 반경 축이 도는지',
        },
    ],

};

/** 문제 하나를 생성기가 먹을 수 있는 강제 쌍으로 — 주소를 못 찾으면 null (지어내지 않는다) */
export function toForcedPair(p: PresetProblem, ctx?: RelativeContext): ForcedPair | null {
    /**
     * 🔴 **주소가 비었으면 «못 찾음»이다**. `findMockEntry('')` 는
     *    `includes('')` 라 **항상 참** — 첫 주소를 조용히 집어온다. 그러면 띠도 주소도 없는 문제가
     *    건너뛰는 대신 **엉뚱한 곳으로 출제**되어 «지어내지 않는다»(규칙 ④)가 깨진다.
     */
    const byName = (part?: string) => (part ? findMockEntry(part) : undefined);
    const pickup = p.pickupBand
        ? pickByBand(p.pickupBand, ctx, `${p.label} 상차`)
        : (byName(p.pickup) ?? p.pickupFallback);
    /**
     * 🔴 하차 띠는 **상차지에서** 잰다 — 요금/단가 축이 먹는 값은 «상차→하차» 거리다
     *    현위치에서 재면 같은 문제의 정답이 기사님 위치에 따라 흔들려,
     *    «어디서 돌려도 정답이 같다»는 이 문제지의 약속이 깨진다.
     */
    const dropoff = p.dropoffBand
        ? pickByBand(p.dropoffBand, pickup ? { ...ctx!, driverLon: pickup.lon, driverLat: pickup.lat } : ctx,
                     `${p.label} 하차`, pickup)
        : (byName(p.dropoff) ?? p.dropoffFallback);
    if (!pickup || !dropoff) {
        console.warn(`🎯 [문제지] "${p.label}" 의 주소를 모의 데이터에서 못 찾았습니다 — 건너뜁니다`);
        return null;
    }
    return { pickup, dropoff, fare: p.fare, vehicleType: p.vehicleType, ...(p.netFields ? { netFields: p.netFields } : {}) };
}

/** 띠를 풀려면 «지금 어디»와 «반경이 얼마»를 알아야 한다 */
export interface RelativeContext {
    driverLon: number;
    driverLat: number;
    /** 앱의 상차 반경 설정 — 띠의 경계가 여기서 나온다 */
    maxPickupKm: number;
}

/**
 * 📍 **띠 안의 실제 주소 하나를 고른다** (현위치 기준).
 * 🔴 없으면 `undefined` — 지어내지 않는다 (규칙 ④). 문제는 건너뛰고 그 사실을 로그로 남긴다.
 */
function pickByBand(
    band: 'near' | 'far', ctx: RelativeContext | undefined, what: string, avoid?: MockEntry,
): MockEntry | undefined {
    if (!ctx) {
        console.warn(`🎯 [문제지] ${what} — 현위치를 몰라 거리 띠를 풀 수 없습니다 (건너뜁니다)`);
        return undefined;
    }
    const here: [number, number] = [ctx.driverLon, ctx.driverLat];
    const inner = Math.max(1, ctx.maxPickupKm * 0.5);      // 반경 안 — 넉넉히 통과
    const outer = ctx.maxPickupKm + 5;                     // 반경 밖 — 확실히 차단
    const pool = MOCK_DATA
        .filter(m => m.lon && m.lat && m !== avoid)
        .map(m => ({ m, d: calculateDistanceKm(here, [m.lon, m.lat]) }))
        .filter(x => band === 'near' ? x.d <= inner : x.d >= outer)
        .sort((a, b) => a.d - b.d);
    if (!pool.length) {
        console.warn(`🎯 [문제지] ${what} — 현위치에서 ${band === 'near' ? `${inner.toFixed(1)}km 안` : `${outer.toFixed(1)}km 밖`}에 모의 주소가 없습니다 (건너뜁니다)`);
        return undefined;
    }
    // 경계에 가까운 다섯 중 하나 — 매번 같은 곳만 나오지 않게
    const slice = pool.slice(0, Math.min(5, pool.length));
    const chosen = slice[Math.floor(Math.random() * slice.length)];
    console.log(`🎯 [문제지] ${what} — 현위치에서 ${chosen.d.toFixed(1)}km (${band}) · ${chosen.m.addressDetail}`);
    return chosen.m;
}

/** 폰에서 URL 을 손으로 칠 때 한글이 번거롭다 — 영문 별칭도 받는다 */
/**
 * 🧪 **문제지가 요구하는 서버 필터·설정 상태** (기사님 지시)
 *
 * 필터·설정이 문제지와 어긋나 있으면 콜이 안 올라와도 «채점 결과»인지 «잡음»인지 구분할 수 없다.
 *
 * 🔴 문제지 설명에 *"도착 목표를 «인천»으로 두고 돌린다"* 처럼 **글로만** 적으면
 *    아무도 대조해 주지 않는다 — **기계가 확인하게** 한다.
 *    시뮬이 서버(`GET /api/sim/preflight`)에 물어 이 값과 맞춰 보고, 안 맞으면 화면에 세운다.
 */
export interface PresetRequires {
    /** 도착 목표 (도는 필터 · 설정이 아니다) */ destinationCity?: string;
    /** 하차 주변 반경 km — 넓혀야 들어오는 문제지가 있다 */ destinationRadiusKm?: number;
    /** 내 주소 — 상차 반경이 이 자리에서 재어진다. 사람이 읽고 고치는 값이라 글자로 둔다 */
    homeAddress?: string;
    /**
     * 상차 반경 — **폰에 실제로 적용되는 값**(자동이면 줄어든 값)이 이 이상이어야 한다.
     * 원값이 아니라 적용값을 본다 — 설정이 10km 여도 폰이 줄인 값(예: 4.55km)으로 걸러 첫 콜을 놓친다.
     */
    minPickupRadiusKm?: number;
    /** 첫짐만 채점하는 문제지인가 — 콜을 하나라도 잡으면 합짐 규칙으로 넘어가 정답이 달라진다 */
    firstLoadOnly?: boolean;
    /** 지도에 이 시도 코드가 있어야 한다 (30 대전 · 43 충북 …) */ mapSido?: string[];
    /** 알람 요금 하한 — 요금 경계를 시험하는 문제지 (서버 필터·설정 점검 `alarmMinFare` · 관제웹 설정) */ alarmMinFare?: number;
}

/** 문제지 이름 → 요구 상태. 없는 문제지는 «아무 상태에서나 돈다»는 뜻이다 */
export const PRESET_REQUIRES: Record<string, PresetRequires> = {
    /**
     * 🎯 **80km 는 잰 값이다** — `server/tests/rules/boltDaejeon.test.ts` 가 못박는다:
     *    0km → 1/3 · 40km → 2/3 · **80km → 3/3**. 볼트와 같아지는 지점이 80 이다.
     *    이 숫자를 바꾸려면 그 검사부터 바꾼다 (규칙 ③ — 값은 한 곳에서 나온다).
     */
    /**
     * 🌅 **볼트 오전 — 하루를 통째로 밟는 문제지**.
     *
     * 🔴 **`firstLoadOnly` 가 아니다.** 이 문제지는 **일곱을 이어 잡아 하루가 어떻게 흐르는지**
     *    보는 것이라, 잡는 것이 곧 문제지의 내용이다.
     * ⚠️ **집 주소는 안 건다** — 목업과 같이 기사님이 「📍 내 위치 찍기」로 출발 자리를 정하신다
     *    (진차이나 대전점 · 127.43654, 36.35187). 시뮬은 서버에 «지금 어디»를 물어 거리를 잰다.
     */
    /** 🏥 병원 복귀 — 출발 자리는 분당서울대병원. 목적지는 집이 있는 경기 광주 */
    '병원복귀': {
        destinationCity: '광주시', destinationRadiusKm: 20,
    },
    /**
     * 🏥 병원 방면 — 복귀를 뒤집었다. 출발은 집(초월역), 목적지는 병원이 있는 성남.
     * 🔴 «분당구»가 아니라 **«성남시»** 다 — 도착 목표는 **시 단위**로 받아 동 목록을 만든다.
     *    구 이름을 주면 동이 0개가 되고, 빈 목록은 fail-closed 라 **아홉이 전부 떨어진다**.
     */
    '병원방면': {
        destinationCity: '성남시', destinationRadiusKm: 20,
    },
    '볼트오전': {
        destinationCity: '김포', destinationRadiusKm: 80,
        mapSido: ['30', '43', '44'],   // 대전 · 충북(오송) · 충남(성거읍)
    },
    /** 🌆 볼트 저녁 — 출발 자리는 김포 두원타워 (126.62448, 37.64492). 목적지는 흐름의 끝인 용인 */
    '볼트저녁': {
        destinationCity: '용인', destinationRadiusKm: 80,
    },
    /**
     * 🔽 경충대로 이천행 — 출발은 집(초월역), 목적지는 이천.
     * 🔴 반경 20km 로 둔다. 경로가 23.3km 라 80km 는 너무 넓고, 15km 면 아울렛(21.3km)이 빠진다.
     */
    '이천행': { destinationCity: '이천시', destinationRadiusKm: 20 },
    '이천행반대': { destinationCity: '이천시', destinationRadiusKm: 20 },
    /** 🔼 경충대로 복귀 — 출발은 롯데아울렛 이천(127.40048, 37.24236), 목적지는 집이 있는 광주 */
    '집복귀': { destinationCity: '광주시', destinationRadiusKm: 20 },
    '집복귀반대': { destinationCity: '광주시', destinationRadiusKm: 20 },
    /**
     * 🚚 **7지점 한 바퀴** — 정답표 주석의 전제를 조건으로 둔다. 조건이 없으면 시작 전 점검 줄이 아예 안 뜬다.
     *    · 도착 목표 이천시 — «06 하차가 초월읍, 이천 목록 밖»
     *    · 상차 반경 15km 이상 — «07 집에서 17.6km > 반경 15km 에서 걸리는 것이 정답» · «01 상차 2.2km»
     *    · 내 주소 집 — 코스가 «집 ─2.2─ 모다 …» 로 시작한다 (서버 `user_settings.home_address` 글자 그대로)
     */
    '칠지점': { destinationCity: '이천시', minPickupRadiusKm: 15, homeAddress: '경기도 광주 초월 동광뷰엘' },
};

const ALIASES: Record<string, string> = {
    seven: '칠지점', '7': '칠지점',
    /**
     * 🔴 별칭은 `PRESETS` 에 있는 문제지만 가리킨다. 없는 이름을 가리키면 **못 찾아서 시뮬이 멈춘다** —
     *    문제지를 지울 때 그 별칭도 같이 지운다.
     */
    morning: '볼트오전', evening: '볼트저녁',
    hospital: '병원복귀', '병원': '병원복귀',
    tohospital: '병원방면', '방면': '병원방면', '병원방면콜': '병원방면',
    /* 🛣️ 경충대로 넷 — 방향마다 «순행 / 반대편 차선» 짝 */
    icheon: '이천행', '이천': '이천행',
    icheonx: '이천행반대', '이천반대': '이천행반대',
    home: '집복귀', '복귀': '집복귀',
    homex: '집복귀반대', '복귀반대': '집복귀반대',
};

/** 문제지 이름 목록 — 못 찾았을 때 «무엇이 있는지» 보여 주려고 쓴다 */
export const PRESET_KEYS = Object.keys(PRESETS);

/**
 * 🎯 **설정 화면에 보여 줄 문제지 목록** — 시나리오콜 탭이 이걸 나열한다.
 * 여기 없는 것은 URL 로만 들어간다 (`?preset=…`).
 */
export const PRESET_MENU: Array<{ key: string; title: string; desc: string }> = [
    { key: '병원복귀', title: '🏥 병원 복귀 — 분당에서 집까지 아홉 지점',
      desc: '9문제 · 요금 20만 고정(집 방향만 본다) · 승용차 5박스. 🔴 **「📍 내 위치 찍기」로 분당서울대병원** ' +
            '(127.12322, 37.35191) · **도착 목표 «광주시»**. **아홉 곳이 모두 상차지**이고 하차는 전부 집(초월역)이다 — ' +
            '우회가 0에 가까운 합짐이 얼마나 붙는지를 본다. 상차지가 **경충대로 한 줄에 서→동으로** 꿰여 있다',
    },
    /* 🔴 복귀의 **짝**이다 — 같은 아홉 지점을 반대로 돈다. 둘을 붙여 둬야 무엇이 다른지 보인다 */
    { key: '병원방면', title: '🏥 병원 방면 — 집에서 분당까지 아홉 지점',
      desc: '9문제 · 요금 20만 고정 · 승용차 5박스. 🔴 **「📍 내 위치 찍기」로 초월역** ' +
            '(127.29991, 37.37338) · **도착 목표 «성남시»**. 「병원 복귀」를 **뒤집은 판**이다 — ' +
            '아홉 곳이 모두 상차지이고 **하차는 전부 분당서울대병원**이라 «목적지 하나로 모이는 합짐»을 본다. ' +
            '🔴 복귀와 달리 **상차 반경이 살아 있다**: 집에서 재면 ⑧16.0 · ⑨16.1km 라 **반경 15km 밖**이다 — ' +
            '서 있으면 안 들어오고 **서쪽으로 움직이면 들어온다**. 그 둘만 정답을 비워 뒀다',
    },
    { key: '볼트오전', title: '🌅 볼트 오전 — 대전에서 김포까지 일곱 콜 (2026-08-10)',
      desc: '7문제 · 요금 20만 고정(지도·흐름을 본다). 🔴 **「📍 내 위치 찍기」로 진차이나 대전점** ' +
            '(127.43654, 36.35187) · **도착 목표 «김포시»**. 주행은 기사님이 직접 하신다. ' +
            '③④⑤ 는 **같은 오송 상차지**에서 갈린다 — 0km 구간이 생기는 자리다. ' +
            '⑥ 은 ①을 내린 성거읍에서 바로 싣고, ⑦ 은 ⑤를 분당에 내리는 중에 주운 **일곱째**다' },
    { key: '볼트저녁', title: '🌆 볼트 저녁 — 앉은 채로 셋, 달리며 하나 (2026-08-10)',
      desc: '4문제 · 요금 20만 고정. 🔴 **「📍 내 위치 찍기」로 김포 두원타워** (126.62448, 37.64492) · ' +
            '**도착 목표 «용인시 처인구»**. ①②③ 은 두원타워에 **앉은 채로 17:46 동시에** 잡은 것이고, ' +
            '④ 는 **검단양촌 나들목에서 달리며 18:10** 에 주웠다 — 사이에 주행이 하나 들어간다' },
    /* 🔴 제목은 «어디로 가는 문제지인가»로 짓는다 (기사님: *"칠 지점은 이천 방향으로
       제목을 만들어줘"*). 긴 지점 나열은 한 줄에 안 들어가 «...»로 잘린다 — 방향이 먼저다 */
    { key: '칠지점', title: '🚚 이천 방향 — 집에서 이천까지 일곱 지점',
      desc: '7문제 — 정지 상태 정답: 알람 2번(01·03). 05는 주행 중에만 잡힌다. 채움 없음' },

    /* 🛣️ **경충대로 넷 — 방향마다 짝이다** (기사님: *"아울렛갈때 가장 좋은거
       2세트하고, 복귀때 2셋트"* · *"잘되는거 하나 이슈있는거 하나"*).
       🔴 **가는 방향과 오는 방향은 다른 지점이다** — 왕복이 갈린 길이라 마주 보는 주유소가
          «가까운 같은 곳»이 아니다 (서이천 ↔ 바디프랜드: 직선 0.57km, 실제 2.9km). */
    { key: '이천행', title: '🔽 경충대로 이천행 ✅ — 남행 차선 네 콜',
      desc: '4문제 · 요금 20만 고정 · 승용차. 🔴 **「📍 내 위치 찍기」로 집(초월역)** ' +
            '(127.29991, 37.37338) · **도착 목표 «이천시»**. 남행 지점만 골라 한 줄에 얹었다 — ' +
            '전부 들러도 23.3km/40분/**톨 0원**(고속은 21.3km/26분/1,500원). ' +
            '④ 는 ③ 구간 **안에 포개지는 공짜 합짐**이다. ' +
            '🔴 ③④ 상차지는 집에서 18.0 · 16.5km 라 **반경 15km 밖** — 서 있으면 안 들어오고 ' +
            '**달려가면 들어온다.** 그 둘만 정답을 비워 뒀다',
    },
    { key: '이천행반대', title: '🔽 경충대로 이천행 🔴 — 상차지가 반대편 차선',
      desc: '4문제 · 같은 출발/목표. ①② 는 남행 정상 콜이고 **③④ 의 상차지가 북행 차선**이다. ' +
            '🔴 **좌표로는 흠잡을 데가 없다** — 상차 5.4 · 8.2km(반경 안), 하차도 이천 쪽 전진. ' +
            '그런데 들어가려면 **중앙분리대를 돌아야** 한다 (곤지암스타는 맞은편 곤지암IC 스벅과 직선 0.67km). ' +
            '**넷 다 통과하면 그것이 답이다 — 필터가 «차선»을 안 본다.** ③④ 정답은 비워 뒀다',
    },
    { key: '집복귀', title: '🔼 경충대로 복귀 ✅ — 북행 차선 네 콜',
      desc: '4문제 · 요금 20만 고정 · 승용차. 🔴 **「📍 내 위치 찍기」로 롯데프리미엄아울렛 이천점** ' +
            '(127.40048, 37.24236) · **도착 목표 «광주시»**. 이천행을 뒤집은 판으로 북행 지점만 쓴다 — ' +
            '전부 들러도 23.3km/45분/톨 0원. ④ 는 ③(동원옛날짜장→집) 안에 포개진다. ' +
            '🔴 ④ 상차지는 아울렛에서 15.9km 라 반경 밖 — 정답을 비워 뒀다',
    },
    { key: '집복귀반대', title: '🔼 경충대로 복귀 🔴 — 상차지가 반대편 차선',
      desc: '4문제 · 같은 출발/목표. ①② 는 북행 정상 콜이고 **③④ 의 상차지가 남행 차선**이다. ' +
            '상차 4.4 · 6.0km(반경 안)에 하차는 집 쪽 전진이라 **좌표로는 꿀콜**인데, ' +
            'SK 뉴마장은 **이천 방향 차선**이라 복귀 중엔 못 들어간다 (맞은편 마장주유소와 직선 1.56km). ' +
            '이천행 🔴 과 **같은 구멍을 반대 방향에서** 본다. ③④ 정답은 비워 뒀다',
    },
];

/**
 * 📚 **문제지 책** — 문제 · 설정 화면 목록 · 요구하는 서버 필터·설정 상태 · 별칭을 한 묶음으로.
 * 배차망마다 제 책을 쓴다(`nets.ts` 의 `presetBook`) — 요금 크기가 다른 배차망이 남의 문제지를 쓰면 채점이 헛것이 된다.
 * 🔴 이 파일은 배차망 이름을 모른다 — 어느 배차망이 어느 책을 쓰는지는 `nets.ts` 가 정한다.
 */
export interface PresetBook {
    problems: Record<string, PresetProblem[]>;
    menu: Array<{ key: string; title: string; desc: string }>;
    requires: Record<string, PresetRequires>;
    /** 못 찾았을 때 «쓸 수 있는 이름»으로 보인다 */
    keys: string[];
    aliases?: Record<string, string>;
}

/** 원 단위 요금 · 인성 콜 필터 기준으로 만든 지금 문제지 — 화물 배차망 둘이 함께 쓴다 */
export const SHARED_PRESET_BOOK: PresetBook = {
    problems: PRESETS, menu: PRESET_MENU, requires: PRESET_REQUIRES, keys: PRESET_KEYS, aliases: ALIASES,
};

/** 책에서 문제지를 찾는다 — 이름 · 별칭(대소문자 무시). 없으면 null (조용히 랜덤으로 돌지 않게 부르는 쪽이 멈춘다) */
export function getPresetFrom(book: PresetBook, name?: string | null): PresetProblem[] | null {
    if (!name) return null;
    return book.problems[name] ?? book.problems[book.aliases?.[name.toLowerCase()] ?? ''] ?? null;
}

export function getPreset(name?: string | null): PresetProblem[] | null {
    return getPresetFrom(SHARED_PRESET_BOOK, name);
}
