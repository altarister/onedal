import { useState, useEffect } from "react";
import { useFilterConfig } from "../../hooks/useFilterConfig";

interface OrderFilterModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function OrderFilterModal({ isOpen, onClose }: OrderFilterModalProps) {
    const { filter, updateFilter } = useFilterConfig();

    // 이 페이지는 폼 역할이므로 로컬 state로 관리 후 저장 시 소켓 발송
    const [minFare, setMinFare] = useState<string>("");
    const [pickupRadius, setPickupRadius] = useState<string>("");
    const [targetCity, setTargetCity] = useState<string>("");
    const [targetRadius, setTargetRadius] = useState<string>("");
    const [corridorRadius, setCorridorRadius] = useState<string>("");
    const [blacklist, setBlacklist] = useState<string>("");
    const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);

    // 배열 확인용 아코디언 상태
    const [isAccordionOpen, setIsAccordionOpen] = useState(false);

    const VEHICLE_OPTIONS = ['1t', '다마스', '라보', '오토바이'] as const;

    useEffect(() => {
        if (isOpen && filter) {
            setMinFare(filter.minFare?.toString() || "");
            setPickupRadius(filter.pickupRadiusKm?.toString() || "");
            setTargetCity(filter.destinationCity || "");
            setTargetRadius(filter.destinationRadiusKm?.toString() || "");
            setCorridorRadius(filter.corridorRadiusKm?.toString() || "10");
            setBlacklist(filter.excludedKeywords || "");

            // 첫짐/합짐 모드 변환에 따른 차종 자동 필터링 (합짐 시 1t 제외)
            let initialVehicles = filter.allowedVehicleTypes || [];
            if (filter.isSharedMode) {
                initialVehicles = initialVehicles.filter(v => v !== '1t');
            }
            setSelectedVehicles(initialVehicles);
        }
        setIsAccordionOpen(false); // 열릴때마다 아코디언 닫기
    }, [isOpen]);

    if (!isOpen) return null;

    if (!filter) {
        return (
            <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-indigo-400 font-bold animate-pulse">동기화 대기 중...</span>
                </div>
            </div>
        );
    }

    const handleSave = () => {
        updateFilter({
            allowedVehicleTypes: selectedVehicles,
            minFare: minFare ? parseInt(minFare, 10) : filter.minFare,
            pickupRadiusKm: pickupRadius ? parseInt(pickupRadius, 10) : filter.pickupRadiusKm,
            destinationCity: targetCity || filter.destinationCity,
            destinationRadiusKm: targetRadius ? parseInt(targetRadius, 10) : filter.destinationRadiusKm,
            corridorRadiusKm: corridorRadius ? parseInt(corridorRadius, 10) : filter.corridorRadiusKm,
            excludedKeywords: blacklist || filter.excludedKeywords,
            userOverrides: true // 기사가 수동 개입했음을 마킹
        });
        onClose();
    };

    const isSharedMode = filter.isSharedMode;
    const destKeywordsLimit = filter.destinationKeywords ? filter.destinationKeywords.split(',').filter(Boolean) : [];

    return (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-lg relative bg-[#070b14] border border-slate-700/50 rounded-2xl shadow-2xl p-5 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-indigo-900/20 blur-[100px] rounded-full pointer-events-none" />
                <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-emerald-900/20 blur-[100px] rounded-full pointer-events-none" />

                {/* 헤더 바 */}
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-indigo-500/20 relative z-10">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex border items-center justify-center rounded-full bg-slate-900/80 border-slate-700/50 text-slate-400 hover:text-white hover:border-indigo-400 hover:bg-indigo-900/40 transition-all shadow-lg active:scale-90"
                        >
                            ✕
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-emerald-300 tracking-tight">
                                통제 필터 설정
                            </h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${isSharedMode ? 'bg-orange-500/20 text-orange-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                    {isSharedMode ? '합짐(Loaded) 모드' : '첫짐(Empty) 모드'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-4 overflow-y-auto pr-1 pb-2 custom-scrollbar relative z-10">
                    {/* 차종 멀티셀렉터 */}
                    <div className="bg-slate-900/40 backdrop-blur-md p-4 rounded-xl border border-slate-800/60 shadow-lg">
                        <div className="flex items-center gap-1.5 mb-3">
                            <span className="text-sm">🚛</span>
                            <h2 className="text-[12px] font-black text-white tracking-widest">차종 필터</h2>
                            <span className="text-[9px] text-slate-500 ml-auto font-mono">
                                {selectedVehicles.length === 0 ? '전체 허용' : `${selectedVehicles.length}개 선택`}
                            </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            {VEHICLE_OPTIONS.map((v) => {
                                const isSelected = selectedVehicles.includes(v);
                                return (
                                    <button
                                        key={v}
                                        type="button"
                                        onClick={() => {
                                            setSelectedVehicles(prev =>
                                                prev.includes(v)
                                                    ? prev.filter(x => x !== v)
                                                    : [...prev, v]
                                            );
                                        }}
                                        className={`py-2.5 rounded-lg text-sm font-black tracking-tight transition-all active:scale-95 border ${isSelected
                                            ? 'bg-orange-500/20 border-orange-400/60 text-orange-300 shadow-[0_0_12px_rgba(251,146,60,0.15)]'
                                            : 'bg-black/40 border-slate-700/40 text-slate-500 hover:border-slate-600 hover:text-slate-400'
                                            }`}
                                    >
                                        {v}
                                    </button>
                                );
                            })}
                        </div>
                        {isSharedMode && (
                            <p className="text-[10px] text-orange-400 mt-2 font-black text-center bg-orange-900/20 p-1.5 rounded">
                                💡 합짐 모드 진입으로 잔짐 공략을 위해 '1t' 필터 옵션이 기본 해제되었습니다.
                            </p>
                        )}
                    </div>

                    {/* 단가 및 거리 필터 (가로 배치) */}
                    <div className="flex gap-4">
                        {/* 하한가 */}
                        <div className="flex-1 group bg-slate-900/40 backdrop-blur-md p-3 rounded-xl border border-slate-800/60 shadow-lg hover:border-emerald-500/40 transition-colors">
                            <label className="text-[11px] font-black text-slate-400 tracking-wider flex items-center gap-1.5 mb-2">
                                <span className="text-emerald-400">💵</span> 하한가
                            </label>
                            <div className="relative flex items-center mb-1">
                                <input
                                    type="number"
                                    value={minFare}
                                    onChange={(e) => setMinFare(e.target.value)}
                                    className="w-full bg-black/60 border border-slate-700/50 rounded-lg p-2.5 pr-10 text-xl text-emerald-300 font-black outline-none focus:bg-emerald-950/20 focus:border-emerald-400/60 transition-all font-mono tracking-tighter shadow-inner"
                                />
                                <span className="absolute right-2.5 text-[10px] text-emerald-500/70 font-bold pointer-events-none">원</span>
                            </div>
                        </div>

                        {/* 상차 거리: 첫짐 모드일 때만 표시 */}
                        {!isSharedMode && (
                            <div className="flex-1 group bg-slate-900/40 backdrop-blur-md p-3 rounded-xl border border-slate-800/60 shadow-lg hover:border-indigo-500/40 transition-colors">
                                <label className="text-[11px] font-black text-slate-400 tracking-wider flex items-center gap-1.5 mb-2">
                                    <span className="text-indigo-400">📍</span> 상차 반경
                                </label>
                                <div className="relative flex items-center mb-1">
                                    <input
                                        type="number"
                                        value={pickupRadius}
                                        onChange={(e) => setPickupRadius(e.target.value)}
                                        className="w-full bg-black/60 border border-slate-700/50 rounded-lg p-2.5 pr-10 text-xl text-white font-bold outline-none focus:bg-indigo-950/20 focus:border-indigo-400/60 transition-all shadow-inner"
                                    />
                                    <span className="absolute right-2.5 text-[10px] text-slate-500 font-bold pointer-events-none">KM</span>
                                </div>
                            </div>
                        )}
                        {isSharedMode && (
                            <div className="flex-1 group bg-slate-900/20 backdrop-blur-md p-3 rounded-xl border border-slate-800/30 shadow-inner flex flex-col justify-center items-center text-center">
                                <span className="text-xl mb-1 opacity-50">🛣️</span>
                                <span className="text-[10px] font-black text-slate-500">상차 반경 비활성화됨</span>
                                <span className="text-[9px] text-slate-600 mt-0.5">가는 길(회랑)에서 탐색합니다</span>
                            </div>
                        )}
                    </div>

                    {/* 전략 필터 구역 - 합짐 vs 첫짐 분기 */}
                    <div className="bg-gradient-to-br from-slate-900/60 to-[#0e1424]/80 backdrop-blur-md p-4 rounded-xl border border-slate-700/50 shadow-lg">
                        <div className="flex items-center gap-1.5 mb-3 pb-2 border-b border-slate-700/50">
                            <span className="text-sm">🎯</span>
                            <h2 className="text-[12px] font-black text-white tracking-widest">
                                {isSharedMode ? '합짐 우선순위 파이프라인' : '첫콜 목적지 설정'}
                            </h2>
                        </div>

                        <div className="flex gap-4">
                            {!isSharedMode ? (
                                // 첫짐 모드 UI
                                <>
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-bold text-slate-400 mb-1.5 pl-1">도착 희망 시/도</label>
                                        <select
                                            value={targetCity}
                                            onChange={(e) => setTargetCity(e.target.value)}
                                            className="w-full bg-black/50 border border-slate-600/40 rounded-lg p-2.5 text-[15px] text-indigo-300 font-bold outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/50 transition-all shadow-inner appearance-none"
                                        >
                                            <option value="용인시">용인시</option>
                                            <option value="수원시">수원시</option>
                                            <option value="성남시">성남시</option>
                                            <option value="화성시">화성시</option>
                                            <option value="광주시">광주시</option>
                                            <option value="평택시">평택시</option>
                                            <option value="파주시">파주시</option>
                                        </select>
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-bold text-slate-400 mb-1.5 pl-1">목적지 주변 반경</label>
                                        <div className="relative flex items-center">
                                            <input
                                                type="number"
                                                value={targetRadius}
                                                onChange={(e) => setTargetRadius(e.target.value)}
                                                className="w-full bg-black/50 border border-slate-600/40 rounded-lg p-2.5 text-[15px] text-indigo-300 font-bold outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/50 transition-all shadow-inner"
                                            />
                                            <span className="absolute right-2.5 text-indigo-600 font-black pointer-events-none text-[10px]">KM</span>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                // 합짐 모드 UI
                                <>
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-bold text-slate-400 mb-1.5 pl-1 text-center">경로 이탈 (회랑) 반경</label>
                                        <div className="relative flex items-center">
                                            <input
                                                type="number"
                                                value={corridorRadius}
                                                onChange={(e) => setCorridorRadius(e.target.value)}
                                                className="w-full bg-black/50 border border-orange-500/30 rounded-lg p-2.5 text-[15px] text-orange-300 font-bold outline-none focus:border-orange-400 text-center transition-all shadow-inner"
                                            />
                                            <span className="absolute right-2.5 text-orange-600/50 font-black pointer-events-none text-[10px]">KM</span>
                                        </div>
                                    </div>
                                    <div className="flex-[0.2] flex items-center justify-center text-slate-600 text-xl font-light pt-4">+</div>
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-bold text-slate-400 mb-1.5 pl-1 text-center">하차 거점 주변 반경</label>
                                        <div className="relative flex items-center">
                                            <input
                                                type="number"
                                                value={targetRadius}
                                                onChange={(e) => setTargetRadius(e.target.value)}
                                                className="w-full bg-black/50 border border-indigo-500/30 rounded-lg p-2.5 text-[15px] text-indigo-300 font-bold outline-none focus:border-indigo-400 text-center transition-all shadow-inner"
                                            />
                                            <span className="absolute right-2.5 text-indigo-600/50 font-black pointer-events-none text-[10px]">KM</span>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* 아코디언 컴포넌트: 장전된 필터 키워드 검증 */}
                        <div className="mt-4 pt-4 border-t border-slate-700/50">
                            <button
                                onClick={() => setIsAccordionOpen(!isAccordionOpen)}
                                className="w-full flex items-center justify-between p-2 rounded bg-indigo-950/30 hover:bg-indigo-900/40 transition-colors group"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-[12px] font-medium text-slate-300 group-hover:text-white transition-colors">
                                        현재 장전된 지역 목록 검증
                                    </span>
                                    <span className="bg-indigo-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]">
                                        {destKeywordsLimit.length}개
                                    </span>
                                </div>
                                <span className={`text-slate-400 text-sm transition-transform duration-300 ${isAccordionOpen ? 'rotate-180' : ''}`}>
                                    ▼
                                </span>
                            </button>

                            {isAccordionOpen && (
                                <div className="mt-2 p-3 bg-black/50 rounded-lg border border-indigo-500/20 max-h-48 overflow-y-auto custom-scrollbar">
                                    {filter.destinationGroups && Object.keys(filter.destinationGroups).length > 0 ? (
                                        <div className="flex flex-col gap-3">
                                            {Object.entries(filter.destinationGroups).map(([parentName, dongs]) => (
                                                <div key={parentName} className="flex flex-col gap-1">
                                                    <span className="text-[12px] font-bold text-indigo-300 border-b border-indigo-500/50 pb-1 mb-1">
                                                        {parentName} <span className="text-slate-500 text-[10px] font-normal">({dongs.length})</span>
                                                    </span>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {dongs.map(kw => (
                                                            <span key={kw} className="text-[11px] text-indigo-100 bg-indigo-900/40 hover:bg-indigo-700/60 transition-colors px-1.5 py-0.5 rounded border border-indigo-500/30 cursor-default">
                                                                {kw}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : destKeywordsLimit.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {destKeywordsLimit.map(kw => (
                                                <span key={kw} className="text-[11px] text-indigo-200 bg-indigo-900/40 px-1.5 py-0.5 rounded border border-indigo-500/30">
                                                    {kw}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-[11px] text-slate-500 text-center py-2">수집된 지역이 없습니다.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 블랙리스트 키워드 */}
                    <div className="group bg-[#150a0a]/50 backdrop-blur-md p-4 rounded-xl border border-red-900/30 shadow-lg hover:border-red-500/40 transition-colors">
                        <label className="text-[11px] font-black text-red-400/80 tracking-wider flex items-center gap-1.5 mb-2">
                            <span className="text-red-500">🚫</span> 블랙리스트
                        </label>
                        <textarea
                            value={blacklist}
                            onChange={(e) => setBlacklist(e.target.value)}
                            placeholder="단어 쉼표(,) 구분"
                            className="w-full h-12 bg-black/60 border border-red-900/50 rounded-lg p-2 text-xs text-red-300 font-medium outline-none focus:bg-red-950/20 focus:border-red-500/60 transition-all resize-none shadow-inner leading-relaxed"
                        />
                    </div>

                    {/* 저장 버튼 */}
                    <button
                        onClick={handleSave}
                        className="relative w-full h-14 mt-2 group overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 p-[1px] shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-all active:scale-[0.98] outline-none"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-teal-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="relative flex h-full w-full items-center justify-center bg-slate-950/20 backdrop-blur-md rounded-[11px]">
                            <span className="text-lg mr-1.5">💫</span>
                            <span className="text-[15px] font-black text-white tracking-widest drop-shadow-md">
                                즉시 동기화 적용
                            </span>
                        </div>
                    </button>
                    <p className="text-[9px] text-slate-500 text-center mb-2">저장된 값은 기사님의 의지로 간주되어 안전하게 보호됩니다.</p>
                </div>
            </div>
        </div>
    );
}

