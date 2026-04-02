import type { SecuredOrder } from "@onedal/shared";

interface Props {
    activeRoute: SecuredOrder[];
    onDecision?: (id: string, action: 'KEEP' | 'CANCEL') => void;
}

import { useState } from 'react';

export default function PinnedRoute({ activeRoute, onDecision }: Props) {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    if (!activeRoute || activeRoute.length === 0) return null;

    const allEvaluating = activeRoute.some(r => r.status === 'evaluating_basic' || r.status === 'evaluating_detailed');

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {    
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    // 가상의 통합 노선도(타임라인) 생성: 상차는 순방향, 하차는 역방향(간단한 LIFO 모의)
    const pickups = activeRoute.map((r, i) => ({ type: '상차', name: r.pickup.split(' ')[1] || r.pickup, isEvaluating: r.status.includes('evaluating') }));
    const dropoffs = [...activeRoute].reverse().map((r, i) => ({ type: '하차', name: r.dropoff.split(' ')[1] || r.dropoff, isEvaluating: r.status.includes('evaluating') }));
    const unifiedRoutePoints = [...pickups, ...dropoffs];

    return (
        <section id="confirmed-route" className="animate-in slide-in-from-top-4 fade-in duration-500">
            <div className={`bg-slate-900 border ${allEvaluating ? 'border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.15)]' : 'border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.1)]'} rounded-2xl p-4 relative transition-colors duration-500`}>
                <div className={`absolute -top-3 left-4 ${allEvaluating ? 'bg-amber-500' : 'bg-emerald-500'} text-black text-[10px] font-black px-2 py-0.5 rounded-md shadow-lg transition-colors`}>
                    {allEvaluating ? "🟡 최적의 경로를 찾습니다..." : "🟢 사냥 (배차) 확정"}
                </div>
                
                <div className="space-y-3 mt-3">
                    {/* 통합 라우팅 타임라인 (상단) */}
                    <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700">
                        <div className="flex overflow-x-auto gap-4 pb-2 snap-x snap-mandatory hide-scrollbar">
                            {unifiedRoutePoints.map((point, idx) => (
                                <div key={idx} className="flex flex-col items-center flex-shrink-0 snap-center relative min-w-[70px]">
                                    <div className={`w-8 h-8 flex items-center justify-center rounded-full shadow-lg border-2 z-10 
                                        ${point.type === '상차' 
                                            ? (point.isEvaluating ? 'bg-amber-500 border-amber-300 animate-pulse' : 'bg-emerald-600 border-emerald-400') 
                                            : (point.isEvaluating ? 'bg-rose-500 border-rose-300 animate-pulse' : 'bg-rose-700 border-rose-400')}`}
                                    >
                                        <span className="text-white text-xs font-black">{idx + 1}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-bold mt-2">{point.type}</span>
                                    <span className={`text-sm font-black truncate max-w-[80px] text-center ${point.isEvaluating ? 'text-amber-200' : 'text-slate-200'}`}>
                                        {point.name}
                                    </span>
                                    
                                    {/* 연결선 (마지막 노드 제외) */}
                                    {idx < unifiedRoutePoints.length - 1 && (
                                        <div className="absolute top-4 left-1/2 w-full h-[3px] bg-slate-600 -z-0">
                                            {point.isEvaluating && <div className="h-full bg-gradient-to-r from-transparent to-amber-500 animate-[shimmer_1s_infinite]" />}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 오더 관리 아코디언 리스트 (하단) */}
                    {activeRoute.map((route, idx) => {
                        const isEvaluating = route.status.includes('evaluating');
                        const isExpanded = isEvaluating || expandedIds.has(route.id);

                        return (
                            <div key={route.id} className={`flex flex-col bg-[#111624] rounded-xl border border-white/5 relative overflow-hidden transition-all duration-300 shadow-md ${isEvaluating ? 'ring-1 ring-amber-500/50' : ''}`}>
                                {route.status === 'evaluating_detailed' && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite] pointer-events-none" />
                                )}
                                
                                {/* 1. 카드 헤더 (항상 노출 구역) */}
                                <div 
                                    onClick={() => !isEvaluating && toggleExpand(route.id)}
                                    className={`p-3 flex flex-col gap-2 ${!isEvaluating && 'cursor-pointer hover:bg-white/5'}`}
                                >
                                    <div className="flex justify-between items-center w-full">
                                        <div className="flex items-center gap-2">
                                            {isEvaluating ? (
                                                <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${route.status === 'evaluating_basic' ? 'bg-rose-950 text-rose-400 border border-rose-500/30' : 'bg-amber-950 text-amber-400 border border-amber-500/30'} animate-pulse`}>
                                                    평가중
                                                </div>
                                            ) : (
                                                <span className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-600">
                                                    {idx === 0 ? "본콜" : "합짐"+idx}
                                                </span>
                                            )}
                                        </div>
                                        <div className={`${isEvaluating ? "text-amber-400" : "text-emerald-400"} font-black text-lg`}>
                                            {(route.fare / 10000).toFixed(1)}<span className="text-sm font-normal ml-0.5 opacity-80">만</span>
                                        </div>
                                    </div>
                                    
                                    <div className="flex justify-between items-center bg-black/40 rounded-lg p-2 border border-white/5">
                                        <div className="flex flex-col items-center">
                                            <button className="text-[10px] p-1.5 bg-indigo-900/40 hover:bg-indigo-700 text-indigo-300 rounded border border-indigo-500/30 transition-colors mb-1 active:scale-95">
                                                📞상차
                                            </button>
                                            <span className={`text-sm font-bold truncate w-20 text-center ${isEvaluating ? 'text-amber-200' : 'text-slate-200'}`}>{route.pickup.split(' ')[1] || route.pickup}</span>
                                            <span className="text-[10px] text-slate-500">08:00 예상</span>
                                        </div>
                                        
                                        <div className="flex-1 flex flex-col items-center px-2">
                                            <span className={`text-[10px] ${isEvaluating ? 'text-amber-500/50' : 'text-slate-600'}`}>━━━━▶</span>
                                        </div>

                                        <div className="flex flex-col items-center">
                                            <button className="text-[10px] p-1.5 bg-rose-900/40 hover:bg-rose-700 text-rose-300 rounded border border-rose-500/30 transition-colors mb-1 active:scale-95">
                                                📞하차
                                            </button>
                                            <span className={`text-sm font-bold truncate w-20 text-center ${isEvaluating ? 'text-amber-100' : 'text-slate-300'}`}>{route.dropoff.split(' ')[1] || route.dropoff}</span>
                                            <span className="text-[10px] text-slate-500">12:00 예상</span>
                                        </div>

                                        <div className="flex flex-col pl-3 border-l border-white/10 ml-2">
                                            <button className="text-[10px] p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-600 transition-colors active:scale-95">
                                                📞퀵사
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* 2. 카드 콘텐츠 (아코디언 펼침 시에만 노출 / 평가중일 땐 강제 노출) */}
                                {isExpanded && (
                                    <div className="px-3 pb-3 pt-0 text-sm border-t border-white/5 bg-black/20">
                                        {/* 상세 데이터 영역 */}
                                        <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 text-slate-400 text-xs">
                                            <span className="text-slate-500">적요 / 물품</span>
                                            <span className="text-slate-200 font-medium text-right truncate">{route.itemDescription || "1파레트 / 박스 혼재"}</span>
                                            
                                            <span className="text-slate-500">화주 / 퀵사</span>
                                            <span className="text-slate-200 font-medium text-right truncate">{route.companyName || "원달 물류"}</span>
                                        </div>

                                        {/* 2차 상세 수신 시뮬레이션 결과 표기 (데스밸리 카카오결과) */}
                                        {route.status === 'evaluating_detailed' && route.kakaoTimeExt && (
                                            <div className="mt-3 text-xs font-bold text-amber-300 bg-amber-950/60 px-3 py-2 rounded flex flex-col gap-1 border border-amber-500/30">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-amber-200/70 text-[10px]">카카오 예상 추가</span>
                                                    {route.kakaoDistExt && <span className="text-amber-400/80">{route.kakaoDistExt}</span>}
                                                </div>
                                                <div className="text-sm">{route.kakaoTimeExt}</div>
                                            </div>
                                        )}

                                        {/* 평가 상태(데스밸리) 액션 버튼 */}
                                        {route.status === 'evaluating_basic' && onDecision && (
                                            <div className="mt-3 flex gap-2">
                                                <button onClick={(e) => { e.stopPropagation(); onDecision(route.id, 'CANCEL'); }} className="flex-1 bg-slate-800 text-rose-400 text-xs font-bold py-2.5 rounded border border-rose-500/20 hover:bg-rose-950 transition-all">
                                                    [포기] (취소)
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); onDecision(route.id, 'KEEP'); }} className="flex-1 bg-slate-700 text-slate-300 text-xs font-bold py-2.5 rounded border border-slate-600">
                                                    [대기]
                                                </button>
                                            </div>
                                        )}
                                        {route.status === 'evaluating_detailed' && onDecision && (
                                            <div className="mt-3 flex gap-2">
                                                <button onClick={(e) => { e.stopPropagation(); onDecision(route.id, 'CANCEL'); }} className="flex-1 bg-rose-950 text-rose-400 text-sm font-bold py-3 rounded border border-rose-500/30 hover:bg-rose-900 transition-all active:scale-95">
                                                    방출 (취소)
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); onDecision(route.id, 'KEEP'); }} className="flex-[2] bg-emerald-500 text-slate-950 text-sm font-black py-3 rounded shadow-[0_0_15px_rgba(16,185,129,0.5)] hover:scale-105 active:scale-95 transition-all">
                                                    [닫기] (유지 확정)
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-800">
                    <span className="text-xs font-bold text-slate-500">총 합계 운임</span>
                    <span className={`text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r ${allEvaluating ? 'from-amber-400 to-yellow-200' : 'from-emerald-400 to-cyan-400'}`}>
                        {(activeRoute.reduce((sum, o) => sum + o.fare, 0)).toLocaleString()} <span className="text-sm">원</span>
                    </span>
                </div>
            </div>
        </section>
    );
}
