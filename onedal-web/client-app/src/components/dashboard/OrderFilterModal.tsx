import { useState, useEffect } from "react";
import { useFilterConfig } from "../../hooks/useFilterConfig";
import { logRoadmapEvent } from "../../lib/roadmapLogger";
import { NET_RATE_PER_KM, VEHICLE_SLOTS, TRUCK_CAPACITY_SLOTS, CAPACITY_CONFIDENCE_LABEL,
         PHASE_KEYS, PHASE_LABEL, PHASE_FIELDS, PHASE_FIELD_LABEL, PHASE_AUTO_SOURCE,
         DEFAULT_PHASE_SETTINGS, resolvePhaseKey } from "@onedal/shared";
import type { PhaseKey, PhaseSettings } from "@onedal/shared";
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
 * 탭 = 하루의 다섯 국면 (docs/필터_재설계_명세.md §2-4).
 * 모두 펼쳐 두고 **지금 어디인지는 초록 점**으로만 표시한다 —
 * 기사님: *"아침에 앉아서 하루치를 다 정해 둘 수 있다."*
 *
 * 🔴 목록도 라벨도 `shared` 에서 가져온다. 여기에 또 적으면 국면이 늘거나 이름이 바뀔 때
 *    한쪽만 고쳐진다 (이 레포가 회랑 4벌 · 상태목록 3벌로 이미 당한 사고다).
 */
const TABS = PHASE_KEYS;

/** 탭별 강조색 — Tailwind 가 스캔할 수 있게 **완성된 클래스 문자열**로 적는다 */
const TAB_STYLE: Record<PhaseKey, { box: string; text: string; input: string }> = {
    first: { box: 'border-info-alt/30',   text: 'text-info-alt',   input: 'border-border' },
    merge: { box: 'border-warning/30',    text: 'text-warning',    input: 'border-warning/30' },
    drive: { box: 'border-info/30',       text: 'text-info',       input: 'border-info/30' },
    local: { box: 'border-accent-alt/30', text: 'text-accent-alt', input: 'border-accent-alt/30' },
    home:  { box: 'border-accent/30',     text: 'text-accent',     input: 'border-accent/30' },
};

/** 탭이 무엇을 하는 국면인지 — 한 줄 */
const TAB_HINT: Record<PhaseKey, string> = {
    first: '🚚 오늘 기준을 세우는 첫 콜',
    merge: '📦 잡은 경로에 얹는 추가 콜',
    drive: '🛣️ 가는 길 위의 콜만',
    local: '🏘️ 이 동네 안에서 끝나는 콜',
    home:  '🏠 집 방향으로 주워 담기',
};

/** 국면 설정을 폼에서 다루는 모양 — **문자열**이다 (입력 중 빈 칸을 허용하려면 숫자로는 안 된다) */
type PhaseForm = Record<keyof PhaseSettings, string>;
type PhaseFormMap = Record<PhaseKey, PhaseForm>;

const toForm = (s: PhaseSettings): PhaseForm => ({
    destinationCity: s.destinationCity,
    pickupRadiusKm: String(s.pickupRadiusKm),
    detourAllowKm: String(s.detourAllowKm),
    dropoffRadiusKm: String(s.dropoffRadiusKm),
    discountPct: String(s.discountPct),
});

/** 빈 칸은 **이전 값 그대로**다 (0 으로 바꾸면 "제한 없음"으로 뒤집힌다 — §1) */
const toSettings = (f: PhaseForm, prev: PhaseSettings): PhaseSettings => {
    const num = (v: string, fallback: number) => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : fallback;
    };
    return {
        destinationCity: f.destinationCity,
        pickupRadiusKm: num(f.pickupRadiusKm, prev.pickupRadiusKm),
        detourAllowKm: num(f.detourAllowKm, prev.detourAllowKm),
        dropoffRadiusKm: num(f.dropoffRadiusKm, prev.dropoffRadiusKm),
        discountPct: num(f.discountPct, prev.discountPct),
    };
};

const mapToForm = (m: Record<PhaseKey, PhaseSettings>): PhaseFormMap =>
    Object.fromEntries(PHASE_KEYS.map(k => [k, toForm(m[k])])) as PhaseFormMap;

/** 위 그리드가 그리는 칸 — **표시 순서**. 눈높이(discountPct)는 전용 UI 가 위에서 그린다 */
const GEO_FIELDS: (keyof PhaseSettings)[] = ['destinationCity', 'pickupRadiusKm', 'detourAllowKm', 'dropoffRadiusKm'];

type TabKey = PhaseKey;

interface OrderFilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    hasHomeReturnActive?: boolean;
    isTestMode: boolean;
    setIsTestMode: (val: boolean) => void;
}

export default function OrderFilterModal({ isOpen, onClose, hasHomeReturnActive = false, isTestMode, setIsTestMode }: OrderFilterModalProps) {
    const { filter, baseFilter, phaseSettings, basePhaseSettings, updateFilter, savePhase } = useFilterConfig();

    const [tab, setTab] = useState<TabKey>('first');

    /**
     * 🔴 **다섯 국면이 각자 자기 값을 기억한다** (§2-4).
     *
     * 기사님: *"첫짐 도착반경 5km 로 사냥하다 첫짐을 잡으면 … 저장된 합짐 도착반경 1km 를
     * 저장된 값에서 꺼내와 콜을 잡고 싶은 거야."*
     *
     * 예전에는 이 폼이 값 **한 벌**만 들고 있어서, 합짐 탭에서 반경을 고치면
     * 첫짐 값이 덮였다. 탭은 다섯인데 저장은 한 곳이었다.
     */
    const [forms, setForms] = useState<PhaseFormMap>(() => mapToForm(DEFAULT_PHASE_SETTINGS));
    const cur = forms[tab];
    const shown = PHASE_FIELDS[tab];

    /**
     * 지금 어느 국면인가 — **두 축의 조합**이다 (`huntPhase` × `dispatchPhase`).
     * 판정은 `shared` 의 `resolvePhaseKey` 하나로만 한다. 예전에는 이 화면이
     * `isSharedMode`·`driverAction` 으로 자기 규칙을 따로 세워, 서버가 보는 국면과
     * 화면이 말하는 국면이 갈라질 수 있었다.
     */
    const activePhase: PhaseKey = filter
        ? resolvePhaseKey(filter.huntPhase ?? 'DEST', filter.dispatchPhase ?? 'STANDBY')
        : 'first';
    /**
     * 저장 안 한 변경이 **어느 탭에** 있는지. (v6 설명 ② — 기사님 확정)
     *
     * 저장 버튼은 전역이라, 합짐 탭을 보면서 눌러도 첫짐 설정까지 같이 저장된다.
     * 그 사실을 **누르기 전에** 알 수 있어야 한다 — 탭에 노란 점, 버튼에 "N곳 변경".
     */
    const [dirtyTabs, setDirtyTabs] = useState<Set<TabKey>>(new Set());
    const markDirty = (t: TabKey) => setDirtyTabs(prev => prev.has(t) ? prev : new Set(prev).add(t));
    /** 한 국면의 한 칸만 고친다 — 다른 탭의 값은 건드리지 않는다 */
    const setField = (key: keyof PhaseSettings, value: string) => {
        setForms(prev => ({ ...prev, [tab]: { ...prev[tab], [key]: value } }));
        markDirty(tab);
    };

    /** 제외 키워드는 **다섯 탭 공통**이라 국면 설정이 아니라 평면 필터에 있다 */
    const [blacklist, setBlacklist] = useState<string>("");
    const [blacklistDirty, setBlacklistDirty] = useState(false);

    /**
     * 고를 수 있는 시/군 목록 — 지도 데이터에서 받는다.
     * 예전에는 여기에 7개를 손으로 적어 뒀고, 저장값 `파주` 가 그 중 무엇과도 안 맞아
     * 브라우저가 첫 항목 `용인시` 를 그렸다. 화면이 필터를 잘못 말한 것이다.
     */
    const cityGroups = useCityOptions();
    const knownCities = cityGroups.flatMap(g => g.cities);
    /** 목록에 없는 저장값(옛 `파주`)을 정식 이름으로 끌어올린다 — 못 찾으면 건드리지 않는다 */
    const firstCity = forms.first.destinationCity;
    useEffect(() => {
        if (!firstCity || !cityGroups.length) return;
        if (knownCities.includes(firstCity)) return;
        const resolved = resolveCity(firstCity, cityGroups);
        if (resolved) {
            setForms(prev => ({ ...prev, first: { ...prev.first, destinationCity: resolved } }));
        }
    }, [cityGroups, firstCity]); // eslint-disable-line react-hooks/exhaustive-deps

    // 배열 확인용 아코디언 상태
    const [isAccordionOpen, setIsAccordionOpen] = useState(false);

    // [신규] 지역 미리보기용 상태
    const [previewRegions, setPreviewRegions] = useState<Record<string, string[]> | null>(null);
    const [previewCount, setPreviewCount] = useState<number>(0);

    // 귀가콜 로딩 상태
    const [homeReturnLoading, setHomeReturnLoading] = useState(false);

    const [isPreviewLoading, setIsPreviewLoading] = useState(false);

    // 첫짐 섹션: 미리보기 버튼 클릭 시 호출
    const handlePreviewRegions = async (city: string) => {
        if (!city) return;
        setIsPreviewLoading(true);
        const radius = forms[tab].dropoffRadiusKm || '0';
        try {
            const { data } = await apiClient.get(`/settings/preview-regions?city=${encodeURIComponent(city)}&destinationRadiusKm=${radius}`);
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
        const params = new URLSearchParams({ corridorRadiusKm: cur.detourAllowKm !== '' ? cur.detourAllowKm : '10' });
        if (cur.dropoffRadiusKm) params.set('destinationRadiusKm', cur.dropoffRadiusKm);
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
            // 폼은 **국면별 저장값**에서 채운다 (평면 필터가 아니라).
            // 평면에는 지금 국면의 값 한 벌뿐이라, 거기서 다섯 탭을 채우면 전부 같은 값이 된다
            if (phaseSettings) setForms(mapToForm(phaseSettings));
            // 지금 상황에 맞는 탭을 열어 준다 — 국면 판정은 shared 의 resolvePhaseKey 하나로
            setTab(activePhase);
            setBlacklist(filter.excludedKeywords ? filter.excludedKeywords.join(',') : "");
            setDirtyTabs(new Set());
            setBlacklistDirty(false);
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
        // 다섯 탭을 **모두** 평소값으로 되돌린다 (한 탭만 되돌리면 나머지가 오늘값으로 남아 섞인다)
        if (basePhaseSettings) setForms(mapToForm(basePhaseSettings));
        setBlacklist(baseFilter.excludedKeywords ? baseFilter.excludedKeywords.join(',') : "");
        // 폼과 서버가 달라진 상태다 — 저장을 눌러야 반영된다는 뜻으로 전부 dirty
        setDirtyTabs(new Set(PHASE_KEYS));
        setBlacklistDirty(true);
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
        logRoadmapEvent("웹", `필터 저장 (${saveAsDefault ? '앞으로 계속' : '오늘만'}) — 변경된 탭: ${[...dirtyTabs].join(',') || '없음'}`);

        /**
         * 🔴 **고친 탭만 저장한다.**
         *
         * 예전에는 저장 버튼 하나가 폼 전체를 평면 필터로 밀어 넣었다. 그래서 합짐 탭을
         * 보며 저장해도 첫짐 값까지 같이 나갔고, 국면이 바뀌는 순간 덮여 버렸다.
         * 이제 국면 하나가 저장의 단위다 (§2-4).
         *
         * `allowedVehicleTypes` 를 **보내지 않는 이유**는 그대로다 — 허용 차종은 입력이
         * 아니라 파생값이고, 여기서 보내면 서버가 `if (!changes.allowedVehicleTypes)` 에
         * 걸려 자기 계산을 건너뛴다 (2026-08-10 사고).
         */
        for (const key of dirtyTabs) {
            const prev = phaseSettings?.[key] ?? DEFAULT_PHASE_SETTINGS[key];
            savePhase(key, toSettings(forms[key], prev), saveAsDefault);
        }

        // 제외 키워드만 다섯 탭 공통이라 평면 필터로 간다
        if (blacklistDirty) {
            updateFilter({
                excludedKeywords: blacklist ? blacklist.split(',').map(t => t.trim()).filter(Boolean) : [],
                userOverrides: true,
            }, saveAsDefault);
        }

        onClose();
    };

    const isSharedMode = filter.isSharedMode;

    // ── 적재 칸 (서버 파생값을 그대로 쓴다) ──
    const slotsUsed = Math.round(filter.slotsUsed ?? 0);
    const remainSlots = Math.max(0, TRUCK_CAPACITY_SLOTS - slotsUsed);
    /** 하한표 예시 금액용 거리 — 지금 탭이 보는 대표 거리 */
    const exampleKm = tab === 'local' ? 15 : (parseInt(cur.dropoffRadiusKm, 10) || 0) + 50;
    const destKeywordsLimit = filter.destinationKeywords || [];

    /**
     * 미리보기가 무엇을 그릴지는 **지금 탭**이 정한다.
     * 경유를 쓰는 탭(합짐·운행중)이면 회랑, 아니면 도착 도시 주변이다.
     * 예전에는 `isSharedMode`(지금 합짐이냐) 로 갈랐는데, 그러면 첫짐을 사냥하는 중에
     * 합짐 탭을 열어 미리보기를 눌러도 **첫짐 기준**이 그려졌다.
     */
    const previewByCorridor = shown.detourAllowKm === 'input';
    /** `auto` 인 탭에서는 서버가 정한 지금 도착 도시를 그대로 보여준다 (지어내지 않는다) */
    const previewCity = shown.destinationCity === 'input'
        ? cur.destinationCity
        : (filter.destinationCity || '');

    /** 지금 탭의 눈높이(단가 할인율) — 국면마다 따로 기억한다 */
    const eyeline = parseFloat(cur.discountPct);

    const handleBlacklistChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value;
        // 다중 엔터 방지 (줄바꿈을 콤마로 치환)
        val = val.replace(/[\r\n]+/g, ',');
        // 허용되지 않은 특수문자 제거 (한글, 영문, 숫자, 공백, 콤마만 허용)
        val = val.replace(/[^a-zA-Z0-9가-힣\s,]/g, '');
        // 콤마 다중 연타 방지
        val = val.replace(/,+/g, ',');
        setBlacklist(val);
        setBlacklistDirty(true);
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
                    {TABS.map(key => {
                        const on = tab === key;
                        const isNow = key === activePhase;
                        return (
                            <button
                                key={key}
                                onClick={() => setTab(key)}
                                className={`relative py-2 rounded-md text-[11px] font-black transition-all ${on
                                    ? 'bg-surface border border-border text-text-primary'
                                    : 'text-text-muted hover:bg-surface-hover/50'}`}
                            >
                                {isNow && <span title="지금 이 국면" className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_6px_var(--theme-glow-primary)]" />}
                                {dirtyTabs.has(key) && <span title="저장 안 한 변경이 있습니다" className="absolute top-1 left-1.5 w-1.5 h-1.5 rounded-full bg-warning" />}
                                {PHASE_LABEL[key]}
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
                                            onClick={() => setField('discountPct', String(step.value))}
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

                    {/* ── 국면 설정 — **무엇을 보여줄지는 PHASE_FIELDS 가 정한다** (§2-4) ──
                        다섯 탭이 같은 5개 키를 갖고, 탭마다 표시만 다르다.
                        기사님: *"모든 탭마다 키를 가지고 있고 탭마다 디스플레이만 달리해서 숨기고 노출."*
                        🔴 여기에 탭별 if 를 다시 쓰지 말 것 — 표가 유일한 원천이다 */}
                    <div className={`bg-surface/60 backdrop-blur-md p-3 rounded-xl border ${TAB_STYLE[tab].box} shadow-lg space-y-2.5`}>
                        <div className="flex items-center justify-between">
                            <span className={`text-[12px] font-black ${TAB_STYLE[tab].text}`}>{TAB_HINT[tab]}</span>
                            {tab === activePhase
                                ? <span className="text-[9px] font-black text-success">● 지금 이 국면</span>
                                : <span className="text-[9px] font-bold text-text-muted/70">이 국면이 되면 적용됩니다</span>}
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            {GEO_FIELDS.map(f => {
                                const mode = shown[f];
                                if (mode === 'hidden') return null;

                                /* 자동 칸 — 왜 못 고치는지를 화면이 말한다 (빈 칸으로 두면 고장으로 보인다) */
                                if (mode === 'auto') {
                                    return (
                                        <div key={f} className="space-y-1">
                                            <label className="block text-[10px] font-bold text-text-muted pl-1">{PHASE_FIELD_LABEL[f]}</label>
                                            <div className="h-9 flex items-center justify-center px-1 rounded-md bg-surface-alt/30 border border-dashed border-border text-[9px] text-text-muted/80 text-center leading-tight">
                                                자동 · {PHASE_AUTO_SOURCE[tab]}
                                            </div>
                                        </div>
                                    );
                                }

                                if (f === 'destinationCity') {
                                    return (
                                        <div key={f} className="space-y-1">
                                            <label className="block text-[10px] font-bold text-text-muted pl-1">{PHASE_FIELD_LABEL[f]}</label>
                                            <select
                                                value={cur.destinationCity}
                                                onChange={(e) => setField('destinationCity', e.target.value)}
                                                className={`w-full h-9 bg-surface-alt/50 border ${TAB_STYLE[tab].input} rounded-md px-2 text-[13px] ${TAB_STYLE[tab].text} font-bold outline-none shadow-inner appearance-none`}
                                            >
                                                {/* 아직 안 골랐거나, 목록에 없는 값이 저장돼 있을 때.
                                                    여기서 다른 도시를 대신 보여주면 화면이 필터를 잘못 말하게 된다 */}
                                                {!knownCities.includes(cur.destinationCity) && (
                                                    <option value={cur.destinationCity}>
                                                        {cur.destinationCity ? `⚠️ ${cur.destinationCity} (목록에 없음)` : '— 선택 —'}
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
                                    );
                                }

                                return (
                                    <div key={f} className="space-y-1">
                                        <label className="block text-[10px] font-bold text-text-muted pl-1">{PHASE_FIELD_LABEL[f]}</label>
                                        <div className="relative">
                                            <Input
                                                type="number"
                                                value={cur[f]}
                                                onChange={(e) => setField(f, e.target.value)}
                                                className={`bg-surface-alt/50 ${TAB_STYLE[tab].input} pr-8 ${TAB_STYLE[tab].text} font-bold h-9 text-center`}
                                            />
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted font-black pointer-events-none text-[9px]">KM</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* 경유 허용이 무슨 뜻인지 — 기사님 정의를 그대로 (§3).
                            "카카오 지도에서 총 100km 였는데 경유를 하니 총 거리가 105km 가 되는 경우" */}
                        {shown.detourAllowKm === 'input' && (
                            <p className="text-[10px] text-text-muted leading-relaxed">
                                <b className={TAB_STYLE[tab].text}>경유 허용</b> = 카카오 <b className="text-text-primary">총거리가 늘어나는 만큼</b> (100km → 105km 면 5km).
                                {cur.detourAllowKm === '0' && ' 0 이면 가는 길 위의 콜만 잡습니다 — 사냥을 멈추는 게 아닙니다.'}
                            </p>
                        )}

                        {/* 탭마다 다른 것은 **행동**뿐이다 — 값 입력은 위의 표가 다 그린다 */}
                        {tab === 'drive' && (
                            <p className="text-[10px] text-text-muted/70">
                                🚀 출발은 <b className="text-text-primary">지도 좌하단 버튼</b>에 있습니다 (운전 중에 팝업을 열지 않도록).
                            </p>
                        )}

                        {tab === 'local' && (
                            <>
                                <p className="text-[10px] text-text-muted leading-relaxed">
                                    상차지와 하차지가 <b className="text-text-primary">모두 같은 시</b>여야 통과합니다.
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
                            </>
                        )}

                        {tab === 'home' && (
                            <>
                                <p className="text-[10px] text-text-muted leading-relaxed">
                                    기점은 <b className="text-text-primary">짐이 남았으면 마지막 하차지</b>, 다 내렸으면 <b className="text-text-primary">현재 위치</b>입니다.
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
                                            logRoadmapEvent("웹", "귀가콜 시작 버튼 클릭 (복귀 국면 값으로)");
                                            setHomeReturnLoading(true);
                                            const home = toSettings(forms.home, phaseSettings?.home ?? DEFAULT_PHASE_SETTINGS.home);
                                            socket.emit("create-home-return", {
                                                corridorRadiusKm: home.detourAllowKm,
                                                destinationRadiusKm: home.dropoffRadiusKm
                                            });
                                        }}
                                        disabled={homeReturnLoading || hasHomeReturnActive}
                                        className={`h-10 rounded-xl bg-gradient-to-r from-accent-alt to-accent-alt/70 text-white font-black text-[11px] ${homeReturnLoading || hasHomeReturnActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {homeReturnLoading ? '⏳ 계산중' : hasHomeReturnActive ? '🏠 진행중' : '🏠 귀가콜 만들기'}
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>

                    {/* 독립 섹션: 현재 타겟팅 지역 목록 검증 및 미리보기 통합 UI */}
                    <div className="bg-surface/60 backdrop-blur-md p-2 rounded-xl border border-border shadow-lg mt-1">
                        <div className="w-full flex items-center justify-between p-1.5 rounded-md bg-surface-alt/50 transition-colors">
                            <div 
                                className="flex items-center gap-2 flex-1 cursor-pointer group"
                                onClick={() => setIsAccordionOpen(!isAccordionOpen)}
                            >
                                <span className="text-[11px] font-medium text-text-muted group-hover:text-text-primary transition-colors">
                                    {previewByCorridor
                                        ? `🛣️ 회랑 지역 (경유 +${cur.detourAllowKm !== '' ? cur.detourAllowKm : '?'}km)`
                                        : `📍 도착 지역 (${previewCity || '자동'})`}
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
                                        if (previewByCorridor) handlePreviewCorridor();
                                        else handlePreviewRegions(previewCity);
                                    }}
                                    disabled={isPreviewLoading || (!previewByCorridor && !previewCity)}
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
