import { create } from 'zustand';
import type { AutoDispatchFilter, PhaseSettingsMap } from '@onedal/shared';

/**
 * 필터 글로벌 상태 스토어
 * 
 * useFilterConfig 훅의 useState 묶음을 대체합니다.
 * 소켓 filter-init/filter-updated 이벤트에서 상태를 갱신합니다.
 */
interface FilterState {
    /** 현재 활성 필터 (서버 동기화 완료된 최신 값) */
    filter: AutoDispatchFilter | null;
    /** 기본 필터 (DB 저장 원본, 런타임 오버라이드 전) */
    baseFilter: AutoDispatchFilter | null;
    /** 국면별 설정 — 오늘 (§2-4). 탭이 이걸 편집한다 */
    phaseSettings: PhaseSettingsMap | null;
    /** 국면별 설정 — 평소 (DB). "평소값" 버튼이 이걸 불러온다 */
    basePhaseSettings: PhaseSettingsMap | null;

    // ── Actions ──
    setFilter: (filter: AutoDispatchFilter) => void;
    setBaseFilter: (filter: AutoDispatchFilter) => void;
    setBothFilters: (active: AutoDispatchFilter, base: AutoDispatchFilter) => void;
    setPhaseSettings: (today: PhaseSettingsMap, base: PhaseSettingsMap) => void;
}

export const useFilterStore = create<FilterState>((set) => ({
    filter: null,
    baseFilter: null,
    phaseSettings: null,
    basePhaseSettings: null,

    setFilter: (filter) => set({ filter }),
    setBaseFilter: (filter) => set({ baseFilter: filter }),
    setBothFilters: (active, base) => set({ filter: active, baseFilter: base }),
    setPhaseSettings: (today, base) => set({ phaseSettings: today, basePhaseSettings: base }),
}));
