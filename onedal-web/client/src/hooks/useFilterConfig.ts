import { useState, useEffect } from "react";
import { socket } from "../lib/socket";
import type { AutoDispatchFilter } from "@onedal/shared";
import { logRoadmapEvent } from "../lib/roadmapLogger";

let lastFilterInitRequestTime = 0;

function requestFilterInitSafe() {
    const now = Date.now();
    if (now - lastFilterInitRequestTime > 1000) {
        lastFilterInitRequestTime = now;
        socket.emit("request-filter-init");
    }
}

export function useFilterConfig() {
    const [filter, setFilter] = useState<AutoDispatchFilter | null>(null); // activeFilter
    const [baseFilter, setBaseFilter] = useState<AutoDispatchFilter | null>(null);

    useEffect(() => {
        // 소켓 이벤트 핸들러 구독
        const onFilterInit = (payload: { activeFilter: AutoDispatchFilter, baseFilter: AutoDispatchFilter }) => {
            logRoadmapEvent("웹", "서버로 부터 filter-init 초기 필터값(isSharedMode, distance 등) 받음");
            setFilter(payload.activeFilter);
            setBaseFilter(payload.baseFilter);
        };

        const onFilterUpdated = (payload: { activeFilter: AutoDispatchFilter, baseFilter: AutoDispatchFilter }) => {
            logRoadmapEvent("웹", "서버로 부터 filter-updated 소켓 이벤트 받음");
            setFilter(payload.activeFilter);
            setBaseFilter(payload.baseFilter);
        };

        const onConnect = () => {
            logRoadmapEvent("웹", "서버 소켓 연결/재연결됨 → 최신 필터 상태 요청");
            requestFilterInitSafe();
        };

        socket.on("filter-init", onFilterInit);
        socket.on("filter-updated", onFilterUpdated);
        socket.on("connect", onConnect);

        // 컴포넌트가 마운트될 때 (이미 소켓이 최초 연결을 끝낸 뒤일 수 있으므로) 서버에 최신 상태를 명시적으로 달라고 요청합니다.
        requestFilterInitSafe();

        return () => {
            socket.off("filter-init", onFilterInit);
            socket.off("filter-updated", onFilterUpdated);
            socket.off("connect", onConnect);
        };
    }, []);

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
