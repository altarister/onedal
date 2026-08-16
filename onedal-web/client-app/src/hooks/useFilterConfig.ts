import { useEffect } from "react";
import { socket } from "../lib/socket";
import type { AutoDispatchFilter, PhaseKey, PhaseSettings } from "@onedal/shared";
import { logRoadmapEvent } from "../lib/roadmapLogger";
import { useFilterStore, ensureFilterSocketSubscribed } from "../stores/filterStore";

/**
 * 필터를 읽고 바꾸는 훅.
 *
 * 🔴 **소켓 구독은 여기에 없다.** `filterStore` 가 앱 전체에서 한 번만 건다 —
 *    이 훅은 컴포넌트 5개가 부르는데, 훅마다 `socket.on` 을 걸면 서버가 1번 보낸 것을
 *    **5번 처리한다** (2026-08-14 실측). 이유는 `stores/filterStore.ts` 에 적어 뒀다.
 */
export function useFilterConfig() {
    const { filter, baseFilter, phaseSettings, basePhaseSettings, setFilter, setBaseFilter } = useFilterStore();

    useEffect(() => { ensureFilterSocketSubscribed(); }, []);

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
        // 오늘 콜 잡기은 언제나 바뀐다
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

    /**
     * **한 국면의 설정만** 저장한다 (§2-4).
     *
     * 평면 필터(`updateFilter`)와 통로를 나눈 이유: 어느 탭을 고쳤는지는 평면에 안 담긴다.
     * 평면으로 보내면 서버가 "지금 국면"으로 추측할 수밖에 없어,
     * **합짐 탭에서 고친 값이 첫짐에 저장되는** 사고가 난다.
     *
     * 낙관적 반영은 하지 않는다 — 서버가 곧바로 `filter-updated` 로 확정본을 돌려준다.
     * (여기서 미리 그리면 서버가 정규화한 값과 화면이 갈라진다)
     */
    const savePhase = (phase: PhaseKey, settings: PhaseSettings, saveAsDefault = false) => {
        logRoadmapEvent("웹", `서버에게 save-phase-settings 전달 — ${phase} (${saveAsDefault ? '앞으로 계속' : '오늘만'})`);
        socket.emit("save-phase-settings", { phase, settings, saveAsDefault });
    };

    return { filter, baseFilter, phaseSettings, basePhaseSettings, updateFilter, savePhase };
}
