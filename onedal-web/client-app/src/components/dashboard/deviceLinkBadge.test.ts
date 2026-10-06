import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 📶 **폰 칸 연결 배지는 그려지는 파일에서 본다** (reviews/50 ①-4 · client-app CLAUDE «소스 글자를 읽는 검사는 그려지는 파일»).
 * 고르는 일(차례 · 글)은 shared `phoneLinkBadgeOf` 검사가 본다 — 여기는 폰 칸이 그 함수를 그리는지만.
 * 못 잡는 것: 실제 색 · 자리(pnpm shot).
 */
describe('📶 폰 칸 연결 배지', () => {
    const panel = readFileSync(join(__dirname, 'DeviceControlPanel.tsx'), 'utf8');
    it('🔴 폰 칸이 shared phoneLinkBadgeOf 를 그린다 · 설명(title)에 풀리는 법', () => {
        expect(panel).toContain('const linkBadge = phoneLinkBadgeOf(device);');
        expect(panel).toContain('{linkBadge && (');
        expect(panel).toContain('title={linkBadge.hint}');
    });
    it('보고가 끊겼어도 블루투스로 들리면 «블루투스로는 살아 있음»', () => {
        expect(panel).toContain('{isDisconnected && bleAlive && (');
    });
});
