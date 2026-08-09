import { useState, useEffect } from 'react';
import { isEvaluating, isTerminal } from "@onedal/shared";
import type { SecuredOrder } from "@onedal/shared";
import { socket } from "../../lib/socket";
import { getAddressLabel, getMinuteDiff } from "../../lib/routeUtils";
import { logRoadmapEvent } from '../../lib/roadmapLogger';


import { Badge } from "../ui/badge";
import StopCallSheet from './StopCallSheet';
import type { CargoReport } from "@onedal/shared";
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
}

export default function PinnedRouteCard({
    route,
    isExpanded,
    onToggle,
    onDecision,
    processingId,
    setProcessingId,
    etaMap,
    visitOrderMap
}: Props) {
    const evaluating = isEvaluating(route.status);
    const etas = etaMap.get(route.id);
    const visitOrder = visitOrderMap.get(route.id);

    // [텔레메트리 스니펫] 카운터 상태 및 애니메이션 트리거
    const [telemetryCount, setTelemetryCount] = useState(0);
    const [isPinging, setIsPinging] = useState(false);

    // [Phase 8.4] 통화/현장 기록. 아코디언을 **열 때만** 불러온다 —
    // 카드가 여러 장이라 전부 미리 받으면 1초 동기화마다 낭비가 된다.
    const [cargoReports, setCargoReports] = useState<CargoReport[]>([]);
    useEffect(() => {
        if (!isExpanded) return;
        const onSaved = (d: { orderId: string; reports: CargoReport[] }) => {
            if (d.orderId === route.id) setCargoReports(d.reports || []);
        };
        socket.on("cargo-report-saved", onSaved);
        socket.emit("request-cargo-reports", { orderId: route.id });
        return () => { socket.off("cargo-report-saved", onSaved); };
    }, [isExpanded, route.id]);

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

    return (
        <div className={`flex flex-col relative overflow-hidden transition-all duration-300 ${evaluating ? 'bg-warning/10' : 'hover:bg-surface-hover/50'} border-b border-border-card ${isTerminal(route.status) ? 'opacity-50 grayscale' : ''}`}>
            {(route.status === 'ORDER_SECURED_EVALUATING' || route.status === 'ORDER_AWAITING_DECISION') && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-warning/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite] pointer-events-none" />
            )}

            {/* 1. 카드 헤더 구역 */}
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
                    </span>
                    <span className="text-text-muted text-[10px] flex-shrink-0 mx-0.5 tracking-tighter">{separatorText}</span>
                    <span className={`${evaluating ? 'text-warning' : 'text-danger'} flex-shrink-0 font-bold`}>
                        {dLabel}. {getAddressLabel(route.dropoff)}{etas?.dropoffEta && <span className="text-danger/80 ml-0.5 font-normal">({etas.dropoffEta})</span>}
                    </span>
                    <span className="ml-3 font-medium text-[10px] truncate mt-0.5 flex items-center gap-1 flex-[2]">
                        <span>{route.fare > 0 ? `${(route.fare / 10000).toFixed(1)}만` : '금액미상'}</span>
                        <span className="text-text-muted">,</span>
                        <span>{evaluating ? '계산중' : route.distanceKm ? `${route.distanceKm}Km` : '미상'}</span>
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
                                    let btnBg = "bg-success hover:bg-success/80";
                                    let btnTitle = "유지 확정";

                                    const rawRes = route.kakaoTimeExt.replace(/['꿀똥콜🚙💩🍯\[\]추천최단거리시간]/g, "").trim();
                                    const cleanReason = rawRes || '연산 완료';

                                    if (route.kakaoTimeExt.includes("실패") || route.kakaoTimeExt.includes("에러")) {
                                        btnBg = "bg-surface-alt hover:bg-surface-hover";
                                    } else if (route.kakaoTimeExt.includes("'꿀'")) {
                                        btnBg = "bg-info hover:bg-info/80 shadow-[0_0_15px_var(--theme-glow-primary)]";
                                    } else if (route.kakaoTimeExt.includes("'똥'")) {
                                        btnBg = "bg-warning hover:bg-warning/80 shadow-[0_0_15px_var(--theme-glow-warning)]";
                                    }

                                    return (
                                        <Button 
                                            disabled={processingId === route.id} 
                                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); logRoadmapEvent("웹", `PinnedRoute에서 KEEP(${btnTitle}) 버튼 클릭`); logRoadmapEvent("웹", "서버에게 decision=KEEP 하달 정보 전달"); setProcessingId(route.id); onDecision(route.id, 'ORDER_CONFIRMED'); }} 
                                            className={`flex-[2] h-auto py-2.5 text-white flex-col items-center justify-center transition-all ${btnBg} ${processingId === route.id ? 'opacity-50 cursor-not-allowed' : ''} overflow-hidden px-1`}
                                        >
                                            <span className="text-[11px] font-medium opacity-100 tracking-tight leading-snug break-all line-clamp-1">{cleanReason}</span>
                                            {route.approvalReasons && route.approvalReasons.length > 0 && (
                                                <span className="text-[10px] font-medium opacity-90 mt-0.5 tracking-tight leading-snug break-all line-clamp-2">
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

                    {/* ══════════════════════════════════════════════════════════
                        상세 영역 — 정보 3단 분리 (Phase 8.4)

                        아코디언이 열리는 순간은 거의 항상 "이 콜에 대해 지금 뭔가 하려는 순간"이고,
                        그건 대개 **전화를 거는 것**이다. 그래서 우선순위를 이렇게 잡는다.

                        1단 (항상 보임) — 지금 행동에 필요한 것
                            · 상차지 / 하차지 카드: 담당자 · 주소 · 전화(탭 한 번) · 통화 기록
                            · 적요/물품  ← 통화 전에 읽어야 하는 유일한 텍스트
                            · 착불이면 경고  ← 놓치면 돈을 못 받는다
                        2단 (한 줄 요약) — 판단에 참고하는 것
                            · 단독 경로 / 요금·수수료 / 퀵사무실
                        3단 (접힘, 기본 숨김) — 문제가 생겼을 때만
                            · 판정 근거(꿀/똥 사유) · 원본 필드 덤프

                        예전에는 30개 필드를 전부 나열해 1·2·3단이 섞여 있었다.
                        전화번호가 디버그 덤프 사이에 파묻혀 있어 걸려면 스크롤해야 했다.
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
                            const soloKm = route.osrmSoloDistanceKm ?? route.kakaoSoloDistanceKm;
                            const soloMin = route.osrmSoloDistanceKm ? route.osrmSoloDurationMin : route.kakaoSoloDurationMin;
                            const isCod = route.paymentType === '착불';

                            return (
                                <>
                                    {/* ── 1단: 정거장 (전화 + 통화 기록) ── */}
                                    <StopCallSheet
                                        orderId={route.id} stopType="pickup" label="상차지"
                                        address={pDetail?.addressDetail || route.pickup}
                                        contactName={pDetail?.contactName || pDetail?.customerName}
                                        phones={phonesOf(pDetail)} reports={cargoReports}
                                        memoTexts={[route.itemDescription, route.detailMemo, pDetail?.memo]}
                                        etaMinutes={route.approachDurationMin ?? 0}
                                        approachMinutes={route.approachDurationMin ?? null}
                                        lineHaulMinutes={route.kakaoSoloDurationMin ?? null}
                                    />
                                    <StopCallSheet
                                        orderId={route.id} stopType="dropoff" label="하차지"
                                        address={dDetail?.addressDetail || route.dropoff}
                                        contactName={dDetail?.contactName || dDetail?.customerName}
                                        phones={phonesOf(dDetail)} reports={cargoReports}
                                        memoTexts={[route.itemDescription, route.detailMemo, dDetail?.memo]}
                                        etaMinutes={route.totalDurationMin || route.kakaoSoloDurationMin || 0}
                                        approachMinutes={route.approachDurationMin ?? null}
                                        lineHaulMinutes={route.kakaoSoloDurationMin ?? null}
                                    />

                                    {/* ── 1단: 적요 — 통화 전에 읽어야 하는 유일한 텍스트 ── */}
                                    <div className="flex gap-2 bg-surface-alt/40 p-2 rounded-md">
                                        <span className="flex-shrink-0 text-[11px] font-bold text-text-muted pt-0.5">적요</span>
                                        <span className="font-bold leading-snug break-keep text-[12px]">
                                            {itemAndMemo || <span className="text-text-muted font-normal">상세 정보 없음 (파싱 대기 중)</span>}
                                        </span>
                                    </div>

                                    {/* ── 1단: 착불 경고 — 현금을 직접 받아야 한다 ── */}
                                    {isCod && (
                                        <div className="flex items-center gap-2 bg-warning/12 border border-warning/40 rounded-md px-2 py-2">
                                            <span>💵</span>
                                            <span className="text-[12px] font-bold text-warning">
                                                착불 — 하차 시 <b>{route.fare?.toLocaleString()}원</b> 직접 수령
                                            </span>
                                        </div>
                                    )}

                                    {/* ── 2단: 한 줄 요약 ── */}
                                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted px-0.5">
                                        <span>단독 {soloKm ? `${Number(soloKm).toFixed(1)}km / ${soloMin || 0}분` : '연산 중'}</span>
                                        <span>·</span>
                                        <span>{route.fare?.toLocaleString()}원{route.paymentType ? `(${route.paymentType})` : ''}</span>
                                        {route.commissionRate && <><span>·</span><span>수수료 {route.commissionRate}</span></>}
                                        {route.scheduleText && <><span>·</span><span className="text-warning font-bold">🕒 {route.scheduleText}</span></>}
                                        {quickPhone && (
                                            <>
                                                <span>·</span>
                                                <a href={`tel:${quickPhone.replace(/[^0-9+]/g, '')}`} onClick={e => e.stopPropagation()}
                                                   className="text-info font-bold underline underline-offset-2">
                                                    🏢 {quickClean}
                                                </a>
                                            </>
                                        )}
                                    </div>

                                    {/* ── 3단: 접힘 ── */}
                                    <details className="group" onClick={e => e.stopPropagation()}>
                                        <summary className="cursor-pointer list-none text-[11px] font-bold text-text-muted py-1 select-none">
                                            <span className="group-open:hidden">▸ 판정 근거 · 원본 데이터</span>
                                            <span className="hidden group-open:inline">▾ 판정 근거 · 원본 데이터</span>
                                        </summary>

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

                    {/* [Phase 8.2] 상차 / 하차 보고
                        확정과 완료 사이의 실제 업무 단계다. 예전에는 '운행 완료' 버튼 하나뿐이라
                        하차해도 서버가 계속 "적재 중"으로 믿었고, 잔여 용량이 회복되지 않아
                        합짐 필터가 좁은 채로 남아 다음 짐을 못 잡았다.
                        인성앱의 [출발지][서명] / [도착지][서명] 에 대응한다. */}
                    {(route.status === 'ORDER_CONFIRMED' || route.status === 'ORDER_PICKED_UP') && (
                        <div className="mt-4 flex gap-3">
                            <Button
                                variant="outline"
                                disabled={processingId === route.id || route.status === 'ORDER_PICKED_UP'}
                                onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    setProcessingId(route.id);
                                    logRoadmapEvent("웹", "상차 보고(PICKED_UP) 전송");
                                    socket.emit("report-milestone", { orderId: route.id, milestone: 'PICKED_UP' });
                                    setTimeout(() => setProcessingId(null), 1000);
                                }}
                                className={`flex-1 py-3 text-sm font-bold border-info/50 ${
                                    route.status === 'ORDER_PICKED_UP'
                                        ? 'bg-info/20 text-info opacity-70'
                                        : 'bg-info/10 text-info hover:bg-info/20'
                                }`}
                            >
                                {route.status === 'ORDER_PICKED_UP' ? '📦 상차 완료됨' : '📦 상차 보고'}
                            </Button>
                            <Button
                                variant="outline"
                                disabled={processingId === route.id}
                                onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    setProcessingId(route.id);
                                    logRoadmapEvent("웹", "하차 보고(DELIVERED) 전송 — 적재 공간 회복");
                                    socket.emit("report-milestone", { orderId: route.id, milestone: 'DELIVERED' });
                                    onToggle(route.id); // 아코디언 닫기
                                    setTimeout(() => setProcessingId(null), 1000);
                                }}
                                className="flex-1 py-3 text-sm font-bold bg-success/10 text-success hover:bg-success/20 border-success/50"
                            >
                                {processingId === route.id ? '처리 중...' : '🏁 하차 보고'}
                            </Button>
                        </div>
                    )}

                    {/* 방출 / 사무실 취소 */}
                    {(route.status === 'ORDER_CONFIRMED' || route.status === 'ORDER_PICKED_UP') && onDecision && (
                        <div className="mt-3 flex gap-3">
                            <div className="flex-1 flex gap-2">
                                <Button
                                    variant="outline"
                                    disabled={processingId === route.id}
                                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); setProcessingId(route.id); onDecision(route.id, 'ORDER_RELEASED'); }}
                                    className="flex-1 py-3 text-sm font-bold bg-warning/10 hover:bg-warning/20 text-warning border-warning/30"
                                >
                                    🙋‍♂️ 배차 방출
                                </Button>
                                <Button
                                    variant="destructive"
                                    disabled={processingId === route.id}
                                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); setProcessingId(route.id); onDecision(route.id, 'ORDER_FORCE_CANCELED'); }}
                                    className="flex-1 py-3 text-sm font-bold shadow-sm"
                                >
                                    🏢 사무실 취소
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
