import type { SimCallInput, SimPlace } from './simCallQueue';

/**
 * 🎬 **시나리오콜 — 서버가 사건순으로 콜을 낸다** (기사님 지시 2026-09-15 · 설계서 `docs/기획/문제지_이천왕복.md` §7).
 *
 * 기사님: *"시뮬레이터에 내기 버튼을 클릭하면 서버가 그냥 콜리스트를 … 순서대로 뿌리면 되는거 아냐?"*
 *         *"너가 알려주는 건 안 돼, 시선이 분산되니까. 현황판에서 모두 해결할 수 있도록 해줘"*
 *
 * 🔴 **시계순이 아니라 사건순이다.** 모의 주행 속도·정차가 매번 다르고, KEEP 마다 서버가 정거장 순서를 다시 짜고,
 *    기사님 손이 늦으면 뒤가 밀린다. 그래서 줄은 «앞 줄이 끝나면» 또는 «○줄 콜의 상차/하차 도착이 찍히면» 나간다.
 * 🔴 **판단은 이 순수 함수 하나다** — 서버 경로(`routes/sim.ts`)는 1초마다 «세상»을 읽어 넘기고 결과를 옮길 뿐,
 *    현황판은 그리기만 한다. 화면이나 경로에 판단을 두면 돌려 봐야만 틀린 줄을 안다 (검사 `tests/core/simScenario.test.ts`).
 * 🔴 **짝짓기는 좌표가 있으면 좌표, 없으면 동 이름·요금** — 서버가 주소를 `normalizeAddress` 로 줄여 적어 긴 글자로는 불안하다
 *    (onedal-49 확인). 그런데 **폰이 올린 기록(`intel`)에는 좌표가 없다** — 폰은 목록 화면의 동 이름·요금·차종만 읽는다
 *    (2026-09-15 01:32 첫 시험 · 버그 대장 #128). 그래서 좌표가 비면 상차·하차 동 이름이 들어 있고 요금이 같은가로 본다.
 *    그리고 **보낸 뒤 새로 생긴 것만** 본다 — 같은 콜(C2 ↔ D1)이 앞 줄 콜을 제 것으로 집지 않게.
 * 🔴 **막힘은 폰이 남긴 판정(`intel.verdict`)으로 가린다** — «안 올라왔다»를 기다리지 않는다. 막힌 칸까지 채점된다.
 */

/** 줄의 지점 — 개별콜 칸(`SimPlace`) + 사람이 읽을 이름 */
export interface ScenarioPlace extends Omit<SimPlace, 'customerName'> {
    name: string;
}

export type ScenarioCheck =
    | { kind: 'phase'; value: string }
    | { kind: 'goals'; value: number }
    | { kind: 'target'; value: string }
    | { kind: 'listHas'; value: string[] }
    | { kind: 'listLacks'; value: string[] };

export interface ScenarioRow {
    id: string;
    stage: 'A' | 'B' | 'C' | 'D' | 'E';
    /** 🕰️ 언제 내나 — 앞 줄이 끝나면 · 그 줄 콜의 상차/하차 도착이 찍히면 */
    when: { after: 'prev' } | { arrive: string; stop: 'pickup' | 'dropoff' };
    /** 🟢 KEEP · 🟡 올라오면 취소 · ⚪ 폰이 막아야 한다 · 🧭 기사님 조작 */
    kind: 'keep' | 'cancel' | 'block' | 'act';
    call?: { pickup: ScenarioPlace; dropoff: ScenarioPlace; fare: number; vehicleType: string };
    /** ⚪ 막을 축 — 폰이 `verdict` 에 보내는 낱말 그대로 (`pickup` · `fare` · `vehicle` · `region` · `routeOrder`) */
    blockBy?: string;
    /** 기사님께 보일 «지금 할 일» 한 줄 */
    say: string;
    /** 🧭 할 일 줄 — 이 값이 참이 되면 끝 */
    done?: ScenarioCheck;
    /** 끝난 뒤 3초 — 서버가 목록을 다시 만들 틈 — 에 보는 필터 값 */
    checks?: ScenarioCheck[];
    /** 🟡 설계 추정 줄 — 🔴 가 나와도 제품 고장이 아니라 추정이 틀린 것일 수 있다 */
    guess?: boolean;
    why: string;
}

/** 서버 메모리 콜 한 건 — 판단에 쓰는 칸만 */
export interface WorldOrder {
    id: string;
    status: string;
    /** 폰이 목록에서 읽은 글자 — 좌표가 아직 없을 때 짝짓기에 쓴다 */
    pickup?: string; dropoff?: string; fare?: number;
    pickupX?: number; pickupY?: number; dropoffX?: number; dropoffY?: number;
    arrivedPickupAt?: string; arrivedDropoffAt?: string;
}
/** 폰이 올린 콜 한 줄 (`intel`) — 판단에 쓰는 칸만 */
export interface WorldIntel {
    id: number;
    /** 🔴 폰 기록은 좌표가 비어 있다 — 동 이름·요금으로 짝짓는다 (#128) */
    pickup?: string | null; dropoff?: string | null; fare?: number | null;
    pickupX?: number | null; pickupY?: number | null; dropoffX?: number | null; dropoffY?: number | null;
    verdict?: string | null;
}
export interface WorldFilter {
    dispatchPhase?: string | null;
    goalCities?: string[] | null;
    callTarget?: string | null;
    destinationKeywords?: string[] | null;
}
export interface ScenarioWorld {
    now: number;
    orders: WorldOrder[];
    intel: WorldIntel[];
    filter: WorldFilter;
}

export type RowMark = 'wait' | 'sent' | 'ok' | 'warn' | 'bad' | 'unknown' | 'skip';

export interface RowState {
    id: string;
    mark: RowMark;
    /** 지금 이 줄에 대해 기사님께 할 말 */
    note: string;
    sentAt?: number;
    /** 보낼 때 이미 있던 콜 id — 그 뒤에 생긴 것만 짝이 된다 */
    ordersBefore?: string[];
    /** 보낼 때 가장 큰 intel id — 그보다 큰 것만 짝이 된다 */
    intelAfter?: number;
    orderId?: string;
    /** 폰이 준 판정 낱말 그대로 — 한국어는 현황판(`callVerdict.ts`)이 입힌다 */
    verdict?: string | null;
    /** ⚪ 줄에 `pass` 가 온 시각 — 그 뒤 15초 안에 콜이 오면 취소 안내, 안 오면 🔴 로 끝 */
    passAt?: number;
    /** 끝난 시각 — 없으면 아직 이 줄이다 (🔴 여도 기다리는 중일 수 있다) */
    doneAt?: number;
    /** 🫳 이 줄이 시뮬레이터에 낸 콜 번호 — 줄이 끝나면 그 콜을 거둔다 (`seqsToWithdraw`) */
    seq?: number;
    checks?: Array<{ label: string; ok: boolean }>;
}

export interface ScenarioState {
    startedAt: number;
    index: number;
    rows: RowState[];
    finished: boolean;
}

/** 줄이 끝난 뒤 채점까지 기다리는 시간 — 서버가 목록을 다시 만드는 틈 */
export const SETTLE_MS = 3000;
/**
 * 🟢·🟡 줄이 이만큼 안 올라오면 🔴 로 알린다 (끝내지는 않는다 — 건너뛰기는 기사님이).
 * ⏱️ 75초 = 원달앱 하트비트(60초) + 여유 15초 (2026-09-15 여섯 번째 바퀴 · onedal-49 합의) — 폰이 새 필터를 받는 가장 긴 간격이
 *    하트비트라, 옛 값(45초)이면 B3 처럼 재판정이 63초에 통과해 올라와도 채점이 먼저 끝났다. 모의 주행 속도와는 상관없다.
 */
export const NO_SHOW_MS = 75_000;
/** ⚪ 줄에 폰 판정이 이만큼 없으면 ❔ 로 알린다 */
export const NO_VERDICT_MS = 30_000;
/** ⚪ 줄이 `pass` 인데 콜이 안 오면 이만큼 뒤 🔴 로 끝 (폰이 수동 모드면 안 잡는다) */
export const PASS_WAIT_MS = 15_000;
/** 좌표 짝짓기 반경 */
export const MATCH_KM = 0.2;

const CONFIRMED = ['ORDER_CONFIRMED', 'ORDER_PICKED_UP', 'ORDER_DELIVERED', 'ORDER_COMPLETED'];
const CANCELED = ['SAFE_CANCEL', 'ORDER_RELEASED_BY_ME', 'ORDER_RELEASED_BY_OFFICE'];

const km = (x: number, y: number, p: { lon: number; lat: number }) =>
    Math.hypot((x - p.lon) * 111.32 * Math.cos((p.lat * Math.PI) / 180), (y - p.lat) * 110.574);
const near = (x: number | null | undefined, y: number | null | undefined, p: { lon: number; lat: number }) =>
    x != null && y != null && km(x, y, p) <= MATCH_KM;

/** 이 콜이 그 줄의 콜인가 — 좌표 둘이 다 있으면 좌표로, 아니면 상차·하차 동 이름과 요금으로 (#128) */
function sameCall(x: { pickupX?: number | null; pickupY?: number | null; dropoffX?: number | null; dropoffY?: number | null;
                       pickup?: string | null; dropoff?: string | null; fare?: number | null },
                  call: NonNullable<ScenarioRow['call']>): boolean {
    if (x.pickupX != null && x.pickupY != null && x.dropoffX != null && x.dropoffY != null) {
        return near(x.pickupX, x.pickupY, call.pickup) && near(x.dropoffX, x.dropoffY, call.dropoff);
    }
    return !!x.pickup && !!x.dropoff && x.pickup.includes(call.pickup.region) && x.dropoff.includes(call.dropoff.region)
        && (x.fare == null || x.fare === call.fare);
}

export function startScenario(def: ScenarioRow[], now: number): ScenarioState {
    return {
        startedAt: now, index: 0, finished: def.length === 0,
        rows: def.map(r => ({ id: r.id, mark: 'wait', note: '' })),
    };
}

function checkLabel(c: ScenarioCheck): string {
    switch (c.kind) {
        case 'phase': return `국면 ${c.value}`;
        case 'goals': return `목적지 ${c.value}개`;
        case 'target': return c.value === 'HOME' ? '복귀 켬' : '복귀 끔';
        case 'listHas': return `목록에 ${c.value.join('·')}`;
        case 'listLacks': return `목록에 ${c.value.join('·')} 없음`;
    }
}

function checkOk(c: ScenarioCheck, f: WorldFilter): boolean {
    const list = f.destinationKeywords ?? [];
    switch (c.kind) {
        case 'phase': return f.dispatchPhase === c.value;
        case 'goals': return (f.goalCities?.length ?? 0) === c.value;
        case 'target': return (f.callTarget ?? 'DEST') === c.value;
        case 'listHas': return c.value.every(d => list.includes(d));
        case 'listLacks': return c.value.every(d => !list.includes(d));
    }
}

function toSimCall(call: NonNullable<ScenarioRow['call']>): SimCallInput {
    const simPlace = (p: ScenarioPlace): SimPlace =>
        ({ addressDetail: p.addressDetail, region: p.region, lon: p.lon, lat: p.lat, customerName: p.name });
    return { pickup: simPlace(call.pickup), dropoff: simPlace(call.dropoff), fare: call.fare, vehicleType: call.vehicleType };
}

/** «○○에 서면» — 그 줄 콜의 상차/하차 도착이 찍혔나 */
function readiness(def: ScenarioRow[], st: ScenarioState, row: ScenarioRow, w: ScenarioWorld): { ready: boolean; note: string } {
    if (!('arrive' in row.when)) return { ready: true, note: '' };
    const { arrive, stop } = row.when;
    const ri = def.findIndex(r => r.id === arrive);
    const refRow = def[ri];
    const where = refRow?.call ? (stop === 'pickup' ? refRow.call.pickup.name : refRow.call.dropoff.name) : arrive;
    const orderId = st.rows[ri]?.orderId;
    if (!orderId) return { ready: false, note: `⏳ ${arrive} 콜을 못 잡아 «${where}에 서면»을 알 수 없다 — [건너뛰기]` };
    const o = w.orders.find(x => x.id === orderId);
    const at = stop === 'pickup' ? o?.arrivedPickupAt : o?.arrivedDropoffAt;
    return at ? { ready: true, note: '' } : { ready: false, note: `⏳ ${where}에 서면 낸다` };
}

function finish(rs: RowState, mark: RowMark, note: string, now: number): RowState {
    return { ...rs, mark, note, doneAt: now };
}

/** 보낸 줄 하나를 «세상»에 비춰 본다 */
function judgeSent(row: ScenarioRow, rs: RowState, w: ScenarioWorld, claimed: Set<string>): RowState {
    const call = row.call!;
    const order = rs.orderId
        ? w.orders.find(o => o.id === rs.orderId)
        : w.orders.find(o => !(rs.ordersBefore ?? []).includes(o.id) && !claimed.has(o.id) && sameCall(o, call));
    const intel = w.intel
        .filter(r => r.id > (rs.intelAfter ?? 0) && sameCall(r, call))
        .sort((a, b) => b.id - a.id)[0];
    let next: RowState = { ...rs, ...(order ? { orderId: order.id } : {}), ...(intel ? { verdict: intel.verdict ?? null } : {}) };
    const waited = w.now - (rs.sentAt ?? w.now);
    const blockedByPhone = !!intel?.verdict && intel.verdict !== 'pass' && intel.verdict !== 'locked';

    if (row.kind === 'keep' || row.kind === 'cancel') {
        const want = row.kind === 'keep' ? 'KEEP' : '❌ 취소';
        if (order) {
            if (CONFIRMED.includes(order.status)) {
                return row.kind === 'keep' ? finish(next, 'ok', '✅ KEEP', w.now) : finish(next, 'warn', '🟠 KEEP 했다 — 취소여야 했다', w.now);
            }
            if (CANCELED.includes(order.status)) {
                return row.kind === 'cancel' ? finish(next, 'ok', '✅ 올라왔고 취소했다', w.now) : finish(next, 'bad', '🔴 취소됐다 — KEEP 이어야 했다', w.now);
            }
            return { ...next, mark: 'sent', note: `${row.kind === 'keep' ? '🟢' : '🟡'} 지금 관제웹에서 ${want}` };
        }
        /**
         * 🔴 **폰이 막아도 곧바로 끝내지 않는다** (2026-09-15 · onedal-49 합의) — 폰은 새 콜을 직전 필터로 먼저 판정하고
         *    원달앱 #135 가 다음 필터 버전에 막았던 콜을 다시 판정한다. NO_SHOW_MS 까지 기다려 재판정이 통과해 올라오면 위에서 ✅.
         *    끝내 막히면 막힘 기록이 몇 번인가로 «재판정 없음 / 재판정도 막힘»을 갈라 적는다 — 원달앱 재스캔이 필요한지 다음 바퀴에서 센다.
         */
        if (blockedByPhone) {
            if (waited < NO_SHOW_MS) return { ...next, mark: 'sent', note: `⏳ 폰이 막았다(${intel!.verdict}) — 새 필터로 다시 판정하기를 기다린다` };
            const blocks = w.intel.filter(r => r.id > (rs.intelAfter ?? 0) && sameCall(r, call) && !!r.verdict && r.verdict !== 'pass' && r.verdict !== 'locked').length;
            return finish(next, 'bad', blocks >= 2 ? '🔴 폰이 막았다 — 재판정도 막힘' : `🔴 폰이 막았다 — 재판정 없음(${NO_SHOW_MS / 1000}초)`, w.now);
        }
        if (waited >= NO_SHOW_MS) return { ...next, mark: 'bad', note: `🔴 ${NO_SHOW_MS / 1000}초 동안 안 올라왔다 — 시뮬레이터가 «🚚 개별콜» 탭인가 · [건너뛰기]` };
        return { ...next, mark: 'sent', note: `⏳ 폰이 읽는 중 — 올라오면 ${want}` };
    }

    /* ⚪ 막힘 */
    if (order) {
        if (CONFIRMED.includes(order.status) || CANCELED.includes(order.status)) {
            return finish(next, 'bad', CANCELED.includes(order.status) ? '🔴 뚫렸다 (취소함)' : '🔴 뚫렸다 — KEEP 까지 됐다', w.now);
        }
        return { ...next, mark: 'bad', note: '🔴 뚫림 — 관제웹에서 ❌ 취소' };
    }
    if (intel) {
        if (intel.verdict === row.blockBy) return finish(next, 'ok', '✅ 막힘', w.now);
        if (intel.verdict === 'pass') {
            next = { ...next, passAt: rs.passAt ?? w.now };
            if (w.now - next.passAt! >= PASS_WAIT_MS) return finish(next, 'bad', '🔴 뚫림 — 폰이 통과시켰다 (안 잡음)', w.now);
            return { ...next, mark: 'bad', note: '🔴 폰이 통과시켰다 — 올라오면 ❌ 취소' };
        }
        if (intel.verdict === 'locked' || intel.verdict == null) return finish(next, 'unknown', '❔ 폰이 판정을 안 실었다 (잠김·구앱)', w.now);
        return finish(next, 'warn', '🟠 막혔지만 다른 축', w.now);
    }
    if (waited >= NO_VERDICT_MS) return { ...next, mark: 'unknown', note: '❔ 30초 동안 폰이 못 봤다 — 시뮬레이터가 «🚚 개별콜» 탭인가 · [건너뛰기]' };
    return { ...next, mark: 'sent', note: '⏳ 폰이 읽는 중 — 안 올라와야 맞다' };
}

/**
 * 한 걸음 — 1초마다 «세상»을 넘겨받아 지금 줄을 판단한다.
 * @returns 새 상태 · 이번에 시뮬레이터에 낼 콜(없으면 null)
 */
export function stepScenario(def: ScenarioRow[], st: ScenarioState, w: ScenarioWorld): { state: ScenarioState; send: SimCallInput | null } {
    if (st.finished) return { state: st, send: null };
    let rows = st.rows.slice();
    let index = st.index;

    /* 끝난 줄은 3초 뒤 채점하고 다음 줄로 */
    const cur = rows[index];
    if (cur.doneAt != null) {
        if (w.now - cur.doneAt < SETTLE_MS) return { state: st, send: null };
        const checks = (def[index].checks ?? []).map(c => ({ label: checkLabel(c), ok: checkOk(c, w.filter) }));
        rows[index] = { ...cur, ...(checks.length ? { checks } : {}) };
        index += 1;
        if (index >= def.length) return { state: { ...st, rows, index: def.length - 1, finished: true }, send: null };
    }

    const row = def[index];
    let rs = rows[index];
    let send: SimCallInput | null = null;

    if (row.kind === 'act') {
        const { ready, note } = readiness(def, { ...st, rows }, row, w);
        if (row.done && checkOk(row.done, w.filter)) rs = finish(rs, 'ok', `✅ ${checkLabel(row.done)}`, w.now);
        else rs = { ...rs, mark: 'wait', note: ready ? row.say : note };
    } else if (rs.sentAt == null) {
        const { ready, note } = readiness(def, { ...st, rows }, row, w);
        if (ready) {
            send = toSimCall(row.call!);
            rs = {
                ...rs, mark: 'sent', note: '⏳ 시뮬레이터에 냈다 — 폰이 읽는 중', sentAt: w.now,
                ordersBefore: w.orders.map(o => o.id),
                intelAfter: w.intel.reduce((m, r) => Math.max(m, r.id), 0),
            };
        } else {
            rs = { ...rs, mark: 'wait', note };
        }
    } else {
        const claimed = new Set(rows.filter((x, i) => i !== index && x.orderId).map(x => x.orderId!));
        rs = judgeSent(row, rs, w, claimed);
    }
    rows[index] = rs;
    return { state: { ...st, rows, index }, send };
}

/**
 * 🫳 **거둘 콜 번호** — 끝난 줄(`doneAt`)이 낸 콜 중 아직 안 거둔 것 (2026-09-15 일곱 번째 바퀴 · onedal-49 합의).
 *    실주행에서 콜은 누가 잡으면 목록에서 사라진다. 채점이 끝난 콜을 목록에 두면 필터가 바뀐 뒤 잡혀 다음 줄을 오염시킨다(B2 → C3).
 *    🔴 «🔴 인데 기다리는 중»(doneAt 없음)은 안 거둔다 — 재판정이 통과해 올라올 자리다.
 */
export function seqsToWithdraw(rows: RowState[], already: number[]): number[] {
    return rows.filter(r => r.doneAt != null && r.seq != null && !already.includes(r.seq)).map(r => r.seq!);
}

/** ⏭️ 건너뛰기 — 지금 줄을 건너뜀으로 적고 다음 줄로 (채점 없이) */
export function skipScenarioRow(def: ScenarioRow[], st: ScenarioState, now: number): ScenarioState {
    if (st.finished) return st;
    const rows = st.rows.slice();
    rows[st.index] = { ...rows[st.index], mark: 'skip', note: '⏭️ 건너뜀', doneAt: now };
    const index = st.index + 1;
    if (index >= def.length) return { ...st, rows, index: def.length - 1, finished: true };
    return { ...st, rows, index };
}
