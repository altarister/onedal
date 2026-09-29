import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🧹 **본 콜 기억 비우기 — 누를 자리가 있어야 서버 문이 산다** (`StatusBoard.tsx` 의 `CallMemoryButton`).
 * 서버 `POST /api/sim/call-memory/round` 는 회차를 올려 폰이 다음 보고에서 «이미 본 콜» 기억을 비우게 한다.
 * 시나리오 «▶ 시작»은 스스로 회차를 올리지만, 시나리오 없이 판을 다시 시작할 때는 이 버튼뿐이다.
 */
describe('🧹 본 콜 기억 비우기 버튼', () => {
    const src = readFileSync(join(__dirname, 'StatusBoard.tsx'), 'utf8');

    it('서버 문을 POST 로 부른다 — 시뮬 문지기(simAsk)를 거친다', () => {
        expect(src).toMatch(/simAsk<[^>]*>\('\/call-memory\/round', \{ method: 'POST' \}\)/);
    });

    it('«🧪 테스트용» 묶음 안에 한 번만 선다 — 시뮬 문이 닫히면 묶음째 안 그려진다', () => {
        expect(src.match(/<CallMemoryButton \/>/g)?.length).toBe(1);
    });
});
