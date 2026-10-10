import { describe, it, expect } from 'vitest';
import { batchOf } from './roadmapLogger';

/**
 * 📦 **관제웹 로그는 한 번에 64KB 아래만 보낸다** (92판 · 24 발견 · 71 «가»).
 * 버퍼 전부를 keepalive 한 요청에 담아, 끊겼다 돌아와 쌓인 묶음이 64KB 를 넘으면 브라우저가 보내기 전에 거절했다 —
 * 실패하면 통째로 되돌려 묶음이 안 줄어 그날 남은 관제웹 로그가 서버에 영영 안 갔다.
 * 못 잡는 것: 실제 브라우저 keepalive 거절 · 순서대로 다 올라가는지 — 폰(관제앱 · 잠깐 끊은 뒤 서버 «🖥️ [관제웹 …]» 줄).
 */
const bytes = (lines: { at: string; msg: string }[]) => new TextEncoder().encode(JSON.stringify({ deviceId: '관제웹', lines })).length;
const line = (i: number, n = 200) => ({ at: `12:00:${String(i).padStart(2, '0')}`, msg: `#화면 ${'가'.repeat(n)} ${i}` });

describe('📦 batchOf', () => {
    it('🔴 한글 200자 줄 500개 — 첫 묶음은 60,000 바이트 아래 · 앞에서부터 차례대로', () => {
        const all = Array.from({ length: 500 }, (_, i) => line(i));
        const b = batchOf(all);
        expect(b.take).toBeGreaterThan(0);
        expect(b.take).toBeLessThan(500);
        expect(bytes(b.lines)).toBeLessThan(60_000);
        expect(b.lines[0]).toEqual(all[0]);
        expect(b.lines[b.take - 1]).toEqual(all[b.take - 1]);
    });
    it('🔴 혼자 100,000자인 줄은 잘려 혼자 한 묶음 — 다음 줄은 다음 묶음', () => {
        const big = { at: '12:00:00', msg: 'x'.repeat(100_000) };
        const b = batchOf([big, line(1)]);
        expect(b.take).toBe(1);
        expect(bytes(b.lines)).toBeLessThan(60_000);
        expect(b.lines[0].msg).toContain('잘림');
    });
    it('빈 버퍼는 0 · 작으면 전부', () => {
        expect(batchOf([]).take).toBe(0);
        expect(batchOf([line(1), line(2)]).take).toBe(2);
    });
});
