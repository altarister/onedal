import { useState, useEffect } from "react";
import { useFilterConfig } from "../../hooks/useFilterConfig";
import { logRoadmapEvent } from "../../lib/roadmapLogger";

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

    // [신규] 지역 미리보기용 상태
    const [previewRegions, setPreviewRegions] = useState<Record<string, string[]> | null>(null);
    const [previewCount, setPreviewCount] = useState<number>(0);

    // 지역이 변경될 때마다 디바운스 처리 후 미리보기 API 호출
    useEffect(() => {
        const currentCity = filter?.destinationCity || "";
        if (targetCity && targetCity !== currentCity) {
            const timer = setTimeout(() => {
                fetch(`/api/settings/preview-regions?city=${encodeURIComponent(targetCity)}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
                })
                .then(r => r.json())
                .then(data => {
                    if (data.groupedRegions) {
                        setPreviewRegions(data.groupedRegions);
                        setPreviewCount(data.totalCount);
                    }
                })
                .catch(err => console.error("Preview fetch err:", err));
            }, 400); // 400ms 디바운스
            return () => clearTimeout(timer);
        } else {
            setPreviewRegions(null);
            setPreviewCount(0);
        }
    }, [targetCity, filter?.destinationCity]);

    const VEHICLE_OPTIONS = ['1t', '다마스', '라보', '오토바이'] as const;

    useEffect(() => {
        if (isOpen && filter) {
            setMinFare(filter.minFare?.toString() || "");
            setPickupRadius(filter.pickupRadiusKm?.toString() || "");
            setTargetCity(filter.destinationCity || "");
            setTargetRadius(filter.destinationRadiusKm?.toString() || "");
            setCorridorRadius(filter.corridorRadiusKm?.toString() || "10");
            setBlacklist(filter.excludedKeywords ? filter.excludedKeywords.join(',') : "");

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
                    <div className="w-8 h-8 border-4 border-info border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-info font-bold animate-pulse">동기화 대기 중...</span>
                </div>
            </div>
        );
    }

    const handleSave = () => {
        logRoadmapEvent("웹", "설정 모달창 열고 새 필터값 입력 후 '저장' 버튼 클릭");
        updateFilter({
            allowedVehicleTypes: selectedVehicles,
            minFare: minFare ? parseInt(minFare, 10) : filter.minFare,
            pickupRadiusKm: pickupRadius ? parseInt(pickupRadius, 10) : filter.pickupRadiusKm,
            destinationCity: targetCity || filter.destinationCity,
            destinationRadiusKm: targetRadius ? parseInt(targetRadius, 10) : filter.destinationRadiusKm,
            corridorRadiusKm: corridorRadius ? parseInt(corridorRadius, 10) : filter.corridorRadiusKm,
            excludedKeywords: blacklist ? blacklist.split(',').map(s => s.trim()).filter(Boolean) : filter.excludedKeywords,
            userOverrides: true // 기사가 수동 개입했음을 마킹
        });
        onClose();
    };

    const isSharedMode = filter.isSharedMode;
    const destKeywordsLimit = filter.destinationKeywords || [];

    const handleBlacklistChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        let val = e.target.value;
        // 다중 엔터 방지 (줄바꿈을 콤마로 치환)
        val = val.replace(/[\r\n]+/g, ',');
        // 허용되지 않은 특수문자 제거 (한글, 영문, 숫자, 공백, 콤마만 허용)
        val = val.replace(/[^a-zA-Z0-9가-힣\s,]/g, '');
        // 콤마 다중 연타 방지
        val = val.replace(/,+/g, ',');
        setBlacklist(val);
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-lg relative bg-[#070b14] border border-slate-700/50 rounded-2xl shadow-2xl p-5 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-info/20 blur-[100px] rounded-full pointer-events-none" />
                <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-success/20 blur-[100px] rounded-full pointer-events-none" />

                {/* 헤더 바 */}
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-info/20 relative z-10">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex border items-center justify-center rounded-full bg-slate-900/80 border-slate-700/50 text-slate-400 hover:text-white hover:border-info hover:bg-info/20 transition-all shadow-lg active:scale-90"
                        >
                            ✕
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-info to-success tracking-tight">
                                통제 필터 설정
                            </h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${isSharedMode ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'}`}>
                                    {isSharedMode ? '합짐(Loaded) 모드' : '첫짐(Empty) 모드'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-4 overflow-y-auto pr-1 pb-2 custom-scrollbar relative z-10">
                    {/* ==========================================
                        섹션 1. 공통 기본 설정
                    ========================================== */}
                    <div className="bg-slate-900/40 backdrop-blur-md p-4 rounded-xl border border-slate-800/60 shadow-lg">
                        <div className="flex items-center gap-1.5 mb-4 pb-2 border-b border-slate-700/50">
                            <span className="text-sm">⚙️</span>
                            <h2 className="text-[12px] font-black text-white tracking-widest">공통 기본 설정</h2>
                        </div>

                        {/* 차종 멀티셀렉터 */}
                        <div className="mb-4">
                            <div className="flex items-center gap-1.5 mb-2">
                                <label className="text-[11px] font-bold text-slate-400">허용 차종</label>
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
                                                ? 'bg-success/20 border-success/60 text-success shadow-lg'
                                                : 'bg-black/40 border-slate-700/40 text-slate-500 hover:border-slate-600 hover:text-slate-400'
                                                }`}
                                        >
                                            {v}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-2 text-center bg-black/30 p-1.5 rounded">
                                💡 합짐(LOADING) 상태 진입 시, 1t 등 상위 차종은 자동으로 제외 처리됩니다.
                            </p>
                        </div>

                        {/* 하한가 & 블랙리스트 */}
                        <div className="flex gap-3">
                            <div className="flex-[0.4]">
                                <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1 mb-1.5">
                                    <span className="text-success">💵</span> 하한가
                                </label>
                                <div className="relative flex items-center">
                                    <input
                                        type="number"
                                        value={minFare}
                                        onChange={(e) => setMinFare(e.target.value)}
                                        className="w-full bg-black/60 border border-slate-700/50 rounded-lg p-2.5 pr-8 text-[15px] text-success font-black outline-none focus:border-success/60 transition-all font-mono shadow-inner"
                                    />
                                    <span className="absolute right-2.5 text-[10px] text-success/70 font-bold pointer-events-none">원</span>
                                </div>
                            </div>
                            <div className="flex-[0.6]">
                                <label className="text-[11px] font-bold text-red-400/80 flex items-center gap-1 mb-1.5">
                                    <span className="text-red-500">🚫</span> 제외 키워드
                                </label>
                                <input
                                    type="text"
                                    value={blacklist}
                                    onChange={(e) => handleBlacklistChange(e as any)}
                                    placeholder="단어 쉼표(,) 구분"
                                    className="w-full bg-black/60 border border-red-900/50 rounded-lg p-2.5 text-xs text-red-300 font-medium outline-none focus:border-red-500/60 transition-all shadow-inner"
                                />
                            </div>
                        </div>
                    </div>

                    {/* ==========================================
                        섹션 2. 첫짐(단독) 탐색 설정
                    ========================================== */}
                    <div className="bg-gradient-to-br from-slate-900/60 to-[#0e1424]/80 backdrop-blur-md p-4 rounded-xl border border-indigo-500/30 shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl pointer-events-none"></div>
                        <div className="flex items-center gap-1.5 mb-3 pb-2 border-b border-indigo-500/30">
                            <span className="text-sm">🎯</span>
                            <h2 className="text-[12px] font-black text-indigo-200 tracking-widest">첫짐(단독) 탐색 설정</h2>
                        </div>

                        <div className="flex gap-3 mb-3">
                            <div className="flex-[0.4]">
                                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 pl-1">도착 희망 시/도</label>
                                <select
                                    value={targetCity}
                                    onChange={(e) => setTargetCity(e.target.value)}
                                    className="w-full bg-black/50 border border-slate-600/40 rounded-lg p-2.5 text-[14px] text-indigo-300 font-bold outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/50 transition-all shadow-inner appearance-none"
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
                            <div className="flex-[0.3]">
                                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 pl-1">상차 반경</label>
                                <div className="relative flex items-center">
                                    <input
                                        type="number"
                                        value={pickupRadius}
                                        onChange={(e) => setPickupRadius(e.target.value)}
                                        className="w-full bg-black/50 border border-slate-600/40 rounded-lg p-2.5 pr-8 text-[14px] text-white font-bold outline-none focus:border-indigo-400 transition-all shadow-inner text-center"
                                    />
                                    <span className="absolute right-2 text-slate-500 font-black pointer-events-none text-[9px]">KM</span>
                                </div>
                            </div>
                            <div className="flex-[0.3]">
                                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 pl-1">도착 반경</label>
                                <div className="relative flex items-center">
                                    <input
                                        type="number"
                                        value={targetRadius}
                                        onChange={(e) => setTargetRadius(e.target.value)}
                                        className="w-full bg-black/50 border border-slate-600/40 rounded-lg p-2.5 pr-8 text-[14px] text-indigo-300 font-bold outline-none focus:border-indigo-400 transition-all shadow-inner text-center"
                                    />
                                    <span className="absolute right-2 text-indigo-600/70 font-black pointer-events-none text-[9px]">KM</span>
                                </div>
                            </div>
                        </div>

                        {/* 아코디언 컴포넌트: 장전된 필터 키워드 검증 */}
                        <div className="mt-2 pt-2 border-t border-indigo-500/20">
                            <button
                                onClick={() => setIsAccordionOpen(!isAccordionOpen)}
                                className="w-full flex items-center justify-between p-2 rounded bg-indigo-950/30 hover:bg-indigo-900/40 transition-colors group"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-medium text-slate-300 group-hover:text-white transition-colors">
                                        현재 장전된 지역 목록 검증
                                    </span>
                                    {targetCity !== (filter.destinationCity || "") ? (
                                        <span className="bg-amber-500/80 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)] transition-all">
                                            변경 예정 {previewCount > 0 ? `(${previewCount}개)` : '...'}
                                        </span>
                                    ) : (
                                        <span className="bg-indigo-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]">
                                            {destKeywordsLimit.length}개
                                        </span>
                                    )}
                                </div>
                                <span className={`text-slate-400 text-sm transition-transform duration-300 ${isAccordionOpen ? 'rotate-180' : ''}`}>
                                    ▼
                                </span>
                            </button>

                            {isAccordionOpen && (
                                <div className="mt-2 p-3 bg-black/50 rounded-lg border border-indigo-500/20 max-h-40 overflow-y-auto custom-scrollbar">
                                    {targetCity !== (filter.destinationCity || "") ? (
                                        previewRegions && Object.keys(previewRegions).length > 0 ? (
                                            <div className="flex flex-col gap-3">
                                                {Object.entries(previewRegions).map(([parentName, dongs]) => (
                                                    <div key={parentName} className="flex flex-col gap-1 opacity-90">
                                                        <span className="text-[12px] font-bold text-amber-400 border-b border-amber-500/50 pb-1 mb-1 flex items-center justify-between">
                                                            <span>{parentName} <span className="text-amber-500/70 text-[10px] font-normal">({dongs.length})</span></span>
                                                            <span className="text-[9px] bg-amber-500/20 px-1.5 py-0.5 rounded-sm">미리보기</span>
                                                        </span>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {dongs.map(kw => (
                                                                <span key={kw} className="text-[11px] text-amber-100 bg-amber-900/40 px-1.5 py-0.5 rounded border border-amber-500/30">
                                                                    {kw}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                                <button onClick={handleSave} className="mt-2 w-full py-2 bg-amber-500/20 text-amber-300 text-xs font-bold rounded-lg border border-amber-500/50 hover:bg-amber-500/40 transition-colors cursor-pointer">
                                                    이 설정으로 즉시 적용하기
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-6 text-center">
                                                <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                                                <span className="text-amber-400 text-xs font-bold mb-1">'{targetCity}' 지역을 불러오는 중...</span>
                                            </div>
                                        )
                                    ) : filter.destinationGroups && Object.keys(filter.destinationGroups).length > 0 ? (
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

                    {/* ==========================================
                        섹션 3. 합짐(가는길) 탐색 설정
                    ========================================== */}
                    <div className="bg-gradient-to-br from-slate-900/60 to-[#0e1424]/80 backdrop-blur-md p-4 rounded-xl border border-warning/30 shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-warning/10 rounded-full blur-xl pointer-events-none"></div>
                        <div className="flex items-center gap-1.5 mb-3 pb-2 border-b border-warning/30">
                            <span className="text-sm">🛣️</span>
                            <h2 className="text-[12px] font-black text-warning tracking-widest">합짐(회랑) 탐색 설정</h2>
                        </div>
                        
                        <div className="flex items-end gap-3">
                            <div className="flex-[0.4]">
                                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 pl-1 text-center">적재 중 추가 탐색 허용 반경</label>
                                <div className="relative flex items-center">
                                    <input
                                        type="number"
                                        value={corridorRadius}
                                        onChange={(e) => setCorridorRadius(e.target.value)}
                                        className="w-full bg-black/50 border border-warning/30 rounded-lg p-2.5 text-[15px] text-warning font-bold outline-none focus:border-warning/60 transition-all shadow-inner text-center"
                                    />
                                    <span className="absolute right-2.5 text-warning/50 font-black pointer-events-none text-[10px]">KM</span>
                                </div>
                            </div>
                            <div className="flex-[0.6] pb-1">
                                <p className="text-[10px] text-slate-500 leading-tight border-l-2 border-warning/30 pl-2">
                                    첫 짐을 잡은 후 <span className="text-warning font-bold">적재하러 가는 길</span>에 추가 콜 탐색을 허용할 최대 우회(회랑) 반경입니다.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* 저장 버튼 */}
                    <button
                        onClick={handleSave}
                        className="relative w-full h-14 mt-2 group overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 p-[1px] shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-all active:scale-[0.98] outline-none flex-shrink-0"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-teal-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="relative flex h-full w-full items-center justify-center bg-slate-950/20 backdrop-blur-md rounded-[11px]">
                            <span className="text-lg mr-1.5">💫</span>
                            <span className="text-[15px] font-black text-white tracking-widest drop-shadow-md">
                                즉시 동기화 적용
                            </span>
                        </div>
                    </button>
                    <p className="text-[9px] text-slate-500 text-center flex-shrink-0">저장된 값은 한 번만 설정하면 첫짐/합짐 상황에 맞춰 자동으로 100% 반영됩니다.</p>
                </div>
            </div>
        </div>
    );
}

