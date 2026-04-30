import { useState, useEffect } from "react";
import { useFilterConfig } from "../../hooks/useFilterConfig";
import { logRoadmapEvent } from "../../lib/roadmapLogger";
import { VEHICLE_OPTIONS } from "@onedal/shared";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";

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

    // 합짐 모드: 회랑 반경 또는 도착 반경 변경 시 회랑 지역 프리뷰
    useEffect(() => {
        if (!filter?.isSharedMode || !isOpen) return;
        const currentCorridor = filter?.corridorRadiusKm?.toString() || "";
        const currentTargetR = filter?.destinationRadiusKm?.toString() || "";
        if (corridorRadius && (corridorRadius !== currentCorridor || targetRadius !== currentTargetR)) {
            const timer = setTimeout(() => {
                const params = new URLSearchParams({ corridorRadiusKm: corridorRadius });
                if (targetRadius) params.set('destinationRadiusKm', targetRadius);
                fetch(`/api/settings/preview-corridor?${params.toString()}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
                })
                .then(r => r.json())
                .then(data => {
                    setPreviewRegions(data.groupedRegions || {});
                    setPreviewCount(data.totalCount || 0);
                })
                .catch(err => console.error("Corridor preview err:", err));
            }, 400);
            return () => clearTimeout(timer);
        } else if (filter?.isSharedMode) {
            setPreviewRegions(null);
            setPreviewCount(0);
        }
    }, [corridorRadius, targetRadius, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // 모달이 열리는 순간에만 activeFilter 스냅샷으로 폼을 초기화
    // filter 의존성을 제거하여, 모달이 열린 동안 서버 업데이트에 의해 폼이 리셋되는 것을 방지
    useEffect(() => {
        if (isOpen && filter) {
            console.log("📥 [OrderFilterModal] 모달 열림 - 현재 activeFilter 스냅샷:", JSON.parse(JSON.stringify(filter)));
            setMinFare(filter.minFare?.toString() || "");
            setPickupRadius(filter.pickupRadiusKm?.toString() || "");
            setTargetCity(filter.destinationCity || "");
            setTargetRadius(filter.destinationRadiusKm?.toString() || "");
            setCorridorRadius(filter.corridorRadiusKm?.toString() || "");
            setBlacklist(filter.excludedKeywords ? filter.excludedKeywords.join(',') : "");
            // 서버가 계산한 activeFilter.allowedVehicleTypes를 있는 그대로 신뢰 (프론트에서 가공하지 않음)
            setSelectedVehicles(filter.allowedVehicleTypes || []);
        }
        setIsAccordionOpen(false);
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!isOpen) return null;

    if (!filter) {
        return (
            <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
                <DialogContent className="sm:max-w-md bg-transparent border-none shadow-none flex justify-center">
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-8 h-8 border-4 border-info border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-info font-bold animate-pulse">동기화 대기 중...</span>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    const handleSave = () => {
        logRoadmapEvent("웹", "설정 모달창 열고 새 필터값 입력 후 '저장' 버튼 클릭");

        const newFilterToSave = {
            allowedVehicleTypes: selectedVehicles,
            minFare: minFare ? parseInt(minFare, 10) : filter.minFare,
            pickupRadiusKm: pickupRadius ? parseInt(pickupRadius, 10) : filter.pickupRadiusKm,
            destinationCity: targetCity || filter.destinationCity,
            destinationRadiusKm: targetRadius ? parseInt(targetRadius, 10) : filter.destinationRadiusKm,
            corridorRadiusKm: corridorRadius ? parseInt(corridorRadius, 10) : filter.corridorRadiusKm,
            excludedKeywords: blacklist ? blacklist.split(',').map(s => s.trim()).filter(Boolean) : filter.excludedKeywords,
            userOverrides: true // 기사가 수동 개입했음을 마킹
        };

        console.log("📤 [OrderFilterModal] '즉시 동기화 적용' 클릭 - 서버로 전송되는 새 필터값:", JSON.parse(JSON.stringify(newFilterToSave)));

        updateFilter(newFilterToSave);
        onClose();
    };

    const isSharedMode = filter.isSharedMode;
    const destKeywordsLimit = filter.destinationKeywords || [];

    const handleBlacklistChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-lg bg-[#070b14] border-slate-700/50 shadow-2xl p-4 overflow-hidden flex flex-col gap-3">
                <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-blue-500/10 blur-[100px] rounded-full pointer-events-none" />
                <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none" />

                <DialogHeader className="border-b border-blue-500/20 pb-2 relative z-10 flex flex-row items-center justify-between">
                    <DialogTitle className="flex flex-col gap-1">
                        {/* <span className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 tracking-tight">
                            통제 필터 설정
                        </span> */}
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className={isSharedMode ? 'bg-amber-500/20 text-amber-500 border-amber-500/30' : 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30'}>
                                {isSharedMode ? '합짐(Loaded) 모드' : '첫짐(Empty) 모드'}
                            </Badge>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-3 overflow-y-auto pr-1 pb-1 custom-scrollbar relative z-10">
                    <div>
                        {/* 차종 멀티셀렉터 */}
                        <div className="mb-3">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <label className="text-xs font-bold text-slate-400">허용 차종</label>
                                <span className="text-[10px] text-slate-500 ml-auto font-mono">
                                    {selectedVehicles.length === 0 ? '전체 허용' : `${selectedVehicles.length}개 선택`}
                                </span>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                                {VEHICLE_OPTIONS.map((v) => {
                                    const isSelected = selectedVehicles.includes(v);
                                    return (
                                        <Button
                                            key={v}
                                            type="button"
                                            variant={isSelected ? "default" : "outline"}
                                            onClick={() => {
                                                setSelectedVehicles(prev =>
                                                    prev.includes(v)
                                                        ? prev.filter(x => x !== v)
                                                        : [...prev, v]
                                                );
                                            }}
                                            className={`h-9 font-black tracking-tight transition-all ${isSelected
                                                ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400 hover:bg-emerald-500/30 shadow-lg'
                                                : 'bg-black/40 border-slate-700/40 text-slate-500 hover:text-slate-300'
                                                }`}
                                        >
                                            {v}
                                        </Button>
                                    );
                                })}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-2 text-center bg-muted/50 p-1.5 rounded-md">
                                💡 합짐(LOADING) 상태 진입 시, 1t 등 상위 차종은 자동으로 제외 처리됩니다.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 flex items-center gap-1">하한가</label>
                                <div className="relative">
                                    <Input
                                        type="number"
                                        value={minFare}
                                        onChange={(e) => setMinFare(e.target.value)}
                                        className="bg-black/60 border-slate-700/50 pr-8 text-emerald-400 font-black font-mono shadow-inner h-10"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-emerald-500/70 font-bold pointer-events-none">원</span>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-red-400/80 flex items-center gap-1">
                                    <span className="text-red-500 text-[10px]">🚫</span> 제외 키워드
                                </label>
                                <Input
                                    type="text"
                                    value={blacklist}
                                    onChange={handleBlacklistChange}
                                    placeholder="단어 쉼표(,) 구분"
                                    className="bg-black/60 border-red-900/50 text-red-300 font-medium focus-visible:ring-red-500/50 shadow-inner h-10"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-900/60 backdrop-blur-md p-3 rounded-xl border border-indigo-500/30 shadow-lg relative overflow-hidden">
                        <div className="flex gap-2 mb-3">
                            <div className="flex-[0.4] space-y-1">
                                <label className="block text-[10px] font-bold text-slate-400 pl-1">도착 희망 시/도</label>
                                <select
                                    value={targetCity}
                                    onChange={(e) => setTargetCity(e.target.value)}
                                    className="w-full h-9 bg-black/50 border border-slate-600/40 rounded-md px-2 text-[13px] text-indigo-300 font-bold outline-none focus:border-indigo-400 shadow-inner appearance-none"
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
                            <div className="flex-[0.3] space-y-1">
                                <label className="block text-[10px] font-bold text-slate-400 pl-1">상차 반경</label>
                                <div className="relative">
                                    <Input
                                        type="number"
                                        value={pickupRadius}
                                        onChange={(e) => setPickupRadius(e.target.value)}
                                        className="bg-black/50 border-slate-600/40 pr-8 text-white font-bold h-9 text-center"
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 font-black pointer-events-none text-[9px]">KM</span>
                                </div>
                            </div>
                            <div className="flex-[0.3] space-y-1">
                                <label className="block text-[10px] font-bold text-slate-400 pl-1">도착 반경</label>
                                <div className="relative">
                                    <Input
                                        type="number"
                                        value={targetRadius}
                                        onChange={(e) => setTargetRadius(e.target.value)}
                                        className="bg-black/50 border-slate-600/40 pr-8 text-indigo-300 font-bold h-9 text-center"
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-indigo-600/70 font-black pointer-events-none text-[9px]">KM</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-900/60 backdrop-blur-md p-3 rounded-xl border border-amber-500/30 shadow-lg relative overflow-hidden">
                        <div className="flex items-center gap-3">
                            <div className="flex-[0.4] space-y-1">
                                <label className="block text-[10px] font-bold text-slate-400 text-center">우회 탐색 허용 반경</label>
                                <div className="relative">
                                    <Input
                                        type="number"
                                        value={corridorRadius}
                                        onChange={(e) => setCorridorRadius(e.target.value)}
                                        className="bg-black/50 border-amber-500/30 text-amber-500 font-bold h-9 text-center shadow-inner"
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-500/50 font-black pointer-events-none text-[10px]">KM</span>
                                </div>
                            </div>
                            <div className="flex-[0.6]">
                                <p className="text-[10px] text-slate-400 leading-tight border-l-2 border-amber-500/30 pl-3 py-1">
                                    첫 짐을 잡은 후 <span className="text-amber-500 font-bold">적재하러 가는 길</span>에 추가 콜 탐색을 허용할 최대 우회(회랑) 반경입니다.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* 독립 섹션: 현재 타겟팅 지역 목록 검증 (첫짐/합짐 공통) */}
                    <div className="bg-slate-900/60 backdrop-blur-md p-3 rounded-xl border border-slate-500/20 shadow-lg">
                        <button
                            onClick={() => setIsAccordionOpen(!isAccordionOpen)}
                            className="w-full flex items-center justify-between p-2 rounded-md bg-slate-800/50 hover:bg-slate-700/50 transition-colors group"
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] font-medium text-slate-300 group-hover:text-white transition-colors">
                                    {isSharedMode ? `🛣️ 회랑 타겟팅 지역 (±${corridorRadius || '?'}km)` : `📍 도착 타겟팅 지역 (${targetCity})`}
                                </span>
                                {previewRegions && previewCount > 0 ? (
                                    <Badge variant="secondary" className="bg-amber-500/80 text-white shadow-[0_0_10px_rgba(245,158,11,0.5)]">
                                        변경 예정 ({previewCount}개)
                                    </Badge>
                                ) : (
                                    <Badge className={isSharedMode ? 'bg-purple-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 'bg-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.5)]'}>
                                        {destKeywordsLimit.length}개
                                    </Badge>
                                )}
                            </div>
                            <span className={`text-slate-400 text-sm transition-transform duration-300 ${isAccordionOpen ? 'rotate-180' : ''}`}>
                                ▼
                            </span>
                        </button>

                        {isAccordionOpen && (
                            <div className="mt-2 p-2 bg-black/50 rounded-lg border border-slate-500/20 max-h-32 overflow-y-auto custom-scrollbar">
                                {previewRegions && Object.keys(previewRegions).length > 0 ? (
                                    <div className="flex flex-col gap-3">
                                        {Object.entries(previewRegions).map(([parentName, dongs]) => (
                                            <div key={parentName} className="flex flex-col gap-1 opacity-90">
                                                <span className="text-xs font-bold text-amber-400 border-b border-amber-500/50 pb-1 flex items-center justify-between">
                                                    <span>{parentName} <span className="text-amber-500/70 text-[10px] font-normal">({dongs.length})</span></span>
                                                    <Badge variant="outline" className="text-[9px] bg-amber-500/20 border-amber-500/30">미리보기</Badge>
                                                </span>
                                                <div className="flex flex-wrap gap-1">
                                                    {dongs.map(kw => (
                                                        <span key={kw} className="text-[10px] text-amber-100 bg-amber-900/40 px-1.5 py-0.5 rounded border border-amber-500/30">
                                                            {kw}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : filter.destinationGroups && Object.keys(filter.destinationGroups).length > 0 ? (
                                    <div className="flex flex-col gap-3">
                                        {Object.entries(filter.destinationGroups).map(([parentName, dongs]) => (
                                            <div key={parentName} className="flex flex-col gap-1">
                                                <span className={`text-xs font-bold border-b pb-1 ${isSharedMode ? 'text-purple-300 border-purple-500/50' : 'text-indigo-300 border-indigo-500/50'}`}>
                                                    {parentName} <span className="text-slate-500 text-[10px] font-normal">({dongs.length})</span>
                                                </span>
                                                <div className="flex flex-wrap gap-1">
                                                    {dongs.map(kw => (
                                                        <span key={kw} className={`text-[10px] px-1.5 py-0.5 rounded border ${isSharedMode ? 'text-purple-100 bg-purple-900/40 border-purple-500/30' : 'text-indigo-100 bg-indigo-900/40 border-indigo-500/30'}`}>
                                                            {kw}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : destKeywordsLimit.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                        {destKeywordsLimit.map(kw => (
                                            <span key={kw} className={`text-[10px] px-1.5 py-0.5 rounded border ${isSharedMode ? 'text-purple-200 bg-purple-900/40 border-purple-500/30' : 'text-indigo-200 bg-indigo-900/40 border-indigo-500/30'}`}>
                                                {kw}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-500 text-center py-2">수집된 지역이 없습니다.</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 저장 버튼 */}
                    <div className="pt-2">
                        <Button
                            onClick={handleSave}
                            className="w-full h-12 relative group overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-white font-black text-[15px] shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-all"
                        >
                            <span className="relative z-10 drop-shadow-md tracking-widest">적용</span>
                            <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-teal-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </Button>
                        <p className="text-[10px] text-slate-500 text-center mt-2">이 값은 현재 진행 중인 콜 탐색에만 적용됩니다. 영구 설정은 톱니바퀴(⚙️)에서 변경하세요.</p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
