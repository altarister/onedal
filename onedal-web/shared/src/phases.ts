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

export type PhaseKey = 'first' | 'merge' | 'drive' | 'local' | 'home';

export const PHASE_KEYS: PhaseKey[] = ['first', 'merge', 'drive', 'local', 'home'];

export const PHASE_LABEL: Record<PhaseKey, string> = {
    first: '첫짐',
    merge: '합짐',
    drive: '운행 중',
    local: '관내',
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
 * @param callTarget     'DEST' | 'LOCAL' | 'HOME'
 * @param dispatchPhase 'STANDBY' | 'GATHERING' | 'DELIVERING'
 */
export function resolvePhaseKey(callTarget: string, dispatchPhase: string): PhaseKey {
    if (dispatchPhase === 'DELIVERING') return 'drive';
    if (dispatchPhase === 'GATHERING') return 'merge';
    return callTarget === 'LOCAL' ? 'local' : callTarget === 'HOME' ? 'home' : 'first';
}

// ─────────────────────────────────────────────────────────────
//  국면 하나가 기억하는 값
// ─────────────────────────────────────────────────────────────

/**
 * 다섯 국면이 **같은 모양**이다. 탭마다 다른 것은 표시(§PHASE_FIELDS)뿐.
 *
 * ⚠️ 이름이 평면(`AutoDispatchFilter`)과 다르다. 평면은 앱 피기백 규격이라
 *    이름을 못 바꾼다 — `applyPhaseToFilter()` 가 사이를 잇는다.
 *      detourAllowKm   ↔ detourRadiusKm
 *      dropoffRadiusKm ↔ destinationRadiusKm
 *      discountPct     ↔ callDiscountPct
 */
export interface PhaseSettings {
    /** 도착 도시. 🖊️ `first` 만 저장한다 — 나머지는 런타임 파생 */
    destinationCity: string;
    /** 상차지 반경 (km) — 내 위치에서 상차지까지 */
    pickupRadiusKm: number;
    /** 경유 허용 (km) — 카카오 총거리 증가분. 경유 반경은 서버가 파생 */
    detourAllowKm: number;
    /** 하차지 반경 (km) — 도착 지점 주변 */
    dropoffRadiusKm: number;
    /** 단가 할인율 (%) — 시세 대비. 100 = 전부(금액 무관) */
    discountPct: number;
}

export type PhaseSettingsMap = Record<PhaseKey, PhaseSettings>;

// ─────────────────────────────────────────────────────────────
//  국면 × 필드 — 표시 규칙 (명세 §2-4-5 그대로)
// ─────────────────────────────────────────────────────────────

/**
 * `input`     기사님이 입력한다 — 저장한다
 * `override`  **자동이 기본인데 손으로 덮을 수 있다.** 비워 두면 자동 파생값을 쓴다
 * `auto`      런타임 파생 (경로·GPS·집 주소) — **저장하지 않는다.** 화면엔 보이되 못 고친다
 * `hidden`    그 국면 판정에 쓰지 않는다 — 화면에 안 보인다
 *
 * 🔴 `override` 는 2026-08-14 에 늘렸다. 목업의 관내 **기준 지역** 이 그 모양이다 —
 *    기본은 "최종 하차지 (파주시)" 인데 다른 시를 고를 수도 있다.
 *    셋(입력/자동/숨김)만으로는 "자동인데 덮을 수 있다"를 표현할 자리가 없었다.
 */
export type FieldMode = 'input' | 'override' | 'auto' | 'hidden';

/**
 * 🔴 **이 표가 유일한 원천이다.**
 *
 * 화면은 이걸 읽어 그리고, 서버도 이걸로 "그 국면에서 안 쓰는 값"을 판정에서 뺀다.
 * 같은 규칙을 두 곳에 적으면 한쪽만 고쳐진다 — 이 레포가 반복해서 당한 사고다
 * (경유 4벌 · 상태목록 3벌 · 단가표 2벌).
 */
export const PHASE_FIELDS: Record<PhaseKey, Record<keyof PhaseSettings, FieldMode>> = {
    first: { destinationCity: 'input',    pickupRadiusKm: 'input',  detourAllowKm: 'hidden', dropoffRadiusKm: 'input',  discountPct: 'input' },
    /**
     * 🔴 **합짐·주행중의 도착 목표는 `auto` 다 — 첫짐에서 상속한다** (기사님 확정 2026-08-25).
     *
     * 예전엔 `hidden` 이었다. 그런데 화면에는 «여주시」가 그대로 적혀 있는데 판정에서만
     * 사라져서, **화면이 조용히 거짓말했다** (규칙 ⑤-4 ④). 실측 2026-08-25:
     * 가남→세종대왕면은 잡히고 가남→점동면은 막혔다 — 둘 다 여주시인데.
     *
     * 노선인 동안 목적지는 안 바뀌므로 **따로 저장하지 않는다** (규칙 ③). 보이되 못 고친다.
     */
    merge: { destinationCity: 'auto',     pickupRadiusKm: 'hidden', detourAllowKm: 'input',  dropoffRadiusKm: 'input',  discountPct: 'input' },
    drive: { destinationCity: 'auto',     pickupRadiusKm: 'hidden', detourAllowKm: 'input',  dropoffRadiusKm: 'hidden', discountPct: 'input' },
    local: { destinationCity: 'override', pickupRadiusKm: 'hidden', detourAllowKm: 'hidden', dropoffRadiusKm: 'hidden', discountPct: 'input' },
    home:  { destinationCity: 'auto',     pickupRadiusKm: 'hidden', detourAllowKm: 'input',  dropoffRadiusKm: 'hidden', discountPct: 'input' },
};

/**
 * 화면 라벨 — 기본값. **v6 목업 표기를 그대로 쓴다** (기사님 2026-08-14:
 * *"목업에 만들어둔 명칭도 그대로 사용해"*).
 */
export const PHASE_FIELD_LABEL: Record<keyof PhaseSettings, string> = {
    destinationCity: '도착 목표',
    pickupRadiusKm: '상차 반경',
    detourAllowKm: '우회 허용',
    dropoffRadiusKm: '하차지 주변',
    discountPct: '콜할인율',
};

/**
 * 🔴 **같은 칸이라도 국면마다 부르는 이름이 다르다.**
 *
 * 목업을 그대로 읽으면 이렇다 — 첫짐의 하차지 반경은 *"도착 반경"*, 합짐에서는
 * *"하차지 주변"* 이다. 같은 숫자지만 기사님이 그 국면에서 실제로 쓰는 말이 다르다.
 * 억지로 한 이름으로 통일하면 둘 중 한 국면에서는 어색한 말이 된다.
 *
 * 여기 없는 칸은 위 `PHASE_FIELD_LABEL` 을 쓴다. **표는 여전히 한 곳뿐이다.**
 */
export const PHASE_FIELD_LABEL_OVERRIDE: Partial<Record<PhaseKey, Partial<Record<keyof PhaseSettings, string>>>> = {
    first: { destinationCity: '도착 목표', dropoffRadiusKm: '도착 반경' },
    local: { destinationCity: '기준 지역' },
    home:  { destinationCity: '집 주소' },
};

/** 그 국면에서 이 칸을 뭐라고 부르는가 */
export function fieldLabel(phase: PhaseKey, key: keyof PhaseSettings): string {
    return PHASE_FIELD_LABEL_OVERRIDE[phase]?.[key] ?? PHASE_FIELD_LABEL[key];
}

/** `auto` 필드가 **무엇에서** 나오는지 — 화면이 "왜 못 고치는지" 말할 수 있어야 한다 */
export const PHASE_AUTO_SOURCE: Record<PhaseKey, string> = {
    first: '',
    merge: '지금 실린 짐의 경로에서',
    drive: '지금 실린 짐의 경로에서',
    local: '지금 위치(또는 최종 하차지)의 시',
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

export interface FilterField {
    /** DB 컬럼 이름 */ col: string;
    /** `PhaseSettings` 안의 자리 */ path: keyof PhaseSettings;
    /** 문자열 칸인가 (도착 도시) — 숫자 범위 검증을 건너뛴다 */ text?: boolean;
    label: string;
    unit: string;
    min: number;
    max: number;
    int: boolean;
    /** 왜 이 값인가 — 폼의 칸 아래 그대로 뜬다 */ why: string;
}

export const FILTER_FIELDS: readonly FilterField[] = [
    { col: 'destination_city', path: 'destinationCity', text: true,
      label: '도착 목표', unit: '', min: 0, max: 0, int: false,
      why: '짐이 많은 지역을 향한다 (정의서 1장②) — 첫짐만 저장, 관내는 덮어쓰기, 복귀는 자동' },
    { col: 'pickup_radius_km', path: 'pickupRadiusKm',
      label: '상차 반경', unit: 'km', min: 0, max: 100, int: false,
      why: '내 위치에서 상차지까지. ⚠️ 축 개편 예정 — 도달 시간(분)에서 파생 (확정안 구현 4)' },
    { col: 'detour_allow_km', path: 'detourAllowKm',
      label: '우회 허용', unit: 'km', min: 0, max: 200, int: false,
      why: '카카오 총거리 증가분 — 길 위의 짐을 최대한 (정의서 1장③). 경유 반경은 서버가 파생' },
    { col: 'dropoff_radius_km', path: 'dropoffRadiusKm',
      label: '하차지 주변', unit: 'km', min: 0, max: 100, int: false,
      why: '도착 지점 주변 탐색 반경' },
    { col: 'discount_pct', path: 'discountPct',
      label: '콜할인율', unit: '%', min: 0, max: 100, int: true,
      why: '시세 대비 허용 할인. 100 = 전부(금액 무관 — 순증 매출). 자동으로 안 내려간다 (정의서)' },
] as const;

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
 *   빈 차   → 상차 시계 잠정 (판정 기준 탭 — 잡고 30분 안에 무통보 상차)
 *   콜 있음 → 경로 최소 버퍼 (minRouteBuffer — 앞 일이 많을수록 저절로 준다)
 * "첫짐 상차가 남아 있으면 반경이 줄고, 싣고 나면 늘어난다"(16-3)가 이 뺄셈이다.
 */
export function reachRadiusKm(reachMin: number, coefMinPerKm: number = REACH_COEF_MIN_PER_KM_TEMP): number {
    if (!Number.isFinite(reachMin) || reachMin <= 0 || coefMinPerKm <= 0) return 0;
    return Math.round((reachMin / coefMinPerKm) * 10) / 10;
}

/** `PhaseSettings` → DB 행 값 (컬럼 이름 키) */
export function phaseRowOf(s: PhaseSettings): Record<string, string | number> {
    const out: Record<string, string | number> = {};
    for (const f of FILTER_FIELDS) out[f.col] = s[f.path] as any;
    return out;
}

/** DB 행 → `PhaseSettings`. 값이 없거나 이상하면 그 국면의 기본값으로 메운다 */
export function phaseOfRow(row: Record<string, unknown> | undefined | null, phase: PhaseKey): PhaseSettings {
    const d = DEFAULT_PHASE_SETTINGS[phase];
    const out = { ...d } as PhaseSettings;
    if (!row) return out;
    for (const f of FILTER_FIELDS) {
        const v = row[f.col];
        if (f.text) {
            if (typeof v === 'string') (out as any)[f.path] = v;
        } else {
            const n = Number(v);
            if (Number.isFinite(n)) (out as any)[f.path] = Math.min(f.max, Math.max(f.min, n));
        }
    }
    return out;
}

/**
 * 🧪 병행 비교 — blob 과 행이 같은 말을 하는가. 어긋난 칸 이름을 돌려준다 (빈 배열 = 일치).
 * 전환 ②단계의 계측이다 — 이 로그가 조용해야 읽기를 행으로 넘긴다.
 */
export function phaseStoreDiff(blob: PhaseSettingsMap, rows: Partial<Record<PhaseKey, PhaseSettings>>): string[] {
    const diffs: string[] = [];
    for (const key of PHASE_KEYS) {
        const b = blob[key];
        const r = rows[key];
        if (!r) { diffs.push(`${key}: 행 없음`); continue; }
        for (const f of FILTER_FIELDS) {
            if ((b[f.path] as any) !== (r[f.path] as any)) {
                diffs.push(`${key}.${f.col}: blob=${b[f.path]} 행=${r[f.path]}`);
            }
        }
    }
    return diffs;
}

// ─────────────────────────────────────────────────────────────
//  기본값 (명세 §2-4-5)
// ─────────────────────────────────────────────────────────────

/**
 * 국면마다 기본값이 다르다 — 하는 일이 다르기 때문이다.
 * `hidden` 칸도 값은 채워 둔다 (타입이 하나이므로). 그 국면에서 안 쓸 뿐이다.
 */
export const DEFAULT_PHASE_SETTINGS: PhaseSettingsMap = {
    first: { destinationCity: '', pickupRadiusKm: 10, detourAllowKm: 5,  dropoffRadiusKm: 10, discountPct: 10 },
    merge: { destinationCity: '', pickupRadiusKm: 10, detourAllowKm: 5,  dropoffRadiusKm: 3,  discountPct: 10 },
    drive: { destinationCity: '', pickupRadiusKm: 10, detourAllowKm: 0,  dropoffRadiusKm: 3,  discountPct: 10 },
    local: { destinationCity: '', pickupRadiusKm: 10, detourAllowKm: 0,  dropoffRadiusKm: 0,  discountPct: 20 },
    // 복귀 우회 10 — 목업 값. 집으로 가는 길은 멀어서 주울 여지가 크다
    home:  { destinationCity: '', pickupRadiusKm: 10, detourAllowKm: 10, dropoffRadiusKm: 10, discountPct: 10 },
};

/** 저장된 JSON 이 비었거나 일부만 있어도 온전한 맵을 만든다 (필드 누락 방어) */
export function normalizePhaseSettings(raw: unknown): PhaseSettingsMap {
    const out = {} as PhaseSettingsMap;
    const src = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    for (const key of PHASE_KEYS) {
        const d = DEFAULT_PHASE_SETTINGS[key];
        const v = (src[key] && typeof src[key] === 'object') ? src[key] as Record<string, unknown> : {};
        out[key] = {
            destinationCity: typeof v.destinationCity === 'string' ? v.destinationCity : d.destinationCity,
            pickupRadiusKm: Number.isFinite(v.pickupRadiusKm) ? Number(v.pickupRadiusKm) : d.pickupRadiusKm,
            detourAllowKm: Number.isFinite(v.detourAllowKm) ? Number(v.detourAllowKm) : d.detourAllowKm,
            dropoffRadiusKm: Number.isFinite(v.dropoffRadiusKm) ? Number(v.dropoffRadiusKm) : d.dropoffRadiusKm,
            discountPct: Number.isFinite(v.discountPct) ? Number(v.discountPct) : d.discountPct,
        };
    }
    return out;
}

// ─────────────────────────────────────────────────────────────
//  조각 → 평면
// ─────────────────────────────────────────────────────────────

/** `applyPhaseToFilter` 가 만들어 내는 평면 조각 (AutoDispatchFilter 의 부분집합) */
export interface FlatPhasePatch {
    pickupRadiusKm: number;
    detourRadiusKm: number;
    destinationRadiusKm: number;
    callDiscountPct: number;
    destinationCity?: string;
}

/**
 * 국면 조각을 **평면 필터 이름으로** 옮긴다.
 *
 * 평면(`AutoDispatchFilter`)은 앱 피기백 규격이라 이름을 못 바꾼다.
 * 여기가 새 이름과 옛 이름을 잇는 **유일한 지점**이다.
 *
 * `destinationCity` 는 `input` 인 국면(= first)일 때만 내보낸다.
 * `auto` 인 국면에서는 서버가 경로·GPS·집 주소로 채우므로, 저장된 값(대개 빈 문자열)이
 * 그걸 덮어쓰면 안 된다.
 */
export function applyPhaseToFilter(phase: PhaseKey, s: PhaseSettings): FlatPhasePatch {
    const patch: FlatPhasePatch = {
        pickupRadiusKm: s.pickupRadiusKm,
        detourRadiusKm: s.detourAllowKm,
        destinationRadiusKm: s.dropoffRadiusKm,
        callDiscountPct: s.discountPct,
    };
    /**
     * `input` 은 늘 내보낸다. `override` 는 **덮어썼을 때만** 내보낸다 —
     * 비어 있으면 "자동을 쓰겠다"는 뜻이라, 서버가 GPS 로 정한 시를 지우면 안 된다.
     * `auto` 는 절대 내보내지 않는다 (저장된 빈 문자열이 파생값을 덮는다).
     */
    const cityMode = PHASE_FIELDS[phase].destinationCity;
    if (cityMode === 'input' || (cityMode === 'override' && s.destinationCity)) {
        patch.destinationCity = s.destinationCity;
    }
    return patch;
}

/** 평면 필터에서 국면 조각을 뽑는다 (마이그레이션·폼 초기화용) */
export function phaseFromFlat(flat: {
    pickupRadiusKm?: number; detourRadiusKm?: number;
    destinationRadiusKm?: number; callDiscountPct?: number; destinationCity?: string;
}, fallback: PhaseSettings): PhaseSettings {
    return {
        destinationCity: flat.destinationCity ?? fallback.destinationCity,
        pickupRadiusKm: flat.pickupRadiusKm ?? fallback.pickupRadiusKm,
        detourAllowKm: flat.detourRadiusKm ?? fallback.detourAllowKm,
        dropoffRadiusKm: flat.destinationRadiusKm ?? fallback.dropoffRadiusKm,
        discountPct: flat.callDiscountPct ?? fallback.discountPct,
    };
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
