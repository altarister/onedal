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

    // 프론트엔드에서 필터값을 임의로 즉시 업데이트 후 서버로 전송 (Optimisitc UI)
    const updateFilter = (newFilter: Partial<AutoDispatchFilter>) => {
        // 로컬 상태 선반영 (주로 baseFilter를 기반으로 모달이 동작하므로 base와 active 둘 다에 반영)
        if (filter) {
            setFilter({ ...filter, ...newFilter });
        }
        if (baseFilter) {
            setBaseFilter({ ...baseFilter, ...newFilter });
        }
        // 서버로 방출
        logRoadmapEvent("웹", "서버에게 새로 작성한 update-filter 정보 전달");
        socket.emit("update-filter", newFilter);
    };

    return { filter, baseFilter, updateFilter };
}
