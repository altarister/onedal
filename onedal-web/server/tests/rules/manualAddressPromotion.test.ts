import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🏠 **상차·하차는 원달앱이 올린 전체 주소 그대로 — 서버는 꺼내 올리지 않는다** (기사님 «상세 데이터엔 짧은 주소가 아니고 전체 주소»)
 *
 * 원달앱이 상세에서 전체 주소를 채운다(인성 팝업 «위치» · 픽커 사진 + 건물명). 못 채운 콜은 원달앱이 버려 서버에 오지 않는다.
 * 그래서 서버가 팝업 원문에서 주소를 꺼내 콜 주소로 덮던 길(옛 승격)은 없다 — 다시 생기면 두 곳이 주소를 정하게 된다.
 * 서버의 팝업 풀기(`parseLocationDetails`)는 연락처·고객 이름을 꺼내는 데만 쓴다.
 */
const SRC = join(__dirname, '../../src');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const read = (p: string) => codeOnly(readFileSync(join(SRC, p), 'utf8'));

describe('🏠 서버는 콜 주소를 덮지 않는다', () => {
    it('🔴 detail 수신·심사 어디에도 팝업 주소로 콜 주소를 덮는 길이 없다', () => {
        for (const f of ['routes/detail.ts', 'core/engine/OrderEvaluator.ts', 'utils/parser.ts']) {
            const c = read(f);
            expect(`${f}: ${/promoteDetailAddresses/.test(c)}`).toBe(`${f}: false`);
            expect(`${f}: ${/\.(pickup|dropoff)\s*=\s*[^=;]*addressDetail/.test(c)}`).toBe(`${f}: false`);
        }
    });

    it('🔴 detail 수신에 배차망 이름으로 가르는 주소 갈래가 없다', () => {
        expect(read('routes/detail.ts')).not.toMatch(/targetApp\s*===\s*['"]kakaopicker['"]/);
    });

    it('연락처·고객 이름은 여전히 팝업 원문에서 꺼낸다', () => {
        const c = read('routes/detail.ts');
        expect(c).toMatch(/parseLocationDetails\(rawText, "\[출발지상세\]"\)/);
        expect(c).toMatch(/parseLocationDetails\(rawText, "\[도착지상세\]"\)/);
    });
});
