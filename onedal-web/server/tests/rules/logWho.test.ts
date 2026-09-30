// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import { decorateFileLine } from '../../src/utils/fileLogger';
import { logContext, whoNow } from '../../src/utils/logContext';

/**
 * 🪪 **로그 파일 줄에 «누구의 일인가» · 휴대폰 번호는 가림** (reviews/29 1단계 I·J · onedal-1f «가»).
 * 기사가 둘이 되면 한 로그 파일에 두 기사의 콜·폰 줄이 섞인다 — 줄 끝에 «@기사»를 붙여 가른다.
 * 줄 앞머리(시각 · 수준 · #태그)는 `pnpm log` 가 읽는 자리라 건드리지 않는다. 터미널 출력은 원문 그대로다.
 */
const SRC = join(__dirname, '../../src');

describe('🪪 로그 줄 꾸미기', () => {
    it('🔴 휴대폰 번호를 가리고, 맥락이 있으면 줄 끝에 @기사', () => {
        expect(decorateFileLine('12:00:00.000     #콜단계 상차 010-1234-5678\n', '알타리')).toBe('12:00:00.000     #콜단계 상차 010-****-5678 @알타리\n');
        expect(decorateFileLine('12:00:00.000     #부팅 서버 시작\n', undefined)).toBe('12:00:00.000     #부팅 서버 시작\n');
    });
    it('🔴 맥락은 그 일의 비동기 흐름을 따라간다', async () => {
        expect(whoNow()).toBeUndefined();
        await logContext.run({ who: '딸' }, async () => {
            await new Promise(r => setTimeout(r, 1));
            expect(whoNow()).toBe('딸');
        });
        expect(whoNow()).toBeUndefined();
    });
});

describe('🪪 맥락을 싣는 자리 셋', () => {
    it('🔴 파일 쓰기가 decorateFileLine(…, whoNow()) 를 부른다', () => {
        expect(readFileSync(join(SRC, 'utils/fileLogger.ts'), 'utf8')).toMatch(/decorateFileLine\(stripAnsi\(line\), whoNow\(\)\)/);
    });
    it('🔴 로그인 문 · 폰 문 · 소켓 이벤트가 맥락을 싣는다', () => {
        expect(readFileSync(join(SRC, 'middlewares/authMiddleware.ts'), 'utf8')).toMatch(/enterLogWho\(/);
        expect(readFileSync(join(SRC, 'core/deviceAuth.ts'), 'utf8')).toMatch(/enterLogWho\(/);
        expect(readFileSync(join(SRC, 'socket/socketHandlers.ts'), 'utf8')).toMatch(/logContext\.run\(/);
    });
});
