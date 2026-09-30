// @ts-nocheck
import fs from 'fs';
import path from 'path';
import { armWait, cancelWait, cancelOrderWaits, cancelAllWaits, waitsOf, type WaitBook } from '../../src/state/waits';

/**
 * ⏲️ **서버의 기다림은 장부 한 곳에서 건다** (기사님 «누가 무엇을 걸어 뒀나 안 보인다» · onedal-1f «가»).
 *
 * 거는 함수가 장부에 «이름 · 건 쪽 · 끝날 시각 · 콜»을 함께 적는다 — 장부를 따로 적는 길이 없어야 장부가 거짓말을 안 한다.
 * 그래서 서버 코드가 `setTimeout` 을 직접 부르면 빨간불이다. 한 요청 안에서 끝나는 짧은 기다림만 이름으로 뺀다.
 */
const SRC = path.join(__dirname, '../../src');
const EXEMPT: Array<{ file: string; line: RegExp; why: string }> = [
    { file: 'services/kakaoService.ts', line: /const hedgeTimer = setTimeout\(/, why: '한 요청 안 — 느린 길찾기에 한 번 더' },
    { file: 'services/kakaoService.ts', line: /const deadlineTimer = setTimeout\(/, why: '한 요청 안 — 응답 시한' },
    { file: 'routes/osrmUtil.ts', line: /const timerIds = setTimeout\(/, why: '한 요청 안 — OSRM 시한' },
    { file: 'index.ts', line: /const giveUp = setTimeout\(/, why: '종료 절차' },
];

function tsFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? tsFiles(p) : p.endsWith('.ts') ? [p] : [];
    });
}

describe('⏲️ setTimeout 은 장부(state/waits.ts)와 제외 목록에만', () => {
    it('🔴 서버 코드가 기다림을 직접 걸지 않는다', () => {
        const stray: string[] = [];
        for (const f of tsFiles(SRC)) {
            const rel = path.relative(SRC, f).split(path.sep).join('/');
            if (rel === 'state/waits.ts') continue;
            fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
                if (!/\bsetTimeout\(/.test(line) || /^\s*(\*|\/\/)/.test(line)) return;
                if (EXEMPT.some(x => x.file === rel && x.line.test(line))) return;
                stray.push(`${rel}:${i + 1}`);
            });
        }
        expect(stray).toEqual([]);
    });

    it('🔴 장부 칸(entries)은 waits.ts 밖에서 넣거나 빼거나 비우지 않는다 — 따로 적는 길을 구조로 막는다', () => {
        expect(fs.readFileSync(path.join(SRC, 'state/waits.ts'), 'utf8')).toMatch(/entries: Map<string, Wait>/);
        const stray: string[] = [];
        for (const f of tsFiles(SRC)) {
            const rel = path.relative(SRC, f).split(path.sep).join('/');
            if (rel === 'state/waits.ts') continue;
            fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
                if (/\.(entries|activeTimers)\.(set|delete|clear)\(/.test(line)) stray.push(`${rel}:${i + 1}`);
            });
        }
        expect(stray).toEqual([]);
    });

    it('제외 목록의 줄은 아직 있다 — 지워진 줄을 목록에 남기지 않는다', () => {
        for (const x of EXEMPT) {
            expect(fs.readFileSync(path.join(SRC, x.file), 'utf8')).toMatch(x.line);
        }
    });
});

describe('⏲️ 장부의 행동', () => {
    const book = (): WaitBook => ({ entries: new Map() });
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('🔴 같은 키를 두 번 걸면 한 번 울린다 — 앞 것을 끈다', () => {
        const b = book();
        const fired = jest.fn();
        armWait(b, 'warn_a', { label: '시험', armedBy: '검사', ms: 1000, orderId: 'a', tag: '콜단계' }, fired);
        armWait(b, 'warn_a', { label: '시험', armedBy: '검사', ms: 1000, orderId: 'a', tag: '콜단계' }, fired);
        jest.advanceTimersByTime(2000);
        expect(fired).toHaveBeenCalledTimes(1);
    });

    it('🔴 울린 줄은 장부에서 빠진다 — fire 가 부를 때 이미 없다', () => {
        const b = book();
        let seen = true;
        armWait(b, 'k', { label: '시험', armedBy: '검사', ms: 500, tag: '콜단계' }, () => { seen = b.entries.has('k'); });
        jest.advanceTimersByTime(600);
        expect(seen).toBe(false);
        expect(b.entries.size).toBe(0);
    });

    it('🔴 cancelOrderWaits 는 키 모양과 상관없이 그 콜 것만 다 끈다', () => {
        const b = book();
        const a = jest.fn(), other = jest.fn();
        armWait(b, 'warn_a', { label: '경고', armedBy: '검사', ms: 1000, orderId: 'a', tag: '콜단계' }, a);
        armWait(b, 'anything_new_a', { label: '새 기다림', armedBy: '검사', ms: 1000, orderId: 'a', tag: '콜단계' }, a);
        armWait(b, 'warn_b', { label: '경고', armedBy: '검사', ms: 1000, orderId: 'b', tag: '콜단계' }, other);
        cancelOrderWaits(b, 'a', '검사');
        jest.advanceTimersByTime(2000);
        expect(a).not.toHaveBeenCalled();
        expect(other).toHaveBeenCalledTimes(1);
    });

    it('cancelWait · cancelAllWaits 는 끄고 장부에서 지운다', () => {
        const b = book();
        const f = jest.fn();
        armWait(b, 'x', { label: '시험', armedBy: '검사', ms: 1000, tag: '콜단계' }, f);
        armWait(b, 'y', { label: '시험', armedBy: '검사', ms: 1000, tag: '콜단계' }, f);
        cancelWait(b, 'x', '검사');
        expect(b.entries.has('x')).toBe(false);
        cancelAllWaits(b);
        jest.advanceTimersByTime(2000);
        expect(f).not.toHaveBeenCalled();
        expect(b.entries.size).toBe(0);
    });

    it('waitsOf 는 이름 · 건 쪽 · 콜 · 남은 초를 준다', () => {
        const b = book();
        armWait(b, 'presecured_a', { label: '안전취소', armedBy: '/confirm', ms: 30_000, orderId: 'a', tag: '콜단계' }, () => {});
        const now = Date.now() + 10_000;
        expect(waitsOf(b, now)).toEqual([{ key: 'presecured_a', label: '안전취소', armedBy: '/confirm', orderId: 'a', remainSec: 20 }]);
    });
});
