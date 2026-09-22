import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * 📍 **«지금 기점»은 저장하지 않고 물을 때 고른다** (기사님 지시).
 *
 * 기사님: *"함수가 함수를 부르는 것이 이상해. **상태가 바뀌면 거기에 따라 알아서
 * 바뀌어야 하는 거 아냐?** 함수가 여러 가지 일을 하는 것이 별로야."*
 *
 * 🔴 **가짜 좌표를 세션에 써 두면** 「언제 지울까」를 손 둘이 각자 판단하게 된다 — 읽는 자리와
 *    주행이 끝나는 자리. 조건을 바꿀 때 **한쪽만 고치면**, 콜 셋을 쥔 채 경로 끝에 닿는 순간
 *    위치가 집으로 튀어 경로 순서가 뒤집히고 버퍼가 음수로 떨어진다.
 *
 * 🔴 **그래서 지우는 행위를 없앤다.** 세션에는 «마지막으로 **받은** 좌표»(`lastFix`)만
 *    남기고, «지금 기점»은 `originOf()` 가 물을 때마다 고른다. 상태가 바뀌면 다음 답이
 *    저절로 달라지므로 **«언제 지울까»라는 질문 자체가 사라진다** (규칙 ③).
 *
 * 이 검사가 무는 것은 **구조**다 — 값이 맞는지는 `driverOriginFallback.test.ts` 가 본다.
 */

const SRC = join(__dirname, '../../src');
const read = (p: string) => readFileSync(p, 'utf8');
/** 주석을 걷어낸 코드만 — 주석에 적힌 이름에 걸리지 않게 */
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function serverFiles(dir = SRC, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) serverFiles(p, out);
        else if (name.endsWith('.ts')) out.push(p);
    }
    return out;
}

describe('지금 기점은 파생이다 — 저장하지도 지우지도 않는다', () => {

    it('🔴 가짜 좌표를 «지우는 손»이 없다 — 지울 게 없으면 반만 고칠 수도 없다', () => {
        const guilty: string[] = [];
        for (const f of serverFiles()) {
            const code = codeOnly(read(f));
            for (const gone of ['clearMockLocation', 'dropOffDutyMockLocation', 'mock-driving-ended']) {
                if (code.includes(gone)) guilty.push(`${f.slice(SRC.length + 1)} — ${gone}`);
            }
        }
        expect(guilty).toEqual([]);
    });

    it('🔴 `originOf` 는 세션을 만지지 않는다 — 고르기만 한다', () => {
        const geo = read(join(SRC, 'services/geoService.ts'));
        const i = geo.indexOf('export function originOf');
        expect(i).toBeGreaterThan(-1);
        const body = codeOnly(geo.slice(i, geo.indexOf('\n}', i)));
        /* `session.무엇 = ` 이 있으면 고르기가 아니라 쓰기다 */
        expect(body).not.toMatch(/session\.\w+\s*=[^=]/);
    });

    it('🔴 «집에서 온 값인가»도 파생이다 — 세션이 들고 있지 않는다', () => {
        const store = codeOnly(read(join(SRC, 'state/userSessionStore.ts')));
        expect(store).not.toMatch(/driverLocationIsFallback/);
    });

    it('🔴 원자료는 «마지막으로 받은 좌표» 하나다 — 이름이 그렇게 말한다', () => {
        const store = read(join(SRC, 'state/userSessionStore.ts'));
        expect(store).toMatch(/lastFix\s*:/);
        /* `driverLocation` 이름이 남아 있으면 «지금 위치»로 읽혀 또 지우고 채우게 된다 */
        expect(codeOnly(store)).not.toMatch(/driverLocation\s*:/);
    });
});
