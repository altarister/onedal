import { useState, useEffect } from "react";
import { useFilterConfig } from "../../hooks/useFilterConfig";
import { logRoadmapEvent } from "../../lib/roadmapLogger";
import { VEHICLE_OPTIONS, NET_RATE_PER_KM, VEHICLE_SLOTS, TRUCK_CAPACITY_SLOTS } from "@onedal/shared";
import { socket } from "../../lib/socket";
import { apiClient } from "../../api/apiClient";
import { useCityOptions, resolveCity } from "../../lib/cityOptions";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";

/**
 * 눈높이 단계 — 시세 대비 허용 할인 %.
 * "전부"(100)는 금액 무관 통과. 합짐·관내·복귀는 순증 매출이라 여기까지 내려간다.
 */
const EYELINE_STEPS = [
    { value: 0,   label: '시세' },
    { value: 10,  label: '-10%' },
    { value: 20,  label: '-20%' },
    { value: 30,  label: '-30%' },
    { value: 100, label: '전부' },
] as const;

/** 하한표에 보여줄 차종 — 내 차(1t)로 수행 가능한 등급만, 칸이 작은 순 */
const RATE_TABLE_ORDER = ['오토바이', '다마스', '승용차', '라보', '1t'];

interface OrderFilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    hasHomeReturnActive?: boolean;
    isTestMode: boolean;
    setIsTestMode: (val: boolean) => void;
}

export default function OrderFilterModal({ isOpen, onClose, hasHomeReturnActive = false, isTestMode, setIsTestMode }: OrderFilterModalProps) {
    const { filter, baseFilter, updateFilter } = useFilterConfig();

    // 이 페이지는 폼 역할이므로 로컬 state로 관리 후 저장 시 소켓 발송
    const [eyeline, setEyeline] = useState<number>(10);   // 눈높이(%) — 하한가 입력을 대체
    const [pickupRadius, setPickupRadius] = useState<string>("");
    const [targetCity, setTargetCity] = useState<string>("");
    const [targetRadius, setTargetRadius] = useState<string>("");
    const [corridorRadius, setCorridorRadius] = useState<string>("");
    const [blacklist, setBlacklist] = useState<string>("");
    const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);

    /**
     * 고를 수 있는 시/군 목록 — 지도 데이터에서 받는다.
     * 예전에는 여기에 7개를 손으로 적어 뒀고, 저장값 `파주` 가 그 중 무엇과도 안 맞아
     * 브라우저가 첫 항목 `용인시` 를 그렸다. 화면이 필터를 잘못 말한 것이다.
     */
    const cityGroups = useCityOptions();
    const knownCities = cityGroups.flatMap(g => g.cities);
    /** 목록에 없는 저장값(옛 `파주`)을 정식 이름으로 끌어올린다 — 못 찾으면 건드리지 않는다 */
    useEffect(() => {
        if (!targetCity || !cityGroups.length) return;
        if (knownCities.includes(targetCity)) return;
        const resolved = resolveCity(targetCity, cityGroups);
        if (resolved) setTargetCity(resolved);
    }, [cityGroups, targetCity]);

    // 배열 확인용 아코디언 상태
    const [isAccordionOpen, setIsAccordionOpen] = useState(false);

    // [신규] 지역 미리보기용 상태
    const [previewRegions, setPreviewRegions] = useState<Record<string, string[]> | null>(null);
    const [previewCount, setPreviewCount] = useState<number>(0);

    // 귀가콜 로딩 상태
    const [homeReturnLoading, setHomeReturnLoading] = useState(false);

    const [isPreviewLoading, setIsPreviewLoading] = useState(false);

    // 첫짐 섹션: 미리보기 버튼 클릭 시 호출
    const handlePreviewRegions = async () => {
        if (!targetCity) return;
        setIsPreviewLoading(true);
        const radius = targetRadius || '0';
        try {
            const { data } = await apiClient.get(`/settings/preview-regions?city=${encodeURIComponent(targetCity)}&destinationRadiusKm=${radius}`);
            setPreviewRegions(data.groupedRegions || {});
            setPreviewCount(data.totalCount || 0);
            setIsAccordionOpen(true);
        } catch (err) {
            console.error("Preview fetch err:", err);
        } finally {
            setIsPreviewLoading(false);
        }
    };

    // 합짐 섹션: 미리보기 버튼 클릭 시 호출
    const handlePreviewCorridor = async () => {
        setIsPreviewLoading(true);
        const params = new URLSearchParams({ corridorRadiusKm: corridorRadius !== '' ? corridorRadius : '10' });
        if (targetRadius) params.set('destinationRadiusKm', targetRadius);
        try {
            const { data } = await apiClient.get(`/settings/preview-corridor?${params.toString()}`);
            setPreviewRegions(data.groupedRegions || {});
            setPreviewCount(data.totalCount || 0);
            setIsAccordionOpen(true);
        } catch (err) {
            console.error("Corridor preview err:", err);
        } finally {
            setIsPreviewLoading(false);
        }
    };

    // 모달이 열리는 순간에만 activeFilter 스냅샷으로 폼을 초기화
    useEffect(() => {
        if (isOpen && filter) {
            console.log("📥 [OrderFilterModal] 모달 열림 - 현재 activeFilter 스냅샷:", JSON.parse(JSON.stringify(filter)));
            setEyeline(filter.eyelinePct ?? 10);
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

    // "기본 설정 불러오기" — DB에 저장된 baseFilter 값으로 폼 필드를 채움
    const handleLoadBaseFilter = () => {
        if (!baseFilter) return;
        console.log("🔄 [OrderFilterModal] 기본 설정 불러오기 클릭 - baseFilter:", JSON.parse(JSON.stringify(baseFilter)));
        setEyeline(baseFilter.eyelinePct ?? 10);
        setPickupRadius(baseFilter.pickupRadiusKm?.toString() || "");
        setTargetCity(baseFilter.destinationCity || "");
        setTargetRadius(baseFilter.destinationRadiusKm?.toString() || "");
        setCorridorRadius(baseFilter.corridorRadiusKm?.toString() || "");
        setBlacklist(baseFilter.excludedKeywords ? baseFilter.excludedKeywords.join(',') : "");
        setSelectedVehicles(baseFilter.allowedVehicleTypes || []);
        // 프리뷰 초기화
        setPreviewRegions(null);
        setPreviewCount(0);
        setIsAccordionOpen(false);
    };

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

    /**
     * @param saveAsDefault **"앞으로 계속"** — 평소 설정까지 바꾼다. 기본은 오늘만이다.
     *
     * 기사님이 이 화면의 의도를 이렇게 설명하셨다:
     *   *"디폴트 값을 저장해 두고 … 오늘 콜이 많이 나올 만한 곳으로 필터를 바꾸고,
     *     복귀콜이나 그런 것 하면 그 값으로 돌아오게 하려는 의도였다."*
     *
     * 의도대로 만들어져 있었는데 **화면이 그 구분을 안 보여줬다.**
     * 그래서 "왜 내일 또 원래대로냐"를 알 수 없었다.
     */
    const handleSave = (saveAsDefault = false) => {
        logRoadmapEvent("웹", `필터 저장 (${saveAsDefault ? '앞으로 계속' : '오늘만'})`);

        const newFilterToSave = {
            allowedVehicleTypes: selectedVehicles,
            eyelinePct: eyeline,   // 단가표(ratePerKm)는 서버가 이 값에서 파생시킨다 — 두 곳에서 만들지 않는다
            pickupRadiusKm: pickupRadius ? parseInt(pickupRadius, 10) : filter.pickupRadiusKm,
            destinationCity: targetCity || filter.destinationCity,
            destinationRadiusKm: targetRadius ? parseInt(targetRadius, 10) : filter.destinationRadiusKm,
            corridorRadiusKm: corridorRadius ? parseInt(corridorRadius, 10) : filter.corridorRadiusKm,
            excludedKeywords: blacklist ? blacklist.split(',').map(s => s.trim()).filter(Boolean) : filter.excludedKeywords,
            userOverrides: true // 기사가 수동 개입했음을 마킹
        };

        console.log("📤 [OrderFilterModal] 필터 저장 - 서버로 전송:", JSON.parse(JSON.stringify(newFilterToSave)), { saveAsDefault });

        updateFilter(newFilterToSave, saveAsDefault);
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
            <DialogContent className="sm:max-w-lg bg-bg-base border-border shadow-2xl p-4 overflow-hidden flex flex-col gap-3">
                <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-info/10 blur-[100px] rounded-full pointer-events-none" />
                <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-success/10 blur-[100px] rounded-full pointer-events-none" />

                <DialogHeader className="border-b border-info/20 pb-2 relative z-10 flex flex-row items-center justify-between">
                    <DialogTitle className="flex flex-col gap-1">
                        {/* <span className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 tracking-tight">
                            통제 필터 설정
                        </span> */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className={isSharedMode ? 'bg-warning/20 text-warning border-warning/30' : 'bg-success/20 text-success border-success/30'}>
                                {isSharedMode ? '합짐(Loaded) 모드' : '첫짐(Empty) 모드'}
                            </Badge>
                            {/* 어느 필터를 고치는 화면인지 말해 준다. 이게 없어서
                                설정 화면과 구분이 안 됐다 (파주/용인 혼선의 절반) */}
                            <Badge variant="outline" className="bg-info/15 text-info border-info/30">
                                오늘 사냥
                            </Badge>
                        </div>
                        <span className="text-[10px] font-normal text-text-muted break-keep">
                            여기서 바꾼 값은 <b>오늘만</b> 쓰고 자정에 평소 설정으로 돌아갑니다.
                            평소 값까지 바꾸려면 <b>[계속]</b> 으로 저장하세요.
                        </span>
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-3 overflow-y-auto pr-1 pb-1 custom-scrollbar relative z-10">
                    <div>
                        {/* 차종 멀티셀렉터 */}
                        <div className="mb-3">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <label className="text-xs font-bold text-text-muted">허용 차종</label>
                                <span className="text-[10px] text-text-muted ml-auto font-mono">
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
                                                ? 'bg-success/20 border-success/60 text-success hover:bg-success/30 shadow-lg'
                                                : 'bg-surface-alt/40 border-border text-text-muted hover:text-text-primary'
                                                }`}
                                        >
                                            {v}
                                        </Button>
                                    );
                                })}
                            </div>
                            <p className="text-[10px] text-text-muted mt-2 text-center bg-surface-alt/50 p-1.5 rounded-md">
                                💡 합짐(LOADING) 상태 진입 시, 1t 등 상위 차종은 자동으로 제외 처리됩니다.
                            </p>
                        </div>

                        {/* ── 눈높이 — 시세 대비 허용 할인 (docs/필터_재설계_명세.md §2) ──
                            금액을 입력하지 않는다. 차종별 하한 단가는 눈높이에서 파생된다.
                            기사님: "처음에는 시세로 찾고, 콜이 없으면 여기 와서 조금씩 낮춘다" */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-text-muted flex items-center gap-1">
                                눈높이 <span className="font-normal text-text-muted/70">— 시세 대비 허용 할인</span>
                            </label>
                            <div className="grid grid-cols-5 gap-1.5">
                                {EYELINE_STEPS.map(step => {
                                    const on = eyeline === step.value;
                                    return (
                                        <Button
                                            key={step.value}
                                            type="button"
                                            variant="outline"
                                            onClick={() => setEyeline(step.value)}
                                            className={`h-9 text-xs font-black ${on
                                                ? 'bg-info/20 border-info text-info'
                                                : 'bg-surface-alt/60 border-border text-text-muted'}`}
                                        >
                                            {step.label}
                                        </Button>
                                    );
                                })}
                            </div>
                            {/* 차종별 하한 단가 — 자동 계산, 읽기 전용 */}
                            <div className="bg-surface-alt/50 rounded-md px-3 py-2 space-y-1">
                                {RATE_TABLE_ORDER.map(v => {
                                    const floor = Math.round((NET_RATE_PER_KM[v] ?? 0) * Math.max(0, 1 - eyeline / 100));
                                    return (
                                        <div key={v} className="flex items-center justify-between text-[11px]">
                                            <span className="text-text-muted font-bold">
                                                {v}
                                                <span className="text-text-muted/60 font-normal ml-1">
                                                    시세 {NET_RATE_PER_KM[v]}원/km · {VEHICLE_SLOTS[v]}/{TRUCK_CAPACITY_SLOTS}칸
                                                </span>
                                            </span>
                                            <span className="font-mono font-black text-success">
                                                {eyeline >= 100 ? '전부' : `≥ ${floor.toLocaleString()}원/km`}
                                            </span>
                                        </div>
                                    );
                                })}
                                <p className="text-[10px] text-text-muted/70 pt-1 border-t border-border/50">
                                    통과 = 요금 ≥ 배송거리 × 단가
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5 col-span-2">
                                <label className="text-xs font-bold text-danger/80 flex items-center gap-1">
                                    <span className="text-danger text-[10px]">🚫</span> 제외 키워드
                                </label>
                                <Input
                                    type="text"
                                    value={blacklist}
                                    onChange={handleBlacklistChange}
                                    placeholder="단어 쉼표(,) 구분"
                                    className="bg-surface-alt/60 border-danger/30 text-danger font-medium focus-visible:ring-danger/50 shadow-inner h-10"
                                />
                            </div>
                        </div>
                    </div>

                    {/* 모드별 조건부 렌더링: 첫짐 또는 합짐 전용 섹션 */}
                    {!isSharedMode ? (
                        /* ── 첫짐(EMPTY) 모드 섹션 ── */
                        <div className="bg-surface/60 backdrop-blur-md p-3 rounded-xl border border-info-alt/30 shadow-lg relative overflow-hidden">
                            <div className="flex gap-2 mb-2">
                                <div className="flex-[0.4] space-y-1">
                                    <label className="block text-[10px] font-bold text-text-muted pl-1">도착 희망 시/도</label>
                                    <select
                                        value={targetCity}
                                        onChange={(e) => setTargetCity(e.target.value)}
                                        className="w-full h-9 bg-surface-alt/50 border border-border rounded-md px-2 text-[13px] text-info-alt font-bold outline-none focus:border-info-alt shadow-inner appearance-none"
                                    >
                                        {/* 아직 안 골랐거나, 목록에 없는 값이 저장돼 있을 때.
                                            여기서 다른 도시를 대신 보여주면 화면이 필터를 잘못 말하게 된다 */}
                                        {!knownCities.includes(targetCity) && (
                                            <option value={targetCity}>
                                                {targetCity ? `⚠️ ${targetCity} (목록에 없음)` : '— 선택 —'}
                                            </option>
                                        )}
                                        {cityGroups.map(g => (
                                            <optgroup key={g.sido} label={g.sido}>
                                                {g.cities.map(c => (
                                                    <option key={c} value={c}>{c}</option>
                                                ))}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex-[0.3] space-y-1">
                                    <label className="block text-[10px] font-bold text-text-muted pl-1">상차 반경</label>
                                    <div className="relative">
                                        <Input
                                            type="number"
                                            value={pickupRadius}
                                            onChange={(e) => setPickupRadius(e.target.value)}
                                            className="bg-surface-alt/50 border-border pr-8 text-text-primary font-bold h-9 text-center"
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted font-black pointer-events-none text-[9px]">KM</span>
                                    </div>
                                </div>
                                <div className="flex-[0.3] space-y-1">
                                    <label className="block text-[10px] font-bold text-text-muted pl-1">도착 반경</label>
                                    <div className="relative">
                                        <Input
                                            type="number"
                                            value={targetRadius}
                                            onChange={(e) => setTargetRadius(e.target.value)}
                                            className="bg-surface-alt/50 border-border pr-8 text-info-alt font-bold h-9 text-center"
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-info-alt/70 font-black pointer-events-none text-[9px]">KM</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* ── 합짐(SHARED) 모드 섹션 ── */
                        <div className="bg-surface/60 backdrop-blur-md p-3 rounded-xl border border-warning/30 shadow-lg relative overflow-hidden">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="flex-[0.4] space-y-1">
                                    <label className="block text-[10px] font-bold text-text-muted text-center">우회 탐색 허용 반경</label>
                                    <div className="relative">
                                        <Input
                                            type="number"
                                            value={corridorRadius}
                                            onChange={(e) => setCorridorRadius(e.target.value)}
                                            className="bg-surface-alt/50 border-warning/30 text-warning font-bold h-9 text-center shadow-inner"
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-warning/50 font-black pointer-events-none text-[10px]">KM</span>
                                    </div>
                                </div>
                                <div className="flex-[0.3] space-y-1">
                                    <label className="block text-[10px] font-bold text-text-muted text-center">도착 반경</label>
                                    <div className="relative">
                                        <Input
                                            type="number"
                                            value={targetRadius}
                                            onChange={(e) => setTargetRadius(e.target.value)}
                                            className="bg-surface-alt/50 border-warning/30 pr-8 text-warning font-bold h-9 text-center"
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-warning/50 font-black pointer-events-none text-[9px]">KM</span>
                                    </div>
                                </div>
                                <div className="flex-[0.3]">
                                    <p className="text-[9px] text-text-muted leading-tight border-l-2 border-warning/30 pl-2 py-1">
                                        경로상 추가 콜 탐색을 허용할 최대 우회 반경
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 독립 섹션: 현재 타겟팅 지역 목록 검증 및 미리보기 통합 UI */}
                    <div className="bg-surface/60 backdrop-blur-md p-2 rounded-xl border border-border shadow-lg mt-1">
                        <div className="w-full flex items-center justify-between p-1.5 rounded-md bg-surface-alt/50 transition-colors">
                            <div 
                                className="flex items-center gap-2 flex-1 cursor-pointer group"
                                onClick={() => setIsAccordionOpen(!isAccordionOpen)}
                            >
                                <span className="text-[11px] font-medium text-text-muted group-hover:text-text-primary transition-colors">
                                    {isSharedMode ? `🛣️ 회랑 지역 (±${corridorRadius !== '' ? corridorRadius : '?'}km)` : `📍 도착 지역 (${targetCity})`}
                                </span>
                                {previewRegions && previewCount > 0 ? (
                                    <Badge variant="secondary" className="bg-warning/80 text-white shadow-[0_0_10px_var(--theme-glow-warning)]">
                                        변경 예정 ({previewCount}개)
                                    </Badge>
                                ) : (
                                    <Badge className={isSharedMode ? 'bg-accent-alt text-white shadow-[0_0_10px_var(--theme-glow-primary)]' : 'bg-info-alt text-white shadow-[0_0_10px_var(--theme-glow-primary)]'}>
                                        {destKeywordsLimit.length}개
                                    </Badge>
                                )}
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <Button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (isSharedMode) handlePreviewCorridor();
                                        else handlePreviewRegions();
                                    }}
                                    disabled={isPreviewLoading}
                                    size="sm"
                                    className={`h-6 text-[10px] px-2 py-0 font-bold ${isSharedMode ? 'bg-warning/20 text-warning hover:bg-warning/40 border border-warning/50' : 'bg-info-alt/20 text-info-alt hover:bg-info-alt/40 border border-info-alt/50'}`}
                                >
                                    {isPreviewLoading ? '연산 중...' : '🔍 미리보기'}
                                </Button>
                                <span 
                                    className={`text-text-muted text-sm cursor-pointer px-1 transition-transform duration-300 ${isAccordionOpen ? 'rotate-180' : ''}`}
                                    onClick={() => setIsAccordionOpen(!isAccordionOpen)}
                                >
                                    ▼
                                </span>
                            </div>
                        </div>

                        {isAccordionOpen && (
                            <div className="mt-2 p-2 bg-surface-alt/50 rounded-lg border border-border max-h-32 overflow-y-auto custom-scrollbar">
                                {previewRegions && Object.keys(previewRegions).length > 0 ? (
                                    <div className="flex flex-col gap-3">
                                        {Object.entries(previewRegions).map(([parentName, dongs]) => (
                                            <div key={parentName} className="flex flex-col gap-1 opacity-90">
                                                <span className="text-xs font-bold text-warning border-b border-warning/50 pb-1 flex items-center justify-between">
                                                    <span>{parentName} <span className="text-warning/70 text-[10px] font-normal">({dongs.length})</span></span>
                                                    <Badge variant="outline" className="text-[9px] bg-warning/20 border-warning/30">미리보기</Badge>
                                                </span>
                                                <div className="flex flex-wrap gap-1">
                                                    {dongs.map(kw => (
                                                        <span key={kw} className="text-[10px] text-warning bg-warning/10 px-1.5 py-0.5 rounded border border-warning/30">
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
                                                <span className={`text-xs font-bold border-b pb-1 ${isSharedMode ? 'text-accent-alt border-accent-alt/50' : 'text-info-alt border-info-alt/50'}`}>
                                                    {parentName} <span className="text-text-muted text-[10px] font-normal">({dongs.length})</span>
                                                </span>
                                                <div className="flex flex-wrap gap-1">
                                                    {dongs.map(kw => (
                                                        <span key={kw} className={`text-[10px] px-1.5 py-0.5 rounded border ${isSharedMode ? 'text-accent-alt bg-accent-alt/10 border-accent-alt/30' : 'text-info-alt bg-info-alt/10 border-info-alt/30'}`}>
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
                                            <span key={kw} className={`text-[10px] px-1.5 py-0.5 rounded border ${isSharedMode ? 'text-accent-alt bg-accent-alt/10 border-accent-alt/30' : 'text-info-alt bg-info-alt/10 border-info-alt/30'}`}>
                                                {kw}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-text-muted text-center py-2">수집된 지역이 없습니다.</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 🧪 목업 시뮬레이터 토글 */}
                    <div className="flex items-center justify-between px-1 py-2 border-t border-border">
                        <span className="text-[11px] text-text-muted font-semibold tracking-wide">🧪 목업 시뮬레이터 (테스트 GPS)</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={isTestMode}
                                onChange={(e) => setIsTestMode(e.target.checked)}
                            />
                            <div className="w-9 h-5 bg-surface-alt peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent-alt"></div>
                        </label>
                    </div>

                    {/* 사냥 모드 통제 버튼 영역 (1열 5버튼 구조) */}
                    <div className="pt-2">
                        <div className="grid grid-cols-6 gap-1.5">
                            {/* 기본 설정 불러오기: DB(baseFilter) 값으로 폼 초기화 */}
                            <Button
                                onClick={handleLoadBaseFilter}
                                disabled={!baseFilter}
                                className="h-11 rounded-xl bg-gradient-to-r from-surface-alt to-surface-hover text-text-primary font-black text-[11px] shadow-soft hover:shadow-md transition-all px-1"
                            >
                                🔄 초기화
                            </Button>

                            {/* 메인 액션: 오늘만 이 조건으로 사냥 (자정에 평소 설정으로 복귀) */}
                            <Button
                                onClick={() => handleSave(false)}
                                title="오늘만 이 조건으로 사냥합니다 (자정에 평소 설정으로 돌아갑니다)"
                                className="h-11 relative group overflow-hidden rounded-xl bg-gradient-to-r from-success to-success/70 text-white font-black text-[11px] shadow-[0_0_15px_var(--theme-glow-primary)] hover:shadow-[0_0_20px_var(--theme-glow-primary)] transition-all px-1"
                            >
                                <span className="relative z-10 drop-shadow-md tracking-wider">🟢 오늘만</span>
                                <div className="absolute inset-0 bg-gradient-to-r from-success/90 to-success/60 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            </Button>

                            {/* 평소 설정까지 바꾼다 — 되돌아올 기준점 자체를 옮기는 것이라 확인을 받는다 */}
                            <Button
                                onClick={() => {
                                    if (confirm('평소 설정까지 바꿉니다.\n\n앞으로 매일 아침 이 조건으로 시작하고, 복귀콜 뒤에도 여기로 돌아옵니다.\n계속할까요?')) {
                                        handleSave(true);
                                    }
                                }}
                                title="평소 설정까지 바꿉니다 (내일 아침에도 이 조건으로 시작)"
                                className="h-11 rounded-xl bg-gradient-to-r from-info-alt to-info-alt/70 text-white font-black text-[11px] shadow-soft hover:shadow-md transition-all px-1"
                            >
                                📌 계속
                            </Button>

                            {/* 강제 출발 */}
                            <Button
                                onClick={() => {
                                    logRoadmapEvent("웹", `출발 버튼 클릭 → GATHERING→DELIVERING 전환 (시뮬레이션: ${isTestMode})`);
                                    updateFilter({ driverAction: 'DRIVING', corridorRadiusKm: 0 });
                                    onClose();
                                }}
                                className="h-11 rounded-xl bg-gradient-to-r from-info to-info-alt text-white font-black text-[11px] shadow-[0_0_15px_var(--theme-glow-primary)] hover:shadow-[0_0_20px_var(--theme-glow-primary)] transition-all px-1"
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
                                className={`h-11 rounded-xl bg-gradient-to-r from-accent-alt to-accent-alt/70 text-white font-black text-[11px] shadow-[0_0_15px_var(--theme-glow-primary)] hover:shadow-[0_0_20px_var(--theme-glow-primary)] transition-all px-1 ${homeReturnLoading || hasHomeReturnActive ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                                className="h-11 rounded-xl bg-gradient-to-r from-warning to-warning/70 text-white font-black text-[11px] shadow-[0_0_15px_var(--theme-glow-warning)] hover:shadow-[0_0_20px_var(--theme-glow-warning)] transition-all px-1"
                            >
                                🎯 투-트랙
                            </Button>
                        </div>

                        <p className="text-[10px] text-text-muted text-center mt-2">이 값은 현재 진행 중인 콜 탐색에만 적용됩니다. 🔄초기화를 누르면 톱니바퀴(⚙️) 설정값을 불러옵니다.</p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
