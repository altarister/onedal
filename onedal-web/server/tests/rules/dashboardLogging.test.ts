import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🖥️ **관제웹은 자기 로그를 스스로 남긴다** (필드테스트 1회차 ④ · 2026-08-25)
 *
 * ── 왜 ──
 * 2026-08-23 실주행 3시간 뒤, **관제웹이 그때 무엇을 하고 있었는지 알 방법이 없었다.**
 * GPS 를 언제 놓쳤는지 · 콜 카드가 떴는지 · 결재 버튼이 보였는지 전부 모른다.
 * `logRoadmapEvent` 는 `console.log` 한 줄이 전부였고, 콘솔은 주행이 끝나면 사라진다.
 * (그날은 폰 크롬으로 갔으니 `Capacitor/Console` 조차 0줄이었다)
 *
 * 기사님 기록(todo.md ④): *"A24폰 원달앱이 없었으면 1회차는 원인 불명으로 끝났다.
 * 같은 수준이 필요하다."*
 *
 * ── 지켜야 하는 것 셋 ──
 *   ① **HTTP 로 보낸다** — 소켓이 끊긴 걸 소켓으로 보낼 수는 없다.
 *      우리가 가장 알고 싶은 것이 *"주행 중 소켓이 몇 번 끊겼나"* 다.
 *   ② **못 보내면 되돌려 놓는다** — 통신이 끊긴 구간이야말로 나중에 봐야 할 자리다.
 *   ③ **상태는 바뀔 때만** — 웹뷰가 초당 5.5회 다시 그린다. 다 남기면 사건이 묻힌다.
 */
const CLIENT = join(__dirname, '../../../client-app/src');
const read = (rel: string) => readFileSync(join(CLIENT, rel), 'utf8');
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('관제웹 로그 — 주행이 끝나도 남는다', () => {
    it('🔴 서버에 받는 자리가 있다', () => {
        const server = readFileSync(join(__dirname, '../../src/index.ts'), 'utf8');
        expect(code(server)).toMatch(/app\.use\("\/api\/logs"/);
    });

    it('🔴 소켓이 아니라 HTTP 로 보낸다 (끊긴 걸 끊긴 통로로 못 보낸다)', () => {
        const c = code(read('lib/roadmapLogger.ts'));
        expect(c).toMatch(/fetch\(['"]\/api\/logs['"]/);
        expect(c).not.toMatch(/socket\.emit/);
    });

    it('🔴 못 보내면 버퍼로 되돌려 놓는다 — 끊긴 구간을 잃지 않는다', () => {
        const c = code(read('lib/roadmapLogger.ts'));
        expect(c).toMatch(/catch\s*\{[\s\S]{0,200}BUFFER\.unshift/);
    });

    it('🔴 버퍼가 차면 오래된 것부터 버리고, 버렸다고 말한다 (조용히 잃지 않는다)', () => {
        const c = code(read('lib/roadmapLogger.ts'));
        expect(c).toMatch(/BUFFER\.shift\(\);\s*dropped\+\+/);
        expect(c).toMatch(/줄을 버렸습니다/);
    });

    it('🔴 상태는 바뀔 때만 남긴다 (웹뷰가 초당 5.5회 다시 그린다)', () => {
        const c = code(read('lib/roadmapLogger.ts'));
        const fn = c.slice(c.indexOf('export function logStateChange'));
        expect(fn).toMatch(/lastState\.get\(key\) === value\)\s*return/);
    });

    it('🔴 서버가 자기 줄을 되돌려 받지 않는다 (같은 사건이 두 벌로 남는다)', () => {
        const c = code(read('lib/roadmapLogger.ts'));
        expect(c).toMatch(/platform === "서버"\)\s*return/);
    });

    /** 어제 문서 §4-2 가 모른다고 적어 둔 둘 — 이제 남는다 */
    it('🔴 소켓 끊김과 화면 상태를 실제로 남긴다', () => {
        expect(code(read('hooks/useOrderEngine.ts'))).toMatch(/logStateChange\("소켓"/);
        const pinned = code(read('components/dashboard/PinnedRoute.tsx'));
        expect(pinned).toMatch(/logStateChange\("국면"/);
        expect(pinned).toMatch(/logStateChange\("GPS 출처"/);
    });

    it('로그 때문에 화면이 멈추지 않는다 — 서버는 즉시 응답한다', () => {
        const r = code(readFileSync(join(__dirname, '../../src/routes/logs.ts'), 'utf8'));
        // res.json 이 console.log 루프보다 앞에 있어야 한다
        expect(r.indexOf('res.json(')).toBeGreaterThan(-1);
        expect(r.indexOf('res.json(')).toBeLessThan(r.indexOf('for (const l of shown)'));
    });
});
