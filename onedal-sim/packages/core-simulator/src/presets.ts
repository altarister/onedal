/**
 * 🎯 **문제지 — 정해진 콜을 순서대로 흘린다** (기사님 요청 2026-08-22)
 *
 * 시뮬레이터는 콜을 랜덤으로 만든다. 그래서 *"인천 남동구행 콜이 뜨면 앱이 거르는가"* 같은
 * **특정 조건을 시험하려면 복권을 긁어야 했다.** 문제지는 그 조건을 바로 세운다 —
 * 리허설 13~16(고수 4콜)과 같은 생각이다: **재현 가능한 문제로 채점한다.**
 *
 * 쓰는 법:  http://<PC IP>:5173/inseong/dispatch?preset=오탐
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
     * 📍 **주소 대신 «거리 띠»로 낸다 — 어디서 돌리든 같은 정답** (기사님 확정 2026-08-31).
     *
     * 주소를 박아 두면 그 동네에서만 참인 문제가 된다. 2026-08-23 구로 필드테스트가 증거다 —
     * 상차지 «경안동»이 실제로는 33.5km 뒤였는데 시뮬이 고정 좌표에서 0.2km 로 재 보내
     * **먼 콜이 필터를 통과**했다. 띠로 내면 서울이든 부산이든 같은 축을 시험한다.
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
     * 무대 재현용(리허설 이식분)은 결과가 그날 필터 상태에 달렸으므로 비워 둔다.
     */
    expect?: 'BLOCK' | 'PASS';
    /**
     * 🧱 **시간을 만드는 채움 콜** — 개수를 줄여도 시나리오가 안 깨지는 문제 (2026-08-26).
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
    why: string;
}

/**
 * 광주시 "남동" — 모의 데이터에 없어서 문제지가 직접 세운다.
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

export const PRESETS: Record<string, PresetProblem[]> = {
    /**
     * 📍 **축 문제지 — 어디서 돌려도 정답이 같다** (기사님 확정 2026-08-31).
     *
     * 기사님: *"내가 서울 나들이 갈 때마다 테스트할 건데, 그때마다 문제의 지역과 내
     * 현위치의 거리를 환산해야 문제가 정확해질 듯해."*
     *
     * 주소를 박은 문제지는 **그 동네에서만** 참이다. 2026-08-23 구로 필드테스트가 그
     * 증거다 — 상차지 «경안동»이 실제로는 33.5km 뒤였는데, 시뮬이 고정 좌표에서 0.2km 로
     * 재 보내 **먼 콜이 필터를 통과**했다. 앱은 잘못한 게 없다. 문제지가 거짓말을 했다.
     *
     * 여기서는 주소 대신 **거리 띠**로 낸다 — 출제 순간 현위치에서 그 거리의 실제 주소를
     * 고른다. 그래서 서울이든 부산이든 **같은 축을 시험하고 정답이 안 바뀐다.**
     *
     * 🔴 **주행 코스 문제지(칠지점·초월이천)와 섞지 않는다.** 그쪽은 GPS·경로·도착 감지를
     *    보는 판이라 **실측 좌표가 고정이어야** 한다 (`pnpm drive` 와 같은 지점).
     *    이 문제지는 **콜 필터가 맞게 거르나**만 본다 (버그 대장 #29~35 — 둘을 섞으면 하루가 간다).
     *
     * ⚠️ **도착지 축은 여기 없다.** 그 축의 정답은 기사님이 설정한 도착목표에 달렸는데
     *    시뮬은 그 목록을 모른다 — 모르는 것으로 정답을 만들지 않는다 (규칙 ④).
     */
    '축': [
        {
            label: '① 상차 반경 밖 — 걸러야 한다',
            pickupBand: 'far', dropoffBand: 'near',
            fare: 60000, vehicleType: '1t',
            expect: 'BLOCK',
            why: '상차 반경 축 — 설정+5km 밖이다. 구로 사고(0831 확인)가 이 축을 뚫고 지나갔다',
        },
        {
            label: '② 상차 반경 안 — 올려야 한다',
            pickupBand: 'near', dropoffBand: 'near',
            fare: 60000, vehicleType: '1t',
            expect: 'PASS',
            why: '반경 안의 평범한 콜 — 문제지가 필터를 통째로 막지 않았음을 확인한다',
        },
        {
            label: '③ 차종 5t — 걸러야 한다',
            pickupBand: 'near', dropoffBand: 'near',
            fare: 150000, vehicleType: '5t',
            expect: 'BLOCK',
            why: '차종 축 — 내 차로 못 싣는다. 거리·요금은 통과할 값으로 둬 축을 하나만 시험한다',
        },
        {
            label: '④ 요금 미달 — 걸러야 한다',
            pickupBand: 'near', dropoffBand: 'far',
            fare: 5000, vehicleType: '1t',
            expect: 'BLOCK',
            why: '요금/단가 축 — 배송거리는 먼데 요금이 5천원이다 (단가식 미달)',
        },
        {
            label: '⑤ 먼 배송 · 제값 — 올려야 한다',
            pickupBand: 'near', dropoffBand: 'far',
            fare: 120000, vehicleType: '1t',
            expect: 'PASS',
            why: '④와 같은 거리인데 요금만 제값 — 걸린 것이 «거리»가 아니라 «단가»였음을 가른다',
        },
        {
            label: '⑥ 반경 밖 + 제값 — 그래도 걸러야 한다',
            pickupBand: 'far', dropoffBand: 'near',
            fare: 200000, vehicleType: '1t',
            expect: 'BLOCK',
            why: '돈이 좋아도 상차 반경은 안 뚫린다 — 축끼리 서로를 덮지 않는지 본다',
        },
    ],

    /**
     * 🗺️ **오탐 문제지** — 2026-08-22 실사고의 재현 (버그 대장 · 사전 확장 매칭 ④).
     * 복귀행(집=광주) 키워드 "남동"이 "인천 **남동**구"에 부분 일치해 인천행이 통과했다.
     * 1번을 거르고 2번을 올려야 통과다 — 한쪽만 되면 반쪽짜리 수리다.
     */
    '오탐': [
        {
            label: '① 인천 남동구 — 걸러야 한다',
            pickup: '경안동', dropoff: '남동구',
            fare: 83000, vehicleType: '1t',
            expect: 'BLOCK',
            why: '키워드 "남동"의 부분 문자열일 뿐 — 집(광주) 방향이 아니다. 06:36 실사고',
        },
        {
            label: '② 광주 남동 — 올려야 한다',
            pickup: '경안동', dropoff: '남동 물류창고',
            dropoffFallback: GWANGJU_NAMDONG,
            fare: 45000, vehicleType: '1t',
            expect: 'PASS',
            why: '진짜 그 동이다 — 오탐을 막느라 이걸 놓치면 미탐(더 아픈 실패)',
        },
        {
            label: '③ 부천 중동 — 걸러야 한다',
            pickup: '경안동', dropoff: '중동 길주로',
            fare: 70000, vehicleType: '1t',
            expect: 'BLOCK',
            why: '"중동"도 광주 인근에 있는 동명 — 같은 함정의 다른 낱말',
        },
        {
            label: '④ 광주 초월읍 — 올려야 한다',
            pickup: '경안동', dropoff: '초월읍',
            fare: 52000, vehicleType: '1t',
            expect: 'PASS',
            why: '집 방향의 평범한 콜 — 문제지가 필터를 통째로 막지 않았음을 확인한다',
        },
    ],
    /**
     * 🚚 **7지점 한 바퀴** — 기사님이 뽑아 주신 7개 지점 그대로 (기사님 지시 2026-08-30).
     *
     *   집 ─2.2─ 모다 ─3.7─ 성당 ─6.2─ 신둔 ─2.2─ 이조 ─1.6─ 제일 ─1.8─ 터미널  (17.6km)
     *
     * `pnpm drive` 검사와 같은 코스·같은 좌표(카카오 실측, drive.mjs)다 — 화면으로 도는 판.
     * 7문제뿐이라 45초 간격이면 **5분 15초에 끝난다.** 채움 문제는 없다 (기사님: 불필요한 문제 삭제).
     *
     * 정답: **알람(통과) 3번 — 01·03·05.** 나머지 넷은 조용해야 맞는다.
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
            why: '앱의 요금 축은 단가식(9.8km×616=6,036원 하한)이다 — min_fare 2만은 보류 칸(용어집 §11). 5천 원이라야 진짜로 걸린다 (8천이던 1판에서 통과해 배웠다 · 2026-08-30)',
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

    /**
     * 🚗 **초월(집) → 이천 롯데아울렛 — 내일 실주행 문제지** (기사님 확정 2026-08-25)
     *
     * 기사님이 **직접 찍으신 일곱 곳**으로 짰다. 카카오로 전부 확인했고 경로도 성립한다:
     *
     *     갈 때  집 → 모다아울렛 곤지암 → 곤지암성당 → 동원대 → 인삼농협 이천 → 예스파크 → 롯데아울렛
     *            **29.8km · 51분 · 6구간**
     *     올 때  아울렛 → 집   **21.3km · 23분**
     *
     * 기사님 계획: *"첫 콜을 출발 전 차에서 잡고 합짐 하나 잡고 출발해서 가는 길에 하나,
     * 갈 때 3개 · 올 때 3개. 중간중간 못 잡는 콜과 이유를 일부러 만들어 달라."*
     *
     * ── 필터 값 (2026-08-25 확정 · 경로 숫자에서 나왔다) ──
     * ```
     * 첫짐    도착목표 이천시 · 상차 15km · 하차 0     (이천 전역 25개면 충분하다)
     * 합짐    (상속)            · 우회 3km  · 하차 1   (0~1km 면 후보가 6~7개뿐이다)
     * 주행중  (상속)            · 우회 1km  · 하차 3   (달리는 중엔 좁히되 0은 빡빡하다)
     * 복귀    광주시(집)        · 우회 3km  · 하차 3   (10km 면 서울·용인까지 들어온다)
     * ```
     *
     * ── 집에서의 거리 (첫짐 상차 15km 판정의 근거) ──
     * ```
     * 모다아울렛   2.2km    곤지암성당  5.9km    동원대   11.0km
     * 예스파크    12.2km    인삼농협   13.2km    아울렛   17.6km
     * ```
     *
     * ── 🔴 **주소는 기사님이 찍어 주신 일곱 곳뿐이다** (2026-08-26 개정) ──
     *
     * 기사님: *"중간중간 **지금 가지고 있는 주소들을 조합해서** 못 잡는 콜과 이유 등을
     * 일부러 만들어 테스트 데이터로 만들어 주면 좋을 듯해."*
     *
     * 첫 판(08-26 새벽)에는 그 말을 어기고 **용인 양지 · 여주 가남 · 파주 월롱** 셋을
     * 말없이 끼워 넣었다. 그리고 그중 용인 양지가 잡히면서 **지도의 경로가 이천에서
     * 용인으로 25km 되돌아갔다** — 기사님이 *"경로가 이거 맞아?"* 로 발견하셨다.
     *
     * 🔴 **셋 다 필요 없었다.** 축은 거리와 국면으로 만들어진다:
     *   · 상차 반경 축 → **아울렛(17.6km)을 상차지로** 쓰면 15km 밖이다. 용인(16.5km)보다 멀다
     *   · 도착지 축   → **하차를 곤지암읍**으로 두면 이천시가 아니다. 여주까지 갈 이유가 없다
     *   · 복귀 축     → 복귀는 이번 판에서 뺐다 (기사님: *"올 때는 문제 새로 만들자"*)
     *
     * ── 🔴 순서가 시나리오다 — 못 잡는 콜이 **먼저**다 ──
     *
     * ①②③④(못 잡는 콜) → ⑤⑥(집에서 두 콜) → 출발 → ⑦⑧(달리는 중).
     *
     * ⚠️ **①을 잡는 순간 합짐 국면이 되고, 합짐은 상차 반경을 규칙대로 건너뛴다**
     *    (합짐무시). 그래서 «첫짐 전용 축»을 뒤에 두면 **영원히 시험할 수 없다** —
     *    08-26 새벽에 정확히 그래서 상차 반경 문제가 통과해 버렸다.
     */

    /**
     * 🚗 **초월(집) → 이천 롯데아울렛 · 갈 때** (기사님 설계 2026-08-26)
     *
     * 기사님: *"5·6번 사이에 못 통과하는 콜을 3개 넣어 두면 될 것 같고, 6·7번 사이는
     * 20개 정도 넣어 두면 되고, 6번 콜을 잡으면 «출발하세요» 하면 되는 거 아냐?
     * 그럼 간격을 따로 조작하는 것이 필요 없어지는 거잖아."*
     *
     * 🔴 **시간은 «못 잡는 콜»로 만든다.** 처음엔 간격 슬라이더로 벌리려 했는데 틀렸다 —
     *    간격을 늘리면 **첫 콜까지 2분을 기다려야** 하고, 잡는 콜이 붙어 있으면 그 30초
     *    안에 두 번을 결재해야 한다. 사이를 못 잡는 콜로 채우면 **간격 하나로 다 풀린다.**
     *
     * ── 짜임새 ──
     * ```
     * 01 02      ✖ 첫짐 국면 전용 두 축 (상차 반경 · 도착지)
     * 03         ⭕ 첫짐          ← 여기서 경로가 정해진다
     * 04 05 06   ✖ 판단할 시간 셋
     * 07         ⭕ 합짐 → 🚗 출발
     * ·· 채움 N  ✖ 달리는 동안 (슬라이더로 0~20개)
     * 08         ⭕ 주행 중 합짐
     * 09         ✖ 역주행
     * ```
     *
     * 🔴 **채움에는 번호를 안 붙인다** (기사님 실측 2026-08-26).
     *    예전엔 29문제에 01~29 를 통째로 매겼다. 그런데 채움을 5개로 줄이면 실제로는
     *    14개가 흐르는데 라벨은 `28`·`29` 그대로라 *"28번이 왜 열세 번째로 오지"* 가 됐다.
     *    기사님: *"내가 아까 채움콜 수를 5로 했었나 봐. 그래서 너가 28개라 한 것이… 좀 이상해서."*
     *    **번호는 «잡아야 하는 콜»의 순서다.** 채움은 시간을 만드는 배경이라 번호가 없다.
     *
     * ⚠️ **01·02 는 03 보다 앞이어야 한다.** 첫짐을 잡는 순간 합짐 국면이 되고, 합짐은
     *    상차 반경을 규칙대로 건너뛴다(합짐무시) → 그 축을 영영 못 본다. 2026-08-26
     *    새벽에 정확히 그래서 상차 반경 문제가 통과해 버렸다.
     * ⚠️ 채움 콜의 **요금을 조금씩 달리했다** — 똑같은 콜은 앱의 «이미 본 콜» 지문에 걸려
     *    판정 자체를 건너뛴다. 그러면 시간만 흐르고 채점이 안 된다.
     * ⚠️ 29 를 **승용차(5박스)** 로 둔 이유: 28 까지 잡으면 적재가 90/100 이라 다마스는
     *    «자리 없음»에도 걸려 축이 둘이 된다. 오직 역주행으로만 떨어지게 한다.
     *
     * 주소는 **기사님이 찍어 주신 일곱 곳뿐이다** — 목록 밖 주소를 끼워 넣지 않는다.
     */
    '초월이천': [
        {
            label: '01 ✖ 상차 반경 · 아울렛 → 인삼농협',
            pickup: '프리미엄아울렛로 177-74', dropoff: '둔터로124번길 160',
            fare: 60000, vehicleType: '다마스', expect: 'BLOCK',
            why: '하차 신둔면은 이천이라 통과하는데 **상차지가 집에서 17.6km** — 첫짐 반경 15km 밖. 상차지 축 하나로 떨어진다',
        },
        {
            label: '02 ✖ 도착지 · 모다아울렛 → 곤지암성당',
            pickup: '경충대로 907', dropoff: '경충대로543번길 19',
            fare: 30000, vehicleType: '다마스', expect: 'BLOCK',
            why: '상차 2.2km 통과 · **앞으로 가는 방향**이라 역주행도 아니다. **하차 곤지암읍이 이천시가 아니다**',
        },
        {
            label: '03 ⭕ 첫짐 · 모다아울렛 → 롯데아울렛 · 30박스',
            pickup: '경충대로 907', dropoff: '프리미엄아울렛로 177-74',
            fare: 62000, vehicleType: '다마스', expect: 'PASS',
            why: '🔵 **KEEP 하세요.** 이 콜이 경로를 정합니다 — 상차 2.2km · 하차 이천. 누적 30박스',
        },
        {
            label: '04 ✖ 차종 · 모다아울렛 → 롯데아울렛 · 5t',
            pickup: '경충대로 907', dropoff: '프리미엄아울렛로 177-74',
            fare: 210000, vehicleType: '5t', expect: 'BLOCK',
            why: '03과 **똑같은 구간** — 오직 **차종**으로 떨어져야 한다 (1t 차에 5t 짐은 못 싣는다)',
        },
        {
            label: '05 ✖ 요금 · 모다아울렛 → 롯데아울렛 · 6천원',
            pickup: '경충대로 907', dropoff: '프리미엄아울렛로 177-74',
            fare: 6000, vehicleType: '다마스', expect: 'BLOCK',
            why: '03과 똑같은 구간인데 요금만 6천원 — 오직 **요금/단가**로 떨어진다',
        },
        {
            label: '06 ✖ 차종 · 곤지암성당 → 예스파크 · 11t',
            pickup: '경충대로543번길 19', dropoff: '도자예술로 72',
            fare: 300000, vehicleType: '11t', expect: 'BLOCK',
            why: '경로 위인데 **11t** 이다. 차종 축 — 큰 톤수가 열리지 않는지 한 번 더 본다',
        },
        {
            label: '07 ⭕ 합짐 · 곤지암성당 → 인삼농협 · 30박스',
            pickup: '경충대로543번길 19', dropoff: '둔터로124번길 160',
            fare: 45000, vehicleType: '다마스', expect: 'PASS',
            why: '🔵 **KEEP 하고 🚗 출발하세요.** 상차 곤지암읍·하차 신둔면 둘 다 경로 위. 누적 60박스',
        },        {
            label: '·· 채움 1 — ✖ 요금 · 모다아울렛 → 롯데아울렛 · 7천원',
            pickup: '경충대로 907', dropoff: '프리미엄아울렛로 177-74',
            fare: 7000, vehicleType: '다마스', expect: 'BLOCK', filler: true,
            why: '경로 위 · 차종도 자리도 되는데 **15.5km 하한 8,587원**에 못 미친다 — 요금 축 하나',
        },
        {
            label: '·· 채움 2 — ✖ 요금 · 곤지암성당 → 롯데아울렛 · 5천원',
            pickup: '경충대로543번길 19', dropoff: '프리미엄아울렛로 177-74',
            fare: 5000, vehicleType: '다마스', expect: 'BLOCK', filler: true,
            why: '경로 위 · 차종도 자리도 되는데 **12.4km 하한 6,869원**에 못 미친다 — 요금 축 하나',
        },
        {
            label: '·· 채움 3 — ✖ 차종 · 동원대 → 인삼농협 · 5t',
            pickup: '경충대로 26', dropoff: '둔터로124번길 160',
            fare: 152000, vehicleType: '5t', expect: 'BLOCK', filler: true,
            why: '경로 위 · 요금도 좋다 — **5t 라서** 떨어진다 (3.3km 는 짧아 요금으론 못 막는다)',
        },
        {
            label: '·· 채움 4 — ✖ 요금 · 모다아울렛 → 인삼농협 · 4천원',
            pickup: '경충대로 907', dropoff: '둔터로124번길 160',
            fare: 4000, vehicleType: '다마스', expect: 'BLOCK', filler: true,
            why: '경로 위 · 차종도 자리도 되는데 **11.0km 하한 6,094원**에 못 미친다 — 요금 축 하나',
        },
        {
            label: '·· 채움 5 — ✖ 요금 · 모다아울렛 → 예스파크 · 4천원',
            pickup: '경충대로 907', dropoff: '도자예술로 72',
            fare: 4000, vehicleType: '다마스', expect: 'BLOCK', filler: true,
            why: '경로 위 · 차종도 자리도 되는데 **10.0km 하한 5,540원**에 못 미친다 — 요금 축 하나',
        },
        {
            label: '·· 채움 6 — ✖ 차종 · 곤지암성당 → 롯데아울렛 · 11t',
            pickup: '경충대로543번길 19', dropoff: '프리미엄아울렛로 177-74',
            fare: 155000, vehicleType: '11t', expect: 'BLOCK', filler: true,
            why: '경로 위 · 요금도 좋다 — **11t 라서** 떨어진다 (12.4km 는 짧아 요금으론 못 막는다)',
        },
        {
            label: '·· 채움 7 — ✖ 요금 · 동원대 → 롯데아울렛 · 3천원',
            pickup: '경충대로 26', dropoff: '프리미엄아울렛로 177-74',
            fare: 3000, vehicleType: '다마스', expect: 'BLOCK', filler: true,
            why: '경로 위 · 차종도 자리도 되는데 **9.6km 하한 5,318원**에 못 미친다 — 요금 축 하나',
        },
        {
            label: '·· 채움 8 — ✖ 요금 · 곤지암성당 → 인삼농협 · 2천원',
            pickup: '경충대로543번길 19', dropoff: '둔터로124번길 160',
            fare: 2000, vehicleType: '다마스', expect: 'BLOCK', filler: true,
            why: '경로 위 · 차종도 자리도 되는데 **7.3km 하한 4,044원**에 못 미친다 — 요금 축 하나',
        },
        {
            label: '·· 채움 9 — ✖ 차종 · 동원대 → 예스파크 · 25t',
            pickup: '경충대로 26', dropoff: '도자예술로 72',
            fare: 158000, vehicleType: '25t', expect: 'BLOCK', filler: true,
            why: '경로 위 · 요금도 좋다 — **25t 라서** 떨어진다 (4.4km 는 짧아 요금으론 못 막는다)',
        },
        {
            label: '·· 채움 10 — ✖ 요금 · 곤지암성당 → 예스파크 · 2천원',
            pickup: '경충대로543번길 19', dropoff: '도자예술로 72',
            fare: 2000, vehicleType: '다마스', expect: 'BLOCK', filler: true,
            why: '경로 위 · 차종도 자리도 되는데 **6.7km 하한 3,711원**에 못 미친다 — 요금 축 하나',
        },
        {
            label: '·· 채움 11 — ✖ 요금 · 모다아울렛 → 롯데아울렛 · 4천원',
            pickup: '경충대로 907', dropoff: '프리미엄아울렛로 177-74',
            fare: 4000, vehicleType: '다마스', expect: 'BLOCK', filler: true,
            why: '경로 위 · 차종도 자리도 되는데 **15.5km 하한 8,587원**에 못 미친다 — 요금 축 하나',
        },
        {
            label: '·· 채움 12 — ✖ 차종 · 모다아울렛 → 예스파크 · 3.5t',
            pickup: '경충대로 907', dropoff: '도자예술로 72',
            fare: 161000, vehicleType: '3.5t', expect: 'BLOCK', filler: true,
            why: '경로 위 · 요금도 좋다 — **3.5t 라서** 떨어진다 (10.0km 는 짧아 요금으론 못 막는다)',
        },
        {
            label: '·· 채움 13 — ✖ 요금 · 곤지암성당 → 롯데아울렛 · 4천원',
            pickup: '경충대로543번길 19', dropoff: '프리미엄아울렛로 177-74',
            fare: 4000, vehicleType: '다마스', expect: 'BLOCK', filler: true,
            why: '경로 위 · 차종도 자리도 되는데 **12.4km 하한 6,869원**에 못 미친다 — 요금 축 하나',
        },
        {
            label: '·· 채움 14 — ✖ 요금 · 모다아울렛 → 인삼농협 · 3천원',
            pickup: '경충대로 907', dropoff: '둔터로124번길 160',
            fare: 3000, vehicleType: '다마스', expect: 'BLOCK', filler: true,
            why: '경로 위 · 차종도 자리도 되는데 **11.0km 하한 6,094원**에 못 미친다 — 요금 축 하나',
        },
        {
            label: '·· 채움 15 — ✖ 차종 · 동원대 → 인삼농협 · 11t',
            pickup: '경충대로 26', dropoff: '둔터로124번길 160',
            fare: 164000, vehicleType: '11t', expect: 'BLOCK', filler: true,
            why: '경로 위 · 요금도 좋다 — **11t 라서** 떨어진다 (3.3km 는 짧아 요금으론 못 막는다)',
        },
        {
            label: '·· 채움 16 — ✖ 요금 · 모다아울렛 → 예스파크 · 3천원',
            pickup: '경충대로 907', dropoff: '도자예술로 72',
            fare: 3000, vehicleType: '다마스', expect: 'BLOCK', filler: true,
            why: '경로 위 · 차종도 자리도 되는데 **10.0km 하한 5,540원**에 못 미친다 — 요금 축 하나',
        },
        {
            label: '·· 채움 17 — ✖ 요금 · 동원대 → 롯데아울렛 · 2천원',
            pickup: '경충대로 26', dropoff: '프리미엄아울렛로 177-74',
            fare: 2000, vehicleType: '다마스', expect: 'BLOCK', filler: true,
            why: '경로 위 · 차종도 자리도 되는데 **9.6km 하한 5,318원**에 못 미친다 — 요금 축 하나',
        },
        {
            label: '·· 채움 18 — ✖ 차종 · 곤지암성당 → 예스파크 · 5t',
            pickup: '경충대로543번길 19', dropoff: '도자예술로 72',
            fare: 167000, vehicleType: '5t', expect: 'BLOCK', filler: true,
            why: '경로 위 · 요금도 좋다 — **5t 라서** 떨어진다 (6.7km 는 짧아 요금으론 못 막는다)',
        },
        {
            label: '·· 채움 19 — ✖ 요금 · 모다아울렛 → 롯데아울렛 · 5천원',
            pickup: '경충대로 907', dropoff: '프리미엄아울렛로 177-74',
            fare: 5000, vehicleType: '다마스', expect: 'BLOCK', filler: true,
            why: '경로 위 · 차종도 자리도 되는데 **15.5km 하한 8,587원**에 못 미친다 — 요금 축 하나',
        },
        {
            label: '·· 채움 20 — ✖ 요금 · 곤지암성당 → 롯데아울렛 · 3천원',
            pickup: '경충대로543번길 19', dropoff: '프리미엄아울렛로 177-74',
            fare: 3000, vehicleType: '다마스', expect: 'BLOCK', filler: true,
            why: '경로 위 · 차종도 자리도 되는데 **12.4km 하한 6,869원**에 못 미친다 — 요금 축 하나',
        },

        {
            label: '08 ⭕ 주행 중 합짐 · 동원대 → 예스파크 · 30박스',
            pickup: '경충대로 26', dropoff: '도자예술로 72',
            fare: 38000, vehicleType: '다마스', expect: 'PASS',
            why: '🔵 **정차했을 때 KEEP.** 상차 곤지암읍·하차 신둔면 둘 다 주행중 우회 1km 안. 누적 90박스',
        },
        {
            label: '09 ✖ 역주행 · 예스파크 → 모다아울렛 · 승용차',
            pickup: '도자예술로 72', dropoff: '경충대로 907',
            fare: 52000, vehicleType: '승용차', expect: 'BLOCK',
            why: '🔴 **뒤로 가는 콜.** 상차 진행도 > 하차 진행도 → 역주행 축이 잡는다. 자리(10박스)는 남으므로 **오직 역주행**으로만 떨어져야 한다',
        },
    ],

};

/** 문제 하나를 생성기가 먹을 수 있는 강제 쌍으로 — 주소를 못 찾으면 null (지어내지 않는다) */
export function toForcedPair(p: PresetProblem, ctx?: RelativeContext): ForcedPair | null {
    const pickup = p.pickupBand
        ? pickByBand(p.pickupBand, ctx, `${p.label} 상차`)
        : (findMockEntry(p.pickup ?? '') ?? p.pickupFallback);
    const dropoff = p.dropoffBand
        ? pickByBand(p.dropoffBand, ctx, `${p.label} 하차`, pickup)
        : (findMockEntry(p.dropoff ?? '') ?? p.dropoffFallback);
    if (!pickup || !dropoff) {
        console.warn(`🎯 [문제지] "${p.label}" 의 주소를 모의 데이터에서 못 찾았습니다 — 건너뜁니다`);
        return null;
    }
    return { pickup, dropoff, fare: p.fare, vehicleType: p.vehicleType };
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
    // 경계에 가까운 다섯 중 하나 — 매 판 같은 곳만 나오지 않게
    const slice = pool.slice(0, Math.min(5, pool.length));
    const chosen = slice[Math.floor(Math.random() * slice.length)];
    console.log(`🎯 [문제지] ${what} — 현위치에서 ${chosen.d.toFixed(1)}km (${band}) · ${chosen.m.addressDetail}`);
    return chosen.m;
}

/** 폰에서 URL 을 손으로 칠 때 한글이 번거롭다 — 영문 별칭도 받는다 */
const ALIASES: Record<string, string> = {
    ohtam: '오탐', mismatch: '오탐',
    axis: '축', axes: '축',
    seven: '칠지점', '7': '칠지점',
};

/**
 * 🎯 **설정 화면에 보여 줄 문제지 목록** — 시나리오콜 탭이 이걸 나열한다.
 * 여기 없는 것은 URL 로만 들어간다 (`?preset=…`).
 */
export const PRESET_MENU: Array<{ key: string; title: string; desc: string }> = [
    { key: '칠지점', title: '🚚 7지점 한 바퀴 · 집→모다→성당→신둔→이조→제일→터미널',
      desc: '7문제 — 정지 상태 정답: 알람 2번(01·03). 05는 주행 중에만 잡힌다. 채움 없음' },
    { key: '초월이천', title: '🚗 초월(집) → 이천 롯데아울렛 · 갈 때 (2026-08-26)',
      desc: '29문제 · 잡는 콜 3(03 첫짐 · 07 합짐→출발 · 28 주행중) · 나머지 26은 막혀야 한다. 간격 하나로 끝 — 사이는 못 잡는 콜이 채운다' },
    { key: '축', title: '📍 축 문제지 · 어디서든 (현위치 기준 · 서울 나들이용)',
      desc: '6문제 — 상차반경 2 · 차종 1 · 요금/단가 2 · 축 간섭 1. 주소가 아니라 «거리 띠»라 어디서 돌려도 정답이 같다. 정답: 올려야 하는 것 ②⑤ 둘뿐' },
    { key: '오탐', title: '오탐 확인용',
      desc: '걸러져야 하는 것만 모았다' },
];

export function getPreset(name?: string | null): PresetProblem[] | null {
    if (!name) return null;
    return PRESETS[name] ?? PRESETS[ALIASES[name.toLowerCase()] ?? ''] ?? null;
}
