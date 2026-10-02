import fs from "fs";
import path from "path";
import { SHOT_KEEP_DAYS } from "../../src/core/anomalyShots";

/**
 * 📷 이상 기록 사진은 가리지 않은 원본이다(reviews/37) — 그래서 두 가지가 꼭 지켜져야 한다.
 * ① 30일 지우기가 서버 기동과 함께 돈다 ② 사진은 운영센터 문(requireOps) 하나로만 열리고, 회원 문은 사진 칸을 안 낸다.
 */
const SRC = path.resolve(__dirname, "../../src");
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");

describe("📷 이상 기록 사진 — 지우기 · 여는 문", () => {
    it("보관 날수는 30일이다", () => {
        expect(SHOT_KEEP_DAYS).toBe(30);
    });
    it("서버 기동이 30일 지우기 주기를 건다", () => {
        expect(read("index.ts")).toMatch(/\bstartShotSweep\(\)/);
    });
    it("사진 파일을 여는 곳(shotFileOf)은 routes 가운데 ops.ts 뿐이다", () => {
        const routes = fs.readdirSync(path.join(SRC, "routes")).filter(f => f.endsWith(".ts"));
        const openers = routes.filter(f => /\bshotFileOf\b/.test(read(path.join("routes", f))));
        expect(openers.filter(f => f !== "ops.ts")).toEqual([]);
    });
    it("ops.ts 라우터는 운영센터 문지기(requireAuth, requireOps) 아래에 붙는다", () => {
        expect(read("index.ts")).toMatch(/app\.use\("\/api\/ops",\s*requireAuth,\s*requireOps,\s*opsRouter\)/);
    });
    it("회원 문(GET /api/telemetry/anomalies)은 SELECT * 를 쓰지 않고 사진 칸을 안 낸다", () => {
        const src = read("routes/telemetry.ts");
        const get = src.slice(src.indexOf('router.get("/anomalies"'));
        const sql = get.slice(get.indexOf("db.prepare("), get.indexOf("ORDER BY"));
        expect(sql).not.toMatch(/SELECT \*/);
        expect(sql).not.toMatch(/screenshot_path/);
    });
    it("사진이 실리는 이상 보고 문만 본문 한도를 늘린다 — 전역 파서보다 먼저", () => {
        const src = read("index.ts");
        const route = src.indexOf('app.use("/api/telemetry/anomalies", express.json(');
        const global = src.indexOf("app.use(express.json());");
        expect(route).toBeGreaterThan(-1);
        expect(route).toBeLessThan(global);
    });
});
