/**
 * 🌱 **여섯 단계는 순서대로 태어난다** (2026-08-20 · 출생 모델로 개정)
 *
 * 처음에는 KEEP 때 여섯 행을 한 번에 만들었다. 기사님(2026-08-20):
 * *"한번에 생긴다면 상차지 통화할 때 값을 바꾸면 **뒤 필드도 찾아가 수정해줘야** 하잖아.
 * 어차피 시퀀스면 순서에 왔을 때 만들고, 다음 순서로 가면 **이전 값 가지고 와서**
 * 새로 row 만들어 넣으면 DB에 라이트만 하면 되니까 훨 좋아질 거 같다."*
 *
 * 맞다 — "뒤 행들을 찾아다니며 고치는" 코드가 이 레포에서 네 번 난
 * *화면은 메모리, 장부는 딴판* 사고의 자리다 (버그 대장 #4·#6·#8·#15).
 *
 * 🔴 **행은 태어날 때와 끝날 때만 쓴다.** 중간 수정이 없으니 두 벌이 될 수 없다.
 *   · 출생: 앞 단계가 끝나는 순간, **가장 신선한 값**(실측 > 통화 > 차종 기본)을 물려받아 INSERT
 *   · 마감: 그 단계의 사건(통화 저장·마일스톤)이 status·occurred_at·actual 을 채움
 *   · 아직 안 태어난 단계는 저장하지 않는다 — 화면에는 **회색 예정**으로 파생만 보여준다 (규칙 ③)
 *
 * `predicted_at` 은 **태어난 순간의 예측**으로 동결된다 — 실제(occurred_at)와 빼면
 * 그대로 예측 오차다 (todo ⑥).
 */
import db from '../db';
import { STEP_TABLES, defaultCargoByVehicle, dwellMinutes, unitPoints, recordsOfSteps,
         parseCargoHints, callDeadlineMs, pickupClockMsOf, DEFAULT_JUDGMENT,
         soloMinutesOf, derivationInputsOf } from '@onedal/shared';
import type { JudgmentConfig, CargoReport, Milestone, RouteTimelineEntry } from '@onedal/shared';

/** 🧭 경로가 아는 시각 — `deriveRouteTimeline` 의 결과를 그대로 받는다 (파생 한 곳 · 규칙 ③) */
export type RouteTl = Pick<RouteTimelineEntry, 'orderId' | 'stopType' | 'etaMs'>[];

/** 화면이 받는 한 단계 — 태어난 행이거나(born) 회색 예정(파생값)이다 */
export interface StepView {
    step: string;
    table: string;
    label: string;
    /** false 면 아직 안 태어났다 — row 는 저장 안 된 파생값이고 화면은 회색으로 그린다 */
    born: boolean;
    row: Record<string, any>;
}

const ORDER = ['CALL_PICKUP', 'CALL_DROPOFF', 'ARRIVE_PICKUP', 'LOADED', 'ARRIVE_DROPOFF', 'DELIVERED'] as const;
type StepId = typeof ORDER[number];

const tableOf = (step: StepId) => STEP_TABLES.find(t => t.step === step)!;
const iso = (ms: number | null) => ms == null ? null : new Date(ms).toISOString();
const ms = (v?: string | null) => v ? Date.parse(v) : null;
const j = (v: unknown) => v == null ? null : JSON.stringify(v);
const parse = (v?: string | null) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };

function bornRows(orderId: string): Partial<Record<StepId, any>> {
    const out: Partial<Record<StepId, any>> = {};
    for (const t of STEP_TABLES) {
        const r = db.prepare(`SELECT * FROM ${t.table} WHERE orderId = ?`).get(orderId);
        if (r) out[t.step as StepId] = r;
    }
    return out;
}

/**
 * 🧮 지금 아는 것 전부로 사슬을 한 번 계산한다.
 *
 * 실측이 있으면 실측이, 굳은 약속이 있으면 약속이 이긴다 — 없을 때만 추정한다.
 * 태어난 행의 값은 여기서 **읽기만** 한다 (다시 쓰지 않는다).
 */
function computeChain(o: any, born: Partial<Record<StepId, any>>, judgment?: JudgmentConfig,
    routeTl?: RouteTl) {
    const cfg = judgment ?? DEFAULT_JUDGMENT;
    const unk = { pickupDwellMin: cfg.unknown.pickupDwellMin, dropoffDwellMin: cfg.unknown.dropoffDwellMin };
    // ⏱️ 두 시계 (시간체계 ⑯) — 여유30·휴게30 은 폐기됐다. 지어낸 여유는 없다

    // ── 짐: **가장 신선한 것** — 상차 실측 > 상차 통화 계획 > **적요** > 차종 기본 (규칙 ⑤-2)
    //    🔴 적요 파싱은 여기(출생) 한 곳이다 (기사님 기획 승인 2026-08-21).
    //       옛 시트는 열릴 때마다 파싱했다 — 이제 태어날 때 한 번 읽어 계획에 넣고,
    //       화면은 `planned_source` 배지(📄 적요에서 읽음 · 🚚 차종 기본값)만 그린다.
    const loaded = born.LOADED, callP = born.CALL_PICKUP, callD = born.CALL_DROPOFF;
    const vehicleCargo = defaultCargoByVehicle(o.vehicleType);
    const hints = parseCargoHints(o.itemDescription, o.detailMemo);
    // 단위 없는 개수는 못 믿는다 — "30개"가 박스인지 마대인지 모른다
    const memoQty = hints.unit != null && hints.quantity != null ? hints.quantity : null;
    const unit = loaded?.actual_unit ?? callP?.planned_unit ?? hints.unit ?? vehicleCargo?.unit ?? null;
    const quantity = loaded?.actual_quantity ?? callP?.planned_quantity ?? memoQty ?? vehicleCargo?.quantity ?? null;
    const handling = loaded?.actual_handling ?? callP?.planned_handling ?? hints.handling ?? vehicleCargo?.handling ?? null;
    const protections: string[] = parse(loaded?.actual_protections) ?? parse(callP?.planned_protections) ?? ['결박'];
    const dropHandling = callD?.planned_handling ?? handling;
    const afterworks: string[] = parse(callD?.planned_afterworks) ?? ['정리'];
    const tags: string[] = parse(callP?.planned_tags) ?? (hints.tags?.length ? hints.tags : null) ?? ['일반화물'];
    const source = loaded?.actual_unit != null ? 'ACTUAL'
        : callP && callP.status !== 'PLANNED' ? 'DECLARED'
        : hints.unit != null || hints.handling != null ? 'MEMO'
        : 'VEHICLE';

    const points = unitPoints(unit, quantity);
    const pickupDwell = dwellMinutes(handling, points, 'pickup', unk, protections);
    const dropoffDwell = dwellMinutes(dropHandling, points, 'dropoff', unk, null, afterworks);

    // ── 시각: 실측 > 굳은 약속 > 추정 의 사슬 (접근은 저장 컬럼이 아니라 뺄셈이다 — 2026-08-20)
    const capturedMs = Date.parse(o.capturedAt ?? new Date().toISOString());
    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
    // 🚚 실측이 없으면 배송거리로 추정 — 값이 태어나는 자리는 soloMinutesOf 하나다 (규칙 ③)
    const soloPair = soloMinutesOf(o as any, derivationInputsOf(judgment ?? DEFAULT_JUDGMENT).rules);
    const solo = soloPair.minutes;
    const total = num(o.totalDurationMin);
    /**
     * 🔴 **접근 주행은 «같은 출처끼리» 뺀다** (2026-08-26 자기 리뷰에서 잡음).
     *
     * 접근은 저장 컬럼이 아니라 뺄셈이다 — `카카오 전체 − 카카오 단독`.
     * 단독이 **추정**이면 카카오 전체에서 추정을 빼는 꼴이 되어 의미가 없다.
     * 게다가 `Math.max(0, …)` 이 음수를 가려 **«0분»으로 조용히** 나온다 —
     * 화면이 "상차지까지 0분"이라고 거짓말한다 (규칙 ⑤-4 ④).
     * 추정일 때는 **모른다고 둔다** (규칙 ④).
     */
    const approach = total != null && solo != null && !soloPair.estimated
        ? Math.max(0, total - solo) : null;

    /**
     * 🧭 **경로가 알면 경로가 이긴다** (기사님 실측 2026-08-21 · 3콜 리허설).
     *    합짐은 kakaoSolo 가 없어 예측이 전부 null 이었는데, 경로(타임라인)는
     *    `⑴ 상차 4분`을 알고 있었다. 콜 단독 값은 경로가 모를 때의 폴백이다.
     */
    const tlEta = (stop: 'pickup' | 'dropoff') =>
        routeTl?.find(e => e.orderId === o.id && e.stopType === stop)?.etaMs ?? null;
    const pickupEta = ms(born.ARRIVE_PICKUP?.occurred_at)
        ?? tlEta('pickup')
        ?? (approach != null ? capturedMs + approach * 60_000 : null);
    /**
     * ⏱️ **상차 시계** (주선사의 시계 · ⑯) — 통화 전 추정 상차 약속의 원천:
     *    적요의 상차 시각 > (통화 약속 — 굳었으면 아래에서 이김) > 잡은 시각 + 잠정 30분.
     *    🔴 **캡 바닥** (리허설 13번 버그): 시계가 도착 예상보다 일러도 도착 전 시각을
     *    약속으로 지어내지 않는다 — 약속 = 도착 예상, 모자람은 상차버퍼 음수로 보인다.
     */
    const memoPickupMs = (() => {
        if (!hints.promisedAt) return null;                       // "12:42상차" → HH:MM
        const kstDay = new Date(capturedMs + 9 * 3600_000).toISOString().slice(0, 10);
        const t = Date.parse(`${kstDay}T${hints.promisedAt}:00+09:00`);
        return Number.isFinite(t) && t >= capturedMs ? t : null;  // 과거 시각이면 무시
    })();
    const pickupClockMs = memoPickupMs ?? capturedMs + (cfg.unknown.pickupOffsetMin ?? 30) * 60_000;
    const pickupPromise = ms(callP?.status !== 'PLANNED' ? callP?.promised_arrival_at : null)
        ?? (pickupEta != null ? Math.max(pickupEta, pickupClockMs) : pickupClockMs);
    const departMs = ms(born.LOADED?.occurred_at) ?? pickupPromise + pickupDwell * 60_000;
    const dropoffEta = ms(born.ARRIVE_DROPOFF?.occurred_at)
        ?? tlEta('dropoff')
        ?? (solo != null ? departMs + solo * 60_000 : null);
    /**
     * ⏱️ **배달 데드라인 = 상차 완료 + 배송 × 150%** (기산점은 상차 완료 · ⑯ 확정).
     *    근거: 소숙 자막 [09:08] "픽업 시간마다 도착 시간을 계산" + 콜①② 검산 —
     *    상차 전 대기는 배달 시계를 태우지 않는다. 휴게30 은 폐기 — 하차 추정 약속은
     *    데드라인 그 자체다 (경유버퍼 = 데드라인 − 예상이 저절로 여유를 말한다).
     *    🔴 굳은 약속(통화)은 데드라인과 무관하게 그대로 — 화주 합의가 면책.
     */
    const deadlineMs = callDeadlineMs(departMs, solo, cfg);
    const dropoffPromise = ms(callD?.status !== 'PLANNED' ? callD?.promised_arrival_at : null)
        ?? (deadlineMs != null
            ? Math.max(dropoffEta ?? deadlineMs, deadlineMs)     // 바닥: 예상이 데드라인 넘으면 예상(현실)
            : null);
    // 🔴 하차 완료도 **약속 기준** — 상차와 대칭 (2026-08-20)
    const deliveredMs = dropoffPromise != null ? dropoffPromise + dropoffDwell * 60_000 : null;

    const cargoCols = {
        planned_unit: unit, planned_quantity: quantity, planned_handling: handling,
        planned_tags: j(tags), planned_source: source, planned_at: new Date().toISOString(),
    };
    /** 단계마다 태어날 때 담는 값 — 자기 테이블에 있는 컬럼만 INSERT 된다 */
    const birth: Record<StepId, Record<string, any>> = {
        CALL_PICKUP: { ...cargoCols, predicted_at: iso(pickupEta), promised_arrival_at: iso(pickupPromise),
            planned_protections: j(protections), planned_dwell_min: pickupDwell, onward_deadline_at: null },
        CALL_DROPOFF: { ...cargoCols, planned_handling: dropHandling,
            predicted_at: iso(dropoffEta), promised_arrival_at: iso(dropoffPromise),
            // 상차 통화에서 하차지 시각까지 들었으면 미리 채워 태어난다
            ...(callP?.onward_deadline_at ? { promised_arrival_at: callP.onward_deadline_at } : {}),
            planned_afterworks: j(afterworks), planned_dwell_min: dropoffDwell },
        ARRIVE_PICKUP: { predicted_at: iso(pickupEta) },
        LOADED: { ...cargoCols, predicted_at: iso(departMs),
            planned_protections: j(protections), planned_dwell_min: pickupDwell },
        ARRIVE_DROPOFF: { predicted_at: iso(dropoffEta) },
        DELIVERED: { predicted_at: iso(deliveredMs), cod_received: null },
    };
    return birth;
}

function insertStep(userId: string, orderId: string, step: StepId, want: Record<string, any>) {
    const t = tableOf(step);
    const now = new Date().toISOString();
    const row: Record<string, any> = { status: 'PLANNED', ...want };
    const cols = t.columns.map(([, col]) => col).filter(c => c in row);
    db.prepare(
        `INSERT OR REPLACE INTO ${t.table} (orderId, userId, ${cols.join(', ')}, recorded_at)
         VALUES (?, ?, ${cols.map(() => '?').join(', ')}, ?)`
    ).run(orderId, userId, ...cols.map(c => row[c]), now);
}

/** KEEP 의 일: 첫 행(상차지 통화)만 태어난다 */
export function birthFirstStep(userId: string, orderId: string, judgment?: JudgmentConfig, routeTl?: RouteTl) {
    const o = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId) as any;
    if (!o) throw new Error(`콜을 찾을 수 없습니다: ${orderId}`);
    const born = bornRows(orderId);
    if (born.CALL_PICKUP) return;                        // 이미 태어났다 (재KEEP 등)
    insertStep(userId, orderId, 'CALL_PICKUP', computeChain(o, born, judgment, routeTl).CALL_PICKUP);
    console.log(`🌱 [출생] ${orderId.slice(-6)} · 상차지 통화 — KEEP`);
}

/** 앞이 끝났으니 다음 하나를 낳는다. 이미 있으면 아무것도 안 한다 */
function birthNext(userId: string, orderId: string, after: StepId, judgment?: JudgmentConfig, routeTl?: RouteTl) {
    const next = ORDER[ORDER.indexOf(after) + 1];
    if (!next) return;
    const born = bornRows(orderId);
    if (born[next]) return;
    const o = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId) as any;
    if (!o) return;
    insertStep(userId, orderId, next, computeChain(o, born, judgment, routeTl)[next]);
    console.log(`🌱 [출생] ${orderId.slice(-6)} · ${tableOf(next).label} ← ${tableOf(after).label} 끝`);
}

/**
 * 마감 — 그 단계의 사건이 가져온 값만 쓴다.
 *
 * 🔴 **거기까지의 미출생을 전부 낳는다** (기사님 실측 2026-08-21 · 3콜 리허설).
 *    예전엔 없는 행 하나만 낳아서, GPS 가 통화를 건너뛰면 하차지 통화가 영영
 *    미출생이었다 — 회색 모형이라 운행 중 통화를 못 했다. 빠뜨린 단계는
 *    PLANNED 로 태어나(안 한 건 안 한 것) 노란 막대로 보이고, 언제든 채울 수 있다.
 */
function finalizeStep(userId: string, orderId: string, step: StepId,
    patch: Record<string, any>, judgment?: JudgmentConfig, routeTl?: RouteTl) {
    let born = bornRows(orderId);
    if (!born[step]) {
        const o = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId) as any;
        if (!o) return;
        for (const st of ORDER.slice(0, ORDER.indexOf(step) + 1)) {
            if (born[st]) continue;
            insertStep(userId, orderId, st, computeChain(o, born, judgment, routeTl)[st]);
            born = bornRows(orderId);   // 앞 출생이 뒤 출생의 물려받기에 보이도록
            console.log(`🌱 [출생] ${orderId.slice(-6)} · ${tableOf(st).label} — 지나친 단계 채움`);
        }
    }
    const t = tableOf(step);
    const has = new Set(t.columns.map(([, col]) => col));
    const cols = Object.keys(patch).filter(c => has.has(c) && patch[c] !== undefined);
    if (cols.length) {
        db.prepare(`UPDATE ${t.table} SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE orderId = ?`)
          .run(...cols.map(c => patch[c]), orderId);
    }
    birthNext(userId, orderId, step, judgment, routeTl);
}

/**
 * 🌉 통화·현장 저장이 단계 행을 채운다. 실패해도 본 흐름을 막지 않는다 (호출부 try).
 *
 * ⚠️ 예전엔 «다리»였다 — 옛 표(`stop_cargo_reports`)와 나란히 쓰던 시절의 이름이다.
 *    **그 표는 2026-08-21 에 철거됐고 지금 이 경로가 유일한 저장 경로다** (08-29 정정).
 *    이름이 «곁다리»로 읽히면 호출부의 try 가 «실패해도 그만»으로 오해된다
 */
export function bridgeCargoReport(userId: string, orderId: string,
    report: CargoReport, judgment?: JudgmentConfig, routeTl?: RouteTl) {
    const now = new Date().toISOString();
    if (report.kind === 'DECLARED' || report.kind === 'SKIPPED') {
        const step: StepId = report.stopType === 'pickup' ? 'CALL_PICKUP' : 'CALL_DROPOFF';
        finalizeStep(userId, orderId, step, {
            status: report.kind === 'SKIPPED' ? 'SKIPPED' : 'DONE',
            occurred_at: now,
            source: report.kind === 'SKIPPED' ? 'SKIPPED' : 'MANUAL_WEB',
            // 🔴 약속이 여기서 굳는다 — 스킵이어도 미리 눌린 값이 확정이다 (기사님 2026-08-19)
            promised_arrival_at: report.promisedArrivalAt ?? undefined,
            promised_arrival_from_at: report.promisedArrivalFromAt ?? undefined,
            planned_unit: report.unit ?? undefined,
            planned_quantity: report.quantity ?? undefined,
            planned_handling: report.handling ?? undefined,
            planned_protections: report.protections ? j(report.protections) : undefined,
            planned_afterworks: report.afterworks ? j(report.afterworks) : undefined,
            planned_tags: report.tags ? j(report.tags) : undefined,
            planned_source: report.kind === 'SKIPPED' ? undefined : 'DECLARED',
            memo: (report as any).memo ?? undefined,
            onward_deadline_at: (report as any).onwardDeadlineAt ?? undefined,
        }, judgment, routeTl);
    } else {  // ACTUAL — 현장 실측은 완료 행의 actual_* 로 (행이 없으면 낳는다)
        const step: StepId = report.stopType === 'pickup' ? 'LOADED' : 'DELIVERED';
        finalizeStep(userId, orderId, step, {
            actual_unit: report.unit ?? undefined,
            actual_quantity: report.quantity ?? undefined,
            actual_handling: report.handling ?? undefined,
            actual_protections: report.protections ? j(report.protections) : undefined,
            actual_afterworks: report.afterworks ? j(report.afterworks) : undefined,
            actual_tags: report.tags ? j(report.tags) : undefined,
        }, judgment, routeTl);
    }
}

/** 🌉 마일스톤 → 단계 마감 + 다음 출생. GPS 도 여기로 온다 (본체는 하나) */
const MILESTONE_TO_STEP: Partial<Record<string, StepId>> = {
    ARRIVED_PICKUP: 'ARRIVE_PICKUP', PICKED_UP: 'LOADED',
    ARRIVED_DROPOFF: 'ARRIVE_DROPOFF', DELIVERED: 'DELIVERED',
};
export function bridgeMilestone(userId: string, orderId: string, milestone: Milestone,
    source: string, occurredAt?: string, reasons?: string[], judgment?: JudgmentConfig, routeTl?: RouteTl) {
    const step = MILESTONE_TO_STEP[milestone];
    if (!step) return;
    finalizeStep(userId, orderId, step, {
        status: source === 'SKIPPED' ? 'SKIPPED' : 'DONE',
        occurred_at: occurredAt ?? new Date().toISOString(),
        source,
        reasons: reasons?.length ? j(reasons) : undefined,
    }, judgment, routeTl);
}

/**
 * 🧭 **경로가 바뀌면 PLANNED 행의 예상이 따라온다** (합짐 KEEP · 경로 재계산).
 *
 * 동결 규칙의 반쪽이다 — **굳은 것(DONE·SKIPPED)은 안 건드리고**, PLANNED 행의
 * `predicted_at` 과 아직 안 굳은 약속만 새 경로로 다시 쓴다. 약속은 통화로만 굳는다.
 * "행은 태어날 때와 끝날 때만 쓴다"의 예외가 아니다 — 경로 변경도 **사건**이고,
 * PLANNED 행의 예상은 애초에 흐르는 값이다 (2026-08-20 합의).
 */
export function refreshPlannedSteps(userId: string, orderId: string,
    judgment?: JudgmentConfig, routeTl?: RouteTl) {
    const o = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId) as any;
    if (!o) return;
    const born = bornRows(orderId);
    const chain = computeChain(o, born, judgment, routeTl);
    for (const step of ORDER) {
        const row = born[step];
        if (!row || row.status !== 'PLANNED') continue;      // 굳은 행은 불변
        const want = chain[step];
        const t = tableOf(step);
        const has = new Set(t.columns.map(([, col]) => col));
        const patch: Record<string, any> = {};
        if (has.has('predicted_at')) patch.predicted_at = want.predicted_at ?? null;
        if (has.has('promised_arrival_at') && want.promised_arrival_at !== undefined)
            patch.promised_arrival_at = want.promised_arrival_at;
        const cols = Object.keys(patch);
        if (cols.length) {
            db.prepare(`UPDATE ${t.table} SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE orderId = ?`)
              .run(...cols.map(c => patch[c]), orderId);
        }
    }
}

/**
 * 🌉 착불 수령 → 하차 완료 행의 `cod_received`. 행이 아직 없으면 조용히 넘어간다 —
 * 옛 장부(`setCodCollected`)가 그대로 기록하고 있고, 하차 완료가 태어나기 전의 수령은 드물다.
 */
export function bridgeCod(orderId: string, received: boolean) {
    db.prepare(`UPDATE step_delivered SET cod_received = ? WHERE orderId = ?`)
      .run(received ? 1 : 0, orderId);
}

/**
 * 🌉 마일스톤 되돌리기 → 단계 행도 되돌린다 (기사님: *"단계별로 저장하고 수정이 가능해야 한다"*).
 *
 * 마감만 푼다 — `status` 를 PLANNED 로, 사건 기록(occurred·source·reasons)을 비운다.
 * ⚠️ **이미 태어난 다음 행은 지우지 않는다.** PLANNED 로 무해하게 남고, 제 사건이 오면
 *    마감된다. 지우면 "행은 태어날 때와 끝날 때만 쓴다"가 깨지고 출생 로그도 사라진다.
 */
export function bridgeUndoMilestone(userId: string, orderId: string, milestone: Milestone) {
    const step = MILESTONE_TO_STEP[milestone];
    if (!step) return;
    const t = tableOf(step as StepId);
    db.prepare(`UPDATE ${t.table} SET status = 'PLANNED', occurred_at = NULL, source = NULL,
                reasons = NULL WHERE orderId = ?`).run(orderId);
    console.log(`🌱 [되돌림] ${orderId.slice(-6)} · ${t.label} → PLANNED`);
}

/**
 * 🔄 **파생 치환 ② — 서버 계산의 재료를 새 장부(여섯 단계 행)에서** (2026-08-21).
 *
 * 옛 장부(stop_cargo_reports · order_milestones)를 읽던 계산 소비처(적재·정차·
 * 짐 성질·타임라인·복구)가 전부 **이 관문 하나**를 거친다.
 * KEEP 전 후보는 행이 없어 빈 기록이 나온다 — 옛 장부와 같은 동작이다.
 *
 * ⚠️ 예전 주석은 *"쓰기는 아직 양쪽(다리) — 넘어가면 옛 테이블을 손으로 철거한다"* 였는데
 *    **철거는 2026-08-21 에 이미 끝났다** (db.ts:277 · OrderRepository.ts:84).
 *    지금 이 표가 **유일한 원천**이다 — «곁다리라 실패해도 된다»로 읽히면 안 된다 (08-29 정정)
 */
/** 이 마일스톤이 이미 새 장부에 찍혀 있는가 — reportMilestone 멱등의 근거 (옛 UNIQUE 대체) */
export function milestoneAlreadyRecorded(orderId: string, milestone: string): boolean {
    const step = ({ ARRIVED_PICKUP: 'ARRIVE_PICKUP', PICKED_UP: 'LOADED',
                    ARRIVED_DROPOFF: 'ARRIVE_DROPOFF', DELIVERED: 'DELIVERED' } as Record<string, StepId>)[milestone];
    if (!step) return false;
    const t = tableOf(step);
    const r = db.prepare(`SELECT occurred_at FROM ${t.table} WHERE orderId = ?`).get(orderId) as any;
    return !!r?.occurred_at;
}

export function stepRecordsOf(orderId: string): {
    reports: CargoReport[];
    milestones: Array<{ milestone: string; occurredAt?: string; source?: string }>;
} {
    return recordsOfSteps(stepsView(orderId)) as any;
}

/**
 * 화면용 — 태어난 행은 그대로, 안 태어난 단계는 **회색 예정**(파생값, 저장 안 됨).
 * 기사님(2026-08-20): *"다음에 뭐가 올지는 알아야지."*
 */
export function stepsView(orderId: string, judgment?: JudgmentConfig): StepView[] {
    const o = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId) as any;
    if (!o) return [];
    const born = bornRows(orderId);
    const chain = computeChain(o, born, judgment);
    // ⏱️ 파생 데드라인 — 저장하지 않는다 (규칙 ③). 격자의 ⚠️와 버퍼 줄 칩이 그린다.
    //    상차 = 상차 시계 · 하차 = 배달 데드라인(상차 완료 예정 기산 — 완료 예정은 사슬이 이미 계산)
    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
    const departPlanned = ms(born.LOADED?.occurred_at) ?? ms(chain.LOADED.predicted_at);
    const dl = departPlanned != null
        ? callDeadlineMs(departPlanned,
            soloMinutesOf(o as any, derivationInputsOf(judgment ?? DEFAULT_JUDGMENT).rules).minutes,
            judgment ?? DEFAULT_JUDGMENT) : null;
    // 상차 격자의 ⚠️ 기준 = **상차 시계**(무통보 한계) 그 자체 — 약속(바닥 적용값)이 아니다.
    //    실측(2026-08-21): 약속을 기준 삼으니 경로 유무에 따라 값이 흔들렸다
    const capturedMs2 = Date.parse(o.capturedAt ?? '');
    const clockMs = Number.isFinite(capturedMs2)
        ? pickupClockMsOf(o, capturedMs2, (judgment ?? DEFAULT_JUDGMENT).unknown.pickupOffsetMin ?? 30) : null;
    const deadlineOf = (step: StepId) =>
        step === 'CALL_DROPOFF' ? (dl != null ? new Date(dl).toISOString() : null)
        : step === 'CALL_PICKUP' ? (clockMs != null ? new Date(clockMs).toISOString() : null)
        : null;
    return ORDER.map(step => {
        const t = tableOf(step);
        const extra = (step === 'CALL_PICKUP' || step === 'CALL_DROPOFF')
            ? { deadline_at: deadlineOf(step) } : {};
        return born[step]
            ? { step, table: t.table, label: t.label, born: true, row: { ...born[step], ...extra } }
            : { step, table: t.table, label: t.label, born: false, row: { status: 'PLANNED', ...chain[step], ...extra } };
    });
}
