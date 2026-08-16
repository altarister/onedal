import { useState, useEffect } from 'react';
import { isEvaluating, isTerminal } from "@onedal/shared";
import type { SecuredOrder } from "@onedal/shared";
import { socket } from "../../lib/socket";
import { getAddressLabel, getMinuteDiff , telHref } from "../../lib/routeUtils";
import { logRoadmapEvent } from '../../lib/roadmapLogger';


import { Badge } from "../ui/badge";
import StopCallSheet from './StopCallSheet';
import type { CallRecords } from "../../hooks/useCallProgress";
import { MILESTONE_LABEL, timingError, buildArrivalSlots, deriveCallStep, canRewindTo, CALL_STEPS,
         deriveCallTiming } from "@onedal/shared";
import { Button } from "../ui/button";

interface Props {
    route: SecuredOrder;
    isExpanded: boolean;
    onToggle: (id: string) => void;
    onDecision?: (id: string, action: 'ORDER_CONFIRMED' | 'ORDER_CANCELED' | 'ORDER_RELEASED' | 'ORDER_FORCE_CANCELED') => void;
    processingId: string | null;
    setProcessingId: (id: string | null) => void;
    etaMap: Map<string, { pickupEta?: string, dropoffEta?: string }>;
    visitOrderMap: Map<string, { pickupIdx: number, dropoffIdx: number }>;
    indexNum: number;
    /** 이 콜의 서버 기록 (통화·현장 신고 + 마일스톤). 위에서 한 번에 받아 내려준다 */
    records: CallRecords;
    /**
     * `deck` — 진행 중 탭의 스와이프 덱. **폰 한 화면**이 목표라 헤더를 경로 한 줄로 줄인다.
     * `list` — 완료됨·취소/방출·전체. 조회용이라 포착시각·방문순서·ETA 를 그대로 둔다.
     */
    variant?: 'deck' | 'list';
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
    records,
    variant = 'list',
}: Props) {
    const isDeck = variant === 'deck';
    const evaluating = isEvaluating(route.status);
    const etas = etaMap.get(route.id);
    const visitOrder = visitOrderMap.get(route.id);

    // [텔레메트리 스니펫] 카운터 상태 및 애니메이션 트리거
    const [telemetryCount, setTelemetryCount] = useState(0);
    const [isPinging, setIsPinging] = useState(false);

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
    const [skippedTo, setSkippedTo] = useState(0);
    const [viewIndex, setViewIndex] = useState<number | null>(null);
    /**
     * 되돌릴 수 없는 동작(방출·사무실 취소)을 누른 뒤 잠근다.
     * `processingId` 는 PinnedRoute 가 매 렌더 초기화해서(1초 동기화) 방어가 되지 않는다.
     */
    const [locked, setLocked] = useState(false);

    const progress = deriveCallStep(milestoneLog, cargoReports, skippedTo);
    // 되돌아보는 중이면 그 단계를, 아니면 파생된 현재 단계를 보여준다
    const shownIndex = viewIndex ?? progress.index;
    const shownStep = CALL_STEPS[shownIndex] ?? null;

    // 새 기록이 들어와 단계가 앞으로 가면 되돌아보기를 자동 해제한다 —
    // 도착을 눌렀는데 화면이 옛 단계에 머물러 있으면 무엇이 반영됐는지 알 수 없다
    useEffect(() => { setViewIndex(null); }, [progress.index]);
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
    const timing = deriveCallTiming(route, cargoReports, milestoneLog, Date.now());
    const soloKm = timing.soloKm;
    const soloMin = timing.soloMinutes;

    return (
        <div className={`flex flex-col relative overflow-hidden transition-all duration-300 ${evaluating ? 'bg-warning/10' : 'hover:bg-surface-hover/50'} border-b border-border-card ${isTerminal(route.status) ? 'opacity-50 grayscale' : ''}`}>
            {(route.status === 'ORDER_SECURED_EVALUATING' || route.status === 'ORDER_AWAITING_DECISION') && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-warning/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite] pointer-events-none" />
            )}

            {/* 1-a. 덱 헤더 — 폰 한 화면이 목표다.
                리스트 헤더(포착시각·방문순서·ETA·약속칩 2개·구간 분)는 폰에서 한 줄에 안 들어가
                줄바꿈으로 세 줄을 먹었다. 덱에서는 **경로와 돈**만 남기고 나머지는 아래 한 줄로 내린다.
                약속 시각은 '지금 할 일' 안에서 고르므로 헤더에 칩을 둘 이유가 없다. */}
            {isDeck && (
                <div className="px-4 pt-3 pb-1.5 flex flex-col gap-0.5">
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-[15px] font-black text-text-primary tracking-tight truncate">
                            {getAddressLabel(route.pickup)}
                            <span className="text-text-muted font-normal mx-1">→</span>
                            {getAddressLabel(route.dropoff)}
                        </span>
                        <span className="ml-auto text-[15px] font-black tabular-nums shrink-0">
                            {route.fare > 0 ? `${(route.fare / 10000).toFixed(1)}만` : '금액미상'}
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-text-muted tabular-nums">
                        <span>{evaluating ? '계산중' : soloKm ? `${Number(soloKm).toFixed(1)}km` : '거리미상'}</span>
                        <span>·</span>
                        <span>{soloMin ? `${soloMin}분` : '시간미상'}</span>
                        <span>·</span>
                        <span>{route.vehicleType || '차종미상'}</span>
                        {route.commissionRate && <><span>·</span><span>수수료 {route.commissionRate}</span></>}
                        {route.scheduleText && <span className="text-warning font-bold">🕒 {route.scheduleText}</span>}
                        {evaluating && <span className="ml-auto text-warning font-black animate-pulse">평가중</span>}
                    </div>
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
                    <span className={`${evaluating ? 'text-warning' : 'text-success'} flex-shrink-0 flex items-center font-bold`}>
                        {pLabel}. {getAddressLabel(route.pickup)}{etas?.pickupEta && <span className="text-success/80 ml-0.5 font-normal">({etas.pickupEta})</span>}
                        <DeadlineChip orderId={route.id} stopType="pickup" eta={etas?.pickupEta}
                            deadlineAt={cargoReports.find(r => r.stopType === 'pickup' && r.deadlineAt)?.deadlineAt} />
                    </span>
                    <span className="text-text-muted text-[10px] flex-shrink-0 mx-0.5 tracking-tighter">{separatorText}</span>
                    <span className={`${evaluating ? 'text-warning' : 'text-danger'} flex-shrink-0 font-bold`}>
                        {dLabel}. {getAddressLabel(route.dropoff)}{etas?.dropoffEta && <span className="text-danger/80 ml-0.5 font-normal">({etas.dropoffEta})</span>}
                        <DeadlineChip orderId={route.id} stopType="dropoff" eta={etas?.dropoffEta}
                            deadlineAt={cargoReports.find(r => r.stopType === 'dropoff' && r.deadlineAt)?.deadlineAt} />
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
                {!evaluating && route.type === 'MANUAL' && route.status !== 'ORDER_COMPLETED' && (
                    <Badge variant="outline" className="text-[10px] font-black px-1.5 py-0 bg-info/10 border-info/30 text-info flex-shrink-0 ml-2 shadow-sm rounded">수동 배차</Badge>
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
                {['ORDER_RELEASED'].includes(route.status || '') && (
                    <Badge variant="outline" className="text-[10px] font-black px-1.5 py-0 bg-warning/10 border-warning/30 text-warning flex-shrink-0 ml-2 shadow-sm rounded">방출됨</Badge>
                )}
                {['ORDER_CANCELED'].includes(route.status || '') && (
                    <Badge variant="outline" className="text-[10px] font-black px-1.5 py-0 bg-danger/10 border-danger/30 text-danger flex-shrink-0 ml-2 shadow-sm rounded">거절됨</Badge>
                )}
                {['ORDER_FORCE_CANCELED'].includes(route.status || '') && (
                    <Badge variant="outline" className="text-[10px] font-black px-1.5 py-0 bg-danger/10 border-danger/30 text-danger flex-shrink-0 ml-2 shadow-sm rounded">사무실 취소</Badge>
                )}
            </div>
            )}

            {/* 2. 카드 콘텐츠 */}
            {isExpanded && (
                <div className="px-4 pb-4 pt-2 text-sm border-t border-border bg-surface">

                    {route.type !== 'MANUAL' && evaluating && onDecision && (
                        <>
                            <div className="mt-1 flex gap-3">
                                <Button 
                                    variant="destructive"
                                    disabled={processingId === route.id} 
                                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); logRoadmapEvent("웹", "PinnedRoute에서 CANCEL(취소) 또는 X 버튼 클릭"); logRoadmapEvent("웹", "서버에게 decision=CANCEL 하달 정보 전달"); setProcessingId(route.id); onDecision(route.id, 'ORDER_CANCELED'); }} 
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
                                    let btnBg = "bg-success hover:bg-success/80";
                                    let btnTitle = "유지 확정";
                                    let verdict = "";

                                    /**
                                     * ⚠️ 예전 정규식은 `[...꿀똥콜추천최단거리시간]` 처럼 **낱글자 집합**이라
                                     *    문장 어디에 있든 그 글자를 지웠다. 그래서
                                     *    `총 추가시간(+116분) 초과` → `총 가(+116분) 초과` 로 뭉개졌다.
                                     *    지울 것은 판정 표식뿐이므로 **낱말 단위**로 제거한다.
                                     */
                                    const cleanReason = route.kakaoTimeExt
                                        .replace(/'(꿀|똥|콜)'/g, '')
                                        .replace(/\[(추천|최단거리|최단시간)\]/g, '')
                                        .replace(/[🚙💩🍯]/g, '')
                                        .replace(/\s{2,}/g, ' ')
                                        .trim() || '연산 완료';

                                    if (route.kakaoTimeExt.includes("실패") || route.kakaoTimeExt.includes("에러")) {
                                        btnBg = "bg-danger hover:bg-danger/80 shadow-[0_0_15px_var(--theme-glow-warning)]";
                                        btnTitle = "판단 불가";
                                        verdict = "🔴 잡지 마세요 — 경로·요율을 계산하지 못했습니다";
                                    } else if (route.kakaoTimeExt.includes("'꿀'")) {
                                        btnBg = "bg-info hover:bg-info/80 shadow-[0_0_15px_var(--theme-glow-primary)]";
                                        verdict = "🍯 꿀콜";
                                    } else if (route.kakaoTimeExt.includes("'똥'")) {
                                        btnBg = "bg-warning hover:bg-warning/80 shadow-[0_0_15px_var(--theme-glow-warning)]";
                                        verdict = "💩 별로입니다";
                                    } else {
                                        verdict = "보통";
                                    }

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

                            {/* 텔레메트리 진행 상태 바 (30초 만기) */}
                            {(route.status === 'ORDER_SECURED_EVALUATING' || route.status === 'ORDER_AWAITING_DECISION') && (() => {
                                const isDanger = telemetryCount >= 25;
                                const isWarning = telemetryCount >= 20 && telemetryCount < 25;
                                const barColor = isDanger ? 'bg-danger/20' : isWarning ? 'bg-warning/20' : 'bg-success/20';
                                const dotColor = isDanger ? 'bg-danger' : isWarning ? 'bg-warning' : 'bg-success';
                                const emptyDot = isDanger ? 'bg-danger/40' : isWarning ? 'bg-warning/40' : 'bg-success/40';
                                const textColor = isDanger ? 'text-danger' : isWarning ? 'text-warning' : 'text-success';

                                return (
                                    <div className="mt-3 bg-surface-alt/30 rounded-md p-1 border border-border relative overflow-hidden">
                                        <div
                                            className={`absolute left-0 top-0 bottom-0 ${barColor} transition-all duration-1000 ease-linear`}
                                            style={{ width: `${Math.min((telemetryCount / 30) * 100, 100)}%` }}
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
                                                {Math.min(telemetryCount, 30)}/30초
                                            </span>
                                        </div>
                                    </div>
                                );
                            })()}
                        </>
                    )}


                    {/* [Phase 8.5] 진행 6단계 — 점을 눌러 지난 단계로 되돌아간다.
                        끝난 단계만 눌린다. 아직 오지 않은 단계로 건너뛰면 기록이 뒤엉킨다.

                        🔴 이 블록이 카드 **맨 아래**에 있었다 (2026-08-11).
                        시안(`buildCard`)은 헤더 안에 뒀는데 구현에서는 적요·요금·판정 근거를
                        전부 지나야 닿았다. 되돌아가기 수단인데 스크롤해야 보였다. */}
                    <div className="mt-2">
                        <div className="flex items-center gap-1">
                            {CALL_STEPS.map((st, i) => {
                                const passed = i < progress.index;
                                const isNow = i === shownIndex;
                                return (
                                    <button
                                        key={st.id}
                                        type="button"
                                        title={st.label}
                                        disabled={!canRewindTo(progress, i)}
                                        onClick={(e) => { e.stopPropagation(); setViewIndex(i); }}
                                        className="flex-1 pt-1.5 pb-1 disabled:cursor-default"
                                    >
                                        <span className={`block h-1 rounded-full ${
                                            isNow ? 'bg-info'
                                            : progress.done[i] ? 'bg-success'
                                            : passed ? 'bg-success/35'
                                            : st.optional ? 'bg-transparent ring-1 ring-inset ring-border'
                                            : 'bg-surface-hover'
                                        }`} />
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-bold">
                            {progress.allDone
                                ? <span className="text-success">운행 완료 · 6단계를 모두 마쳤습니다</span>
                                : <span className="text-info">{shownStep?.label} 차례</span>}
                            {viewIndex !== null && !progress.allDone && (
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setViewIndex(null); }}
                                    className="text-text-muted underline underline-offset-2"
                                >되돌아보는 중 · 현재 단계로</button>
                            )}
                        </div>
                    </div>

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
                    <div className="flex flex-col gap-2 text-[13px] leading-tight mt-3">
                        {(() => {
                            const pDetail = route.pickupDetails?.[0];
                            const dDetail = route.dropoffDetails?.[0];
                            const phonesOf = (d?: typeof pDetail) =>
                                [d?.phone1, d?.phone2].filter((v): v is string => !!v && v !== '*');

                            const quickName = route.companyName || '';
                            const quickPhone = quickName.match(/\d{2,3}-\d{3,4}-\d{4}/)?.[0] || route.dispatcherPhone || '';
                            const quickClean = quickName.replace(quickPhone, '').trim() || route.dispatcherName || '퀵사무실';

                            const itemAndMemo = [route.itemDescription, route.detailMemo].filter(Boolean).join(' / ');
                            const isCod = route.paymentType === '착불';

                            return (
                                <>
                                    {/* ── 적요 — 통화 전에 읽어야 하는 유일한 텍스트 ──
                                        🔴 '지금 할 일' **아래**에 있었다 (2026-08-11).
                                        적요를 읽고 전화를 거는 순서인데 화면은 반대였다.
                                        시안(`buildCard`)도 적요를 지금 할 일 위에 뒀다. */}
                                    <div className="flex gap-2 bg-surface-alt/40 p-2 rounded-md">
                                        <span className="flex-shrink-0 text-[11px] font-bold text-text-muted pt-0.5">적요</span>
                                        <span className="font-bold leading-snug break-keep text-[12px]">
                                            {itemAndMemo || <span className="text-text-muted font-normal">상세 정보 없음 (파싱 대기 중)</span>}
                                        </span>
                                    </div>

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
                                    {shownStep && (() => {
                                        const isPickupStop = shownStep.stop === 'pickup';
                                        const d = isPickupStop ? pDetail : dDetail;
                                        const lead = isPickupStop ? timing.toPickup : timing.toDropoff;
                                        return (
                                            <StopCallSheet
                                                /* 🔴 **콜 id 를 키에 넣는다** (2026-08-16).
                                                   예전엔 `shownStep.id`(= `CALL_PICKUP` 같은 **단계 이름**)뿐이라
                                                   **콜이 달라도 키가 같았다.** React 가 컴포넌트를 재사용해
                                                   앞 콜의 `deadlineAt`·물량이 다음 콜 화면에 그대로 남았다 —
                                                   실측: 송정동 콜 화면에 계산서필 콜의 `11:08` 이 떠 있었다. */
                                                key={`${route.id}:${shownStep.id}`}
                                                orderId={route.id}
                                                stopType={isPickupStop ? 'pickup' : 'dropoff'}
                                                label={isPickupStop ? '상차지' : '하차지'}
                                                address={d?.addressDetail || (isPickupStop ? route.pickup : route.dropoff)}
                                                contactName={d?.contactName || d?.customerName}
                                                phones={phonesOf(d)}
                                                reports={cargoReports}
                                                memoTexts={[route.itemDescription, route.detailMemo, d?.memo]}
                                                driveMinutes={lead.driveMinutes}
                                                driveKm={lead.driveKm}
                                                /* 상차지 통화에서 하차지까지 한 번에 정할 수 있게 다음 구간을 넘긴다 */
                                                onwardMinutes={isPickupStop ? soloMin : null}
                                                /* 주행을 몰라도 칸을 추천할 수 있게 — 상차 마감은 주행과 무관하다 */
                                                pickupDeadlineAt={timing.pickupDeadlineAt}
                                                onwardKm={isPickupStop ? timing.soloKm : null}
                                                leadMinutes={lead.leadMinutes}
                                                leadLabel={lead.leadLabel}
                                                orderStatus={route.status}
                                                arrivedAt={milestoneLog.find(m =>
                                                    m.milestone === (isPickupStop ? 'ARRIVED_PICKUP' : 'ARRIVED_DROPOFF'))?.occurredAt}
                                                forceOpen={shownStep.id.startsWith('CALL_') ? 'DECLARED' : 'ACTUAL'}
                                                stepLabel={shownStep.label}
                                                codAmount={isCod ? route.fare : null}
                                            />
                                        );
                                    })()}

                                    {/* 통화는 선택이다 — 적요가 충분하거나 상차지에서 이미 들었으면 건너뛴다.
                                        기사님: *"통화 완료와 통화 스킵 이렇게 선택권이 있으면 될 것 같아."*
                                        [통화 완료] 바로 아래에 짝으로 둔다. 막지 않고 고르게만 한다. */}
                                    {shownStep?.optional && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                // 건너뛰기도 **결정**이다 — 서버에 남겨야 새로고침해도 안 되살아난다
                                                socket.emit('save-cargo-report', {
                                                    orderId: route.id,
                                                    stopType: shownStep.stop,
                                                    kind: 'SKIPPED',
                                                    memo: '통화 없이 진행',
                                                });
                                                setSkippedTo(shownIndex + 1);   // 서버 응답 전까지의 낙관적 표시
                                                setViewIndex(null);
                                            }}
                                            className="w-full py-2.5 -mt-1 rounded-lg border border-border border-dashed text-[13px] font-bold text-text-muted"
                                        >
                                            통화 스킵
                                        </button>
                                    )}

                                    {/* 🏢 퀵사무실 — 신고와 실제가 다를 때 여기로 건다. 한 줄만 남긴다 */}
                                    {quickPhone && (
                                        <a href={telHref(quickPhone)} onClick={e => e.stopPropagation()}
                                           className="text-[11px] text-info font-bold underline underline-offset-2 px-0.5">
                                            🏢 {quickClean} {quickPhone}
                                        </a>
                                    )}

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
                                                osrmSoloDistanceKm: route.osrmSoloDistanceKm,
                                                osrmSoloDurationMin: route.osrmSoloDurationMin,
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
                                </>
                            );
                        })()}
                    </div>

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
                                        onDecision(route.id, 'ORDER_RELEASED');
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
                                        onDecision(route.id, 'ORDER_FORCE_CANCELED');
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
