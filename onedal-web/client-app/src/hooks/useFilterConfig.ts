import { useEffect } from "react";
import { socket } from "../lib/socket";
import type { AutoDispatchFilter } from "@onedal/shared";
import { logRoadmapEvent } from "../lib/roadmapLogger";
import { useFilterStore } from "../stores/filterStore";

let lastFilterInitRequestTime = 0;

function requestFilterInitSafe() {
    const now = Date.now();
    if (now - lastFilterInitRequestTime > 1000) {
        lastFilterInitRequestTime = now;
        socket.emit("request-filter-init");
    }
}

export function useFilterConfig() {
    const { filter, baseFilter, setBothFilters, setFilter, setBaseFilter } = useFilterStore();

    useEffect(() => {
        // 소켓 이벤트 핸들러 구독
        const onFilterInit = (payload: { activeFilter: AutoDispatchFilter, baseFilter: AutoDispatchFilter }) => {
            logRoadmapEvent("웹", "서버로 부터 filter-init 초기 필터값(isSharedMode, distance 등) 받음");
            setBothFilters(payload.activeFilter, payload.baseFilter);
        };

        const onFilterUpdated = (payload: { activeFilter: AutoDispatchFilter, baseFilter: AutoDispatchFilter }) => {
            logRoadmapEvent("웹", "서버로 부터 filter-updated 소켓 이벤트 받음");
            setBothFilters(payload.activeFilter, payload.baseFilter);
        };

        socket.on("filter-init", onFilterInit);
        socket.on("filter-updated", onFilterUpdated);

        // [Phase 6] 접속 시 요청(request-filter-init)은 더 이상 하지 않는다.
        //
        // 서버가 소켓 접속마다 filter-init 을 **먼저 밀어주므로**, 여기서 또 요청하면
        // 똑같은 페이로드(키워드 140개 포함)가 두 번 오간다. 실제로 측정해 보니
        // connect 직후 37ms 안에 filter-init 이 2회 도착했다.
        //
        // 다만 이 훅이 소켓 연결 이후에 마운트되면 그 push 를 놓치므로,
        // 아직 필터가 비어 있을 때만 한 번 요청한다.
        if (!useFilterStore.getState().filter) {
            requestFilterInitSafe();
        }

        return () => {
            socket.off("filter-init", onFilterInit);
            socket.off("filter-updated", onFilterUpdated);
        };
    }, [setBothFilters]);

    /**
     * 필터를 바꾼다 (Optimistic UI).
     *
     * @param saveAsDefault **"앞으로 계속"** — 평소 설정(baseFilter)까지 바꾼다.
     *   기본은 **오늘만**이다. 자정에 평소 설정으로 되돌아간다.
     *
     * 🔴 2026-08-12 — 예전에는 `saveAsDefault` 없이 **항상 baseFilter 에도 반영**했다.
     *    서버는 activeFilter 만 바꾸는데 화면만 둘 다 바꾼 것이다.
     *    그래서 새로고침하면 baseFilter 가 원래 값으로 돌아왔고,
     *    두 필터가 같은 것처럼 보이다가 갑자기 달라졌다.
     *    (기사님: *"사용자 설정에는 파주가 선택되어 있고 새로고침하고 필터 열어 보면 용인"*)
     */
    const updateFilter = (newFilter: Partial<AutoDispatchFilter>, saveAsDefault = false) => {
        // 오늘 사냥은 언제나 바뀐다
        if (filter) {
            setFilter({ ...filter, ...newFilter });
        }
        // 평소 설정은 그렇게 하겠다고 했을 때만 바뀐다 — 서버 동작과 화면을 맞춘다
        if (saveAsDefault && baseFilter) {
            setBaseFilter({ ...baseFilter, ...newFilter });
        }
        logRoadmapEvent("웹", `서버에게 update-filter 전달 (${saveAsDefault ? '앞으로 계속' : '오늘만'})`);
        socket.emit("update-filter", saveAsDefault ? { ...newFilter, saveAsDefault: true } : newFilter);
    };

    return { filter, baseFilter, updateFilter };
}
