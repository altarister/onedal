import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ⏱️ **조용한가 — 직전 보고 시각을 잃지 않는다** (기사님 확정).
 *
 * 서버 로그 `🖥️ [화면 바뀜]` 이 «직전 보고와 N초 만»을 함께 적는다. 그 숫자가
 * *"앱이 알아채는 데 얼마나 걸렸나"* 를 말한다 — 이 숫자로
 * «200ms 예약이 13초 뒤에 깨어난다» 같은 늦음을 찾는다.
 *
 * 🔴 그 답은 **마지막 두 보고의 간격**에 있는데, `session.lastSeen` 을 덮어쓰면
 *    직전 값이 사라져 **영영 물을 수 없다.** 덮기 **전에** 옮겨 두는 그 한 줄이 이 검사의 전부다.
 * 🟢 앱은 한 줄도 안 고친다 — 서버가 이미 받고 있는 것만으로 답이 나온다.
 */

const SRC = join(__dirname, '../../src');
const srv = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** 주석은 «앞으로 할 말»을 담는다 — 코드만 본다 */
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('⏱️ 조용한가 — 직전 보고 시각', () => {
    it('이 값으로 서버가 무엇을 «정하지»는 않는다 — 로그에만 쓴다 (규칙 ⑤-4 ⑤)', () => {
        const src = codeOnly(srv('routes/devices.ts'));
        // 분기 조건에 prevSeen 이 들어가면 «한 값이 두 질문을 답하는» 자리가 된다
        expect(src).not.toMatch(/if\s*\([^)]*prevSeen/);
    });
});
