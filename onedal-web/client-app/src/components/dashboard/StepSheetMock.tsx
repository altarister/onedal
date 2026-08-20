/**
 * 🌱 **단계 시트 — DB 값으로 그리는, 기존 시트와 같은 옷** (2026-08-20)
 *
 * 처음엔 목업이었다 (기사님: *"작동하지 않아도 되니까 디자인이 같도록"*).
 * 이제 한 단계씩 **기능을 이식**한다 (기사님: *"지금부터 한 스텝씩 기능을 이식해줘"*).
 *
 * 🚚 **이식 진행표**
 *   ① 상차지 통화 — ✅ 살아 있다 (기사님 확인 2026-08-21)
 *   ② 하차지 통화 — ✅ 같은 `LiveCall` — 방법·후작업·격자만 다르다
 *   ③⑤ 상·하차지 도착 — ✅ 사유 칩 + [건너뛰기][도착]. 이미 도착했으면 [도착 취소]
 *      🔴 `predictedAt` 은 **저장된 행의 값**을 싣는다 — 옛 시트의 `Date.now()+주행`
 *         (버튼 누른 시각 기준·여덟 번째 자리)이 새 경로에서는 태어날 수 없다
 *   ④⑥ 상차 완료 · 하차 완료 — ✅ 실측 짐(`ACTUAL`) + 완료/취소/건너뛰기 + 💾 실측 다시 저장 + 착불
 *
 * 🧭 **기획 반영** (기사님 승인 2026-08-21 — "장점은 살리고 단점은 죽인다"):
 *   · 헤더(장소·주소·📞)와 검산 문장 — 살림. 값은 저장·타임라인에서만 (계산은 죽임)
 *   · 적요 힌트·차종 기본값 배너 — **출생으로 옮김.** 화면은 `planned_source` 배지만 그린다
 *   · 지나간 격자 칸 — 흐리게 + 선택 불가 (못 지킬 약속을 권하지 않는다)
 *   · 죽임: `_diag` 계측(잴 병이 없다) · `canRewindTo` 제한(막대 자유 이동이 대체) ·
 *     onward 입력 UI(옛 화면도 2026-08-18 에 뺐다 — 데이터 통로만 남긴다)
 *
 *   저장은 전부 기존과 **같은 문**(`save-cargo-report`·`report-milestone`·`undo-milestone`)으로
 *   나간다. 옛 테이블과 단계 행(다리)이 같이 갱신되므로 위의 옛 시트와 갈라질 수 없다.
 *
 * 🔴 이식된 단계도 **계산은 하지 않는다** — 격자의 밑값(도착 예상)은 저장된 행에서 온다.
 *    여기서 시각을 만들면 일곱 번째 갈라짐이 된다 (규칙 ③).
 * 🔴 **약속 규칙은 옛 시트 그대로다**: 손대지 않은 추천값은 약속으로 저장하지 않는다
 *    (기사님: *"난 그런 결정을 내릴 권한이 없어"* — 확정 약속은 화주와 합의한 시각뿐).
 *
 * 스타일 출처: `StopCallSheet.tsx` 의 `chip()`·`Row`·격자·주 버튼 줄 — 클래스를 그대로 옮겼다.
 */
import { useState, useEffect } from 'react';
import { socket } from '../../lib/socket';
import { telHref } from '../../lib/routeUtils';
import {
    CARGO_UNITS, CARGO_UNIT_QUANTITY_INPUT, HANDLING_METHODS,
    PROTECTIONS, PROTECTION_MINUTES, protectionMinutes,
    AFTERWORKS, AFTERWORK_MINUTES, afterworkMinutes,
    CARGO_TAGS, CARGO_TAG_META, arrivalReasonGroupsFor, REASON_NEEDS_MEMO,
    dwellMinutes, unitPoints,
} from '@onedal/shared';
import type { CargoUnit } from '@onedal/shared';

/** 서버 `stepsView()` 가 주는 한 단계 */
export interface StepViewLike {
    step: string;
    label: string;
    born?: boolean;
    row: Record<string, any>;
}

const hhmm = (v?: string | null) => v ? new Date(v).toLocaleTimeString('ko-KR',
    { hour: '2-digit', minute: '2-digit', hour12: false }) : null;
const parse = (v?: string | null): string[] => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };

/* ── StopCallSheet 에서 그대로 옮긴 옷들 ── */
const chip = (active: boolean) =>
    `px-2.5 py-2 rounded-md text-[13px] font-bold border transition-colors ${
        active ? 'bg-info text-white border-info'
        : 'bg-surface-alt/50 text-text-primary border-border'
    }`;
const warnChip = (on: boolean) =>
    `px-2 py-1.5 rounded-md text-[11px] font-bold border ${
        on ? 'bg-warning text-white border-warning' : 'bg-surface-alt/40 text-text-primary border-border'
    }`;
const tagChip = (on: boolean) =>
    `px-2 py-1.5 rounded-md text-[11px] font-bold border ${
        on ? 'bg-info text-white border-info' : 'bg-surface-alt/40 text-text-primary border-border'
    }`;
const reasonChip = (on: boolean) =>
    `px-2 py-1 rounded-md text-[11px] font-bold border ${
        on ? 'bg-warning/85 text-white border-warning' : 'bg-surface-alt/40 text-text-muted border-border'
    }`;

function Row({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-2">
            <span className="w-[52px] shrink-0 text-[11px] font-bold text-text-muted pt-2">
                {title && `${title} :`}
            </span>
            <div className="flex gap-1.5 flex-wrap flex-1">{children}</div>
        </div>
    );
}

/** 모양만일 땐 span, 이식됐으면 button — 같은 옷을 입는다 */
function Chip({ cls, onTap, children }: { cls: string; onTap?: () => void; children: React.ReactNode }) {
    return onTap
        ? <button type="button" className={cls} onClick={onTap}>{children}</button>
        : <span className={cls}>{children}</span>;
}

/** 짐 폼 값 한 벌 — 이식된 단계는 이걸 상태로 든다 */
export interface CargoState {
    unit: string | null; qty: number | null; handling: string | null;
    protections: string[]; afterworks: string[]; tags: string[];
}
export function cargoOfRow(r: Record<string, any>): CargoState {
    return {
        unit: r.planned_unit ?? null, qty: r.planned_quantity ?? null,
        handling: r.planned_handling ?? null,
        protections: parse(r.planned_protections), afterworks: parse(r.planned_afterworks),
        tags: parse(r.planned_tags),
    };
}

const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter(x => x !== v) : [...list, v];

/** 짐 폼 — 통화(상차)·상차 완료가 같은 옷을 입는다. `on` 이 오면 눌리고, 없으면 모양만 */
function CargoForm({ r, pickup, live, on }: {
    r: Record<string, any>; pickup: boolean;
    live?: CargoState; on?: (patch: Partial<CargoState>) => void;
}) {
    const c = live ?? cargoOfRow(r);
    const { unit, qty, handling, protections, afterworks, tags } = c;
    const points = unitPoints(unit, qty);
    const qInput = unit ? (CARGO_UNIT_QUANTITY_INPUT[unit as CargoUnit] ?? { mode: 'preset' as const, options: [1, 2, 3] }) : null;

    return (
        <>
            {pickup && (
                <>
                    <Row title="단위">
                        {CARGO_UNITS.map(u => (
                            <Chip key={u} cls={chip(unit === u)}
                                onTap={on && (() => on({ unit: u, qty: null }))}>{u}</Chip>
                        ))}
                    </Row>
                    {qInput?.mode === 'preset' && (
                        <Row title="수량">
                            {qInput.options.map(q => (
                                <Chip key={q} cls={chip(qty === q)} onTap={on && (() => on({ qty: q }))}>{q}</Chip>
                            ))}
                        </Row>
                    )}
                    {qInput?.mode === 'digits' && (
                        <div className="flex flex-col gap-1">
                            <Row title="수량">
                                {qInput.tens.map(t => (
                                    <Chip key={`t${t}`} cls={chip(qty != null && Math.floor(qty / 10) * 10 === t)}
                                        onTap={on && (() => on({ qty: t + (qty ?? 0) % 10 }))}>{t}</Chip>
                                ))}
                            </Row>
                            <Row title="">
                                {qInput.ones.map(o => (
                                    <Chip key={`o${o}`} cls={`px-2 py-1.5 rounded-md text-[13px] font-bold border ${
                                        qty != null && qty % 10 === o ? 'bg-info text-white border-info'
                                                                      : 'bg-surface-alt/50 text-text-primary border-border'
                                    }`} onTap={on && (() => on({ qty: Math.floor((qty ?? 0) / 10) * 10 + o }))}>{o}</Chip>
                                ))}
                            </Row>
                            {qty != null && <div className="text-[11px] font-bold text-info pl-10">= {qty}개</div>}
                        </div>
                    )}
                </>
            )}

            <Row title={pickup ? '상차방법' : '하차방법'}>
                {HANDLING_METHODS.map(h => (
                    <Chip key={h} cls={chip(handling === h)} onTap={on && (() => on({ handling: h }))}>
                        {h}<span className="ml-1 text-[10px] font-normal opacity-70">{dwellMinutes(h, points)}분</span>
                    </Chip>
                ))}
            </Row>

            {pickup && (
                <Row title="화물 보호">
                    {PROTECTIONS.map(t => (
                        <Chip key={t} cls={warnChip(protections.includes(t))}
                            onTap={on && (() => on({ protections: toggle(protections, t) }))}>
                            {t}<span className="ml-1 text-[10px] font-normal opacity-70">{PROTECTION_MINUTES[t]}분</span>
                        </Chip>
                    ))}
                    {protections.length > 0 && (
                        <span className="text-[11px] text-text-muted self-center ml-1">합 {protectionMinutes(protections)}분</span>
                    )}
                </Row>
            )}

            {!pickup && (
                <Row title="후작업">
                    {AFTERWORKS.map(a => (
                        <Chip key={a} cls={warnChip(afterworks.includes(a))}
                            onTap={on && (() => on({ afterworks: toggle(afterworks, a) }))}>
                            {a}<span className="ml-1 text-[10px] font-normal opacity-70">{AFTERWORK_MINUTES[a]}분</span>
                        </Chip>
                    ))}
                    {afterworks.length > 0 && (
                        <span className="text-[11px] text-text-muted self-center ml-1">합 {afterworkMinutes(afterworks)}분</span>
                    )}
                </Row>
            )}

            {pickup && (
                <Row title="화물성질">
                    {CARGO_TAGS.map(t => (
                        <Chip key={t} cls={tagChip(tags.includes(t))}
                            onTap={on && (() => on({ tags: toggle(tags, t) }))}>
                            {CARGO_TAG_META[t].icon} {t}
                        </Chip>
                    ))}
                </Row>
            )}
        </>
    );
}

/**
 * 격자 선택 규칙 — `StopCallSheet.extendRange` 를 그대로 옮겼다.
 * 어떤 탭도 선택을 통째로 날리지 않는다 (기사님 실측 2026-08-19).
 */
function extendRange(from: string | undefined, until: string, tapped: string):
    { from: string | undefined; until: string } {
    const start = from ?? until;
    if (tapped < start) return { from: tapped, until };
    if (tapped > until) return { from: start, until: tapped };
    return { from: tapped, until };
}

interface SlotPick { until?: string; from?: string; touched: boolean }

/**
 * 도착시간 격자 — 밑값(도착 예상)은 **저장된 행**에서 온다. 계산하지 않는다.
 * `pick`/`onPick` 이 오면 이식된 것 — 옛 시트의 탭 규칙 그대로 움직인다.
 */
function SlotGrid({ r, pick, onPick }: {
    r: Record<string, any>; pick?: SlotPick; onPick?: (next: SlotPick) => void;
}) {
    const predicted = r.predicted_at as string | null;
    const storedPromise = r.promised_arrival_at as string | null;
    if (!predicted) {
        return (
            <div className="text-[11px] text-warning bg-warning/10 border border-warning/35 rounded-md px-2 py-1.5">
                ⚠️ 주행 시간을 아직 모릅니다 — 도착 시각을 계산할 수 없습니다
            </div>
        );
    }
    const storedFrom = r.promised_arrival_from_at as string | null;
    const baseMs = Date.parse(predicted);
    const slots = Array.from({ length: 5 }, (_, i) => new Date(baseMs + i * 30 * 60_000).toISOString());
    // 이식 전(모양만)이거나 아직 안 누른 상태 — 저장된 약속과 가장 가까운 칸에 불
    const nearest = (iso: string | null) => iso == null ? undefined
        : slots.reduce((best, s) => Math.abs(Date.parse(s) - Date.parse(iso)) < Math.abs(Date.parse(best) - Date.parse(iso)) ? s : best, slots[0]);
    const until = pick?.touched ? pick.until : (pick?.until ?? nearest(storedPromise));
    /* 🔴 저장된 **"부터"도 읽는다** (기사님 실측 2026-08-21) — 기간(04:16~05:16)으로 저장했는데
       격자가 "까지"만 그려서 기간이 사라진 것처럼 보였다. 저장은 되고 있었다 — 표시가 문제였다 */
    const from = pick?.touched ? pick.from : nearest(storedFrom);

    const tap = onPick ? (iso: string) => {
        // 옛 시트의 규칙 그대로 — 양 끝을 다시 누르면 그 끝만 푼다
        if (until === iso && !from) { onPick({ until: undefined, from: undefined, touched: true }); return; }
        if (from === iso) { onPick({ until, from: undefined, touched: true }); return; }
        if (until === iso && from) { onPick({ until: from, from: undefined, touched: true }); return; }
        if (!until) { onPick({ until: iso, from: undefined, touched: true }); return; }
        const next = extendRange(from, until, iso);
        onPick({ until: next.until, from: next.from, touched: true });
    } : undefined;

    return (
        <div>
            <Row title="도착시간">
                {slots.map((iso, i) => {
                    const on = until === iso;
                    const isFrom = from === iso;
                    const inRange = !!from && !!until && iso > from && iso < until;
                    /* ⏳ 지나간 시각은 못 지킬 약속이다 — 흐리게, 못 누르게 (기획 ⑧).
                       이미 골라 둔 칸이면 그대로 보인다 — 기록을 지우지 않는다 */
                    const past = Date.parse(iso) < Date.now() && !on && !isFrom;
                    /* ⏱️ 시한(주행×150%+픽업 보정) 넘는 칸 — 표시만 하고 **막지 않는다**.
                       여기는 통화 중이다 — 화주가 이 시각에 합의하면 그게 면책이다 (시한은 관행) */
                    const over = r.deadline_at && iso > r.deadline_at;
                    return (
                        <Chip key={iso} onTap={tap && !past ? (() => tap(iso)) : undefined}
                            cls={`px-2.5 py-1.5 rounded-md border text-[13px] font-black tabular-nums transition-colors ${
                                on || isFrom ? 'bg-info text-white border-info'
                                : past ? 'bg-surface-alt/30 text-text-muted/50 border-border border-dashed line-through'
                                : inRange ? 'bg-info/20 text-text-primary border-info/40'
                                : i === 0 ? 'bg-surface-alt/50 text-text-muted border-border border-dashed'
                                : 'bg-surface-alt/50 text-text-primary border-border'
                            }`}>
                            {over && !past ? '⚠️' : ''}{hhmm(iso)}
                        </Chip>
                    );
                })}
            </Row>
            <div className="mt-1 text-[10px] leading-tight text-text-muted">
                {r.deadline_at && <>⚠️ <b className="tabular-nums">{hhmm(r.deadline_at)}</b> 넘는 칸은
                    업계 시한(주행×150%) 밖 — 화주 합의가 있으면 괜찮습니다 · </>}
                {pick?.touched
                    ? <>기사님이 고른 값 — 통화 완료 때 <b>약속으로 저장</b>됩니다</>
                    : <>ⓘ 저장된 값 — 도착 예상 <b className="tabular-nums">{hhmm(predicted)}</b>
                        {storedPromise && <> · 약속 <b className="tabular-nums">
                            {storedFrom ? `${hhmm(storedFrom)}~${hhmm(storedPromise)} 사이` : hhmm(storedPromise)}</b></>}
                        {onPick && <> — 누르면 그게 확정됩니다</>}</>}
            </div>
        </div>
    );
}

/**
 * 🗣️ **검산 문장** — 통화에서 그대로 읽는 대사 (기획 ③).
 *
 * 🔴 모든 항이 **저장값·타임라인 값의 뺄셈**이다. 시트가 시각을 만들던 시절의
 *    44분/129분 사고(2026-08-20)가 여기서는 태어날 수 없다.
 *   상차: 여기서 (이름)까지 주행 X분, 대기 Y분 = 약속 도착 (상차 N분, 출발)
 *   하차: (앞이름)에서 N분 상차하고 출발시각 출발, 주행 X분, 휴게 Y분 = 약속 도착
 */
function Sentence({ r, pickup, place, prevName, leadMinutes, departPrevMs, segmentDriveMinutes }: {
    r: Record<string, any>; pickup: boolean; place?: StepPlace;
    prevName?: string | null; leadMinutes?: number | null;
    departPrevMs?: number | null; segmentDriveMinutes?: number | null;
}) {
    const promiseMs = r.promised_arrival_at ? Date.parse(r.promised_arrival_at) : null;
    const fromLabel = r.promised_arrival_from_at ? `${hhmm(r.promised_arrival_from_at)}~` : '';
    if (promiseMs == null) return null;
    const min = (v: number) => Math.round(v / 60_000);
    const waitCls = (m: number) => m >= 60 ? 'text-success' : m >= 30 ? 'text-info' : 'text-warning';
    const arrive = <b className="text-info tabular-nums">{fromLabel}{hhmm(r.promised_arrival_at)}</b>;

    if (pickup) {
        const predictedMs = r.predicted_at ? Date.parse(r.predicted_at) : null;
        const waitMin = predictedMs != null ? min(promiseMs - predictedMs) : null;
        const dwell = r.planned_dwell_min as number | null;
        return (
            <div className="text-[12px] text-text-primary leading-relaxed break-keep">
                여기서 {place?.name ? <>(<b>{place.name}</b>)까지</> : '거기까지'}{' '}
                {segmentDriveMinutes != null && <><b className="tabular-nums">주행 {segmentDriveMinutes}분</b>, </>}
                {waitMin != null && (waitMin >= 0
                    ? <>대기 <b className={`tabular-nums ${waitCls(waitMin)}`}>{waitMin}분</b> = </>
                    : <><span className="text-danger font-bold">약속보다 {-waitMin}분 늦음</span> = </>)}
                {arrive}{fromLabel ? ' 사이' : ''} 도착
                {dwell != null && (
                    <span className="text-text-muted"> (상차 {dwell}분,{' '}
                        <span className="tabular-nums">{hhmm(new Date(promiseMs + dwell * 60_000).toISOString())}</span> 출발)
                    </span>
                )}
            </div>
        );
    }
    // 하차 — 앞 정거장을 떠나는 시각·구간 주행은 타임라인이 만든 값이다 (departSentence 검사의 그 값)
    const restMin = departPrevMs != null && segmentDriveMinutes != null
        ? min(promiseMs - (departPrevMs + segmentDriveMinutes * 60_000)) : null;
    return (
        <div className="text-[12px] text-text-primary leading-relaxed break-keep">
            {departPrevMs != null ? (
                <>{prevName ? <b>{prevName}</b> : '상차지'}에서{' '}
                {leadMinutes != null && leadMinutes > 0 && <><b className="tabular-nums">{leadMinutes}분</b> 상차하고{' '}</>}
                <b className="tabular-nums">{hhmm(new Date(departPrevMs).toISOString())}</b> 출발,{' '}</>
            ) : (
                <>여기서 {place?.name ? <>(<b>{place.name}</b>)까지</> : '거기까지'}{' '}</>
            )}
            {segmentDriveMinutes != null && <b className="tabular-nums">주행 {segmentDriveMinutes}분</b>}
            {restMin != null && (restMin >= 0
                ? <>, 휴게 <b className={`tabular-nums ${waitCls(restMin)}`}>{restMin}분</b></>
                : <>, <span className="text-danger font-bold">약속보다 {-restMin}분 늦음</span></>)}
            {' = '}{arrive}{fromLabel ? ' 사이' : ''} 도착
        </div>
    );
}

/** 도착·완료 단계의 사유 칩 — `onToggle` 이 오면 눌리고, 없으면 저장된 것에 불만 */
function ReasonRows({ step, r, picked, onToggle }: {
    step: string; r: Record<string, any>;
    picked?: string[]; onToggle?: (reason: string) => void;
}) {
    const lit = picked ?? parse(r.reasons);
    const groups = arrivalReasonGroupsFor(step as any);
    if (!groups.length) return null;
    return (
        <div className="flex flex-col gap-1">
            {groups.map(g => (
                <div key={g.label} className="flex gap-1 flex-wrap items-center">
                    <span className="w-[64px] shrink-0 text-[11px] font-bold text-text-muted">{g.label}</span>
                    {g.reasons.map(reason => (
                        <Chip key={reason} cls={reasonChip(lit.some(p => p === reason || p.startsWith(`${reason}:`)))}
                            onTap={onToggle && (() => onToggle(reason))}>
                            {reason}
                        </Chip>
                    ))}
                </div>
            ))}
        </div>
    );
}

/* ── 주 버튼 줄 — 기존 시트의 옷 그대로 ── */
const skipBtn = 'shrink-0 px-4 rounded-lg border border-border bg-surface-alt/60 text-text-primary font-bold py-3.5 text-[14px]';
const mainBtn = 'flex-1 rounded-lg bg-info text-white font-black py-3.5 text-[15px] active:scale-[0.99] transition-transform';
const skipSmall = 'w-[20%] shrink-0 py-2.5 rounded-md border border-dashed border-border bg-surface-alt/30 text-text-muted text-[12px] font-bold';
const arriveBtn = 'flex-1 py-2.5 rounded-md bg-warning text-white text-[13px] font-black';
const doneBtn = 'flex-1 py-2.5 rounded-md bg-success text-white text-[13px] font-black';

/**
 * 🚚 이식 ①②: 통화 두 단계 — 행 값으로 시작해, 저장은 옛 시트와 같은 문으로.
 * 상차는 짐 폼 전부, 하차는 방법·후작업만 (짐은 상차에서 정해진다 — 테이블에 칸도 없다).
 */
function LiveCall({ orderId, r, pickup, place, prevName, leadMinutes, departPrevMs, segmentDriveMinutes }: {
    orderId: string; r: Record<string, any>; pickup: boolean; place?: StepPlace;
    prevName?: string | null; leadMinutes?: number | null;
    departPrevMs?: number | null; segmentDriveMinutes?: number | null;
}) {
    const [cargo, setCargo] = useState<CargoState>(() => cargoOfRow(r));
    const [memo, setMemo] = useState<string>(r.memo ?? '');
    const [pick, setPick] = useState<SlotPick>({ touched: false });
    /**
     * 저장(steps-synced)이 오면 행이 바뀐다 — 그때 상태를 행에 다시 맞춘다.
     * recorded_at 이 안 바뀌었으면 기사님이 고치는 중일 수 있으니 덮지 않는다.
     */
    useEffect(() => {
        setCargo(cargoOfRow(r)); setMemo(r.memo ?? ''); setPick({ touched: false });
    }, [r.recorded_at, r.occurred_at]);

    const done = r.status === 'DONE' || r.status === 'SKIPPED';
    const save = (kind: 'DECLARED' | 'SKIPPED') => {
        socket.emit('save-cargo-report', {
            orderId, stopType: pickup ? 'pickup' : 'dropoff', kind,
            ...(kind === 'DECLARED' ? {
                // 짐의 단위·수량·보호·성질은 **상차에서만** — 하차로 보내면 두 벌이 된다 (규칙 ③)
                unit: pickup ? cargo.unit ?? undefined : undefined,
                quantity: pickup ? cargo.qty ?? undefined : undefined,
                handling: cargo.handling ?? undefined,
                tags: pickup && cargo.tags.length ? cargo.tags : undefined,
                protections: pickup && cargo.protections.length ? cargo.protections : undefined,
                afterworks: !pickup && cargo.afterworks.length ? cargo.afterworks : undefined,
                // 🔴 손댄 것만 약속으로 — 안 누른 추천값은 싣지 않는다 (옛 시트의 규칙 그대로)
                promisedArrivalAt: pick.touched ? pick.until : undefined,
                promisedArrivalFromAt: pick.touched ? pick.from : undefined,
                memo: memo || undefined,
            } : { memo: '통화 없이 진행' }),
        });
    };

    return (
        <>
            <CargoForm r={r} pickup={pickup} live={cargo} on={patch => setCargo(prev => ({ ...prev, ...patch }))} />
            <Row title="기타">
                <input value={memo} onChange={e => setMemo(e.target.value)}
                    placeholder={pickup ? '통화에서 들은 그 밖의 것 — 지하 2층, 경비실 통과' : '통화에서 들은 그 밖의 것 — 5시 이후엔 문 닫음'}
                    className="w-full px-2 py-1.5 rounded-md bg-surface-alt/40 border border-border text-[12px] text-text-primary" />
            </Row>
            <SlotGrid r={r} pick={pick} onPick={setPick} />
            <Sentence r={r} pickup={pickup} place={place}
                prevName={prevName} leadMinutes={leadMinutes}
                departPrevMs={departPrevMs} segmentDriveMinutes={segmentDriveMinutes} />
            <div className="flex gap-2">
                <button type="button" className={skipBtn} onClick={() => save('SKIPPED')}>통화 스킵</button>
                <button type="button" className={mainBtn} onClick={() => save('DECLARED')}>
                    {done ? '다시 저장' : '통화 완료'}
                </button>
            </div>
        </>
    );
}

/**
 * 🚚 이식 ③⑤: 도착 두 단계 — 사유 칩 + [건너뛰기][📍 도착] / 이미 도착이면 [도착 취소].
 * 🔴 `predictedAt` 은 저장된 행의 값을 싣는다 — 버튼 누른 시각으로 예측을 만들지 않는다.
 */
function LiveArrive({ orderId, r, step }: { orderId: string; r: Record<string, any>; step: string }) {
    const [reasons, setReasons] = useState<string[]>(() => parse(r.reasons));
    const [reasonMemo, setReasonMemo] = useState('');
    useEffect(() => { setReasons(parse(r.reasons)); setReasonMemo(''); }, [r.recorded_at, r.occurred_at]);

    const milestone = step === 'ARRIVE_PICKUP' ? 'ARRIVED_PICKUP' : 'ARRIVED_DROPOFF';
    const arrived = !!r.occurred_at;
    const fire = () => socket.emit('report-milestone', {
        orderId, milestone,
        predictedAt: r.predicted_at ?? undefined,
        reasons: reasons.length
            ? reasons.map(x => x === REASON_NEEDS_MEMO && reasonMemo.trim() ? `${x}: ${reasonMemo.trim()}` : x)
            : undefined,
    });
    const skip = () => socket.emit('report-milestone', { orderId, milestone, source: 'SKIPPED' });
    /* 잘못 눌러도 되돌릴 수 있어야 한다 (기사님: "단계별로 저장하고 수정이 가능해야 한다") */
    const undo = () => {
        if (confirm(`도착 기록(${hhmm(r.occurred_at)})을 취소할까요?`))
            socket.emit('undo-milestone', { orderId, milestone });
    };

    return (
        <>
            {r.predicted_at && (
                <div className="text-[11px] text-text-muted">
                    도착 예상 <b className="text-text-primary tabular-nums">{hhmm(r.predicted_at)}</b>
                    {arrived && <> · 실제 <b className="text-text-primary tabular-nums">{hhmm(r.occurred_at)}</b>
                        {r.source && <span className="ml-1 text-[10px]">({r.source === 'GPS' ? '🛰️ 자동' : r.source === 'SKIPPED' ? '⏭️ 건너뜀' : '✍️ 직접'})</span>}</>}
                </div>
            )}
            {!arrived && <ReasonRows step={step} r={r} picked={reasons} onToggle={rs => setReasons(prev => toggle(prev, rs))} />}
            {arrived && <ReasonRows step={step} r={r} />}
            {!arrived && reasons.includes(REASON_NEEDS_MEMO) && (
                <input value={reasonMemo} onChange={e => setReasonMemo(e.target.value)}
                    placeholder="무슨 일이었나요? (한 줄)"
                    className="w-full px-2 py-1.5 rounded-md bg-surface-alt/40 border border-border text-[12px] text-text-primary" />
            )}
            <div className="flex gap-1.5">
                {!arrived && <button type="button" className={`${skipSmall} text-center`} onClick={skip}>⏭️ 건너뛰기</button>}
                {!arrived
                    ? <button type="button" className={`${arriveBtn} text-center`} onClick={fire}>📍 도착</button>
                    : <button type="button" className="flex-1 py-2.5 rounded-md border border-warning/40 bg-warning/10 text-warning text-[13px] font-black" onClick={undo}>↩︎ 도착 취소</button>}
            </div>
        </>
    );
}

/**
 * 🚚 이식 ④⑥: 완료 두 단계 — 실측 짐을 적고, 완료가 곧 다음 단계다.
 * 옛 시트와 같은 순서로 나간다: `save('ACTUAL')` → `report-milestone`.
 * 실측 폼은 **실측이 있으면 실측, 없으면 계획을 복사**해서 시작한다 (옛 loadInto 그대로).
 */
function LiveDone({ orderId, r, step, codAmount }: {
    orderId: string; r: Record<string, any>; step: string; codAmount?: number | null;
}) {
    const pickup = step === 'LOADED';
    const actualOf = (row: Record<string, any>): CargoState => ({
        unit: row.actual_unit ?? row.planned_unit ?? null,
        qty: row.actual_quantity ?? row.planned_quantity ?? null,
        handling: row.actual_handling ?? row.planned_handling ?? null,
        protections: row.actual_protections != null ? parse(row.actual_protections) : parse(row.planned_protections),
        afterworks: row.actual_afterworks != null ? parse(row.actual_afterworks) : parse(row.planned_afterworks),
        tags: row.actual_tags != null ? parse(row.actual_tags) : parse(row.planned_tags),
    });
    const [cargo, setCargo] = useState<CargoState>(() => actualOf(r));
    const [reasons, setReasons] = useState<string[]>(() => parse(r.reasons));
    const [reasonMemo, setReasonMemo] = useState('');
    useEffect(() => {
        setCargo(actualOf(r)); setReasons(parse(r.reasons)); setReasonMemo('');
    }, [r.recorded_at, r.occurred_at]);

    const done = !!r.occurred_at;
    const milestone = pickup ? 'PICKED_UP' : 'DELIVERED';
    const saveActual = () => socket.emit('save-cargo-report', {
        orderId, stopType: pickup ? 'pickup' : 'dropoff', kind: 'ACTUAL',
        unit: pickup ? cargo.unit ?? undefined : undefined,
        quantity: pickup ? cargo.qty ?? undefined : undefined,
        handling: cargo.handling ?? undefined,
        protections: pickup && cargo.protections.length ? cargo.protections : undefined,
        afterworks: !pickup && cargo.afterworks.length ? cargo.afterworks : undefined,
        tags: pickup && cargo.tags.length ? cargo.tags : undefined,
    });
    const fire = () => {
        if (!done) {
            saveActual();
            socket.emit('report-milestone', {
                orderId, milestone,
                predictedAt: r.predicted_at ?? undefined,   // 저장된 예측 — 버튼 시각으로 만들지 않는다
                reasons: reasons.length
                    ? reasons.map(x => x === REASON_NEEDS_MEMO && reasonMemo.trim() ? `${x}: ${reasonMemo.trim()}` : x)
                    : undefined,
            });
        } else if (confirm(`${pickup ? '상차' : '하차'} 완료 기록을 취소할까요?`)) {
            socket.emit('undo-milestone', { orderId, milestone });
        }
    };

    // ⚠️ 통화 대비 실측 배수 — 옛 시트의 경고 그대로 (계획과 실측이 한 행에 있어 조인이 없다)
    const dPts = unitPoints(r.planned_unit, r.planned_quantity);
    const aPts = unitPoints(cargo.unit, cargo.qty);
    const mismatch = pickup && dPts > 0 && aPts > 0 && Math.abs(aPts / dPts - 1) >= 0.01 ? aPts / dPts : null;

    const cod = r.cod_received as number | null;   // 1 수령 · 0 미수 · null 아직
    return (
        <>
            {(r.planned_unit || r.planned_handling) && (
                <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="px-1.5 py-0.5 rounded bg-info/15 text-info font-bold">📞 통화</span>
                    <span className="text-text-primary font-bold">
                        {[r.planned_unit && `${r.planned_unit} ${r.planned_quantity ?? ''}개`.trim(),
                          r.planned_handling, parse(r.planned_tags).join('·')].filter(Boolean).join(' · ')}
                    </span>
                </div>
            )}
            <CargoForm r={r} pickup={pickup} live={cargo} on={patch => setCargo(prev => ({ ...prev, ...patch }))} />
            {mismatch !== null && (
                <div className="text-[12px] font-black text-danger bg-danger/10 border border-danger/35 rounded-md px-2 py-2">
                    ⚠️ 실제가 통화의 {mismatch.toFixed(1)}배 — 사무실 확인이 필요할 수 있습니다
                </div>
            )}
            {!done && <ReasonRows step={step} r={r} picked={reasons} onToggle={rs => setReasons(prev => toggle(prev, rs))} />}
            {done && <ReasonRows step={step} r={r} />}
            {!done && reasons.includes(REASON_NEEDS_MEMO) && (
                <input value={reasonMemo} onChange={e => setReasonMemo(e.target.value)}
                    placeholder="무슨 일이었나요? (한 줄)"
                    className="w-full px-2 py-1.5 rounded-md bg-surface-alt/40 border border-border text-[12px] text-text-primary" />
            )}

            {/* 💵 착불 — 완료 버튼 **바로 위** (기사님: "완료 누르기 전에 내가 받을 거야") */}
            {!pickup && codAmount != null && codAmount > 0 && (
                <div className="rounded-md border border-warning/45 bg-warning/10 px-2.5 py-2">
                    <div className="text-[12px] font-black text-warning">
                        💵 착불 {codAmount.toLocaleString()}원 — 지금 받으세요
                    </div>
                    <div className="flex gap-2 mt-2">
                        <button type="button" onClick={() => socket.emit('cod-collected', { orderId, received: true })}
                            className={`flex-1 py-2.5 rounded-md text-[13px] font-black border ${
                                cod === 1 ? 'bg-success text-white border-success' : 'bg-success/12 text-success border-success/45'
                            }`}>{cod === 1 ? '✓ 받았음' : '받았음'}</button>
                        <button type="button" onClick={() => socket.emit('cod-collected', { orderId, received: false })}
                            className={`flex-1 py-2.5 rounded-md text-[13px] font-black border ${
                                cod === 0 ? 'bg-danger text-white border-danger' : 'bg-danger/10 text-danger border-danger/40'
                            }`}>{cod === 0 ? '✓ 미수' : '못 받음 · 미수'}</button>
                    </div>
                </div>
            )}

            <div className="flex gap-1.5">
                {/* ⏭️ 기록 없이 다음으로 — 하차 완료는 콜의 끝이라 건너뛸 수 없다 (옛 규칙 그대로) */}
                {pickup && !done && (
                    <button type="button" title="기록 없이 다음 단계로"
                        onClick={() => socket.emit('report-milestone', { orderId, milestone: 'PICKED_UP', source: 'SKIPPED' })}
                        className={`${skipSmall} text-center`}>⏭️</button>
                )}
                {/* 💾 완료 뒤에도 실측만 다시 저장 — 취소를 강요하면 시각 기록을 잃는다 (기획 ⑥) */}
                {done && (
                    <button type="button" title="현장 내용만 다시 저장" onClick={saveActual}
                        className="w-[20%] shrink-0 py-2.5 rounded-md border border-border bg-surface-alt/60 text-text-primary text-[12px] font-bold">
                        💾 저장
                    </button>
                )}
                <button type="button" onClick={fire}
                    className={`flex-1 py-2.5 rounded-md text-[13px] font-black border ${
                        done ? 'bg-text-muted/10 text-text-muted border-border'
                             : 'bg-success text-white border-success'
                    }`}>
                    {done ? `✓ ${pickup ? '상차' : '하차'}완료 ${hhmm(r.occurred_at)} · 취소`
                          : `${pickup ? '📦 상차 완료' : '🏁 하차 완료'}${reasons.length ? ` (문제 ${reasons.length}건)` : ''}`}
                </button>
                {/* 상차 취소는 완료 전에만 — 방출로 처리된다 (옛 시트와 같은 문·같은 동작) */}
                {pickup && !done && (
                    <button type="button"
                        onClick={() => socket.emit('cancel-at-stop', { orderId, stopType: 'pickup', reason: '현장 상차 불가' })}
                        title="상차 취소 — 방출로 처리됩니다"
                        className="w-[20%] shrink-0 py-2.5 rounded-md bg-danger/12 text-danger border border-danger/45 text-[12px] font-black">
                        ✕ 취소
                    </button>
                )}
            </div>
            {pickup && !done && (
                <div className="text-[10px] text-text-muted -mt-1">상차 취소는 방출로 처리되고, 이 장소에 사유가 기록됩니다</div>
            )}
        </>
    );
}

/** 기타(메모) — 모양만인 단계용 */
function MemoRow({ r }: { r: Record<string, any> }) {
    return (
        <Row title="기타">
            <div className={`w-full px-2 py-1.5 rounded-md bg-surface-alt/40 border border-border text-[12px] ${
                r.memo ? 'text-text-primary' : 'text-text-muted'
            }`}>
                {r.memo || '통화에서 들은 그 밖의 것 — 지하 2층, 경비실 통과'}
            </div>
        </Row>
    );
}

/**
 * 단계 하나 = 시트 하나. `stepsView()` 의 항목을 그대로 받는다.
 * 안 태어난 단계(born=false)는 통째로 흐리게 — 회색 예정.
 * `orderId` 가 있고 태어난 행이면 **이식된 단계는 진짜로 움직인다.**
 */
/** 헤더에 그릴 장소 — 카드가 경로에서 꺼내 준다 (행에는 없는 값) */
export interface StepPlace { name?: string; address?: string; phone?: string }

export default function StepSheetMock({ view, orderId, codAmount, place, prevName, leadMinutes, departPrevMs, segmentDriveMinutes }: {
    view: StepViewLike; orderId?: string; codAmount?: number | null;
    place?: StepPlace;
    /** 하차 문장의 앞 정거장 이름 · 상차 정차(분) — 타임라인·상차 행에서 온다 */
    prevName?: string | null; leadMinutes?: number | null;
    /** 🚚 타임라인이 만든 값 — 시트는 그리기만 한다 (2026-08-20 의 그 원칙) */
    departPrevMs?: number | null; segmentDriveMinutes?: number | null;
}) {
    const { step, row: r } = view;
    const born = view.born !== false;
    const isCall = step === 'CALL_PICKUP' || step === 'CALL_DROPOFF';
    const isArrive = step === 'ARRIVE_PICKUP' || step === 'ARRIVE_DROPOFF';
    const isDone = step === 'LOADED' || step === 'DELIVERED';
    const pickup = step === 'CALL_PICKUP' || step === 'ARRIVE_PICKUP' || step === 'LOADED';
    const liveNow = born && !!orderId;   // 🚚 이식 완료 — 태어난 행은 전부 살아 있다

    return (
        <div className={`flex flex-col gap-2 rounded-lg border border-border-card bg-surface-alt/20 p-2.5 ${born ? '' : 'opacity-45'}`}>
            {/* ── 헤더: 장소·주소·📞 — 통화 시트의 존재 이유 (기획 ②) ── */}
            {place && (place.name || place.address) && (
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        {place.name && <div className="text-[13px] font-black text-text-primary break-keep">{place.name}</div>}
                        {place.address && <div className="text-[11px] text-text-muted break-keep">{place.address}</div>}
                    </div>
                    {place.phone && (
                        <a href={telHref(place.phone)} onClick={e => e.stopPropagation()}
                            className="shrink-0 px-2.5 py-1.5 rounded-md border border-success/45 bg-success/10 text-success text-[12px] font-black">
                            📞 {place.phone}
                        </a>
                    )}
                </div>
            )}
            {/* ── 출처 배지 — 적요·차종 파싱은 출생이 했다. 화면은 어디서 온 값인지만 말한다 (규칙 ⑤-2) ── */}
            {isCall && pickup && r.status === 'PLANNED' && r.planned_source && (
                <div className="text-[11px] text-text-muted bg-surface-alt/40 rounded-md px-2 py-1.5">
                    {r.planned_source === 'MEMO'
                        ? <><b className="text-text-primary">📄 적요에서 읽음</b> — 틀리면 고치세요</>
                        : <><b className="text-text-primary">🚚 차종 기본값</b> — {r.planned_unit ? `${r.planned_unit} ${r.planned_quantity ?? ''}` : ''} 분량으로 눌러 뒀습니다. 통화로 확인하고 고치세요</>}
                </div>
            )}
            {/* 통화 단계 — 이식됐으면 진짜, 아니면 모양만 */}
            {isCall && (liveNow
                ? <LiveCall orderId={orderId!} r={r} pickup={pickup} place={place}
                    prevName={prevName} leadMinutes={leadMinutes}
                    departPrevMs={departPrevMs} segmentDriveMinutes={segmentDriveMinutes} />
                : (
                <>
                    <CargoForm r={r} pickup={pickup} />
                    <MemoRow r={r} />
                    <SlotGrid r={r} />
                    <div className="flex gap-2">
                        <span className={skipBtn}>통화 스킵</span>
                        <span className={`${mainBtn} text-center`}>통화 완료</span>
                    </div>
                </>
            ))}

            {/* 도착 단계 — 이식됐으면 진짜, 아니면 모양만 */}
            {isArrive && liveNow && <LiveArrive orderId={orderId!} r={r} step={step} />}
            {isArrive && !liveNow && (
                <>
                    {r.predicted_at && (
                        <div className="text-[11px] text-text-muted">
                            도착 예상 <b className="text-text-primary tabular-nums">{hhmm(r.predicted_at)}</b>
                            {r.occurred_at && <> · 실제 <b className="text-text-primary tabular-nums">{hhmm(r.occurred_at)}</b>
                                {r.source && <span className="ml-1 text-[10px]">({r.source === 'GPS' ? '🛰️ 자동' : r.source === 'SKIPPED' ? '⏭️ 건너뜀' : '✍️ 직접'})</span>}</>}
                        </div>
                    )}
                    <ReasonRows step={step} r={r} />
                    <div className="flex gap-1.5">
                        <span className={`${skipSmall} text-center`}>⏭️ 건너뛰기</span>
                        <span className={`${arriveBtn} text-center`}>📍 도착</span>
                    </div>
                </>
            )}

            {/* 완료 단계 — 이식됐으면 진짜 */}
            {isDone && liveNow && <LiveDone orderId={orderId!} r={r} step={step} codAmount={codAmount} />}

            {/* 상차 완료 — 모양만 (안 태어난 예정) */}
            {step === 'LOADED' && !liveNow && (
                <>
                    {(r.planned_unit || r.planned_handling) && (
                        <div className="flex items-center gap-1.5 text-[11px]">
                            <span className="px-1.5 py-0.5 rounded bg-info/15 text-info font-bold">📞 통화</span>
                            <span className="text-text-primary font-bold">
                                {[r.planned_unit && `${r.planned_unit} ${r.planned_quantity ?? ''}개`.trim(),
                                  r.planned_handling, parse(r.planned_tags).join('·')].filter(Boolean).join(' · ')}
                            </span>
                        </div>
                    )}
                    {/* 실측이 있으면 계획과 나란히 — 오차가 한 행에서 나온다 */}
                    {r.actual_unit && (
                        <div className="flex items-center gap-1.5 text-[11px]">
                            <span className="px-1.5 py-0.5 rounded bg-success/15 text-success font-bold">👁 실측</span>
                            <span className="text-text-primary font-bold">
                                {[`${r.actual_unit} ${r.actual_quantity ?? ''}개`.trim(), r.actual_handling].filter(Boolean).join(' · ')}
                            </span>
                        </div>
                    )}
                    <CargoForm r={r} pickup />
                    <ReasonRows step={step} r={r} />
                    <div className="flex gap-1.5">
                        <span className={`${doneBtn} text-center`}>📦 상차 완료</span>
                        <span className="w-[20%] shrink-0 py-2.5 rounded-md border border-danger/40 bg-danger/10 text-danger text-[12px] font-bold text-center">✕ 취소</span>
                    </div>
                    <div className="text-[10px] text-text-muted">상차 취소는 방출로 처리되고, 이 장소에 사유가 기록됩니다</div>
                </>
            )}

            {/* 하차 완료 — 모양만 (안 태어난 예정) */}
            {step === 'DELIVERED' && !liveNow && (
                <>
                    <CargoForm r={r} pickup={false} />
                    <ReasonRows step={step} r={r} />
                    <div className="flex gap-1.5">
                        <span className={`${doneBtn} text-center`}>🏁 하차 완료</span>
                    </div>
                </>
            )}
        </div>
    );
}
