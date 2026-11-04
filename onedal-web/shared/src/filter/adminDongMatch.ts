import { ADMIN_DONGS } from './adminDongs';
import { DONG_CENTROIDS } from './dongCentroids';

/**
 * 🗺️ **목적지 묶음에 행정동을 더한다 — 판단 한 곳** (기사님 «가» · onedal-69 · f5 와 한 벌).
 *    픽커 화면은 행정동 이름(위례동 · 광남1동 · 역삼1동 · 처인구 중앙동)을 쓰고 명부(dongCentroids)는 법정동뿐이다.
 *    서버가 목적지 낱말을 펼 때 이 함수를 부르면 원달앱 RegionMatch · 서버 anyRegionHit 이 같은 목록으로 행정동 주소를 맞춘다(원달앱 코드 무변화).
 *    🔴 노이즈: 행정동은 그 시구 묶음에 관할 법정동이 하나라도 있을 때만 더한다 — 반경 밖 동네를 끌어오지 않는다.
 *    🔴 되풀이해도 같다: 먼저 «이 시구의 법정동이 아닌 행정동»을 걷고 다시 센다 — 법정동이 빠지면 더했던 행정동도 걷힌다.
 */
/* 🧺 표는 처음 부를 때 만든다 — 맨 위에서 훑으면 이 함수를 안 쓰는 관제웹 덩어리에도 표가 실린다(번들러가 털어내지 못함) */
type Tables = { legalBySigungu: Map<string, Set<string>>; adminBySigungu: Map<string, Array<readonly [string, readonly string[]]>> };
let tables: Tables | null = null;
function tablesOf(): Tables {
    if (tables) return tables;
    const legalBySigungu = new Map<string, Set<string>>();
    for (const [name, sigungu] of DONG_CENTROIDS) {
        if (!legalBySigungu.has(sigungu)) legalBySigungu.set(sigungu, new Set());
        legalBySigungu.get(sigungu)!.add(name);
    }
    /** 시구 → [행정동, 관할 법정동들] — 그 시구의 법정동과 같은 이름인 행정동은 뺀다(명부가 이미 안다 · 걷을 때 법정동을 걷지 않게) */
    const adminBySigungu = new Map<string, Array<readonly [string, readonly string[]]>>();
    for (const [sigungu, admin, legal] of ADMIN_DONGS) {
        if (legalBySigungu.get(sigungu)?.has(admin)) continue;
        if (!adminBySigungu.has(sigungu)) adminBySigungu.set(sigungu, []);
        adminBySigungu.get(sigungu)!.push([admin, legal]);
    }
    return tables = { legalBySigungu, adminBySigungu };
}

export function withAdminDongs(grouped: Readonly<Record<string, readonly string[]>>): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [sigungu, dongs] of Object.entries(grouped)) {
        const admins = tablesOf().adminBySigungu.get(sigungu) ?? [];
        const adminNames = new Set(admins.map(([a]) => a));
        const legal = dongs.filter(d => !adminNames.has(d));
        const have = new Set(legal);
        const add = admins.filter(([, ls]) => ls.some(l => have.has(l))).map(([a]) => a);
        out[sigungu] = [...legal, ...add.filter(a => !have.has(a))];
    }
    return out;
}

/**
 * 🏘️ 이름이 여러 시구에 걸린 행정동 — 행정동끼리(위례동 = 수정구 · 송파구) 또는 다른 시구의 법정동과(처인구 중앙동 ↔ 중원구 중앙동).
 *    서버가 이 이름에도 destinationDongSigungu(시구 꼴)를 붙여 «앞에 다른 시구가 보이면 거름»이 돈다.
 */
export const ADMIN_SAME_NAME_DONGS: ReadonlySet<string> = /* @__PURE__ */ (() => {
    const where = new Map<string, Set<string>>();
    const put = (name: string, sigungu: string) => { if (!where.has(name)) where.set(name, new Set()); where.get(name)!.add(sigungu); };
    for (const [sigungu, rows] of tablesOf().adminBySigungu) for (const [admin] of rows) put(admin, sigungu);
    const admins = new Set(where.keys());
    for (const [name, sigungu] of DONG_CENTROIDS) if (admins.has(name)) put(name, sigungu);
    return new Set([...where].filter(([, s]) => s.size > 1).map(([n]) => n));
})();
