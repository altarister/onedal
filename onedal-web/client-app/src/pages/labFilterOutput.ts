/**
 * 📦 **지도 실험실 → 앱 전달 아웃풋 빌더** (기사님 2026-09-07: *"DB·서버 없이 필터 로직을
 * 잘 만들어 앱에 전달할 아웃풋만 만든다"* · *"구조·요소·키만 맞으면 될 것 같아"*).
 *
 * 🔴 **키 대조는 눈이 아니라 컴파일러가 한다** — 반환 객체를
 * `satisfies Partial<AutoDispatchFilter> & LabProposedFields` 로 잠갔다.
 * 실물 DTO 에 없는 키를 적으면(오타 포함) 그 자리에서 tsc 가 빨간불이다.
 *
 * 읽기 전용이다: shared 의 수식(`rateFloorsFrom`)을 **읽기만** 하고, 실물 코드는 이 파일을
 * import 하지 않는다 — 실험실 수정이 실물에 영향 없음.
 *
 * 🔴 **국면(`PHASE_FIELDS`·`resolvePhaseKey`)을 더는 읽지 않는다** (기사님 확정 2026-09-09).
 *    값이 한 벌이 되며 «어느 벌인가»가 없어졌다. 실물은 아직 다섯 벌이라 **여기서 갈린다** —
 *    이식 계획에 적어 뒀다.
 */
import {
    rateFloorsFrom, TRUCK_CAPACITY_SLOTS,
    type AutoDispatchFilter,
} from '@onedal/shared';

/** 실물 DTO 에 **아직 없는** 실험실 제안 칸 — 이식 때 DTO 로 올라갈 후보들 */
export interface LabProposedFields {
    /** 지역 제외 — 실물 excludedKeywords 는 «단어»라 칸을 새로 판다 (규칙 ⑤-4 ⑤: 한 값이 두 질문 금지) */
    excludedRegions: string[];
    /** ③ 기사님 확정 2026-09-07: 좌표까지 앱에 내려준다 — 앱이 거리식(2단계)도 스스로 잴 재료 */
    destinationDongs: Array<{ name: string; region: string; lng: number; lat: number }>;
    /** 이 목록이 어느 계산에서 나왔나 — 실험실 설명용 */
    mode: string;
}

export interface LabFilterInputs {
    /** 실물 요약줄의 노선/관내/복귀 */
    callTarget: 'DEST' | 'LOCAL' | 'HOME';
    /** 실험실 상태에서 파생: 콜 0 = STANDBY · 콜 쥠 = GATHERING · 주행 = DELIVERING */
    dispatchPhase: 'STANDBY' | 'GATHERING' | 'DELIVERING';
    driving: boolean;
    dstName: string;
    groups: Array<{ region: string; names: string[] }>;
    pass: Array<{ x: number; y: number; name: string; region: string }>;
    /** 제외 키 — `R|시군구` 또는 `D|시군구|읍면동` */
    excluded: string[];
    pickupRadiusKm: number;
    dropoffRadiusKm: number;
    /**
     * 📏 **라인 반경(km)** — 길 중심선에서 한쪽으로 몇 km 까지 콜을 받나.
     * 🔴 실물 평면의 `detourRadiusKm` 자리에 싣는다. 실물은 그 값을 «우회 허용»(총거리 증가분)에서
     *    **서버가 파생**하는데, 실험실은 파생 결과를 기사님이 직접 넣는다 (기사님 지시 2026-09-09).
     */
    lineRadiusKm: number;
    discountPct: number;
    vehicles: string[];
    excludedWords: string[];
    slotsUsed: number;
    capacityConfirmed: boolean;
    modeDesc: string;
}

export function buildAppFilterOutput(i: LabFilterInputs) {
    const isExcluded = (region: string, name: string) =>
        i.excluded.includes(`R|${region}`) || i.excluded.includes(`D|${region}|${name}`);

    const destinationGroups: Record<string, string[]> = {};
    const flat: string[] = [];
    for (const g of i.groups) {
        if (i.excluded.includes(`R|${g.region}`)) continue;
        const names = g.names.filter(n => !i.excluded.includes(`D|${g.region}|${n}`));
        if (!names.length) continue;
        destinationGroups[g.region] = names;
        flat.push(...names);
    }
    const destinationDongs: LabProposedFields['destinationDongs'] = [];
    for (const p of i.pass) if (!isExcluded(p.region, p.name)) destinationDongs.push({ name: p.name, region: p.region, lng: p.x, lat: p.y });

    return {
        // ── 상태 축 — 실물 키 그대로. 🔴 «국면»은 여기서 안 푼다: 값이 한 벌이라 «어느 벌인가»가 없다 ──
        callTarget: i.callTarget,
        dispatchPhase: i.dispatchPhase,
        driverAction: i.driving ? 'DRIVING' : 'WAITING',
        isActive: true,
        isSharedMode: i.dispatchPhase === 'GATHERING',
        /**
         * ── 지역 축 ──
         * 🔴 **숨김(hidden) 처리를 걷어냈다** (기사님 확정 2026-09-09 · 값은 한 벌).
         *    예전엔 국면별 `PHASE_FIELDS` 로 «그 국면에서 안 쓰는 칸»을 아웃풋에서 뺐다.
         *    그런데 **지금 안 쓰는 값은 그냥 안 읽힐 뿐이다** — 빼면 받는 쪽이 «없다»와
         *    «안 쓴다»를 구별 못 하고, 화면과 아웃풋이 다른 말을 하게 된다.
         * ⚠️ 평면(앱 피기백) 이름: lineRadiusKm↔detourRadiusKm · dropoffRadiusKm↔destinationRadiusKm · discountPct↔callDiscountPct
         */
        destinationCity: i.dstName,
        pickupRadiusKm: i.pickupRadiusKm,
        destinationRadiusKm: i.dropoffRadiusKm,
        detourRadiusKm: i.lineRadiusKm,
        destinationKeywords: [...new Set(flat)].sort(),
        destinationGroups,
        // ── 돈 축 — 폴백 시세표(= DB 기본값과 같은 값)로 파생. 실물은 DB 요율로 같은 함수를 부른다 ──
        callDiscountPct: i.discountPct,
        ratePerKm: rateFloorsFrom(i.discountPct),
        minFare: 30000,
        maxFare: 1000000,
        // ── 콜 속성 축 ──
        allowedVehicleTypes: i.vehicles,
        excludedKeywords: i.excludedWords,
        slotsUsed: i.slotsUsed,
        capacityConfidence: i.capacityConfirmed ? 'CONFIRMED' : 'ESTIMATED',
        // ── 실험실 제안 칸 ──
        excludedRegions: i.excluded.map(k => k.startsWith('R|') ? k.slice(2) : k.split('|')[2]),
        destinationDongs,
        mode: i.modeDesc,
    } satisfies Partial<AutoDispatchFilter> & LabProposedFields;
}

export { TRUCK_CAPACITY_SLOTS };
