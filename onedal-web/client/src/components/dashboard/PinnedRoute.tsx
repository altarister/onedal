import type { SecuredOrder } from "@onedal/shared";

interface Props {
    activeRoute: SecuredOrder[];
    onDecision?: (id: string, action: 'KEEP' | 'CANCEL') => void;
}

import React, { useState } from 'react';

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
    const pickups = activeRoute.map((r) => ({ type: '상차', name: r.pickup.split(' ')[1] || r.pickup, isEvaluating: r.status.includes('evaluating') }));
    const dropoffs = [...activeRoute].reverse().map((r) => ({ type: '하차', name: r.dropoff.split(' ')[1] || r.dropoff, isEvaluating: r.status.includes('evaluating') }));
    const unifiedRoutePoints = [...pickups, ...dropoffs];

    return (
        <section id="confirmed-route" className="animate-in slide-in-from-top-4 fade-in duration-500">
            <div className={`bg-slate-900 border ${allEvaluating ? 'border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.15)]' : 'border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.1)]'} rounded-2xl p-4 relative transition-colors duration-500`}>
                <div className={`absolute -top-3 left-4 ${allEvaluating ? 'bg-amber-500' : 'bg-emerald-500'} text-black text-[10px] font-black px-2 py-0.5 rounded-md shadow-lg transition-colors`}>
                    {allEvaluating ? "🟡 최적의 경로를 찾습니다..." : "🟢 사냥 (배차) 확정"}
                </div>
                
                <div className="space-y-4 mt-4">
                    {/* 통합 라우팅 타임라인 (상단) */}
                    <div className="bg-[#0f1423] p-4 rounded-xl border border-slate-700/50 shadow-inner overflow-x-auto hide-scrollbar">
                        <div className="flex items-start min-w-max">
                            {unifiedRoutePoints.map((point, idx) => (
                                <React.Fragment key={idx}>
                                    <div className="flex flex-col items-center flex-shrink-0 w-16">
                                        <div className={`w-8 h-8 flex items-center justify-center rounded-full shadow-lg border-2 z-10 transition-colors
                                            ${point.type === '상차' 
                                                ? (point.isEvaluating ? 'bg-amber-500 border-amber-300 animate-pulse' : 'bg-emerald-600 border-emerald-400') 
                                                : (point.isEvaluating ? 'bg-rose-500 border-rose-300 animate-pulse' : 'bg-rose-700 border-rose-400')}`}
                                        >
                                            <span className="text-white text-xs font-black">{idx + 1}</span>
                                        </div>
                                        <div className="flex flex-col items-center mt-2 text-center">
                                            <span className="text-[10px] text-slate-400 font-bold leading-tight">{point.type}</span>
                                            <span className={`text-sm font-black mt-0.5 leading-tight ${point.isEvaluating ? 'text-amber-200' : 'text-slate-100'}`}>
                                                {point.name}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    {/* 연결선 (마지막 노드 제외) */}
                                    {idx < unifiedRoutePoints.length - 1 && (
                                        <div className="flex-1 w-12 h-[2px] bg-slate-700 mt-4 mx-1 relative overflow-hidden flex-shrink-0">
                                            {point.isEvaluating && <div className="absolute top-0 left-0 h-full w-full bg-gradient-to-r from-transparent via-amber-500/80 to-transparent animate-[shimmer_1s_infinite]" />}
                                        </div>
                                    )}
                                </React.Fragment>
                            ))}
                        </div>
                        
                        {/* 🌟 다중 경유지 포함 웹 지도 링크 버튼 🌟 */}
                        <div className="mt-4 pt-3 border-t border-slate-700/50 flex flex-col sm:flex-row gap-2">
                            {/* 데스크탑에서 다중 경유지가 완벽하게 지원되는 구글맵 링크 */}
                            <a 
                                href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(unifiedRoutePoints[0]?.name || '')}&destination=${encodeURIComponent(unifiedRoutePoints[unifiedRoutePoints.length - 1]?.name || '')}&waypoints=${encodeURIComponent(unifiedRoutePoints.slice(1, -1).map(p => p.name).join('|'))}&travelmode=driving`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition-colors active:scale-95 border border-slate-600"
                            >
                                <span>🗺️</span> 브라우저 통합 경로표 보기 (다중 경유지 테스트용)
                            </a>
                            {/* 모바일 카카오내비 다중 경유지 딥링크 포맷 (모바일 전용) */}
                            <a 
                                href={`kakaonavi://route?sp=127.0,37.5&ep=127.1,37.6&v1=127.05,37.55`}
                                onClick={(e) => {
                                    // 웹에서는 작동하지 않으므로 경고
                                    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                                    if (!isMobile) {
                                        e.preventDefault();
                                        alert("kakaonavi:// 스킴은 스마트폰에 카카오내비 앱이 설치되어 있어야만 전체 경유지가 로드됩니다.\n현재는 PC 웹 환경이므로 동작하지 않습니다.");
                                    }
                                }}
                                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-[#FEE500]/10 hover:bg-[#FEE500]/20 text-[#FEE500] text-[11px] font-bold transition-colors active:scale-95 border border-[#FEE500]/30"
                            >
                                <span>📱</span> 기사 폰으로 카카오내비 (경유지 포함) 전송
                            </a>
                        </div>
                    </div>

                    {/* 오더 관리 아코디언 리스트 (하단: 최신순 정렬 - 스크롤 방지용) */}
                    <div className="space-y-2">
                        {[...activeRoute].reverse().map((route, reversedIdx) => {
                            const originalIdx = activeRoute.length - 1 - reversedIdx;
                            const isEvaluating = route.status.includes('evaluating');
                            const isExpanded = isEvaluating || expandedIds.has(route.id);
                            const roleText = originalIdx === 0 ? "본콜" : "합짐"+originalIdx;

                            return (
                                <div key={route.id} className={`flex flex-col bg-[#111522] rounded-xl border border-slate-700/60 relative overflow-hidden transition-all duration-300 shadow-md ${isEvaluating ? 'ring-1 ring-amber-500/50' : 'hover:border-slate-500/50'}`}>
                                    {route.status === 'evaluating_detailed' && (
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite] pointer-events-none" />
                                    )}
                                    
                                    {/* 1. 카드 헤더 구역 (최대한 얇고 타이트하게 하나의 Flex Row로 통합) */}
                                    <div 
                                        onClick={() => !isEvaluating && toggleExpand(route.id)}
                                        className={`p-2 sm:p-2.5 flex justify-between items-center w-full ${!isEvaluating && 'cursor-pointer group hover:bg-white/5'}`}
                                    >
                                        <div className="flex items-center gap-1.5 sm:gap-2">
                                            {/* 상차지 버튼형 블록 */}
                                            <button onClick={(e) => e.stopPropagation()} className="flex flex-col items-center justify-center p-1.5 sm:p-2 min-w-[70px] bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/20 active:scale-95 transition-all">
                                                <span className="text-[9px] font-bold text-indigo-400 mb-0.5">📞 상차지</span>
                                                <span className={`text-[13px] sm:text-sm font-black tracking-tight ${isEvaluating ? 'text-amber-200' : 'text-slate-100'} truncate max-w-[80px]`}>{route.pickup.split(' ')[1] || route.pickup}</span>
                                            </button>
                                            
                                            {/* 초소형 화살표 */}
                                            <span className="text-slate-600 text-[10px] mx-0.5">▶</span>
                                            
                                            {/* 하차지 버튼형 블록 */}
                                            <button onClick={(e) => e.stopPropagation()} className="flex flex-col items-center justify-center p-1.5 sm:p-2 min-w-[70px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded border border-rose-500/20 active:scale-95 transition-all">
                                                <span className="text-[9px] font-bold text-rose-400 mb-0.5">📞 하차지</span>
                                                <span className={`text-[13px] sm:text-sm font-black tracking-tight ${isEvaluating ? 'text-amber-100' : 'text-slate-200'} truncate max-w-[80px]`}>{route.dropoff.split(' ')[1] || route.dropoff}</span>
                                            </button>
                                        </div>
                                        
                                        <div className="flex items-center gap-3">
                                            {/* 요금 표기 */}
                                            <div className="flex flex-col items-end">
                                                {isEvaluating && (
                                                    <span className={`text-[9px] font-bold px-1 rounded-sm mb-0.5 animate-pulse ${route.status === 'evaluating_basic' ? 'bg-rose-950 text-rose-400' : 'bg-amber-950 text-amber-400'}`}>평가중</span>
                                                )}
                                                <div className={`${isEvaluating ? "text-amber-400" : "text-emerald-400"} font-black text-lg tracking-tight`}>
                                                    {(route.fare / 10000).toFixed(1)}<span className="text-xs font-bold ml-0.5 opacity-80">만</span>
                                                </div>
                                            </div>

                                            {/* 관제 센터 컴바인 버튼 (역할 텍스트 포함) */}
                                            <button onClick={(e) => e.stopPropagation()} className="flex flex-col items-center justify-center py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-600 shadow-sm active:scale-95 transition-all min-w-[60px]">
                                                <span className="text-[9px] font-bold text-slate-400 mb-0.5 tracking-tight">{roleText}</span>
                                                <span className="text-[11px] font-bold tracking-tight">📞 관제</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* 2. 카드 콘텐츠 (아코디언 펼침 시에만 노출 / 평가중일 땐 강제 노출) */}
                                    {isExpanded && (
                                        <div className="px-4 pb-4 pt-1 text-sm border-t border-slate-700/50 bg-[#111522] mt-1">
                                            {/* 상세 데이터 영역 */}
                                            <div className="grid grid-cols-[80px_1fr] gap-y-2 mt-4 text-slate-400 text-xs bg-black/20 p-3 rounded-lg border border-white/5">
                                                <span className="text-slate-500 font-medium py-1">적요 / 물품</span>
                                                <span className="text-slate-200 font-bold py-1 truncate">{route.itemDescription || "1파레트 / 박스 혼재"}</span>
                                                
                                                <span className="text-slate-500 font-medium py-1">화주 / 퀵사</span>
                                                <span className="text-slate-200 font-bold py-1 truncate">{route.companyName || "1DAL 통합 물류망"}</span>
                                            </div>

                                            {/* 2차 상세 수신 시뮬레이션 결과 표기 (데스밸리 카카오결과) */}
                                            {route.status === 'evaluating_detailed' && route.kakaoTimeExt && (
                                                <div className="mt-4 text-xs font-bold text-amber-200 bg-amber-950/40 p-3 rounded-lg flex flex-col gap-1.5 border border-amber-500/40 shadow-inner">
                                                    <div className="flex justify-between items-center opacity-80 mb-1 border-b border-amber-500/20 pb-1.5">
                                                        <span className="text-[11px] uppercase tracking-wider">카카오 동선 최적화 결과</span>
                                                        {route.kakaoDistExt && <span>{route.kakaoDistExt}</span>}
                                                    </div>
                                                    <div className="text-sm font-black">{route.kakaoTimeExt}</div>
                                                </div>
                                            )}

                                            {/* 카카오맵 외부 링크 (웹용 내비게이션/지도) */}
                                            {!isEvaluating && route.status === 'confirmed' && (
                                                <div className="mt-4">
                                                    <a 
                                                        href={`https://map.kakao.com/?sName=${encodeURIComponent(route.pickup)}&eName=${encodeURIComponent(route.dropoff)}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-[#FEE500] hover:bg-[#F4DC00] text-[#000000] text-sm font-black transition-colors shadow-sm active:scale-95 border border-[#FEE500]/50"
                                                    >
                                                        <span>🗺️</span> 카카오 지도로 경로 보기 (단독)
                                                    </a>
                                                </div>
                                            )}

                                            {/* 평가 상태(데스밸리) 액션 버튼 */}
                                            {route.status === 'evaluating_basic' && onDecision && (
                                                <div className="mt-4 flex flex-col gap-2">
                                                    <div className="text-xs text-amber-300/70 text-center animate-pulse font-medium">
                                                        ⏳ 앱폰이 상세 정보를 긁고 있습니다... 잠시 기다려주세요
                                                    </div>
                                                    <div className="flex gap-3">
                                                        <button onClick={(e) => { e.stopPropagation(); onDecision(route.id, 'CANCEL'); }} className="flex-1 bg-slate-800 text-rose-400 text-sm font-bold py-3.5 rounded-lg border border-rose-500/20 hover:bg-rose-950 transition-all shadow-sm active:scale-95">
                                                            즉시 포기
                                                        </button>
                                                        <button disabled className="flex-1 bg-slate-800 text-slate-500 text-sm font-bold py-3.5 rounded-lg border border-slate-700 cursor-not-allowed">
                                                            상세 대기중...
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                            {route.status === 'evaluating_detailed' && onDecision && (
                                                <div className="mt-4 flex gap-3">
                                                    <button onClick={(e) => { e.stopPropagation(); onDecision(route.id, 'CANCEL'); }} className="flex-1 bg-[#2a131b] text-rose-400 text-sm font-bold py-4 rounded-lg border border-rose-500/30 hover:bg-[#3d1a25] transition-all shadow-sm active:scale-95">
                                                        방출
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); onDecision(route.id, 'KEEP'); }} className="flex-[2] bg-emerald-500 text-emerald-950 text-base font-black py-4 rounded-lg shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:bg-emerald-400 hover:scale-[1.02] active:scale-95 transition-all">
                                                        유지 확정
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
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
