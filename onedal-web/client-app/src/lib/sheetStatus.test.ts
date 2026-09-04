import { describe, it, expect } from 'vitest';
import { sheetStatus, sheetStatusLine, textWidth } from './sheetStatus';

/**
 * 🎬 **시트 상태바는 한 줄에 들어가야 한다** (기사님 확정 2026-09-04)
 *
 * 폰 400px · 13px 글꼴이면 한 줄이 약 **56칸**(한글 2 · 영숫자 1).
 * 다이어트 전에는 최장 71칸이라 두 경우가 넘쳤다 —
 * `🏁 6 경기광주자연앤자이점 도착 · 정차 중 — 다음 7 경기광주자연앤자이점`
 */
const LIMIT = 56;
const LONG = '경기광주자연앤자이점';   // 09-03 실제 자료의 최장 지명 (10자)

describe('🎬 시트 상태바', () => {
    it('보통 — 짧다', () => {
        const line = sheetStatusLine(sheetStatus({
            next: { visitNo: 4, name: '가산동', callNo: 2, stop: '하차' }, driveMinutes: 30,
        }));
        expect(line).toBe('⏸ 4 가산동 ~30분 2번 콜 · 하차');
        expect(textWidth(line)).toBeLessThanOrEqual(LIMIT);
    });

    it('🔴 가장 긴 경우도 한 줄에 든다 — 예전엔 71칸이라 넘쳤다', () => {
        const line = sheetStatusLine(sheetStatus({
            moving: true,
            next: { visitNo: 12, name: LONG, callNo: 12, stop: '하차' }, driveMinutes: 123,
        }));
        expect(textWidth(line)).toBeLessThanOrEqual(LIMIT);
    });

    it('지명을 자르고 «잘렸다»고 말한다 (㉮)', () => {
        const s = sheetStatus({ next: { visitNo: 1, name: LONG } });
        expect(s.name).toBe('경기광주자연…');
    });

    it('상태는 기호로 (㉯) — 낱말은 읽어 주는 말로만 남는다', () => {
        expect(sheetStatus({ moving: true, next: { visitNo: 1, name: '가산동' } }).mark).toBe('▶');
        expect(sheetStatus({ moving: false, next: { visitNo: 1, name: '가산동' } }).mark).toBe('⏸');
    });

    it('🔴 «어디서»를 담지 않는다 (㉰) — 다녀온 곳은 진행 점과 흰 링이 말한다', () => {
        const line = sheetStatusLine(sheetStatus({
            moving: true, next: { visitNo: 4, name: '가산동' }, driveMinutes: 12,
        }));
        expect(line).not.toContain('→');
        expect(line).not.toContain('출발지');
    });

    it('🔴 분을 모르면 그 조각을 통째로 뺀다 — 지어내지 않는다 (규칙 ④)', () => {
        expect(sheetStatus({ next: { visitNo: 4, name: '가산동' }, driveMinutes: null }).lead).toBe('');
        expect(sheetStatus({ next: { visitNo: 4, name: '가산동' }, driveMinutes: 0 }).lead).toBe('~0분');
    });

    it('콜이 없거나 판정 중이거나 사이클이 끝나면 한 문장만', () => {
        expect(sheetStatus({ idle: true }).notice).toBe('진행 중인 콜 없음 · 새 콜 대기');
        expect(sheetStatus({ judging: true }).notice).toBe('새 콜 판정 중');
        expect(sheetStatus({ next: null }).notice).toBe('이번 사이클 끝');
        for (const n of ['진행 중인 콜 없음 · 새 콜 대기', '새 콜 판정 중', '이번 사이클 끝']) {
            expect(textWidth(n)).toBeLessThanOrEqual(LIMIT);
        }
    });
});
