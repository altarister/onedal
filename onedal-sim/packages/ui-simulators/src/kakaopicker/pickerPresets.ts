/**
 * 🎯 **픽커 문제지** (2026-09-14 · 카카오픽커_시뮬레이터.md §9-3 · 3단계 3-2)
 *
 * 인성·화물24시 문제지는 요금이 **원** 단위(5만·20만)고 정답이 인성 콜 필터 기준이라 픽커 화면에 못 쓴다.
 * 픽커 알람 판정은 축이 셋이다 (`KakaoPickerParser.decide`): ① 요금 ≥ 알람 하한 ② 픽업거리 ≤ 상차 반경 ③ 도착 구·동 ↔ 도착 목표.
 * 문제마다 한 축씩 시험한다. `expect` 는 **원달앱 픽커 알람이 울려야 하나(PASS) / 안 울려야 하나(BLOCK)** 다.
 *
 * 🔴 판 상태가 맞아야 채점이다 — 관제웹 «픽커 알람 최소 요금» **10,000** · 도착 목표 **«성남시»** (설정 화면 판 점검이 서버에 물어 대조한다).
 * 🔴 개인정보가 든 실물 11~32 의 주소를 옮기지 않는다 — 주소는 모의 데이터에서 찾는다 (§9-3).
 * ⏳ 6번(오더카드에 20,000P — 원달앱이 누르지 않는가)은 오더카드를 만드는 5단계에서 더한다.
 */
import type { MockEntry, PresetBook, PresetProblem } from '@altari/core-simulator';

/**
 * 📍 **«정자3동» 지점** — 모의 데이터에는 «정자동»만 있다. 4번 문제는 화면의 줄임 표기 «정자3» 이 도착 목표 «정자동» 과
 * 정규화로만 만나는지를 시험하므로 동 이름이 «정자3동» 이어야 한다.
 * ⚠️ 좌표는 모의 데이터 «성남정자동우체국»(정자일로198번길 6 · 127.10642, 37.36771)을 빌린 **근사값**이다 —
 *    채점 대상은 이름 대조라 좌표 정확도는 결과를 바꾸지 않는다.
 */
const JEONGJA3_DONG: MockEntry = {
    customerName: '정자3동 시험 지점',
    region: '정자3동',
    addressDetail: '경기 성남시 분당구 정자일로198번길 6 정자3동 시험 지점',
    lon: 127.10642,
    lat: 37.36771,
};

const PICKER_BASIC: PresetProblem[] = [
    {
        label: '1 ✖ 요금 · 9,900P — 알람 하한 바로 아래',
        pickupBand: 'near', dropoff: '정자일로 95', fare: 9900, expect: 'BLOCK',
        why: '알람 하한 1만(관제웹 설정) 바로 아래 — 상차·도착은 통과하는 콜이라 요금 축만 걸린다',
    },
    {
        label: '2 ⭕ 요금 · 10,000P — 알람 하한과 같다',
        pickupBand: 'near', dropoff: '정자일로 95', fare: 10000, expect: 'PASS',
        why: '하한과 같으면 울린다 (`fare >= minFare`) — 1번과 요금만 다르다',
    },
    {
        label: '3 ✖ 상차 반경 밖 · 15,000P',
        pickupBand: 'far', dropoff: '판교역로 235', fare: 15000, expect: 'BLOCK',
        why: '상차가 반경 + 5km 밖 — 픽업거리 축에서 떨어진다',
    },
    {
        label: '4 ⭕ 도착 «정자3» · 15,000P — 줄임 표기로만 맞는 도착지',
        pickupBand: 'near', dropoffFallback: JEONGJA3_DONG, fare: 15000, expect: 'PASS',
        why: '화면은 «분당 정자3», 도착 목표 키워드는 «정자동» — 부분 문자열로는 안 만나고 정규화로만 만난다 (0830 성남행 전부 탈락 사고)',
    },
    {
        label: '5 ⭕ 예약 17:00 · 15,000P',
        pickupBand: 'near', dropoff: '판교역로 235', fare: 15000, expect: 'PASS',
        netFields: { reservedAt: '17:00' },
        why: '예약 콜도 울린다 (기사님 확정 08-30 — 미리 확보할 가치가 있다)',
    },
];

const PROBLEMS: Record<string, PresetProblem[]> = {
    '픽커기본': PICKER_BASIC,
};

export const PICKER_PRESET_BOOK: PresetBook = {
    problems: PROBLEMS,
    menu: [
        {
            key: '픽커기본',
            title: '🔔 픽커 알람 — 요금 하한 · 상차 반경 · 도착지',
            desc: '5문제 · P 단위. 🔴 **관제웹 «픽커 알람 최소 요금» 10,000** · **도착 목표 «성남시»**. ' +
                  '① 9,900 ✖ ② 10,000 ⭕ (하한 경계) · ③ 상차 반경 밖 ✖ · ④ 도착 «정자3» ⭕ (줄임 표기) · ⑤ 예약 17:00 ⭕. ' +
                  '원달앱은 **울리고 상세까지만** 간다 — 「수락하기」는 기사님 손가락이다',
        },
    ],
    requires: {
        '픽커기본': { destinationCity: '성남시', alarmMinFare: 10000 },
    },
    keys: Object.keys(PROBLEMS),
    aliases: { picker: '픽커기본' },
};
