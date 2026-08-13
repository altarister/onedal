import { useState, useEffect } from "react";
import { useFilterConfig } from "../../hooks/useFilterConfig";
import { logRoadmapEvent } from "../../lib/roadmapLogger";
import { NET_RATE_PER_KM, VEHICLE_SLOTS, TRUCK_CAPACITY_SLOTS, CAPACITY_CONFIDENCE_LABEL } from "@onedal/shared";
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

/**
 * 탭 = 하루의 다섯 국면 (docs/필터_재설계_명세.md §4-2).
 * 모두 펼쳐 두고 **지금 어디인지는 초록 점**으로만 표시한다 —
 * 기사님: *"아침에 앉아서 하루치를 다 정해 둘 수 있다."*
 *
 * ⚠️ 눈높이는 아직 **탭 공통 하나**다. 탭마다 따로 저장하려면 DB 컬럼이 다섯 개
 *    필요하다 — 그건 아직 안 했다 (명세 §7 미결).
 */
const TABS = [
    { key: 'first', label: '첫짐' },
    { key: 'merge', label: '합짐' },
    { key: 'drive', label: '운행 중' },
    { key: 'local', label: '관내' },
    { key: 'home',  label: '복귀' },
] as const;
type TabKey = typeof TABS[number]['key'];

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
    const [tab, setTab] = useState<TabKey>('first');
    /**
     * 저장 안 한 변경이 **어느 탭에** 있는지. (v6 설명 ② — 기사님 확정)
     *
     * 저장 버튼은 전역이라, 합짐 탭을 보면서 눌러도 첫짐 설정까지 같이 저장된다.
     * 그 사실을 **누르기 전에** 알 수 있어야 한다 — 탭에 노란 점, 버튼에 "N곳 변경".
     */
    const [dirtyTabs, setDirtyTabs] = useState<Set<TabKey>>(new Set());
    const markDirty = (t: TabKey) => setDirtyTabs(prev => prev.has(t) ? prev : new Set(prev).add(t));
    const [pickupRadius, setPickupRadius] = useState<string>("");
    const [targetCity, setTargetCity] = useState<string>("");
    const [targetRadius, setTargetRadius] = useState<string>("");
    const [corridorRadius, setCorridorRadius] = useState<string>("");
    const [blacklist, setBlacklist] = useState<string>("");

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
            // 지금 상황에 맞는 탭을 열어 준다 (국면 → 탭)
            setTab(filter.huntPhase === 'LOCAL' ? 'local'
                 : filter.huntPhase === 'HOME' ? 'home'
                 : filter.driverAction === 'DRIVING' ? 'drive'
                 : filter.isSharedMode ? 'merge' : 'first');
            setPickupRadius(filter.pickupRadiusKm?.toString() || "");
            setTargetCity(filter.destinationCity || "");
            setTargetRadius(filter.destinationRadiusKm?.toString() || "");
            setCorridorRadius(filter.corridorRadiusKm?.toString() || "");
            setBlacklist(filter.excludedKeywords ? filter.excludedKeywords.join(',') : "");
            setDirtyTabs(new Set());
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
        setDirtyTabs(new Set());
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
            /**
             * 🔴 `allowedVehicleTypes` 를 **보내지 않는다.**
             *
             * 허용 차종은 입력이 아니라 파생값이다 — 서버가 지금 실린 짐에서 매번 다시 구한다.
             * 여기서 보내면 `recalculateDerivedFields` 가 `if (!changes.allowedVehicleTypes)`
             * 에 걸려 **자기 계산을 건너뛴다.** 그러면 모달을 열었다 저장한 것만으로
             * 적재 용량 제한이 옛 값에 굳는다 (2026-08-10 에 같은 형태의 사고가 있었다).
             */
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

    // ── 적재 칸 (서버 파생값을 그대로 쓴다) ──
    const slotsUsed = Math.round(filter.slotsUsed ?? 0);
    const remainSlots = Math.max(0, TRUCK_CAPACITY_SLOTS - slotsUsed);
    /** 하한표 예시 금액용 거리 — 지금 탭이 보는 대표 거리 */
    const exampleKm = tab === 'local' ? 15 : (parseInt(targetRadius, 10) || 0) + 50;
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

                {/* 슬림 타이틀바 — 한 줄. 설명 문구는 없앴다 (팝업 세로를 줄인다) */}
                <DialogHeader className="border-b border-info/20 pb-2 relative z-10">
                    <DialogTitle className="flex items-center gap-2 text-sm font-black">
                        필터 설정
                        <Badge variant="outline" className="bg-info/15 text-info border-info/30 text-[10px] font-bold">
                            오늘 사냥
                        </Badge>
                        {isSharedMode && (
                            <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30 text-[10px] font-bold">
                                합짐 중
                            </Badge>
                        )}
                    </DialogTitle>
                </DialogHeader>

                {/* 탭 다섯 — 하루의 다섯 국면. 지금 어디인지는 초록 점으로만 */}
                <div className="grid grid-cols-5 gap-1 bg-surface-alt/40 p-1 rounded-lg border border-border relative z-10">
                    {TABS.map(t => {
                        const on = tab === t.key;
                        const isNow =
                            (t.key === 'local' && filter.huntPhase === 'LOCAL') ||
                            (t.key === 'home' && filter.huntPhase === 'HOME') ||
                            (t.key === 'drive' && filter.driverAction === 'DRIVING') ||
                            (t.key === 'merge' && filter.huntPhase !== 'LOCAL' && filter.huntPhase !== 'HOME' && filter.isSharedMode) ||
                            (t.key === 'first' && filter.huntPhase !== 'LOCAL' && filter.huntPhase !== 'HOME' && !filter.isSharedMode && filter.driverAction !== 'DRIVING');
                        return (
                            <button
                                key={t.key}
                                onClick={() => setTab(t.key)}
                                className={`relative py-2 rounded-md text-[11px] font-black transition-all ${on
                                    ? 'bg-surface border border-border text-text-primary'
                                    : 'text-text-muted hover:bg-surface-hover/50'}`}
                            >
                                {isNow && <span title="지금 이 국면" className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_6px_var(--theme-glow-primary)]" />}
                                {dirtyTabs.has(t.key) && <span title="저장 안 한 변경이 있습니다" className="absolute top-1 left-1.5 w-1.5 h-1.5 rounded-full bg-warning" />}
                                {t.label}
                            </button>
                        );
                    })}
                </div>

                <div className="space-y-3 overflow-y-auto pr-1 pb-1 custom-scrollbar relative z-10">
                    <div>
                        {/* ── 적재 칸 — 내 트럭 5칸 중 얼마나 찼나 (명세 §2-2) ──
                            서버가 내려준 slotsUsed(적재 점수 ÷ 7.5)를 그대로 쓴다. 여기서 다시 세지 않는다 —
                            차종으로 다시 세면 통화로 확인한 실제 짐 양이 화면에 반영되지 않는다. */}
                        <div className="bg-surface-alt/50 rounded-md px-3 py-2 mb-3">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[11px] font-bold text-text-muted">
                                    📦 적재 <span className="font-mono text-text-primary">{slotsUsed}/{TRUCK_CAPACITY_SLOTS}칸</span>
                                    <span className="text-text-muted/60 font-normal ml-1">· 남은 {remainSlots}칸</span>
                                </span>
                                {filter.capacityConfidence && (
                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                        filter.capacityConfidence === 'CONFIRMED' ? 'bg-success/15 text-success'
                                        : filter.capacityConfidence === 'DECLARED' ? 'bg-info/15 text-info'
                                        : 'bg-warning/15 text-warning'}`}>
                                        {CAPACITY_CONFIDENCE_LABEL[filter.capacityConfidence]}
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-1">
                                {Array.from({ length: TRUCK_CAPACITY_SLOTS }).map((_, i) => (
                                    <span key={i} className={`flex-1 h-2.5 rounded-sm ${i < slotsUsed ? 'bg-info/60' : 'bg-surface-hover'}`} />
                                ))}
                            </div>
                            {filter.capacityConfidence === 'ESTIMATED' && slotsUsed > 0 && (
                                <p className="text-[10px] text-warning/80 mt-1.5">
                                    차종만 보고 <b>만재로 추정</b>한 값입니다 — <b>통화로 실제 짐을 확인</b>하면 자리가 더 나옵니다
                                </p>
                            )}
                        </div>

                        {/* ── 눈높이 — 시세 대비 허용 할인 (docs/필터_재설계_명세.md §2) ──
                            금액을 입력하지 않는다. 차종별 하한 단가는 눈높이에서 파생된다.
                            기사님: "처음에는 시세로 찾고, 콜이 없으면 여기 와서 조금씩 낮춘다" */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-text-muted flex items-center gap-1">
                                눈높이
                                <span className="font-normal text-text-muted/70">
                                    — {tab === 'first' ? '첫짐은 기준을 세우니 시세 근처에서'
                                     : tab === 'merge' ? '합짐은 순증 매출이라 “전부”까지'
                                     : tab === 'drive' ? '운행 중은 합짐 기준을 그대로'
                                     : tab === 'local' ? '관내는 짧아도 순증 매출은 같다'
                                     : '빈 차로 돌아가는 것보다 뭐든 싣는 게 이득'}
                                </span>
                            </label>
                            <div className={`grid gap-1.5 ${tab === 'first' ? 'grid-cols-4' : 'grid-cols-5'}`}>
                                {EYELINE_STEPS.filter(st => !(tab === 'first' && st.value >= 100)).map(step => {
                                    const on = eyeline === step.value;
                                    return (
                                        <Button
                                            key={step.value}
                                            type="button"
                                            variant="outline"
                                            onClick={() => { setEyeline(step.value); markDirty(tab); }}
                                            className={`h-9 text-xs font-black ${on
                                                ? 'bg-info/20 border-info text-info'
                                                : 'bg-surface-alt/60 border-border text-text-muted'}`}
                                        >
                                            {step.label}
                                        </Button>
                                    );
                                })}
                            </div>
                            {/* 차종별 하한 단가 — 자동 계산, 읽기 전용.
                                남은 칸에 안 들어가는 차종은 흐리게 (잡아도 못 싣는다) */}
                            <div className="bg-surface-alt/50 rounded-md px-3 py-2 space-y-1">
                                {RATE_TABLE_ORDER.map(v => {
                                    const floor = Math.round((NET_RATE_PER_KM[v] ?? 0) * Math.max(0, 1 - eyeline / 100));
                                    const slot = VEHICLE_SLOTS[v] ?? 0;
                                    const fits = slot <= remainSlots;
                                    return (
                                        <div key={v} className={`flex items-center justify-between text-[11px] ${fits ? '' : 'opacity-35'}`}>
                                            <span className="text-text-muted font-bold">
                                                {v}
                                                <span className="text-text-muted/60 font-normal ml-1">
                                                    시세 {NET_RATE_PER_KM[v]}원/km · {slot}칸
                                                </span>
                                            </span>
                                            <span className="font-mono font-black text-success whitespace-nowrap">
                                                {!fits ? <span className="text-text-muted font-normal">칸 부족</span>
                                                 : eyeline >= 100 ? '전부'
                                                 : <>≥ {floor.toLocaleString()}원/km
                                                     <span className="text-text-muted/60 font-normal ml-1.5">
                                                        {exampleKm}km면 {(floor * exampleKm).toLocaleString()}
                                                     </span>
                                                   </>}
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
                                    <span className="font-normal text-text-muted/60 ml-1">— 다섯 탭 공통</span>
                                </label>
                                <Input
                                    type="text"
                                    value={blacklist}
                                    onChange={(e) => { handleBlacklistChange(e); markDirty(tab); }}
                                    placeholder="단어 쉼표(,) 구분"
                                    className="bg-surface-alt/60 border-danger/30 text-danger font-medium focus-visible:ring-danger/50 shadow-inner h-10"
                                />
                            </div>
                        </div>
                    </div>

                    {/* 탭별 섹션 — 지금 모드가 아니어도 미리 정해 둘 수 있다 */}
                    {tab === 'first' ? (
                        /* ── 첫짐(EMPTY) 모드 섹션 ── */
                        <div className="bg-surface/60 backdrop-blur-md p-3 rounded-xl border border-info-alt/30 shadow-lg relative overflow-hidden">
                            <div className="flex gap-2 mb-2">
                                <div className="flex-[0.4] space-y-1">
                                    <label className="block text-[10px] font-bold text-text-muted pl-1">도착 희망 시/도</label>
                                    <select
                                        value={targetCity}
                                        onChange={(e) => { setTargetCity(e.target.value); markDirty('first'); }}
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
                                            onChange={(e) => { setPickupRadius(e.target.value); markDirty('first'); }}
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
                                            onChange={(e) => { setTargetRadius(e.target.value); markDirty(tab); }}
                                            className="bg-surface-alt/50 border-border pr-8 text-info-alt font-bold h-9 text-center"
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-info-alt/70 font-black pointer-events-none text-[9px]">KM</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : tab === 'merge' ? (
                        /* ── 합짐(SHARED) 모드 섹션 ── */
                        <div className="bg-surface/60 backdrop-blur-md p-3 rounded-xl border border-warning/30 shadow-lg relative overflow-hidden">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="flex-[0.4] space-y-1">
                                    <label className="block text-[10px] font-bold text-text-muted text-center">우회 탐색 허용 반경</label>
                                    <div className="relative">
                                        <Input
                                            type="number"
                                            value={corridorRadius}
                                            onChange={(e) => { setCorridorRadius(e.target.value); markDirty('merge'); }}
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
                                            onChange={(e) => { setTargetRadius(e.target.value); markDirty(tab); }}
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
                    ) : tab === 'drive' ? (
                        /* ── 운행 중 ── 설정할 것이 없다. 우회 0 은 고정이고 지나온 구간 제외는 자동.
                           기사님: "운행 중도 사람이 하는 일이라 변화가 필요할 수 있으니 탭은 그대로 유지" */
                        <div className="bg-surface/60 backdrop-blur-md p-3 rounded-xl border border-info/30 shadow-lg space-y-2">
                            <div className="flex items-center gap-2 text-[12px] font-black text-info">
                                🛣️ 우회 0km — 가는 길 위의 콜만
                            </div>
                            <p className="text-[10px] text-text-muted leading-relaxed">
                                사냥을 멈추는 게 아닙니다. 콜은 계속 잡되 <b className="text-text-primary">가는 길 위의 것만</b> 잡습니다.
                                지나온 구간은 자동으로 빠집니다.
                            </p>
                            <p className="text-[10px] text-text-muted/70">
                                🚀 출발은 <b className="text-text-primary">지도 좌하단 버튼</b>에 있습니다 (운전 중에 팝업을 열지 않도록).
                            </p>
                        </div>
                    ) : tab === 'local' ? (
                        /* ── 관내 ── 기준 지역은 지금 있는 곳의 시. 서버가 GPS 로 정한다 */
                        <div className="bg-surface/60 backdrop-blur-md p-3 rounded-xl border border-accent-alt/30 shadow-lg space-y-2">
                            <div className="flex items-center gap-2 text-[12px] font-black text-accent-alt">
                                🏘️ 이 동네 안에서 끝나는 콜
                            </div>
                            <p className="text-[10px] text-text-muted leading-relaxed">
                                상차지와 하차지가 <b className="text-text-primary">모두 같은 시</b>여야 통과합니다. 거리 조건은 없습니다.
                                기준 지역은 <b className="text-text-primary">지금 있는 곳의 시</b>로 서버가 GPS 에서 정합니다.
                            </p>
                            <Button
                                onClick={() => {
                                    logRoadmapEvent("웹", "필터 팝업 → 관내 국면으로 전환");
                                    socket.emit("set-hunt-phase", { phase: 'LOCAL' });
                                    onClose();
                                }}
                                className="w-full h-10 rounded-xl bg-gradient-to-r from-accent-alt to-accent-alt/70 text-white font-black text-[11px]"
                            >
                                🏘️ 이 동네에서 찾기로 전환
                            </Button>
                        </div>
                    ) : (
                        /* ── 복귀 ── 집 방향. 기점은 짐이 남았으면 마지막 하차지, 다 내렸으면 현위치 */
                        <div className="bg-surface/60 backdrop-blur-md p-3 rounded-xl border border-accent/30 shadow-lg space-y-2">
                            <div className="flex items-center gap-2 text-[12px] font-black text-accent">
                                🏠 집 방향
                            </div>
                            <p className="text-[10px] text-text-muted leading-relaxed">
                                기점은 <b className="text-text-primary">짐이 남았으면 마지막 하차지</b>, 다 내렸으면 <b className="text-text-primary">현재 위치</b>입니다.
                                복귀콜도 합짐을 최대한 합니다 — 집으로 가는 길에 계속 주워 담습니다.
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    onClick={() => {
                                        logRoadmapEvent("웹", "필터 팝업 → 복귀 국면으로 전환");
                                        socket.emit("set-hunt-phase", { phase: 'HOME' });
                                        onClose();
                                    }}
                                    className="h-10 rounded-xl bg-gradient-to-r from-accent to-accent/70 text-white font-black text-[11px]"
                                >
                                    🏠 복귀행으로 전환
                                </Button>
                                {/* 귀가콜은 국면 전환과 **다른 기능**이다 — 집까지 가는 가상 오더를 만든다 */}
                                <Button
                                    onClick={() => {
                                        logRoadmapEvent("웹", "귀가콜 시작 버튼 클릭 (필터 선반영)");
                                        setHomeReturnLoading(true);
                                        const parsedCorridor = corridorRadius.trim() === "" ? 10 : parseFloat(corridorRadius);
                                        const parsedTarget = targetRadius.trim() === "" ? 10 : parseFloat(targetRadius);
                                        socket.emit("create-home-return", {
                                            corridorRadiusKm: parsedCorridor,
                                            destinationRadiusKm: parsedTarget
                                        });
                                    }}
                                    disabled={homeReturnLoading || hasHomeReturnActive}
                                    className={`h-10 rounded-xl bg-gradient-to-r from-accent-alt to-accent-alt/70 text-white font-black text-[11px] ${homeReturnLoading || hasHomeReturnActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    {homeReturnLoading ? '⏳ 계산중' : hasHomeReturnActive ? '🏠 진행중' : '🏠 귀가콜 만들기'}
                                </Button>
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
                        <div className="grid grid-cols-3 gap-1.5">
                            {/* 기본 설정 불러오기: DB(baseFilter) 값으로 폼 초기화 */}
                            <Button
                                onClick={handleLoadBaseFilter}
                                disabled={!baseFilter}
                                className="h-11 rounded-xl bg-gradient-to-r from-surface-alt to-surface-hover text-text-primary font-black text-[11px] shadow-soft hover:shadow-md transition-all px-1"
                            >
                                🔄 평소값
                            </Button>

                            {/* 메인 액션: 오늘만 이 조건으로 사냥 (자정에 평소 설정으로 복귀) */}
                            <Button
                                onClick={() => handleSave(false)}
                                title="오늘만 이 조건으로 사냥합니다 (자정에 평소 설정으로 돌아갑니다)"
                                className="h-11 relative group overflow-hidden rounded-xl bg-gradient-to-r from-success to-success/70 text-white font-black text-[11px] shadow-[0_0_15px_var(--theme-glow-primary)] hover:shadow-[0_0_20px_var(--theme-glow-primary)] transition-all px-1"
                            >
                                <span className="relative z-10 drop-shadow-md tracking-wider flex flex-col leading-tight">
                                    🟢 오늘만
                                    <span className="text-[8px] font-bold opacity-80">
                                        {dirtyTabs.size > 0 ? `${dirtyTabs.size}곳 변경` : '변경 없음'}
                                    </span>
                                </span>
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

                            {/* 🚀 출발 → 지도 좌하단 플로팅 · 🏠 귀가콜 → 복귀 탭 안으로 옮겼다.
                                여기 남는 것은 **저장** 셋뿐이다 (평소값 / 오늘만 / 계속). */}
                        </div>

                        <p className="text-[10px] text-text-muted text-center mt-2">
                            <b>오늘만</b> = 자정에 평소값으로 돌아감 · <b>계속</b> = 평소값까지 변경 · <b>초기화</b> = 톱니바퀴(⚙️) 설정값 불러오기
                        </p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
