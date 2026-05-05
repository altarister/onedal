import { create } from 'zustand';
import type { AutoDispatchFilter } from '@onedal/shared';

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

    // ── Actions ──
    setFilter: (filter: AutoDispatchFilter) => void;
    setBaseFilter: (filter: AutoDispatchFilter) => void;
    setBothFilters: (active: AutoDispatchFilter, base: AutoDispatchFilter) => void;
}

export const useFilterStore = create<FilterState>((set) => ({
    filter: null,
    baseFilter: null,

    setFilter: (filter) => set({ filter }),
    setBaseFilter: (filter) => set({ baseFilter: filter }),
    setBothFilters: (active, base) => set({ filter: active, baseFilter: base }),
}));
