import { useState } from 'react';
import {
    HANDLING_METHODS, cargoPoints, parseCargoHints, hasCargoHints,
    CARGO_TAGS, CARGO_TAG_META, describeSlack, computeSlackMinutes,
    CARGO_UNIT_QUANTITIES, PICKUP_PRIMARY_UNITS, PICKUP_SECONDARY_UNITS,
    buildHourSlots, dwellMinutes, unitPoints,
} from '@onedal/shared';
import type { CargoReport, HandlingMethod, CargoReportKind, CargoUnit } from '@onedal/shared';
import { socket } from '../../lib/socket';

/**
 * [Phase 8.4] 정거장 카드 — 통화 / 현장
 *
 * ══ 핵심 원칙: **열지 않아도 결정 내용이 보인다** ══
 *
 * 기사님: *"통화를 했음에도 불구하고 어떤 내용이 결정되었는지 탭을 열지 않고는 알 수가 없어."*
 *
 * 그래서 탭을 없앴다. 대신 **요약 줄 두 개가 항상 떠 있고, 그 줄이 곧 열기 버튼**이다.
 *
 *     📞 통화  파레트 2개 · 지게차 · 17시까지 · 여유 113분        ▸
 *     👁 현장  파레트 3개 · 수작업 · ⚠️ 통화의 1.5배              ▸
 *
 * 한쪽을 펼쳐도 다른 쪽 요약은 그대로 남는다 —
 * 기사님이 *"탭을 바꿔 가면서 거짓말한 내용을 확인"* 하려던 것이 **바꾸지 않고도** 된다.
 *
 * 그 밖에 스크린샷 피드백으로 고친 것
 *   · 헤더 **진행 배지** (`📞 통화완료` `📍 도착 15:12` `👁 현장확인` `📦 상차완료`)
 *   · 큰 버튼 두 개 제거 — 아코디언이 이미 길다. 전화번호도 헤더 우측 작은 버튼으로
 *   · 펼치면 **저장된 내용부터**. 고칠 때만 `수정`
 *   · 현장 줄에 `📍 도착` `📦 상차 완료` `✕ 상차 취소` — 시각을 남기는 버튼
 *
 * ══ 통화 입력의 설계 기준 ══
 *   여유 = 마감시각 − (지금 + 이동 + 상하차)
 *            ↑ 협상 가능        ↑ 어쩔 수 없음
 *   기사님이 움직일 수 있는 레버는 마감 시각 하나뿐이라, 시각 버튼마다 여유를 붙였다.
 *   여유가 곧 합짐 여력이다.
 */

interface Props {
    orderId: string;
    stopType: 'pickup' | 'dropoff';
    label: string;
    address: string;
    contactName?: string;
    phones: string[];
    reports: CargoReport[];
    memoTexts?: (string | undefined)[];
    /** 이 정거장까지 남은 주행 시간(분) */
    driveMinutes?: number;
    /** 오더 상태 — 상차/하차 완료 배지에 쓴다 */
    orderStatus?: string;
    /** 이 정거장에 도착한 시각 (기록됐다면) */
    arrivedAt?: string;
}

const hhmm = (iso?: string) =>
    iso ? new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';

/** 저장된 신고 한 줄 요약 */
function summarize(r?: CargoReport): string {
    if (!r) return '';
    return [
        r.unit && `${r.unit}${r.quantity ? ` ${r.quantity}개` : ''}`,
        r.handling,
        r.tags?.join('·'),
        r.deadlineAt && `${hhmm(r.deadlineAt)}까지`,
    ].filter(Boolean).join(' · ');
}

export default function StopCallSheet({
    orderId, stopType, label, address, contactName, phones, reports,
    memoTexts, driveMinutes = 0, orderStatus, arrivedAt,
}: Props) {
    const isPickup = stopType === 'pickup';
    const [tab, setTab] = useState<CargoReportKind | null>(null);   // null = 접힘
    const [editing, setEditing] = useState(false);
    const [showMoreUnits, setShowMoreUnits] = useState(false);

    const declared = reports.find(r => r.stopType === stopType && r.kind === 'DECLARED');
    const actual = reports.find(r => r.stopType === stopType && r.kind === 'ACTUAL');
    const isCall = tab === 'DECLARED';
    const saved = isCall ? declared : actual;
    const ghost = !isCall ? declared : undefined;   // 현장 탭에서 통화값을 밑그림으로
    const pickupReport = reports.find(r => r.stopType === 'pickup' && r.kind === 'ACTUAL')
                      || reports.find(r => r.stopType === 'pickup');

    const [unit, setUnit] = useState<CargoUnit | undefined>();
    const [qty, setQty] = useState<number | undefined>();
    const [handling, setHandling] = useState<HandlingMethod | undefined>();
    const [memo, setMemo] = useState('');
    const [tags, setTags] = useState<string[]>([]);
    const [deadlineAt, setDeadlineAt] = useState<string | undefined>();

    const eff = {
        unit: unit ?? (ghost?.unit as CargoUnit | undefined),
        quantity: qty ?? ghost?.quantity,
        handling: handling ?? ghost?.handling,
    };
    const points = isPickup ? cargoPoints(eff) : unitPoints(pickupReport?.unit, pickupReport?.quantity);
    const dwell = dwellMinutes(eff.handling, points);
    const fixedMinutes = driveMinutes + dwell;

    const hints = parseCargoHints(...(memoTexts || []));
    const applyHints = () => {
        if (hints.unit) setUnit(hints.unit);
        if (hints.quantity != null) setQty(hints.quantity);
        if (hints.handling) setHandling(hints.handling);
        if (hints.tags?.length) setTags(prev => Array.from(new Set([...prev, ...hints.tags!])));
    };

    const loadInto = (src?: CargoReport) => {
        setUnit(src?.unit as CargoUnit | undefined);
        setQty(src?.quantity);
        setHandling(src?.handling);
        setTags(src?.tags || []);
        setMemo(src?.memo || '');
        setDeadlineAt(src?.deadlineAt);
    };

    const openTab = (k: CargoReportKind) => {
        if (tab === k) { setTab(null); setEditing(false); return; }
        const src = k === 'DECLARED' ? declared : (actual || declared);
        loadInto(src);
        setTab(k);
        // 저장된 게 없으면 바로 입력 모드로 — 한 번 더 누르게 하지 않는다
        setEditing(!(k === 'DECLARED' ? declared : actual));
    };

    const save = (kind: CargoReportKind) => {
        socket.emit('save-cargo-report', {
            orderId, stopType, kind,
            unit: isPickup ? eff.unit : undefined,
            quantity: isPickup ? eff.quantity : undefined,
            handling: eff.handling,
            promisedAt: saved?.promisedAt || hints.promisedAt,
            deadlineAt,
            tags: isPickup && tags.length ? tags : undefined,
            memo: memo || undefined,
        });
        setEditing(false);
    };

    const chip = (active: boolean, dim = false) =>
        `px-2.5 py-2 rounded-md text-[13px] font-bold border transition-colors ${
            active ? 'bg-info text-white border-info'
            : dim ? 'bg-surface-alt/30 text-text-muted/60 border-border border-dashed'
            : 'bg-surface-alt/50 text-text-primary border-border active:bg-surface-hover'
        }`;

    const units = showMoreUnits ? [...PICKUP_PRIMARY_UNITS, ...PICKUP_SECONDARY_UNITS] : PICKUP_PRIMARY_UNITS;
    const hourSlots = buildHourSlots(Date.now(), fixedMinutes, 5);

    // ── 접힌 채로 보여줄 요약. 여기 없는 값은 기사님에게 "없는 값"이다 ──
    const savedDwell = dwellMinutes(declared?.handling ?? undefined, points);
    const declaredSlack = computeSlackMinutes(declared?.deadlineAt, driveMinutes + savedDwell, Date.now());
    const declaredSummary = declared
        ? [summarize(declared), declaredSlack !== null && `여유 ${Math.max(0, declaredSlack)}분`]
            .filter(Boolean).join(' · ')
        : '아직 통화 전 — 눌러서 입력';

    const declaredPts = unitPoints(declared?.unit, declared?.quantity);
    const actualPts = unitPoints(actual?.unit, actual?.quantity);
    const mismatchRatio = declaredPts && actualPts && Math.abs(actualPts / declaredPts - 1) >= 0.01
        ? actualPts / declaredPts : null;
    const actualSummary = actual
        ? [summarize(actual), mismatchRatio !== null && `⚠️ 통화의 ${mismatchRatio.toFixed(1)}배`]
            .filter(Boolean).join(' · ')
        : '아직 확인 전 — 눌러서 기록';

    // ── 진행 배지: 접힌 채로도 "지금 어느 단계인가"가 보여야 한다 ──
    const doneLoad = isPickup
        ? (orderStatus === 'ORDER_PICKED_UP' || orderStatus === 'ORDER_DELIVERED')
        : orderStatus === 'ORDER_DELIVERED';
    const badges: Array<[string, string]> = [];
    if (declared) badges.push(['📞 통화완료', 'bg-info/15 text-info']);
    if (arrivedAt) badges.push([`📍 도착 ${hhmm(arrivedAt)}`, 'bg-warning/15 text-warning']);
    if (actual) badges.push(['👁 현장확인', 'bg-success/15 text-success']);
    if (doneLoad) badges.push([isPickup ? '📦 상차완료' : '🏁 하차완료', 'bg-success text-white']);

    const cargoForm = (
        <>
            {isPickup && (
                <>
                    <Row title="단위">
                        {units.map(u => (
                            <button key={u} onClick={() => { setUnit(u); setQty(undefined); }}
                                className={chip(eff.unit === u, unit === undefined && ghost?.unit === u)}>{u}</button>
                        ))}
                        {!showMoreUnits && (
                            <button onClick={() => setShowMoreUnits(true)}
                                className="px-2.5 py-2 rounded-md text-[13px] font-bold border border-border border-dashed text-text-muted">기타 ▸</button>
                        )}
                    </Row>
                    {eff.unit && (
                        <Row title="수량">
                            {(CARGO_UNIT_QUANTITIES[eff.unit] || [1, 2, 3]).map(q => (
                                <button key={q} onClick={() => setQty(q)}
                                    className={chip(eff.quantity === q, qty === undefined && ghost?.quantity === q)}>{q}</button>
                            ))}
                        </Row>
                    )}
                </>
            )}

            <Row title="방법">
                {HANDLING_METHODS.map(h => (
                    <button key={h} onClick={() => setHandling(h)}
                        className={chip(eff.handling === h, handling === undefined && ghost?.handling === h)}>
                        {h}<span className="ml-1 text-[10px] font-normal opacity-70">{dwellMinutes(h, points)}분</span>
                    </button>
                ))}
            </Row>

            {isPickup && (
                <Row title="성질">
                    {CARGO_TAGS.map(t => {
                        const on = tags.includes(t);
                        return (
                            <button key={t} title={CARGO_TAG_META[t].hint}
                                onClick={() => setTags(prev => on ? prev.filter(x => x !== t) : [...prev, t])}
                                className={`px-2 py-1.5 rounded-md text-[11px] font-bold border ${
                                    on ? 'bg-info text-white border-info' : 'bg-surface-alt/40 text-text-primary border-border'
                                }`}>
                                {CARGO_TAG_META[t].icon} {t}
                            </button>
                        );
                    })}
                </Row>
            )}

            <input value={memo} onChange={e => setMemo(e.target.value)}
                placeholder="메모 (선택) — 지하 2층, 경비실 통과"
                className="w-full bg-surface-alt/40 border border-border rounded-md px-2 py-2 text-[12px] text-text-primary placeholder:text-text-muted/70" />
        </>
    );

    return (
        <div className="rounded-md border border-border bg-surface-alt/20 p-2.5">
            {/* 헤더 — 라벨 · 담당자 · 진행 배지 */}
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-black text-text-muted">{label}</span>
                        {contactName && <span className="text-[11px] text-text-primary font-bold">{contactName}</span>}
                        {badges.map(([txt, cls]) => (
                            <span key={txt} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cls}`}>{txt}</span>
                        ))}
                    </div>
                    <div className="text-[12px] text-text-primary leading-snug mt-0.5 break-keep">{address}</div>
                </div>
                {phones.length > 0 && (
                    <a href={`tel:${phones[0].replace(/[^0-9+]/g, '')}`} onClick={e => e.stopPropagation()}
                        className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-md bg-success/12 border border-success/40 text-success text-[12px] font-black tabular-nums active:scale-[0.98] transition-transform">
                        📞 {phones[0]}
                    </a>
                )}
            </div>
            {phones.length > 1 && (
                <a href={`tel:${phones[1].replace(/[^0-9+]/g, '')}`} onClick={e => e.stopPropagation()}
                    className="inline-block mt-1 text-[11px] font-bold text-success/80 underline underline-offset-2">
                    📞 {phones[1]} (보조)
                </a>
            )}
            {phones.length === 0 && (
                <div className="text-[11px] text-text-muted mt-1">연락처 없음 — 퀵사무실로 확인하세요</div>
            )}

            {/* ══ 두 줄 요약 — **열지 않아도 결정 내용이 보인다** ══
                기사님: *"통화를 했음에도 불구하고 어떤 내용이 결정되었는지
                탭을 열지 않고는 알 수가 없어."*
                → 탭을 없앴다. 줄 자체가 내용이자 열기 버튼이다.
                  한쪽을 펼쳐도 다른 쪽 요약은 그대로 보이므로 대조가 된다. */}
            <div className="mt-2 flex flex-col gap-1" onClick={e => e.stopPropagation()}>
                <SummaryLine
                    icon="📞" title="통화"
                    summary={declaredSummary}
                    empty={!declared}
                    open={isCall}
                    onClick={() => openTab('DECLARED')}
                />
                {isCall && (
                <div className="pt-2 pb-1 pl-5 flex flex-col gap-2.5">
                    {!editing && declared ? (
                        <Preview text={summarize(declared)} memo={declared.memo} onEdit={() => { loadInto(declared); setEditing(true); }} />
                    ) : (
                        <>
                            {/* 어쩔 수 없는 시간을 먼저 못박는다 */}
                            <div className="text-[11px] text-text-muted">
                                주행 <b className="text-text-primary tabular-nums">{driveMinutes}</b>분
                                {' + '}{isPickup ? '상차' : '하차'} <b className="text-text-primary tabular-nums">{dwell}</b>분
                                {' = '}<b className="text-text-primary tabular-nums">{fixedMinutes}</b>분
                                <span className="opacity-70"> · 도착 {hhmm(new Date(Date.now() + fixedMinutes * 60_000).toISOString())} 예상</span>
                            </div>

                            {/* 🎯 여유가 곧 합짐 여력 */}
                            <div>
                                <div className="text-[11px] font-bold text-text-muted mb-1">몇 시까지 가면 되나요?</div>
                                <div className="flex gap-1.5 flex-wrap">
                                    {hourSlots.map(sl => {
                                        const slack = sl.minutesFromNow - fixedMinutes;
                                        const on = deadlineAt === sl.iso;
                                        return (
                                            <button key={sl.iso} onClick={() => setDeadlineAt(on ? undefined : sl.iso)}
                                                className={`flex flex-col items-center px-2.5 py-1 rounded-md border transition-colors ${
                                                    on ? 'bg-info text-white border-info'
                                                    : sl.beforeEta ? 'bg-surface-alt/30 text-text-muted/60 border-border border-dashed'
                                                    : 'bg-surface-alt/50 text-text-primary border-border'
                                                }`}>
                                                <span className="text-[14px] font-black">{sl.label}</span>
                                                <span className={`text-[10px] font-bold ${
                                                    on ? 'text-white/80' : slack < 0 ? 'text-danger' : slack < 30 ? 'text-warning' : 'text-success'
                                                }`}>
                                                    {slack < 0 ? '지각' : `여유 ${slack}분`}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="text-[10px] text-text-muted mt-1">여유가 클수록 합짐 여력이 커집니다</div>
                            </div>

                            {isPickup && hasCargoHints(hints) && (
                                <button onClick={applyHints}
                                    className="flex items-center gap-2 text-left px-2 py-1.5 rounded-md bg-warning/10 border border-warning/35 border-dashed">
                                    <span className="text-[10px] font-black text-warning shrink-0">적요에서</span>
                                    <span className="text-[11px] text-text-primary font-bold flex-1 truncate">{hints.summary}</span>
                                    <span className="text-[10px] font-black text-warning shrink-0">적용 ▸</span>
                                </button>
                            )}

                            {cargoForm}

                            {deadlineAt && (() => {
                                const d = describeSlack(computeSlackMinutes(deadlineAt, fixedMinutes, Date.now()));
                                return (
                                    <div className={`text-[12px] font-bold px-2 py-2 rounded-md ${
                                        d.level === 'tight' ? 'bg-danger/12 text-danger'
                                        : d.level === 'ample' ? 'bg-success/12 text-success' : 'bg-info/10 text-info'
                                    }`}>🕒 {hhmm(deadlineAt)}까지 · {d.text}</div>
                                );
                            })()}

                            <button onClick={() => save('DECLARED')}
                                className="w-full py-2.5 rounded-md bg-info text-white text-[13px] font-black active:scale-[0.99] transition-transform">
                                통화 종료 · 저장
                            </button>
                        </>
                    )}
                </div>
                )}

                <SummaryLine
                    icon="👁" title="현장"
                    summary={actualSummary}
                    empty={!actual}
                    open={tab === 'ACTUAL'}
                    onClick={() => openTab('ACTUAL')}
                    warn={mismatchRatio !== null}
                />
                {tab === 'ACTUAL' && (
                <div className="pt-2 pb-1 pl-5 flex flex-col gap-2.5">
                    {!editing && actual ? (
                        <Preview text={summarize(actual)} memo={actual.memo} onEdit={() => { loadInto(actual); setEditing(true); }} />
                    ) : (
                        <>
                            {cargoForm}
                            <button onClick={() => save('ACTUAL')}
                                className="w-full py-2.5 rounded-md bg-surface-alt/60 border border-border text-text-primary text-[13px] font-black">
                                현장 내용 저장
                            </button>
                        </>
                    )}

                    {(() => {
                        const dPts = unitPoints(declared?.unit, declared?.quantity);
                        if (!dPts || !points || Math.abs(points / dPts - 1) < 0.01) return null;
                        return (
                            <div className="text-[12px] font-black text-danger bg-danger/10 border border-danger/35 rounded-md px-2 py-2">
                                ⚠️ 실제가 통화의 {(points / dPts).toFixed(1)}배 — 사무실 확인이 필요할 수 있습니다
                            </div>
                        );
                    })()}

                    {/* ⑤ 시간을 남기는 버튼들 */}
                    <div className="flex gap-2">
                        <button
                            disabled={!!arrivedAt}
                            onClick={() => socket.emit('report-milestone', {
                                orderId, milestone: isPickup ? 'ARRIVED_PICKUP' : 'ARRIVED_DROPOFF',
                                predictedAt: new Date(Date.now() + driveMinutes * 60_000).toISOString(),
                            })}
                            className={`flex-1 py-2.5 rounded-md text-[13px] font-black border ${
                                arrivedAt ? 'bg-text-muted/10 text-text-muted border-border'
                                : 'bg-warning/12 text-warning border-warning/45'
                            }`}>
                            {arrivedAt ? `✓ 도착 ${hhmm(arrivedAt)}` : '📍 도착'}
                        </button>
                        <button
                            disabled={doneLoad}
                            onClick={() => { save('ACTUAL'); socket.emit('report-milestone', { orderId, milestone: isPickup ? 'PICKED_UP' : 'DELIVERED' }); }}
                            className={`flex-1 py-2.5 rounded-md text-[13px] font-black border ${
                                doneLoad ? 'bg-text-muted/10 text-text-muted border-border'
                                : 'bg-success text-white border-success'
                            }`}>
                            {doneLoad ? (isPickup ? '✓ 상차완료' : '✓ 하차완료') : (isPickup ? '📦 상차 완료' : '🏁 하차 완료')}
                        </button>
                        {isPickup && !doneLoad && (
                            <button onClick={() => socket.emit('cancel-at-stop', { orderId, stopType, reason: memo || '현장 상차 불가' })}
                                className="flex-1 py-2.5 rounded-md bg-danger/12 text-danger border border-danger/45 text-[13px] font-black">
                                ✕ 상차 취소
                            </button>
                        )}
                    </div>
                    {isPickup && !doneLoad && (
                        <div className="text-[10px] text-text-muted -mt-1.5">
                            상차 취소는 방출로 처리되고, 이 장소에 사유가 기록됩니다
                        </div>
                    )}
                </div>
                )}
            </div>
        </div>
    );
}

/**
 * 요약 줄 — 이 줄 하나로 "무엇이 정해졌는지"를 알 수 있어야 한다.
 * 접힌 채로 보이는 유일한 정보이므로, 여기서 빠진 값은 기사님에게 없는 값이다.
 */
function SummaryLine({ icon, title, summary, empty, open, onClick, warn }: {
    icon: string; title: string; summary: string; empty: boolean;
    open: boolean; onClick: () => void; warn?: boolean;
}) {
    return (
        <button onClick={onClick}
            className={`w-full flex items-center gap-2 text-left px-2 py-2 rounded-md border transition-colors ${
                open ? 'bg-info/10 border-info/45'
                : warn ? 'bg-danger/8 border-danger/35'
                : empty ? 'bg-transparent border-border border-dashed'
                : 'bg-surface-alt/40 border-border'
            }`}>
            <span className="text-[11px] shrink-0">{icon}</span>
            <span className="text-[10px] font-black text-text-muted shrink-0 w-6">{title}</span>
            <span className={`flex-1 min-w-0 text-[12px] font-bold break-keep ${
                empty ? 'text-text-muted/70 font-normal' : 'text-text-primary'
            }`}>
                {summary}
            </span>
            <span className="text-[10px] text-text-muted shrink-0">{open ? '▾' : '▸'}</span>
        </button>
    );
}

/** 저장된 내용 미리보기 — 탭을 열면 입력 폼이 아니라 이게 먼저 나온다 */
function Preview({ text, memo, onEdit }: { text: string; memo?: string; onEdit: () => void }) {
    return (
        <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-text-primary break-keep">{text || '기록 없음'}</div>
                {memo && <div className="text-[11px] text-text-muted mt-0.5 break-keep">{memo}</div>}
            </div>
            <button onClick={onEdit}
                className="shrink-0 px-3 py-1.5 rounded-md border border-border text-[11px] font-bold text-text-primary bg-surface-alt/50">
                수정
            </button>
        </div>
    );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-2">
            <span className="w-8 shrink-0 text-[11px] font-bold text-text-muted pt-2">{title}</span>
            <div className="flex gap-1.5 flex-wrap flex-1">{children}</div>
        </div>
    );
}
