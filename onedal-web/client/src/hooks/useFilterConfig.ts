import { useState, useEffect } from "react";
import { socket } from "../lib/socket";
import type { AutoDispatchFilter } from "@onedal/shared";
import { logRoadmapEvent } from "../lib/roadmapLogger";

export function useFilterConfig() {
    const [filter, setFilter] = useState<AutoDispatchFilter | null>(null);

    useEffect(() => {
        // 소켓 이벤트 핸들러 구독
        const onFilterInit = (initialFilter: AutoDispatchFilter) => {
            setFilter(initialFilter);
        };

        const onFilterUpdated = (updatedFilter: AutoDispatchFilter) => {
            setFilter(updatedFilter);
        };

        socket.on("filter-init", onFilterInit);
        socket.on("filter-updated", onFilterUpdated);

        // 컴포넌트가 마운트될 때 (이미 소켓이 최초 연결을 끝낸 뒤일 수 있으므로) 서버에 최신 상태를 명시적으로 달라고 요청합니다.
        socket.emit("request-filter-init");

        // 만약 이미 소켓이 연결되어 있고 서버에서 init을 보낸 후라면
        // 다시 받기 위해 emit을 활용할 수도 있지만, 우선 접속 시 보내주므로 대기
        return () => {
            socket.off("filter-init", onFilterInit);
            socket.off("filter-updated", onFilterUpdated);
        };
    }, []);

    // 프론트엔드에서 필터값을 임의로 즉시 업데이트 후 서버로 전송 (Optimisitc UI)
    const updateFilter = (newFilter: Partial<AutoDispatchFilter>) => {
        // 로컬 상태 선반영
        if (filter) {
            setFilter({ ...filter, ...newFilter });
        }
        // 서버로 방출
        logRoadmapEvent("웹", "필터 설정(첫콜) 및 서버 소켓 전송");
        socket.emit("update-filter", newFilter);
    };

    return { filter, updateFilter };
}
