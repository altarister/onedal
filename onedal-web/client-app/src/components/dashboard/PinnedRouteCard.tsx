import { verdictOf, BUTTON_BG } from '../../lib/verdict';
import { useState, useEffect, useRef } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { isEvaluating, isTerminal, isManualLineage, isDeliveredCall, minRouteBuffer, derivationInputsOf, stopTimeOfRecords, safeCancelSecOf } from "@onedal/shared";
import type { SecuredOrder, StepViewRow } from "@onedal/shared";
import { socket } from "../../lib/socket";
import { getAddressLabel, getMinuteDiff , telHref } from "../../lib/routeUtils";
import { callNow } from "../../lib/phoneCall";
import { logRoadmapEvent, logStateChange } from '../../lib/roadmapLogger';


import { Badge } from "../ui/badge";
import StepSheetMock from './StepSheetMock';
import StepSwipeTrack from './StepSwipeTrack';
import type { CallRecords } from "../../hooks/records";
import { MILESTONE_LABEL, timingError, buildArrivalSlots,
         deriveCallTiming } from "@onedal/shared";
import { useJudgmentStore } from "../../stores/judgmentStore";
import type { RouteTimelineEntry, RouteStopInfo, CallTiming } from "@onedal/shared";
import { Button } from "../ui/button";

/**
 * 🕐 **칩 한 칸이 아는 것** — 도착 예상과, 앞 정거장 실측이 밀어낸 분.
 *
 * 🔴 두 값 다 `deriveRouteTimeline` 이 만든다 (규칙 ③). 예전엔 카카오 `sectionEtas` 를
 *    그대로 옮겨 **정차를 한 번도 안 셌다** — 같은 화면의 시트와 다른 시각을 말했다
 *    (2026-08-30 기사님 질문에서 드러났다).
 */
export interface EtaCell {
    pickupEta?: string; dropoffEta?: string;
    /** 앞 정거장들의 실측이 이 정거장을 밀어낸 분. `0` 이면 예측대로 — 안 그린다 */
    pickupShift?: number; dropoffShift?: number;
}

/* 🔼 **2026-09-05 — 내렸던 셋을 «위 덩어리»로 올려 되살렸다** (기사님 지시).
   「이 콜 처리」(방출·사무실 취소) · 「배송 주행 · 하차 마감」 · 「판정 근거 · 원본 데이터」.
   🔴 문제는 «있다/없다»가 아니라 **자리**였다 — 스텝 **아래**에 있어 카드가 셋으로 서고
      스크롤 막대가 두 개가 됐다. 위 덩어리 안으로 오니 콜을 설명하는 값들끼리 모인다. */

/* 🏗️ **`PromiseLines`(상차·하차 약속 줄)는 2026-09-05 에 철거했다.**
   기사님: *"타이틀하고 중복인 것 같은데 이걸 지우고 타이틀에 다 표현할 수 있지?"*
   ⚠️ 08-30 의 «안 A»(펼치면 원래 값과 지금 값을 둘 다 적는다)를 개정한 것이다 —
      옛 시각은 지나간 값이고, «달라졌나»는 **색**이 답한다. */

interface Props {
    route: SecuredOrder;
    isExpanded: boolean;
    onToggle: (id: string) => void;
    onDecision?: (id: string, action: 'ORDER_CONFIRMED' | 'SAFE_CANCEL' | 'ORDER_RELEASED_BY_ME' | 'ORDER_RELEASED_BY_OFFICE') => void;
    processingId: string | null;
    setProcessingId: (id: string | null) => void;
    etaMap: Map<string, EtaCell>;
    visitOrderMap: Map<string, { pickupIdx: number, dropoffIdx: number }>;
    indexNum: number;
    /** 🎨 콜 색 — 지도 마커 테두리와 같은 색 점 (한눈 대응 · 기사님 확정 0831 ②) */
    accentColor?: string;
    /** 이 콜의 서버 기록 (통화·현장 신고 + 마일스톤). 위에서 한 번에 받아 내려준다 */
    records: CallRecords;
    /** 🗺️ 경로 타임라인 — 덱·카운트다운과 같은 값을 통화 시트도 본다 (규칙 ③) */
    timeline?: RouteTimelineEntry[];
    routeStops?: RouteStopInfo[];
    routeComputedAt?: string | null;
    /**
     * `deck` — 진행 중 탭의 스와이프 덱. **폰 한 화면**이 목표라 헤더를 경로 한 줄로 줄인다.
     * `list` — 완료됨·취소/방출·전체. 조회용이라 포착시각·방문순서·ETA 를 그대로 둔다.
     */
    variant?: 'deck' | 'list';
    /**
     * 🎬 **시트 상태바가 이 콜의 어느 단계를 가리키나** (기사님 2026-09-15 · #143) — 무대의 `barFocusOf` 가 정한다.
     *    `null`·없음이면 장부의 현재 단계(`stepCurIdx`). 카드는 도착 사건을 따로 듣지 않는다.
     */
    focusStep?: 'ARRIVE_PICKUP' | 'ARRIVE_DROPOFF' | null;
    /** 🎬 이 카드가 지금 시트 상태바의 콜인가 — 맨 위일 때만 참 (#145) */
    focused?: boolean;
}

export default function PinnedRouteCard({
    route,
    isExpanded,
    onToggle,
    onDecision,
    processingId,
    setProcessingId,
    etaMap,
    visitOrderMap,
    indexNum,
    accentColor,
    records,
    timeline,
    variant = 'list',
    focusStep = null,
    focused = false,
}: Props) {
    const isDeck = variant === 'deck';
    /**
     * 👀 **미리보기에게 "결재 대기"는 판정 완료다** (기사님 실측 2026-08-22).
     *
     * 기사님: *"평가를 보여주면 좋을 것 같은데 계속 평가중만 깜박이고 있어."*
     *
     * `ORDER_AWAITING_DECISION` 은 원래 **기사님의 결재를 기다리는** 상태라 "평가중"으로
     * 그린다. 그런데 미리보기 콜은 결재 버튼 자체가 없다(결재는 인성 앱 확정 버튼으로 한다).
     * 그 상태로 두면 **판정이 끝났는데 화면은 영원히 깜박인다** — 색을 볼 수가 없다.
     *
     * ⚠️ 판정 **전**(`PRE_SECURED`·`SECURED_EVALUATING`)은 미리보기도 평가중이 맞다.
     *    벗기는 것은 판정이 끝난 뒤 한 칸뿐이다.
     */
    const evaluating = isEvaluating(route.status)
        && !(route.isPreview && route.status === 'ORDER_AWAITING_DECISION');
    /**
     * 🕐 **경로에 없으면 장부에서 읽는다** (기사님 발견 2026-08-30).
     *
     * 기사님: *"완료됨 가서 이전 콜을 확인해 보니 `?. 초월읍 약속? - ?. 신둔면 약속?`
     * 이렇게 나오는데.. **약속시간이 날아가나 봐.**"*
     *
     * `etaMap` 은 **지금 경로**에서 만든다. 끝난 콜은 경로에 없어 통째로 비었다 —
     * 그런데 장부에는 «몇 시에 갔는지»가 남아 있다. 규칙은 `stopTimeOfRecords` 하나다.
     */
    const ledgerTimeOf = (stop: 'pickup' | 'dropoff') => {
        const t = stopTimeOfRecords(records.reports, records.milestones, stop);
        return t ? new Date(t.ms).toTimeString().substring(0, 5) : undefined;
    };
    const fromRoute = etaMap.get(route.id);
    const etas = {
        pickupEta: fromRoute?.pickupEta ?? ledgerTimeOf('pickup'),
        dropoffEta: fromRoute?.dropoffEta ?? ledgerTimeOf('dropoff'),
    };
    const visitOrder = visitOrderMap.get(route.id);

    // [텔레메트리 스니펫] 카운터 상태 및 애니메이션 트리거
    const [telemetryCount, setTelemetryCount] = useState(0);
    const [isPinging, setIsPinging] = useState(false);
    /** ⏱️ 그 배차망의 안전취소 초 (서버 DB) — 픽커는 안전취소가 없어 null */
    const cancelSec = useSettingsStore(st => safeCancelSecOf(st, route.targetApp));

    // [2026-08-12] 통화/현장 기록은 **카드가 직접 불러오지 않는다.**
    //
    // 기사님: *"2개 있다면 각각 어디까지 진행되고 있는지 모두 스와이핑해야만 보인다."*
    // 카드가 자기 것만 따로 불러오면 **화면 밖 카드의 진행 상황을 아무도 모른다.**
    // 그래서 `useCallProgress` 로 위에서 한 번에 받아 요약 줄과 카드가 같은 값을 본다.
    const { reports: cargoReports, milestones: milestoneLog } = records;

    /**
     * [Phase 8.5] 진행 단계는 **저장하지 않고 파생**한다 (`deriveCallStep`).
     * 저장해 두면 새로고침·재접속·스와이프에서 어긋난다 — 2026-08-10 여섯 번 겪은 실수다.
     *
     * 로컬로 두는 것은 딱 둘.
     *   skippedTo — "통화를 건너뛰었다"는 서버에 남길 값이 아니다 (안 한 일을 기록하면 데이터가 오염된다)
     *   viewIndex — 지난 단계를 되돌아볼 때만. 새 기록이 들어오면 자동으로 따라간다
     */
    /* 🏗️ skippedTo·viewIndex 는 옛 시트와 함께 철거 — 새 단계 화면은 stepNav 하나로 같은 일을 한다 */
    /**
     * 되돌릴 수 없는 동작(방출·사무실 취소)을 누른 뒤 잠근다.
     * `processingId` 는 PinnedRoute 가 매 렌더 초기화해서(1초 동기화) 방어가 되지 않는다.
     */
    const [locked, setLocked] = useState(false);

    /**
     * 🌱 **[시험] 콜을 잡는 순간 여섯 단계가 정해진다** (2026-08-20)
     *
     * 기사님 구조를 **눈으로 확인**하기 위한 임시 블록이다.
     * 기존 흐름(통화 시트 · 마일스톤)은 그대로 두고, 옆에 나란히 세워 값을 견준다.
     */
    const [seededSteps, setSeededSteps] = useState<StepViewRow[] | null>(null);
    /** 🌱 단계 네비게이션 — 기존 카드와 같은 문법: null 이면 현재 단계, 숫자면 되돌아보는 중 */
    const [stepNav, setStepNav] = useState<number | null>(null);
    /**
     * 🏷️ **이 장을 «누가» 열었나** — 로그에만 쓴다 (기사님 실측 2026-09-12 밤).
     *
     * 🔴 라벨이 둘뿐이라 **셋째 원인이 숨었다.** 트랙이 제 이동을 손짓으로 오인해
     *    옛 장으로 되돌리던 것(`StepSwipeTrack` 의 `smooth`)도 `stepNav != null` 이라
     *    「사건이 연 것」으로 찍혔다 — 도착이 연 것과 **구별이 안 됐다.**
     *    값이 같아도 **원인이 다르면 다른 사건**이고, 갈라 찍어야 다음에 바로 보인다
     *    (어드민의 `[번호]`·`[다녀옴]` 이 한 판에 답을 낸 것과 같은 이유다).
     * ⚠️ 화면은 이 값을 안 읽는다 — 상태가 아니라 **기록용 꼬리표**라 ref 로 둔다.
     */
    const navByRef = useRef<'손으로 넘긴 것' | '되돌린 것'>('손으로 넘긴 것');
    useEffect(() => {
        const onSynced = (p: { orderId: string; steps: StepViewRow[] }) => {
            if (p.orderId === route.id) setSeededSteps(p.steps);
        };
        socket.on('steps-synced', onSynced);
        /* 블록이 항상 열려 있으므로 저장된 것을 바로 읽는다 — 심사 중엔 행이 없어 안 부른다 */
        if (!isEvaluating(route.status)) socket.emit('request-steps', { orderId: route.id });
        return () => { socket.off('steps-synced', onSynced); };
    }, [route.id, route.status]);
    /** ✅ 이 단계가 끝났나 — 모양은 `shared/stepRecords` 의 `StepViewRow` 하나에서 온다 */
    const stepDone = (x?: StepViewRow) => x?.born !== false && (x?.row?.status === 'DONE' || x?.row?.status === 'SKIPPED');
    /**
     * 🔴 현재 단계 = "첫 미완료"가 아니라 **증거 최전방** (기사님 실측 2026-08-21).
     *
     * GPS 도착이 하차지 통화를 건너뛰고 지나가자, "첫 미완료" 규칙이 화면을
     * **하차지 통화에 묶어** 상차 완료·하차 도착이 끝나도 안 따라갔다.
     * 옛 `deriveCallStep` 과 같은 규칙으로 간다 — 가장 멀리 간 증거의 **다음**이 현재다.
     * 건너뛰어진 통화는 PLANNED 로 정직하게 남고(안 한 건 안 한 것), 막대가 노랗게 알린다.
     */
    const stepCurIdx = (() => {
        if (!seededSteps) return 0;
        let last = -1;
        seededSteps.forEach((x, i) => { if (stepDone(x)) last = i; });
        return Math.min(last + 1, seededSteps.length - 1);
    })();
    useEffect(() => { setStepNav(null); }, [stepCurIdx, route.id]);

    /**
     * 🎬 **보여 줄 단계는 시트 상태바가 정한다** (기사님 2026-09-15).
     *
     * 기사님: *"시트가 맨위로 올라가면 무조건 현황판(시트 상태바)에 표기된 스텝이 표기 되어야 하는데."*
     * 🔴 **장부는 안 건드린다** — 화면이 볼 자리만 고른다 (규칙 ④). 상태바가 «✅ 초월읍 하차 도착»이면
     *    `focusStep` 이 `ARRIVE_DROPOFF` 로 오고, 아니면 `null` 이라 장부의 현재 단계(`stepCurIdx`)를 그린다.
     * 🔴 09-12 에는 이 카드가 도착 사건을 **따로 듣고** 도착 단계를 열었다 — 상태바·장부와 다른 단계가 떠서 걷었다.
     */
    /* 🎬 도착 사건을 여기서 따로 듣던 효과는 걷었다 (기사님 2026-09-15 · #143) — 단계는 시트 상태바(`focusStep`)가 정한다 */
    const focusStepIdx = focusStep && seededSteps ? seededSteps.findIndex(x => x.step === focusStep) : -1;
    /* 🎬 끌어올려 상태바의 콜이 되는 순간 손으로 넘긴 단계를 지운다 — 상태바 단계로 맞춘다 (기사님 2026-09-15 · #145) */
    useEffect(() => {
        if (focused) setStepNav(null);
    }, [focused, focusStep]);

    /**
     * 📡 **화면이 «지금 어느 단계»를 보여주는가 — 로그로 남긴다** (기사님 지시 2026-09-12 밤).
     *
     * 기사님: *"순식간에 열었다 닫았다 스텝은 모두 비슷하고. 어떻게 알아 —
     * 너가 콘솔 로그를 찍으면 되지."*
     *
     * ── 왜 필요한가 ──
     * 지금 로그로 알 수 있는 것은 **시트가 몇 단인가**(`[시트]`)와 **어느 콜을 열었나**
     * (`[시트연콜]`)까지다. 그 안에서 **어느 단계가 펼쳐졌는지는 아무 데도 안 남는다** —
     * 아침에 기사님이 *"도착 스텝을 못 본 거 같아"* 라고 하신 그 자리인데, 고치고도
     * **확인할 수단이 없었다.** 한 판을 더 돌려도 또 못 본다.
     *
     * 🔴 **«누가 열었나»를 함께 적는다.** 값이 같아도 원인이 다르면 다른 사건이다 —
     *    도착 사건이 연 것인지, 장부가 앞으로 가서 현재 단계로 돌아온 것인지.
     *    그 둘이 **0.2초 안에 엇갈리면** 화면에서는 «열렸다 닫혔다»로만 보인다.
     * ⚠️ `logStateChange` 는 **바뀔 때만** 남긴다 — 초당 재그림에 로그가 안 밀린다.
     *    키에 콜을 넣어 카드가 여럿이어도 서로 안 섞인다.
     */
    /* 손으로 넘긴 것 → 시트 상태바가 가리킨 단계 → 장부의 현재 단계 (#143) */
    const shownStepIdx = stepNav ?? (focusStepIdx >= 0 ? focusStepIdx : stepCurIdx);
    useEffect(() => {
        const sv = seededSteps?.[shownStepIdx];
        const by = stepNav != null ? navByRef.current : focusStepIdx >= 0 ? '상태바가 연 것' : '현재 단계';
        logStateChange(`스텝 ${route.id.slice(0, 8)}`, sv ? `${shownStepIdx} ${sv.step} · ${by}` : '없음', '무대');
    }, [shownStepIdx, stepNav, focusStepIdx, seededSteps, route.id]);

    /* 🏗️ deriveCallStep(옛 진행도)도 옛 시트와 함께 철거 — 현재 단계는 stepCurIdx(단계 행의 status)가 정한다 */


    // 새 기록이 들어와 단계가 앞으로 가면 되돌아보기를 자동 해제한다 —
    // 도착을 눌렀는데 화면이 옛 단계에 머물러 있으면 무엇이 반영됐는지 알 수 없다
    useEffect(() => {
        // 평가 중이 아닐 때는 카운터 초기화
        if (!isEvaluating(route.status)) {
            setTelemetryCount(0);
            return;
        }

        const handleTelemetryPing = (payload: { orderId: string }) => {
            if (payload.orderId === route.id) {
                setTelemetryCount(prev => prev + 1);
                setIsPinging(true);
                // 핑 애니메이션을 위해 잠깐 켰다가 끄기
                setTimeout(() => setIsPinging(false), 300);
            }
        };

        socket.on("telemetry-ping", handleTelemetryPing);
        return () => {
            socket.off("telemetry-ping", handleTelemetryPing);
        };
    }, [route.id, route.status]);

    const pLabel = visitOrder?.pickupIdx || '?';
    const dLabel = visitOrder?.dropoffIdx || '?';

    const minuteDiff = getMinuteDiff(etas?.pickupEta, etas?.dropoffEta);
    const separatorText = minuteDiff !== null ? `-${minuteDiff}분-` : '-';

    /**
     * 시간 파생은 **여기 한 번**뿐이다 (`deriveCallTiming`).
     *
     * 🔴 2026-08-12 — 예전에는 단독 구간 선택·접근 거리·상차 정차를 이 파일과
     *    `DepartureCountdown` 이 **각자 계산**했다. 한쪽만 고치면 두 화면이
     *    다른 시각을 말한다. 파생값을 만들었으면 그 입력도 한 곳에서 만든다.
     */
    // 🎛️ 판정 기준 탭의 시간 4칸을 함께 — 조립은 derivationInputsOf 한 곳 (서버·타임라인과 동일)
    const { rules: jdRules, unk: jdUnk } = derivationInputsOf(useJudgmentStore.getState().judgment);
    const timing = deriveCallTiming(route, cargoReports, milestoneLog, Date.now(), jdRules, jdUnk);
    const soloKm = timing.soloKm;
    const soloMin = timing.soloMinutes;

    return (
        /* 📏 **무대에서는 카드가 «판만큼» 선다** (목업 이식 0905) — 그래야 위 덩어리는
           고정되고 아래 단계만 스크롤한다. 옛 화면(조회용)은 그대로 내용만큼 자란다. */
        <div className={`flex flex-col relative overflow-hidden transition-all duration-300 ${isDeck ? 'flex-1 min-h-0' : ''} ${evaluating ? 'bg-warning/10' : 'hover:bg-surface-hover/50'} border-b border-border-card ${isTerminal(route.status) ? 'opacity-50 grayscale' : ''}`}>
            {(route.status === 'ORDER_SECURED_EVALUATING' || route.status === 'ORDER_AWAITING_DECISION') && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-warning/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite] pointer-events-none" />
            )}

            {/* 1-a. 덱 헤더 — **한 줄**. 폰 한 화면이 목표다.
                🔴 2026-08-18 — 경로·금액·거리·분·차종을 두 줄로 쓰고 있었는데,
                   그 다섯은 **바로 위 덱 요약 줄이 이미 말한다.** 기사님: *"UI 영역을 아껴 써야 한다."*
                   → 요약 줄에 없는 것만 남긴다: 몇 번째 콜인가 · 언제 잡았나 · 수수료 · 예약. */}
            {/* 🔤 목업과 같은 크기 — 머리 줄 11.5 · 칩 11 (재서 맞춤 0905) */}
            {isDeck && (
                /* 🔤 **한 줄로 선다** (기사님 2026-09-05: *"두 줄로 되어서 자리를 너무 많이
                    차지하고 있어"*). 간격을 6px 로 좁히고 줄바꿈을 막는다 — 넘치면 요금이
                   아니라 **가운데가** 줄어야 한다 (요금·번호는 흘깃 보는 값이다) */
                <div className="px-3 pt-2.5 pb-1 flex items-center gap-x-1.5 text-[11.5px] text-text-muted tabular-nums whitespace-nowrap">
                    {accentColor && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: accentColor }} />}
                    <span className="font-black text-text-primary">{indexNum}.</span>
                    {/* 🔄 이번 운행에서 **끝낸** 콜 — 사이클이 도는 동안 카드가 남는다 (2026-08-19).
                        마지막 하차를 마치면 이 카드들이 한꺼번에 완료됨 탭으로 간다 */}
                    {isDeliveredCall(route) && (
                        <span className="px-1.5 py-0.5 rounded bg-success/15 text-success text-[11px] font-black">✅ 완료</span>
                    )}
                    {/* 🕐 라벨을 뺐다 — 시각 하나면 «언제 잡았나»로 읽힌다 (목업 0905) */}
                    <span>
                        <b className="text-text-primary font-bold">
                            {route.capturedAt
                                ? new Date(route.capturedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                                : '-'}
                        </b>
                    </span>
                    {/**
                      * 🚚 **이 콜이 부르는 차종** — 단가가 여기서 나온다 (내 차종은 폴백일 뿐).
                      *    조회용 리스트 헤더에는 첫 글자만 있어서 **덱에서는 영영 안 보였다.**
                      */}
                    {route.vehicleType && (
                        <span className="px-1.5 rounded-[5px] text-[11px] font-black border
                                         bg-surface-alt border-border-card text-text-primary">{route.vehicleType}</span>
                    )}
                    {/**
                      * 🚨 **급송(독차)** — 서버는 `orderForm === '급송'` 을 DB(`isExpress`)에
                      *    넣고 있었는데 **관제웹 어디에도 그리는 곳이 없었다.**
                      *    급송은 단가도 긴급도도 다르다.
                      */}
                    {route.orderForm === '급송' && (
                        <span className="px-1.5 rounded-[5px] text-[11px] font-black border
                                         bg-warning/15 border-warning/40 text-warning">급송</span>
                    )}
                    {route.commissionRate && <><span>·</span><span>수수료 {route.commissionRate}</span></>}
                    {route.scheduleText && <span className="text-warning font-bold">🕒 {route.scheduleText}</span>}
                    {/* 🧭 어떻게 잡았나 — 덱 머리글에도 단다 (0830 실측: 배지가 리스트 헤더에만 살아서
                        기사님이 보는 덱에는 영영 안 나왔다). 알람 듣고 잡음=알람콜 · 손=직접콜 */}
                    {!evaluating && isManualLineage(route.type) && route.status !== 'ORDER_COMPLETED' && (
                        <span className="px-1.5 py-0.5 rounded bg-info/15 text-info text-[11px] font-black">
                            {route.capturedVia === 'ALARM' ? '🔔 알람콜' : '직접콜'}
                        </span>
                    )}
                    {route.isSimulated && !isTerminal(route.status) && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-400 border border-amber-400/40 text-[11px] font-black flex items-center gap-1">
                            <span>🐥 체험 운행 중</span>
                            {onDecision && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDecision(route.id, 'SAFE_CANCEL');
                                    }}
                                    className="ml-1 text-[10px] text-danger hover:underline font-bold"
                                    title="가상 체험 콜 종료"
                                >
                                    [체험 종료]
                                </button>
                            )}
                        </span>
                    )}
                    {evaluating && <span className="text-warning font-black animate-pulse">평가중</span>}
                    {/* 🎨 판정색 칩 — 색은 KEEP 버튼 배경에만 살아서, 버튼 없는 직접·알람 콜은
                        판정을 받아도 **색이 보일 자리가 없었다** (0831 실측 «그런 거 없어»).
                        색은 ⑤-3 — 흘깃 보고 결정하는 값이라 덱 머리글에 박는다. 판정 전엔 안 그린다 */}
                    {(() => {
                        const v = verdictOf(route);
                        if (!v.color) return null;
                        return (
                            <span className={`px-1.5 py-0.5 rounded text-[11px] font-black text-white ${BUTTON_BG[v.color]}`}>
                                {v.color}{route.judgment?.score != null ? ` ${route.judgment.score}` : ''}
                            </span>
                        );
                    })()}
                    {/* 💰 돈은 이 줄 맨 오른쪽 (기사님 2026-08-19) — 콜 요약 줄에서 옮겨 왔다 */}
                    <span className="ml-auto text-[17px] font-black text-text-primary tabular-nums">
                        {route.fare > 0 ? `${(route.fare / 10000).toFixed(1)}만원` : '금액미상'}
                    </span>
                </div>
            )}

            {/* 1-b. 리스트 헤더 (조회용 — 정보를 줄이지 않는다) */}
            {!isDeck && (
            <div
                onClick={() => !evaluating && onToggle(route.id)}
                className={`px-4 py-3 flex justify-between items-center w-full text-sm tracking-tight ${!evaluating ? 'cursor-pointer group hover:bg-surface-hover/30' : ''}`}
            >
                <div className="flex items-center gap-1 truncate flex-1">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded font-bold mr-1 text-text-muted border-border bg-surface-alt">
                        {route.capturedAt
                            ? new Date(route.capturedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
                            : '-'}
                    </Badge>
                    {/* 🧹 취소·방출한 시각 (전수표 #65) — 안전취소는 배차망 취소 횟수에 들어가 «언제»가 필요하다 */}
                    {route.terminatedAt && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded font-bold mr-1 text-danger border-danger/40 bg-danger/10">
                            취소 {new Date(route.terminatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </Badge>
                    )}
                    <span className={`${evaluating ? 'text-warning' : 'text-success'} flex-shrink-0 flex items-center font-bold`}>
                        {pLabel}. {getAddressLabel(route.pickup)}{etas?.pickupEta && <span className="text-success/80 ml-0.5 font-normal">({etas.pickupEta})</span>}
                        <DeadlineChip orderId={route.id} stopType="pickup" eta={etas?.pickupEta}
                            deadlineAt={(() => { const r = cargoReports.find(x => x.stopType === 'pickup' && (x.promisedArrivalAt || x.deadlineAt)); return r?.promisedArrivalAt ?? r?.deadlineAt; })()} />
                    </span>
                    <span className="text-text-muted text-[10px] flex-shrink-0 mx-0.5 tracking-tighter">{separatorText}</span>
                    <span className={`${evaluating ? 'text-warning' : 'text-danger'} flex-shrink-0 font-bold`}>
                        {dLabel}. {getAddressLabel(route.dropoff)}{etas?.dropoffEta && <span className="text-danger/80 ml-0.5 font-normal">({etas.dropoffEta})</span>}
                        <DeadlineChip orderId={route.id} stopType="dropoff" eta={etas?.dropoffEta}
                            deadlineAt={(() => { const r = cargoReports.find(x => x.stopType === 'dropoff' && (x.promisedArrivalAt || x.deadlineAt)); return r?.promisedArrivalAt ?? r?.deadlineAt; })()} />
                    </span>
                    <span className="ml-3 font-medium text-[10px] truncate mt-0.5 flex items-center gap-1 flex-[2]">
                        <span>{route.fare > 0 ? `${(route.fare / 10000).toFixed(1)}만` : '금액미상'}</span>
                        <span className="text-text-muted">,</span>
                        <span>{evaluating ? '계산중' : route.distanceKm ? `${route.distanceKm}Km` : '거리미상'}</span>
                        <span className="text-text-muted">,</span>
                        <span>{route.vehicleType?.substring(0, 1) || '차'}</span>
                    </span>
                </div>

                {evaluating && (
                    <Badge className={`text-[10px] font-black px-1.5 py-0 animate-pulse flex-shrink-0 ml-2 rounded ${route.status === 'ORDER_PRE_SECURED' ? 'bg-danger/20 text-danger hover:bg-danger/20' : 'bg-warning/20 text-warning hover:bg-warning/20'}`}>평가중</Badge>
                )}
                {/* 👀 **미리보기 콜** — 기사님이 확정을 누르기 전에 판정만 받아 보는 콜.
                    아직 안 잡은 콜이므로 "이건 아직 내 것이 아니다"가 한눈에 보여야 한다.
                    확정을 누르면 앱이 딱지 없이 다시 보내므로 이 배지가 사라진다. */}
                {route.isPreview && !isTerminal(route.status) && (
                    <Badge variant="outline" className="text-[10px] font-black px-1.5 py-0 bg-warning/10 border-warning/30 text-warning flex-shrink-0 ml-2 shadow-sm rounded">👀 아직 안 잡음</Badge>
                )}
                {/* 🐥 **가상 체험 모드 콜** — 실서버에 안 잡고 가상으로 합짐 테스트 중인 콜 */}
                {route.isSimulated && !isTerminal(route.status) && (
                    <Badge variant="outline" className="text-[10px] font-black px-1.5 py-0 bg-amber-400/15 border-amber-400/40 text-amber-400 flex-shrink-0 ml-2 shadow-sm rounded flex items-center gap-1">
                        <span>🐥 체험 운행 중</span>
                        {onDecision && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDecision(route.id, 'SAFE_CANCEL');
                                }}
                                className="ml-1 text-[10px] text-danger hover:underline font-bold"
                                title="가상 체험 콜 종료"
                            >
                                [종료]
                            </button>
                        )}
                    </Badge>
                )}
                {/* 🧭 어떻게 잡았나(capturedVia) — 알람 듣고 잡은 콜과 손으로 잡은 콜을 가른다.
                    둘 다 matchType 은 MANUAL 이라 이 배지가 유일한 구분이다 (6하원칙의 «어떻게»). */}
                {/* type 은 확정 전 «MANUAL_CLICK» → 승격 후 «MANUAL» 로 갈린다 — 둘 다 직접 갈래다.
                    === 'MANUAL' 만 보면 확정 직후(동기화 전)의 카드에서 배지가 빠진다 (0830 실측). */}
                {!evaluating && isManualLineage(route.type) && route.status !== 'ORDER_COMPLETED' && (
                    <Badge variant="outline" className="text-[10px] font-black px-1.5 py-0 bg-info/10 border-info/30 text-info flex-shrink-0 ml-2 shadow-sm rounded">
                        {route.capturedVia === 'ALARM' ? '🔔 알람콜' : '직접콜'}
                    </Badge>
                )}
                {/* [Phase 8.3] 확정과 종료 사이의 진행 단계를 배지로 드러낸다.
                    예전에는 확정/완료 두 상태뿐이라 "지금 상차했나 아직인가"를 화면에서 알 수 없었다. */}
                {route.status === 'ORDER_PICKED_UP' && (
                    <Badge variant="outline" className="text-[10px] font-black px-1.5 py-0 bg-info/10 border-info/30 text-info flex-shrink-0 ml-2 shadow-sm rounded">📦 상차 완료</Badge>
                )}
                {route.status === 'ORDER_DELIVERED' && (
                    <Badge variant="outline" className="text-[10px] font-black px-1.5 py-0 bg-success/10 border-success/30 text-success flex-shrink-0 ml-2 shadow-sm rounded">🏁 하차 완료</Badge>
                )}
                {route.status === 'ORDER_COMPLETED' && (
                    <Badge variant="outline" className="text-[10px] font-black px-1.5 py-0 bg-text-muted/10 border-text-muted/30 text-text-muted flex-shrink-0 ml-2 shadow-sm rounded">운행 완료</Badge>
                )}
                {['ORDER_RELEASED_BY_ME'].includes(route.status || '') && (
                    <Badge variant="outline" className="text-[10px] font-black px-1.5 py-0 bg-warning/10 border-warning/30 text-warning flex-shrink-0 ml-2 shadow-sm rounded">방출됨</Badge>
                )}
                {['SAFE_CANCEL'].includes(route.status || '') && (
                    <Badge variant="outline" className="text-[10px] font-black px-1.5 py-0 bg-danger/10 border-danger/30 text-danger flex-shrink-0 ml-2 shadow-sm rounded">거절됨</Badge>
                )}
                {['ORDER_RELEASED_BY_OFFICE'].includes(route.status || '') && (
                    <Badge variant="outline" className="text-[10px] font-black px-1.5 py-0 bg-danger/10 border-danger/30 text-danger flex-shrink-0 ml-2 shadow-sm rounded">사무실 취소</Badge>
                )}
            </div>
            )}

            {/* 2. 카드 콘텐츠 */}
            {isExpanded && (
                /**
                 * 📏 **무대에서는 본문이 스크롤한다** (기사님 2026-09-05 · 재서 잡았다).
                 *
                 * 🔴 카드가 «판만큼» 서는데 본문이 내용대로 자라면, 카드의 `overflow-hidden` 이
                 *    **잘라 감춘다** — 실측에서 카드 291px 에 내용 723px 이었다 (규칙 ④ 위반).
                 * 🟢 잘라 감추지 않고 **여기서 스크롤**한다 — 목업의 «자리가 모자라면 판이
                 *    스크롤한다»와 같은 성질이다. 콜 줄(헤더)은 밖에 있어 계속 보인다.
                 */
                /**
                 * 📏 **본문은 «위 덩어리 + 스텝» 둘로 선다** (기사님 정리 2026-09-05).
                 *
                 * 기사님: *"상단은 콜의 내용을, 하단은 콜의 스텝을 이야기하는 영역이다.
                 * 합짐을 많이 해서 콜 내용만 보이는 경우 **콜 컨텐츠 전체에 스크롤**이 적용되고,
                 * 그렇지 않고 스텝 영역까지 보이면 **스텝만 스크롤**되는 구조야."*
                 *
                 * 🔴 그래서 **본문은 스크롤하지 않는다** — 스크롤은 둘 중 하나에서만 난다:
                 *      · 자리가 모자라면 **판**(아코디언의 펼친 칸)이 스크롤
                 *      · 자리가 있으면 스텝이 `flex-1` 로 서고 **장 안에서** 스크롤
                 *    본문에 스크롤을 걸면 **두 겹**이 되어 막대가 둘 보인다 (기사님 캡처 0905).
                 */
                <div className={`px-4 pb-4 pt-2 text-sm border-t border-border bg-surface ${
                    isDeck ? 'flex-1 min-h-0 flex flex-col overflow-y-auto' : ''}`}>

                    {/* 🕐 **안 A — 펼치면 원래 값과 지금 값을 둘 다 적는다** (기사님 확정 2026-08-30)
                        접힌 줄(덱)은 «틀어졌나»만 기호로 답하고(안 C), 몇 시였는지는 여기서 답한다.
                        통화의 대사가 이 줄에서 나온다 — *"원래 3시 15분이라 했는데 20분쯤 되겠습니다."* */}
                    {/**
                      * 🔴 **상차·하차 줄을 지웠다** (기사님 2026-09-05:
                      *    *"타이틀하고 중복인 것 같은데 이걸 지우고 타이틀에 다 표현할 수 있지?"*).
                      *
                      *    콜 줄이 이미 «① 초월읍 ~23:23 → ③ 신둔면 ~00:38» 을 다 그린다.
                      *    여기에만 있던 것은 **옛 시각(취소선)과 차이** 둘뿐이었는데:
                      *      · 옛 시각은 **지나간 값**이다 — 지금 몇 시인지만 알면 된다
                      *      · 차이는 **색**이 말한다 (밀리면 노랑·당겨지면 초록)
                      *    몇 분인지는 심사 중이면 심사석 위 한 줄이 이미 말한다 (규칙 ③).
                      */}

                    {/* 👀 **미리보기 콜에는 결재 버튼을 띄우지 않는다** (기사님 확정 2026-08-22).
                        아직 배차망에서 안 잡은 콜이라 여기서 KEEP 을 눌러도 잡히지 않는다 —
                        결재는 **인성 앱의 확정 버튼**으로 한다. 관제웹은 판정 색만 보여준다.
                        (MANUAL 콜에 버튼을 안 띄우는 것과 같은 이유의 연장이다) */}
                    {/* 🔴 type 은 확정 전 «MANUAL_CLICK» — !== 'MANUAL' 로 거르면 직접·알람 콜의
                        평가 순간에 결재 버튼이 잠깐 그려진다 (0831 실측 «킵 버튼 잔상»).
                        결정은 스캔앱에서만 — 직접 갈래(MANUAL*)에는 버튼 자체를 안 만든다.
                        🪧 다만 **근거는 갈래와 무관하게 보인다** (기사님 0831: "왜 똥콜이고 꿀콜인지
                        여기 있는 정보를 최대한 보여줘야 한다") — 버퍼·조건 전수가 버튼 블록 안에
                        갇혀 있어 직접·알람 콜은 근거를 통째로 못 보던 것을 가른다. */}
                    {(evaluating || route.isPreview) && (
                        <>
                            {/* 🐥 가상 체험 모드(isSimulated)에서는 픽커 미리보기 콜이어도 관제탑에서 결재 버튼을 활성화한다 */}
                            {(!route.isPreview || route.isSimulated) && (!isManualLineage(route.type) || route.isSimulated) && onDecision && (
                            <div className="mt-1 flex gap-3">
                                <Button 
                                    variant="destructive"
                                    disabled={processingId === route.id} 
                                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); logRoadmapEvent("웹", "PinnedRoute에서 CANCEL(취소) 또는 X 버튼 클릭"); logRoadmapEvent("웹", "서버에게 decision=CANCEL 하달 정보 전달"); setProcessingId(route.id); onDecision(route.id, 'SAFE_CANCEL'); }} 
                                    className={`flex-1 h-auto py-2.5 flex-col items-center justify-center overflow-hidden px-1 ${processingId === route.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <span className="text-base font-black tracking-tight">{processingId === route.id ? '처리 중...' : '거절 (취소)'}</span>
                                    {!processingId && route.rejectionReasons && route.rejectionReasons.length > 0 && (
                                        <span className="text-[10px] font-medium opacity-90 mt-0.5 tracking-tight leading-snug break-all line-clamp-2">
                                            ❌ {route.rejectionReasons.join(', ')}
                                        </span>
                                    )}
                                </Button>
                                {!!route.kakaoTimeExt ? (() => {
                                    /**
                                     * 판정을 **색으로** 읽는다. 기사님은 30초 안에 결정해야 하므로
                                     * 글자를 읽기 전에 색이 먼저 말해 줘야 한다. (2026-08-13 기사님 확정)
                                     *
                                     *   🔵 파랑   꿀콜        잡아라
                                     *   🟢 초록   보통        —
                                     *   🟡 노랑   똥콜        별로다
                                     *   🔴 빨강   연산 실패    **잡지 마라**
                                     *
                                     * 🔴 실패가 빨강인 이유: 예전에는 회색(무해해 보임)이었다.
                                     *    나쁜 걸 아는 것보다 **아무것도 모르는 게 더 위험하다** —
                                     *    경로도 요율도 못 구한 콜은 판단 근거 자체가 없다.
                                     */
                                    /**
                                     * 🎨 **색은 값에서 온다 — 문장을 뒤지지 않는다** (2026-08-29 · 4단계).
                                     *    예전엔 여기서 `kakaoTimeExt` 에 `'꿀'` 이 들어 있나 찾아 색을 정했다.
                                     *    문구를 다듬으면 색이 조용히 바뀌던 자리다. 판정은 `lib/verdict.ts` 하나가 한다.
                                     */
                                    const v = verdictOf(route);
                                    const btnBg = BUTTON_BG[v.color ?? '없음'];
                                    const btnTitle = v.title;
                                    const verdict = v.reason;

                                    /**
                                     * ⚠️ 예전 정규식은 `[...꿀똥콜추천최단거리시간]` 처럼 **낱글자 집합**이라
                                     *    문장 어디에 있든 그 글자를 지웠다. 그래서
                                     *    `총 추가시간(+116분) 초과` → `총 가(+116분) 초과` 로 뭉개졌다.
                                     *    지울 것은 판정 표식뿐이므로 **낱말 단위**로 제거한다.
                                     */
                                    const cleanReason = route.kakaoTimeExt
                                        .replace(/'(꿀|똥|콜|보통|사고)'/g, '')
                                        .replace(/\[(추천|최단거리|최단시간)\]/g, '')
                                        .replace(/[🚙💩🍯]/g, '')
                                        .replace(/\s{2,}/g, ' ')
                                        .trim() || '연산 완료';

                                    return (
                                        <Button 
                                            disabled={processingId === route.id} 
                                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); logRoadmapEvent("웹", `PinnedRoute에서 KEEP(${btnTitle}) 버튼 클릭`); logRoadmapEvent("웹", "서버에게 decision=KEEP 하달 정보 전달"); setProcessingId(route.id); onDecision(route.id, 'ORDER_CONFIRMED'); }} 
                                            className={`flex-[2] h-auto py-2.5 text-white flex-col items-center justify-center transition-all ${btnBg} ${processingId === route.id ? 'opacity-50 cursor-not-allowed' : ''} overflow-hidden px-1`}
                                        >
                                            {/* 판정을 먼저 — 색과 같은 말을 글로도 한 번 더 */}
                                            <span className="text-[13px] font-black tracking-tight leading-tight">{verdict}</span>
                                            {/* 근거는 두 줄까지. 한 줄로 자르면 `총 추가시간(+116분) 초과` 의
                                                핵심 숫자가 잘려 30초 안에 판단할 수 없다 */}
                                            <span className="text-[10px] font-medium opacity-95 mt-0.5 tracking-tight leading-snug break-keep line-clamp-2">{cleanReason}</span>
                                            {route.approvalReasons && route.approvalReasons.length > 0 && (
                                                <span className="text-[10px] font-medium opacity-90 mt-0.5 tracking-tight leading-snug break-keep line-clamp-2">
                                                    ✅ {route.approvalReasons.join(', ')}
                                                </span>
                                            )}
                                        </Button>
                                    );
                                })() : (
                                    <Button disabled variant="outline" className="flex-[2] h-auto py-4 text-text-muted text-sm font-black border-dashed cursor-not-allowed">
                                        좌표 분석 중...
                                    </Button>
                                )}
                            </div>
                            )}

                            {/* 🪧 직접·알람 콜의 판정 안내판 — KEEP 버튼이 하던 말(색·판정·근거)을
                                누를 수 없는 판으로 그대로 한다. 결정은 스캔앱에서, 근거는 여기서 (기사님 0831) */}
                            {!route.isSimulated && (route.isPreview || isManualLineage(route.type)) && (() => {
                                const v = verdictOf(route);
                                if (!v.color) return null;
                                const cleanReason = (route.kakaoTimeExt ?? '')
                                    .replace(/'(꿀|똥|콜|보통|사고)'/g, '')
                                    .replace(/\[(추천|최단거리|최단시간)\]/g, '')
                                    .replace(/[🚙💩🍯]/g, '')
                                    .replace(/\s{2,}/g, ' ')
                                    .trim();
                                return (
                                    <div className={`mt-1 rounded-md py-2.5 px-3 text-white flex flex-col items-center ${BUTTON_BG[v.color]}`}>
                                        <span className="text-[13px] font-black tracking-tight leading-tight">{v.reason}</span>
                                        {cleanReason && <span className="text-[10px] font-medium opacity-95 mt-0.5 tracking-tight leading-snug break-keep line-clamp-2">{cleanReason}</span>}
                                        {route.approvalReasons && route.approvalReasons.length > 0 && (
                                            <span className="text-[10px] font-medium opacity-90 mt-0.5 tracking-tight leading-snug break-keep line-clamp-2">
                                                ✅ {route.approvalReasons.join(', ')}
                                            </span>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* 🧮 **심사 카드에도 상차버퍼** (⑯-1) — "잡을 때 여유 있구나" 하고 잡았다가
                                잡고 나니 0분이던 함정 제거. 잡기 전후 **같은 파생**(추정 약속 − 도착 예상)이라
                                같은 숫자가 나온다. 통화 전이니 항상 ~ 다. */}
                            {(() => {
                                // 🎛️ 심사 버퍼도 판정 기준 탭 값으로 — 잡기 전후 같은 파생
                                const t = deriveCallTiming(route, [], [], Date.now(), jdRules, jdUnk);
                                if (!t.pickupPromisedArrivalAt || t.toPickup.driveMinutes == null) return null;
                                const etaMs = Date.now() + (t.toPickup.driveMinutes + t.toPickup.leadMinutes) * 60_000;
                                const buf = Math.round((Date.parse(t.pickupPromisedArrivalAt) - etaMs) / 60_000);
                                return (
                                    <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                                        <span className="text-text-muted font-bold">버퍼</span>
                                        <span className={`px-1.5 py-0.5 rounded font-bold tabular-nums ${
                                            buf >= 30 ? 'bg-success/15 text-success'
                                            : buf >= 10 ? 'bg-info/15 text-info'
                                            : buf >= 0 ? 'bg-warning/15 text-warning'
                                            : 'bg-danger/15 text-danger'
                                        }`}>상차버퍼 {buf >= 0 ? '+' : ''}{buf}분~</span>
                                        <span className="text-[10px] text-text-muted">
                                            {buf > 0 ? '잡으면 이만큼 이 자리에서 더 기다릴 수 있습니다'
                                                     : '잡으면 바로 출발 — 통화로 미루지 않으면 여유가 없습니다'}
                                        </span>
                                    </div>
                                );
                            })()}

                            {/* 🎨 **조건 전수** (판정색 확정안 v2 ④) — 기사님: "모든 조건이 표시되었으면
                                좋겠다." 문지기·축·딱지를 접지 않고 전부 편다. 딱지는 판단 없이 사실만 */}
                            {route.judgment && (
                                <div className="mt-2 flex flex-col gap-1 text-[11px] rounded-md border border-border bg-surface-alt/30 px-2.5 py-2">
                                    {route.judgment.gates.map(g => (
                                        <div key={g.key} className={g.pass ? 'text-text-muted' : 'text-danger font-bold'}>
                                            {g.pass ? '✅' : '🔴'} {g.name}{!g.pass && g.why ? ` — ${g.why}` : ''}
                                        </div>
                                    ))}
                                    {route.judgment.axes.map(a => (
                                        <div key={a.key} className="text-text-primary tabular-nums">
                                            <span className="font-bold">{a.name}</span> {a.raw}
                                            <span className="text-text-muted"> ({a.score}점{a.weight !== 1 ? ` ×${a.weight}` : ''})</span>
                                        </div>
                                    ))}
                                    {route.judgment.tags.length > 0 && (
                                        <div className="text-text-muted break-keep">
                                            {route.judgment.tags.map(t => `🏷️ ${t}`).join('  ')}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 텔레메트리 진행 상태 바 (그 배차망의 안전취소 시간 만기) — 자동콜의 안전취소 홀드 표시라 직접 갈래엔 안 건다 */}
                            {!route.isPreview && !isManualLineage(route.type) && cancelSec != null
                                && (route.status === 'ORDER_SECURED_EVALUATING' || route.status === 'ORDER_AWAITING_DECISION') && (() => {
                                const isDanger = telemetryCount >= cancelSec - 5;
                                const isWarning = telemetryCount >= cancelSec - 10 && telemetryCount < cancelSec - 5;
                                const barColor = isDanger ? 'bg-danger/20' : isWarning ? 'bg-warning/20' : 'bg-success/20';
                                const dotColor = isDanger ? 'bg-danger' : isWarning ? 'bg-warning' : 'bg-success';
                                const emptyDot = isDanger ? 'bg-danger/40' : isWarning ? 'bg-warning/40' : 'bg-success/40';
                                const textColor = isDanger ? 'text-danger' : isWarning ? 'text-warning' : 'text-success';

                                return (
                                    <div className="mt-3 bg-surface-alt/30 rounded-md p-1 border border-border relative overflow-hidden">
                                        <div
                                            className={`absolute left-0 top-0 bottom-0 ${barColor} transition-all duration-1000 ease-linear`}
                                            style={{ width: `${Math.min((telemetryCount / cancelSec) * 100, 100)}%` }}
                                        ></div>
                                        <div className="flex items-center justify-between relative z-10 px-1 text-xs">
                                            <div className="flex items-center gap-2.5 font-medium">
                                                <span className={`relative flex h-2.5 w-2.5`}>
                                                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isPinging ? dotColor : emptyDot}`}></span>
                                                    <span className={`relative inline-flex rounded-full h-full w-full ${isPinging ? dotColor : emptyDot}`}></span>
                                                </span>
                                                폰에서 데이터 수집 및 홀드 중...
                                            </div>
                                            <span className={`font-black tracking-tight tabular-nums ${textColor}`}>
                                                {Math.min(telemetryCount, cancelSec)}/{cancelSec}초
                                            </span>
                                        </div>
                                    </div>
                                );
                            })()}
                        </>
                    )}


                    {/* 🏗️ 옛 진행 6단계 막대는 철거했다 (기사님 2026-08-21) —
                        아래 단계 화면의 막대가 같은 일(진행 표시·되돌아보기)을 한다 */}

                    {/* ══════════════════════════════════════════════════════════
                        상세 영역 — **읽는 순서 = 화면 순서** (2026-08-11 재배치)

                        시안(`buildCard`)의 조립 순서를 그대로 따른다.
                        기사님이 실제로 하는 일이 이 순서이기 때문이다 —
                        적요를 읽고 → 전화를 걸고 → 다음 단계로 넘어간다.

                          ① 적요 · 착불 경고   ← 통화 전에 읽어야 하는 것
                          ② 지금 할 일         ← 현재 단계의 정거장 하나만 (강조)
                          ③ 건너뛰기 · 퀵사무실 ← ②에 바로 붙는 보조 행동
                          ④ 접힘               ← 단독 경로·요금·마일스톤·판정 근거·원본 덤프

                        🔴 예전에는 ②가 맨 위, ①이 그 아래였고 ④의 내용 절반이
                           본문에 펼쳐져 있었다. 폰에서 세로 16덩이가 되어
                           "한 화면에 들어온다"는 목표가 깨졌다.
                       ══════════════════════════════════════════════════════════ */}
                    {/* 📏 **사슬을 잇는다** — 여기가 auto 면 아래 스텝의 `flex-1` 이 기댈 곳이
                        없어 **내용대로 609px 까지 자란다**(실측 0905). 그러면 본문이 넘쳐
                        «콜 컨텐츠 전체»가 스크롤된다 — 기사님이 «스텝만 스크롤»이라 하신 것과 다르다. */}
                    <div className={`flex flex-col gap-2 text-[13px] leading-tight mt-3 ${
                        isDeck ? 'flex-1 min-h-0' : ''}`}>
                        {(() => {
                            /* 🏗️ pDetail/dDetail/phonesOf 는 새 단계 화면이 자기 자리에서 꺼낸다 */

                            const quickName = route.companyName || '';
                            const quickPhone = quickName.match(/\d{2,3}-\d{3,4}-\d{4}/)?.[0] || route.dispatcherPhone || '';
                            const quickClean = quickName.replace(quickPhone, '').trim() || route.dispatcherName || '퀵사무실';

                            /**
                             * 📦 **짐은 적요에서 뺐다** (기사님 2026-09-05 — 목업에서 칩으로 세우셨다).
                             *    예전에는 `품목 / 적요` 를 한 문장으로 이어 붙여, **무엇을 싣는지가
                             *    긴 문장 안에 묻혔다.**
                             * 🔴 이것은 **배차망이 말한 품목**이지 적재 계산의 근거가 아니다 —
                             *    그것은 통화·신고로 채워지는 `CargoReport` 이고, 헤더의 `📦 90/100`
                             *    이 그 결과다. **신고가 오면 그것이 이긴다.**
                             */
                            const memoText = route.detailMemo;
                            const isCod = route.paymentType === '착불';

                            return (
                                <>

                                    {/* 착불 경고 — 놓치면 현금을 못 받는다 */}
                                    {isCod && (
                                        <div className="flex items-center gap-2 bg-warning/12 border border-warning/40 rounded-md px-2 py-2">
                                            <span>💵</span>
                                            <span className="text-[12px] font-bold text-warning">
                                                착불 — 하차 시 <b>{route.fare?.toLocaleString()}원</b> 직접 수령
                                            </span>
                                        </div>
                                    )}

                                    {/* ── [Phase 8.5 · A안] 지금 할 일 하나만 ──
                                        여섯 단계를 동시에 펼치면 폰 한 화면에 안 들어간다.
                                        현재 단계의 정거장만 띄우고 나머지는 위 진행 점으로 압축한다. */}
                                    {/* 🔴 **결재 전에는 단계 시트를 열지 않는다** (기사님 확정 2026-08-18).
                                        통화 기록은 `orders(id)` 를 참조하는데(FK), 콜 행은 **KEEP 을 눌러야**
                                        처음 만들어진다 — 심사 중인 콜은 서버 메모리에만 있다. 그래서 결재 전에
                                        저장하면 `FOREIGN KEY constraint failed` 로 **통화 내용이 통째로 날아갔다**
                                        (2026-08-18 17:17 실측). 6단계는 확정된 콜의 일이므로 그때부터 연다. */}
                                    {evaluating && (
                                        <div className="text-[12px] text-text-muted bg-surface-alt/50 border border-border border-dashed rounded-md px-2 py-2">
                                            결재 전입니다 — KEEP 을 누르면 통화 단계가 열립니다
                                        </div>
                                    )}
                                    {/* 🏗️ **옛 통화·현장 시트는 철거했다** (기사님 2026-08-21).
                                        아래 단계 화면(StepSheetMock)이 같은 문(save-cargo-report ·
                                        report-milestone)으로 저장하는 본 화면이 됐다 — 열 때마다
                                        계산하던 옛 시트와 달리 저장된 단계 행만 그린다.
                                        StopCallSheet.tsx 는 2026-08-21 철거 완료 (기사님 확인) — 규칙들은 시딩·StepSheetMock 이 잇는다. */}
                                    {!evaluating && <hr className="border-border-card" />}

                                    {/* 🏢 퀵사무실 — 신고와 실제가 다를 때 여기로 건다. 한 줄만 남긴다 */}
                                    {quickPhone && (
                                        <a href={telHref(quickPhone)} onClick={e => { e.stopPropagation(); e.preventDefault(); callNow(quickPhone); }}
                                           className="text-[11px] text-info font-bold underline underline-offset-2 px-0.5">
                                            🏢 {quickClean} {quickPhone}
                                        </a>
                                    )}

                                    {/* ── 단계 화면 — 지금 할 일 하나 + 진행 막대 (본 화면 · 2026-08-21 승격) ──
                                        기사님: *"콜을 잡는 순간 모든 상세값이 임시로 정해지는 거지."*
                                        저장된 단계 행만 그린다 — 화면에는 계산이 없다 (규칙 ③).
                                        🔴 KEEP 뒤에만 보인다 — 그 전에는 `orders` 에 행이 없어 FK 가 걸린다. */}
                                    {!isEvaluating(route.status) && (
                                    /* 📏 이 상자는 «위 덩어리 + 스텝»을 함께 담는다 —
                                       **최소 높이는 스텝 것**이라 여기 두면 위 덩어리가 그 몫을 먹는다 */
                                    <div onClick={e => e.stopPropagation()}
                                         className={isDeck ? 'flex-1 min-h-0 flex flex-col' : ''}>
                                        {/* 💰 **예산 줄** (기사님 모델 2026-08-20) — `여유 = 약속 − 지금 예상`.
                                            약속은 통화로만 굳고, 합짐이 붙으면 예상만 민다. 그래서 이 뺄셈이
                                            곧 **"합짐에 쓸 수 있는 시간"**이다. 우회가 이 안에 들어와야 잡는 콜.
                                            ~ 는 아직 통화 전(추정 약속)이라는 표시다. 지나간 정거장은 안 센다 */}
                                        {(() => {
                                            if (!seededSteps) return null;
                                            const budget = (stopType: 'pickup' | 'dropoff') => {
                                                const st = seededSteps.find(x => x.step === (stopType === 'pickup' ? 'CALL_PICKUP' : 'CALL_DROPOFF'));
                                                const promised = st?.row?.promised_arrival_at;
                                                const tl = timeline?.find(e => e.orderId === route.id && e.stopType === stopType);
                                                if (!promised || !tl || tl.etaMs == null || tl.arrived) return null;
                                                return {
                                                    min: Math.round((Date.parse(promised) - tl.etaMs) / 60_000),
                                                    firm: st.born !== false && st.row.status !== 'PLANNED',
                                                };
                                            };
                                            const chips = (['pickup', 'dropoff'] as const)
                                                .map(k => ({ k, b: budget(k) }))
                                                .filter(x => x.b != null) as Array<{ k: 'pickup' | 'dropoff'; b: { min: number; firm: boolean } }>;
                                            if (!chips.length) return null;
                                            return (
                                                <div className="flex items-center gap-1.5 flex-wrap text-[11px] mb-1">
                                                    {/**
                                                      * 📦 **짐과 버퍼는 한 줄이다** (목업 이식 2026-09-05).
                                                      *    둘 다 «이 콜이 어떤 콜인가»의 답이라 눈이 한 번에 훑는다.
                                                      * 🔴 짐이 없으면 안 그린다 — 적요에서 짜내지 않는다 (규칙 ④).
                                                      */}
                                                    {route.itemDescription && (
                                                        <span className="px-2 py-0.5 rounded-md border font-black
                                                                         bg-surface-alt/60 border-border-card text-text-primary">
                                                            📦 {route.itemDescription}
                                                        </span>
                                                    )}
                                                    <span className="text-text-muted font-bold">버퍼</span>
                                                    {chips.map(({ k, b }) => (
                                                        <span key={k} className={`px-1.5 py-0.5 rounded font-bold tabular-nums ${
                                                            b.min >= 30 ? 'bg-success/15 text-success'
                                                            : b.min >= 10 ? 'bg-info/15 text-info'
                                                            : b.min >= 0 ? 'bg-warning/15 text-warning'
                                                            : 'bg-danger/15 text-danger'
                                                        }`}>
                                                            {k === 'pickup' ? '상차버퍼' : '경유버퍼'} {b.min >= 0 ? '+' : ''}{b.min}분{b.firm ? '' : '~'}
                                                        </span>
                                                    ))}
                                                    <span className="text-[10px] text-text-muted">{chips.some(c => !c.b.firm) ? '~는 통화 전 추정' : ''}</span>
                                                    {/* 🧮 경로 최소 버퍼 (⑯-1) — 이 콜의 칩이 +60 이어도 **다른 콜 약속**이
                                                        +6 이면 예산은 6분이다 (기사님 실측 2026-08-20). 내 칩보다 빡빡할 때만 적는다 */}
                                                    {(() => {
                                                        const mb = timeline ? minRouteBuffer(timeline) : null;
                                                        if (!mb || mb.orderId === route.id) return null;
                                                        if (chips.length && !chips.some(c => mb.minutes < c.b.min)) return null;
                                                        return (
                                                            <span className={`px-1.5 py-0.5 rounded font-bold tabular-nums text-[10px] ${
                                                                mb.minutes >= 0 ? 'bg-surface-hover text-text-muted' : 'bg-danger/15 text-danger'
                                                            }`}>
                                                                경로 최소 {mb.minutes >= 0 ? '+' : ''}{mb.minutes}분{mb.firm ? '' : '~'} (다른 콜 약속)
                                                            </span>
                                                        );
                                                    })()}
                                                    {/* ⏱️ 데드라인 — 콜마다 자동으로 서는 배달 상한. 통화로 합의하면 미뤄진다 (용어집) */}
                                                    {(() => {
                                                        const dl = seededSteps.find(x => x.step === 'CALL_DROPOFF')?.row?.deadline_at;
                                                        return dl ? (
                                                            <span className="px-1.5 py-0.5 rounded bg-surface-hover text-text-muted font-bold tabular-nums text-[10px]">
                                                                데드라인 {new Date(dl).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                                            </span>
                                                        ) : null;
                                                    })()}
                                                </div>
                                            );
                                        })()}
                                        {/**
                                          * 📄 **적요는 맨 아래다** (목업 이식 2026-09-05).
                                          *    위의 한 줄(번호·차종·수수료·판정·요금)과 칩 줄(짐·버퍼)이 «어떤 콜인가»를
                                          *    답하고 나면, 그다음이 **읽을 문장**이다. 통화 전에 읽는 유일한 텍스트다.
                                          */}
                                    {/* ── 적요 — 통화 전에 읽어야 하는 유일한 텍스트 ──
                                        🔴 '지금 할 일' **아래**에 있었다 (2026-08-11).
                                        적요를 읽고 전화를 거는 순서인데 화면은 반대였다.
                                        시안(`buildCard`)도 적요를 지금 할 일 위에 뒀다. */}
                                    {/* 배경 박스를 뺐다 — 한 줄이면 라벨만으로 충분히 구분된다 (UI 영역 아끼기) */}
                                    <div className="flex gap-1.5 items-baseline">
                                        <span className="shrink-0 text-[11px] font-bold text-text-muted">적요 :</span>
                                        <span className="font-bold leading-snug break-keep text-[12px]">
                                            {memoText || <span className="text-text-muted font-normal">상세 정보 없음 (파싱 대기 중)</span>}
                                        </span>
                                    </div>
                                    {/* 🧭 상·하차 줄 — 구간·밀림 (이식 A1). 부품 주석에 «왜 되살아났나» 가 있다 */}
                                    <StopDetailBlock route={route} timeline={timeline}
                                        visitOrder={visitOrder} timing={timing} etas={etas} />
                                    {/**
                                      * 🔼 **셋을 위 덩어리로 올렸다** (기사님 2026-09-05).
                                      *
                                      * 🔴 예전에는 **스텝 아래**에 있었다. 카드는 «위 덩어리 + 스텝» 둘로
                                      *    서야 하는데 셋이 되니 길어졌고, 스텝이 자리를 못 받아
                                      *    **스크롤 막대가 두 개**로 보였다.
                                      * 🟢 여기(적요 아래)는 **위 덩어리 안**이다 — 콜을 설명하는 값들끼리 모인다.
                                      *    자리가 모자라면 위 덩어리가 스크롤하고, 스텝은 자기 몫(220px)을 지킨다.
                                      */}
                                    {/* 🚚 **배송 주행과 하차 마감 — 접지 않는다** (B단계 · 기사님 확정 2026-09-01)
                                        하차 마감은 `상차 완료 + 배송 주행 × 150%` 라 **이 줄이 곧 마감의 근거**다.
                                        기사님이 «독촉 전화가 오면 카카오를 근거로 대응»하시는 값이므로 판정 근거
                                        서랍에 넣지 않는다. 실측인지 어림인지를 함께 적는다 (규칙 ⑤-2 — 일반값을
                                        쓰되 «미확인»을 화면이 말해야 한다. 표시 없이 값만 쓰면 위반이다). */}
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold mb-2 px-0.5">
                                        <span className="text-text-muted">🚚 배송 주행</span>
                                        {timing.soloMinutes != null ? (
                                            <>
                                                <span className="tabular-nums">{timing.soloMinutes}분
                                                    {timing.soloKm != null ? ` · ${Number(timing.soloKm).toFixed(1)}km` : ''}</span>
                                                <span className={timing.soloEstimated ? 'text-warning' : 'text-success'}>
                                                    {timing.soloEstimated ? '(추정)' : '(실측)'}
                                                </span>
                                            </>
                                        ) : (
                                            /* 지어내지 않는다 — 모르면 모른다고 적는다 (규칙 ④) */
                                            <span className="text-text-muted">아직 못 쟀습니다</span>
                                        )}
                                        {timing.dropoffDeadlineAt && (
                                            <>
                                                <span className="text-text-muted">·</span>
                                                <span className="text-text-muted">하차 마감</span>
                                                <span className="text-danger tabular-nums">
                                                    {new Date(timing.dropoffDeadlineAt).toLocaleTimeString('ko-KR',
                                                        { hour: '2-digit', minute: '2-digit', hour12: false })}
                                                </span>
                                            </>
                                        )}
                                    </div>

                                    {/* ── 접힘 — 문제가 생겼을 때만 ──
                                        🔴 단독 경로·요금·수수료 한 줄이 카드 본문에 떠 있었다 (2026-08-11).
                                        덱 헤더가 이미 같은 값을 띄우므로 중복이고, 세로만 잡아먹었다.
                                        판단에 참고하는 값이지 **지금 할 일**이 아니라 여기로 내린다. */}
                                    <details className="group" onClick={e => e.stopPropagation()}>
                                        <summary className="cursor-pointer list-none text-[11px] font-bold text-text-muted py-1 select-none">
                                            <span className="group-open:hidden">▸ 판정 근거 · 원본 데이터</span>
                                            <span className="hidden group-open:inline">▾ 판정 근거 · 원본 데이터</span>
                                        </summary>

                                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted px-0.5 mt-1 mb-2">
                                            <span>단독 {soloKm ? `${Number(soloKm).toFixed(1)}km / ${soloMin || 0}분` : '연산 중'}</span>
                                            <span>·</span>
                                            <span>{route.fare?.toLocaleString()}원{route.paymentType ? `(${route.paymentType})` : ''}</span>
                                            {route.commissionRate && <><span>·</span><span>수수료 {route.commissionRate}</span></>}
                                            {route.scheduleText && <><span>·</span><span className="text-warning font-bold">🕒 {route.scheduleText}</span></>}
                                        </div>

                                        {/* 마일스톤 이력 — 진행 점이 이미 "어디까지 왔나"를 보여주므로
                                            **실제 시각과 예상 오차**가 궁금할 때만 편다 */}
                                        {milestoneLog.length > 0 && (
                                            <div className="mb-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-text-muted">
                                                {milestoneLog.map(m => (
                                                    <span key={m.milestone}>
                                                        {MILESTONE_LABEL[m.milestone as keyof typeof MILESTONE_LABEL]} {m.occurredAt?.slice(11, 16)}
                                                        {(() => {
                                                            const err = timingError(m.predictedAt, m.occurredAt);
                                                            if (err === null) return null;
                                                            return <b className={err > 5 ? 'text-danger ml-1' : 'text-success ml-1'}>
                                                                {err > 0 ? `+${err}분` : err < 0 ? `${err}분` : '정시'}
                                                            </b>;
                                                        })()}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {(route.approvalReasons?.length || route.rejectionReasons?.length) ? (
                                            <div className="flex flex-col gap-1 mb-2 mt-1">
                                                {route.approvalReasons?.map((r, i) => (
                                                    <div key={`a${i}`} className="text-[11px] text-success">👍 {r}</div>
                                                ))}
                                                {route.rejectionReasons?.map((r, i) => (
                                                    <div key={`r${i}`} className="text-[11px] text-danger">💩 {r}</div>
                                                ))}
                                            </div>
                                        ) : null}

                                        <div className="max-h-56 overflow-y-auto pr-1 flex flex-col gap-1 select-text font-mono">
                                            {Object.entries({
                                                id: route.id, type: route.type, status: route.status,
                                                receiptStatus: route.receiptStatus, itemDescription: route.itemDescription,
                                                vehicleType: route.vehicleType, commissionRate: route.commissionRate,
                                                tollFare: route.tollFare, paymentType: route.paymentType,
                                                billingType: route.billingType, tripType: route.tripType,
                                                orderForm: route.orderForm, distanceKm: route.distanceKm,
                                                dispatcherName: route.dispatcherName, dispatcherPhone: route.dispatcherPhone,
                                                companyName: route.companyName, pickup: route.pickup, dropoff: route.dropoff,
                                                fare: route.fare, timestamp: route.timestamp, postTime: route.postTime,
                                                scheduleText: route.scheduleText, pickupTime: route.pickupTime,
                                                detailMemo: route.detailMemo,
                                                approachDurationMin: route.approachDurationMin,
                                                kakaoSoloDistanceKm: route.kakaoSoloDistanceKm,
                                                kakaoSoloDurationMin: route.kakaoSoloDurationMin,
                                                // 🚚 실측이 없으면 배송거리로 추정한다 — 그 입력을 함께 보여 준다
                                                deliveryDistance: route.deliveryDistance,
                                            }).map(([k, v]) => (
                                                <div key={k} className="flex bg-surface-alt/40 p-1 rounded text-[10px]">
                                                    <span className="w-[120px] flex-shrink-0 text-text-muted font-bold select-all">route.{k} :</span>
                                                    <span className="text-text-muted truncate flex-1">{v?.toString() || '-'}</span>
                                                </div>
                                            ))}
                                            <div className="flex flex-col bg-surface-alt/40 p-1 rounded text-[10px]">
                                                <span className="text-text-muted font-bold mb-1 select-all">route.pickupDetails :</span>
                                                <span className="text-text-muted break-all whitespace-pre-wrap leading-snug">{JSON.stringify(route.pickupDetails, null, 2) || '-'}</span>
                                            </div>
                                            <div className="flex flex-col bg-surface-alt/40 p-1 rounded text-[10px]">
                                                <span className="text-text-muted font-bold mb-1 select-all">route.dropoffDetails :</span>
                                                <span className="text-text-muted break-all whitespace-pre-wrap leading-snug">{JSON.stringify(route.dropoffDetails, null, 2) || '-'}</span>
                                            </div>
                                        </div>
                                    </details>
                    {/* [Phase 8.5] 방출 · 사무실 취소는 **접어 둔다**.
                        기사님: "특수한 상황에 클릭해야 할 듯."
                        주 버튼(도착·완료)과 같은 자리에 두면 잘못 눌러 콜을 잃는다.
                        ⚠️ decision 은 서버에서 멱등이 아니므로 누른 즉시 잠근다 —
                           processingId 는 1초 동기화마다 풀려 방어가 되지 않는다. */}
                    {(route.status === 'ORDER_CONFIRMED' || route.status === 'ORDER_PICKED_UP') && onDecision && (
                        <details className="mt-3 group" onClick={(e) => e.stopPropagation()}>
                            <summary className="list-none cursor-pointer text-[11px] font-bold text-text-muted py-1.5 select-none">
                                <span className="group-open:hidden">⋯ 이 콜 처리 (방출 · 사무실 취소)</span>
                                <span className="hidden group-open:inline">× 닫기</span>
                            </summary>
                            <div className="flex gap-2 pt-1">
                                <Button
                                    variant="outline"
                                    disabled={locked}
                                    onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        setLocked(true); setProcessingId(route.id);
                                        onDecision?.(route.id, 'ORDER_RELEASED_BY_ME');
                                    }}
                                    className="flex-1 py-3 text-sm font-bold bg-warning/10 hover:bg-warning/20 text-warning border-warning/30"
                                >
                                    🙋‍♂️ 배차 방출
                                </Button>
                                <Button
                                    variant="destructive"
                                    disabled={locked}
                                    onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        setLocked(true); setProcessingId(route.id);
                                        onDecision?.(route.id, 'ORDER_RELEASED_BY_OFFICE');
                                    }}
                                    className="flex-1 py-3 text-sm font-bold shadow-sm"
                                >
                                    🏢 사무실 취소
                                </Button>
                            </div>
                            <div className="text-[10px] text-text-muted mt-1.5">
                                되돌릴 수 없습니다. 방출은 그 장소에 사유가 기록됩니다.
                            </div>
                        </details>
                    )}
                                        {/* 📏 사슬 — 여기가 auto 면 아래 트랙이 내용대로 자란다 (0905) */}
                                        {/* 📏 **여기가 스텝 영역이다** — 남는 자리를 먹되 **220px 은 지킨다**
                                            (목업). 자리가 모자라면 위 덩어리가 스크롤하고, 스텝은 제 몫을 지킨다 */}
                                        <div className={`mt-1 mb-2 ${isDeck ? 'flex-1 min-h-[220px] flex flex-col' : ''}`}>
                                            {/* KEEP 이 만든다 (기사님 2026-08-20) — 여기는 보기만. 이 기능 전에 잡은 콜은 행이 없다 */}
                                            {!seededSteps && (
                                                <div className="text-[10px] text-text-muted">아직 없습니다 — KEEP 하면 만들어집니다</div>
                                            )}
                                            {/* 🌱 **네비게이션 모양** (기사님 2026-08-21: *"새로 영역이 길어지면 스크롤 해야
                                                하니 처음 UI 가 더 좋다"*) — 아코디언을 접고, 기존 카드와 **같은 문법**으로:
                                                진행 막대(누르면 그 단계) + 시트는 **한 번에 하나**. 시퀀스가 데려간다. */}
                                            {seededSteps && (() => {
                                                /* 🔴 위에서 만든 값을 그대로 쓴다 — 두 벌이면 로그와 화면이 다른 말을 한다 (규칙 ③) */
                                                const shownIdx = shownStepIdx;
                                                const sv = seededSteps[shownIdx];
                                                if (!sv) return null;
                                                const r = sv.row || {};
                                                const born = sv.born !== false;
                                                const statusLabel = !born ? '예정'
                                                    : r.status === 'DONE' ? '함'
                                                    : r.status === 'SKIPPED' ? '건너뜀' : '진행';
                                                const allDone = seededSteps.every(stepDone);
                                                /* 짐 칸이 없는 단계는 가장 신선한 짐(실측 > 상차 통화)을 빌려 입는다 — 표시용 */
                                                const viewOf = (x: any) => {
                                                    if (x.step !== 'DELIVERED' && x.step !== 'CALL_DROPOFF') return x;
                                                    const loaded = seededSteps.find(y => y.step === 'LOADED')?.row;
                                                    const callP = seededSteps.find(y => y.step === 'CALL_PICKUP')?.row;
                                                    const callD = seededSteps.find(y => y.step === 'CALL_DROPOFF')?.row;
                                                    const cargo = {
                                                        planned_unit: loaded?.actual_unit ?? callP?.planned_unit,
                                                        planned_quantity: loaded?.actual_quantity ?? callP?.planned_quantity,
                                                    };
                                                    const base = x.step === 'DELIVERED' ? { ...(callD ?? {}), ...cargo } : cargo;
                                                    return { ...x, row: { ...base, ...x.row,
                                                        planned_unit: x.row.planned_unit ?? cargo.planned_unit,
                                                        planned_quantity: x.row.planned_quantity ?? cargo.planned_quantity } };
                                                };
                                                return (
                                                    <div className={`mt-1 ${isDeck ? 'flex-1 min-h-0 flex flex-col' : ''}`}
                                                         onClick={e => e.stopPropagation()}>
                                                        {/**
                                                          * 🌱 **머리 — 단계명 · 가운데 점 · n/6** (목업 이식 0905).
                                                          * 🔴 **점은 가운데 고정** (기사님 2026-09-04: *"단어에 따라
                                                          *    스와이프 네비게이션이 덜컹거려"*). 단계 이름 길이가 달라
                                                          *    («상차지 통화» ↔ «상차 완료») 점이 좌우로 밀렸다 —
                                                          *    양옆을 `1fr` 로 같게 잡으면 제자리다.
                                                          * 🔴 «몇 번째»를 **숫자로도** 적는다 — 점만으로는 세어야 한다.
                                                          */}
                                                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 py-1">
                                                            <span className="text-[12.5px] font-black text-text-primary truncate">{sv.label}</span>
                                                            <span className="flex gap-1 justify-self-center">
                                                                {seededSteps.map((x, i) => (
                                                                    <button key={x.step} type="button" title={x.label} aria-label={x.label}
                                                                        onClick={() => { navByRef.current = '손으로 넘긴 것'; setStepNav(i === stepCurIdx ? null : i); }}
                                                                        className={`w-4 h-1.5 rounded-full transition-colors ${
                                                                            i === shownIdx ? 'bg-info'
                                                                            : x.row?.status === 'SKIPPED' ? 'bg-warning/70'
                                                                            : stepDone(x) ? 'bg-success'
                                                                            : i < stepCurIdx ? 'bg-warning/40'   /* 지나쳤는데 안 함 — 빠뜨림이 보인다 */
                                                                            : 'bg-surface-hover'
                                                                        }`} />
                                                                ))}
                                                            </span>
                                                            <span className="justify-self-end text-[11px] text-text-muted tabular-nums">
                                                                {shownIdx + 1}/{seededSteps.length}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-[11px] pb-1">
                                                            <span className={`px-1 rounded text-[10px] ${
                                                                !born ? 'bg-surface-hover text-text-muted'
                                                                : r.status === 'DONE' ? 'bg-success/15 text-success'
                                                                : r.status === 'SKIPPED' ? 'bg-warning/15 text-warning'
                                                                : 'bg-info/15 text-info'
                                                            }`}>{statusLabel}</span>
                                                            {r.occurred_at && (
                                                                <span className="text-[10px] text-text-muted tabular-nums">
                                                                    {new Date(r.occurred_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                                                </span>
                                                            )}
                                                            {stepNav !== null && stepNav !== stepCurIdx && (
                                                                <button type="button" onClick={() => { navByRef.current = '되돌린 것'; setStepNav(null); }}
                                                                    className="text-text-muted underline underline-offset-2 text-[10px]">
                                                                    되돌아보는 중 · 현재 단계로</button>
                                                            )}
                                                            {allDone && <span className="text-success text-[10px] font-bold">운행 완료 · 6단계를 모두 마쳤습니다</span>}
                                                        </div>
                                                        {/**
                                                          * 🌱 **가로 트랙 — 한 장씩 넘긴다.**
                                                          * ⚠️ 08-21 확정(«한 번에 하나»)은 그대로다 — 손짓만 늘었다.
                                                          */}
                                                        <StepSwipeTrack
                                                            count={seededSteps.length}
                                                            shownIdx={shownIdx}
                                                            onShow={k => { navByRef.current = '손으로 넘긴 것'; setStepNav(k === stepCurIdx ? null : k); }}
                                                            renderPane={(k) => {
                                                                const x = seededSteps[k];
                                                                /* 헤더·문장 재료 — 행에 없는 값(장소·전화·구간 주행)은 경로·타임라인이 준다 */
                                                                const xPickup = x.step === 'CALL_PICKUP' || x.step === 'ARRIVE_PICKUP' || x.step === 'LOADED';
                                                                const dd = xPickup ? route.pickupDetails?.[0] : route.dropoffDetails?.[0];
                                                                const xTl = timeline?.find(e => e.orderId === route.id
                                                                    && e.stopType === (xPickup ? 'pickup' : 'dropoff'));
                                                                const callPRow = seededSteps.find(y => y.step === 'CALL_PICKUP')?.row;
                                                                const xr = x.row || {};
                                                                const xBorn = x.born !== false;
                                                                return (
                                                                    <section key={x.step} aria-label={x.label}
                                                                        className="shrink-0 w-full min-w-0 snap-center overflow-y-auto pr-0.5">
                                                                        <h3 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-black text-text-primary">
                                                                            {k + 1}. {x.label}
                                                                            <em className={`not-italic px-1.5 py-0.5 rounded-[5px] text-[10px] font-black border ${
                                                                                !xBorn ? 'border-border-card text-text-muted'
                                                                                : xr.status === 'DONE' ? 'bg-success/12 border-success/40 text-success'
                                                                                : xr.status === 'SKIPPED' ? 'bg-warning/12 border-warning/40 text-warning'
                                                                                : k === stepCurIdx ? 'bg-info/15 border-info/50 text-info'
                                                                                : 'border-border-card text-text-muted'
                                                                            }`}>
                                                                                {!xBorn ? '아직'
                                                                                    : xr.status === 'DONE' ? '마쳤습니다'
                                                                                    : xr.status === 'SKIPPED' ? '건너뜀'
                                                                                    : k === stepCurIdx ? '지금 할 것' : '아직'}
                                                                            </em>
                                                                        </h3>
                                                                        <StepSheetMock key={`${route.id}:${x.step}`} orderId={route.id}
                                                                            codAmount={route.paymentType === '착불' ? route.fare : null}
                                                                            place={{
                                                                                name: dd?.contactName || dd?.customerName || undefined,
                                                                                address: dd?.addressDetail || (xPickup ? route.pickup : route.dropoff),
                                                                                phone: [dd?.phone1, dd?.phone2].find(v => !!v && v !== '*') || undefined,
                                                                            }}
                                                                            prevName={route.pickupDetails?.[0]?.contactName || route.pickupDetails?.[0]?.customerName}
                                                                            leadMinutes={callPRow?.planned_dwell_min ?? null}
                                                                            departPrevMs={xTl?.departPrevMs ?? null}
                                                                            segmentDriveMinutes={xTl?.segmentDriveMinutes ?? null}
                                                                            view={viewOf(x)} />
                                                                    </section>
                                                                );
                                                            }} />
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                    )}

                                </>
                            );
                        })()}
                    </div>

                </div>
            )}
        </div>
    );
}

/**
 * 약속 시각 칩 — 헤더에서 바로 보고, 바로 고친다.
 *
 * 기사님: *"여기에 상차시간, 하차시간을 추가하고 시간을 변경해 보여줄 수 있을까?"*
 *
 * 헤더에는 원래 **예상 도착(ETA)** 만 있었다. 그런데 정작 중요한 건
 * **"약속한 시각까지 갈 수 있나"** 다. 둘을 나란히 두면 한눈에 판단된다.
 *   `(21:43 → 22시)`  ETA 21:43, 약속 22시 → 여유 있음 (초록)
 *   `(21:43 → 21시)`  약속보다 늦게 도착 → 지각 (빨강)
 *
 * 시각만 바꾸는 **좁은 경로**(`set-stop-deadline`)를 쓴다.
 * 전체 저장(`save-cargo-report`)으로 하면 넘기지 않은 짐 정보가 전부 날아간다.
 */
/**
 * 🧭 **펼친 카드의 상·하차 줄 — 타이틀이 못 하는 말만 한다**
 *    (이식 A1 · 기사님 2026-09-11: *"목업에서 열리면 보이는 컨텐츠 상하차 부분은
 *    가지고 가서 기존 거에 더하고 싶어"*).
 *
 * 🔴 **2026-09-05 에 철거한 `PromiseLines` 와 다른 것이다.** 그때 지운 이유는
 *    *"타이틀과 중복"* 이었고 **그때는 옳았다** — 그 줄엔 약속·차이뿐이라 타이틀이 다 말했다.
 *    이 줄은 **타이틀에 없는 둘**을 든다:
 *      · **구간 거리·분** — 그 정거장으로 들어오는 구간 (내 위치→상차 · 상차→하차)
 *      · **밀린 분** — 접힌 줄은 `▲▼` **기호로만** 말한다 (안 C). 몇 분인지는 여기에만 있다
 *    `timeDisplay.test.ts` 가 그 둘을 «자격»으로 묻는다 — 자격 없이 되살리면 빨간불이다.
 *
 * ⚠️ **원인별 내역**(`└ 합짐2 경유 +7분`)은 아직 없다 — 실물에 `impactOfStop` 이 없다.
 *    지도 실험실에는 있고, `shared` 로 올리는 것이 이식 A3 다.
 */
function StopDetailBlock({ route, timeline, visitOrder, timing, etas }: {
    route: SecuredOrder;
    timeline?: RouteTimelineEntry[];
    visitOrder?: { pickupIdx: number; dropoffIdx: number };
    timing: CallTiming;
    /** 🕐 타임라인이 없을 때의 도착 예정 — 타이틀이 쓰는 그 값(`etaMap` · 장부 폴백) */
    etas: { pickupEta?: string; dropoffEta?: string };
}) {
    const rows = ([
        { kind: '상차' as const, stopType: 'pickup' as const, seq: visitOrder?.pickupIdx,
            name: getAddressLabel(route.pickup), legKm: timing.approachKm, fallbackMin: timing.approachMinutes,
            arrived: timing.arrivedPickup, promised: timing.pickupPromisedArrivalAt, eta: etas.pickupEta },
        { kind: '하차' as const, stopType: 'dropoff' as const, seq: visitOrder?.dropoffIdx,
            name: getAddressLabel(route.dropoff), legKm: timing.soloKm, fallbackMin: timing.soloMinutes,
            arrived: timing.arrivedDropoff, promised: timing.dropoffPromisedArrivalAt, eta: etas.dropoffEta },
    ]);
    /** 약속 시각(ISO 문자열) → `05:08`. 없으면 `--:--` (지어내지 않는다) */
    const clockOf = (v: string | null | undefined) =>
        v == null ? '--:--' : new Date(v).toTimeString().slice(0, 5);

    return (
        <div className="flex flex-col gap-0.5 text-[11px] tabular-nums mb-2 px-0.5">
            {rows.map(r => {
                const tl = timeline?.find(e => e.orderId === route.id && e.stopType === r.stopType);
                /** 🚚 구간 — 타임라인의 «앞 정거장 → 여기» 가 있으면 그것, 없으면 콜이 저장한 값 */
                const legMin = tl?.segmentDriveMinutes ?? r.fallbackMin;
                /** ⏱️ 앞 정거장 실측이 여기를 민 분 — 0 이면 안 적는다 (규칙 ④: 없는 것은 안 적는다) */
                const shiftMin = tl?.dwellShiftMinutes ?? 0;
                const late = tl?.lateMinutes ?? 0;
                /**
                 * 🔴 **약속은 타이틀과 «같은 원천»에서 온다** (규칙 ③ · 화면 실측 2026-09-11).
                 *    처음엔 `deriveCallTiming` 만 봤더니 타이틀은 `05:27`, 이 줄은 `05:08` 로
                 *    **한 화면이 두 말을 했다.** 타이틀(`CallDeck.promiseOf`)이 그러듯
                 *    **타임라인의 약속을 먼저** 보고, 없을 때만 콜 파생을 쓴다.
                 */
                const promised = tl?.promisedUntil ?? r.promised;
                /**
                 * 🔴 **지난 곳에 «예정»은 없다** — 통과했으면 빈칸이 맞다 (0909 규칙).
                 *    아직이면 타임라인의 예정을, 그것도 없으면 **타이틀이 쓰는 그 값**을 쓴다
                 *    (`etaMap` → 장부 폴백). 둘이 다른 값을 말하면 화면이 두 말을 한다 (규칙 ③).
                 */
                const real = r.arrived ? null
                    : tl?.etaMs != null ? new Date(tl.etaMs).toTimeString().slice(0, 5)
                        : r.eta ?? null;
                return (
                    <div key={r.stopType} className="flex flex-col">
                        <div className="flex justify-between gap-1 font-bold">
                            <span className="min-w-0 truncate">
                                {r.seq ?? '?'} {r.kind} · {r.name}
                                <span className="font-normal text-text-muted">
                                    {' '}{r.legKm != null ? `${Number(r.legKm).toFixed(1)}km` : '--km'}
                                    ·{legMin != null ? `${legMin}분` : '--분'}
                                </span>
                            </span>
                            <span className="shrink-0">
                                <span className={tl?.promiseConfirmed ? 'text-accent-alt' : 'text-text-muted'}>
                                    {clockOf(promised)}
                                </span>
                                <span className="text-text-muted"> → </span>
                                <b className={late > 0 ? 'text-warning' : 'text-success'}>{real ?? '--:--'}</b>
                                {r.arrived && <span className="text-success text-[9.5px]"> 통과</span>}
                                {late > 0 && <b className="text-warning"> ⚠️{late}분</b>}
                            </span>
                        </div>
                        {shiftMin !== 0 && (
                            <div className="pl-2 flex justify-between gap-1 text-[10px] text-text-muted">
                                <span>└ 앞 정거장이 예측과 달라</span>
                                <span className={shiftMin > 0 ? 'text-warning' : 'text-success'}>
                                    {shiftMin > 0 ? `+${shiftMin}분 밀림` : `${shiftMin}분 당겨짐`}
                                </span>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function DeadlineChip({ orderId, stopType, eta, deadlineAt }: {
    orderId: string; stopType: 'pickup' | 'dropoff'; eta?: string; deadlineAt?: string;
}) {
    const [open, setOpen] = useState(false);
    const late = (() => {
        if (!eta || !deadlineAt) return false;
        const d = new Date(deadlineAt);
        const [h, m] = eta.split(':').map(Number);
        const etaMs = new Date(d); etaMs.setHours(h, m, 0, 0);
        return etaMs.getTime() > d.getTime();
    })();

    const label = deadlineAt
        ? `${new Date(deadlineAt).getHours()}시`
        : '약속?';

    return (
        <span className="relative inline-flex" onClick={e => e.stopPropagation()}>
            <button onClick={() => setOpen(v => !v)}
                className={`ml-0.5 px-1 rounded text-[10px] font-bold border ${
                    !deadlineAt ? 'border-dashed border-border text-text-muted/70'
                    : late ? 'border-danger/50 bg-danger/15 text-danger'
                    : 'border-success/40 bg-success/12 text-success'
                }`}>
                {late ? '⚠️ ' : ''}{label}
            </button>
            {open && (
                <span className="absolute z-20 top-6 left-0 flex gap-1 bg-surface-alt border border-border rounded-md p-1 shadow-lg">
                    {buildArrivalSlots(Date.now(), 0, 6).map(sl => (
                        <button key={sl.iso}
                            onClick={() => { socket.emit('set-stop-deadline', { orderId, stopType, deadlineAt: sl.iso }); setOpen(false); }}
                            className="px-1.5 py-1 rounded text-[11px] font-bold text-text-primary hover:bg-info hover:text-white">
                            {sl.label}
                        </button>
                    ))}
                    <button onClick={() => { socket.emit('set-stop-deadline', { orderId, stopType, deadlineAt: null }); setOpen(false); }}
                        className="px-1.5 py-1 rounded text-[11px] font-bold text-text-muted hover:bg-danger hover:text-white">
                        해제
                    </button>
                </span>
            )}
        </span>
    );
}
