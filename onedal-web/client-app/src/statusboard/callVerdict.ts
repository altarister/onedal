/**
 * ⚖️ **앱이 내린 판정을 읽는다** — 여기서 다시 재지 않는다.
 *
 * ─────────────────────────────────────────────────────────────
 * 🗑️ **2026-09-12 에 «검산»(`recheck.ts`)을 지우고 이 파일이 대신 섰다.**
 *
 *    그전에는 앱 `InsungParser.decide()` 의 여섯 축을 **TS 로 옮겨 적어** 다시 쟀다.
 *    사본이라 갈라졌고 — 실제로 갈라진 것도 찾았다: 앱은 **요율 모델이 서면 `minFare` 를
 *    안 보는데** 사본은 그것만 봐서 `5.8km·3만원` 콜을 «통과»라 적었다. **가짜 ⭕ 였다.**
 *
 *    기사님이 *"앱에 구현된 필터 함수를 너가 호출할수는 없는거지?"* 하고 물으셨고,
 *    답은 «못 부른다»였다(Kotlin ↔ TS · 앱은 요청을 받는 문이 없다). 그래서 **앱이 판정을
 *    실어 보내는 쪽**으로 갔다 — 앱은 어차피 콜마다 판정하고 성적표를 센다.
 *    관제웹·앱 담당이 그날 문을 냈다 (`docs/의뢰/현황판_콜판정_답신.md`).
 *
 * 🔴 **그래서 이 파일에는 «판정»이 없다.** 축 이름을 한국어로 옮기고, 지금 쥔 콜과
 *    맞춰 보는 것뿐이다. 판정 규칙을 여기 다시 들이면 **그날의 사본이 되살아난다.**
 * ─────────────────────────────────────────────────────────────
 */

/** 🗑️ 서버 `intel` 한 행에서 **이 화면이 쓰는 것만** */
export interface VerdictInput {
    pickup?: string;
    dropoff?: string;
    fare?: number;
    /**
     * ⚖️ **앱이 내린 판정** — `pass` 이거나 **떨어뜨린 축 이름**.
     *    `locked` 는 «필터가 잠겨 아예 안 봤다»라 걸러진 것과 다르다 (답신 ①).
     *    `null` 은 구앱이거나 안 실어 보낸 것 — 지어내지 않는다 (규칙 ④).
     */
    verdict?: string | null;
}

/** 🧾 지금 쥔 콜 한 건 — «이미 잡았나»를 맞춰 보는 데만 쓴다 */
export interface HeldCall {
    pickup?: string | null;
    dropoff?: string | null;
    fare?: number | null;
}

export type VerdictMark =
    /** 🟢 지금 쥔 콜에 있다 — 걸러 올린 것이 맞다 */
    | 'kept'
    /** ⭕ 앱이 «통과»라 했는데 안 잡았다 — **이것만 보면 된다** */
    | 'missed'
    /** ❌ 앱이 떨어뜨렸다 — 안 잡은 것이 맞다 */
    | 'dropped'
    /** ❔ 앱이 판정을 안 실었거나(구앱) 잠겨서 안 봤다 */
    | 'unknown';

export interface VerdictView {
    mark: VerdictMark;
    /** 화면 오른쪽에 적을 말 — 떨어진 축, 또는 «잠겨서 안 봤다» */
    why?: string;
}

/**
 * 🔤 **축 이름은 앱이 보내는 낱말 그대로 받는다** — 여기서 한국어만 입힌다.
 *    🔴 목록에 없는 낱말이 오면 **그 낱말을 그대로 적는다.** 「기타」로 뭉개면 앱이 새 축을
 *       더했을 때 화면이 조용히 삼킨다.
 */
export const VERDICT_AXIS_LABEL: Record<string, string> = {
    vehicle: '차종',
    region: '지역 — 하차지가 그물 밖',
    fare: '요금·요율',
    pickup: '상차거리',
    blacklist: '제외어',
    routeOrder: '경로순서',
};

/**
 * 🔴 **`intel` 의 주소는 짧은 이름이다** (`normalizeAddress` — `'분당구'`·`'구미동'`).
 *    쥔 콜은 긴 주소라 **짧은 쪽이 긴 쪽에 드는가**로 맞춘다. 요금까지 같아야 한 건으로 본다 —
 *    같은 구간이 하루에 여러 번 뜨기 때문이다.
 * ⚠️ 완벽하지 않다. 같은 구간·같은 요금이 둘이면 하나로 본다 (그래서 «맞춰 본다»고 적는다).
 */
function isSameCall(row: VerdictInput, held: HeldCall): boolean {
    const p = row.pickup?.trim(), d = row.dropoff?.trim();
    if (!p || !d) return false;
    const hp = held.pickup ?? '', hd = held.dropoff ?? '';
    if (!hp.includes(p) || !hd.includes(d)) return false;
    /* 요금을 모르는 쪽이 있으면 구간만으로 같다고 본다 — 없는 값을 «다르다»로 읽지 않는다 */
    if (row.fare == null || held.fare == null) return true;
    return row.fare === held.fare;
}

/** 한 행을 네 갈래로 가른다 — **판정은 앱이 했고 여기는 옮겨 적는다.** */
export function viewOfVerdict(row: VerdictInput, held: readonly HeldCall[] = []): VerdictView {
    /* 🟢 먼저 «이미 쥔 콜인가» — 잡은 것과 놓친 것이 한 기호로 섞이면 볼 이유가 없다.
       이것만은 앱이 모른다 (앱은 제가 올린 뒤의 일을 못 본다) */
    if (held.some(h => isSameCall(row, h))) return { mark: 'kept' };

    const v = row.verdict;
    if (v == null || v === '') return { mark: 'unknown', why: '앱이 판정을 안 실었다' };
    /* ❔ **잠긴 것은 걸러진 것과 다르다** (답신 ①) — 축 이름으로 적으면 거짓말이 된다 */
    if (v === 'locked') return { mark: 'unknown', why: '필터가 잠겨 안 봤다' };
    if (v === 'pass') return { mark: 'missed', why: '앱은 통과라 했다' };
    return { mark: 'dropped', why: VERDICT_AXIS_LABEL[v] ?? v };
}

/** 🔢 한눈에 보는 요약 — 제목에 얹는다 */
export function tallyMarks(marks: readonly VerdictMark[]): Record<VerdictMark, number> {
    const out: Record<VerdictMark, number> = { kept: 0, missed: 0, dropped: 0, unknown: 0 };
    for (const m of marks) out[m] += 1;
    return out;
}

/** 🎨 기호 — 화면과 검사가 같은 표를 본다 */
export const MARK_SIGN: Record<VerdictMark, string> = {
    kept: '🟢',
    missed: '⭕',
    dropped: '❌',
    unknown: '❔',
};
