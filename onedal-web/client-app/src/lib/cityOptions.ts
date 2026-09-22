import { useEffect, useState } from 'react';
import { apiClient } from '../api/apiClient';

/**
 * 도착 목표 시/군 목록 — **출처는 지도 데이터 하나**다.
 *
 * 🔴 목록을 손으로 적지 않는다 (기사님: *"시나 혹은 도 정도의 범위로 가져와야 할 듯."*).
 *
 *    저장값과 목록이 어긋나면 화면이 **거짓말을 한다** — DB 에 `파주` 가 있고 목록에
 *    `파주시` 만 있으면 아무것도 안 맞고, 브라우저는 `<select>` 의 규칙대로 **첫 항목**을 그린다.
 *    서버 검색은 `pName.includes(city)` 라 `파주` 로도 돌아서 화면만 틀린 도시를 말한다.
 */
export interface CityGroup {
    sido: string;
    cities: string[];
}

export function useCityOptions() {
    const [groups, setGroups] = useState<CityGroup[]>([]);

    useEffect(() => {
        let alive = true;
        apiClient.get('/settings/cities')
            .then(({ data }) => { if (alive) setGroups(data.groups || []); })
            .catch(() => { /* 목록을 못 받아도 저장값은 아래 resolveCity 가 그대로 보여준다 */ });
        return () => { alive = false; };
    }, []);

    return groups;
}

/**
 * 저장된 값을 목록의 어느 항목으로 볼 것인가.
 *
 * 기사님: *"파주로 만들면 되는 거 아닌가? 그럼 DB 는 건드리지 않아도 될 듯한데."*
 *
 * 맞다. 다만 **접미사를 뗀 형태를 값으로 쓰면 나중에 부딪힌다** — 수도권 밖을 넣는 순간
 * `광주` 는 경기 광주시와 광주광역시 둘 다가 되고, `중구` 는 서울·인천 둘 다가 된다.
 *
 * 그래서 값은 지도 데이터의 정식 이름(`파주시`)으로 두되, **접미사 없는 저장값은 앞글자로 찾아 맞춘다.**
 * DB 는 그대로 두고, 다음에 저장하실 때 자연스럽게 정식 이름이 된다.
 *
 * 못 찾으면 `null` 이다 — 그때는 **다른 항목을 대신 보여주지 않는다.**
 * 화면이 조용히 틀린 도시를 말하는 것보다 "목록에 없음"이라고 하는 편이 낫다.
 */
export function resolveCity(saved: string, groups: CityGroup[]): string | null {
    if (!saved) return null;
    const all = groups.flatMap(g => g.cities);
    if (all.includes(saved)) return saved;

    // `파주` → `파주시`. 둘 이상 걸리면 고르지 않는다 (어느 쪽인지 모르므로)
    const prefixed = all.filter(c => c.startsWith(saved));
    return prefixed.length === 1 ? prefixed[0] : null;
}
