/**
 * 🔎 **국면마다 필터가 어떻게 바뀌는가** — 첫짐 → 합짐 → 주행중
 *
 * 기사님(2026-08-25): *"첫짐 잡고 필터 보여 주고 합짐 잡고 필터 보여 주고 주행중 필터 보여줘"*
 *
 * 값은 지어내지 않는다 — 국면 설정은 **장부(user_filter_phases)** 에서, 경로는 **실제 주행에
 * 저장된 폴리라인**에서 가져오고, 목록은 서버가 쓰는 함수 그대로 부른다.
 */
import Database from "better-sqlite3";
import { initGeoService, getCityRegionsWithRadius, getDetourRegions, unionRegions } from "./src/services/geoService";

initGeoService();
const db = new Database("./local.db", { readonly: true });

const rows = db.prepare(
    `SELECT phase, destination_city AS city, pickup_radius_km AS pickup,
            detour_allow_km AS detour, dropoff_radius_km AS dropoff, discount_pct AS discount
     FROM user_filter_phases`
).all() as any[];
const P = Object.fromEntries(rows.map(r => [r.phase, r]));

// 첫짐이 만든 경로 — 야탑 → 여주 가남 (실제 주행에 저장된 것)
const row = db.prepare(`SELECT id, pickup, dropoff, routePolyline FROM orders
                        WHERE routePolyline IS NOT NULL
                        ORDER BY length(routePolyline) DESC LIMIT 1`).get() as any;
if (!row) { console.error("경로가 저장된 콜이 없습니다 — 한 판 돌린 뒤 다시 부르세요."); process.exit(1); }
const poly = JSON.parse(row.routePolyline);
console.log(`경로: ${String(row.pickup).slice(0, 24)} → ${String(row.dropoff).slice(0, 24)} · 점 ${poly.length}개`);

const line = (n = 74) => console.log("─".repeat(n));
const show = (title: string, note: string, body: () => void) => {
    console.log(`\n━━━ ${title} ━━━  ${note}`);
    body();
};
const dongs = (grouped: Record<string, string[]>) => {
    for (const [city, list] of Object.entries(grouped)) {
        console.log(`    ${city.padEnd(13)} ${list.join(" · ")}`);
    }
};

// ── ① 첫짐 — 빈 차. 경로가 없다 ──────────────────────────────────
show("첫짐 (STANDBY)", "빈 차 — 경로가 아직 없다", () => {
    const f = P.first;
    console.log(`  도착 목표   ${f.city} + ${f.dropoff}km`);
    console.log(`  상차지      내 위치 반경 ${f.pickup}km   ← 인성이 준 «거리»와 비교`);
    console.log(`  경로 순서   검사 안 함 (progressKm 비어 있음)`);
    const r = getCityRegionsWithRadius(f.city, f.dropoff) as any;
    console.log(`\n  하차 가능 지역 ${r.flat.length}개`);
    dongs(r.grouped);
    console.log(`  시 별칭 ${r.customCityFilters.length}개 — ${r.customCityFilters.slice(0, 8).join(" · ")}`);
});

// ── ② 합짐 — 첫 콜을 잡았다. 경로가 생겼다 ──────────────────────
const merged = (phaseKey: "merge" | "drive") => {
    const f = P[phaseKey];
    const detour = getDetourRegions(poly, f.detour, f.dropoff) as any;
    const u = unionRegions(detour, P.first.city, P.first.dropoff);
    return { f, detour, u };
};

show("합짐 (GATHERING)", "첫 콜을 잡아 경로가 생겼다", () => {
    const { f, detour, u } = merged("merge");
    console.log(`  도착 목표   ${P.first.city} + ${P.first.dropoff}km   ← 첫짐에서 상속 (저장 안 함)`);
    console.log(`  상차지      경로에서 ${f.detour}km 안        ← 내 위치 반경은 안 본다`);
    console.log(`  하차지 주변  마지막 하차지에서 ${f.dropoff}km`);
    console.log(`\n  경로 위(상차 가능) ${detour.flat.length}개`);
    dongs(detour.grouped);
    const extra = u.flat.filter((d: string) => !detour.flat.includes(d));
    console.log(`\n  + 도착 목표로 열린 곳(하차만 가능) ${extra.length}개`);
    console.log(`    ${extra.join(" · ") || "(없음)"}`);
    console.log(`\n  ▶ 하차 가능 = ${u.flat.length}개   ·   상차 가능 = ${detour.flat.length}개`);
});

// ── ③ 주행중 — 출발했다 ─────────────────────────────────────────
show("주행중 (DELIVERING)", "출발 — 경로가 좁아진다", () => {
    const { f, detour, u } = merged("drive");
    console.log(`  도착 목표   ${P.first.city} + ${P.first.dropoff}km   ← 그대로 상속`);
    console.log(`  상차지      경로에서 ${f.detour}km 안        ← 합짐 ${P.merge.detour}km 에서 좁아짐`);
    console.log(`  하차지 주변  마지막 하차지에서 ${f.dropoff}km`);
    console.log(`\n  경로 위(상차 가능) ${detour.flat.length}개`);
    dongs(detour.grouped);
    const extra = u.flat.filter((d: string) => !detour.flat.includes(d));
    console.log(`\n  + 도착 목표로 열린 곳(하차만 가능) ${extra.length}개`);
    console.log(`    ${extra.join(" · ") || "(없음)"}`);
    console.log(`\n  ▶ 하차 가능 = ${u.flat.length}개   ·   상차 가능 = ${detour.flat.length}개`);
});

console.log();
line();
console.log("상차 가능은 좁아지고, 하차 가능은 도착 목표 덕에 끝까지 유지된다.");
line();
