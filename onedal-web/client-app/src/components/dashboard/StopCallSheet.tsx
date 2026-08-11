import { useState, useEffect } from 'react';
import {
    HANDLING_METHODS, cargoPoints, parseCargoHints, hasCargoHints,
    CARGO_TAGS, CARGO_TAG_META, describeSlack, computeSlackMinutes,
    CARGO_UNITS, CARGO_UNIT_QUANTITY_INPUT,
    buildHourSlots, dwellMinutes, unitPoints,
} from '@onedal/shared';
import type { CargoReport, HandlingMethod, CargoReportKind, CargoUnit } from '@onedal/shared';
import { socket } from '../../lib/socket';
import { telHref } from '../../lib/routeUtils';

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
 * ══ 저장 후 흐름 ══
 *
 * 기사님: *"통화 정보를 저장하고 나면 같은 내용이 반복되고 수정 버튼을 눌러야 이전 화면으로
 * 돌아가는데, **정보 중복이고 불필요한 액션을 요구하는 것 같다.**"*
 *
 *   (전) 줄 클릭 → 저장된 내용 미리보기(요약 줄과 같은 내용) → `수정` 클릭 → 폼   ← 2번 클릭
 *   (후) 줄 클릭 → **바로 폼**(값이 채워진 채로) → 저장 → **접힘**                ← 1번 클릭
 *
 * 요약 줄이 이미 미리보기다. 안에서 또 보여줄 이유가 없다.
 * 요약에 안 들어가는 메모는 **요약 줄 둘째 줄**에 붙여 펼치지 않아도 잃는 정보가 없게 했다.
 *
 * 그 밖에 스크린샷 피드백으로 고친 것
 *   · 헤더 **진행 배지** (`📞 통화완료` `📍 도착 15:12` `👁 현장확인` `📦 상차완료`)
 *   · 큰 버튼 두 개 제거 — 아코디언이 이미 길다. 전화번호도 헤더 우측 작은 버튼으로
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
    /** 이 정거장까지 남은 주행 시간(분). `null` 이면 아직 모른다 (현위치 미확인 등) */
    driveMinutes?: number | null;
    /** 오더 상태 — 상차/하차 완료 배지에 쓴다 */
    orderStatus?: string;
    /** 이 정거장에 도착한 시각 (기록됐다면) */
    arrivedAt?: string;
    /** [Phase 8.5] 단계 카드가 지정하는 열림 상태. 지정되면 줄을 누를 필요가 없다 */
    forceOpen?: CargoReportKind;
    /** 단계 이름 (헤더에 표시) */
    stepLabel?: string;
    /**
     * 주행 말고 **앞에서 이미 써야 하는** 시간(분) — 예: 하차지 통화 시점의 상차 작업.
     * 🔴 이걸 빼먹어서 도착 예상이 실제보다 이르게 나왔다 (2026-08-11). `remainingToStop` 참고.
     */
    leadMinutes?: number;
    /** 그 시간이 무엇인지 (`상차` 등) */
    leadLabel?: string | null;
    /** [T8] 착불이면 받을 금액(원). 하차 완료 **직전**에 수령 여부를 남긴다 */
    codAmount?: number | null;
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
    memoTexts, driveMinutes, orderStatus, arrivedAt, forceOpen, stepLabel,
    leadMinutes = 0, leadLabel, codAmount,
}: Props) {
    const isPickup = stopType === 'pickup';
    /** 단계 카드(A안)가 몰아주는 모드 — 이 시트가 화면의 전부다. 요약 줄을 띄우지 않는다 */
    const stepMode = !!forceOpen;
    const [tab, setTab] = useState<CargoReportKind | null>(forceOpen ?? null);   // null = 접힘
    /** 십·일의 자리를 각각 기억한다. 수량은 둘의 합이다 */
    const [tens, setTens] = useState(0);
    const [ones, setOnes] = useState<number | null>(null);
    /** 기사님: *"성질 선택은 특수한 상황에서만 필요할 듯."* → 기본 접힘 */
    const [showTags, setShowTags] = useState(false);
    /** [T8] 착불 수령 상태 — 서버가 진실이다. 화면이 저장했다고 믿지 않는다 */
    const [codSettled, setCodSettled] = useState<string | undefined>();

    useEffect(() => {
        if (codAmount == null || codAmount <= 0) return;
        const onSettlement = (d: { orderId: string; settlementStatus?: string }) => {
            if (d.orderId === orderId) setCodSettled(d.settlementStatus);
        };
        socket.on('settlement-updated', onSettlement);
        socket.emit('request-settlement', { orderId });
        return () => { socket.off('settlement-updated', onSettlement); };
    }, [orderId, codAmount]);
    // 단계가 바뀌면 그 단계에 맞는 줄을 연다 (A안: 줄을 누르는 탭을 없앤다)
    useEffect(() => { if (forceOpen) setTab(forceOpen); }, [forceOpen]);

    const declared = reports.find(r => r.stopType === stopType && r.kind === 'DECLARED');
    const actual = reports.find(r => r.stopType === stopType && r.kind === 'ACTUAL');
    const isCall = tab === 'DECLARED';
    const saved = isCall ? declared : actual;
    const pickupReport = reports.find(r => r.stopType === 'pickup' && r.kind === 'ACTUAL')
                      || reports.find(r => r.stopType === 'pickup');

    const [unit, setUnit] = useState<CargoUnit | undefined>();
    const [qty, setQty] = useState<number | undefined>();
    const [handling, setHandling] = useState<HandlingMethod | undefined>();
    const [memo, setMemo] = useState('');
    const [tags, setTags] = useState<string[]>([]);
    const [deadlineAt, setDeadlineAt] = useState<string | undefined>();

    // 🔴 폼 값은 **오직 state** 다. 예전에는 현장 입력이 통화값을 fallback 으로 참조해서
    //    "안 건드린 항목"이 통화 기록을 가리키는 셈이었다. 두 기록이 얽혀 비교가 안 된다.
    //    기사님: "통화 내용 저장된 것을 **깊은 복사**해서 현장에서 사용해야 한다.
    //             각각 따로 저장되어야 한다. 그래야 비교 가능하다."
    //    → 현장 줄을 열 때 통화값을 복사해 넣고, 그 뒤로는 완전히 독립이다.
    const eff = { unit, quantity: qty, handling };
    const points = isPickup ? cargoPoints(eff) : unitPoints(pickupReport?.unit, pickupReport?.quantity);
    const dwell = dwellMinutes(eff.handling, points);
    // 주행 시간을 모르면 여유를 계산할 수 없다. 0 으로 때우면 "여유가 많다"고 거짓말하게 된다
    const driveKnown = driveMinutes != null && driveMinutes > 0;
    // 🔴 앞 정거장에서 쓸 시간(상차 등)을 빠뜨리면 도착 예상이 실제보다 이르게 나온다
    const fixedMinutes = (driveMinutes ?? 0) + leadMinutes + dwell;

    const hints = parseCargoHints(...(memoTexts || []));
    const applyHints = () => {
        if (hints.unit) setUnit(hints.unit);
        if (hints.quantity != null) setQty(hints.quantity);
        if (hints.handling) setHandling(hints.handling);
        if (hints.tags?.length) setTags(prev => Array.from(new Set([...prev, ...hints.tags!])));
    };

    /** 저장된 기록을 폼으로 **깊은 복사**한다. 배열도 새로 만들어 원본과 공유하지 않는다 */
    const loadInto = (src?: CargoReport) => {
        setUnit(src?.unit as CargoUnit | undefined);
        setQty(src?.quantity);
        // 저장된 수량을 십·일 자리로 되돌려 놓는다. 안 하면 23개를 불러왔는데
        // 버튼은 아무것도 안 눌린 것처럼 보이고, 일의 자리를 누르는 순간 값이 뒤집힌다
        const q = src?.quantity ?? 0;
        setTens(Math.floor(q / 10) * 10);
        setOnes(q > 0 ? q % 10 : null);
        setHandling(src?.handling);
        setTags(src?.tags ? [...src.tags] : []);
        setMemo(src?.memo || '');
        setDeadlineAt(src?.deadlineAt);
    };

    const openTab = (k: CargoReportKind) => {
        if (tab === k) { setTab(null); return; }
        // 현장 기록이 아직 없으면 **통화 내용을 복사해서** 시작한다.
        // (복사이므로 여기서 고쳐도 통화 기록은 그대로 남는다 — 그래야 대조가 된다)
        const src = k === 'DECLARED' ? declared : (actual || declared);
        loadInto(src);
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
        // 저장하면 접는다. 결과는 바로 위 요약 줄에 반영된다.
        // 단, 단계 카드(A안)에서는 이 정거장이 화면의 전부이므로 열어 둔다 —
        // 접으면 화면이 비어 무엇을 했는지 알 수 없다
        setTab(forceOpen ?? null);
    };

    const chip = (active: boolean, dim = false) =>
        `px-2.5 py-2 rounded-md text-[13px] font-bold border transition-colors ${
            active ? 'bg-info text-white border-info'
            : dim ? 'bg-surface-alt/30 text-text-muted/60 border-border border-dashed'
            : 'bg-surface-alt/50 text-text-primary border-border active:bg-surface-hover'
        }`;

    const units = CARGO_UNITS;
    // 옛 데이터(톤백·쇼핑백)를 고른 기록이면 그 칩도 함께 띄운다
    const legacyUnit = eff.unit && !CARGO_UNITS.includes(eff.unit as any) ? eff.unit : null;
    const quantityInput = CARGO_UNIT_QUANTITY_INPUT[eff.unit as CargoUnit] ?? { mode: 'preset' as const, options: [1, 2, 3] };

    /** 십·일을 눌러 수량을 만든다. 0 은 "안 정함"으로 본다 (0개짜리 짐은 없다) */
    const setDigits = (t: number, o: number | null) => {
        setTens(t); setOnes(o);
        const sum = t + (o ?? 0);
        setQty(sum > 0 ? sum : undefined);
    };
    const hourSlots = buildHourSlots(Date.now(), fixedMinutes, 5);

    // ── 접힌 채로 보여줄 요약. 여기 없는 값은 기사님에게 "없는 값"이다 ──
    const savedDwell = dwellMinutes(declared?.handling ?? undefined, points);
    // 주행 시간을 모르면 여유도 모른다 — 0 으로 때우면 요약이 거짓말을 한다
    const declaredSlack = driveKnown
        ? computeSlackMinutes(declared?.deadlineAt, driveMinutes! + leadMinutes + savedDwell, Date.now())
        : null;
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
                    {/* [2026-08-12] 다섯 개를 한 번에 보여준다 — '기타 ▸' 더보기를 없앴다.
                        옛 데이터(톤백·쇼핑백)가 들어오면 그 칩을 하나 더 붙여 준다.
                        선택지에서 뺐다고 화면에서 지워 버리면 무엇을 골랐었는지 알 수 없다. */}
                    <Row title="단위">
                        {units.map(u => (
                            <button key={u} onClick={() => { setUnit(u); setQty(undefined); }}
                                className={chip(eff.unit === u)}>{u}</button>
                        ))}
                        {legacyUnit && (
                            <button onClick={() => { setUnit(legacyUnit); setQty(undefined); }}
                                className={chip(true)}>{legacyUnit}<span className="ml-1 text-[10px] opacity-70">옛 기록</span></button>
                        )}
                    </Row>

                    {/* 수량 — 파레트는 3개까지, 나머지는 십·일의 자리를 각각 눌러 더한다.
                        기사님: *"라면박스, 마대 등 나머지는 10단위 1단위로 두 번 클릭으로."*
                        라면박스는 수십 개가 예사라 프리셋으로는 못 맞춘다. */}
                    {eff.unit && quantityInput.mode === 'preset' && (
                        <Row title="수량">
                            {quantityInput.options.map(q => (
                                <button key={q} onClick={() => setQty(q)}
                                    className={chip(eff.quantity === q)}>{q}</button>
                            ))}
                        </Row>
                    )}
                    {eff.unit && quantityInput.mode === 'digits' && (
                        <div className="flex flex-col gap-1">
                            <Row title="수량">
                                {quantityInput.tens.map(t => (
                                    <button key={`t${t}`} onClick={() => setDigits(t, ones)}
                                        className={chip(tens === t)}>{t}</button>
                                ))}
                            </Row>
                            <Row title="">
                                {quantityInput.ones.map(o => (
                                    <button key={`o${o}`} onClick={() => setDigits(tens, o)}
                                        className={`px-2 py-1.5 rounded-md text-[13px] font-bold border ${
                                            ones === o ? 'bg-info text-white border-info'
                                                       : 'bg-surface-alt/50 text-text-primary border-border'
                                        }`}>{o}</button>
                                ))}
                            </Row>
                            {eff.quantity != null && (
                                <div className="text-[11px] font-bold text-info pl-10">= {eff.quantity}개</div>
                            )}
                        </div>
                    )}
                    {eff.unit && quantityInput.mode === 'none' && (
                        <div className="text-[11px] text-text-muted bg-surface-alt/40 rounded-md px-2 py-1.5">
                            부피를 환산할 수 없어 <b className="text-text-primary">차종 기준으로 보수 추정</b>합니다.
                            무엇인지 아래 메모에 적어 두면 다음에 같은 곳에서 도움이 됩니다.
                        </div>
                    )}
                </>
            )}

            <Row title="방법">
                {HANDLING_METHODS.map(h => (
                    <button key={h} onClick={() => setHandling(h)}
                        className={chip(eff.handling === h)}>
                        {h}<span className="ml-1 text-[10px] font-normal opacity-70">{dwellMinutes(h, points)}분</span>
                    </button>
                ))}
            </Row>

            {/* 기사님: *"성질 선택은 특수한 상황에서만 필요할 듯."*
                8개 칩이 늘 펼쳐져 있으면 폰 한 화면을 그만큼 잡아먹는다.
                이미 고른 게 있으면 접지 않는다 — 접어서 숨기면 무엇을 골랐는지 알 수 없다. */}
            {isPickup && !showTags && tags.length === 0 && (
                <button onClick={() => setShowTags(true)}
                    className="w-full py-2 rounded-md border border-border border-dashed text-[11px] font-bold text-text-muted">
                    + 성질 (농산물 · 파손주의 · 위험물 …)
                </button>
            )}
            {isPickup && (showTags || tags.length > 0) && (
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
        // 단계 모드에서는 **이것이 지금 할 일**이라는 게 한눈에 보여야 한다.
        // 프로토타입 `.task.hl` — 왼쪽 색띠 + info 배경. 적요·요금과 무게가 같으면 눈이 헤맨다.
        <div className={stepMode
            ? 'rounded-md border border-info/35 border-l-4 border-l-info bg-info/[0.07] p-2.5'
            : 'rounded-md border border-border bg-surface-alt/20 p-2.5'}>
            {/* 헤더 — 라벨 · 담당자 · 진행 배지 */}
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    {stepMode && <div className="text-[10px] font-black tracking-[0.08em] text-text-muted">지금 할 일</div>}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {/* 🔴 `하차지` + `하차지 통화` 를 나란히 찍고 있었다 — 단계 이름이 이미 정거장을 담는다 */}
                        <span className={stepMode
                            ? 'text-[16px] font-black text-text-primary tracking-tight'
                            : 'text-[11px] font-black text-text-muted'}>
                            {stepLabel || label}
                        </span>
                        {contactName && <span className="text-[11px] text-text-primary font-bold">{contactName}</span>}
                        {badges.map(([txt, cls]) => (
                            <span key={txt} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cls}`}>{txt}</span>
                        ))}
                    </div>
                    <div className="text-[12px] text-text-primary leading-snug mt-0.5 break-keep">{address}</div>
                </div>
                {phones.length > 0 && (
                    <a href={telHref(phones[0])} onClick={e => e.stopPropagation()}
                        className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-md bg-success/12 border border-success/40 text-success text-[12px] font-black tabular-nums active:scale-[0.98] transition-transform">
                        📞 {phones[0]}
                    </a>
                )}
            </div>
            {phones.length > 1 && (
                <a href={telHref(phones[1])} onClick={e => e.stopPropagation()}
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
            <div className="mt-2 flex flex-col gap-2" onClick={e => e.stopPropagation()}>
                {/* 🔴 단계 카드(A안)에서는 요약 줄을 띄우지 않는다 (2026-08-11).
                    단계가 곧 "통화"인데 그 위에 `아직 통화 전 — 눌러서 입력` 줄이 남아 있어
                    **이미 열려 있는 폼 위에서 누르라고 거짓말**을 하고 있었다.
                    13차에 없앤 중복이 `forceOpen` 을 얹으면서 되살아난 것이다.

                    다만 현장 단계에서는 통화 내용이 **대조용으로** 필요하다 —
                    기사님: *"탭을 바꿔 가면서 거짓말한 내용을 확인."* → 읽기 전용 한 줄로 남긴다. */}
                {stepMode && forceOpen === 'ACTUAL' && declared && (
                    <div className="flex gap-2 items-start rounded-md bg-surface-alt/40 border border-border px-2 py-1.5">
                        <span className="text-[10px] font-black text-text-muted shrink-0 pt-0.5">📞 통화</span>
                        <span className="text-[11px] font-bold text-text-primary break-keep flex-1">
                            {declaredSummary}
                            {declared.memo && <span className="block font-normal text-text-muted">{declared.memo}</span>}
                        </span>
                    </div>
                )}

                {!stepMode && (
                    <SummaryLine
                        icon="📞" title="통화"
                        summary={declaredSummary}
                        memo={declared?.memo}
                        empty={!declared}
                        open={isCall}
                        onClick={() => openTab('DECLARED')}
                    />
                )}
                {isCall && (
                <div className="pt-2 pb-1 pl-5 flex flex-col gap-2.5">
                    {/* 🔴 저장된 내용을 여기서 또 보여주지 않는다 (2026-08-10).
                        요약 줄이 **바로 위에** 같은 내용을 이미 띄우고 있어서 중복이었고,
                        고치려면 `수정` 을 한 번 더 눌러야 했다.
                        기사님: *"정보 중복이고 불필요한 액션을 요구하는 것 같다."*
                        → 줄을 누르면 **바로 입력 폼**이 열린다. 저장하면 접히고 요약 줄이 갱신된다. */}
                    <>
                            {/* 어쩔 수 없는 시간을 먼저 못박는다 */}
                            {driveKnown ? (
                                <div className="text-[11px] text-text-muted">
                                    주행 <b className="text-text-primary tabular-nums">{driveMinutes}</b>분
                                    {/* 앞 정거장에서 쓸 시간을 **항으로 드러낸다** — 합계에만 넣으면 왜 늘었는지 알 수 없다 */}
                                    {leadMinutes > 0 && leadLabel && (
                                        <>{' + '}{leadLabel} <b className="text-text-primary tabular-nums">{leadMinutes}</b>분</>
                                    )}
                                    {' + '}{isPickup ? '상차' : '하차'} <b className="text-text-primary tabular-nums">{dwell}</b>분
                                    {' = '}<b className="text-text-primary tabular-nums">{fixedMinutes}</b>분
                                    <span className="opacity-70"> · 도착 {hhmm(new Date(Date.now() + fixedMinutes * 60_000).toISOString())} 예상</span>
                                </div>
                            ) : (
                                /* 없는 숫자를 0 으로 때우면 "여유가 많다"고 거짓말하게 된다 */
                                <div className="text-[11px] text-warning bg-warning/10 border border-warning/35 rounded-md px-2 py-1.5">
                                    ⚠️ {isPickup ? '현위치 → 상차지' : '하차지까지'} 주행 시간을 아직 모릅니다 —
                                    여유 계산은 {leadMinutes > 0 && leadLabel ? `${leadLabel} ${leadMinutes}분 + ` : ''}
                                    {isPickup ? '상차' : '하차'} {dwell}분만 반영했습니다
                                </div>
                            )}

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

                            {/* 단계 모드에서는 이것이 **주 버튼**이다 — 저장이 곧 다음 단계로 넘어가는 것 */}
                            <button onClick={() => save('DECLARED')}
                                className={`w-full rounded-lg bg-info text-white font-black active:scale-[0.99] transition-transform ${
                                    stepMode ? 'py-3.5 text-[15px]' : 'py-2.5 text-[13px]'
                                }`}>
                                {stepMode ? '통화 끝 · 다음' : '통화 종료 · 저장'}
                            </button>
                    </>
                </div>
                )}

                {!stepMode && (
                    <SummaryLine
                        icon="👁" title="현장"
                        summary={actualSummary}
                        memo={actual?.memo}
                        empty={!actual}
                        open={tab === 'ACTUAL'}
                        onClick={() => openTab('ACTUAL')}
                        warn={mismatchRatio !== null}
                    />
                )}
                {tab === 'ACTUAL' && (
                <div className="pt-2 pb-1 pl-5 flex flex-col gap-2.5">
                    {cargoForm}
                    <button onClick={() => save('ACTUAL')}
                        className="w-full py-2.5 rounded-md bg-surface-alt/60 border border-border text-text-primary text-[13px] font-black">
                        현장 내용 저장
                    </button>

                    {(() => {
                        const dPts = unitPoints(declared?.unit, declared?.quantity);
                        if (!dPts || !points || Math.abs(points / dPts - 1) < 0.01) return null;
                        return (
                            <div className="text-[12px] font-black text-danger bg-danger/10 border border-danger/35 rounded-md px-2 py-2">
                                ⚠️ 실제가 통화의 {(points / dPts).toFixed(1)}배 — 사무실 확인이 필요할 수 있습니다
                            </div>
                        );
                    })()}

                    {/* [T8] 착불 현금 — **하차 완료 버튼 바로 위**.
                        기사님: *"착불현금은 완료 누르기 전에 내가 받을꺼야."*
                        완료됨 탭으로 미루면 그때는 이미 현장을 떠난 뒤다.
                        🔴 예전에는 이 기록 수단이 아예 없어 미수금 화면이 늘 비어 있었다. */}
                    {!isPickup && codAmount != null && codAmount > 0 && (
                        <div className="rounded-md border border-warning/45 bg-warning/10 px-2.5 py-2">
                            <div className="text-[12px] font-black text-warning">
                                💵 착불 {codAmount.toLocaleString()}원 — 지금 받으세요
                            </div>
                            <div className="flex gap-2 mt-2">
                                <button
                                    onClick={() => socket.emit('cod-collected', { orderId, received: true })}
                                    className={`flex-1 py-2.5 rounded-md text-[13px] font-black border ${
                                        codSettled === '수령'
                                            ? 'bg-success text-white border-success'
                                            : 'bg-success/12 text-success border-success/45'
                                    }`}>
                                    {codSettled === '수령' ? '✓ 받았음' : '받았음'}
                                </button>
                                <button
                                    onClick={() => socket.emit('cod-collected', { orderId, received: false })}
                                    className={`flex-1 py-2.5 rounded-md text-[13px] font-black border ${
                                        codSettled === '미수금'
                                            ? 'bg-danger text-white border-danger'
                                            : 'bg-danger/10 text-danger border-danger/40'
                                    }`}>
                                    {codSettled === '미수금' ? '✓ 미수' : '못 받음 · 미수'}
                                </button>
                            </div>
                            {!codSettled && (
                                <div className="text-[10px] text-text-muted mt-1.5">
                                    고르지 않고 완료하면 <b>미수금</b>으로 기록됩니다 — 받은 돈이 사라지지 않게
                                </div>
                            )}
                        </div>
                    )}

                    {/* ⑤ 시간을 남기는 버튼들 */}
                    <div className="flex gap-2">
                        <button
                            disabled={!!arrivedAt}
                            onClick={() => socket.emit('report-milestone', {
                                orderId, milestone: isPickup ? 'ARRIVED_PICKUP' : 'ARRIVED_DROPOFF',
                                predictedAt: driveKnown ? new Date(Date.now() + driveMinutes! * 60_000).toISOString() : undefined,
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
function SummaryLine({ icon, title, summary, memo, empty, open, onClick, warn }: {
    icon: string; title: string; summary: string; memo?: string; empty: boolean;
    open: boolean; onClick: () => void; warn?: boolean;
}) {
    return (
        // 두 줄이 붙어 있어 눌러야 할 줄을 잘못 누르기 쉬웠다 (기사님 지적).
        // 세로 여백을 늘리고 왼쪽에 색띠를 둬서 손가락이 어디에 닿는지 눈으로 구분되게 한다.
        <button onClick={onClick}
            className={`w-full flex items-center gap-2 text-left pl-2 pr-2 py-3 rounded-md border-2 border-l-4 transition-colors ${
                open ? 'bg-info/10 border-info/45 border-l-info'
                : warn ? 'bg-danger/8 border-danger/35 border-l-danger'
                : empty ? 'bg-transparent border-border/60 border-dashed border-l-border'
                : 'bg-surface-alt/40 border-border border-l-success/70'
            }`}>
            <span className="text-[11px] shrink-0">{icon}</span>
            <span className="text-[10px] font-black text-text-muted shrink-0 w-6">{title}</span>
            <span className="flex-1 min-w-0">
                <span className={`block text-[12px] font-bold break-keep ${
                    empty ? 'text-text-muted/70 font-normal' : 'text-text-primary'
                }`}>
                    {summary}
                </span>
                {/* 메모는 요약에 안 들어가므로 여기서 보여준다 — 펼치지 않아도 잃는 정보가 없어야 한다 */}
                {memo && <span className="block text-[11px] text-text-muted break-keep mt-0.5">{memo}</span>}
            </span>
            <span className="text-[10px] text-text-muted shrink-0">{open ? '▾' : '▸'}</span>
        </button>
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
