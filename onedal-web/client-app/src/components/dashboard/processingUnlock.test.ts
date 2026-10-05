import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🔓 **결재 버튼의 «처리 중...» 잠금은 결재가 실패로 돌아와도 풀린다** (PinnedRoute `processingId`).
 * 콜 자료가 바뀌면 풀리지만, 서버가 실패로 답하면(결재 응답 success:false · 처리 실패 handler-error) 자료가 그대로라
 * 잠금이 남아 카드의 KEEP · 거절 버튼이 눌리지 않는다 — 실패 응답에서도 푼다.
 * 못 잡는 것: 실제 소켓 왕복(소스 글자로 듣는 이벤트와 푸는 줄만 본다).
 */
const code = readFileSync(join(__dirname, 'PinnedRoute.tsx'), 'utf8')
    .split('\n').filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');

describe('결재 잠금 풀기', () => {
    it('결재 응답 실패 · 처리 실패를 듣고 잠금을 푼다', () => {
        expect(code).toMatch(/socket\.on\(\s*['"]decision-ack['"]/);
        expect(code).toMatch(/socket\.on\(\s*['"]handler-error['"]/);
        expect(code).toMatch(/socket\.off\(\s*['"]decision-ack['"]/);
        expect(code).toMatch(/socket\.off\(\s*['"]handler-error['"]/);
    });
});
