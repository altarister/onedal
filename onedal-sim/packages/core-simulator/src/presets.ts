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
import { findMockEntry, type MockEntry, type ForcedPair } from './generator';

export interface PresetProblem {
    label: string;
    /** 상차·하차 주소 조각 — 모의 데이터(mockLocationData)에서 찾는다 */
    pickup: string;
    dropoff: string;
    /** 모의 데이터에 없는 곳은 여기에 직접 (좌표는 근사임을 이름에 적는다) */
    dropoffFallback?: MockEntry;
    fare?: number;
    vehicleType?: string;
    expect: 'BLOCK' | 'PASS';
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
};

/** 문제 하나를 생성기가 먹을 수 있는 강제 쌍으로 — 주소를 못 찾으면 null (지어내지 않는다) */
export function toForcedPair(p: PresetProblem): ForcedPair | null {
    const pickup = findMockEntry(p.pickup);
    const dropoff = findMockEntry(p.dropoff) ?? p.dropoffFallback;
    if (!pickup || !dropoff) {
        console.warn(`🎯 [문제지] "${p.label}" 의 주소를 모의 데이터에서 못 찾았습니다 — 건너뜁니다`);
        return null;
    }
    return { pickup, dropoff, fare: p.fare, vehicleType: p.vehicleType };
}

export function getPreset(name?: string | null): PresetProblem[] | null {
    if (!name) return null;
    return PRESETS[name] ?? null;
}
