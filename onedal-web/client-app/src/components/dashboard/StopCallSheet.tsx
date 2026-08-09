import { useState } from 'react';
import {
    HANDLING_METHODS, cargoPoints, parseCargoHints, hasCargoHints,
    CARGO_TAGS, CARGO_TAG_META, describeSlack, computeSlackMinutes,
    CARGO_UNIT_QUANTITIES, PICKUP_PRIMARY_UNITS, PICKUP_SECONDARY_UNITS,
    buildHourSlots, dwellMinutes, unitPoints,
    buildCallScript, BUFFER_PRESETS, DEFAULT_BUFFER_MINUTES,
} from '@onedal/shared';
import type { CargoReport, HandlingMethod, CargoReportKind, CargoUnit } from '@onedal/shared';
import { socket } from '../../lib/socket';

/**
 * [Phase 8.4] 정거장 카드 — 전화 + 통화 결과 입력
 *
 * 기사님이 **스피커폰으로 통화하면서** 이 화면을 조작한다. 그래서
 *   · 키보드를 띄우지 않는다 (메모만 예외, 선택 사항)
 *   · 버튼을 크게, 탭 수를 최소로
 *   · **상차지와 하차지에서 묻는 것이 다르다**
 *
 * ── 상차지: 부피를 유추해야 한다 ──
 *   기사님: *"1톤 화물이면 파레트가 기본적일 거고 그렇지 않다면 라면박스 몇 개"*
 *   추상적인 소·중·대가 아니라 **통화에서 실제로 쓰는 단위**를 앞에 둔다.
 *   `단위 → 수량 → 시각 → 상차 방법` 순서로 대화가 흘러간다.
 *
 * ── 하차지: 부피는 이미 안다 ──
 *   기사님: *"물건의 크기와 부피 성질은 이미 파악된 상태이고 시간과 상하차 방법만 관심사"*
 *   그래서 `도착 시각 → 하차 방법` 둘만 묻는다. **탭 두 번이면 끝난다.**
 *
 * ── 시각은 "몇 시까지" ──
 *   기사님: *"지금부터 몇 시간인지는 관심이 없고 '몇 시까지 오시면 되요'가 더 직관적.
 *   버튼에 예상 시간이 표시되는 것이 좋을 듯."*
 *   그래서 `[+2시간]` 이 아니라 `[16시]` 다. 도착 예상보다 이른 시각은 흐리게 표시해
 *   **고르면 지각이 확정되는 선택**을 눈으로 구분할 수 있게 한다.
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
    /** 이 정거장까지 예상 주행 시간(분). 도착 못 하는 시각을 흐리게 하는 데 쓴다 */
    etaMinutes?: number;
    /** 현위치 → 상차지 이동 시간(분). 상차지 대본의 "여기서 N분 걸립니다" */
    approachMinutes?: number | null;
    /** 상차지 → 하차지 이동 시간(분). 하차지 대본에 쓴다 */
    lineHaulMinutes?: number | null;
    defaultKind?: CargoReportKind;
}

const hhmm = (iso?: string) =>
    iso ? new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';

export default function StopCallSheet({
    orderId, stopType, label, address, contactName, phones, reports,
    memoTexts, etaMinutes = 0, approachMinutes, lineHaulMinutes, defaultKind = 'DECLARED',
}: Props) {
    const isPickup = stopType === 'pickup';
    const [open, setOpen] = useState(false);
    const [kind, setKind] = useState<CargoReportKind>(defaultKind);
    const [showMoreUnits, setShowMoreUnits] = useState(false);

    const declared = reports.find(r => r.stopType === stopType && r.kind === 'DECLARED');
    const actual = reports.find(r => r.stopType === stopType && r.kind === 'ACTUAL');
    const saved = kind === 'DECLARED' ? declared : actual;
    const ghost = kind === 'ACTUAL' ? declared : undefined;
    // 하차지는 상차지에서 파악한 부피를 그대로 쓴다 — 다시 묻지 않는다
    const pickupReport = reports.find(r => r.stopType === 'pickup' && r.kind === 'ACTUAL')
                      || reports.find(r => r.stopType === 'pickup');

    const [unit, setUnit] = useState<CargoUnit | undefined>(saved?.unit as CargoUnit | undefined);
    const [qty, setQty] = useState<number | undefined>(saved?.quantity);
    const [handling, setHandling] = useState<HandlingMethod | undefined>(saved?.handling);
    const [memo, setMemo] = useState(saved?.memo || '');
    const [tags, setTags] = useState<string[]>(saved?.tags || []);
    const [deadlineAt, setDeadlineAt] = useState<string | undefined>(saved?.deadlineAt);
    const [buffer, setBuffer] = useState<number>(DEFAULT_BUFFER_MINUTES);
    const [showAdjust, setShowAdjust] = useState(false);
    const isDeclaredMode = kind === 'DECLARED';

    const eff = {
        unit: unit ?? (ghost?.unit as CargoUnit | undefined),
        quantity: qty ?? ghost?.quantity,
        handling: handling ?? ghost?.handling,
    };
    // 하차지에서는 상차지 부피를 기준으로 점수·소요시간을 계산한다
    const points = isPickup ? cargoPoints(eff) : unitPoints(pickupReport?.unit, pickupReport?.quantity);
    const dwell = dwellMinutes(eff.handling, points);

    const hints = parseCargoHints(...(memoTexts || []));
    const applyHints = () => {
        if (hints.unit) setUnit(hints.unit);
        if (hints.quantity != null) setQty(hints.quantity);
        if (hints.handling) setHandling(hints.handling);
        if (hints.tags?.length) setTags(prev => Array.from(new Set([...prev, ...hints.tags!])));
    };

    const save = () => {
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
        setOpen(false);
    };

    // 상차 약속이 이미 잡혔으면 하차 대본은 그 시각에서 출발한다
    const pickupPromise = reports.find(r => r.stopType === 'pickup' && r.deadlineAt)?.deadlineAt;
    const script = buildCallScript({
        stopType,
        nowMs: Date.now(),
        approachMinutes,
        lineHaulMinutes,
        pickupDwell: dwellMinutes(pickupReport?.handling, points),
        bufferMinutes: buffer,
        pickupDoneAtMs: !isPickup && pickupPromise ? new Date(pickupPromise).getTime() : null,
    });

    /** 담당자가 "네" 하면 대본에서 말한 시각을 그대로 약속으로 확정한다 */
    const acceptProposal = () => {
        setDeadlineAt(new Date(script.proposedMs).toISOString());
        setShowAdjust(false);
    };

    const chip = (active: boolean, dim = false) =>
        `px-2.5 py-2.5 rounded-md text-[13px] font-bold border transition-colors ${
            active ? 'bg-info text-white border-info'
            : dim ? 'bg-surface-alt/30 text-text-muted/60 border-border border-dashed'
            : 'bg-surface-alt/50 text-text-primary border-border active:bg-surface-hover'
        }`;

    const summary = isPickup
        ? (declared?.unit ? `${declared.unit}${declared.quantity ? `×${declared.quantity}` : ''}` : null)
        : (declared?.handling || null);

    const units = showMoreUnits ? [...PICKUP_PRIMARY_UNITS, ...PICKUP_SECONDARY_UNITS] : PICKUP_PRIMARY_UNITS;
    const hourSlots = buildHourSlots(Date.now(), etaMinutes, 5);

    return (
        <div className="rounded-md border border-border bg-surface-alt/20 p-2.5">
            <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-black text-text-muted">{label}</span>
                    {contactName && <span className="text-[11px] text-text-primary font-bold">{contactName}</span>}
                    {summary && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-info/15 text-info">{summary}</span>}
                    {declared?.deadlineAt && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-warning/15 text-warning">
                            🕒 {hhmm(declared.deadlineAt)}까지
                        </span>
                    )}
                    {actual && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-success/15 text-success">현장확인</span>}
                </div>
                <div className="text-[12px] text-text-primary leading-snug mt-0.5 break-keep">{address}</div>
            </div>

            {/* 전화 — 가장 크게, 탭 한 번. 스피커폰으로 걸고 아래 버튼을 누른다 */}
            <div className="flex gap-1.5 mt-2">
                {phones.length === 0 && <span className="text-[11px] text-text-muted py-2">연락처 없음</span>}
                {phones.map((p, i) => (
                    <a key={p} href={`tel:${p.replace(/[^0-9+]/g, '')}`} onClick={e => e.stopPropagation()}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-md bg-success/12 border border-success/40 text-success text-[13px] font-black tabular-nums active:scale-[0.98] transition-transform">
                        <span>📞</span>{p}{i === 1 && <span className="text-[10px] font-bold opacity-70">보조</span>}
                    </a>
                ))}
                <button onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
                    className={`px-3.5 py-3 rounded-md text-[12px] font-black border transition-colors ${
                        open ? 'bg-info text-white border-info' : 'bg-surface-alt/60 text-text-primary border-border'
                    }`}>
                    {saved ? '수정' : '기록'}
                </button>
            </div>

            {open && (
                <div className="mt-2.5 pt-2.5 border-t border-border flex flex-col gap-2.5" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                        {(['DECLARED', 'ACTUAL'] as CargoReportKind[]).map(k => (
                            <button key={k} onClick={() => setKind(k)}
                                className={`flex-1 py-1.5 rounded text-[11px] font-bold border ${
                                    kind === k ? 'bg-info/20 text-info border-info/50' : 'bg-transparent text-text-muted border-border'
                                }`}>
                                {k === 'DECLARED' ? '📞 통화로 들음' : '👁 현장 확인'}
                            </button>
                        ))}
                    </div>

                    {isPickup && hasCargoHints(hints) && (
                        <button onClick={applyHints}
                            className="flex items-center gap-2 text-left px-2 py-1.5 rounded-md bg-warning/10 border border-warning/35 border-dashed">
                            <span className="text-[10px] font-black text-warning shrink-0">적요에서</span>
                            <span className="text-[11px] text-text-primary font-bold flex-1 truncate">{hints.summary}</span>
                            <span className="text-[10px] font-black text-warning shrink-0">적용 ▸</span>
                        </button>
                    )}

                    {/* ── 상차지에서만: 부피 ── */}
                    {isPickup && (
                        <>
                            <Row title="단위">
                                {units.map(u => (
                                    <button key={u} onClick={() => { setUnit(u); setQty(undefined); }}
                                        className={chip(eff.unit === u)}>{u}</button>
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
                                        <button key={q} onClick={() => setQty(q)} className={chip(eff.quantity === q)}>{q}</button>
                                    ))}
                                </Row>
                            )}
                        </>
                    )}

                    {/* ══ 통화 대본 — 통화 모드에서만 ══
                        기사님: "현장 확인 탭에서는 전화 멘트가 필요 없고
                        통화 내용과 결과가 같은지만 확인하면 된다."
                        현장에서는 이미 눈앞에 물건이 있다. 읽을 문장이 필요 없다. ══ */}
                    {isDeclaredMode && (<>
                    {/* ══ 통화 대본 — 이걸 그대로 읽는다 ══
                        시스템이 이미 아는 값(이동 시간·상차 소요)을 기사님이 머릿속으로
                        더하고 있을 이유가 없다. 문장으로 만들어 준다. */}
                    <div className="rounded-md border border-info/40 bg-info/8 p-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-black text-info">📞 이렇게 말하세요</span>
                            <div className="flex gap-1 items-center">
                                <span className="text-[10px] text-text-muted">여유</span>
                                {BUFFER_PRESETS.map(b => (
                                    <button key={b} onClick={() => setBuffer(b)}
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                            buffer === b ? 'bg-info text-white border-info' : 'bg-transparent text-text-muted border-border'
                                        }`}>{b}</button>
                                ))}
                            </div>
                        </div>
                        <p className="text-[14px] leading-relaxed text-text-primary font-bold break-keep select-text">
                            {script.text}
                        </p>
                        <div className="text-[10px] text-text-muted mt-1.5">
                            {script.steps.map(st => `${st.label} ${st.minutes}분`).join(' + ')}
                        </div>
                    </div>

                    {/* 담당자 답변 — 탭 한 번 */}
                    <div className="flex gap-1.5">
                        <button onClick={acceptProposal}
                            className={`flex-1 py-3 rounded-md text-[13px] font-black border ${
                                deadlineAt && Math.abs(new Date(deadlineAt).getTime() - script.proposedMs) < 60_000
                                    ? 'bg-success text-white border-success'
                                    : 'bg-success/12 text-success border-success/40'
                            }`}>
                            👍 네, 오세요
                        </button>
                        <button onClick={() => setShowAdjust(v => !v)}
                            className={`flex-1 py-3 rounded-md text-[13px] font-black border ${
                                showAdjust ? 'bg-warning text-white border-warning' : 'bg-warning/12 text-warning border-warning/40'
                            }`}>
                            🕒 다른 시각
                        </button>
                    </div>

                    </>)}

                    {/* ══ 현장 확인 모드: 통화 내용과 대조만 ══ */}
                    {!isDeclaredMode && declared && (
                        <div className="rounded-md border border-border bg-surface-alt/30 p-2.5">
                            <div className="text-[10px] font-black text-text-muted mb-1.5">📞 통화로 들은 내용</div>
                            <div className="text-[13px] font-bold text-text-primary">
                                {[
                                    declared.unit && `${declared.unit}${declared.quantity ? ` ${declared.quantity}개` : ''}`,
                                    declared.handling,
                                    declared.tags?.join('·'),
                                    declared.deadlineAt && `${hhmm(declared.deadlineAt)}까지`,
                                ].filter(Boolean).join(' · ') || '기록 없음'}
                            </div>
                            {declared.memo && <div className="text-[11px] text-text-muted mt-1">{declared.memo}</div>}
                            {(() => {
                                const declaredPts = unitPoints(declared.unit, declared.quantity);
                                if (!declaredPts || !points || declaredPts === points) return null;
                                const ratio = points / declaredPts;
                                return (
                                    <div className="mt-2 text-[12px] font-black text-danger">
                                        ⚠️ 실제가 신고의 {ratio.toFixed(1)}배 — 사무실 확인이 필요할 수 있습니다
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* 담당자가 다른 시각을 부르면 그때만 펼친다 */}
                    {showAdjust && isDeclaredMode && (
                        <Row title={isPickup ? '상차' : '도착'}>
                            {hourSlots.map(sl => (
                                <button key={sl.iso} onClick={() => setDeadlineAt(deadlineAt === sl.iso ? undefined : sl.iso)}
                                    className={chip(deadlineAt === sl.iso, sl.beforeEta)}
                                    title={sl.beforeEta ? '예상 도착보다 이릅니다' : ''}>
                                    {sl.label}
                                </button>
                            ))}
                        </Row>
                    )}

                    {/* ── 상하차 방법: 소요 시간이 버튼에 바로 보인다 ── */}
                    <Row title="방법">
                        {HANDLING_METHODS.map(h => (
                            <button key={h} onClick={() => setHandling(h)} className={chip(eff.handling === h)}>
                                {h}<span className="ml-1 text-[10px] font-normal opacity-70">{dwellMinutes(h, points)}분</span>
                            </button>
                        ))}
                    </Row>

                    {/* ── 성질: 상차지에서만 (하차지는 이미 안다) ── */}
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

                    {deadlineAt && (() => {
                        const slack = computeSlackMinutes(deadlineAt, etaMinutes + dwell, Date.now());
                        const d = describeSlack(slack);
                        return (
                            <div className={`text-[11px] font-bold px-2 py-2 rounded-md ${
                                d.level === 'tight' ? 'bg-danger/12 text-danger'
                                : d.level === 'ample' ? 'bg-success/12 text-success' : 'bg-info/10 text-info'
                            }`}>
                                🕒 {hhmm(deadlineAt)}까지 · 주행 {etaMinutes}분 + {isPickup ? '상차' : '하차'} {dwell}분 → {d.text}
                            </div>
                        );
                    })()}

                    <input value={memo} onChange={e => setMemo(e.target.value)}
                        placeholder="메모 (선택) — 지하 2층, 경비실 통과"
                        className="w-full bg-surface-alt/40 border border-border rounded-md px-2 py-2 text-[12px] text-text-primary placeholder:text-text-muted/70" />

                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-text-muted">
                            {isPickup && <>적재 <b className="text-text-primary tabular-nums">{points}</b>점<span className="opacity-70"> / 1t=30점</span> · </>}
                            {isPickup ? '상차' : '하차'} <b className="text-text-primary tabular-nums">{dwell}</b>분
                        </span>
                        <button onClick={save}
                            className="px-5 py-2.5 rounded-md bg-info text-white text-[13px] font-black active:scale-[0.98] transition-transform">
                            저장
                        </button>
                    </div>
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
