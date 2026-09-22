import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🧹 **장부를 비우면 메모리도 함께 비운다**
 *
 * 장부(`orders`)만 비우고 서버를 그대로 두면 세션 메모리의 콜이 계속 관제웹으로 내려가,
 * 콜 하나를 새로 잡는 순간 **이미 하차한 콜과 장부에 없는 콜이 관제웹에 되살아난다.**
 * 비운 뒤 «재기동해 주세요» 하고 기다리기만 하면, 사람이 두 번째 동작을 잊거나
 * 창의 Ctrl+C 가 서버에 닿지 않아(아래 `pnpm dev`) 재기동이 실제로 안 된다.
 *
 * 🔴 **클래스: 「화면은 메모리, 장부는 비어 있음」** (#4·#6·#8 과 같은 클래스).
 *    그쪽은 *장부에 안 썼다*, 이쪽은 *장부를 지웠는데 메모리가 남았다* — 거울상이다.
 *    그래서 인스턴스가 아니라 **구조를 고친다**: 사람이 두 번째 동작을 기억해야 하는
 *    구조를 없앤다. 장부를 비우는 도구가 메모리도 스스로 비운다.
 */

const WEB = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(WEB, p), 'utf8');

/*
 * 🔁 **콜을 비우는 도구는 `pnpm reset:calls` 하나다** (기사님 지시) — 그래서 이 구조도 그 하나에 산다.
 */
describe('🧹 콜 비우기 — 장부와 메모리는 한 동작이다', () => {
    it('🔴 콜을 비우는 도구가 서버 재기동까지 스스로 한다 — 사람에게 넘기지 않는다', () => {
        const src = read('scripts/reset-calls.mjs');
        // 장부를 비우는 자리
        expect(src).toMatch(/DELETE FROM/);
        // 비운 뒤 **스스로** 서버를 다시 띄우는 자리 (감시자를 깨우는 파일 시각 갱신)
        expect(src).toMatch(/restartServer/);
    });

    it('🔴 "재기동해 주세요" 하고 기다리기만 하지 않는다', () => {
        const src = read('scripts/reset-calls.mjs');
        expect(src).not.toMatch(/Ctrl\+C 후 pnpm dev 로 재기동해 주세요/);
    });
});

/**
 * 🔴 **`pnpm dev` 는 Ctrl+C 로 함께 죽어야 한다.**
 *
 * `a & b & c` 는 셋을 전부 백그라운드로 보내고 창에 프롬프트를 돌려준다.
 * Ctrl+C 는 **포그라운드 작업에만** 가므로 서버는 살아남는다 — 기사님은 껐다고
 * 믿는데 옛 서버가 계속 도는, 이 레포가 반복해서 오진한 바로 그 상황이다
 * (루트 README.md 「무엇이 실제로 돌고 있는가」).
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
     * 다음에 띄우는 서버와 겹친다.
     */
    it('🔴 창을 닫을 때(HUP)도 함께 정리한다', () => {
        expect(dev()).toMatch(/trap[^;]*\bHUP\b/);
    });
});

/**
 * 🔴 **띄우기 전에 자리를 확인한다 — 겹쳐 띄우지 않는다** (기사님 확정).
 *
 * 감시자는 겹쳐 쌓일 수 있다. 포트를 못 잡은 감시자는 `lsof :4000` 에 안 보여서 조용히 놀다가,
 * 자리가 비는 순간 자식을 띄워 **묵은 코드로 서버를 띄운다.** 그러면 기사님 화면에서
 * 고친 코드가 안 돈다.
 *
 * 이 레포가 반복해서 오진한 *"고쳤는데 옛 코드가 돌고 있다"* 의 뿌리다
 * (루트 README.md 「무엇이 실제로 돌고 있는가」).
 */
describe('🚦 pnpm dev — 겹쳐 띄우지 않는다', () => {
    it('🔴 dev 가 사전 점검을 먼저 부른다', () => {
        expect(JSON.parse(read('package.json')).scripts.dev).toMatch(/dev-preflight/);
    });

    it('🔴 점검이 포트와 **떠 있는 감시자**를 둘 다 본다', () => {
        const src = read('scripts/dev-preflight.mjs');
        expect(src).toMatch(/lsof/);              // 포트를 쥔 놈
        expect(src).toMatch(/tsx.*watch|watch.*tsx/); // 포트 없이 노는 감시자
        expect(src).toMatch(/exitCode|process\.exit/); // 겹치면 띄우지 않는다
    });

    /**
     * 🔴 **손님을 주인으로 착각하지 않는다.** `lsof -ti :3000` 은 그 포트에 **접속한**
     *    프로세스까지 잡는다 — 관제웹을 열어 둔 크롬이 걸려서 브라우저 탭 하나 때문에
     *    개발 서버를 못 띄우게 된다.
     */
    it('🔴 듣고 있는 것만 본다 — 접속한 브라우저를 서버로 세지 않는다', () => {
        expect(read('scripts/dev-preflight.mjs')).toMatch(/-sTCP:LISTEN/);
    });
});

/**
 * 📄 **문서가 안 되는 방법을 안내하지 않는다.**
 * 재기동 안내(루트 README.md)는 감시자(`tsx watch`)가 부모라는 사실과 함께 적는다 —
 * `&` 로 흩뿌리는 구조에서는 `Ctrl+C 후 pnpm dev` 만으로는 서버가 안 꺼진다.
 */
describe('📄 재기동 안내가 사실인가', () => {
    it('🔴 안 듣는 방법을 유일한 안내로 적어 두지 않는다', () => {
        const md = read('../README.md');   // 재기동 안내는 루트 README 「무엇이 실제로 돌고 있는가」에 산다
        const line = md.split('\n').find(l => l.includes('tsx watch') && l.includes('Ctrl+C'));
        expect(line).toBeDefined();
        // 감시자(tsx watch)가 부모라는 사실과 함께 적혀 있어야 한다
        expect(md).toMatch(/tsx watch.*자식|감시자/);
    });
});
