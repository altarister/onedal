import { useState, useEffect, useRef, useMemo } from 'react';
import {
    HANDLING_METHODS, cargoPoints, parseCargoHints, hasCargoHints,
    CARGO_TAGS, CARGO_TAG_META, DEFAULT_CARGO_TAG, computeSlackMinutes,
    CARGO_UNITS, CARGO_UNIT_QUANTITY_INPUT,
    buildArrivalSlots, dwellMinutes, unitPoints,
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
    /** 같은 구간의 거리(km) — 통화에서 "몇 km고 몇 분" 이라고 말한다 */
    driveKm?: number | null;
    /**
     * [2026-08-12] 이 정거장에서 **다음 정거장까지** 주행(분/km).
     *
     * 기사님: *"상차지에서 상차하고 출발 시간까지 알게 되면 다시 상차지에 하차지 정보까지 물을 수 있어.
     * '하차지까지 몇 km 몇 분 걸릴 것 같은데 x:xx까지 가면 될까요?' 하고 물어본다면
     * **하차지는 통화하지 않아도 출발할 수 있을 듯.**"*
     * (상차지 담당자가 하차지 사정을 대략 안다 — 기사님 확인)
     */
    onwardMinutes?: number | null;
    onwardKm?: number | null;
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
    leadMinutes = 0, leadLabel, driveKm, onwardMinutes, onwardKm, codAmount,
}: Props) {
    const isPickup = stopType === 'pickup';
    /** 단계 카드(A안)가 몰아주는 모드 — 이 시트가 화면의 전부다. 요약 줄을 띄우지 않는다 */
    const stepMode = !!forceOpen;
    const [tab, setTab] = useState<CargoReportKind | null>(forceOpen ?? null);   // null = 접힘
    /** 십·일의 자리를 각각 기억한다. 수량은 둘의 합이다 */
    const [tens, setTens] = useState(0);
    const [ones, setOnes] = useState<number | null>(null);
    /** 적요에서 미리 채운 값인가 — 어디서 온 값인지 숨기지 않는다 */
    const [prefilledFromMemo, setPrefilledFromMemo] = useState(false);
    /** 하차지 시각을 상차지 통화에서 미리 들어 둔 값으로 채웠는가 */
    const [fromPickupCall, setFromPickupCall] = useState(false);
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
    /** 상차지 통화에서 **함께 정한** 하차지 도착 시각 */
    const [onwardDeadlineAt, setOnwardDeadlineAt] = useState<string | undefined>();

    // 🔴 폼 값은 **오직 state** 다. 예전에는 현장 입력이 통화값을 fallback 으로 참조해서
    //    "안 건드린 항목"이 통화 기록을 가리키는 셈이었다. 두 기록이 얽혀 비교가 안 된다.
    //    기사님: "통화 내용 저장된 것을 **깊은 복사**해서 현장에서 사용해야 한다.
    //             각각 따로 저장되어야 한다. 그래야 비교 가능하다."
    //    → 현장 줄을 열 때 통화값을 복사해 넣고, 그 뒤로는 완전히 독립이다.
    const eff = { unit, quantity: qty, handling };
    const points = isPickup ? cargoPoints(eff) : unitPoints(pickupReport?.unit, pickupReport?.quantity);
    /** 이 정거장의 상하차 소요 — 도착 시각에는 안 들어가지만 **다음 정거장** 계산에는 필요하다 */
    const dwell = dwellMinutes(eff.handling, points);
    // 주행 시간을 모르면 여유를 계산할 수 없다. 0 으로 때우면 "여유가 많다"고 거짓말하게 된다
    const driveKnown = driveMinutes != null && driveMinutes > 0;
    /**
     * **도착까지** 걸리는 시간. 🔴 이 정거장의 상하차 정차(dwell)는 넣지 않는다.
     *
     * 기사님: *"상차지와 통화하고 내용을 기입하는 영역인데 상차 20분을 추가하고 있어.
     * 그건 상차지랑 통화할 때 **불필요한 정보**야."* — 맞다. 상차 20분은 **도착한 뒤**의 일이고,
     * 통화에서 정하는 것은 *"몇 시까지 **가면** 되나요"* 다.
     *
     * 앞 정거장의 작업(`leadMinutes`, 예: 하차지 통화 시점의 상차 20분)은 도착 **전**이므로 넣는다.
     */
    const arrivalMinutes = (driveMinutes ?? 0) + leadMinutes;

    const hints = parseCargoHints(...(memoTexts || []));
    /**
     * 저장된 기록을 폼으로 **깊은 복사**한다. 배열도 새로 만들어 원본과 공유하지 않는다.
     *
     * [2026-08-12] 저장된 값이 없으면 **적요에서 미리 채운다.**
     * 기사님: *"적요 내용을 클릭하는 것이 아니고 축약한 것을 **미리 클릭해 주는 것**이 더 좋을 것 같아."*
     * 맞다 — 통화하면서 버튼을 찾아 누를 시간이 없다. 채워 두고 **틀린 것만 고치는** 편이 빠르다.
     * 적요는 부정확할 수 있으므로 어디서 온 값인지는 화면에 남긴다.
     */
    const loadInto = (src?: CargoReport) => {
        // 하차지 통화인데 아직 시각을 안 정했다면, **상차지 통화에서 들은 값**을 미리 넣는다
        const onward = !isPickup && !src?.deadlineAt
            ? reports.find(r => r.stopType === 'pickup' && r.kind === 'DECLARED')?.onwardDeadlineAt
            : undefined;
        setFromPickupCall(!!onward);
        const h = parseCargoHints(...(memoTexts || []));
        const prefilled = !src?.unit && !src?.handling && hasCargoHints(h);
        setPrefilledFromMemo(prefilled);
        if (prefilled) {
            setUnit(h.unit);
            setQty(h.quantity);
            setTens(Math.floor((h.quantity ?? 0) / 10) * 10);
            setOnes(h.quantity ? h.quantity % 10 : null);
            setHandling(h.handling);
            setTags(h.tags?.length ? [...h.tags] : [DEFAULT_CARGO_TAG]);
            setMemo(src?.memo || '');
            setDeadlineAt(src?.deadlineAt ?? onward);
            return;
        }
        setUnit(src?.unit as CargoUnit | undefined);
        setQty(src?.quantity);
        // 저장된 수량을 십·일 자리로 되돌려 놓는다. 안 하면 23개를 불러왔는데
        // 버튼은 아무것도 안 눌린 것처럼 보이고, 일의 자리를 누르는 순간 값이 뒤집힌다
        const q = src?.quantity ?? 0;
        setTens(Math.floor(q / 10) * 10);
        setOnes(q > 0 ? q % 10 : null);
        setHandling(src?.handling);
        // 성질을 한 번도 안 고른 기록이면 기본값을 넣는다 — 빈 값과 '특별할 것 없음'은 다르다
        setTags(src?.tags?.length ? [...src.tags] : [DEFAULT_CARGO_TAG]);
        setMemo(src?.memo || '');
        setDeadlineAt(src?.deadlineAt ?? onward);
        setOnwardDeadlineAt(src?.onwardDeadlineAt);
    };

// 단계 카드는 줄을 누르지 않으므로 loadInto 가 안 불린다 — 여기서 한 번 채운다
    const seeded = useRef(false);
    useEffect(() => {
        if (!forceOpen || seeded.current) return;
        seeded.current = true;
        loadInto(forceOpen === 'DECLARED' ? declared : (actual || declared));
    }, [forceOpen, declared, actual]);

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
            // 🔴 하차지 시각은 **하차지 기록으로 저장하지 않는다.** 저장하면
            //    deriveCallStep 이 "하차지 통화를 했다"고 보고 그 단계를 건너뛴다.
            //    기사님: *"내 의도는 시퀀스로 되어 있는데 두 개를 한 번에 가는 건 기준이 흔들리는 것 같아."*
            //    상차지 통화에서 **들은 값**일 뿐이므로 여기 담아 두고,
            //    하차지 통화 단계에서 미리 채워 준다. 통화 여부는 기사님이 정한다.
            onwardDeadlineAt: isPickup && kind === 'DECLARED' ? onwardDeadlineAt : undefined,
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
    const hourSlots = buildArrivalSlots(Date.now(), arrivalMinutes, 5);

    /**
     * 🔴 **서버가 미리 눌러 두고 기사님이 확정하신다** (기사님 2026-08-16):
     * *"너가 눌러 놓은 걸 내가 확정하는 거야. 너가 눌러 논 것에서 상황이 바뀐다면 내가 바꿔서 확정할 거고."*
     *
     * 이 제품의 일관된 방식이다 — 앱이 느슨하게 집어 오면 기사님이 결재하고, 적요에서 미리
     * 클릭해 두면 기사님이 틀린 것만 고치신다. 시간 버튼만 빈칸으로 둘 이유가 없다.
     *
     *   상차지 → 상차까지 마치는 데 필요한 시간(주행 + 상차) 다음 칸
     *   하차지 → 도착 예상 **다음 칸** (= 휴식 여유 30분)
     *
     * ⚠️ 물량·방법을 고치면 `dwell` 이 변하고 추천 칸도 **따라 움직인다.**
     *    기사님이 직접 누르시면 그때부터 그 값이 확정이다.
     */
    const suggestedSlot = useMemo(() => {
        if (!driveKnown || hourSlots.length === 0) return null;
        const needMs = Date.now() + (arrivalMinutes + (isPickup ? dwell : 0)) * 60_000;
        return hourSlots.find(sl => new Date(sl.iso).getTime() >= needMs) ?? hourSlots[hourSlots.length - 1];
    }, [driveKnown, arrivalMinutes, dwell, isPickup, hourSlots]);

    /** 기사님이 아직 손대지 않아 추천값이 눌려 있는 상태인가 — 눌리면 근거 줄을 띄운다 */
    const [deadlineTouched, setDeadlineTouched] = useState(false);
    useEffect(() => {
        if (deadlineTouched || deadlineAt || !suggestedSlot) return;
        setDeadlineAt(suggestedSlot.iso);
    }, [deadlineTouched, deadlineAt, suggestedSlot]);

    // ── 접힌 채로 보여줄 요약. 여기 없는 값은 기사님에게 "없는 값"이다 ──
    // 주행 시간을 모르면 여유도 모른다 — 0 으로 때우면 요약이 거짓말을 한다
    const declaredSlack = driveKnown
        ? computeSlackMinutes(declared?.deadlineAt, driveMinutes! + leadMinutes, Date.now())
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

            {/* [2026-08-12] 기사님 결정 — 성질을 **항상 펼쳐 둔다.**
                예전엔 "특수한 상황에서만"이라 접었는데, `일반화물` 이 기본으로 들어가면서
                **누르지 않아도 이미 답이 정해져 있는** 줄이 되었다.
                접어 두면 그 기본값이 보이지 않아 오히려 확인이 안 된다. */}
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
                            {/* 통화에서 그대로 읽을 수 있는 한 줄.
                                기사님: *"거기까지 가는데 몇 km고 28분 걸려 08:39에 도착해야 하는데…"* */}
                            {driveKnown ? (
                                <div className="text-[12px] text-text-primary">
                                    {isPickup ? '현위치 → 상차지' : '상차지 → 하차지'}
                                    {driveKm != null && <> <b className="tabular-nums">{driveKm.toFixed(1)}</b>km</>}
                                    {' · '}<b className="tabular-nums">{driveMinutes}</b>분
                                    {/* 앞 정거장 작업은 도착 **전**이라 항으로 드러낸다 (하차지 통화의 상차 20분) */}
                                    {leadMinutes > 0 && leadLabel && (
                                        <span className="text-text-muted"> (+ {leadLabel} {leadMinutes}분)</span>
                                    )}
                                    {/* 🔴 상차지 통화에서 화주가 묻는 것은 **"실어서 몇 시에 보낼 수 있나"** 다
                                        (기사님 2026-08-16). 그래서 도착 시각이 아니라 **상차까지 마친 시각**을 읽어 준다.
                                        예전 주석은 *"상차 20분은 상차지랑 통화할 때 불필요한 정보"* 였는데,
                                        그때는 상차 마감을 *도착* 시각으로 봤기 때문이다. 기준이 바뀌었다. */}
                                    <div className="text-[13px] font-black text-info mt-0.5 tabular-nums">
                                        지금 출발하면 {hhmm(new Date(Date.now() + arrivalMinutes * 60_000).toISOString())} 도착
                                        {isPickup && (
                                            <span className="text-text-muted font-bold">
                                                {' '}· 상차 {dwell}분 → <span className="text-info">{hhmm(new Date(Date.now() + (arrivalMinutes + dwell) * 60_000).toISOString())}</span> 출발
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                /* 없는 숫자를 0 으로 때우면 "여유가 많다"고 거짓말하게 된다 */
                                <div className="text-[11px] text-warning bg-warning/10 border border-warning/35 rounded-md px-2 py-1.5">
                                    ⚠️ {isPickup ? '현위치 → 상차지' : '하차지까지'} 주행 시간을 아직 모릅니다 —
                                    도착 시각을 계산할 수 없습니다
                                </div>
                            )}

                            {/* 🎯 30분 단위 — 첫 칸이 곧 '지금 출발'이고, 한 칸이 30분의 합짐 시간이다.
                                기사님: *"9:39에 가도 될까요? 그럼 한 시간 동안 합짐을 잡을 수 있으니까."*
                                버튼마다 `여유 N분` 을 쓰지 않는다 — 몇 번째 칸인가가 곧 여유다. */}
                            <div>
                                <div className="text-[11px] font-bold text-text-muted mb-1">
                                    {isPickup ? '몇 시까지 실어 보낼 수 있나요?' : '몇 시까지 가면 되나요?'}
                                </div>
                                <div className="flex gap-1.5 flex-wrap">
                                    {hourSlots.map((sl, i) => {
                                        const on = deadlineAt === sl.iso;
                                        return (
                                            <button key={sl.iso} onClick={() => { setDeadlineTouched(true); setDeadlineAt(on ? undefined : sl.iso); }}
                                                className={`px-3 py-2 rounded-md border text-[14px] font-black tabular-nums transition-colors ${
                                                    on ? 'bg-info text-white border-info'
                                                    : i === 0 ? 'bg-surface-alt/50 text-text-muted border-border border-dashed'
                                                    : 'bg-surface-alt/50 text-text-primary border-border'
                                                }`}>
                                                {sl.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                {/* 🔴 **미리 채운 값에는 근거를 붙인다** (기사님 2026-08-16).
                                    기존 원칙과 같다 — *"적요는 부정확할 수 있으므로 어디서 온 값인지는
                                    화면에 남긴다."* 기사님이 직접 누르시면 이 줄은 사라진다. */}
                                {!deadlineTouched && deadlineAt && suggestedSlot?.iso === deadlineAt && (
                                    <div className="mt-1 text-[10px] leading-tight text-text-muted">
                                        ⓘ 주행 {driveMinutes}분{isPickup ? ` + 상차 ${dwell}분` : ''} 기준으로{' '}
                                        <b className="tabular-nums">{hhmm(deadlineAt)}</b> 을 눌러 뒀습니다 —
                                        바꾸시면 그게 확정됩니다
                                    </div>
                                )}
                            </div>

                            {!isPickup && fromPickupCall && (
                                <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-info/10 border border-info/35 border-dashed">
                                    <span className="text-[10px] font-black text-info shrink-0">상차지 통화에서 들음</span>
                                    <span className="text-[11px] text-text-muted flex-1">시각을 미리 채웠습니다 — 다시 확인하거나 그대로 두세요</span>
                                </div>
                            )}

                            {isPickup && prefilledFromMemo && (
                                <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-warning/10 border border-warning/35 border-dashed">
                                    <span className="text-[10px] font-black text-warning shrink-0">적요에서 미리 채움</span>
                                    <span className="text-[11px] text-text-muted flex-1 truncate">{hints.summary}</span>
                                    <span className="text-[10px] text-text-muted shrink-0">틀리면 고치세요</span>
                                </div>
                            )}

                            {cargoForm}

                            {/* ══ 이어서 하차지까지 한 통화로 ══
                                기사님: *"상차하고 출발 시간까지 알게 되면 다시 상차지에 하차지 정보까지
                                물을 수 있어. '하차지까지 몇 km 몇 분 걸릴 것 같은데 x:xx까지 가면 될까요?'
                                하고 물어본다면 **하차지는 통화하지 않아도 출발할 수 있을 듯.**"*

                                상차 시각을 정해야 하차 도착을 셀 수 있으므로, **정하고 나면 비로소 나타난다.**
                                접어 두지 않는다 — 통화가 그 순서로 흘러가기 때문이다.
                                하차지 담당자·연락처는 콜을 잡을 때 이미 들어오므로(28/28 확인)
                                건너뛰어도 잃는 정보가 없다. */}
                            {isPickup && deadlineAt && onwardMinutes != null && onwardMinutes > 0 && (() => {
                                const loadDoneMs = new Date(deadlineAt).getTime() + dwell * 60_000;
                                const arriveMs = loadDoneMs + onwardMinutes * 60_000;
                                const slots = buildArrivalSlots(loadDoneMs, onwardMinutes, 4);
                                return (
                                    <div className="rounded-md border border-info/35 bg-info/[0.06] px-2.5 py-2 flex flex-col gap-1.5">
                                        <div className="text-[11px] font-black text-info">이어서 — 하차지도 지금 정하기</div>
                                        <div className="text-[12px] text-text-primary">
                                            {hhmm(deadlineAt)} 상차 도착 <span className="text-text-muted">+ 상차 {dwell}분</span>
                                            {' = '}<b className="tabular-nums">{hhmm(new Date(loadDoneMs).toISOString())}</b> 출발
                                            <div className="mt-0.5">
                                                상차지 → 하차지
                                                {onwardKm != null && <> <b className="tabular-nums">{onwardKm.toFixed(1)}</b>km</>}
                                                {' · '}<b className="tabular-nums">{onwardMinutes}</b>분
                                                {' → '}<b className="text-info tabular-nums">{hhmm(new Date(arriveMs).toISOString())}</b> 도착
                                            </div>
                                        </div>
                                        <div className="flex gap-1.5 flex-wrap">
                                            {slots.map(sl => {
                                                const on = onwardDeadlineAt === sl.iso;
                                                return (
                                                    <button key={sl.iso}
                                                        onClick={() => setOnwardDeadlineAt(on ? undefined : sl.iso)}
                                                        className={`px-3 py-2 rounded-md border text-[14px] font-black tabular-nums ${
                                                            on ? 'bg-info text-white border-info'
                                                               : 'bg-surface-alt/50 text-text-primary border-border'
                                                        }`}>{sl.label}</button>
                                                );
                                            })}
                                        </div>
                                        <div className="text-[10px] text-text-muted">
                                            {onwardDeadlineAt
                                                ? '다음 단계(하차지 통화)에 미리 채워 둡니다 — 통화할지는 그때 정하세요'
                                                : '정해 두면 다음 단계에 미리 채워 둡니다'}
                                        </div>
                                    </div>
                                );
                            })()}

                            {deadlineAt && (() => {
                                const spare = Math.max(0, Math.round((new Date(deadlineAt).getTime() - Date.now()) / 60000) - arrivalMinutes);
                                return (
                                    <div className={`text-[12px] font-bold px-2 py-2 rounded-md ${
                                        spare >= 60 ? 'bg-success/12 text-success'
                                        : spare >= 30 ? 'bg-info/10 text-info' : 'bg-warning/12 text-warning'
                                    }`}>
                                        🕒 {hhmm(deadlineAt)}까지 가겠다고 말하세요
                                        {spare > 0
                                            ? <> · 그 사이 <b>{spare >= 60 ? `${Math.floor(spare / 60)}시간 ${spare % 60 || ''}${spare % 60 ? '분' : ''}` : `${spare}분`}</b> 합짐을 잡을 수 있습니다</>
                                            : <> · 바로 출발해야 합니다</>}
                                    </div>
                                );
                            })()}

                            {/* 단계 모드에서는 이것이 **주 버튼**이다 — 저장이 곧 다음 단계로 넘어가는 것.
                                기사님: *"통화 완료와 통화 스킵 이렇게 선택권이 있으면 될 것 같아."*
                                짝이 되는 [통화 스킵] 은 바로 아래에 카드가 붙인다. */}
                            <button onClick={() => save('DECLARED')}
                                className={`w-full rounded-lg bg-info text-white font-black active:scale-[0.99] transition-transform ${
                                    stepMode ? 'py-3.5 text-[15px]' : 'py-2.5 text-[13px]'
                                }`}>
                                {stepMode ? '통화 완료' : '통화 종료 · 저장'}
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
                        {/* 🔴 2026-08-12 — 눌러 놓고 되돌릴 수가 없었다.
                            기사님 기준: *"단계별로 DB 에 저장하고 … **수정이 가능해야 한다**."*
                            잘못 눌러도 시각 기록이 영영 틀어진 채 남았다.
                            이미 누른 버튼은 **취소 버튼**이 된다 (한 번 더 묻는다). */}
                        <button
                            onClick={() => {
                                const m = isPickup ? 'ARRIVED_PICKUP' : 'ARRIVED_DROPOFF';
                                if (!arrivedAt) {
                                    socket.emit('report-milestone', {
                                        orderId, milestone: m,
                                        predictedAt: driveKnown ? new Date(Date.now() + driveMinutes! * 60_000).toISOString() : undefined,
                                    });
                                } else if (confirm(`도착 기록(${hhmm(arrivedAt)})을 취소할까요?`)) {
                                    socket.emit('undo-milestone', { orderId, milestone: m });
                                }
                            }}
                            className={`flex-1 py-2.5 rounded-md text-[13px] font-black border ${
                                arrivedAt ? 'bg-text-muted/10 text-text-muted border-border'
                                : 'bg-warning/12 text-warning border-warning/45'
                            }`}>
                            {arrivedAt ? `✓ 도착 ${hhmm(arrivedAt)} · 취소` : '📍 도착'}
                        </button>
                        <button
                            onClick={() => {
                                const m = isPickup ? 'PICKED_UP' : 'DELIVERED';
                                if (!doneLoad) { save('ACTUAL'); socket.emit('report-milestone', { orderId, milestone: m }); }
                                else if (confirm(`${isPickup ? '상차' : '하차'} 완료 기록을 취소할까요?`)) {
                                    socket.emit('undo-milestone', { orderId, milestone: m });
                                }
                            }}
                            className={`flex-1 py-2.5 rounded-md text-[13px] font-black border ${
                                doneLoad ? 'bg-text-muted/10 text-text-muted border-border'
                                : 'bg-success text-white border-success'
                            }`}>
                            {doneLoad ? (isPickup ? '✓ 상차완료 · 취소' : '✓ 하차완료 · 취소') : (isPickup ? '📦 상차 완료' : '🏁 하차 완료')}
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
