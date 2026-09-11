import { readFileSync } from "fs";
import { join } from "path";

const read = (rel: string) => readFileSync(join(__dirname, "../../src", rel), "utf8");
const readShared = (rel: string) => readFileSync(join(__dirname, "../../../shared/src", rel), "utf8");

/** 주석을 걷어낸 **코드만** — 옛 이름이 주석에 남아 거짓 초록을 만들지 않게 (규칙 문서 참조) */
const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 🖥️ **현황판이 서버에 요구하는 규격** (2026-09-12 · 현황판 담당 요청 세 건).
 *
 * 기사님이 전해 주신 요청서 그대로다. 현황판(`client-app/src/statusboard/**`)은
 * **다른 담당의 영역**이고 그쪽 화면은 이미 이 규격을 기다리는 상태라,
 * 서버가 채우면 그쪽 수정 없이 뜬다. 그래서 **깨지면 안 되는 계약**이다.
 *
 * 🔴 여기 셋은 전부 «현황판이 읽는 것»이다 — 서버 안에서만 쓰는 값이 아니다.
 *    이름이나 모양을 바꾸려면 **그 담당에게 먼저 알린다** (CLAUDE.md 「여럿이 한 작업 트리」).
 */

/* ══════════════════════════════════════════════════════════════════════════
 * ① 내 위치가 «어디서 왔나» — 출처를 그대로 남긴다
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * 📍 **한 플래그가 두 사실을 답하고 있었다** (규칙 ⑤-4 ⑤ · 2026-09-12).
 *
 * 현황판 담당: *"sim.ts 는 `driverLocationIsMock` 을 보고 `manual` 을 답하는데
 * … **시뮬은 그대로 mock 으로 보내므로 문제는 남아 있습니다.**"*
 *
 * 🔴 **실측으로 확인한 것** (소켓에 좌표를 직접 쏴 봤다):
 *      `source:'mock'` → `manual` · `source:'real'` → `gps`
 *    **켜는 자리는 있었다.** 진짜 문제는 **이름이 거짓말하는 것**이다 —
 *    `manual`(손으로 찍음)이라 적히는데 실제로 오는 것은 **시뮬레이터**다.
 *
 * 🔴 그래서 `driverLocationIsMock`(«지어낸 좌표인가» — 걷어낼지 판단) 과
 *    `driverLocationSource`(«어디서 왔나» — 화면이 적을 말) 를 **가른다.**
 *    「손으로 찍기」는 현황판에 앞으로 생길 기능이라 자리를 미리 가려 둔다.
 */
describe('① 내 위치의 출처를 그대로 남긴다 (현황판 ①)', () => {
    const store = read('state/userSessionStore.ts');
    const geo = codeOnly(read('services/geoService.ts'));
    const sim = codeOnly(read('routes/sim.ts'));

    it('🔴 세션에 «출처» 칸이 따로 있다 — 모의와 손찍기를 가른다', () => {
        expect(store).toMatch(/driverLocationSource/);
        /* 네 갈래가 타입으로 못박혀 있어야 한다 — 문자열을 아무거나 넣으면 화면이 조용히 빈다 */
        expect(store).toMatch(/'gps'\s*\|\s*'mock'\s*\|\s*'manual'\s*\|\s*'home'/);
    });

    it('🔴 좌표가 들어오는 문에서 그 자리에 «온 그대로» 적는다', () => {
        expect(geo).toMatch(/session\.driverLocationSource\s*=/);
    });

    it('🔴 sim 이 그 칸을 그대로 답한다 — 제 손으로 다시 판단하지 않는다', () => {
        expect(sim).toMatch(/driverLocationSource/);
        /* ⚠️ 옛 파생식이 남아 있으면 «시뮬인데 손찍음»이라고 또 말한다 */
        expect(sim).not.toMatch(/driverLocationIsMock\s*\?\s*'manual'/);
    });

    it('🔴 «집 주소로 대신»은 여전히 이긴다 — 좌표가 없다는 사실이 먼저다', () => {
        const i = sim.indexOf('source:');
        expect(i).toBeGreaterThan(-1);
        const line = sim.slice(i, sim.indexOf('\n', sim.indexOf('\n', i) + 1));
        expect(line).toMatch(/driverLocationIsFallback/);
    });
});

/* ══════════════════════════════════════════════════════════════════════════
 * ② 폰이 «든» 필터 지문을 남긴다
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * 📱 **대조만 하고 버리고 있었다** (현황판 담당 요청 ② · 2026-09-12).
 *
 * 담당: *"앱은 `filterVersion` 을 매 scrap 에 싣고 서버는 **대조까지 하면서 저장을
 * 안 합니다.** `DeviceSession` 에 두 칸이면 「메인폰은 새 필터, 서브폰은 두 판 전」이
 * 폰 탭에 바로 보입니다."*
 *
 * 🔴 **저장하는 것은 «폰이 들고 온 것»이다** — 서버가 방금 내려보낸 것이 아니다.
 *    그래야 «아직 옛 필터로 돌고 있다»가 드러난다. 서버가 준 것을 적으면
 *    **언제나 최신으로 보여** 이 칸이 있으나 마나가 된다 (규칙 ⑤-4 ⑤).
 * ⚠️ `shared/` 는 세 앱이 함께 쓰는 겹치는 영역이라 고칠 때 서로 알린다.
 */
describe('② 폰이 든 필터 지문을 남긴다 (현황판 ②)', () => {
    const dto = readShared('index.ts');
    const scrap = codeOnly(read('routes/scrap.ts'));

    it('🔴 DeviceSession 에 칸 둘이 있다 — 지문과 «언제 확인했나»', () => {
        const i = dto.indexOf('export interface DeviceSession');
        expect(i).toBeGreaterThan(-1);
        /* **그 인터페이스 안만** 본다 — 파일 전체를 훑으면 다른 타입의 같은 이름에 걸린다 */
        const body = dto.slice(i, dto.indexOf('\n}', i));
        expect(body).toMatch(/filterVersion\?: string/);
        expect(body).toMatch(/filterVersionAt\?: number/);
    });

    it('🔴 scrap 이 «폰이 보낸» 지문을 남긴다 — 서버가 준 것이 아니다', () => {
        expect(scrap).toMatch(/appFilterVersion/);
        const i = scrap.indexOf('const appFilterVersion');
        expect(i).toBeGreaterThan(-1);
        const line = scrap.slice(i, scrap.indexOf(';', i));
        expect(line).toMatch(/req\.body/);
    });
});

/* ══════════════════════════════════════════════════════════════════════════
 * ③ 올라온 콜을 읽는 문
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * 📋 **데이터는 이미 다 있다 — 읽는 문만 없었다** (현황판 담당 요청 ③ · 2026-09-12).
 *
 * 담당이 판단을 구한 둘에 답한다:
 *   · `type` 이 전부 `INTEL_BULK` 라 **잡은 콜과 버린 콜이 안 갈린다**
 *     → 1단계는 **«올라온 콜 전부»** 로 간다. 사유별 구분은 **앱이 함께 보내야** 하는 별건이다
 *   · 주소가 `normalizeAddress` 를 거친 짧은 이름(`분당구` → `구미동`)이다
 *     → 그대로 낸다. 여기서 되돌리면 **원장과 화면이 다른 말**을 한다 (규칙 ③)
 *
 * 🔴 **라이브에서는 404 다.** 기사님의 콜 목록이 통째로 나가는 문이라
 *    `/driver-location`·`/preflight` 와 **같은 문지기**를 쓴다.
 */
describe('③ 올라온 콜을 읽는 문 (현황판 ③)', () => {
    const sim = read('routes/sim.ts');

    it('🔴 /intel 라우트가 있다', () => {
        expect(sim).toMatch(/router\.get\(["']\/intel["']/);
    });

    it('🔴 개발 빌드에서만 열린다 — 기사님 콜 목록이 나가는 문이다', () => {
        const i = sim.indexOf(`router.get("/intel"`);
        expect(i).toBeGreaterThan(-1);
        /* **그 라우트 안만** 본다 — 다른 라우트의 문지기에 걸려 거짓 초록이 되지 않게 */
        const body = sim.slice(i, sim.indexOf('\n});', i));
        expect(body).toMatch(/isDevBuild\(\)/);
        expect(body).toMatch(/404/);
    });

    it('🔴 limit 은 받되 상한이 있다 — 41행이 4만 행이 될 날이 온다', () => {
        const i = sim.indexOf(`router.get("/intel"`);
        const body = sim.slice(i, sim.indexOf('\n});', i));
        expect(body).toMatch(/limit/);
        expect(body).toMatch(/Math\.min/);
    });
});
