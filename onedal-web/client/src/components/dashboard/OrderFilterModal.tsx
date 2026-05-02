import { useState, useEffect } from "react";
import { useFilterConfig } from "../../hooks/useFilterConfig";
import { logRoadmapEvent } from "../../lib/roadmapLogger";
import { VEHICLE_OPTIONS } from "@onedal/shared";
import { socket } from "../../lib/socket";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";

interface OrderFilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    hasHomeReturnActive?: boolean;
    isTestMode: boolean;
    setIsTestMode: (val: boolean) => void;
}

export default function OrderFilterModal({ isOpen, onClose, hasHomeReturnActive = false, isTestMode, setIsTestMode }: OrderFilterModalProps) {
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

    // 귀가콜 로딩 상태
    const [homeReturnLoading, setHomeReturnLoading] = useState(false);

    const [isPreviewLoading, setIsPreviewLoading] = useState(false);

    // 첫짐 섹션: 미리보기 버튼 클릭 시 호출
    const handlePreviewRegions = () => {
        if (!targetCity) return;
        setIsPreviewLoading(true);
        const radius = targetRadius || '0';
        fetch(`/api/settings/preview-regions?city=${encodeURIComponent(targetCity)}&destinationRadiusKm=${radius}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
        })
        .then(r => r.json())
        .then(data => {
            setPreviewRegions(data.groupedRegions || {});
            setPreviewCount(data.totalCount || 0);
            setIsAccordionOpen(true); // 미리보기 결과를 바로 보여줌
        })
        .catch(err => console.error("Preview fetch err:", err))
        .finally(() => setIsPreviewLoading(false));
    };

    // 합짐 섹션: 미리보기 버튼 클릭 시 호출
    const handlePreviewCorridor = () => {
        setIsPreviewLoading(true);
        const params = new URLSearchParams({ corridorRadiusKm: corridorRadius !== '' ? corridorRadius : '10' });
        if (targetRadius) params.set('destinationRadiusKm', targetRadius);
        fetch(`/api/settings/preview-corridor?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
        })
        .then(r => r.json())
        .then(data => {
            setPreviewRegions(data.groupedRegions || {});
            setPreviewCount(data.totalCount || 0);
            setIsAccordionOpen(true); // 미리보기 결과를 바로 보여줌
        })
        .catch(err => console.error("Corridor preview err:", err))
        .finally(() => setIsPreviewLoading(false));
    };

    // 모달이 열리는 순간에만 activeFilter 스냅샷으로 폼을 초기화
    useEffect(() => {
        if (isOpen && filter) {
            console.log("📥 [OrderFilterModal] 모달 열림 - 현재 activeFilter 스냅샷:", JSON.parse(JSON.stringify(filter)));
            setMinFare(filter.minFare?.toString() || "");
            setPickupRadius(filter.pickupRadiusKm?.toString() || "");
            setTargetCity(filter.destinationCity || "");
            setTargetRadius(filter.destinationRadiusKm?.toString() || "");
            setCorridorRadius(filter.corridorRadiusKm?.toString() || "");
            setBlacklist(filter.excludedKeywords ? filter.excludedKeywords.join(',') : "");
            setSelectedVehicles(filter.allowedVehicleTypes || []);
            // 프리뷰 상태 초기화
            setPreviewRegions(null);
            setPreviewCount(0);
        }
        setIsAccordionOpen(false);
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // 귀가콜 소켓 이벤트 리스너
    useEffect(() => {
        const onAck = () => {
            setHomeReturnLoading(false);
            onClose();
        };
        const onError = (data: { message: string }) => {
            setHomeReturnLoading(false);
            alert(data.message);
        };
        socket.on("home-return-ack", onAck);
        socket.on("home-return-error", onError);
        return () => {
            socket.off("home-return-ack", onAck);
            socket.off("home-return-error", onError);
        };
    }, [onClose]);

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

                    {/* 모드별 조건부 렌더링: 첫짐 또는 합짐 전용 섹션 */}
                    {!isSharedMode ? (
                        /* ── 첫짐(EMPTY) 모드 섹션 ── */
                        <div className="bg-slate-900/60 backdrop-blur-md p-3 rounded-xl border border-indigo-500/30 shadow-lg relative overflow-hidden">
                            <div className="flex gap-2 mb-2">
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
                            <Button
                                onClick={handlePreviewRegions}
                                disabled={isPreviewLoading}
                                size="sm"
                                className="w-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/30 h-8 text-xs font-bold"
                            >
                                {isPreviewLoading ? '연산 중...' : '🔍 지역 미리보기'}
                            </Button>
                        </div>
                    ) : (
                        /* ── 합짐(SHARED) 모드 섹션 ── */
                        <div className="bg-slate-900/60 backdrop-blur-md p-3 rounded-xl border border-amber-500/30 shadow-lg relative overflow-hidden">
                            <div className="flex items-center gap-3 mb-2">
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
                                <div className="flex-[0.3] space-y-1">
                                    <label className="block text-[10px] font-bold text-slate-400 text-center">도착 반경</label>
                                    <div className="relative">
                                        <Input
                                            type="number"
                                            value={targetRadius}
                                            onChange={(e) => setTargetRadius(e.target.value)}
                                            className="bg-black/50 border-amber-500/30 pr-8 text-amber-300 font-bold h-9 text-center"
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-500/50 font-black pointer-events-none text-[9px]">KM</span>
                                    </div>
                                </div>
                                <div className="flex-[0.3]">
                                    <p className="text-[9px] text-slate-400 leading-tight border-l-2 border-amber-500/30 pl-2 py-1">
                                        경로상 추가 콜 탐색을 허용할 최대 우회 반경
                                    </p>
                                </div>
                            </div>
                            <Button
                                onClick={handlePreviewCorridor}
                                disabled={isPreviewLoading}
                                size="sm"
                                className="w-full bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 h-8 text-xs font-bold"
                            >
                                {isPreviewLoading ? '연산 중...' : '🔍 회랑 지역 미리보기'}
                            </Button>
                        </div>
                    )}

                    {/* 독립 섹션: 현재 타겟팅 지역 목록 검증 (첫짐/합짐 공통) */}
                    <div className="bg-slate-900/60 backdrop-blur-md p-3 rounded-xl border border-slate-500/20 shadow-lg">
                        <button
                            onClick={() => setIsAccordionOpen(!isAccordionOpen)}
                            className="w-full flex items-center justify-between p-2 rounded-md bg-slate-800/50 hover:bg-slate-700/50 transition-colors group"
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] font-medium text-slate-300 group-hover:text-white transition-colors">
                                    {isSharedMode ? `🛣️ 회랑 타겟팅 지역 (±${corridorRadius !== '' ? corridorRadius : '?'}km)` : `📍 도착 타겟팅 지역 (${targetCity})`}
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

                    {/* 🧪 목업 시뮬레이터 토글 */}
                    <div className="flex items-center justify-between px-1 py-2 border-t border-slate-700/40">
                        <span className="text-[11px] text-slate-400 font-semibold tracking-wide">🧪 목업 시뮬레이터 (테스트 GPS)</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={isTestMode}
                                onChange={(e) => setIsTestMode(e.target.checked)}
                            />
                            <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
                        </label>
                    </div>

                    {/* 사냥 모드 통제 버튼 영역 (1열 4버튼 구조) */}
                    <div className="pt-2">
                        <div className="grid grid-cols-4 gap-1.5">
                            {/* 메인 액션: 현재 조건으로 사냥 (기존 적용 버튼) */}
                            <Button
                                onClick={handleSave}
                                className="h-11 relative group overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-white font-black text-[11px] shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all px-1"
                            >
                                <span className="relative z-10 drop-shadow-md tracking-wider">🟢 필터 갱신</span>
                                <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-teal-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            </Button>

                            {/* 강제 출발 */}
                            <Button
                                onClick={() => {
                                    logRoadmapEvent("웹", `출발 버튼 클릭 → LOADING→DRIVING 전환 (시뮬레이션: ${isTestMode})`);
                                    updateFilter({ loadState: 'DRIVING', corridorRadiusKm: 0 });
                                    onClose();
                                }}
                                className="h-11 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-black text-[11px] shadow-[0_0_15px_rgba(99,102,241,0.2)] hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all px-1"
                            >
                                🚀 출발
                            </Button>

                            {/* 귀가콜 시작 */}
                            <Button
                                onClick={() => {
                                    logRoadmapEvent("웹", "귀가콜 시작 버튼 클릭 (필터 선반영)");
                                    setHomeReturnLoading(true);
                                    
                                    // 1. 현재 모달에 있는 우회 반경과 도착 반경을 수집
                                    const parsedCorridor = corridorRadius.trim() === "" ? 10 : parseFloat(corridorRadius);
                                    const parsedTarget = targetRadius.trim() === "" ? 0 : parseFloat(targetRadius);
                                    
                                    // 2. 서버에 로컬 상태를 선 반영 (updateFilter와 유사한 저장 플로우)
                                    handleSave(); 

                                    // 3. 우회/도착 반경을 직접 파라미터로 넘기며 귀가콜 트리거
                                    socket.emit("create-home-return", {
                                        corridorRadiusKm: parsedCorridor,
                                        destinationRadiusKm: parsedTarget
                                    });
                                }}
                                disabled={homeReturnLoading || hasHomeReturnActive}
                                className={`h-11 rounded-xl bg-gradient-to-r from-violet-500 to-purple-400 text-white font-black text-[11px] shadow-[0_0_15px_rgba(139,92,246,0.2)] hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] transition-all px-1 ${homeReturnLoading || hasHomeReturnActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {homeReturnLoading ? '⏳ 계산중' : hasHomeReturnActive ? '🏠 진행중' : '🏠 귀가'}
                            </Button>

                            {/* 투-트랙 사냥: 집 방향 콜 + 현지 잔잔바리 동시 스캔 */}
                            <Button
                                onClick={() => {
                                    logRoadmapEvent("웹", "투-트랙 사냥 버튼 클릭 → 집 + 현재 지역 동시 스캔 모드 전환");
                                    socket.emit("start-two-track");
                                    onClose();
                                }}
                                className="h-11 rounded-xl bg-gradient-to-r from-amber-500 to-orange-400 text-white font-black text-[11px] shadow-[0_0_15px_rgba(245,158,11,0.2)] hover:shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-all px-1"
                            >
                                🎯 투-트랙
                            </Button>
                        </div>

                        <p className="text-[10px] text-slate-500 text-center mt-2">이 값은 현재 진행 중인 콜 탐색에만 적용됩니다. 영구 설정은 톱니바퀴(⚙️)에서 변경하세요.</p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
