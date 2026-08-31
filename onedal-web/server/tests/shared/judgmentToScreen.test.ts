import { readFileSync } from 'fs';
import { join } from 'path';
import { deriveCallTiming, deriveRouteTimeline, derivationInputsOf, DEFAULT_JUDGMENT } from '@onedal/shared';

/**
 * 🎛️ **판정 기준 탭의 시간 4칸이 화면 파생까지 닿는다** (필터 확정안 구현 1 · 2026-08-21)
 *
 * 감사 실측: 10칸 전부 서버는 쓰는데, **관제웹 파생(타임라인·카운트다운·심사 버퍼)은
 * 시간 4칸(미확인 정차 2 · 상차 시계 잠정 · 데드라인 배율)을 안 받고 코드 기본값**을
 * 썼다. 지금은 DB 값 = 기본값이라 증상이 잠복 — 기사님이 탭에서 잠정을 30→45로
 * 바꾸는 순간 서버(45)와 화면(30)이 갈라진다. #33(정차값 두 벌)과 같은 클래스다.
 *
 * 수리: 파생 입력을 `derivationInputsOf(cfg)` **한 곳**에서 만들고(규칙 ③),
 * 서버(routeTlOf)와 관제웹(타임라인·카운트다운·심사 버퍼)이 같은 함수를 먹는다.
 */

const ANCHOR = '2026-08-21T03:00:00Z';
const NOW = Date.parse(ANCHOR);
const kst = (ms: number) => new Date(ms).toLocaleTimeString('ko-KR',
    { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });

const CLIENT = join(__dirname, '../../../client-app/src');
const SERVER = join(__dirname, '../../src');
const read = (p: string) => readFileSync(p, 'utf8');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('판정 기준 → 화면 파생 (시간 4칸)', () => {
    it('🔴 derivationInputsOf — 탭 값에서 rules 와 정차 일반값을 한 곳에서 만든다', () => {
        const cfg = { ...DEFAULT_JUDGMENT,
            unknown: { pickupDwellMin: 40, dropoffDwellMin: 35, pickupPromiseMin: 45 },
            deadline: { ratioPct: 200 } };
        const { rules, unk } = derivationInputsOf(cfg);
        expect(rules.pickupPromiseMinutes).toBe(45);
        expect(rules.deadlineRatioPct).toBe(200);
        expect(unk.pickupDwellMin).toBe(40);
        expect(unk.dropoffDwellMin).toBe(35);
    });

    it('🔴 미확인 정차가 탭 값을 따라온다 — deriveCallTiming (심사 버퍼의 파생)', () => {
        const order = { id: 'X', capturedAt: ANCHOR, totalDurationMin: 60, kakaoSoloDurationMin: 40 } as any;
        const { rules, unk } = derivationInputsOf({ ...DEFAULT_JUDGMENT,
            unknown: { pickupDwellMin: 40, dropoffDwellMin: 35, pickupPromiseMin: 30 } });
        const t = deriveCallTiming(order, [], [], NOW, rules, unk);
        expect(t.pickupDwell).toBe(40);      // 기본 15가 아니라 탭 값
        expect(t.dropoffDwell).toBe(35);     // 기본 10이 아니라 탭 값
    });

    it('🔴 상차 시계 잠정·정차가 타임라인까지 — 45분 시계 + 40분 정차로 데드라인이 선다', () => {
        const stops = [
            { orderId: 'X', stopType: 'pickup', driveMinutes: 10 },
            { orderId: 'X', stopType: 'dropoff', driveMinutes: 50 },
        ] as any;
        const orders = [{ id: 'X', capturedAt: ANCHOR, totalDurationMin: 50, kakaoSoloDurationMin: 40 }] as any;
        const { rules, unk } = derivationInputsOf({ ...DEFAULT_JUDGMENT,
            unknown: { pickupDwellMin: 40, dropoffDwellMin: 35, pickupPromiseMin: 45 },
            deadline: { ratioPct: 150 } });
        const tl = deriveRouteTimeline(stops, orders, () => [], () => [], NOW, ANCHOR, rules, unk);
        const p = tl.find(e => e.stopType === 'pickup')!;
        const d = tl.find(e => e.stopType === 'dropoff')!;
        // 상차 약속 = max(도착 12:10, 잡음+45 = 12:45) = 12:45 (기본 30이면 12:30이었다)
        expect(kst(Date.parse(p.promisedUntil!))).toBe('12:45');
        // 데드라인 = 완료(12:45 + 정차 40) + 40×1.5 = 14:25 (기본 정차 15면 14:00이었다)
        expect(kst(Date.parse(d.promisedUntil!))).toBe('14:25');
    });

    it('🔴 관제웹 세 화면이 판정 기준 스토어의 파생 입력을 쓴다 (기본값 상수가 아니라)', () => {
        for (const rel of ['hooks/useRouteDerivations.ts',
                           'components/dashboard/DepartureCountdown.tsx',
                           'components/dashboard/PinnedRouteCard.tsx']) {
            const src = codeOnly(read(join(CLIENT, rel)));
            expect(`${rel}: ${/derivationInputsOf\(/.test(src)}`).toBe(`${rel}: true`);
        }
    });

    it('🔴 서버 타임라인(routeTlOf)도 같은 함수를 먹는다 — 손 조립 금지', () => {
        const src = codeOnly(read(join(SERVER, 'socket/socketHandlers.ts')));
        expect(src).toMatch(/derivationInputsOf\(/);
    });
});
