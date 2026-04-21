import { useState, useEffect } from 'react';
import type { SecuredOrder } from "@onedal/shared";
import { socket } from "../../lib/socket";
import { getAddressLabel, getMinuteDiff } from "../../lib/routeUtils";
import { logRoadmapEvent } from '../../lib/roadmapLogger';

interface Props {
    route: SecuredOrder;
    isExpanded: boolean;
    onToggle: (id: string) => void;
    onDecision?: (id: string, action: 'KEEP' | 'CANCEL') => void;
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
    visitOrderMap,
    indexNum
}: Props) {
    const isEvaluating = route.status.includes('evaluating');
    const etas = etaMap.get(route.id);
    const visitOrder = visitOrderMap.get(route.id);

    // [텔레메트리 스니펫] 카운터 상태 및 애니메이션 트리거
    const [telemetryCount, setTelemetryCount] = useState(0);
    const [isPinging, setIsPinging] = useState(false);

    useEffect(() => {
        // 평가 중이 아닐 때는 카운터 초기화
        if (!route.status.includes('evaluating')) {
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
        <div className={`flex flex-col bg-surface rounded-xl border border-border-card relative overflow-hidden transition-all duration-300 shadow-md ${isEvaluating ? 'ring-1 ring-amber-500/50' : 'hover:border-border-hover'}`}>
            {route.status === 'evaluating_detailed' && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite] pointer-events-none" />
            )}

            {/* 1. 카드 헤더 구역 */}
            <div
                onClick={() => !isEvaluating && onToggle(route.id)}
                className={`px-3 py-3 flex justify-between items-center w-full text-sm tracking-tight ${!isEvaluating ? 'cursor-pointer group hover:bg-text-primary/5' : ''}`}
            >
                <div className="flex items-center gap-1 truncate text-text-primary flex-1">
                    <span className="text-text-muted font-bold mr-1 text-[11px] bg-bg-base px-1.5 py-0.5 rounded border border-border-card">#{indexNum}</span>
                    <span className={`${isEvaluating ? 'text-warning' : 'text-success'} flex-shrink-0 flex items-center`}>
                        {pLabel}. {getAddressLabel(route.pickup)}{etas?.pickupEta && <span className="text-success/80 ml-0.5">({etas.pickupEta})</span>}
                    </span>
                    <span className="text-text-muted text-[10px] flex-shrink-0 mx-0.5 tracking-tighter">{separatorText}</span>
                    <span className={`${isEvaluating ? 'text-warning' : 'text-danger'} flex-shrink-0`}>
                        {dLabel}. {getAddressLabel(route.dropoff)}{etas?.dropoffEta && <span className="text-danger/80 ml-0.5">({etas.dropoffEta})</span>}
                    </span>
                    <span className="ml-3 text-text-primary font-medium text-[10px] truncate mt-0.5 flex items-center gap-1 flex-[2]">
                        <span>{route.fare > 0 ? `${(route.fare / 10000).toFixed(1)}만` : '금액미상'}</span>
                        <span className="text-text-muted">,</span>
                        <span>{route.status.includes('evaluating') ? '계산중' : route.distanceKm ? `${route.distanceKm}Km` : '미상'}</span>
                        <span className="text-text-muted">,</span>
                        <span>{route.vehicleType?.substring(0, 1) || '차'}</span>
                    </span>
                </div>

                {isEvaluating && (
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-sm animate-pulse flex-shrink-0 ml-2 ${route.status === 'evaluating_basic' ? 'bg-danger/20 text-danger' : 'bg-warning/20 text-warning'}`}>평가중</span>
                )}
                {!isEvaluating && route.type === 'MANUAL' && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-sm bg-info/20 border border-info/30 text-info flex-shrink-0 ml-2 shadow-sm">수동 배차</span>
                )}
            </div>

            {/* 2. 카드 콘텐츠 */}
            {isExpanded && (
                <div id="" className="px-2 pb-4 pt-1 text-sm border-t border-border-card bg-surface mt-1">

                    {route.type !== 'MANUAL' && (route.status === 'evaluating_basic' || route.status === 'evaluating_detailed') && onDecision && (
                        <>
                            <div className="mt-1 flex gap-3">
                                <button disabled={processingId === route.id} onClick={(e) => { e.stopPropagation(); logRoadmapEvent("웹", "PinnedRoute에서 CANCEL(취소) 또는 X 버튼 클릭"); logRoadmapEvent("웹", "서버에게 decision=CANCEL 하달 정보 전달"); setProcessingId(route.id); onDecision(route.id, 'CANCEL'); }} className={`flex-1 bg-danger/10 text-danger text-sm font-bold py-2.5 rounded-lg border border-danger/30 transition-all shadow-sm ${processingId === route.id ? 'opacity-50 cursor-not-allowed' : 'hover:bg-danger/20 active:scale-95'} flex flex-col items-center justify-center overflow-hidden px-1`}>
                                    <span className="text-base font-black tracking-tight">{processingId === route.id ? '처리 중...' : '방출'}</span>
                                    {!processingId && route.rejectionReasons && route.rejectionReasons.length > 0 && (
                                        <span className="text-[10px] font-medium opacity-80 mt-0.5 tracking-tight leading-snug break-all line-clamp-2">
                                            ❌ {route.rejectionReasons.join(', ')}
                                        </span>
                                    )}
                                </button>
                                {!!route.kakaoTimeExt ? (() => {
                                    let btnBg = "bg-success";
                                    let btnTitle = "유지 확정";

                                    const rawRes = route.kakaoTimeExt.replace(/['꿀똥콜🚙💩🍯\[\]추천최단거리시간]/g, "").trim();
                                    const cleanReason = rawRes || '연산 완료';

                                    if (route.kakaoTimeExt.includes("실패") || route.kakaoTimeExt.includes("에러")) {
                                        btnBg = "bg-slate-600";
                                        // btnTitle = "분석 실패 (강제 유지)";
                                    } else if (route.kakaoTimeExt.includes("'꿀'")) {
                                        btnBg = "bg-blue-600 shadow-blue-500/40";
                                        // btnTitle = "유지 확정 (꿀콜 🍯)";
                                    } else if (route.kakaoTimeExt.includes("'똥'")) {
                                        btnBg = "bg-orange-600 shadow-orange-500/40";
                                        // btnTitle = "위험 감수 (똥콜 💩)";
                                    } else {
                                        btnBg = "bg-emerald-600 shadow-emerald-500/40";
                                        // btnTitle = "유지 확정 (양호 🚙)";
                                    }

                                    return (
                                        <button disabled={processingId === route.id} onClick={(e) => { e.stopPropagation(); logRoadmapEvent("웹", `PinnedRoute에서 KEEP(${btnTitle}) 버튼 클릭`); logRoadmapEvent("웹", "서버에게 decision=KEEP 하달 정보 전달"); setProcessingId(route.id); onDecision(route.id, 'KEEP'); }} className={`flex-[2] ${btnBg} text-white flex flex-col items-center justify-center py-2.5 rounded-lg transition-all ${processingId === route.id ? 'opacity-50 cursor-not-allowed' : 'shadow-lg hover:brightness-110 active:scale-95'} overflow-hidden px-1`}>
                                            {/* <span className="text-base font-black tracking-tight">{processingId === route.id ? '통신 중...' : btnTitle}</span> */}
                                            <span className="text-[11px] font-medium opacity-90 mt-0.5 tracking-tight leading-snug break-all line-clamp-1">{cleanReason}</span>
                                            {route.approvalReasons && route.approvalReasons.length > 0 && (
                                                <span className="text-[10px] font-medium opacity-80 mt-0.5 tracking-tight leading-snug break-all line-clamp-2">
                                                    ✅ {route.approvalReasons.join(', ')}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })() : (
                                    <button disabled className="flex-[2] bg-surface text-text-muted text-base font-black py-4 rounded-lg border border-border-card cursor-not-allowed">
                                        좌표 분석 중...
                                    </button>
                                )}
                            </div>

                            {/* 텔레메트리 진행 상태 바 (30초 만기) */}
                            {route.status === 'evaluating_detailed' && (() => {
                                const isDanger = telemetryCount >= 25;
                                const isWarning = telemetryCount >= 20 && telemetryCount < 25;
                                const barColor = isDanger ? 'bg-danger/20' : isWarning ? 'bg-warning/20' : 'bg-success/20';
                                const dotColor = isDanger ? 'bg-danger' : isWarning ? 'bg-warning' : 'bg-success';
                                const emptyDot = isDanger ? 'bg-danger/40' : isWarning ? 'bg-warning/40' : 'bg-success/40';
                                const textColor = isDanger ? 'text-danger' : isWarning ? 'text-warning' : 'text-success';

                                return (
                                    <div className="mt-2 bg-bg-base/50 rounded-md p-1 border border-border-card shadow-sm relative overflow-hidden">
                                        <div
                                            className={`absolute left-0 top-0 bottom-0 ${barColor} transition-all duration-1000 ease-linear`}
                                            style={{ width: `${Math.min((telemetryCount / 30) * 100, 100)}%` }}
                                        ></div>
                                        <div className="flex items-center justify-between relative z-10 px-1 text-xs">
                                            <div className="flex items-center gap-2.5 font-medium text-text-primary">
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

                    {/* 상세 데이터 영역 */}
                    <div className="flex flex-col text-text-primary text-[13px] leading-tight bg-bg-base/50 py-2 px-1 mt-3 font-medium tracking-tight">
                        {(() => {
                            const itemAndMemo = [route.itemDescription, route.detailMemo].filter(Boolean).join(" / ");
                            const detailMemo = itemAndMemo || "상세 정보 없음 (파싱 대기 중)";

                            const quickName = route.companyName || '-';
                            const phoneMatch = quickName.match(/\d{2,3}-\d{3,4}-\d{4}/);
                            const quickPhone = phoneMatch ? phoneMatch[0] : '-';
                            const quickClean = quickName.replace(phoneMatch ? phoneMatch[0] : '', '').trim() || '-';

                            const pDetail = route.pickupDetails?.[0];
                            const pPhone = pDetail?.phone1 || pDetail?.phone2 || '-';
                            const pAddr = pDetail?.addressDetail || route.pickup;

                            const dDetail = route.dropoffDetails?.[0];
                            const dPhone = dDetail?.phone1 || dDetail?.phone2 || '-';
                            const dAddr = dDetail?.addressDetail || route.dropoff;

                            return (
                                <>
                                    <div className="mb-3 pb-2 border-b border-border-card flex gap-4 text-[11px] text-text-muted">
                                        <span>시간 : {route.capturedAt ? new Date(route.capturedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '-'}</span>
                                        <span>ID : {route.id}</span>
                                    </div>
                                    <div className="mb-2 w-full flex">
                                        <div className="flex-shrink-0 w-[76px]">단일 경로 : </div>
                                        <div className="flex-1 break-keep pr-2 leading-tight">
                                            {route.osrmSoloDistanceKm ? (
                                                <span className="text-blue-600 dark:text-blue-400 font-bold">
                                                    단독 시 {Number(route.osrmSoloDistanceKm).toFixed(1)}km / 예상 {route.osrmSoloDurationMin || 0}분 <span className="text-[10px] opacity-80 font-normal">(OSRM기준)</span>
                                                </span>
                                            ) : route.kakaoSoloDistanceKm ? (
                                                <span className={`${route.osrmError ? 'text-text-primary' : 'text-blue-600 dark:text-blue-400 font-bold'}`}>
                                                    단독 시 {Number(route.kakaoSoloDistanceKm).toFixed(1)}km / 예상 {route.kakaoSoloDurationMin || 0}분
                                                    {route.osrmError && <span className="text-[10px] text-danger ml-1 font-normal inline-block">(⚠️ 에러: {route.osrmError})</span>}
                                                </span>
                                            ) : '궤적 연산 대기 중...'}
                                        </div>
                                    </div>
                                    <div className="mb-2">
                                        <div>퀵사무실 : {quickPhone}</div>
                                        <div className="ml-[76px]">{quickClean}</div>
                                    </div>
                                    <div className="mb-2">
                                        <div>상차지 : {pPhone}</div>
                                        <div className="ml-[63px]">{pAddr}</div>
                                    </div>
                                    <div className="mb-3">
                                        <div>하차지 : {dPhone}</div>
                                        <div className="ml-[63px]">{dAddr}</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="flex-shrink-0">적요 / 물품 :</span>
                                        <span className="text-text-primary font-bold line-clamp-3 leading-snug break-keep">{detailMemo}</span>
                                    </div>

                                    {/* 💡 사용자 디버깅/분석용 구조화 데이터 영역 (조건식 설계용) */}
                                    <div className="mt-4 flex flex-col text-[10px] text-gray-300 gap-1 border-t border-gray-700 pt-2 font-mono">
                                        <div className="text-text-muted mb-1 font-bold">📋 1DAL 데이터 필드 구조 (모든 키값 복사&수정용)</div>

                                        <div className="max-h-64 overflow-y-auto pr-1 flex flex-col gap-1 select-text">
                                            {[
                                                { label: 'id', val: route.id },
                                                { label: 'type', val: route.type },
                                                { label: 'receiptStatus', val: route.receiptStatus },
                                                { label: 'itemDescription', val: route.itemDescription },
                                                { label: 'vehicleType', val: route.vehicleType },
                                                { label: 'commissionRate', val: route.commissionRate },
                                                { label: 'tollFare', val: route.tollFare },
                                                { label: 'paymentType', val: route.paymentType },
                                                { label: 'billingType', val: route.billingType },
                                                { label: 'tripType', val: route.tripType },
                                                { label: 'orderForm', val: route.orderForm },
                                                { label: 'distanceKm', val: route.distanceKm },
                                                { label: 'dispatcherName', val: route.dispatcherName },
                                                { label: 'dispatcherPhone', val: route.dispatcherPhone },
                                                { label: 'companyName', val: route.companyName },
                                                { label: 'pickup', val: route.pickup },
                                                { label: 'dropoff', val: route.dropoff },
                                                { label: 'fare', val: route.fare },
                                                { label: 'timestamp', val: route.timestamp },
                                                { label: 'postTime', val: route.postTime },
                                                { label: 'scheduleText', val: route.scheduleText },
                                                { label: 'pickupTime', val: route.pickupTime },
                                                { label: 'detailMemo', val: route.detailMemo },
                                                { label: 'kakaoSoloDistanceKm', val: route.kakaoSoloDistanceKm },
                                                { label: 'kakaoSoloDurationMin', val: route.kakaoSoloDurationMin },
                                                { label: 'osrmSoloDistanceKm', val: route.osrmSoloDistanceKm },
                                                { label: 'osrmSoloDurationMin', val: route.osrmSoloDurationMin },
                                                { label: 'isRejected', val: route.isRejected },
                                                { label: 'rejectionReasons', val: route.rejectionReasons?.join(', ') },
                                                { label: 'approvalReasons', val: route.approvalReasons?.join(', ') },
                                                // { label: 'rawText', val: route.rawText }
                                            ].map((item, idx) => (
                                                <div key={idx} className="flex bg-black/20 p-1 rounded">
                                                    <span className="w-[120px] flex-shrink-0 text-text-muted font-bold select-all">route.{item.label} :</span>
                                                    <span className={`${item.label === 'rawText' || item.label === 'detailMemo' ? 'text-green-400 whitespace-normal' : 'text-gray-400 truncate'} flex-1`}>{item.val?.toString() || '-'}</span>
                                                </div>
                                            ))}

                                            <div className="flex flex-col bg-black/20 p-1 rounded mt-1">
                                                <span className="text-text-muted font-bold mb-1 select-all">route.pickupDetails :</span>
                                                <span className="text-gray-400 break-all whitespace-pre-wrap leading-snug">{JSON.stringify(route.pickupDetails, null, 2) || '-'}</span>
                                            </div>
                                            <div className="flex flex-col bg-black/20 p-1 rounded mt-1">
                                                <span className="text-text-muted font-bold mb-1 select-all">route.dropoffDetails :</span>
                                                <span className="text-gray-400 break-all whitespace-pre-wrap leading-snug">{JSON.stringify(route.dropoffDetails, null, 2) || '-'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                    </div>

                    {/* 평가 상태 액션 버튼 */}
                    {route.status === 'confirmed' && onDecision && (
                        <div className="mt-4 flex gap-3">
                            <button
                                disabled={processingId === route.id}
                                onClick={(e) => { e.stopPropagation(); setProcessingId(route.id); onDecision(route.id, 'CANCEL'); }}
                                className={`w-full bg-danger/10 text-danger text-sm font-bold py-4 rounded-lg border border-danger/30 transition-all shadow-sm ${processingId === route.id ? 'opacity-50 cursor-not-allowed' : 'hover:bg-danger/20 active:scale-[0.98]'}`}
                            >
                                {processingId === route.id ? '처리 중...' : '🚨 확정 배차 취소 (해당 오더 방출)'}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
