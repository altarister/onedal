import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { callName } from "@onedal/shared";

const SERVER = join(__dirname, "../../src");
const read = (rel: string) => readFileSync(join(SERVER, rel), "utf8");
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 🔴 **콜 이름은 조합해서 만든다** (기사님 확정 2026-08-16)
 *
 * ```
 * 타겟명  +  첫짐(생략) / 합짐N  +  (후보)  +  콜
 * ```
 * 기사님: *"단어를 조합하여 이름을 만들자는 이야기야."*
 *
 * 그전엔 `본콜` 하나가 **세 뜻**으로 쓰였다 —
 *   `routeComposer`   잡아 둔 첫 콜
 *   `kakaoService`    첫짐
 *   `OrderEvaluator`  `본콜 좌표 누락` → 실제로는 **후보콜**
 * 그래서 기사님이 *"내가 KEEP 한 첫 콜에 문제가 있나?"* 로 잘못 읽으셨다.
 */
describe('콜 이름 — 조합 규칙', () => {

    it('타겟 + 인덱스로 이름이 나온다', () => {
        expect(callName({ target: 'DEST', index: 0 })).toBe('노선콜');
        expect(callName({ target: 'DEST', index: 1 })).toBe('노선합짐1콜');
        expect(callName({ target: 'DEST', index: 2 })).toBe('노선합짐2콜');
        expect(callName({ target: 'LOCAL', index: 0 })).toBe('관내콜');
        expect(callName({ target: 'LOCAL', index: 1 })).toBe('관내합짐1콜');
        expect(callName({ target: 'HOME', index: 1 })).toBe('복귀합짐1콜');
    });

    it('심사 전이면 「후보」가 붙는다 (띄어 쓴다)', () => {
        expect(callName({ target: 'DEST', index: 1, candidate: true })).toBe('노선 합짐1 후보콜');
        expect(callName({ target: 'DEST', index: 0, candidate: true })).toBe('노선 후보콜');
    });

    it('타겟을 모르면 지어내지 않는다 (아는 만큼만 부른다)', () => {
        expect(callName({ index: 1 })).toBe('합짐1콜');
        expect(callName({ index: 0 })).toBe('콜');
        expect(callName({ target: 'UNKNOWN_X', index: 1 })).toBe('합짐1콜');
    });

    it('🔴 이름을 만드는 곳은 한 곳뿐이다 — 코드가 `본콜` 이라 부르지 않는다', () => {
        const walk = (d: string, out: string[] = []): string[] => {
            for (const e of readdirSync(d)) {
                const p = join(d, e);
                if (statSync(p).isDirectory()) walk(p, out);
                else if (e.endsWith('.ts')) out.push(p);
            }
            return out;
        };
        const offenders = walk(SERVER).filter(f => /본콜/.test(codeOnly(readFileSync(f, 'utf8'))));
        expect(offenders).toEqual([]);
    });

    it('🔴 후보콜의 좌표 실패를 「본콜」이라 말하지 않는다', () => {
        const ev = codeOnly(read('core/engine/OrderEvaluator.ts'));
        expect(ev).toMatch(/callName\(\{/);
        expect(ev).toMatch(/주소를 찾지 못했습니다/);
        expect(ev).toMatch(/candidate: true/);
    });
});

/**
 * 🔴 **마감이 어느 정거장의 것이냐에 따라 빼는 시간이 다르다** (2026-08-16 실측)
 *
 * 기사님이 `목적지콜` 의 상차지와 통화해 *"05:49까지 상차지 도착"* 을 넣으시자,
 * 서버가 거기서 **전체 주행 82분**(상차지→하차지)을 빼 **여유 −71분**을 만들었다.
 * *"상차하러 가는 데 하차까지의 시간이 걸린다"* 고 센 셈이다.
 * 그 결과 그 뒤로 온 `목적지 합짐1 후보콜` 이 **전부 막혔다.**
 */
describe('마감 — 상차 약속과 하차 약속을 구분한다', () => {

    const h = codeOnly(read('core/helpers.ts'));
    const fn = h.slice(h.indexOf('export function computeAllowedDetour'), h.indexOf('/** 한 콜의 상·하차'));

    it('🔴 하차 약속에는 전체 주행 + 상하차를 뺀다', () => {
        expect(fn).toMatch(/drop\?\.deadlineAt[\s\S]*?totalDurationMin[\s\S]*?totalDwell/);
    });

    it('🔴 상차 약속에는 **상차지까지 가는 시간만** 뺀다', () => {
        const pickBlock = fn.slice(fn.indexOf('if (pick?.deadlineAt)'));
        expect(pickBlock).toMatch(/approachDurationMin/);
        expect(pickBlock).toMatch(/pickupDwell/);
        expect(pickBlock).not.toMatch(/totalDurationMin/);   // 전체 주행을 빼면 안 된다
    });

    it('🔴 이미 상차했으면 상차 약속은 보지 않는다 (지난 일이다)', () => {
        expect(fn).toMatch(/ORDER_PICKED_UP.*return null/s);
    });

    it('🔴 접근 시간을 모르면 0 이 아니라 null 이다 (지어내지 않는다)', () => {
        const pickBlock = fn.slice(fn.indexOf('if (pick?.deadlineAt)'));
        expect(pickBlock).toMatch(/approach === undefined \|\| approach === null\) return null/);
    });
});
