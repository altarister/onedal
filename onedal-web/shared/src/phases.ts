/**
 * 국면별 필터 설정 — **다섯 국면이 같은 5개 키를 갖는다.**
 *
 * 근거: 기사님 확정
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
  * 🔴 **관내(`'local'`)는 국면이 아니다** — «어디로 가나»가 아니라 목적지에 가까이 온 상태라
  *    따로 잰다(`filterArea.withNearness`).
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
 *   `callTarget`     기사님이 복귀 토글로 고른다 (DEST · HOME) — 관내는 따로 재지 않는다 (목적지 가까이 옴 `filterArea.withNearness`)
 *   `dispatchPhase` 콜 상태에서 파생된다 (STANDBY · GATHERING · DELIVERING)
 *
 * | callTarget | dispatchPhase | 탭     |
 * |-----------|---------------|--------|
 * | DEST      | STANDBY       | first  |
 * | HOME      | STANDBY       | home   |
 * | *any*     | GATHERING     | merge  |
 * | *any*     | DELIVERING    | drive  |
 *
 * 🔴 **복귀는 "첫짐의 자리"다** — *어디서 첫 콜을 찾는가*.
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
export function resolvePhaseKey(
    callTarget: string | null | undefined,
    dispatchPhase: string | null | undefined,
): PhaseKey {
    if (dispatchPhase === 'DELIVERING') return 'drive';
    if (dispatchPhase === 'GATHERING') return 'merge';
    /**
     * 🔴 **관내(`'LOCAL'`)는 고르는 것이 아니다** — 기사님: *"우린 집으로 갈건지 말껀지만 있어."*
     *    목적지에 가까이 옴은 따로 잰다 (`filterArea.withNearness`).
     */
    return callTarget === 'HOME' ? 'home' : 'first';
}

// ─────────────────────────────────────────────────────────────
//  국면 하나가 기억하는 값
// ─────────────────────────────────────────────────────────────

/**
 * 🎛️ **값 다섯의 이름** — 평면(앱 피기백)과 **같은 이름**이다.
 *
 * 🔴 **값은 한 벌이다** — 국면마다 따로 두지 않는다. «지금 이 칸이 쓰이나»는 **상태에서 파생**한다
 *    (라인반경은 노선일 때만). 라벨은 `FILTER_FIELDS.label` 하나다.
 *
 * 🔴 **국면은 «지금 무엇을 하나»의 문구만 고른다** (기사님) —
 *    `PhaseKey` · `PHASE_LABEL` · `PHASE_AUTO_SOURCE` · `resolvePhaseKey`.
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
//  🎛️ FILTER_FIELDS — 필터 값의 유일한 원천 (필터 확정안 v2)
//
//  JUDGMENT_FIELDS 와 같은 문법: 칸 하나 = DB 컬럼 + 폼 + 근거.
// ─────────────────────────────────────────────────────────────

export interface FilterField<P extends string = string> {
    /** DB 컬럼 이름 */ col: string;
    /**
     * 값 그릇 안의 자리. **그릇이 둘이라 제네릭이다** —
     * 값 다섯은 평면 이름(`FlatValueKey`), 마름모 셋은 국면 밖 `QuadShape` 에 산다.
     */ path: P;
    /** 문자열 칸인가 (도착 도시) — 숫자 범위 검증을 건너뛴다 */ text?: boolean;
    label: string;
    unit: string;
    min: number;
    max: number;
    int: boolean;
    /**
     * 🎚️ **한 칸이 얼마인가** — 슬라이더와 ± 가 한 번에 움직이는 폭.
     *
     * 🔴 **화면이 «각도면 10» 을 제 손으로 판단하면 표와 갈라진다** (규칙 ③).
     *    각도는 0~360 이라 1° 씩 끌면 110° 까지 가는 데 화면을 백 번 훑어야 한다.
     *    목업이 10° 로 맞춰 두었고, 그 값이 여기로 왔다.
     */ step?: number;
    /** 왜 이 값인가 — 폼의 칸 아래 그대로 뜬다 */ why: string;
}

/**
 * 🎛️ **값 다섯 — 이름이 «한 벌»이다**.
 *
 * 🔴 **앱이 읽는 평면 이름을 쓴다** — 앱이 읽는 이름은 못 바꾸므로 DB 칸도 폼도 이 이름을 따른다 (규칙 ③).
 * 🔴 **라벨도 여기 하나뿐이다.**
 *
 * 🏷️ 이름은 **목업 것**이다 (기사님: *"목업에 만들어둔 명칭도 그대로 사용해"*).
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
     *    (기사님 이름 확정 · 목업 `MapMockup.tsx`).
     *
     * 🔴 **값은 길 양옆 폭이다** — «카카오 총거리가 늘어나는 만큼»(우회)과 둘 다 km 라,
     *    한 이름으로 부르면 조용히 섞인다.
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
/**
 * 📐 **반경 자동 맞춤 — 목적지가 가까우면 손잡이가 죽는다**.
 *
 * 기사님: *"필터의 목적지와의 거리에 따라 마름모 반경·현위반경·목적반경·라인반경이
 * **자동으로 바뀌어 주면 좋겠다**. 그래서 **자동, 수동**으로 만들어 주는 거야."* ·
 * *"지금 초월과 성남 이렇게 하려니까 **너무 가까워서 문제가 발생한다**."*
 *
 * 🔴 **실측이 그대로 보여 준다.** 손잡이를 절반↔두 배로 움직였을 때 그물에 드는
 *    읍·면·동 수의 «폭»이다. 폭이 0 이면 화면에 있어도 **아무 일도 안 한다**:
 *
 *    | 목적지 | 거리 | 목적반경 | 마름모반경 | 출발각 |
 *    |---|---|---|---|---|
 *    | 성남 | 16km | **624** | **0** | **9** |
 *    | 파주 | 62km | 90 | 214 | 127 |
 *
 *    초월→성남은 15.6km 인데 현위 10 + 목적 15 = **25km** — 원 둘이 서로를 덮어
 *    마름모가 설 자리가 없다. 그래서 **목적반경 하나가 전부를 정한다**(15→30km 에서
 *    163동 → 699동, 네 배).
 *
 * 🔴 **마름모반경은 «얼마나 멀리»가 아니라 «축에서 좌우로»다**(`callNet.makeInQuad` 의
 *    `distToLineKm ≤ r`). 마름모의 폭은 **각도와 거리**가 먼저 정하므로, 거리가 짧으면
 *    각도로 이미 좁아져 반경이 그 바깥에 있어 안 걸린다.
 */
export interface RadiusSet {
    pickupRadiusKm: number;
    destinationRadiusKm: number;
    quadRadiusKm: number;
    detourRadiusKm: number;
}

/**
 * 📏 **기준 거리 — «지금 값이 몇 km 갈 때 맞춘 것인가»** (기사님이 맡기심:
 *    *"필터는 너가 하자는 대로 할께"*).
 *
 * 🔴 **지어내지 않고 역산했다.** 지금 값(10·15·25·6)으로 **거리만** 바꿔 가며 마름모반경의
 *    폭을 재니 이랬다:
 *
 *    ```
 *    15km  0      25km  6      35km  36      45km 219
 *    20km  1      30km 19      40km 106      60km 276
 *    ```
 *
 *    **35km 부터 일하기 시작하고 40km 에서 폭이 106 으로 뛴다.** 곧 이 값들은
 *    40km 안팎에 맞춰진 값이므로, 거기서 **배율 1.0**(아무것도 안 바뀜)이 되는 것이 맞다.
 */
export const RADIUS_BASE_KM_DEFAULT = 40;

/**
 * 거리에 맞춘 반경 넷을 낸다. **각도는 안 건드린다** — 거리와 무관한 «방향 허용폭»이다.
 *
 * ```
 * 배율 = min(1, 목적지까지 거리 ÷ 기준 거리)
 * ```
 *
 * 🔴 **상한(`min(1, …)`)을 두는 이유** — 순수 비례면 파주(62km)가 676 → **778동**으로
 *    되레 넓어진다. 멀리 갈 때는 지금도 넷이 다 일하고 있어 고칠 이유가 없다.
 *    **가까울 때만 줄인다.**
 * 🔴 **기준이 되는 값은 «기사님이 맞춰 두신 평소값»이다** — 코드 상수가 아니다.
 *    평소값을 바꾸시면 자동도 그 비율을 그대로 옮긴다.
 * ⚠️ **모르면 손대지 않는다** (규칙 ④). 거리가 없거나·0 이거나·기준이 이상하면
 *    받은 값을 **그대로** 돌려준다 — 그 판은 «자동이 아직 판단할 수 없는» 판이다.
 */
/**
 * 📏 **배율 하나** — `autoRadii` 가 쓰는 그 값이다 (규칙 ③ — 원천 하나).
 *
 * 🔴 **화면이 이것만 있으면 넷을 다 안다.** 관제웹 필터 화면은 «내 위치 → 목적지» 거리를
 *    모르므로(모달은 `myLocation` 을 안 쥔다), 서버가 **이 한 숫자**를 파생해 실어 보낸다.
 *    반경 넷을 각각 실어 보내면 칸이 넷 늘고 **기사님이 정한 원값이 가려진다** (규칙 ④).
 * ⚠️ 못 재면 `1` 이다 — «손대지 않는다»는 뜻이지 «0» 이 아니다.
 */
export function radiusScaleOf(
    distanceKm: number | null | undefined,
    baseKm: number = RADIUS_BASE_KM_DEFAULT,
): number {
    if (!Number.isFinite(distanceKm as number) || (distanceKm as number) <= 0) return 1;
    if (!Number.isFinite(baseKm) || baseKm <= 0) return 1;
    return Math.min(1, (distanceKm as number) / baseKm);
}

/**
 * 📏 **자동 반경이 쓰는 거리 — 들고 있으면 다시 재지 않는다** (기사님 확정).
 *
 * 기사님: *"자동 반경은 그날 첫짐일 때 적용되는 거다. 위치가 바뀐다고 바뀌어서는 안 된다.
 * 그럼 나중에 관내콜을 할 수가 없다. 그리고 가는 길에 좋은 콜을 못 잡는다."*
 *
 * 🔴 그물을 만들 때마다 다시 재면 합짐에서 «마지막 하차지 → 목적지»로 재게 되어, 목적지 가까이서
 *    반경이 거의 0 으로 준다 (예: 1.2km 에서 목적 원 10km → 0.3km · 도착지 목록 1곳).
 * 비우는 때(= 다음에 다시 재는 때): 그날 처음 · [↻ 다시 구하기](`null`) · 기사님이 목적지를 바꿀 때 ·
 * 영업일 전환(`resetToBaseFilter`) · 서버 재시작(메모리라 비어 있다). 복귀로 목적지가 집이 돼도 그대로 둔다.
 * 못 재면 **없다** — 0 으로 지어내지 않는다 (규칙 ④).
 */
export function heldRadiusDistanceKm(held: number | null | undefined, measuredKm: number | null | undefined): number | undefined {
    if (Number.isFinite(held as number) && (held as number) > 0) return held as number;
    return Number.isFinite(measuredKm as number) ? (measuredKm as number) : undefined;
}

/**
 * 📐 **지금 실제로 쓰이는 반경 넷** — 자동이면 줄인 값, 수동이면 기사님 값.
 *
 * 🔴 **여기가 유일한 곳이다** (규칙 ③). 필터 화면·무대 지도·서버가 **전부** 이것을 부른다.
 *    곱하는 코드가 두 곳이면 **서버는 줄였는데 지도는 안 준다.**
 * ⚠️ 거리(`radiusDistanceKm`)는 **서버가 재서 실어 보낸다** — 화면은 «내 위치 → 목적지»를
 *    모른다. 배율은 여기서 `radiusScaleOf` 로 낸다. 거리를 못 받았으면 `1`(손대지 않음).
 */
export function effectiveRadii(f: {
    pickupRadiusKm?: number | null;
    destinationRadiusKm?: number | null;
    quadRadiusKm?: number | null;
    detourRadiusKm?: number | null;
    radiusAuto?: boolean;
    radiusDistanceKm?: number | null;
    radiusBaseKm?: number;
} | null | undefined): RadiusSet {
    const base: RadiusSet = {
        pickupRadiusKm: f?.pickupRadiusKm ?? (DEFAULT_FILTER_VALUES.pickupRadiusKm as number),
        destinationRadiusKm: f?.destinationRadiusKm ?? (DEFAULT_FILTER_VALUES.destinationRadiusKm as number),
        quadRadiusKm: f?.quadRadiusKm ?? quadShapeFrom(null).quadRadiusKm,
        detourRadiusKm: f?.detourRadiusKm ?? (DEFAULT_FILTER_VALUES.detourRadiusKm as number),
    };
    if (!f?.radiusAuto) return base;
    const scale = radiusScaleOf(f.radiusDistanceKm, f.radiusBaseKm ?? RADIUS_BASE_KM_DEFAULT);
    return {
        pickupRadiusKm: base.pickupRadiusKm * scale,
        destinationRadiusKm: base.destinationRadiusKm * scale,
        quadRadiusKm: base.quadRadiusKm * scale,
        detourRadiusKm: base.detourRadiusKm * scale,
    };
}

export function autoRadii(
    distanceKm: number | null | undefined,
    base: RadiusSet,
    baseKm: number = RADIUS_BASE_KM_DEFAULT,
): RadiusSet {
    const scale = radiusScaleOf(distanceKm, baseKm);
    if (scale === 1) return { ...base };
    return {
        pickupRadiusKm: base.pickupRadiusKm * scale,
        destinationRadiusKm: base.destinationRadiusKm * scale,
        quadRadiusKm: base.quadRadiusKm * scale,
        detourRadiusKm: base.detourRadiusKm * scale,
    };
}

export const DEFAULT_FILTER_VALUES: Record<FlatValueKey, string | number> = {
    destinationCity: '',
    pickupRadiusKm: 10,
    detourRadiusKm: 6,          // 목업 기본값 (`LAB_DEFAULTS.lineRadiusKm`)
    destinationRadiusKm: 15,    // 목업 기본값
    callDiscountPct: 10,
};

// ─────────────────────────────────────────────────────────────
//  📐 마름모의 모양 — **국면 밖 한 벌**
// ─────────────────────────────────────────────────────────────

/**
 * 그물의 모양은 *"어디로 가는가"* 가 정하지 *"콜을 몇 개 쥐었는가"* 가 정하지 않는다.
 * 국면과 무관하므로 **사용자당 한 행**(`user_filters`)에 산다.
 *
 * 🔴 **자리는 하나다** — 국면마다 두면 한 벌에 저장해도 다른 벌에 옛 값이 남는다 (규칙 ③).
 *
 * 근거는 기사님 확정: *"모두 꺼내 두고 노선이면 라인값을 사용하고 동선이면
 * 사용 안 하면 되니까."* — 안 쓰는 칸은 감추지 않고 **상태에서 파생해 흐리게** 한다
 * (라인반경은 노선일 때만 · 자동이면 반경 넷).
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

/** 지도 실험실에서 기사님과 맞춘 값 */
export const DEFAULT_QUAD_SHAPE: QuadShape = { srcAngleDeg: 110, dstAngleDeg: 110, quadRadiusKm: 25 };

/**
 * 아무 그릇(평면 필터·DB 행·폼)에서 마름모 셋만 꺼낸다. 없거나 이상하면 기본값 —
 * **0 으로 읽지 않는다** (`Number(null) === 0`).
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
 * 🥣 **아무 그릇에서든 값 다섯을 꺼낸다**.
 *
 * 🔴 **`Number(null) === 0` 을 막는다**. 새 칸은 늘 NULL 로 태어나는데
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

/** 복귀 전환을 생략하는 집 반경 */
export const HOME_RADIUS_KM = 5;

/**
 * 🧭 **타겟 자동 순환 — 하차를 마칠 때마다 묻는다** — 타겟은 사이클이 끝나면 저절로 넘어간다.
 *
 *   노선(DEST) 콜을 다 내렸다 → 복귀(HOME) 제안     단, 마지막 하차지가 집 반경 안이면 유지 (복귀 무의미)
 *   복귀(HOME) → 노선(DEST)                          🔴 **마지막 복귀콜을 집 가까이(`HOME_RADIUS_KM`) 내렸을 때만**
 *
 * 🔴 **쥔 콜 0건으로 복귀를 끄지 않는다** — 복귀를 켜고 목적지 콜만 내려놓은 것(27)도,
 *    복귀콜 3개 중 첫 콜을 가는 길 중간에 내린 것도 복귀가 끝난 게 아니다. 방향은 기사님이 켠 값이다.
 * 🔴 **하차 완료로 끝난 것에만** 발동한다 — 취소·방출은 없던 일이다 (호출부가 DELIVERED 처리부에 있다).
 * 🔴 집까지의 거리를 모르면(null) 전환하지 않는다 — 지어내지 않는다 (규칙 ④).
 * 자동은 **제안**이다 — 기사님 토글이 언제나 이긴다.
 */
export function decideTargetAfterDelivery(input: {
    /** 지금 타겟 */
    current: string | undefined;
    /** 이번 하차 뒤 진행 중인 콜 수 */
    remainingCount: number;
    /** 이번 하차지 → 집 거리 (모르면 null) */
    distToHomeKm: number | null;
    /** 방금 내린 콜이 복귀콜인가 (`isHomeCallSince`) */
    deliveredHomeCall: boolean;
    /** 진행 중인 복귀콜 수 */
    homeCallsInProgress: number;
}): 'DEST' | 'HOME' | null {
    const cur = input.current ?? 'DEST';
    const dist = input.distToHomeKm;
    if (cur === 'HOME') {
        if (!input.deliveredHomeCall || input.homeCallsInProgress > 0) return null;
        return dist !== null && dist <= HOME_RADIUS_KM ? 'DEST' : null;   // 집에 왔다 — 다음 왕복
    }
    if (input.remainingCount > 0 || dist === null) return null;
    return dist <= HOME_RADIUS_KM ? null : 'HOME';          // 이미 집 근처면 복귀 제안이 무의미하다
}
