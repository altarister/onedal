import { create } from 'zustand';
import type { AutoDispatchFilter } from '@onedal/shared';
/**
 * 🥣 **국면 설정 둘을 담던 자리가 여기 있었다** (`phaseSettings`·`basePhaseSettings` ·
 *    걷어냄 2026-09-11 · 이식 C3-3b).
 *    값이 한 벌이 되며 `filter`/`baseFilter` 안에 평면 이름으로 들어갔다 —
 *    담을 그릇이 따로 필요 없다.
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
    /** 국면별 설정 — 오늘 (§2-4). 탭이 이걸 편집한다 */
    /** 국면별 설정 — 평소 (DB). "평소값" 버튼이 이걸 불러온다 */

    /**
     * 🧾 **지도가 실제로 그린 그물의 읍·면·동 수** (이식 C4-11b · 2026-09-12).
     *
     * 🔴 **왜 store 에 두나 — 계산을 두 벌로 만들지 않으려고** (규칙 ③).
     *    요약줄이 `useCallNet` 을 제 손으로 또 부르면 **다른 답**이 나온다:
     *    그 훅이 먹는 `myLocation` 은 `useRouteDerivations` 안의 `useState` 라
     *    훅 인스턴스마다 따로 산다. 그래서 **무대가 한 번 계산한 것**을 여기 올린다.
     * 🔴 이 값은 **화면용 파생이지 필터의 일부가 아니다** — 서버로 안 간다.
     * ⚠️ 지도가 안 떠 있으면 `null` 이다 — 그때 요약줄은 서버가 내려준
     *    `destinationKeywords` 수로 물러선다 (지어내지 않는다 · 규칙 ④).
     */
    netCount: number | null;

    // ── Actions ──
    setNetCount: (n: number | null) => void;
    setFilter: (filter: AutoDispatchFilter) => void;
    setBaseFilter: (filter: AutoDispatchFilter) => void;
    setBothFilters: (active: AutoDispatchFilter, base: AutoDispatchFilter) => void;
}

export const useFilterStore = create<FilterState>((set) => ({
    filter: null,
    baseFilter: null,
    netCount: null,

    setNetCount: (n) => set({ netCount: n }),
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
 * 2026-08-14 실측: 서버는 `filter-updated` 를 **1번** 보내는데 관제웹 콘솔에는 **5번** 찍혔다.
 * `useFilterConfig()` 를 부르는 컴포넌트가 5개고(`DeviceControlPanel` · `PinnedRoute` ·
 * `OrderFilterModal` · `VehicleStatusPanel` · `OrderFilterStatus`) **훅마다 `socket.on` 을
 * 걸었기 때문**이다. 달리는 동안 매초 이 일이 벌어졌다 —
 * 페이로드는 동 179개짜리라 정규화와 스토어 갱신이 초당 5벌 돌았다.
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
