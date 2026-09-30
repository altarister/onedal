import fs from 'fs';
import os from 'os';
import path from 'path';
import { openDailyLog, kstDayOf, nextKstMidnightOf, logFileNameOf } from '../../src/utils/fileLogger';

/**
 * 📄 **로그 파일은 한국 날짜마다 하나** (onedal-1f) — 부팅 때 한 번만 이름을 정하면 자정을 넘겨도 옛 날짜 파일에 쌓여,
 *    «오늘 로그 파일»을 찾는 사람·스크립트가 헛짚는다(실서버 09-26 파일에 09-28 줄까지 있었다).
 *    줄을 쓸 때 날짜가 바뀌었으면 옛 파일을 닫고 새 날짜 파일을 연다.
 */
const KST = 9 * 3600_000;
const at = (kst: string) => Date.parse(`${kst}Z`) - KST;   // «2026-09-30T23:59:59» 한국 시각 → epoch ms

describe('📄 날짜 계산', () => {
    it('한국 날짜 · 다음 한국 자정 · 파일 이름', () => {
        expect(kstDayOf(at('2026-09-30T23:59:59'))).toBe('2026-09-30');
        expect(kstDayOf(at('2026-10-01T00:00:00'))).toBe('2026-10-01');
        expect(nextKstMidnightOf(at('2026-09-30T08:00:00'))).toBe(at('2026-10-01T00:00:00'));
        expect(nextKstMidnightOf(at('2026-10-01T00:00:00'))).toBe(at('2026-10-02T00:00:00'));
        expect(logFileNameOf('2026-10-01', '4000')).toBe('server-2026-10-01.log');
        expect(logFileNameOf('2026-10-01', '4012')).toBe('server-2026-10-01-4012.log');
    });
});

describe('📄 자정을 넘기면 새 날짜 파일', () => {
    let dir: string;
    beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-log-')); });
    afterEach(() => { jest.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); });

    it('🔴 23:59:59 줄은 앞 날짜 파일에, 00:00:01 줄은 새 날짜 파일에 — 새 파일 첫 줄은 «📄 [로그 파일]»', async () => {
        const now = jest.spyOn(Date, 'now').mockReturnValue(at('2026-09-30T23:59:59'));
        const log = openDailyLog(dir, '4012', () => {});
        log.write('앞 날짜 줄\n');
        now.mockReturnValue(at('2026-10-01T00:00:01'));
        log.write('새 날짜 줄\n');
        await log.close();

        const before = fs.readFileSync(path.join(dir, 'server-2026-09-30-4012.log'), 'utf8');
        const after = fs.readFileSync(path.join(dir, 'server-2026-10-01-4012.log'), 'utf8');
        expect(before).toContain('앞 날짜 줄');
        expect(before).not.toContain('새 날짜 줄');
        const lines = after.trim().split('\n');
        expect(lines[0]).toMatch(/📄 \[로그 파일\] 날짜가 바뀌어 새 파일 — 앞 파일 server-2026-09-30-4012\.log/);
        expect(lines[1]).toBe('새 날짜 줄');
        expect(log.file).toBe(path.join(dir, 'server-2026-10-01-4012.log'));
    });

    it('같은 날 안에서는 파일을 바꾸지 않는다', async () => {
        const now = jest.spyOn(Date, 'now').mockReturnValue(at('2026-09-30T10:00:00'));
        const log = openDailyLog(dir, '4000', () => {});
        log.write('하나\n');
        now.mockReturnValue(at('2026-09-30T23:59:59'));
        log.write('둘\n');
        await log.close();
        expect(fs.readdirSync(dir)).toEqual(['server-2026-09-30.log']);
    });

    it('크기 넘김 경고는 파일마다 다시 한 번 — 새 날짜 파일은 0 부터 센다', async () => {
        const now = jest.spyOn(Date, 'now').mockReturnValue(at('2026-09-30T23:00:00'));
        const warns: string[] = [];
        const log = openDailyLog(dir, '4000', m => warns.push(m), 200);
        log.write(`${'가'.repeat(250)}\n`);   // 넘김 전 줄은 쓴다
        log.write('넘은 뒤\n');          // 경고 한 번 · 안 씀
        log.write('또\n');               // 경고 없음
        now.mockReturnValue(at('2026-10-01T00:00:05'));
        log.write('새 파일\n');
        await log.close();
        expect(warns.length).toBe(1);
        expect(fs.readFileSync(path.join(dir, 'server-2026-10-01.log'), 'utf8')).toContain('새 파일');
    });
});
