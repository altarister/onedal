/**
 * 🎨 **지도 실험실의 판정 사실 만들기** (기사님 확정 2026-09-09 · «필터를 만들어 보자» 판).
 *
 * 🔴 **채점은 여기서 안 한다.** 실물 엔진(`judge` · `CRITERIA` · `DEFAULT_JUDGMENT`)이 그대로
 *    채점하고, 이 파일은 **실험실 상태를 실물이 아는 «사실» 모양으로 옮기기만** 한다.
 *    목업이 제 채점기를 두면 실험이 거짓말이 된다 (규칙 ③: 원천 하나).
 *
 * 기사님이 1~2초에 보는 것은 **색**이다 (규칙 ⑤-3). 지금까지 실험실은 우회 분·밀림·정차를
 * **숫자로만** 늘어놓았다 — 읽어야 알 수 있었다. 색이 붙으면 보면 안다.
 *
 * 읽기 전용이다: `@onedal/shared` 를 **읽기만** 하고 실물 코드는 이 파일을 import 하지 않는다
 * (`labFilterOutput` · `labPortMap` 과 같은 규약).
 */
import type { JudgeFacts } from '@onedal/shared';

export interface LabJudgeInput {
    /** 💰 이 콜의 운임(원). 실험실은 콜을 지도 클릭으로 만들므로 **기사님이 넣는다** */
    fare: number;
    /** 📦 이 콜의 짐(박스). 짐을 모르는 콜이라 기본은 일반값이고 기사님이 고친다 */
    boxes: number;
    /** 🚚 이 콜의 주행(분) — 첫짐이면 «내 위치→상차→하차», 합짐이면 전체 경로 증가분 */
    driveMin: number | null;
    /** 🧳 이 콜의 정차(분) — 상차 + 하차 */
    dwellMin: number;
    /** 이미 잡아 둔 콜이 있는가 */
    hasExistingCalls: boolean;
    /**
     * ⏰ 정거장마다 «약속 시각»과 «지금 경로가 말하는 예정 시각».
     * 🔴 둘 중 하나라도 없는 정거장은 **넘긴다** — 지어내지 않는다 (규칙 ④).
     */
    stops: Array<{ label: string; promisedAt: number | null; etaAt: number | null }>;
    /** 📦 지금 쓴 박스 · 내 차 용량 */
    slotsUsed: number;
    capacitySlots: number;
}

/**
 * 🚚 **이 콜 때문에 더 달리는 분** (기사님 순서 ⑬⑭ · 2026-09-09 정정).
 *
 * 실물 정의는 «첫짐이면 이 콜에 쓰는 전체 시간, 합짐이면 **붙여서 늘어나는** 시간»이다.
 *
 * 🔴 **재료는 이미 있다.** 콜을 올릴 때 카카오를 한 번 불러 «후보콜을 낀 전체 경로»를 재고,
 *    «기존 경로»는 직전에 저장해 둔 것을 그대로 쓴다(재배치가 기존 콜들의 상대 순서를 안 바꾸므로).
 *    처음 색을 낼 때 이걸 안 쓰고 «이 콜 자신의 주행»으로 근사했더니 **합짐에서 시급이 부풀었다.**
 *
 * 🔴 **못 쟀으면 `null`** — 0 으로 치면 시급이 무한대가 되어 색이 통째로 틀린다.
 */
export function extraDriveMin(
    /** 후보콜을 낀 전체 경로의 총 주행(분) */
    nowMin: number | null | undefined,
    /** 기존 경로의 총 주행(분). 첫짐이면 없다 */
    beforeMin: number | null | undefined,
    hasExistingCalls: boolean,
): number | null {
    if (nowMin == null) return null;
    if (!hasExistingCalls) return nowMin;      // 첫짐 — 이 콜에 쓰는 전체 시간이 곧 그 값이다
    if (beforeMin == null) return null;        // 합짐인데 기존 경로를 못 쟀다 — 지어내지 않는다
    return nowMin - beforeMin;
}

/**
 * ⏰ **늦는 정거장과 가장 빠듯한 여유** — 약속과 예정의 차이 하나에서 둘 다 나온다.
 *
 * 🔴 실물 정의 그대로다: `lateStops` 는 «이 콜을 붙였을 때 늦는 약속들»,
 *    `bufferAfterMin` 은 «붙인 뒤 남는 **가장 빠듯한** 여유».
 *    한 값(약속 − 예정)에서 파생하므로 둘이 어긋날 수 없다 (규칙 ③).
 */
export function lateAndBuffer(stops: LabJudgeInput['stops']) {
    const diffs: Array<{ label: string; min: number }> = [];
    for (const s of stops) {
        if (s.promisedAt == null || s.etaAt == null) continue;   // 못 잰 것은 안 센다
        diffs.push({ label: s.label, min: Math.round((s.promisedAt - s.etaAt) / 60000) });
    }
    const lateStops = diffs.filter(d => d.min < 0).map(d => ({ label: d.label, lateMinutes: -d.min }));
    const bufferAfterMin = diffs.length ? Math.min(...diffs.map(d => d.min)) : null;
    return { lateStops, bufferAfterMin };
}

/**
 * 🎨 실험실 상태 → 실물 판정이 아는 «사실».
 *
 * 기준 다섯 중 실험실이 **잴 수 있는 것과 없는 것**이 갈린다 (기사님께 보고한 표 그대로):
 *   💰 돈    ✅  요금 ÷ 더 쓰는 시간
 *   ⏰ 약속  ✅  약속 − 예정
 *   📦 공간  ✅  용량 − 쓴 박스 − 이 콜
 *   🏷️ 성질  ⭕  **잴 게 없다** — 지도 클릭으로 만든 콜이라 적요가 없다. 빈 배열이 그 뜻이다
 *   🧭 지리  ❌  지역 데이터가 아직 없다 → `undefined`. 기본 가중치가 0 이라 «안 봄»으로 지나간다
 */
export function buildLabFacts(i: LabJudgeInput): JudgeFacts {
    const { lateStops, bufferAfterMin } = lateAndBuffer(i.stops);
    /**
     * 🔴 **더 쓰는 시간 = 주행 + 정차** (실물 `MoneyFacts.extraMinutes` 정의 그대로).
     *    주행을 못 쟀으면 `null` — 0 으로 치면 시급이 무한대가 되어 **색이 통째로 틀린다.**
     */
    const extraMinutes = i.driveMin == null ? null : i.driveMin + i.dwellMin;
    const free = i.capacitySlots - i.slotsUsed - i.boxes;
    return {
        // 🔴 첫짐이면 눈금이 다르다 — 잡아 둔 콜이 없는 것이 곧 첫짐이다 (실물 `firstLoadFacts` 와 같은 뜻)
        money: { fare: i.fare, extraMinutes, firstLoad: !i.hasExistingCalls },
        promise: { hasExistingCalls: i.hasExistingCalls, lateStops, bufferAfterMin },
        space: { hasLoad: i.slotsUsed > 0, freePct: i.capacitySlots > 0 ? (free / i.capacitySlots) * 100 : null },
        // 🏷️ 적요가 없는 콜이다 — 「제외 단어에 걸린 것 없음 · 같이 못 싣는 짐 없음」이 사실이다
        nature: { excludedHits: [], conflicts: [], hasLoad: i.slotsUsed > 0 },
        // 🧭 지리는 넘기지 않는다 — 지역 데이터가 생기면 이 자리에 들어온다
        notes: ['실험실 콜 — 요금·박스는 기사님이 넣은 값입니다'],
    };
}
