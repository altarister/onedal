import { readFileSync } from 'fs';
import { join } from 'path';
import { callMemoryRoundOf } from '../../src/services/callMemoryRound';

/**
 * 🧹 **폰 «본 콜» 기억 비우기 번호 = 영업일 번호 + (개발일 때만) 시뮬 회차** (04 리뷰 · 기사님 «가» · onedal-1f «가»).
 *
 * 원달앱은 `/api/scrap` 응답 꼬리 `deviceControl.callMemoryRound` 가 바뀌면 `CallMemory` 를 비운다(처음 받은 번호는 기억만).
 * 영업일이 바뀌면 번호가 바뀌어 폰이 어제 본 콜 기억을 비운다 — 운영(실서버)에서도 싣는다.
 * 서버 상태가 없다 — 같은 날 몇 번 불러도 같은 번호, 서버를 다시 띄워도 같은 번호(재시작에 안 비운다).
 */
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('🧹 본 콜 기억 비우기 번호', () => {
    it('🔴 영업일이 바뀌면 번호가 바뀐다 · 같은 날은 몇 번 불러도 같다', () => {
        expect(callMemoryRoundOf(at(2026, 10, 6, 0, 1), null)).not.toBe(callMemoryRoundOf(at(2026, 10, 5, 23, 59), null));
        expect(callMemoryRoundOf(at(2026, 10, 5, 9), null)).toBe(callMemoryRoundOf(at(2026, 10, 5, 23, 59), null));
    });

    it('개발일 때 시뮬 회차가 오르면(현황판 «🧹 본 콜 기억 비우기») 번호가 바뀐다', () => {
        const now = at(2026, 10, 5, 9);
        expect(callMemoryRoundOf(now, 3)).not.toBe(callMemoryRoundOf(now, 2));
        expect(callMemoryRoundOf(now, 0)).toBe(callMemoryRoundOf(now, null));
    });

    it('🔴 어제 회차 1 과 오늘(서버 재시작 뒤) 회차 0 이 같은 번호가 아니다 — 개발 폰도 날이 바뀌면 비운다', () => {
        expect(callMemoryRoundOf(at(2026, 10, 6, 9), 0)).not.toBe(callMemoryRoundOf(at(2026, 10, 5, 9), 1));
    });

    it('원달앱 칸(Int)에 들어가는 정수다', () => {
        const n = callMemoryRoundOf(at(2026, 10, 5, 9), 5);
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeLessThan(2 ** 31);
    });

    it('🔴 운영 응답에도 늘 싣는다 — 번호 합성은 시뮬 문(routes/sim.ts) 밖 한 곳 · 회차는 개발일 때만 인자로', () => {
        const scrap = readFileSync(join(__dirname, '../../src/routes/scrap.ts'), 'utf8');
        expect(scrap).toContain('const callMemoryRound = callMemoryRoundOf(Date.now(), simRoundForPhone());');
        expect(scrap).not.toMatch(/callMemoryRound !== null \?/);
        const sim = readFileSync(join(__dirname, '../../src/routes/sim.ts'), 'utf8');
        expect(sim).not.toMatch(/callMemoryRoundOf\(/);
        expect(sim).toMatch(/export function simRoundForPhone\(\): number \| null \{\s*if \(!isDevBuild\(\)\) return null;/);
    });

    it('영업일 전환 때 로그 한 줄 — 번호는 계산값이라 전환 자리는 알리기만 한다', () => {
        const fm = readFileSync(join(__dirname, '../../src/state/filterManager.ts'), 'utf8');
        expect(fm).toContain("slog('콜단계', `🧹 [본 콜 기억] 영업일 전환 ${yesterday} → ${today} — 앱에 비우기 신호`);");
    });
});
