import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🛑 **서버는 «끝내는 법»을 알아야 한다** (기사님 실측)
 *
 * Ctrl+C 를 누르면 `tsx` 가 이런 줄을 찍는다:
 *
 *     [tsx] Previous process hasn't exited yet. Force killing...
 *
 * ⚠️ **그 메시지는 이 검사가 없애지 못한다**. `tsx` 는 **신호를 받는 그 순간** 자식의 `exitCode` 를
 *    보므로, 서버가 아무리 빨리 나가도(실측 0.23초) 그 시점엔 «아직 안 나갔다»가 참이다. 못 피한다.
 *    **무해하다** — 서버는 정리하고 나가고 잔재는 0이다.
 *
 * 🔴 **이 검사가 지키는 것은 종료 절차다**. 강제 종료로 끝나면 DB 를 닫을 기회도, 관제탑을 내보낼 기회도 없다. 증상과 무관하게
 *    지켜야 하는 선이라 검사로 못박는다.
 *
 * Node 는 **열린 손잡이가 하나라도 있으면 안 죽는다.** 이 서버가 쥔 것:
 *   ① 듣고 있는 HTTP 소켓 (keep-alive 연결 포함)
 *   ② Socket.IO 연결들
 *   ③ 1초 인터벌 두 개 (소켓 브로드캐스트 · 페어링 정리)
 *
 * ── 왜 이게 중요한가 ──
 * 서버가 스스로 끝낼 줄 모르면 **기사님이 껐다고 믿은 서버가 계속 돌며** 지워진 콜을
 * 화면에 보낸다 (실측: 4시간 40분). Ctrl+C 가 **닿지 않는 것**(`a & b & c`)과
 * **닿았는데 안 나가는 것**은 뿌리가 같다.
 *
 * 강제 종료(SIGKILL)로 끝나면 **DB 를 닫을 기회가 없다.** 지금은 WAL 이라 견디지만,
 * 끝내는 절차 없이 두면 언젠가 그 대가를 치른다.
 *
 * 🔴 여기서 강제하는 것은 **종료 경로**뿐이다. 부팅 경로는 건드리지 않는다.
 */
const SRC = join(__dirname, '../../src');
/** 주석은 검사하지 않는다 — 주석이 까닭을 설명하며 쓴 글자에 검사가 걸리지 않게 */
const code = (rel: string) => readFileSync(join(SRC, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('종료 — Ctrl+C 에 서버가 스스로 나간다', () => {
    const index = () => code('index.ts');

    it('🔴 SIGINT · SIGTERM 을 둘 다 받는다 (Ctrl+C 와 tsx 의 재시작)', () => {
        expect(index()).toMatch(/process\.on\(\s*['"]SIGINT['"]/);
        expect(index()).toMatch(/process\.on\(\s*['"]SIGTERM['"]/);
    });

    it('🔴 쥐고 있던 것을 놓는다 — 소켓 · HTTP · DB', () => {
        const src = index();
        expect(src).toMatch(/io\.close\(/);                    // 붙어 있는 관제탑을 내보낸다
        expect(src).toMatch(/httpServer\.close\(/);            // 듣기를 멈춘다
        expect(src).toMatch(/closeAllConnections/);            // keep-alive 가 붙잡는다
        expect(src).toMatch(/db\.close\(/);                    // 강제 종료로 끝나면 닫을 기회가 없다
    });

    it('🔴 1초 인터벌이 이벤트 루프를 붙잡지 않는다 (unref)', () => {
        // 인터벌 하나만 살아 있어도 Node 는 안 죽는다. 둘 다 unref 여야 한다.
        for (const f of ['socket/socketHandlers.ts', 'state/pairingStore.ts']) {
            expect(code(f)).toMatch(/\.unref\(\)/);
        }
    });

    it('🔴 그래도 안 나가면 스스로 끊는다 — 무한정 매달리지 않는다', () => {
        // 놓지 못하는 연결이 하나 있으면 close() 콜백이 영영 안 온다.
        // 그때는 tsx 가 강제로 죽이기 전에 우리가 먼저 끝낸다 (종료 코드를 우리가 정한다).
        expect(index()).toMatch(/setTimeout\(/);
        expect(index()).toMatch(/process\.exit\(/);
        // ⚠️ 그 타이머 자신도 unref — 이것 때문에 3초를 기다리면 본말전도다
        expect(index()).toMatch(/\.unref\(\)/);
    });
});
