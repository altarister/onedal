// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import opsRouter, { homeOf } from '../../src/routes/ops';
import { noteError, errorsToday, errorShapeOf } from '../../src/utils/errorTally';

/**
 * 🧯 **점검 «서버 오늘 오류 수»** (reviews/33 · onedal-69 «가» Q11 «가» — ERR 만).
 *    로그 파일의 ERR 줄(console.error)을 쓰는 순간 메모리에서 센다 — 파일을 통째로 읽지 않는다 · 한국 날이 바뀌면 0 · 서버를 다시 띄우면 0(«부팅 뒤 · 오늘»).
 *    줄 수와 «같은 모양»을 접은 가짓수 둘 — 같은 모양 규칙은 pnpm log(scripts/log.mjs)와 글자까지 같다.
 *    /board/server 와 홈이 같은 함수로 받는다.
 */
const io = { to: () => ({ emit: () => {} }), in: () => ({ disconnectSockets: () => {} }), of: () => ({ sockets: new Map(), to: () => ({ emit: () => {} }) }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const DAY1 = Date.parse('2030-01-01T10:00:00+09:00'), DAY2 = Date.parse('2030-01-02T00:00:01+09:00');

describe('🧯 서버 오늘 오류 수', () => {
    it('🔴 줄 수와 같은 모양을 접은 가짓수 — 숫자 · id 만 다르면 한 가지', () => {
        const before = errorsToday(DAY1);
        noteError('❌ [카카오] 응답 없음(3초) 콜 1234', DAY1);
        noteError('❌ [카카오] 응답 없음(3초) 콜 5678', DAY1);
        noteError('💥 [DB] 쓰기 실패', DAY1);
        const now = errorsToday(DAY1);
        expect(now.count - before.count).toBe(3);
        expect(now.kinds - before.kinds).toBe(2);
    });
    it('🔴 한국 날이 바뀌면 0 에서 다시 센다', () => {
        expect(errorsToday(DAY2)).toEqual({ count: 0, kinds: 0 });
        noteError('❌ 새 날', DAY2);
        expect(errorsToday(DAY2)).toEqual({ count: 1, kinds: 1 });
    });
    it('🔴 /board/server 와 홈이 같은 값', async () => {
        const layer = opsRouter.stack.find((l: any) => l.route?.path === '/board/server' && l.route.methods.get);
        let out: any;
        const res = { status: () => res, json: (b: any) => { out = b; return res; } };
        await layer.route.stack[layer.route.stack.length - 1].handle({ app, params: {}, query: {}, body: {}, user: { id: 'x' }, headers: {} }, res);
        expect(out.errorsToday).toEqual(errorsToday());
        expect(homeOf(io).access.errorsToday).toEqual(out.errorsToday);
    });
    it('🔴 같은 모양 규칙은 pnpm log 와 글자까지 같다 · 로그 파일의 ERR 쓰기 자리에서 센다', () => {
        const mjs = readFileSync(join(__dirname, '../../../scripts/log.mjs'), 'utf8');
        const ts = readFileSync(join(__dirname, '../../src/utils/errorTally.ts'), 'utf8');
        const body = (src: string) => src.match(/[sS]hapeOf = \((?:msg|msg: string)\)(?:: string)? => (.+);/)?.[1];
        const uuid = (src: string) => src.match(/const UUID = (\/.+\/g);/)?.[1];
        expect(body(ts)).toBe(body(mjs));
        expect(uuid(ts)).toBe(uuid(mjs));
        expect(errorShapeOf('a 12 3f2a9c1b x')).toBe('a N <id> x');
        expect(readFileSync(join(__dirname, '../../src/utils/fileLogger.ts'), 'utf8')).toMatch(/if \(level === 'ERR'\) noteError\(/);
    });
});
