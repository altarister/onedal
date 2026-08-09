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
 * [Phase 8.4] 정거장 카드 — 통화 / 현장확인
 *
 * ══ 이 화면이 답해야 하는 단 하나의 질문 ══
 *
 * 기사님: *"이동시간, 상하차 시간은 어쩔 수 없지만 **여유시간을 많이 가지면 가질수록
 * 합짐의 기회가 발생하는 거야.** 그런 기준에서 UI를 조금 더 손봐야 할 듯싶어."*
 *
 *     여유 = 마감시각 − (지금 + 이동 + 상하차)
 *              ↑ 협상 가능        ↑ 어쩔 수 없음
 *
 * 통화에서 기사님이 움직일 수 있는 레버는 **마감 시각 하나뿐**이다.
 * 그래서 시각 버튼마다 **"이 시각이면 여유 N분"** 을 붙였다.
 * 늦게 받을수록 여유가 커지고, 여유가 곧 합짐 여력이다. 그게 협상의 근거가 된다.
 *
 * 🗑️ 통화 대본("이렇게 말하세요")은 걷어냈다. 기사님이 *"별로 도움이 될 것 같지 않다"* 고 했다.
 *    문장을 읽어주는 것보다 **여유가 얼마나 생기는지 숫자로 보여주는 편**이 실제로 쓸모 있다.
 *
 * ══ 탭 두 개 ══
 *   📞 통화    — 통화하면서 입력. 끝나면 `통화 종료 · 저장`
 *   👁 현장확인 — 통화 내용을 띄우고 수정. `상차 완료` / `상차 취소`
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
    /** 이 정거장까지 남은 주행 시간(분) — 어쩔 수 없는 시간의 한 축 */
    driveMinutes?: number;
}

const hhmm = (iso?: string) =>
    iso ? new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';

export default function StopCallSheet({
    orderId, stopType, label, address, contactName, phones, reports,
    memoTexts, driveMinutes = 0,
}: Props) {
    const isPickup = stopType === 'pickup';
    const [tab, setTab] = useState<CargoReportKind | null>(null);   // null = 접힘
    const [showMoreUnits, setShowMoreUnits] = useState(false);

    const declared = reports.find(r => r.stopType === stopType && r.kind === 'DECLARED');
    const actual = reports.find(r => r.stopType === stopType && r.kind === 'ACTUAL');
    const isCall = tab === 'DECLARED';
    const saved = isCall ? declared : actual;
    // 현장확인은 통화 내용을 밑그림으로 깐다 — 다른 것만 고치면 된다
    const ghost = !isCall ? declared : undefined;
    const pickupReport = reports.find(r => r.stopType === 'pickup' && r.kind === 'ACTUAL')
                      || reports.find(r => r.stopType === 'pickup');

    const [unit, setUnit] = useState<CargoUnit | undefined>(saved?.unit as CargoUnit | undefined);
    const [qty, setQty] = useState<number | undefined>(saved?.quantity);
    const [handling, setHandling] = useState<HandlingMethod | undefined>(saved?.handling);
    const [memo, setMemo] = useState(saved?.memo || '');
    const [tags, setTags] = useState<string[]>(saved?.tags || []);
    const [deadlineAt, setDeadlineAt] = useState<string | undefined>(saved?.deadlineAt);

    const eff = {
        unit: unit ?? (ghost?.unit as CargoUnit | undefined),
        quantity: qty ?? ghost?.quantity,
        handling: handling ?? ghost?.handling,
    };
    // 하차지는 상차지에서 파악한 부피를 그대로 쓴다 — 다시 묻지 않는다
    const points = isPickup ? cargoPoints(eff) : unitPoints(pickupReport?.unit, pickupReport?.quantity);
    const dwell = dwellMinutes(eff.handling, points);
    /** 어쩔 수 없는 시간 — 주행 + 상하차 */
    const fixedMinutes = driveMinutes + dwell;

    const hints = parseCargoHints(...(memoTexts || []));
    const applyHints = () => {
        if (hints.unit) setUnit(hints.unit);
        if (hints.quantity != null) setQty(hints.quantity);
        if (hints.handling) setHandling(hints.handling);
        if (hints.tags?.length) setTags(prev => Array.from(new Set([...prev, ...hints.tags!])));
    };

    /** 탭을 열 때 저장된 값을 폼에 올린다 — 현장확인은 통화값을 그대로 이어받는다 */
    const openTab = (k: CargoReportKind) => {
        const src = k === 'DECLARED' ? declared : (actual || declared);
        setUnit(src?.unit as CargoUnit | undefined);
        setQty(src?.quantity);
        setHandling(src?.handling);
        setTags(src?.tags || []);
        setMemo(src?.memo || '');
        setDeadlineAt(src?.deadlineAt);
        setTab(k);
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
        setTab(null);
    };

    const chip = (active: boolean, dim = false) =>
        `px-2.5 py-2.5 rounded-md text-[13px] font-bold border transition-colors ${
            active ? 'bg-info text-white border-info'
            : dim ? 'bg-surface-alt/30 text-text-muted/60 border-border border-dashed'
            : 'bg-surface-alt/50 text-text-primary border-border active:bg-surface-hover'
        }`;

    /** 접힌 상태에서도 "이 정거장은 파악됐나"를 한눈에 */
    const headline = [
        declared?.unit && `${declared.unit}${declared.quantity ? `×${declared.quantity}` : ''}`,
        declared?.handling,
        declared?.deadlineAt && `${hhmm(declared.deadlineAt)}까지`,
    ].filter(Boolean).join(' · ');

    const units = showMoreUnits ? [...PICKUP_PRIMARY_UNITS, ...PICKUP_SECONDARY_UNITS] : PICKUP_PRIMARY_UNITS;
    const hourSlots = buildHourSlots(Date.now(), fixedMinutes, 5);
    const currentSlack = computeSlackMinutes(deadlineAt, fixedMinutes, Date.now());

    /** 화물 정보 입력 — 통화·현장확인이 같은 폼을 쓴다 (현장에서는 밑그림이 깔린다) */
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
                                className="px-2.5 py-2.5 rounded-md text-[13px] font-bold border border-border border-dashed text-text-muted">
                                기타 ▸
                            </button>
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
            <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-black text-text-muted">{label}</span>
                    {contactName && <span className="text-[11px] text-text-primary font-bold">{contactName}</span>}
                    {headline && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-info/15 text-info">{headline}</span>}
                    {actual && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-success/15 text-success">현장확인</span>}
                </div>
                <div className="text-[12px] text-text-primary leading-snug mt-0.5 break-keep">{address}</div>
            </div>

            {/* 전화 — 스피커폰으로 걸고 아래 탭에서 입력한다 */}
            <div className="flex gap-1.5 mt-2">
                {phones.length === 0 && <span className="text-[11px] text-text-muted py-2">연락처 없음</span>}
                {phones.map((p, i) => (
                    <a key={p} href={`tel:${p.replace(/[^0-9+]/g, '')}`} onClick={e => e.stopPropagation()}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-md bg-success/12 border border-success/40 text-success text-[13px] font-black tabular-nums active:scale-[0.98] transition-transform">
                        <span>📞</span>{p}{i === 1 && <span className="text-[10px] font-bold opacity-70">보조</span>}
                    </a>
                ))}
            </div>

            {/* 탭 — 통화 / 현장확인 */}
            <div className="flex gap-1.5 mt-1.5" onClick={e => e.stopPropagation()}>
                <button onClick={() => (isCall ? setTab(null) : openTab('DECLARED'))}
                    className={`flex-1 py-2.5 rounded-md text-[12px] font-black border transition-colors ${
                        isCall ? 'bg-info text-white border-info'
                        : declared ? 'bg-info/12 text-info border-info/40' : 'bg-surface-alt/60 text-text-primary border-border'
                    }`}>
                    📞 통화{declared ? ' ✓' : ''}
                </button>
                <button onClick={() => (tab === 'ACTUAL' ? setTab(null) : openTab('ACTUAL'))}
                    className={`flex-1 py-2.5 rounded-md text-[12px] font-black border transition-colors ${
                        tab === 'ACTUAL' ? 'bg-success text-white border-success'
                        : actual ? 'bg-success/12 text-success border-success/40' : 'bg-surface-alt/60 text-text-primary border-border'
                    }`}>
                    👁 현장확인{actual ? ' ✓' : ''}
                </button>
            </div>

            {/* ══════════ 통화 탭 ══════════ */}
            {isCall && (
                <div className="mt-2.5 pt-2.5 border-t border-border flex flex-col gap-2.5" onClick={e => e.stopPropagation()}>
                    {/* 어쩔 수 없는 시간 — 못 바꾸는 부분을 먼저 못박고 시작한다 */}
                    <div className="text-[11px] text-text-muted">
                        주행 <b className="text-text-primary tabular-nums">{driveMinutes}</b>분
                        {' + '}{isPickup ? '상차' : '하차'} <b className="text-text-primary tabular-nums">{dwell}</b>분
                        {' = '}<b className="text-text-primary tabular-nums">{fixedMinutes}</b>분
                        <span className="opacity-70"> · 도착 {hhmm(new Date(Date.now() + fixedMinutes * 60_000).toISOString())} 예상</span>
                    </div>

                    {/* 🎯 여유가 곧 합짐 여력 — 늦게 받을수록 좋다는 걸 숫자로 보여준다 */}
                    <div>
                        <div className="text-[11px] font-bold text-text-muted mb-1">몇 시까지 가면 되나요?</div>
                        <div className="flex gap-1.5 flex-wrap">
                            {hourSlots.map(sl => {
                                const slack = sl.minutesFromNow - fixedMinutes;
                                const on = deadlineAt === sl.iso;
                                return (
                                    <button key={sl.iso} onClick={() => setDeadlineAt(on ? undefined : sl.iso)}
                                        className={`flex flex-col items-center px-2.5 py-1.5 rounded-md border transition-colors ${
                                            on ? 'bg-info text-white border-info'
                                            : sl.beforeEta ? 'bg-surface-alt/30 text-text-muted/60 border-border border-dashed'
                                            : 'bg-surface-alt/50 text-text-primary border-border'
                                        }`}>
                                        <span className="text-[14px] font-black">{sl.label}</span>
                                        <span className={`text-[10px] font-bold ${
                                            on ? 'text-white/80'
                                            : slack < 0 ? 'text-danger'
                                            : slack < 30 ? 'text-warning' : 'text-success'
                                        }`}>
                                            {slack < 0 ? '지각' : `여유 ${slack}분`}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="text-[10px] text-text-muted mt-1">
                            여유가 클수록 합짐 여력이 커집니다 — 늦게 받을수록 유리합니다
                        </div>
                    </div>

                    {hasCargoHints(hints) && isPickup && (
                        <button onClick={applyHints}
                            className="flex items-center gap-2 text-left px-2 py-1.5 rounded-md bg-warning/10 border border-warning/35 border-dashed">
                            <span className="text-[10px] font-black text-warning shrink-0">적요에서</span>
                            <span className="text-[11px] text-text-primary font-bold flex-1 truncate">{hints.summary}</span>
                            <span className="text-[10px] font-black text-warning shrink-0">적용 ▸</span>
                        </button>
                    )}

                    {cargoForm}

                    {deadlineAt && (() => {
                        const d = describeSlack(currentSlack);
                        return (
                            <div className={`text-[12px] font-bold px-2 py-2 rounded-md ${
                                d.level === 'tight' ? 'bg-danger/12 text-danger'
                                : d.level === 'ample' ? 'bg-success/12 text-success' : 'bg-info/10 text-info'
                            }`}>
                                🕒 {hhmm(deadlineAt)}까지 · {d.text}
                            </div>
                        );
                    })()}

                    <button onClick={() => save('DECLARED')}
                        className="w-full py-3 rounded-md bg-info text-white text-[14px] font-black active:scale-[0.99] transition-transform">
                        통화 종료 · 저장
                    </button>
                </div>
            )}

            {/* ══════════ 현장확인 탭 ══════════ */}
            {tab === 'ACTUAL' && (
                <div className="mt-2.5 pt-2.5 border-t border-border flex flex-col gap-2.5" onClick={e => e.stopPropagation()}>
                    {/* 통화 내용을 그대로 띄우고 대조한다 — 여기서는 읽을 문장이 필요 없다 */}
                    <div className="rounded-md border border-border bg-surface-alt/30 p-2">
                        <div className="text-[10px] font-black text-text-muted mb-1">📞 통화로 들은 내용</div>
                        <div className="text-[13px] font-bold text-text-primary">
                            {[
                                declared?.unit && `${declared.unit}${declared.quantity ? ` ${declared.quantity}개` : ''}`,
                                declared?.handling,
                                declared?.tags?.join('·'),
                                declared?.deadlineAt && `${hhmm(declared.deadlineAt)}까지`,
                            ].filter(Boolean).join(' · ') || '통화 기록 없음'}
                        </div>
                        {declared?.memo && <div className="text-[11px] text-text-muted mt-0.5">{declared.memo}</div>}
                    </div>

                    {cargoForm}

                    {(() => {
                        const dPts = unitPoints(declared?.unit, declared?.quantity);
                        if (!dPts || !points || Math.abs(points / dPts - 1) < 0.01) return null;
                        const ratio = points / dPts;
                        return (
                            <div className="text-[12px] font-black text-danger bg-danger/10 border border-danger/35 rounded-md px-2 py-2">
                                ⚠️ 실제가 통화의 {ratio.toFixed(1)}배 — 사무실 확인이 필요할 수 있습니다
                            </div>
                        );
                    })()}

                    {/* 도착은 시각만 기록한다 (상태를 바꾸지 않는다) */}
                    <button onClick={() => socket.emit('report-milestone', {
                        orderId, milestone: isPickup ? 'ARRIVED_PICKUP' : 'ARRIVED_DROPOFF',
                        predictedAt: new Date(Date.now() + driveMinutes * 60_000).toISOString(),
                    })}
                        className="text-[11px] font-bold text-text-muted underline underline-offset-2 self-start">
                        📍 {label} 도착 시각 기록
                    </button>

                    <div className="flex gap-2">
                        <button onClick={() => { save('ACTUAL'); socket.emit('report-milestone', { orderId, milestone: isPickup ? 'PICKED_UP' : 'DELIVERED' }); }}
                            className="flex-1 py-3 rounded-md bg-success text-white text-[14px] font-black active:scale-[0.99] transition-transform">
                            {isPickup ? '📦 상차 완료' : '🏁 하차 완료'}
                        </button>
                        {isPickup && (
                            <button onClick={() => { save('ACTUAL'); socket.emit('cancel-at-stop', { orderId, stopType, reason: memo || '현장 상차 불가' }); }}
                                className="flex-1 py-3 rounded-md bg-danger/12 text-danger border border-danger/45 text-[14px] font-black">
                                ✕ 상차 취소
                            </button>
                        )}
                    </div>
                    {isPickup && (
                        <div className="text-[10px] text-text-muted -mt-1">
                            상차 취소는 방출로 처리되고, 이 장소에 사유가 기록됩니다
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-2">
            <span className="w-8 shrink-0 text-[11px] font-bold text-text-muted pt-2.5">{title}</span>
            <div className="flex gap-1.5 flex-wrap flex-1">{children}</div>
        </div>
    );
}
