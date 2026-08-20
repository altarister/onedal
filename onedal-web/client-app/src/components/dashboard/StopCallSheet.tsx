import { useState, useEffect, useRef, useMemo } from 'react';
import {
    HANDLING_METHODS, cargoPoints, parseCargoHints, hasCargoHints, defaultCargoByVehicle,
    PROTECTIONS, PROTECTION_MINUTES, DEFAULT_PROTECTIONS, protectionMinutes,
    AFTERWORKS, AFTERWORK_MINUTES, DEFAULT_AFTERWORKS, afterworkMinutes,
    CARGO_TAGS, CARGO_TAG_META, DEFAULT_CARGO_TAG, computeSlackMinutes,
    CARGO_UNITS, CARGO_UNIT_QUANTITY_INPUT,
    buildArrivalSlots, dwellMinutes, unitPoints,
    arrivalReasonGroupsFor, REASON_NEEDS_MEMO,
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
    /** 콜의 차종 — 통화 전 기본 짐을 미리 눌러 두는 데 쓴다 (기사님 2026-08-18) */
    vehicleType?: string | null;
    /**
     * [통화 스킵] — 있으면 [통화 완료] 와 **한 줄에** 나란히 놓는다 (기사님 2026-08-18).
     * 예전엔 카드가 시트 바깥 아래에 따로 붙여서 두 줄이 됐다.
     */
    onSkip?: () => void;
    /** 건너뛰기 버튼의 글자 — 없으면 버튼을 띄우지 않는다 (하차 완료는 건너뛸 수 없다) */
    skipLabel?: string;
    /**
     * 🎯 지금 어느 단계인가 — **주 버튼을 하나만** 띄우기 위해 받는다 (기사님 2026-08-19).
     * 추측(도착 기록 유무)으로 갈라도 되지만, 되돌아보기·건너뛰기가 섞이면 어긋난다.
     */
    stepId?: string;
    /** 📍 이 정거장 도착에 남긴 사유 (없으면 정상 도착) */
    arrivedReasons?: string[];
    /** 📍 상차·하차 완료에 남긴 사유 */
    doneReasons?: string[];
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
    /**
     * 🕒 **도착 예상 (ms)** — 타임라인이 만든 값. **시트는 이걸 그대로 쓴다.**
     *
     * 🔴 예전에는 `driveMinutes` 만 받아 **시트가 열린 시각**에 더했다. 그런데 그 분은
     *    닻(`routeComputedAt`)부터 잰 값이라 **닻과 시트를 연 시각의 차이만큼 통째로 밀렸다**
     *    (실측: `기준 18:20:03 · 닻 18:17:26`). 시트를 늦게 열수록 더 벌어진다.
     *    게다가 화면 안에서도 기준이 둘이었다 — 칸은 `slotBaseMs`(고정), 문구는 `Date.now()`(흐름).
     *    그래서 **칸은 멈춰 있는데 문구의 도착 예상만 계속 늘어났다.**
     */
    etaMs?: number | null;
    /**
     * 🚚 **앞 정거장을 떠나는 시각 (ms)** — 타임라인이 만든 값. **시트는 그리기만 한다.**
     *
     * 🔴 예전에는 `Date.now() + leadMinutes` 로 **시트가 자기 계산**을 했다 (실측 2026-08-20:
     *    `16:19 출발`, 참값 `17:03` — 44분 이름). 시트를 열 때마다 값이 달라졌고,
     *    상차지 시트와 하차지 시트가 **서로 다른 출발 시각**을 말했다.
     */
    departPrevMs?: number | null;
    /**
     * 🚚 **앞 정거장에서 여기까지의 주행(분)** — `driveMinutes` 는 닻부터의 **누적**이다.
     *
     * 🔴 문장에 누적을 쓰면 접근 주행을 **두 번** 센다 (실측: `주행 129분`, 참값 `113분`).
     *    129 = 접근 16 + 단독 113 이고, 상차지를 떠난 뒤의 주행은 113 뿐이다.
     */
    segmentDriveMinutes?: number | null;
    /**
     * 🔬 **계측 (2026-08-19)** — 이 시트가 쓴 재료의 출처. 저장할 때만 서버 로그로 나가고
     * **저장되지 않는다.** 원인이 확정되면 지운다. (`PinnedRouteCard` 의 주석 참고)
     */
    diag?: { source: string; routeComputedAt: string | null; etaMs: number | null };
    /** 그 일을 하는 곳의 이름 (`이마트 광주점`) — 문장이 "상차지에서" 대신 실제 이름으로 읽힌다 */
    leadFrom?: string | null;
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
    /**
     * 🔴 서버가 규칙으로 만든 **상차 마감**(`콜 잡은 시각 + 60분`).
     *    주행 시간과 **무관**하다 — 화주가 기다려 주는 시간이지 내가 얼마나 걸리느냐가 아니다.
     *    그래서 주행을 아직 몰라도 이 값으로 칸을 추천할 수 있다 (2026-08-16).
     */
    pickupDeadlineAt?: string | null;
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
        (r.promisedArrivalAt ?? r.deadlineAt) && `${(r as any).promisedArrivalFromAt ? `${hhmm((r as any).promisedArrivalFromAt)}~` : ''}${hhmm(r.promisedArrivalAt ?? r.deadlineAt!)}${(r as any).promisedArrivalFromAt ? ' 사이' : '까지'}`,
    ].filter(Boolean).join(' · ');
}

export default function StopCallSheet({
    orderId, stopType, label, address, contactName, phones, reports,
    memoTexts, driveMinutes, onSkip, skipLabel, stepId, vehicleType, orderStatus, arrivedAt, arrivedReasons, doneReasons, forceOpen, stepLabel,
    leadMinutes = 0, leadLabel, leadFrom, driveKm, codAmount, pickupDeadlineAt, etaMs, diag,
    departPrevMs, segmentDriveMinutes,
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
    /** 적요가 없어 차종 정원으로 눌러 둔 상태 — 화면에 근거를 남긴다 */
    const [prefilledFromVehicle, setPrefilledFromVehicle] = useState(false);
    /** 🔒 보호 — 호루·결박·그물망·탑박스 (복수 선택). 결박은 늘 한다 */
    const [protections, setProtections] = useState<string[]>([...DEFAULT_PROTECTIONS]);
    /** 🧹 후작업 — 정리·검수 (하차 전용 · 복수 선택). 기본은 아무것도 안 누른다 */
    const [afterworks, setAfterworks] = useState<string[]>([...DEFAULT_AFTERWORKS]);
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
    /**
     * 🕒 약속의 **"부터"(하한)** (기사님 2026-08-19) — "12시부터 12시30분 사이에 갈게요".
     * deadlineAt(까지)만 있으면 "1시 전에 갈게요" — 기존과 같다. 칸을 **두 번 탭**하면 구간이 된다.
     * 정각 약속은 사슬 전체를 경직시킨다 — 구간이면 폭 안에서 흡수돼 다음 약속을 조율할 수 있다.
     */
    const [deadlineFromAt, setDeadlineFromAt] = useState<string | undefined>();
    /**
     * 📍 **도착 사유** (기사님 확정 2026-08-19) — 정상이면 비어 있다.
     * 아무것도 안 고르고 `📍 도착` 을 누르면 **지금과 완전히 같은 동작**이다.
     */
    const [reasons, setReasons] = useState<string[]>([]);
    const [reasonMemo, setReasonMemo] = useState('');
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
    const dwell = dwellMinutes(eff.handling, points, isPickup ? 'pickup' : 'dropoff', undefined,
        isPickup ? protections : undefined, isPickup ? undefined : afterworks);
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
    /**
     * 🔴 **약속 복원은 여기 한 곳뿐이다** (2026-08-19 코드리뷰).
     *    예전엔 `loadInto` 의 세 분기(차종기본값·적요·일반)가 **각자** 복원했고,
     *    그중 적요 분기에만 `onwardDeadlineAt` 이 빠져 있었다 — 적요 힌트가 있는 콜에서
     *    **상차 통화에서 들은 하차 시각이 조용히 유실**됐다. 한 벌만 고치면 나머지가 갈라진다.
     */
    const restorePromise = (src?: CargoReport, onward?: string) => {
        setDeadlineAt(src?.promisedArrivalAt ?? src?.deadlineAt ?? onward);
        setDeadlineFromAt((src as any)?.promisedArrivalFromAt ?? undefined);
        setOnwardDeadlineAt(src?.onwardDeadlineAt);
    };

    const loadInto = (src?: CargoReport) => {
        // 하차지 통화인데 아직 시각을 안 정했다면, **상차지 통화에서 들은 값**을 미리 넣는다
        const onward = !isPickup && !(src?.promisedArrivalAt ?? src?.deadlineAt)
            ? reports.find(r => r.stopType === 'pickup' && r.kind === 'DECLARED')?.onwardDeadlineAt
            : undefined;
        setFromPickupCall(!!onward);
        const h = parseCargoHints(...(memoTexts || []));
        const prefilled = !src?.unit && !src?.handling && hasCargoHints(h);
        setPrefilledFromMemo(prefilled);

        /**
         * 🚚 **적요에 힌트가 없으면 차종 기본값을 눌러 둔다** (기사님 확정 2026-08-18).
         *    서버는 이미 신고가 없으면 `VEHICLE_CAPACITY[차종]` 을 적재로 잡는다
         *    (`computeLoadedPoints`) — 화면만 빈칸이라 **두 곳이 다른 값을 보고 있었다.**
         *    순서는 **저장값 > 적요 > 차종 기본값**. 적요는 이 콜의 실제 정보이고
         *    차종은 "그 차 한 대 분량"이라는 짐작이라 뒤에 온다.
         */
        const byVehicle = isPickup && !src?.unit && !hasCargoHints(h)
            ? defaultCargoByVehicle(vehicleType) : null;

        /**
         * 🔴 **하차 방법도 상차와 같은 것으로 미리 눌러 둔다** (기사님 2026-08-18).
         *    지게차로 실었으면 대개 지게차로 내린다 — 서버의 `computeStopTiming` 도
         *    *"하차 방법을 따로 안 물었으면 상차와 같다고 본다"* 로 이미 그렇게 계산한다.
         *    화면만 빈칸이면 또 두 곳이 다른 값을 보게 된다.
         */
        const dropoffHandling = !isPickup
            ? (reports.find(r => r.stopType === 'pickup' && r.kind === 'DECLARED')?.handling
               ?? defaultCargoByVehicle(vehicleType)?.handling)
            : undefined;
        setPrefilledFromVehicle(!!byVehicle);
        if (byVehicle) {
            setUnit(byVehicle.unit);
            setQty(byVehicle.quantity);
            setTens(Math.floor(byVehicle.quantity / 10) * 10);
            setOnes(byVehicle.quantity % 10 || null);
            // 🔴 파레트면 지게차 (기사님 2026-08-18: "파레트를 사람 손으로 내리기는 너무 어려우니까")
            setHandling(src?.handling ?? byVehicle.handling);
            setTags(src?.tags?.length ? [...src.tags] : [DEFAULT_CARGO_TAG]);
            setMemo(src?.memo || '');
            setProtections(src?.protections?.length ? [...src.protections] : [...DEFAULT_PROTECTIONS]);
            setAfterworks(src?.afterworks?.length ? [...src.afterworks] : [...DEFAULT_AFTERWORKS]);
            restorePromise(src, onward);
            return;
        }
        if (prefilled) {
            setUnit(h.unit);
            setQty(h.quantity);
            setTens(Math.floor((h.quantity ?? 0) / 10) * 10);
            setOnes(h.quantity ? h.quantity % 10 : null);
            setHandling(h.handling);
            setTags(h.tags?.length ? [...h.tags] : [DEFAULT_CARGO_TAG]);
            setMemo(src?.memo || '');
            restorePromise(src, onward);
            return;
        }
        setUnit(src?.unit as CargoUnit | undefined);
        setQty(src?.quantity);
        // 저장된 수량을 십·일 자리로 되돌려 놓는다. 안 하면 23개를 불러왔는데
        // 버튼은 아무것도 안 눌린 것처럼 보이고, 일의 자리를 누르는 순간 값이 뒤집힌다
        const q = src?.quantity ?? 0;
        setTens(Math.floor(q / 10) * 10);
        setOnes(q > 0 ? q % 10 : null);
        setHandling(src?.handling ?? dropoffHandling);
        // 성질을 한 번도 안 고른 기록이면 기본값을 넣는다 — 빈 값과 '특별할 것 없음'은 다르다
        setTags(src?.tags?.length ? [...src.tags] : [DEFAULT_CARGO_TAG]);
        setMemo(src?.memo || '');
        setProtections(src?.protections?.length ? [...src.protections] : [...DEFAULT_PROTECTIONS]);
        setAfterworks(src?.afterworks?.length ? [...src.afterworks] : [...DEFAULT_AFTERWORKS]);
        restorePromise(src, onward);
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
        /**
         * 🔴 **저장했으면 그건 기사님이 고른 값이다** (기사님 실측 2026-08-19).
         *
         * *"234가 선택된 걸 확인하고 통화 완료를 눌렀는데, 뒤로 갔다 오면 이전으로
         * 돌아가 있다. 콜 요약 줄의 물결도 사라졌다"* — 저장은 됐는데 `deadlineTouched`
         * 가 false 인 채라, 시트가 다시 열릴 때 **추천 재적용이 고른 값을 덮었다.**
         * 저장은 손댄 것과 같다 — 표식을 세워 추천이 다시 끼어들지 못하게 한다.
         */
        setDeadlineTouched(true);
        socket.emit('save-cargo-report', {
            orderId, stopType, kind,
            unit: isPickup ? eff.unit : undefined,
            quantity: isPickup ? eff.quantity : undefined,
            handling: eff.handling,
            promisedAt: saved?.promisedAt || hints.promisedAt,
            /**
             * 🕒 **약속은 도착 시각으로 저장한다** (기사님 확정 2026-08-18).
             * 상차 소요는 짐 양에 따라 변하는 값이라, 완료 기준으로 저장하면 신고할 때마다
             * 약속이 흔들린다 (실측: 40박스 신고 → 갑자기 지각). 완료 시각은 서버가
             * `도착 약속 + 지금 추정 소요` 로 파생한다 — deadlineAt 은 더 이상 저장하지 않는다.
             */
            /**
             * 🔴 **약속 없이 저장하지 않는다** (2026-08-19 코드리뷰).
             *    `deadlineAt` 이 undefined 인 채 통화 완료를 누르면 약속이 안 잡힌 콜이 된다 —
             *    타임라인·카운트다운이 근거를 잃고, 화면은 "통화했다"고 표시한다.
             *    고른 게 없으면 화면에 눌려 있던 추천값을 그대로 싣는다.
             */
            /**
             * 🚫 **합의하지 않은 시각을 약속으로 저장하지 않는다** (기사님 확정 2026-08-19).
             *
             * 기사님: *"통화는 스킵할 수 있는데.. 그러면 30분이 넘는 값이 통화 없이 내가
             * 결정하게 되는 거야.. **난 그런 결정을 내릴 권한이 없어.**"*
             *
             * 🔴 확정 약속은 **화주와 합의한 시각**만이다. 손대지 않은 추천값을 확정으로
             *    저장하면 아무도 합의하지 않은 시각이 출발 마감을 묶고 카운트다운을 정한다
             *    (규칙 ① — 결정은 기사님이).
             *    안 저장해도 잃는 것이 없다 — 타임라인이 추정 약속을 쓰고 화면은 `~` 로
             *    그것이 추정임을 말한다. **그게 정직한 상태다.**
             *    (이전에 내가 반대로 고쳤던 자리다 — "약속이 없는 콜이 된다"는 걱정은 틀렸다)
             */
            promisedArrivalAt: deadlineTouched ? deadlineAt : undefined,
            promisedArrivalFromAt: deadlineTouched ? deadlineFromAt : undefined,
            // 🔴 하차지 시각은 **하차지 기록으로 저장하지 않는다.** 저장하면
            //    deriveCallStep 이 "하차지 통화를 했다"고 보고 그 단계를 건너뛴다.
            //    기사님: *"내 의도는 시퀀스로 되어 있는데 두 개를 한 번에 가는 건 기준이 흔들리는 것 같아."*
            //    상차지 통화에서 **들은 값**일 뿐이므로 여기 담아 두고,
            //    하차지 통화 단계에서 미리 채워 준다. 통화 여부는 기사님이 정한다.
            onwardDeadlineAt: isPickup && kind === 'DECLARED' ? onwardDeadlineAt : undefined,
            tags: isPickup && tags.length ? tags : undefined,
            protections: isPickup && protections.length ? protections : undefined,
            afterworks: !isPickup && afterworks.length ? afterworks : undefined,
            memo: memo || undefined,
            /**
             * 🔬 **계측 (2026-08-19)** — 이 약속을 만든 재료를 그대로 싣는다.
             *    서버는 로그로만 쓰고 버린다 (`socketHandlers` 의 `약속 계측` 참고).
             *    `touched` 가 특히 중요하다 — 18:51 을 **기사님이 직접 누르신 것인지**
             *    시스템이 추천한 것인지가 여기서 갈린다.
             */
            _diag: diag ? {
                ...diag,
                driveMinutes, leadMinutes,
                baseAt: new Date(slotBaseMs.current).toISOString(),
                suggestedAt: suggestedSlot?.iso,
                touched: deadlineTouched,
            } : undefined,
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
    /**
     * 🔴 **칸을 매 렌더마다 새로 만들면 고른 값이 조용히 풀린다** (2026-08-18 실측).
     *
     * 예전에는 `buildArrivalSlots(Date.now(), …)` 를 렌더마다 불렀다. 모의 주행 중에는
     * GPS 로 초마다 다시 그려지는데, **분이 넘어가는 순간 모든 칸의 시각이 1분씩 밀린다.**
     * 그러면 이미 눌러 둔 값(`deadlineAt`)이 어느 칸과도 안 맞아 **선택이 사라진 것처럼 보인다** —
     * 기사님 화면에서 "대기 44분"은 떠 있는데 아무 버튼도 안 눌린 상태가 이것이었다.
     * (달리는 동안 도착 예상이 당겨져 대기가 30 → 44분으로 늘어난 것도 같은 흐름이다)
     *
     * → 칸은 **분이 바뀔 때만** 다시 만들고, 고른 값이 목록에 없으면 **그 값을 칸으로 끼워 넣는다.**
     *   기사님이 고른 시각은 화면에서 사라지면 안 된다.
     */
    /**
     * 🔴 **분 틱으로 칸을 다시 만들던 것도 버린다** (기사님 실측 2026-08-19).
     *
     * 15초마다 `minuteTick` 이 바뀌면 칸 배열이 통째로 갈렸다. 그래서
     *   · 화면이 깜빡이고 (목록이 다시 그려진다)
     *   · **약속 시각이 픽스되지 않고 계속 뒤로 밀렸다** — 20분 뒤에 다시 열면
     *     칸 다섯 개가 전부 20분 미래로 가 있어, 아까 약속한 시각이 화면에서 사라진다
     *
     * 기사님: *"하나를 잡아 놓고 20분 후 다시 들어가 보면 도착 시간 약속했던 부분이 보여야 한다."*
     *
     * → 칸의 기준 시각은 **시트를 연 순간 한 번** 잡고 그대로 둔다.
     *   시간이 흐르는 것은 문장·카운트다운이 말하고, **고르는 칸은 움직이지 않는다.**
     *   ⚠️ 저장된 약속을 **기준으로 삼지는 않는다** — 그러면 그 약속이 첫 칸이 되어
     *      **더 이른 시각으로 당길 수가 없다.** 저장값은 아래에서 목록에 끼워 넣는다.
     */
    const slotBaseMs = useRef<number>(0);
    if (slotBaseMs.current === 0) slotBaseMs.current = Date.now();

    /**
     * 🕒 **도착 예상은 여기 하나뿐이다** (규칙 ③ · 2026-08-20).
     *    타임라인이 준 값을 그대로 쓰고, 없을 때만(경로 미계산) 분으로 만든다.
     */
    const arrivalMs = etaMs ?? (slotBaseMs.current + arrivalMinutes * 60_000);

    /**
     * 📏 **격자의 기준점** — 저장된 약속이 있으면 **그것이 기준**이다 (2026-08-19).
     *
     * 🔴 중복 칸(`11:05 · 11:06`)의 진짜 원인은 눈금이 아니라 **기준점이 열 때마다
     *    달라진 것**이었다. 한때 `:00/:30` 경계로 올려 풀려 했지만, 그러면
     *    **여유가 제멋대로 변한다** (도착 예상 17:02 → 28분, 17:29 → 1분).
     *    기사님: *"격자로 하면 여유 시간의 디폴트 값이 막 변화하는 거잖아."*
     *
     * 저장값을 기준으로 삼으면 그 값이 **언제나 칸 위에** 있어 중복이 안 생기고,
     * 여유도 늘 30분이다. 저장 전에는 `도착 예상 + 여유` 가 기준 —
     * 기사님 말씀대로 *"지금 시간부터 30분"* 이다.
     */
    const savedPromise = (declared as any)?.promisedArrivalFromAt ?? declared?.promisedArrivalAt ?? declared?.deadlineAt;
    const slotAnchor = savedPromise
        ? Date.parse(savedPromise)
        : arrivalMs + 30 * 60_000;
    const baseSlots = useMemo(() => {
        // 기준점을 두 번째 칸 자리에 두어 **더 이른 시각도 고를 수 있게** 한다.
        // 단 도착 예상보다 이른 칸은 지킬 수 없으므로 뺀다.
        const first = slotAnchor - 30 * 60_000;
        return buildArrivalSlots(Math.max(first, arrivalMs), 0, 5)
            .filter(sl => Date.parse(sl.iso) >= Math.floor(arrivalMs / 60_000) * 60_000);
    }, [arrivalMs, slotAnchor]);
    const hourSlots = useMemo(() => {
        /** 고른 값이 목록에 없으면 **칸으로 끼워 넣는다** — 구간이면 부터·까지 양 끝 다 */
        const pin = (list: typeof baseSlots, iso?: string) => {
            if (!iso || list.some(sl => sl.iso === iso)) return list;
            const d = new Date(iso);
            return [...list, {
                iso,
                label: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
                minutesFromNow: Math.round((d.getTime() - Date.now()) / 60_000),
            }].sort((a, b) => Date.parse(a.iso) - Date.parse(b.iso));
        };
        return pin(pin(baseSlots, deadlineAt), deadlineFromAt);
    }, [baseSlots, deadlineAt, deadlineFromAt]);

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
        if (hourSlots.length === 0) return null;
        /**
         * 🔴 **주행을 몰라도 추천한다** (2026-08-16).
         *
         * 합짐 콜은 병합 궤적이 **마지막 콜 하나에만** 실려(`pickRouteHolder`) 나머지는
         * 주행 시간이 비어 있다. 그때 화면이 아무것도 안 눌러 두어 기사님이 통화 중에
         * 빈 버튼 줄을 보셨다.
         *
         * 그런데 **상차 마감은 주행과 무관하다** — `콜 잡은 시각 + 60분`,
         * 즉 *화주가 기다려 주는 시간*이지 *내가 얼마나 걸리느냐*가 아니다.
         * 그래서 주행을 모르면 **서버가 만든 상차 마감**으로 고른다.
         */
        /**
         * **기준 시각 이상인 첫 칸**을 고른다. 그보다 이른 칸은 **지킬 수 없는 약속**이다 —
         * 주행 20 + 상차 15 = 35분이 필요한데 30분 뒤 칸을 부르면 5분 늦는다.
         *
         * 🔴 **초를 버리고 비교한다** (2026-08-16). `buildArrivalSlots` 가 `setSeconds(0,0)` 로
         *    칸의 초를 0 으로 만든다. 그래서 마감이 `10:35:17` 이면 `10:35:00` 칸이
         *    **17초 모자라** 탈락하고 **30분 뒤 칸**이 뽑혔다 —
         *    실측: 마감 10:35 인데 `11:05` 를 추천했다. 설계가 아니라 **17초** 때문이었다.
         */
        /**
         * 🎯 **목표에 가장 가까운 칸** — 단, 도착 예상보다 이른 칸은 고르지 않는다.
         *
         * 🔴 예전엔 "목표 **이후** 첫 칸"이었다. 격자가 :00/:30 이라 **2분만 지나쳐도
         *    30분이 통째로 밀렸다** — 실측: 도착 예상 17:02 + 여유 30분 = 17:32 인데
         *    18:00 이 눌렸다 (기사님: *"잡은 시점으로부터 30분 더 받는 거 아니었어?"*).
         *    화면은 이미 *"…이라 **가장 가까운** 18:00"* 이라 적고 있었다 —
         *    **문구가 맞고 코드가 틀렸다.**
         *
         * 도착 예상보다 이른 칸을 거르는 이유: 그건 **지킬 수 없는 약속**이다.
         * 17:30 은 도착 예상(17:02)보다 뒤이므로 후보가 된다 — 여유가 30분에서
         * 28분으로 줄 뿐이고, 여유는 애초에 근사값이다.
         */
        const nearestSlot = (targetMs: number, notBeforeMs: number) => {
            const floorMin = (ms: number) => Math.floor(ms / 60_000) * 60_000;
            const t = floorMin(targetMs);
            const earliest = floorMin(notBeforeMs);
            const usable = hourSlots.filter(sl => new Date(sl.iso).getTime() >= earliest);
            if (usable.length === 0) return hourSlots[hourSlots.length - 1];
            return usable.reduce((best, sl) =>
                Math.abs(new Date(sl.iso).getTime() - t) < Math.abs(new Date(best.iso).getTime() - t) ? sl : best);
        };

        if (!driveKnown) {
            if (!isPickup || !pickupDeadlineAt) return null;
            const t = new Date(pickupDeadlineAt).getTime();
            return nearestSlot(t, t);   // 주행을 모르면 마감 자체가 하한이다
        }
        // 🕒 도착 예상 + 30분 (기사님 2026-08-18: "디폴트 체크는 도착시간 + 30분").
        //    상차 소요를 더하지 않는다 — 약속은 도착이고, 소요는 짐 양에 따라 변한다.
        // 도착 예상(= 지금 + 주행)보다 이른 칸은 지킬 수 없다 — 그것이 하한
        return nearestSlot(slotAnchor, arrivalMs);
    }, [driveKnown, arrivalMs, dwell, isPickup, hourSlots, pickupDeadlineAt, slotAnchor]);


    /** 기사님이 아직 손대지 않아 추천값이 눌려 있는 상태인가 — 눌리면 근거 줄을 띄운다 */
    const [deadlineTouched, setDeadlineTouched] = useState(false);
    /**
     * 🔴 **저장된 약속은 이미 확정된 값이다** (기사님 실측 2026-08-19).
     *
     * DB 에 10:12~11:12 로 저장했는데 되돌아보기로 다시 열자 **10:12~10:42** 가 떴다 —
     * 시트가 새로 마운트되며 `deadlineTouched` 가 false 로 초기화되고, 추천 재적용이
     * "까지"를 추천 칸으로 덮은 것이다. 저장 때 표식을 세우는 것만으로는 부족했다
     * (마운트가 표식을 지운다). **미리 눌러 두기는 통화 전에만 한다.**
     */
    const hasSavedPromise = !!((declared as any)?.promisedArrivalAt ?? declared?.deadlineAt);
    useEffect(() => {
        // 손대지 않은 동안에는 추천 칸을 **따라간다**. 예전에는 `deadlineAt` 이 있으면 건너뛰어,
        // 칸이 밀린 뒤에도 옛 값이 남아 아무 버튼도 안 눌린 것처럼 보였다 (2026-08-18 실측).
        if (deadlineTouched || hasSavedPromise || !suggestedSlot || deadlineAt === suggestedSlot.iso) return;
        setDeadlineAt(suggestedSlot.iso);
    }, [deadlineTouched, hasSavedPromise, deadlineAt, suggestedSlot]);

    // ── 접힌 채로 보여줄 요약. 여기 없는 값은 기사님에게 "없는 값"이다 ──
    // 주행 시간을 모르면 여유도 모른다 — 0 으로 때우면 요약이 거짓말을 한다
    const declaredSlack = driveKnown
        ? computeSlackMinutes((declared as any)?.promisedArrivalAt ?? declared?.deadlineAt, driveMinutes! + leadMinutes, Date.now())
        : null;
    const declaredSummary = declared
        ? [summarize(declared), declaredSlack !== null && `${isPickup ? '상차버퍼' : '경유버퍼'} ${Math.max(0, declaredSlack)}분`]
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
    /**
     * 🎯 **지금 단계의 버튼만 보인다** (기사님 2026-08-19: *"상차지 도착과 상차 완료가
     *    완전 똑같은데? 중복으로 하나 더 생긴 거 아닌가?"*).
     *
     * 둘은 **데이터로는 다른 사실**이다 — 도착은 *거기 갔다*, 완료는 *실었다*.
     * 그 사이가 화주 부재·대기·불일치를 잡는 유일한 구간이라 합치지 않는다.
     * 다만 나란히 두면 화면이 구분을 지운다 — 그래서 **한 번에 하나만** 그린다.
     * stepId 가 없으면(리스트 조회 등) 예전처럼 둘 다 — 조회 화면은 정보를 줄이지 않는다.
     */
    const isArriveStep = stepId === 'ARRIVE_PICKUP' || stepId === 'ARRIVE_DROPOFF';
    const isDoneStep = stepId === 'LOADED' || stepId === 'DELIVERED';
    const showArrive = !stepId || isArriveStep;
    const showDone = !stepId || isDoneStep;

    const badges: Array<[string, string]> = [];
    if (declared) badges.push(['📞 통화완료', 'bg-info/15 text-info']);
    if (arrivedAt) badges.push([`📍 도착 ${hhmm(arrivedAt)}`, 'bg-warning/15 text-warning']);
    /**
     * 📍 **남긴 사유는 화면에 보인다** — 쓰기만 하고 안 읽으면 죽은 데이터다
     *    (`appLocation` 이 그렇게 죽었다 — `pnpm audit:dead` 가 잡았다).
     */
    if (arrivedReasons?.length) badges.push([`⚠️ ${arrivedReasons.join(' · ')}`, 'bg-danger/15 text-danger']);
    if (doneReasons?.length) badges.push([`⚠️ ${doneReasons.join(' · ')}`, 'bg-danger/15 text-danger']);
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

            <Row title={isPickup ? '상차방법' : '하차방법'}>
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
            {/* 🔒 보호 — 방법(옮기는 행위)과 축이 다르다. 고른 것의 분을 상차 시간에 더한다.
                기사님 2026-08-18: *"파레트를 선택하더라도 결박은 무조건 해야 하는 거지."* */}
            {isPickup && (
                <Row title="화물 보호">
                    {PROTECTIONS.map(t => {
                        const on = protections.includes(t);
                        return (
                            <button key={t}
                                onClick={() => setProtections(prev => on ? prev.filter(x => x !== t) : [...prev, t])}
                                className={`px-2 py-1.5 rounded-md text-[11px] font-bold border ${
                                    on ? 'bg-warning text-white border-warning' : 'bg-surface-alt/40 text-text-primary border-border'
                                }`}>
                                {t}<span className="ml-1 text-[10px] font-normal opacity-70">{PROTECTION_MINUTES[t]}분</span>
                            </button>
                        );
                    })}
                    {protections.length > 0 && (
                        <span className="text-[11px] text-text-muted self-center ml-1">
                            합 {protectionMinutes(protections)}분
                        </span>
                    )}
                </Row>
            )}

            {/* 🧹 후작업 — 짐을 내린 뒤에 하는 일. 보호(상차)와 짝이다 (기사님 2026-08-18:
                *"검수는 하차할 때 하는 거라 하차로 옮기는 것이 맞을 듯."*) */}
            {!isPickup && (
                <Row title="후작업">
                    {AFTERWORKS.map(a => {
                        const on = afterworks.includes(a);
                        return (
                            <button key={a}
                                onClick={() => setAfterworks(prev => on ? prev.filter(x => x !== a) : [...prev, a])}
                                className={`px-2 py-1.5 rounded-md text-[11px] font-bold border ${
                                    on ? 'bg-warning text-white border-warning' : 'bg-surface-alt/40 text-text-primary border-border'
                                }`}>
                                {a}<span className="ml-1 text-[10px] font-normal opacity-70">{AFTERWORK_MINUTES[a]}분</span>
                            </button>
                        );
                    })}
                    {afterworks.length > 0 && (
                        <span className="text-[11px] text-text-muted self-center ml-1">합 {afterworkMinutes(afterworks)}분</span>
                    )}
                </Row>
            )}

            {isPickup && (
                <Row title="화물성질">
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

            {/**
              * 📝 **메모는 통화 단계에만** (기사님 확정 2026-08-19:
              *    *"상차 완료, 하차 완료에 메모가 필요 없겠다. 기타가 새로 생겨서"*).
              *
              * 현장 단계에는 사유 칩과 `기타` 메모가 생겼다. 자유 메모까지 두면 같은 자리에
              * 적을 곳이 둘이 되어 **무엇을 어디에 적을지 흐려지고**, 같은 사실이 두 곳에
              * 나뉘어 남는다 (규칙 ③).
              * 통화에는 사유 칩이 없고 들은 말(*"지하 2층, 경비실 통과"*)을 적어야 하므로 남긴다.
              */}
            {isCall && (
                /* 🗂️ 라벨을 `기타` 로 — 현장 단계의 사유 갈래와 같은 말을 쓴다 (기사님 2026-08-19).
                   통화에서 들은 그 밖의 것이 여기 들어간다: *"지하 2층, 경비실 통과"* */
                <Row title="기타">
                    <input value={memo} onChange={e => setMemo(e.target.value)}
                        placeholder="통화에서 들은 그 밖의 것 — 지하 2층, 경비실 통과"
                        className="flex-1 min-w-0 bg-surface-alt/40 border border-border rounded-md px-2 py-2 text-[12px] text-text-primary placeholder:text-text-muted/70" />
                </Row>
            )}
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
                    {/* 🔴 2026-08-18 — `지금 할 일` 이라는 라벨 줄이 있었다. 바로 아래 `상차지 통화` 가
                        무엇을 할지 이미 말하므로 한 줄을 그냥 먹고 있었다. 기사님이 배치를 적어 주실 때도
                        이 줄은 없었다. **강조는 글자가 아니라 왼쪽 색띠와 배경이 한다.** */}
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

                            {!isPickup && fromPickupCall && (
                                <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-info/10 border border-info/35 border-dashed">
                                    <span className="text-[10px] font-black text-info shrink-0">상차지 통화에서 들음</span>
                                    <span className="text-[11px] text-text-muted flex-1">시각을 미리 채웠습니다 — 다시 확인하거나 그대로 두세요</span>
                                </div>
                            )}

                            {/* 🚚 차종 정원으로 눌러 둔 경우 — 어디서 온 값인지 화면에 남긴다.
                                서버도 신고 전에는 같은 값으로 적재를 잡는다 (computeLoadedPoints) */}
                            {isPickup && prefilledFromVehicle && (
                                <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-surface-alt/60 border border-border border-dashed">
                                    <span className="text-[10px] font-black text-text-muted shrink-0">차종 기본값</span>
                                    <span className="text-[11px] text-text-muted flex-1">
                                        {vehicleType} 한 대 분량으로 눌러 뒀습니다 — 통화로 확인하고 고치세요
                                    </span>
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

                            {/* 🎯 30분 단위 — 첫 칸이 곧 '지금 출발'이고, 한 칸이 30분의 합짐 시간이다.
                                기사님: *"9:39에 가도 될까요? 그럼 한 시간 동안 합짐을 잡을 수 있으니까."*
                                버튼마다 `여유 N분` 을 쓰지 않는다 — 몇 번째 칸인가가 곧 여유다. */}
                            <div>
                                {/* 다른 값들과 같은 `라벨 : 값` 꼴로 맞춘다 (기사님 2026-08-18) —
                                    제목을 따로 한 줄 쓰면 그만큼 세로를 먹는다 */}
                                <Row title="도착시간">
                                    {hourSlots.map((sl, i) => {
                                        const on = deadlineAt === sl.iso;
                                        const isFrom = deadlineFromAt === sl.iso;
                                        const inRange = !!deadlineFromAt && !!deadlineAt
                                            && sl.iso > deadlineFromAt && sl.iso < deadlineAt;
                                        /**
                                         * 🔴 **규칙은 하나 — 어떤 탭도 선택을 통째로 날리지 않는다**
                                         *    (기사님 실측 2026-08-19).
                                         *
                                         * 예전엔 2번이 눌린 채 4번을 누르면 **2가 사라지고 4만** 남았고,
                                         * 234 구간에서 4를 누르면 **23이 사라졌다.** 기사님:
                                         * *"의도적이면 설명서가 필요하고, 그렇지 않다면 기준이 있어야 한다."*
                                         *
                                         *   없을 때 탭            → 그 칸이 "까지" (한 점)
                                         *   한 점 + 다른 칸 탭    → 두 칸 사이가 **구간** (앞=부터, 뒤=까지)
                                         *   구간의 양 끝 탭       → 그 끝을 풀어 한 점으로
                                         *   구간 밖 칸 탭         → 구간을 **그 칸까지 늘린다** (extendRange)
                                         *
                                         * 설명서가 필요 없는 쪽으로 고른 기준이다 — 누른 칸은 언제나
                                         * 선택 안에 들어오고, 지우려면 그 칸을 다시 누른다.
                                         */
                                        const tap = () => {
                                            setDeadlineTouched(true);
                                            // 양 끝을 다시 누르면 그 끝만 푼다
                                            if (on && !deadlineFromAt) { setDeadlineAt(undefined); return; }
                                            if (isFrom) { setDeadlineFromAt(undefined); return; }
                                            if (on && deadlineFromAt) { setDeadlineAt(deadlineFromAt); setDeadlineFromAt(undefined); return; }
                                            if (!deadlineAt) { setDeadlineAt(sl.iso); return; }
                                            const next = extendRange(deadlineFromAt, deadlineAt, sl.iso);
                                            setDeadlineFromAt(next.from); setDeadlineAt(next.until);
                                        };
                                        return (
                                            <button key={sl.iso} onClick={tap}
                                                className={`px-2.5 py-1.5 rounded-md border text-[13px] font-black tabular-nums transition-colors ${
                                                    on || isFrom ? 'bg-info text-white border-info'
                                                    : inRange ? 'bg-info/20 text-text-primary border-info/40'
                                                    : i === 0 ? 'bg-surface-alt/50 text-text-muted border-border border-dashed'
                                                    : 'bg-surface-alt/50 text-text-primary border-border'
                                                }`}>
                                                {sl.label}
                                            </button>
                                        );
                                    })}
                                </Row>
                                {/* 🔴 **미리 채운 값에는 근거를 붙인다** (기사님 2026-08-16).
                                    기존 원칙과 같다 — *"적요는 부정확할 수 있으므로 어디서 온 값인지는
                                    화면에 남긴다."* 기사님이 직접 누르시면 이 줄은 사라진다. */}
                                {!deadlineTouched && deadlineAt && suggestedSlot?.iso === deadlineAt && (
                                    <div className="mt-1 text-[10px] leading-tight text-text-muted">
                                        {/* 🔴 **기준 시각을 함께 적는다.** 칸이 30분 간격이라 추천 칸과
                                            기준이 다를 수 있는데, 그걸 안 적으면 화면이 거짓말한다 */}
                                        {/* 🔴 근거는 **실제 계산 그대로** 적는다 (2026-08-19).
                                            예전 문구는 "주행+상차 → 04:09 이라 가장 가까운 04:35" — 실제 규칙
                                            (도착 예상 + 여유 30분 이상인 첫 칸)과 다른 말이었고, 도착 약속의
                                            근거에 상차 소요까지 섞어 보여줬다. 숫자가 우연히 맞아 보여 더 위험했다. */}
                                        ⓘ {driveKnown
                                            ? <>도착 예상 <b className="tabular-nums">{hhmm(new Date(arrivalMs).toISOString())}</b> + 여유 30분</>
                                            : <>콜 잡은 시각 + 1시간 → <b className="tabular-nums">{hhmm(pickupDeadlineAt!)}</b></>}
                                        {' 이라 가장 가까운 '}
                                        <b className="tabular-nums">{hhmm(deadlineAt)}</b> 을 눌러 뒀습니다 —
                                        바꾸시면 그게 확정됩니다
                                    </div>
                                )}
                            </div>

                            {/* 통화에서 그대로 읽을 수 있는 한 줄.
                                기사님: *"거기까지 가는데 몇 km고 28분 걸려 08:39에 도착해야 하는데…"* */}
                            {driveKnown ? (
                                /**
                                 * 🔴 **통화에서 실제로 하는 말로 쓴다** (기사님 2026-08-18).
                                 *    예전 문구는 *"지금 출발하면 17:57 도착"* 이었는데,
                                 *    기사님: *"지금 출발할 것도 아닌데 이렇게 쓰는 건 별로인 듯하다."*
                                 *    → 값들을 조합해 **한 문장**으로 읽는다 (기사님이 적어 주신 꼴):
                                 *      상차지  "여기서 (이마트 광주점)까지 5.9km · 주행 20분, 대기 30분 = 19:34 도착"
                                 *      하차지  "이마트 광주점에서 4분 상차하고 18:34 출발, 93.1km · 주행 109분,
                                 *              휴게 30분 = 20:23 도착"
                                 *
                                 *    갈 곳의 **이름**을 넣는다 — 통화 상대에게 "거기"는 말이 안 된다.
                                 *    이름을 모르면 넣지 않는다 (규칙 ④ — 지어내지 않는다).
                                 */
                                <div className="text-[13px] text-text-primary leading-relaxed">
                                    {(() => {
                                        const km = driveKm != null ? `${driveKm.toFixed(1)}km · ` : '';
                                        const arriveAt = deadlineAt
                                            ? hhmm(deadlineAt)
                                            : hhmm(new Date(arrivalMs).toISOString());
                                        // 구간 약속이면 "12:23~12:53 사이" 로 읽는다 — 통화 대사 그대로
                                        const fromLabel = deadlineAt && deadlineFromAt ? `${hhmm(deadlineFromAt)}~` : '';
                                        // 약속까지 남는 시간 = 상차버퍼 (이 자리에서 합짐을 잡을 수 있는 시간)
                                        const waitMin = deadlineAt
                                            ? Math.round((new Date(deadlineAt).getTime() - arrivalMs) / 60_000)
                                            : 0;
                                        const tail = (
                                            <>
                                                {waitMin > 0 && <>, {isPickup ? '대기' : '휴게'}{' '}
                                                    {/* 색이 곧 판단이다 — 60분↑ 넉넉 · 30분↑ 보통 · 그 아래 촉박 */}
                                                    <b className={`tabular-nums ${
                                                        waitMin >= 60 ? 'text-success' : waitMin >= 30 ? 'text-info' : 'text-warning'
                                                    }`}>{waitMin}분</b></>}
                                                {waitMin < 0 && <span className="text-danger font-bold">, 약속보다 {-waitMin}분 늦음</span>}
                                                {' = '}
                                                <b className="text-info tabular-nums">{fromLabel}{arriveAt}</b>{fromLabel ? ' 사이' : ''} 도착
                                            </>
                                        );

                                        if (isPickup) {
                                            return (
                                                <>
                                                    여기서 {contactName ? <>(<b>{contactName}</b>)까지</> : '거기까지'}{' '}
                                                    <b className="tabular-nums">{km}주행 {driveMinutes}분</b>
                                                    {tail}
                                                    <span className="text-text-muted"> (상차 {dwell}분,{' '}
                                                        <span className="tabular-nums">
                                                            {hhmm(new Date((deadlineAt ? new Date(deadlineAt).getTime() : arrivalMs) + dwell * 60_000).toISOString())}
                                                        </span> 출발)
                                                    </span>
                                                </>
                                            );
                                        }
                                        /* 🚚 **출발 시각과 구간 주행은 타임라인이 만든다** (규칙 ③ · 2026-08-20).
                                           시트가 **연 시각에 상차분을 더하던** 시절엔 상차지 시트가 말하는
                                           출발(17:03)과 44분 어긋났다. 없으면 앞 절을 아예 안 쓴다 —
                                           지어낸 시각으로 화주와 약속하면 안 된다 (규칙 ④). */
                                        const segMin = segmentDriveMinutes ?? driveMinutes;
                                        return (
                                            <>
                                                {departPrevMs != null && leadMinutes > 0 && leadLabel ? (
                                                    <>{leadFrom ? <b>{leadFrom}</b> : '상차지'}에서{' '}
                                                    <b className="tabular-nums">{leadMinutes}분</b> {leadLabel}하고{' '}
                                                    <b className="tabular-nums">{hhmm(new Date(departPrevMs).toISOString())}</b> 출발,{' '}</>
                                                ) : (
                                                    /* 이미 상차를 마쳤으면 앞 절이 없다 — 숫자로 문장이 시작하지 않게 주어를 넣는다 */
                                                    <>여기서 {contactName ? <>(<b>{contactName}</b>)까지</> : '거기까지'}{' '}</>
                                                )}
                                                <b className="tabular-nums">{km}주행 {segMin}분</b>
                                                {tail}
                                            </>
                                        );
                                    })()}
                                </div>
                            ) : (
                                /* 없는 숫자를 0 으로 때우면 "여유가 많다"고 거짓말하게 된다 */
                                <div className="text-[11px] text-warning bg-warning/10 border border-warning/35 rounded-md px-2 py-1.5">
                                    ⚠️ {isPickup ? '현위치 → 상차지' : '하차지까지'} 주행 시간을 아직 모릅니다 —
                                    도착 시각을 계산할 수 없습니다
                                </div>
                            )}

                            {/* ══ 이어서 하차지까지 한 통화로 ══
                                기사님: *"상차하고 출발 시간까지 알게 되면 다시 상차지에 하차지 정보까지
                                물을 수 있어. '하차지까지 몇 km 몇 분 걸릴 것 같은데 x:xx까지 가면 될까요?'
                                하고 물어본다면 **하차지는 통화하지 않아도 출발할 수 있을 듯.**"*

                                상차 시각을 정해야 하차 도착을 셀 수 있으므로, **정하고 나면 비로소 나타난다.**
                                접어 두지 않는다 — 통화가 그 순서로 흘러가기 때문이다.
                                하차지 담당자·연락처는 콜을 잡을 때 이미 들어오므로(28/28 확인)
                                건너뛰어도 잃는 정보가 없다. */}
                            {/* 🔴 「이어서 — 하차지도 지금 정하기」 를 뺐다 (기사님 2026-08-18):
                                *"통화 완료를 누르면 바로 다음 하차지 통화로 나올 건데,
                                한 화면에 중복으로 표현할 필요가 없어 보인다."*
                                시퀀스가 이미 다음 단계로 데려간다 — 규칙 ⑥(단계를 압축하지 않는다). */}

                            {/* 🔴 2026-08-18 — `🕒 20:23까지 가겠다고 말하세요 · 그 사이 30분 합짐` 배너가
                                여기 있었다. **바로 위 문장이 이미 같은 말**을 한다
                                (`… 대기 30분 = 20:23 도착`). 기사님: *"UI 영역을 아껴 써야 한다."*
                                → 배너를 지우고, 배너가 하던 일(여유를 **색**으로 알리기)은
                                  문장의 대기 항이 물려받는다. */}

                            {/* 단계 모드에서는 이것이 **주 버튼**이다 — 저장이 곧 다음 단계로 넘어가는 것.
                                기사님: *"통화 완료와 통화 스킵 이렇게 선택권이 있으면 될 것 같아."*
                                🔴 둘을 **한 줄에** 둔다 (기사님 2026-08-18) — 예전엔 스킵을 카드가
                                시트 바깥 아래에 붙여 두 줄이 됐다. 고르는 자리는 한 눈에 보여야 한다. */}
                            <div className="flex gap-2">
                            {/* 🔴 점선·흐린 글자였는데 **버튼으로 안 읽혔다** (기사님 2026-08-18).
                                스킵도 정상 경로다 — 적요가 충분하면 통화 없이 넘어간다. 숨길 이유가 없다.
                                다만 파란 [통화 완료] 와 같은 무게로 만들지는 않는다 (오클릭 방지). */}
                            {onSkip && skipLabel && (
                                <button type="button" onClick={(e) => { e.stopPropagation(); onSkip(); }}
                                    className={`shrink-0 px-4 rounded-lg border border-border bg-surface-alt/60 text-text-primary font-bold ${
                                        stepMode ? 'py-3.5 text-[14px]' : 'py-2.5 text-[13px]'
                                    }`}>
                                    {skipLabel}
                                </button>
                            )}
                            <button onClick={() => save('DECLARED')}
                                className={`flex-1 rounded-lg bg-info text-white font-black active:scale-[0.99] transition-transform ${
                                    stepMode ? 'py-3.5 text-[15px]' : 'py-2.5 text-[13px]'
                                }`}>
                                {stepMode ? '통화 완료' : '통화 종료 · 저장'}
                            </button>
                            </div>
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
                    {/**
                      * 📦 **짐 입력은 실어 본 뒤에만** (기사님 확정 2026-08-19).
                      *
                      * 🔴 도착 단계에서 수량을 적으면 그건 **추측인데 `ACTUAL`(실측)로 저장**된다 —
                      *    문을 열기도 전에 "실측"이 생기고, 그 값으로 `cargoMismatchRatio`
                      *    (신고 vs 실측)가 계산되어 **가짜 불일치 경고**가 뜬다.
                      *    도착의 관심사는 *오는 길과 그 장소*, 완료의 관심사가 *짐*이다.
                      */}
                    {showDone && cargoForm}


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

                    {/**
                      * 📍 **문제가 있었나요?** — 도착 버튼 **위**에 늘 펼쳐 둔다 (기사님 2026-08-19).
                      *    접어 두면 아무도 안 연다. 아무것도 안 고르고 도착을 누르면 **정상 도착**이라
                      *    지금과 완전히 같은 동작이다 (버튼 한 번).
                      *
                      * 🔴 이 값은 **아무것도 판정하지 않는다** — 색·필터·약속과 무관한 순수 기록이다.
                      *    그래서 목록이 아직 가설이어도 안전하다. `기타` + 메모가 목록을 고칠 재료다.
                      */}
                    {stepId && arrivalReasonGroupsFor(stepId).length > 0 && !(showArrive ? arrivedAt : doneLoad) && (
                        <div className="flex flex-col gap-1">
                            {arrivalReasonGroupsFor(stepId).map(g => (
                                <div key={g.label} className="flex gap-1 flex-wrap items-center">
                                    {/* 갈래 이름을 같은 너비로 — 시트마다 높이가 비슷해야 버튼을 찾기 쉽다 */}
                                    <span className="w-[64px] shrink-0 text-[11px] font-bold text-text-muted">{g.label}</span>
                                    {g.reasons.map(r => {
                                        const on = reasons.includes(r);
                                        return (
                                            <button key={r} type="button"
                                                onClick={() => setReasons(prev => on ? prev.filter(x => x !== r) : [...prev, r])}
                                                className={`px-2 py-1 rounded-md text-[11px] font-bold border ${
                                                    on ? 'bg-warning/85 text-white border-warning'
                                                       : 'bg-surface-alt/40 text-text-muted border-border'
                                                }`}>
                                                {r}
                                            </button>
                                        );
                                    })}
                                </div>
                            ))}
                            {/* `기타` 를 고를 때만 — 목록 밖의 일을 남길 데가 있어야 목록을 고칠 수 있다 */}
                            {reasons.includes(REASON_NEEDS_MEMO) && (
                                <input value={reasonMemo} onChange={e => setReasonMemo(e.target.value)}
                                    placeholder="무슨 일이었나요? (한 줄)"
                                    className="w-full px-2 py-1.5 rounded-md bg-surface-alt/40 border border-border text-[12px] text-text-primary" />
                            )}
                        </div>
                    )}

                    {/**
                      * ⑤ **주 버튼은 가운데, 서브는 좌우** (기사님 확정 2026-08-19).
                      *    통화 시트가 이미 그 모양이라 손이 같은 자리를 찾는다:
                      *      도착 단계 — [건너뛰기 20%] [📍 도착 80%]
                      *      완료 단계 — [건너뛰기 20%] [📦 상차 완료 60%] [✕ 상차 취소 20%]
                      *    위아래 여백은 최소로 — *"스크롤 안 하려면"* (기사님).
                      */}
                    <div className="flex gap-1.5">
                        {/* 아직 안 지나간 단계에만 — 이미 찍었으면 건너뛸 것이 없다 */}
                        {onSkip && skipLabel && !skipLabel.includes('통화') && !doneLoad && !arrivedAt && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); onSkip(); }}
                                title="기록 없이 다음 단계로"
                                className="w-[20%] shrink-0 py-2.5 rounded-md border border-dashed border-border bg-surface-alt/30 text-text-muted text-[12px] font-bold">
                                ⏭️ 건너뛰기
                            </button>
                        )}
                        {/**
                          * 💾 **저장도 같은 줄의 서브 버튼**이다 (기사님 실측 2026-08-19).
                          *
                          * 완료 버튼이 이미 `save('ACTUAL')` 을 겸하므로 완료 **전**에는 필요 없다.
                          * 완료 **뒤**에는 완료 버튼이 "취소"로 바뀌어 실측을 고칠 방법이 사라지므로
                          * 그때만 띄운다 — 다만 **폼 아래 큰 버튼으로 세우지 않는다.**
                          * 그러면 완료 전후로 화면 모양이 달라져 *"합짐은 예전 거로 보인다"* 가 된다.
                          * 어느 상태에서도 **줄은 하나**다.
                          */}
                        {showDone && doneLoad && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); save('ACTUAL'); }}
                                title="현장 내용만 다시 저장"
                                className="w-[20%] shrink-0 py-2.5 rounded-md border border-border bg-surface-alt/60 text-text-primary text-[12px] font-bold">
                                💾 저장
                            </button>
                        )}
                        {/* 🔴 2026-08-12 — 눌러 놓고 되돌릴 수가 없었다.
                            기사님 기준: *"단계별로 DB 에 저장하고 … **수정이 가능해야 한다**."*
                            잘못 눌러도 시각 기록이 영영 틀어진 채 남았다.
                            이미 누른 버튼은 **취소 버튼**이 된다 (한 번 더 묻는다). */}
                        {showArrive && (
                        <button
                            onClick={() => {
                                const m = isPickup ? 'ARRIVED_PICKUP' : 'ARRIVED_DROPOFF';
                                if (!arrivedAt) {
                                    socket.emit('report-milestone', {
                                        orderId, milestone: m,
                                        predictedAt: driveKnown ? new Date(Date.now() + driveMinutes! * 60_000).toISOString() : undefined,
                                        // 📍 고른 사유를 함께 — `기타` 면 메모를 붙여 목록을 고칠 재료로 남긴다
                                        reasons: reasons.length
                                            ? reasons.map(r => r === REASON_NEEDS_MEMO && reasonMemo.trim()
                                                ? `${r}: ${reasonMemo.trim()}` : r)
                                            : undefined,
                                    });
                                } else if (confirm(`도착 기록(${hhmm(arrivedAt)})을 취소할까요?`)) {
                                    socket.emit('undo-milestone', { orderId, milestone: m });
                                }
                            }}
                            className={`flex-1 py-3 rounded-md text-[14px] font-black border ${
                                arrivedAt ? 'bg-text-muted/10 text-text-muted border-border'
                                : 'bg-warning/12 text-warning border-warning/45'
                            }`}>
                            {arrivedAt ? `✓ 도착 ${hhmm(arrivedAt)} · 취소`
                                : reasons.length ? `📍 도착 (문제 ${reasons.length}건)` : '📍 도착'}
                        </button>
                        )}
                        {showDone && (
                        <button
                            onClick={() => {
                                const m = isPickup ? 'PICKED_UP' : 'DELIVERED';
                                if (!doneLoad) {
                                    save('ACTUAL');
                                    socket.emit('report-milestone', {
                                        orderId, milestone: m,
                                        // 📍 이 단계에서 고른 사유 (화주 미준비·물건 없음 등)
                                        reasons: reasons.length
                                            ? reasons.map(r => r === REASON_NEEDS_MEMO && reasonMemo.trim()
                                                ? `${r}: ${reasonMemo.trim()}` : r)
                                            : undefined,
                                    });
                                }
                                else if (confirm(`${isPickup ? '상차' : '하차'} 완료 기록을 취소할까요?`)) {
                                    socket.emit('undo-milestone', { orderId, milestone: m });
                                }
                            }}
                            className={`flex-1 py-3 rounded-md text-[14px] font-black border ${
                                doneLoad ? 'bg-text-muted/10 text-text-muted border-border'
                                : 'bg-success text-white border-success'
                            }`}>
                            {doneLoad ? (isPickup ? '✓ 상차완료 · 취소' : '✓ 하차완료 · 취소')
                                : `${isPickup ? '📦 상차 완료' : '🏁 하차 완료'}${reasons.length ? ` (문제 ${reasons.length}건)` : ''}`}
                        </button>
                        )}
                        {/* 상차 취소는 **상차 완료 단계**에만 — 도착 전에는 취소할 상차가 없다 */}
                        {isPickup && !doneLoad && showDone && (
                            <button onClick={() => socket.emit('cancel-at-stop', { orderId, stopType, reason: memo || '현장 상차 불가' })}
                                title="상차 취소 — 방출로 처리됩니다"
                                className="w-[20%] shrink-0 py-2.5 rounded-md bg-danger/12 text-danger border border-danger/45 text-[12px] font-black">
                                ✕ 취소
                            </button>
                        )}
                    </div>

                    {isPickup && !doneLoad && showDone && (
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

/**
 * 👆 **누른 칸을 품도록 선택을 늘린다** — 어떤 탭도 선택을 통째로 날리지 않는다
 *    (기사님 실측 2026-08-19: *"2번이 눌린 채 4번을 누르면 2가 사라진다.
 *    의도적이면 설명서가 필요하고, 그렇지 않다면 기준이 있어야 한다."*)
 *
 *   현재보다 이른 칸  → 그 칸이 새 "부터"
 *   현재보다 늦은 칸  → 그 칸이 새 "까지" (기존 시작이 "부터"가 된다)
 *   구간 안쪽 칸      → 그 칸이 새 "부터" (구간을 좁힌다)
 */
function extendRange(from: string | undefined, until: string, tapped: string):
    { from: string | undefined; until: string } {
    const start = from ?? until;
    if (tapped < start) return { from: tapped, until };
    if (tapped > until) return { from: start, until: tapped };
    return { from: tapped, until };
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-2">
            {/* 라벨은 `상차방법`·`화물 보호` 처럼 **무엇의 값인지**를 그대로 적는다 (기사님 2026-08-18) */}
            <span className="w-[52px] shrink-0 text-[11px] font-bold text-text-muted pt-2">
                {title && `${title} :`}
            </span>
            <div className="flex gap-1.5 flex-wrap flex-1">{children}</div>
        </div>
    );
}
