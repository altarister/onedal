import { create } from 'zustand';
import type { AutoDispatchFilter } from '@onedal/shared';
/**
 * 🥣 **국면 설정을 담는 그릇은 따로 없다** — 값이 한 벌이라
 *    `filter`/`baseFilter` 안에 평면 이름으로 들어 있다.
 */
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

    /**
     * 🛣️ **무대가 하차 영역에 쓸 경로선을 가졌나** — 계산을 두 벌로 만들지 않으려고 무대가 올린다.
     *    🔄 이름(`netUsedLine`)은 «그물을 라인으로 쟀나»에서 왔지만 뜻은 «하차 영역에 쓸 경로선을 가졌나»다.
     *    필터 화면의 «⏳ 카카오 경로를 기다립니다» 가 이것을 본다: 노선인데 콜을 쥐었고
     *    아직 라인이 없으면(false) 마름모로 재고 있는 **이상한 상태**다 — 몰라선 안 된다.
     *    지도가 안 떠 있으면 `null`(모른다) — 그때는 문구를 안 띄운다 (규칙 ④).
     */
    netUsedLine: boolean | null;

    // ── Actions ──
    setNetUsedLine: (v: boolean | null) => void;
    setFilter: (filter: AutoDispatchFilter) => void;
    setBaseFilter: (filter: AutoDispatchFilter) => void;
    setBothFilters: (active: AutoDispatchFilter, base: AutoDispatchFilter) => void;
}

export const useFilterStore = create<FilterState>((set) => ({
    filter: null,
    baseFilter: null,
    netUsedLine: null,

    setNetUsedLine: (v) => set({ netUsedLine: v }),
    setFilter: (filter) => set({ filter }),
    setBaseFilter: (filter) => set({ baseFilter: filter }),
    setBothFilters: (active, base) => set({ filter: active, baseFilter: base }),
}));

/* ══════════════════════════════════════════════════════════════════════════
 * 소켓 구독 — **한 번만** 한다
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * 🔴 **구독은 컴포넌트 수만큼 늘어나면 안 된다.**
 *
 * `useFilterConfig()` 를 부르는 컴포넌트가 여럿이다(`DeviceControlPanel` · `PinnedRoute` ·
 * `OrderFilterModal` · `VehicleStatusPanel` · `OrderFilterStatus`). **훅마다 `socket.on` 을
 * 걸면**, 서버가 `filter-updated` 를 **1번** 보낼 때 관제웹에서는 컴포넌트 수만큼 돈다 —
 * 페이로드가 동 179개짜리라 달리는 동안 정규화와 스토어 갱신이 초당 여러 벌 돈다.
 *
 * 서버 쪽에서 "바뀐 것만 보낸다"로 줄여도 **여기서 다시 몇 배로 는다.**
 * 그래서 구독은 스토어에서 한 번 건다.
 *
 * 해제하지 않는다. `socket` 은 페이지가 살아 있는 동안 하나뿐이고, 관제탑은 화면이 하나다.
 */
let subscribed = false;

type FilterPayload = {
    activeFilter: AutoDispatchFilter;
    baseFilter: AutoDispatchFilter;
};

export function ensureFilterSocketSubscribed(): void {
    if (subscribed) return;
    subscribed = true;

    /**
     * 필터는 **서버가 원천이다.** 받은 두 벌(`activeFilter`·`baseFilter`)을 그대로 담는다 —
     * 여기서 빈 곳을 채우거나 고치지 않는다.
     */
    const apply = (p: FilterPayload) => {
        const st = useFilterStore.getState();
        st.setBothFilters(p.activeFilter, p.baseFilter);
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
     * (요청하면 동 140개짜리 페이로드가 두 번 오간다).
     * 다만 소켓이 이미 붙은 뒤에 이 구독이 시작되면 그 push 를 놓치므로, **비어 있을 때만** 부른다.
     */
    if (!useFilterStore.getState().filter) socket.emit('request-filter-init');
}
