import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🧹 **장부를 비우면 메모리도 함께 비운다** (2026-08-22 사고 · 버그 대장 #40)
 *
 * 기사님이 본 것: 콜 하나를 새로 잡았더니 **네 시간 전에 하차한 콜과 이미 지워진 콜
 * 여섯 건이 관제웹에 되살아났다.** 그중 여섯 건은 장부에 아예 없는 유령이었다.
 *
 * 무슨 일이었나:
 *   09:59  `pnpm rehearsal` 의 초기화가 `orders` 를 전부 DELETE
 *          → "재기동해 주세요" 하고 **기다리기만 했다**
 *   그런데 `pnpm dev` 가 `&`(백그라운드)로 셋을 띄우는 구조라
 *   기사님이 창에서 Ctrl+C 를 눌러도 **서버에 신호가 닿지 않았다**
 *   14:24  서버는 07:03 부팅 그대로. 세션 메모리의 옛 콜이 계속 관제웹으로 내려감
 *
 * 🔴 **클래스: 「화면은 메모리, 장부는 비어 있음」 — 네 번째다** (#4·#6·#8 과 같은 클래스).
 *    앞의 셋은 *장부에 안 썼다*, 이번은 *장부를 지웠는데 메모리가 남았다* — 거울상이다.
 *    그래서 인스턴스가 아니라 **구조를 고친다**: 사람이 두 번째 동작을 기억해야 하는
 *    구조를 없앤다. 장부를 비우는 도구가 메모리도 스스로 비운다.
 */

const WEB = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(WEB, p), 'utf8');

describe('🧹 리허설 초기화 — 장부와 메모리는 한 동작이다', () => {
    it('🔴 초기화가 서버 재기동까지 스스로 한다 — 사람에게 넘기지 않는다', () => {
        const src = read('scripts/rehearsal.mjs');
        // 장부를 비우는 자리
        expect(src).toMatch(/DELETE FROM/);
        // 비운 뒤 **스스로** 서버를 다시 띄우는 자리 (감시자를 깨우는 touch)
        expect(src).toMatch(/restartServer|bumpEntry/);
    });

    it('🔴 "재기동해 주세요" 하고 기다리기만 하지 않는다', () => {
        const src = read('scripts/rehearsal.mjs');
        // 사람에게 시키고 무한 대기하던 문장이 남아 있으면 안 된다
        expect(src).not.toMatch(/Ctrl\+C 후 pnpm dev 로 재기동해 주세요/);
    });
});

/**
 * 🔴 **`pnpm dev` 는 Ctrl+C 로 함께 죽어야 한다.**
 *
 * `a & b & c` 는 셋을 전부 백그라운드로 보내고 창에 프롬프트를 돌려준다.
 * Ctrl+C 는 **포그라운드 작업에만** 가므로 서버는 살아남는다 — 기사님은 껐다고
 * 믿는데 옛 서버가 계속 도는, 이 레포가 반복해서 오진한 바로 그 상황이다
 * (루트 CLAUDE.md 「무엇이 실제로 돌고 있는가」).
 */
describe('🔌 pnpm dev — 끄면 같이 꺼진다', () => {
    const dev = () => JSON.parse(read('package.json')).scripts.dev as string;

    it('🔴 백그라운드로 흩뿌리고 창을 놓아 버리지 않는다', () => {
        // 뒤에 wait 가 있어 포그라운드로 남고, trap 이 프로세스 그룹을 함께 정리한다
        expect(dev()).toMatch(/\bwait\b/);
        expect(dev()).toMatch(/trap/);
    });

    /**
     * 🔴 **창을 그냥 닫아도 같이 죽는다.**
     * Ctrl+C 는 INT, 창을 닫으면 **HUP** 이 온다. HUP 을 안 잡으면 감시자가 살아남아
     * 다음에 띄우는 서버와 겹친다 — 2026-08-22 에 8/18 새벽 감시자 둘이 그렇게 남았다.
     */
    it('🔴 창을 닫을 때(HUP)도 함께 정리한다', () => {
        expect(dev()).toMatch(/trap[^;]*\bHUP\b/);
    });
});

/**
 * 🔴 **띄우기 전에 자리를 확인한다 — 겹쳐 띄우지 않는다** (기사님 확정 2026-08-22).
 *
 * 오늘 감시자가 **셋** 쌓였다 (8/18 새벽 둘 + 14:48 하나). 포트를 못 잡은 감시자는
 * `lsof :4000` 에 안 보여서 조용히 놀다가, 자리가 비는 순간 자식을 띄워 **나흘 묵은
 * 코드로 서버를 되살렸다.** 기사님 화면에는 고친 코드가 안 돌고 있었다.
 *
 * 이 레포가 반복해서 오진한 *"고쳤는데 옛 코드가 돌고 있다"* 의 뿌리다
 * (루트 CLAUDE.md 「무엇이 실제로 돌고 있는가」).
 */
describe('🚦 pnpm dev — 겹쳐 띄우지 않는다', () => {
    it('🔴 dev 가 사전 점검을 먼저 부른다', () => {
        expect(JSON.parse(read('package.json')).scripts.dev).toMatch(/dev-preflight/);
    });

    it('🔴 점검이 포트와 **떠 있는 감시자**를 둘 다 본다', () => {
        const src = read('scripts/dev-preflight.mjs');
        expect(src).toMatch(/lsof/);              // 포트를 쥔 놈
        expect(src).toMatch(/tsx.*watch|watch.*tsx/); // 포트 없이 노는 감시자 (오늘의 8781)
        expect(src).toMatch(/exitCode|process\.exit/); // 겹치면 띄우지 않는다
    });

    /**
     * 🔴 **손님을 주인으로 착각하지 않는다.** `lsof -ti :3000` 은 그 포트에 **접속한**
     *    프로세스까지 잡는다 — 관제웹을 열어 둔 크롬이 걸려서 브라우저 탭 하나 때문에
     *    개발 서버를 못 띄우게 된다 (만들자마자 실측으로 걸렸다).
     */
    it('🔴 듣고 있는 것만 본다 — 접속한 브라우저를 서버로 세지 않는다', () => {
        expect(read('scripts/dev-preflight.mjs')).toMatch(/-sTCP:LISTEN/);
    });
});

/**
 * 📄 **문서가 안 되는 방법을 안내하지 않는다.**
 * 루트 CLAUDE.md 는 `Ctrl+C 후 pnpm dev` 를 재기동 방법으로 적어 두었는데,
 * 위의 `&` 구조에서는 그게 실제로 듣지 않았다 (2026-08-22 실측).
 */
describe('📄 재기동 안내가 사실인가', () => {
    it('🔴 안 듣는 방법을 유일한 안내로 적어 두지 않는다', () => {
        const md = read('../CLAUDE.md');
        const line = md.split('\n').find(l => l.includes('tsx watch') && l.includes('Ctrl+C'));
        expect(line).toBeDefined();
        // 감시자(tsx watch)가 부모라는 사실과 함께 적혀 있어야 한다
        expect(md).toMatch(/tsx watch.*자식|감시자/);
    });
});
