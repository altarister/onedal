/**
 * 국면별 필터 설정 — **다섯 국면이 같은 5개 키를 갖는다.**
 *
 * 근거: docs/필터_재설계_명세.md §2-4 (2026-08-14 기사님 확정)
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

export const PHASE_ICON: Record<PhaseKey, string> = {
    first: '🚚', merge: '📦', drive: '🛣️', local: '🏘️', home: '🏠',
};

/**
 * **국면은 두 축의 조합이다.**
 *
 *   `huntPhase`     기사님이 버튼으로 고른다 (DEST · LOCAL · HOME)
 *   `dispatchPhase` 콜 상태에서 파생된다 (STANDBY · GATHERING · DELIVERING)
 *
 * | huntPhase | dispatchPhase | 탭     |
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
 * 경로가 있으면 회랑이 그 경로에서 파생되므로 어디서 출발했든 같은 기준이면 된다.
 *
 * @param huntPhase     'DEST' | 'LOCAL' | 'HOME'
 * @param dispatchPhase 'STANDBY' | 'GATHERING' | 'DELIVERING'
 */
export function resolvePhaseKey(huntPhase: string, dispatchPhase: string): PhaseKey {
    if (dispatchPhase === 'DELIVERING') return 'drive';
    if (dispatchPhase === 'GATHERING') return 'merge';
    return huntPhase === 'LOCAL' ? 'local' : huntPhase === 'HOME' ? 'home' : 'first';
}

// ─────────────────────────────────────────────────────────────
//  국면 하나가 기억하는 값
// ─────────────────────────────────────────────────────────────

/**
 * 다섯 국면이 **같은 모양**이다. 탭마다 다른 것은 표시(§PHASE_FIELDS)뿐.
 *
 * ⚠️ 이름이 평면(`AutoDispatchFilter`)과 다르다. 평면은 앱 피기백 규격이라
 *    이름을 못 바꾼다 — `applyPhaseToFilter()` 가 사이를 잇는다.
 *      detourAllowKm   ↔ corridorRadiusKm
 *      dropoffRadiusKm ↔ destinationRadiusKm
 *      discountPct     ↔ eyelinePct
 */
export interface PhaseSettings {
    /** 도착 도시. 🖊️ `first` 만 저장한다 — 나머지는 런타임 파생 */
    destinationCity: string;
    /** 상차지 반경 (km) — 내 위치에서 상차지까지 */
    pickupRadiusKm: number;
    /** 경유 허용 (km) — 카카오 총거리 증가분. 회랑 반경은 서버가 파생 */
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
 * `input`  기사님이 입력한다 — 저장한다
 * `auto`   런타임 파생 (경로·GPS·집 주소) — **저장하지 않는다**
 * `hidden` 그 국면 판정에 쓰지 않는다 — 화면에 안 보인다
 */
export type FieldMode = 'input' | 'auto' | 'hidden';

/**
 * 🔴 **이 표가 유일한 원천이다.**
 *
 * 화면은 이걸 읽어 그리고, 서버도 이걸로 "그 국면에서 안 쓰는 값"을 판정에서 뺀다.
 * 같은 규칙을 두 곳에 적으면 한쪽만 고쳐진다 — 이 레포가 반복해서 당한 사고다
 * (회랑 4벌 · 상태목록 3벌 · 단가표 2벌).
 */
export const PHASE_FIELDS: Record<PhaseKey, Record<keyof PhaseSettings, FieldMode>> = {
    first: { destinationCity: 'input', pickupRadiusKm: 'input',  detourAllowKm: 'hidden', dropoffRadiusKm: 'input',  discountPct: 'input' },
    merge: { destinationCity: 'auto',  pickupRadiusKm: 'hidden', detourAllowKm: 'input',  dropoffRadiusKm: 'input',  discountPct: 'input' },
    drive: { destinationCity: 'auto',  pickupRadiusKm: 'hidden', detourAllowKm: 'input',  dropoffRadiusKm: 'hidden', discountPct: 'input' },
    local: { destinationCity: 'auto',  pickupRadiusKm: 'hidden', detourAllowKm: 'hidden', dropoffRadiusKm: 'input',  discountPct: 'input' },
    home:  { destinationCity: 'auto',  pickupRadiusKm: 'input',  detourAllowKm: 'hidden', dropoffRadiusKm: 'input',  discountPct: 'input' },
};

/** 화면 라벨 — 한 곳에서만 정한다 */
export const PHASE_FIELD_LABEL: Record<keyof PhaseSettings, string> = {
    destinationCity: '도착 도시',
    pickupRadiusKm: '상차지 반경',
    detourAllowKm: '경유 허용',
    dropoffRadiusKm: '하차지 반경',
    discountPct: '단가 할인율',
};

/** `auto` 필드가 **무엇에서** 나오는지 — 화면이 "왜 못 고치는지" 말할 수 있어야 한다 */
export const PHASE_AUTO_SOURCE: Record<PhaseKey, string> = {
    first: '',
    merge: '지금 실린 짐의 경로에서',
    drive: '지금 실린 짐의 경로에서',
    local: '지금 위치(또는 최종 하차지)의 시',
    home: '설정의 집 주소',
};

// ─────────────────────────────────────────────────────────────
//  기본값 (명세 §2-4-5)
// ─────────────────────────────────────────────────────────────

/**
 * 국면마다 기본값이 다르다 — 하는 일이 다르기 때문이다.
 * `hidden` 칸도 값은 채워 둔다 (타입이 하나이므로). 그 국면에서 안 쓸 뿐이다.
 */
export const DEFAULT_PHASE_SETTINGS: PhaseSettingsMap = {
    first: { destinationCity: '', pickupRadiusKm: 10, detourAllowKm: 5, dropoffRadiusKm: 10, discountPct: 10 },
    merge: { destinationCity: '', pickupRadiusKm: 10, detourAllowKm: 5, dropoffRadiusKm: 3,  discountPct: 10 },
    drive: { destinationCity: '', pickupRadiusKm: 10, detourAllowKm: 0, dropoffRadiusKm: 3,  discountPct: 10 },
    local: { destinationCity: '', pickupRadiusKm: 10, detourAllowKm: 0, dropoffRadiusKm: 0,  discountPct: 20 },
    home:  { destinationCity: '', pickupRadiusKm: 10, detourAllowKm: 5, dropoffRadiusKm: 10, discountPct: 10 },
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
    corridorRadiusKm: number;
    destinationRadiusKm: number;
    eyelinePct: number;
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
        corridorRadiusKm: s.detourAllowKm,
        destinationRadiusKm: s.dropoffRadiusKm,
        eyelinePct: s.discountPct,
    };
    if (PHASE_FIELDS[phase].destinationCity === 'input') {
        patch.destinationCity = s.destinationCity;
    }
    return patch;
}

/** 평면 필터에서 국면 조각을 뽑는다 (마이그레이션·폼 초기화용) */
export function phaseFromFlat(flat: {
    pickupRadiusKm?: number; corridorRadiusKm?: number;
    destinationRadiusKm?: number; eyelinePct?: number; destinationCity?: string;
}, fallback: PhaseSettings): PhaseSettings {
    return {
        destinationCity: flat.destinationCity ?? fallback.destinationCity,
        pickupRadiusKm: flat.pickupRadiusKm ?? fallback.pickupRadiusKm,
        detourAllowKm: flat.corridorRadiusKm ?? fallback.detourAllowKm,
        dropoffRadiusKm: flat.destinationRadiusKm ?? fallback.dropoffRadiusKm,
        discountPct: flat.eyelinePct ?? fallback.discountPct,
    };
}
