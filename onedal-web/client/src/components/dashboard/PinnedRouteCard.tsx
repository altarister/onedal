import type { SecuredOrder } from "@onedal/shared";
import { getAddressLabel, getMinuteDiff } from "./routeUtils";
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

    const pLabel = visitOrder?.pickupIdx || '?';
    const dLabel = visitOrder?.dropoffIdx || '?';

    const minuteDiff = getMinuteDiff(etas?.pickupEta, etas?.dropoffEta);
    const separatorText = minuteDiff !== null ? `-${minuteDiff}분-` : '-';

    return (
        <div className={`flex flex-col bg-[#111522] rounded-xl border border-slate-700/60 relative overflow-hidden transition-all duration-300 shadow-md ${isEvaluating ? 'ring-1 ring-amber-500/50' : 'hover:border-slate-500/50'}`}>
            {route.status === 'evaluating_detailed' && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite] pointer-events-none" />
            )}

            {/* 1. 카드 헤더 구역 */}
            <div
                onClick={() => !isEvaluating && onToggle(route.id)}
                className={`px-2 py-1 flex justify-between items-center w-full text-sm tracking-tight ${!isEvaluating ? 'cursor-pointer group hover:bg-white/5' : ''}`}
            >
                <div className="flex items-center gap-1 truncate text-slate-300 flex-1">
                    <span className="text-slate-500 font-bold mr-1 text-[11px] bg-slate-800 px-1.5 py-0.5 rounded-md">#{indexNum}</span>
                    <span className={`${isEvaluating ? 'text-amber-400' : 'text-emerald-400'} flex-shrink-0 flex items-center`}>
                        {pLabel}. {getAddressLabel(route.pickup)}{etas?.pickupEta && <span className="text-emerald-200 ml-0.5">({etas.pickupEta})</span>}
                    </span>
                    <span className="text-slate-500 text-[10px] flex-shrink-0 mx-0.5 tracking-tighter">{separatorText}</span>
                    <span className={`${isEvaluating ? 'text-amber-400' : 'text-rose-400'} flex-shrink-0`}>
                        {dLabel}. {getAddressLabel(route.dropoff)}{etas?.dropoffEta && <span className="text-rose-200 ml-0.5">({etas.dropoffEta})</span>}
                    </span>
                    <span className="ml-3 text-slate-400 font-medium text-[10px] truncate mt-0.5 flex items-center gap-1 flex-[2]">
                        <span>{route.fare > 0 ? `${(route.fare / 10000).toFixed(1)}만` : '금액미상'}</span>
                        <span className="text-slate-600">,</span>
                        <span>{route.status.includes('evaluating') ? '계산중' : route.distanceKm ? `${route.distanceKm}Km` : '미상'}</span>
                        <span className="text-slate-600">,</span>
                        <span>{route.vehicleType?.substring(0, 1) || '차'}</span>
                    </span>
                </div>

                {isEvaluating && (
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-sm animate-pulse flex-shrink-0 ml-2 ${route.status === 'evaluating_basic' ? 'bg-rose-950 text-rose-400' : 'bg-amber-950 text-amber-400'}`}>평가중</span>
                )}
                {!isEvaluating && route.type === 'MANUAL' && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-sm bg-blue-900 border border-blue-500/30 text-blue-200 flex-shrink-0 ml-2 shadow-[0_0_10px_rgba(59,130,246,0.2)]">수동 배차</span>
                )}
            </div>

            {/* 2. 카드 콘텐츠 */}
            {isExpanded && (
                <div id="" className="px-4 pb-4 pt-1 text-sm border-t border-slate-700/50 bg-[#111522] mt-1">
                    {/* 상세 데이터 영역 */}
                    <div className="flex flex-col text-slate-400 text-[13px] leading-tight bg-black/20 p-4 rounded-lg border border-white/5 font-medium tracking-tight">
                        {(() => {
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
                                    <div className="mb-3 pb-2 border-b border-white/5 flex gap-4 text-[11px] text-slate-500">
                                        <span>ID : {route.id}</span>
                                        <span>잡은 시간 : {route.capturedAt ? new Date(route.capturedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '-'}</span>
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
                                        <span className="text-slate-300 font-bold">{route.itemDescription || "상세 정보 없음"}</span>
                                    </div>
                                </>
                            );
                        })()}
                    </div>

                    {/* 2차 상세 수신 시뮬레이션 결과 표기 */}
                    {route.kakaoTimeExt && (
                        <div className="mt-3 text-[11px] font-bold text-amber-200 bg-amber-950/40 px-3 py-1.5 rounded flex items-center justify-between border border-amber-500/20">
                            <span>카카오 분석 결과</span>
                            <span>
                                {route.kakaoTimeExt.replace(/['꿀똥콜🚙💩🍯]/g, "").trim()}
                                {route.kakaoTimeExt.includes("실패") ? "" : route.kakaoTimeExt.includes("'꿀'") ? " (꿀)" : route.kakaoTimeExt.includes("'똥'") ? " (패널티 주의)" : " (양호)"}
                            </span>
                        </div>
                    )}

                    {/* 평가 상태 액션 버튼 */}
                    {route.status === 'confirmed' && onDecision && (
                        <div className="mt-4 flex gap-3">
                            <button
                                disabled={processingId === route.id}
                                onClick={(e) => { e.stopPropagation(); setProcessingId(route.id); onDecision(route.id, 'CANCEL'); }}
                                className={`w-full bg-rose-950/40 text-rose-400 text-sm font-bold py-4 rounded-lg border border-rose-500/20 transition-all shadow-sm ${processingId === route.id ? 'opacity-50 cursor-not-allowed' : 'hover:bg-rose-900/60 active:scale-[0.98]'}`}
                            >
                                {processingId === route.id ? '처리 중...' : '🚨 확정 배차 취소 (해당 오더 방출)'}
                            </button>
                        </div>
                    )}

                    {route.type !== 'MANUAL' && route.status === 'evaluating_basic' && onDecision && (
                        <div className="mt-4 flex flex-col gap-2">
                            <div className="text-xs text-amber-300/70 text-center animate-pulse font-medium">
                                ⏳ 앱폰이 상세 정보를 긁고 있습니다... 잠시 기다려주세요
                            </div>
                            <div className="flex gap-3">
                                <button disabled={processingId === route.id} onClick={(e) => { e.stopPropagation(); setProcessingId(route.id); onDecision(route.id, 'CANCEL'); }} className={`flex-1 bg-slate-800 text-rose-400 text-sm font-bold py-3.5 rounded-lg border border-rose-500/20 transition-all shadow-sm ${processingId === route.id ? 'opacity-50 cursor-not-allowed' : 'hover:bg-rose-950 active:scale-95'}`}>
                                    {processingId === route.id ? '처리 중...' : '즉시 포기'}
                                </button>
                                <button disabled className="flex-1 bg-slate-800 text-slate-500 text-sm font-bold py-3.5 rounded-lg border border-slate-700 cursor-not-allowed">
                                    상세 대기중...
                                </button>
                            </div>
                        </div>
                    )}
                    {route.type !== 'MANUAL' && route.status === 'evaluating_detailed' && onDecision && (
                        <div className="mt-4 flex gap-3">
                            <button disabled={processingId === route.id} onClick={(e) => { e.stopPropagation(); logRoadmapEvent("웹", "PinnedRoute에서 CANCEL(취소) 또는 X 버튼 클릭"); logRoadmapEvent("웹", "서버에게 decision=CANCEL 하달 정보 전달"); setProcessingId(route.id); onDecision(route.id, 'CANCEL'); }} className={`flex-1 bg-[#2a131b] text-rose-400 text-sm font-bold py-4 rounded-lg border border-rose-500/30 transition-all shadow-sm ${processingId === route.id ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#3d1a25] active:scale-95'}`}>
                                {processingId === route.id ? '처리 중...' : '방출'}
                            </button>
                            {!!route.kakaoTimeExt ? (
                                <button disabled={processingId === route.id} onClick={(e) => { e.stopPropagation(); logRoadmapEvent("웹", "PinnedRoute에서 KEEP(사냥 확정) 녹색 버튼 클릭"); logRoadmapEvent("웹", "서버에게 decision=KEEP 하달 정보 전달"); setProcessingId(route.id); onDecision(route.id, 'KEEP'); }} className={`flex-[2] bg-emerald-500 text-emerald-950 text-base font-black py-4 rounded-lg transition-all ${processingId === route.id ? 'opacity-50 cursor-not-allowed' : 'shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:bg-emerald-400 hover:scale-[1.02] active:scale-95'}`}>
                                    {processingId === route.id ? '서버와 통신 중...' : '유지 확정'}
                                </button>
                            ) : (
                                <button disabled className="flex-[2] bg-slate-800 text-slate-500 text-base font-black py-4 rounded-lg border border-slate-700 cursor-not-allowed">
                                    좌표 분석 중...
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
