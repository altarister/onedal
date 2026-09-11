/**
 * 국면별 필터 설정 — **다섯 국면이 같은 5개 키를 갖는다.**
 *
 * 근거: docs/지금/필터.md §3 (2026-08-14 기사님 확정)
 *
 * 기사님: *"모두 통일하면 타입이 간단해질 거고 저장해 다루기 편할 듯.
 * 탭마다 디스플레이만 달리해서 숨기고 노출하면 될 듯."*
 *
 * ⚠️ 이 파일은 의도적으로 **아무것도 import 하지 않는다.**
 *    shared 의 순환 참조는 부팅 자체를 막는다 (shared/CLAUDE.md).
 */

// ─────────────────────────────────────────────────────────────
//  국면 (PhaseKey) — 두 축의 조합
// ─────────────────────────────────────────────────────────────

/**
  * 🔴 **`'local'`(관내)이 여기서 사라졌다** (이식 C3-3b · 2026-09-11).
  *    관내는 «어디로 가나»가 아니라 **파생**이 되었고(`AutoDispatchFilter.localMode`),
  *    값 그릇(`user_filter_phases`)도 없어져 국면으로 남을 이유가 사라졌다.
  * ⚠️ 이 키들은 이제 **«지금 무엇을 하나»의 문구를 고르는 데만** 쓰인다 — 값은 한 벌이다.
  */
export type PhaseKey = 'first' | 'merge' | 'drive' | 'home';

export const PHASE_KEYS: PhaseKey[] = ['first', 'merge', 'drive', 'home'];

export const PHASE_LABEL: Record<PhaseKey, string> = {
    first: '첫짐',
    merge: '합짐',
    drive: '운행 중',
    home: '복귀',
};

/**
 * **국면은 두 축의 조합이다.**
 *
 *   `callTarget`     기사님이 버튼으로 고른다 (DEST · LOCAL · HOME)
 *   `dispatchPhase` 콜 상태에서 파생된다 (STANDBY · GATHERING · DELIVERING)
 *
 * | callTarget | dispatchPhase | 탭     |
 * |-----------|---------------|--------|
 * | DEST      | STANDBY       | first  |
 * | LOCAL     | STANDBY       | local  |
 * | HOME      | STANDBY       | home   |
 * | *any*     | GATHERING     | merge  |
 * | *any*     | DELIVERING    | drive  |
 *
 * 🔴 **관내·복귀는 "첫짐의 자리"다** — *어디서 첫 콜을 찾는가*.
 *    콜을 잡으면 어느 쪽에서 출발했든 똑같이 합짐 → 운행중으로 흐른다.
 *    기사님: *"첫짐-합짐-운행중-관내-합짐-운행중-복귀-합짐-운행중"*
 *
 * 합짐을 3종(목적지합짐/관내합짐/복귀합짐)으로 나누는 안은 기각했다 —
 * 기사님: *"합짐·운행중은 무조건 **경로가 생기고 난 이후**에 발생하니까."*
 * 경로가 있으면 경유가 그 경로에서 파생되므로 어디서 출발했든 같은 기준이면 된다.
 *
 * @param callTarget     'DEST' | 'HOME'
 * @param dispatchPhase 'STANDBY' | 'GATHERING' | 'DELIVERING'
 */
export function resolvePhaseKey(callTarget: string, dispatchPhase: string): PhaseKey {
    if (dispatchPhase === 'DELIVERING') return 'drive';
    if (dispatchPhase === 'GATHERING') return 'merge';
    /**
     * 🔴 **관내(`'LOCAL'`)가 여기서 사라졌다** (이식 C4-8b-2 · 2026-09-11).
     *    기사님: *"우린 집으로 갈건지 말껀지만 있어."* 관내는 고르는 것이 아니라
     *    **파생**이 되었다 (`AutoDispatchFilter.localMode`).
     * ⚠️ `PhaseKey` 의 `'local'` 자체는 아직 남아 있다 — `user_filter_phases` 다섯 행과
     *    묶여 있어서 **그릇을 걷을 때 함께 간다** (C3-3b).
     */
    return callTarget === 'HOME' ? 'home' : 'first';
}

// ─────────────────────────────────────────────────────────────
//  국면 하나가 기억하는 값
// ─────────────────────────────────────────────────────────────

/**
 * 🎛️ **값 다섯의 이름** — 평면(앱 피기백)과 **같은 이름**이다 (이식 C3-3b · 2026-09-11).
 *
 * 🔴 **여기 `PhaseSettings`(국면 값 그릇)가 있었다.** 다섯 국면이 각자 이 다섯을 들고
 *    `user_filter_phases` 다섯 행에 살았다. C3-3a 에서 **값이 한 벌**이 된 뒤로는
 *    같은 값을 다섯 번 쓰는 일만 남아, C3-3b 에서 그릇째 걷었다.
 *
 * ⚠️ 함께 사라진 것들과 **왜**:
 *   · `PhaseSettingsMap` · `DEFAULT_PHASE_SETTINGS` · `normalizePhaseSettings`
 *     — 다섯 벌을 담고 고르던 것
 *   · `phaseOfRow` · `phaseRowOf` · `phaseStoreDiff` — 다섯 행을 읽고 쓰던 것
 *   · `applyPhaseToFilter` · `phaseFromFlat` · `FlatPhasePatch`
 *     — **이름 두 벌 사이를 옮기던 다리.** 그릇이 하나면 이을 것이 없다
 *   · `PHASE_FIELDS`(국면×칸 표시 규칙) — 값이 한 벌이라 «어느 벌인가»가 없다.
 *     «지금 이 칸이 쓰이나»는 **상태에서 파생**한다 (라인반경은 노선일 때만)
 *   · `PHASE_FIELD_LABEL` — `FILTER_FIELDS.label` 하나로 모았다
 *
 * 🔴 **«지금 무엇을 하나»는 남는다** (기사님 2026-09-09 가 남기라 하신 둘 중 하나) —
 *    `PhaseKey` · `PHASE_LABEL` · `PHASE_AUTO_SOURCE` · `resolvePhaseKey` 는 **문구를
 *    고르는 장치**로 그대로 산다. 값이 사라진 것이지 상황이 사라진 게 아니다.
 */
export type FlatValueKey =
    | 'destinationCity'
    | 'pickupRadiusKm'
    | 'detourRadiusKm'
    | 'destinationRadiusKm'
    | 'callDiscountPct';

/** `auto` 필드가 **무엇에서** 나오는지 — 화면이 "왜 못 고치는지" 말할 수 있어야 한다 */
export const PHASE_AUTO_SOURCE: Record<PhaseKey, string> = {
    first: '',
    merge: '지금 실린 짐의 경로에서',
    drive: '지금 실린 짐의 경로에서',
    home: '설정의 집 주소',
};

// ─────────────────────────────────────────────────────────────
//  🎛️ FILTER_FIELDS — 국면 옵션의 유일한 원천 (필터 확정안 v2 · 2026-08-21)
//
//  JUDGMENT_FIELDS 와 같은 문법: 칸 하나 = DB 컬럼 + 폼 + 근거.
//  `user_filter_phases` 테이블(행 = 사용자×국면)의 컬럼과 이식·병행 비교가 전부
//  이 표에서 나온다. phase_settings JSON blob 은 병행 비교가 끝나면 철거된다.
//  ⚠️ 이식 단계는 현행 5칸 그대로 — 축 개편(pickup_reach_min)은 구현 4에서 한 줄 얹는다.
// ─────────────────────────────────────────────────────────────

export interface FilterField<P extends string = string> {
    /** DB 컬럼 이름 */ col: string;
    /**
     * 값 그릇 안의 자리. **그릇이 둘이라 제네릭이다** (이식 C3-2 · 2026-09-11) —
     * 국면 칸은 `PhaseSettings`, 마름모 셋은 국면 밖 `QuadShape` 에 산다.
     */ path: P;
    /** 문자열 칸인가 (도착 도시) — 숫자 범위 검증을 건너뛴다 */ text?: boolean;
    label: string;
    unit: string;
    min: number;
    max: number;
    int: boolean;
    /**
     * 🎚️ **한 칸이 얼마인가** — 슬라이더와 ± 가 한 번에 움직이는 폭 (이식 C4-1 · 2026-09-11).
     *
     * 🔴 **화면이 «각도면 10» 을 제 손으로 판단하면 표와 갈라진다** (규칙 ③).
     *    각도는 0~360 이라 1° 씩 끌면 110° 까지 가는 데 화면을 백 번 훑어야 한다.
     *    목업이 10° 로 맞춰 두었고, 그 값이 여기로 왔다.
     */ step?: number;
    /** 왜 이 값인가 — 폼의 칸 아래 그대로 뜬다 */ why: string;
}

/**
 * 🎛️ **값 다섯 — 이름이 «한 벌»이다** (이식 C3-3b · 2026-09-11).
 *
 * 🔴 **여기가 이름 두 벌이 만나던 자리였다.** 국면 그릇(`PhaseSettings`)과 평면(앱 피기백)이
 *    같은 값을 다르게 불렀고, 그 사이를 `applyPhaseToFilter` 가 옮겨 주고 있었다:
 *      `detour_allow_km`   ↔ `detourRadiusKm`
 *      `dropoff_radius_km` ↔ `destinationRadiusKm`
 *      `discount_pct`      ↔ `callDiscountPct`
 *    **그릇이 하나가 되며 이을 것이 없어졌다.** 앱이 읽는 이름은 못 바꾸니
 *    **평면 이름이 이긴다** (규칙 ③ — 값은 한 곳에서 나온다).
 *
 * 🔴 **라벨도 여기 하나뿐이다.** `PHASE_FIELD_LABEL` 이 따로 있었는데, 표가 하나면 라벨도 하나다.
 *
 * 🏷️ 이름은 **목업 것**이다 (기사님 2026-08-14: *"목업에 만들어둔 명칭도 그대로 사용해"*).
 */
export const FILTER_FIELDS: readonly FilterField<FlatValueKey>[] = [
    { col: 'destination_city', path: 'destinationCity', text: true,
      label: '목적지', unit: '', min: 0, max: 0, int: false,
      why: '짐이 많은 지역을 향한다 (정의서 1장②). 합짐·복귀에서는 서버가 경로·집 주소로 채운다' },
    { col: 'pickup_radius_km', path: 'pickupRadiusKm',
      label: '현위반경', unit: 'km', min: 0, max: 100, int: false, step: 1,
      why: '내 위치에서 상차지까지. ⚠️ 축 개편 예정 — 도달 시간(분)에서 파생 (확정안 구현 4)' },
    /**
     * 📏 **라인반경** — 길 중심선에서 **한쪽으로** 몇 km 까지 콜을 받나
     *    (기사님 이름 확정 2026-09-09 · 목업 `MapMockup.tsx`).
     *
     * 🔴 **2026-09-11 까지 이 칸이 화면에서 거짓말했다.** 라벨은 「우회 허용」, 설명은
     *    *"카카오 총거리가 늘어나는 만큼"* 이었는데 값은 실제로 **길 양옆 폭**으로 쓰인다.
     *    목업이 그 사고를 미리 경고해 뒀다 — *"둘 다 km 라 한 이름으로 부르면 조용히 섞인다."*
     * ✅ **이제 칸 이름도 평면과 같다** (`detour_allow_km` → `detour_radius_km`) —
     *    C3-3b 에서 그릇이 하나가 되며 옛말이 사라졌다.
     */
    { col: 'detour_radius_km', path: 'detourRadiusKm',
      label: '라인반경', unit: 'km', min: 0, max: 50, int: false, step: 1,
      why: '길 중심선에서 한쪽으로 몇 km 까지 콜을 받나 — 노선일 때만 쓰인다 (동선이면 마름모가 판단)' },
    { col: 'destination_radius_km', path: 'destinationRadiusKm',
      label: '목적반경', unit: 'km', min: 0, max: 100, int: false, step: 1,
      why: '도착 지점 주변 탐색 반경' },
    { col: 'call_discount_pct', path: 'callDiscountPct',
      label: '콜할인율', unit: '%', min: 0, max: 100, int: true, step: 10,
      why: '시세 대비 허용 할인. 100 = 전부 (금액 무관 — 붙이면 늘어나는 매출). 자동으로 안 내려간다 (정의서)' },
] as const;

/** 값 다섯의 **기본값** — DB 가 비었을 때 (기사님이 화면에서 바꾸신다) */
export const DEFAULT_FILTER_VALUES: Record<FlatValueKey, string | number> = {
    destinationCity: '',
    pickupRadiusKm: 10,
    detourRadiusKm: 6,          // 목업 기본값 (`LAB_DEFAULTS.lineRadiusKm`)
    destinationRadiusKm: 15,    // 목업 기본값
    callDiscountPct: 10,
};

// ─────────────────────────────────────────────────────────────
//  📐 마름모의 모양 — **국면 밖 한 벌** (이식 C3-2 · 2026-09-11)
// ─────────────────────────────────────────────────────────────

/**
 * 그물의 모양은 *"어디로 가는가"* 가 정하지 *"콜을 몇 개 쥐었는가"* 가 정하지 않는다.
 * 국면과 무관하므로 **사용자당 한 행**(`user_filters`)에 산다.
 *
 * 🔴 **하루 만에 자리를 옮겼다.** 아침(C3-1)에는 국면 행에 파고 «첫짐에서 상속»으로 가렸다.
 *    그런데 다섯 행에 값이 계속 써지는 구조가 남아, 기사님이 첫짐을 120°/140°/35km 로
 *    저장하신 직후 **합짐 행에는 110/110/25 가 앉아 있었다** — 화면은 「자동 · 첫짐에서 120°」
 *    라고 적으면서. **상속으로 가리는 대신 자리를 하나로 만들었다** (규칙 ③).
 *
 * 근거는 기사님 확정 2026-09-09: *"모두 꺼내 두고 노선이면 라인값을 사용하고 동선이면
 * 사용 안 하면 되니까."* — 다섯 벌이 하던 일은 «값을 여러 벌 두는 것»이 아니라
 * **«지금 안 쓰는 칸을 감추는 것»**이었고, 감추는 일은 `PHASE_FIELDS` 가 계속 한다.
 */
export interface QuadShape {
    /** 출발 쪽 각도(전체 °) — 내 자리에서 얼마나 돌아가도 되나 */
    srcAngleDeg: number;
    /** 목적 쪽 각도(전체 °) — 목적지 둘레를 얼마나 넓게 볼까 */
    dstAngleDeg: number;
    /** 마름모 반경 km — 축(내 위치→목적지 직선)에서 좌우로 몇 km 까지 */
    quadRadiusKm: number;
}

export type QuadShapeKey = keyof QuadShape;
export const QUAD_SHAPE_KEYS: QuadShapeKey[] = ['srcAngleDeg', 'dstAngleDeg', 'quadRadiusKm'];

/**
 * 🎛️ **마름모 칸의 유일한 원천** — `FILTER_FIELDS` 와 같은 문법.
 * DB 컬럼·화면 라벨·단위·범위·근거가 전부 여기서 나온다 (규칙 ③ — 화면이 또 안 적는다).
 */
export const QUAD_FIELDS: readonly FilterField<QuadShapeKey>[] = [
    { col: 'src_angle_deg', path: 'srcAngleDeg',
      label: '출발각', unit: '°', min: 0, max: 360, int: true, step: 10,
      why: '내 자리에서 얼마나 돌아가도 되나. 넓히면 뒤쪽 콜까지 들어온다 — 지도의 마름모가 그만큼 벌어진다' },
    { col: 'dst_angle_deg', path: 'dstAngleDeg',
      label: '목적각', unit: '°', min: 0, max: 360, int: true, step: 10,
      why: '목적지 둘레를 얼마나 넓게 볼까. 좁히면 «정확히 그쪽»만 남는다' },
    { col: 'quad_radius_km', path: 'quadRadiusKm',
      label: '마름모반경', unit: 'km', min: 0, max: 200, int: false, step: 1,
      why: '내 위치→목적지 직선에서 좌우로 몇 km 까지. 각도가 좁아도 이만큼은 담는다' },
] as const;

/** 실험실이 나흘 동안 기사님과 맞춘 값 그대로 */
export const DEFAULT_QUAD_SHAPE: QuadShape = { srcAngleDeg: 110, dstAngleDeg: 110, quadRadiusKm: 25 };

/**
 * 아무 그릇(평면 필터·DB 행·폼)에서 마름모 셋만 꺼낸다. 없거나 이상하면 기본값 —
 * **0 으로 읽지 않는다** (`Number(null) === 0` · 버그 대장 #105).
 */
export function quadShapeFrom(src: Record<string, unknown> | null | undefined): QuadShape {
    const out = { ...DEFAULT_QUAD_SHAPE };
    if (!src) return out;
    for (const f of QUAD_FIELDS) {
        const v = src[f.path] ?? src[f.col];
        if (v === null || v === undefined || v === '') continue;
        const n = Number(v);
        if (Number.isFinite(n)) (out as any)[f.path] = Math.min(f.max, Math.max(f.min, n));
    }
    return out;
}


// ─────────────────────────────────────────────────────────────
//  ⏱️ 시간 축 — 도달 반경 파생 (필터 확정안 v2 구현 4 · 계측 단계)
// ─────────────────────────────────────────────────────────────

/**
 * 🧪 **잠정 계수 — 직선거리 1km 를 몇 분에 가는가.** 근거 없는 값이라 **거르는 데 쓰지
 * 않는다** (기사님 확정 3 강화: 계수 확정 전엔 딱지만). 심사 로그의
 * `[도달 계수 수집]`(직선 km ↔ 카카오 분)이 쌓이면 역산해 확정하고, 그때 이 상수는
 * 판정 기준처럼 DB 칸으로 승격된다 — 지금은 dryRun 로그와 화면 안내에만 쓴다.
 */
export const REACH_COEF_MIN_PER_KM_TEMP = 1.5;

/**
 * 도달 시간(분) → 반경(km). 도달 분의 원천:
 *   빈 차   → 상차 시계 잠정 (판정 기준 탭 — 잡고 20분 안에 상차지 도착)
 *   콜 있음 → 경로 최소 버퍼 (minRouteBuffer — 앞 일이 많을수록 저절로 준다)
 * "첫짐 상차가 남아 있으면 반경이 줄고, 싣고 나면 늘어난다"(16-3)가 이 뺄셈이다.
 */
export function reachRadiusKm(reachMin: number, coefMinPerKm: number = REACH_COEF_MIN_PER_KM_TEMP): number {
    if (!Number.isFinite(reachMin) || reachMin <= 0 || coefMinPerKm <= 0) return 0;
    return Math.round((reachMin / coefMinPerKm) * 10) / 10;
}

/**
 * 🥣 **아무 그릇에서든 값 다섯을 꺼낸다** (이식 C3-3b · 2026-09-11).
 *
 * 🔴 **여기 함수 일곱이 있었다** — `phaseRowOf` · `phaseOfRow` · `phaseStoreDiff` ·
 *    `DEFAULT_PHASE_SETTINGS` · `normalizePhaseSettings` · `applyPhaseToFilter` ·
 *    `phaseFromFlat`. 다섯 행을 읽고 쓰고, **이름 두 벌 사이를 옮기던** 것들이다.
 *    그릇이 하나가 되어 전부 할 일이 없어졌다.
 *
 * 🔴 **`Number(null) === 0` 을 막는다** (버그 대장 #105). 새 칸은 늘 NULL 로 태어나는데
 *    그냥 `Number()` 를 태우면 **NULL 의 0 이 기본값을 이긴다.** `''` 도 같은 길이다.
 */
export function filterValuesFrom(src: Record<string, unknown> | null | undefined): Record<FlatValueKey, any> {
    const out = { ...DEFAULT_FILTER_VALUES } as Record<FlatValueKey, any>;
    if (!src) return out;
    for (const f of FILTER_FIELDS) {
        const v = src[f.path] ?? src[f.col];
        if (v === null || v === undefined || v === '') continue;
        if (f.text) { if (typeof v === 'string') out[f.path] = v; continue; }
        const n = Number(v);
        if (Number.isFinite(n)) out[f.path] = Math.min(f.max, Math.max(f.min, n));
    }
    return out;
}

/** 복귀 전환을 생략하는 집 반경 (근거: docs/기록/결정_이력.md «타겟은 사이클이 끝나면 저절로 넘어간다») */
export const HOME_RADIUS_KM = 5;

/**
 * 🧭 **타겟 자동 순환** — 사이클이 끝나면 다음 타겟을 **미리 눌러 둔다** (기사님이 스와이프로 뒤집는다).
 *
 *   노선(DEST) 끝 → 복귀(HOME)      단, 마지막 하차지가 집 반경 안이면 유지 (복귀 무의미)
 *   관내(LOCAL) 끝 → 복귀(HOME)     관내는 보통 시간 채우기 뒤 귀가다
 *   복귀(HOME) 끝  → 노선(DEST)     집에 왔다 — 다음 왕복
 *
 * 🔴 **하차 완료로 끝난 사이클에만** 발동한다 — 취소·방출로 0건이 된 것은
 *    일이 끝난 게 아니라 무산된 것이다 (호출부가 endedByDelivery 를 보장).
 * 🔴 집까지의 거리를 모르면(null) 전환하지 않는다 — 지어내지 않는다 (규칙 ④).
 *
 * @param current        지금 타겟
 * @param distToHomeKm   마지막 하차지 → 집 거리 (모르면 null)
 * @returns 다음 타겟, 전환하지 않으면 null
 */
export function decideNextTargetAfterCycle(
    current: string | undefined,
    distToHomeKm: number | null,
): 'DEST' | 'HOME' | null {
    const cur = current ?? 'DEST';
    if (cur === 'HOME') return 'DEST';                    // 집에 왔다 — 거리 몰라도 성립
    if (distToHomeKm === null) return null;               // 집을 모르면 제안하지 않는다
    if (cur === 'DEST' && distToHomeKm <= HOME_RADIUS_KM) return null;   // 이미 집 근처
    return 'HOME';                                        // DEST(먼 곳) · LOCAL → 복귀 제안
}
