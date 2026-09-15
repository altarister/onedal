import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🎬 **시나리오 카드의 «안 올라왔다» 안내가 픽커 탭도 묻는다** — 막는 것: 시뮬레이터 픽커가 «내 오더» 탭에 남아 새 콜 카드가 안 보이는데 안내는 «개별콜 탭인가»만 물었다 (#152).
 */
describe('🎬 시나리오 안내 — 콜이 안 올라올 때', () => {
    const src = readFileSync(join(__dirname, '../../src/core/simScenario.ts'), 'utf8');
    it('🔴 «개별콜 탭인가»를 묻는 자리마다 «픽커면 신규 탭인가»도 묻는다', () => {
        const ask = src.match(/«🚚 개별콜» 탭인가[^`']*/g) ?? [];
        expect(ask.length).toBeGreaterThan(0);
        for (const line of ask) expect(line).toMatch(/픽커면 «신규» 탭인가/);
    });
});
