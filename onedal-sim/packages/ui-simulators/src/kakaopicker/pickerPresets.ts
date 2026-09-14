/**
 * 🎯 **픽커 문제지** (2026-09-14 · 카카오픽커_시뮬레이터.md §9-3 · 3단계 3-2)
 *
 * 인성·화물24시 문제지는 요금이 **원** 단위(5만·20만)고 정답이 인성 콜 필터 기준이라 픽커 화면에 못 쓴다.
 * 픽커 알람 판정은 축이 셋이다 (`KakaoPickerParser.decide`): ① 요금 ≥ 알람 하한 ② 픽업거리 ≤ 상차 반경 ③ 도착 구·동 ↔ 도착 목표.
 * 문제마다 한 축씩 시험한다. `expect` 는 **원달앱 픽커 알람이 울려야 하나(PASS) / 안 울려야 하나(BLOCK)** 다.
 *
 * 🔴 서버 값이 맞아야 채점이다 — 관제웹 «픽커 알람 최소 요금» **3,000** · 도착 목표 **«이천시»** (설정 화면 판 점검이 서버에 물어 대조한다).
 *    **기사님 서버의 지금 값에 맞췄다** (기사님 2026-09-14: *"문제지를 지금 값에 맞춘다"*) — 처음 계획(성남시 · 10,000)대로면 시험마다 기사님 필터를 바꿔야 했다.
 * 🔴 개인정보가 든 실물 11~32 의 주소를 옮기지 않는다 — 주소는 모의 데이터에서 찾는다 (§9-3).
 * ⏳ 6번(오더카드에 20,000P — 원달앱이 누르지 않는가)은 오더카드를 만드는 5단계에서 더한다.
 */
import type { PresetBook, PresetProblem } from '@altari/core-simulator';

/**
 * 📍 **도착지 둘** (모의 데이터에서 찾는다 — 지어낸 지점이 없다)
 * - «신둔면»(신둔농협하나로마트 예스파크점) — 픽커 줄임 표기는 «동»만 떼므로 **«신둔면» 그대로** 남아 도착 키워드와 바로 맞는다.
 *   도착 축을 흔들지 않으려고 1·2·3·5 에 쓴다
 * - «창전동»(이천농협 증포아리지점 ATM) — 화면에 **«이천 창전»** 으로 줄어, 키워드 «창전동» 과 부분 문자열로는 안 만나고 정규화로만 만난다 (4번)
 */
const SINDUN = '도자예술로 72';
const CHANGJEON = '이섭대천로 1276';

const PICKER_BASIC: PresetProblem[] = [
    {
        label: '1 ✖ 요금 · 2,900P — 알람 하한 바로 아래',
        pickupBand: 'near', dropoff: SINDUN, fare: 2900, expect: 'BLOCK',
        why: '알람 하한 3,000(관제웹 설정) 바로 아래 — 상차·도착은 통과하는 콜이라 요금 축만 걸린다',
    },
    {
        label: '2 ⭕ 요금 · 3,000P — 알람 하한과 같다',
        pickupBand: 'near', dropoff: SINDUN, fare: 3000, expect: 'PASS',
        why: '하한과 같으면 울린다 (`fare >= minFare`) — 1번과 요금만 다르다',
    },
    {
        label: '3 ✖ 상차 반경 밖 · 15,000P',
        pickupBand: 'far', dropoff: SINDUN, fare: 15000, expect: 'BLOCK',
        why: '상차가 반경 + 5km 밖 — 픽업거리 축에서 떨어진다',
    },
    {
        label: '4 ⭕ 도착 «창전» · 15,000P — 줄임 표기로만 맞는 도착지',
        pickupBand: 'near', dropoff: CHANGJEON, fare: 15000, expect: 'PASS',
        why: '화면은 «이천 창전», 도착 목표 키워드는 «창전동» — 부분 문자열로는 안 만나고 정규화로만 만난다 (0830 성남행 전부 탈락 사고와 같은 모양)',
    },
    {
        label: '5 ⭕ 예약 17:00 · 15,000P',
        pickupBand: 'near', dropoff: SINDUN, fare: 15000, expect: 'PASS',
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
            desc: '5문제 · P 단위. 🔴 **관제웹 «픽커 알람 최소 요금» 3,000** · **도착 목표 «이천시»**. ' +
                  '① 2,900 ✖ ② 3,000 ⭕ (하한 경계) · ③ 상차 반경 밖 ✖ · ④ 도착 «창전» ⭕ (줄임 표기) · ⑤ 예약 17:00 ⭕. ' +
                  '원달앱은 **울리고 상세까지만** 간다 — 「수락하기」는 기사님 손가락이다',
        },
    ],
    requires: {
        '픽커기본': { destinationCity: '이천시', alarmMinFare: 3000 },
    },
    keys: Object.keys(PROBLEMS),
    aliases: { picker: '픽커기본' },
};
