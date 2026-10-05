import { describe, it, expect } from 'vitest';
import { onceByMessage } from './caughtErrorLog';

/**
 * 🚨 **경계가 잡은 같은 오류는 콘솔에 한 번만** — 고장 난 칸이 동기화마다 다시 그려져도 서버 로그에 줄이 쌓이지 않는다
 * (관제웹 콘솔은 installConsoleCapture 가 서버로 올린다 · README «바뀔 때만 찍는다»).
 */
describe('onceByMessage', () => {
    it('같은 글의 오류는 한 번 · 다른 글이면 또 한 번', () => {
        const lines: unknown[][] = [];
        const log = onceByMessage((...a) => { lines.push(a); });
        log(new Error('뭔가 터짐'), { componentStack: '\n at Drawer' });
        log(new Error('뭔가 터짐'), { componentStack: '\n at Drawer' });
        log(new Error('다른 오류'));
        expect(lines.length).toBe(2);
        expect(String(lines[0][1])).toContain('뭔가 터짐');
    });
});
