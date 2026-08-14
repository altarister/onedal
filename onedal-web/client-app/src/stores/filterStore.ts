import { create } from 'zustand';
import type { AutoDispatchFilter, PhaseSettingsMap } from '@onedal/shared';
import { normalizePhaseSettings } from '@onedal/shared';
import { socket } from '../lib/socket';
import { logRoadmapEvent } from '../lib/roadmapLogger';

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

/* ══════════════════════════════════════════════════════════════════════════
 * 소켓 구독 — **한 번만** 한다
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * 🔴 **구독은 컴포넌트 수만큼 늘어나면 안 된다.**
 *
 * 2026-08-14 실측: 서버는 `filter-updated` 를 **1번** 보내는데 관제웹 콘솔에는 **5번** 찍혔다.
 * `useFilterConfig()` 를 부르는 컴포넌트가 5개고(`DeviceControlPanel` · `PinnedRoute` ·
 * `OrderFilterModal` · `VehicleStatusPanel` · `OrderFilterStatus`) **훅마다 `socket.on` 을
 * 걸었기 때문**이다. 달리는 동안 매초 이 일이 벌어졌다 —
 * 페이로드는 동 179개짜리라 `normalizePhaseSettings` 와 스토어 갱신이 초당 5벌 돌았다.
 *
 * 서버 쪽에서 "바뀐 것만 보낸다"로 줄여도 **여기서 5배로 되살아난다.**
 * 그래서 구독을 스토어로 끌어올린다 — 이 파일 맨 위 주석이 원래
 * *"소켓 이벤트에서 상태를 갱신합니다"* 라고 말하고 있었다. 코드가 이제 그 말과 맞는다.
 *
 * 해제하지 않는다. `socket` 은 페이지가 살아 있는 동안 하나뿐이고, 관제탑은 화면이 하나다.
 */
let subscribed = false;

type FilterPayload = {
    activeFilter: AutoDispatchFilter;
    baseFilter: AutoDispatchFilter;
    phaseSettings?: PhaseSettingsMap;
    basePhaseSettings?: PhaseSettingsMap;
};

export function ensureFilterSocketSubscribed(): void {
    if (subscribed) return;
    subscribed = true;

    /**
     * 국면별 설정(§2-4)은 **서버가 원천이다.** 옛 서버가 안 보내 줘도 화면이 죽지 않게
     * normalize 로 빈 곳을 기본값으로 채운다 (없는 값을 지어내는 게 아니라, 서버가
     * 아직 그 필드를 모르는 동안 화면이 그릴 수 있게 하는 것).
     */
    const apply = (p: FilterPayload) => {
        const st = useFilterStore.getState();
        st.setBothFilters(p.activeFilter, p.baseFilter);
        st.setPhaseSettings(normalizePhaseSettings(p.phaseSettings), normalizePhaseSettings(p.basePhaseSettings));
    };

    socket.on('filter-init', (p: FilterPayload) => {
        logRoadmapEvent('웹', '서버로 부터 filter-init 초기 필터값(isSharedMode, distance 등) 받음');
        apply(p);
    });
    socket.on('filter-updated', (p: FilterPayload) => {
        logRoadmapEvent('웹', '서버로 부터 filter-updated 소켓 이벤트 받음');
        apply(p);
    });

    /**
     * 서버는 소켓 접속마다 `filter-init` 을 **먼저 밀어준다.** 그래서 평소엔 요청하지 않는다
     * (요청하면 동 140개짜리 페이로드가 두 번 오간다 — 실측 37ms 안에 2회 도착한 적이 있다).
     * 다만 소켓이 이미 붙은 뒤에 이 구독이 시작되면 그 push 를 놓치므로, **비어 있을 때만** 부른다.
     */
    if (!useFilterStore.getState().filter) socket.emit('request-filter-init');
}
