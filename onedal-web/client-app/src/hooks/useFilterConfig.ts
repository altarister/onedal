import { useEffect } from "react";
import { socket } from "../lib/socket";
import type { AutoDispatchFilter } from "@onedal/shared";
import { logRoadmapEvent } from "../lib/roadmapLogger";
import { useFilterStore, ensureFilterSocketSubscribed } from "../stores/filterStore";

/**
 * 필터를 읽고 바꾸는 훅.
 *
 * 🔴 **소켓 구독은 여기에 없다.** `filterStore` 가 앱 전체에서 한 번만 건다 —
 *    이 훅은 컴포넌트 여럿이 부르는데, 훅마다 `socket.on` 을 걸면 서버가 1번 보낸 것을
 *    **부른 수만큼 처리한다**. 이유는 `stores/filterStore.ts` 에 적어 뒀다.
 */
export function useFilterConfig() {
    const { filter, baseFilter, setFilter, setBaseFilter } = useFilterStore();

    useEffect(() => { ensureFilterSocketSubscribed(); }, []);

    /**
     * 필터를 바꾼다 (Optimistic UI).
     *
     * @param saveAsDefault **"앞으로 계속"** — 평소 설정(baseFilter)까지 바꾼다.
     *   기본은 **오늘만**이다. 자정에 평소 설정으로 되돌아간다.
     *
     * 🔴 `saveAsDefault` 가 없으면 baseFilter 는 화면에서도 안 바꾼다.
     *    서버는 activeFilter 만 바꾸므로, 화면만 둘 다 바꾸면 새로고침 때 baseFilter 가
     *    원래 값으로 돌아와 두 필터가 같은 것처럼 보이다가 갑자기 달라진다.
     */
    const updateFilter = (newFilter: Partial<AutoDispatchFilter>, saveAsDefault = false) => {
        // 오늘 콜 잡기는 언제나 바뀐다
        if (filter) {
            /**
             * 📏 **잰 거리(`radiusDistanceKm`)만은 화면이 미리 바꾸지 않는다**.
             *    이 값은 서버가 «내 위치 → 목적지»로 **재서 실어 보내는** 것이라 화면이 답을 모른다.
             *    [↻ 다시 구하기]가 화면까지 비우면 «거리 못 잼»이 되어 배율이 1 로 돌아가는데,
             *    서버가 같은 자리에서 다시 재면 값이 같아 방송이 걸러져 **그 상태에 갇힌다** —
             *    그동안 화면은 두 배 넓은 반경을 말하고 서버는 줄인 반경으로 거른다.
             */
            const shown: Partial<AutoDispatchFilter> = { ...newFilter };
            delete shown.radiusDistanceKm;
            setFilter({ ...filter, ...shown });
        }
        // 평소 설정은 그렇게 하겠다고 했을 때만 바뀐다 — 서버 동작과 화면을 맞춘다
        if (saveAsDefault && baseFilter) {
            setBaseFilter({ ...baseFilter, ...newFilter });
        }
        logRoadmapEvent("웹", `서버에게 update-filter 전달 (${saveAsDefault ? '서버 저장' : '메모리만'})`);
        socket.emit("update-filter", saveAsDefault ? { ...newFilter, saveAsDefault: true } : newFilter);
    };

    /**
     * 🎚️ **끄는 동안 — 화면만 바꾼다. 소켓을 안 탄다**.
     *
     * 기사님: *"값을 조절할때 움직일때 **영역을 바꿔 주면 좋겠어**. 그래야 그걸 보고
     * **한번에 조절** 하니까."*
     *
     * 🔴 **지도는 서버를 안 기다린다.** «상차» · «하차» 레이어가 shared 함수(`goalZonesOf` · `quadOutline`)를 **클라에서** 부른다
     *    계산이 가벼워 손가락을 따라간다. 그러니 손가락이 움직이는 동안
     *    화면을 바꾸는 데 필요한 것은 `setFilter` 하나뿐이다.
     * 🔴 **그런데도 소켓은 안 탄다.** 끄는 동안 픽셀마다 `update-filter` 를 쏘면 서버가
     *    그때마다 경유 지역을 다시 파생하고(지리 연산) 그 결과를 **앱에까지** 내려보낸다.
     *    바뀌는 것이 보여야 하는 것은 **기사님 화면**이지 앱이 아니다.
     * ⚠️ 그래서 이것으로 바꾼 값은 **손을 뗄 때 `updateFilter` 로 한 번 더** 보내야 한다.
     *    안 보내면 새로고침에 사라진다 — 부르는 쪽이 짝을 맞춘다.
     */
    const previewFilter = (newFilter: Partial<AutoDispatchFilter>) => {
        if (filter) {
            setFilter({ ...filter, ...newFilter });
        }
    };

    /**
     * 🥣 **국면 값 다섯도 `updateFilter` 하나로 간다** — 마름모·제외지역과 같은 길이다.
     *    값이 한 벌이라 «어느 국면의 값인가»를 따로 실어 보낼 것이 없다.
     */
    return { filter, baseFilter, updateFilter, previewFilter };
}
