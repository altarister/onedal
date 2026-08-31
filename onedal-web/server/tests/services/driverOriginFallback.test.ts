/**
 * 📍 **낡은 GPS 를 비웠으면 내 주소로 메운다 — 심사 직전에도** (버그: 합짐 전부 빨강 · 2026-08-31)
 *
 * 실측 13:35 — `dropStaleLocation` 이 251분 묵은 좌표를 비우며 «내 주소 기준으로
 * 계산합니다» 라고 **약속만 하고 안 메웠다.** 메우기는 로그인 부트스트랩에만 있어서
 * 세션 중간(심사 직전)엔 origin 이 null 로 카카오에 갔고, 구간 주행분이 전부 null →
 * 타임라인 도착예상 없음 → 버퍼 못 잼 → 약속 축 «잴 수 없음» → **합짐 전부 🔴 사고**.
 * 같은 판이라도 모의 GPS 가 흐르던 14:04 판은 전부 정상(꿀 87)이었다.
 *
 * 클래스: **비우는 쪽과 메우는 쪽이 다른 시점에 산다** — 비움은 읽는 순간마다,
 * 메움은 로그인 한 번. 그래서 비움과 메움을 한 함수(`ensureDriverOrigin`)로 묶는다.
 */
import { ensureDriverOrigin } from '../../src/services/geoService';
import { SettingsRepository } from '../../src/repositories/SettingsRepository';

jest.mock('../../src/repositories/SettingsRepository', () => ({
    SettingsRepository: { getHomeLocation: jest.fn() },
}));
const mockedHome = SettingsRepository.getHomeLocation as jest.Mock;

const HOME = { x: 127.3, y: 37.4, address: '경기도 광주시 초월읍' };

function sessionWith(loc: { x: number; y: number } | null, atMsAgo: number | null) {
    return {
        driverLocation: loc,
        driverLocationAt: atMsAgo == null ? null : Date.now() - atMsAgo,
        driverLocationIsFallback: false,
    };
}

describe('ensureDriverOrigin — 비움과 메움은 한 몸이다', () => {
    beforeEach(() => mockedHome.mockReset());

    test('낡은 GPS(4시간 전)는 비우고 내 주소로 메운다 — 13:35 사고 재현', () => {
        mockedHome.mockReturnValue(HOME);
        const s = sessionWith({ x: 127.9, y: 37.9 }, 251 * 60_000);
        ensureDriverOrigin('driver-1', s as any);
        expect(s.driverLocation).toEqual({ x: HOME.x, y: HOME.y });
        expect(s.driverLocationIsFallback).toBe(true);
    });

    test('처음부터 비어 있어도(부트스트랩 전 심사) 내 주소로 메운다', () => {
        mockedHome.mockReturnValue(HOME);
        const s = sessionWith(null, null);
        ensureDriverOrigin('driver-1', s as any);
        expect(s.driverLocation).toEqual({ x: HOME.x, y: HOME.y });
        expect(s.driverLocationIsFallback).toBe(true);
    });

    test('싱싱한 GPS 는 건드리지 않는다 — 진짜 위치가 언제나 이긴다', () => {
        mockedHome.mockReturnValue(HOME);
        const gps = { x: 127.5, y: 37.5 };
        const s = sessionWith(gps, 60_000);
        ensureDriverOrigin('driver-1', s as any);
        expect(s.driverLocation).toEqual(gps);
        expect(s.driverLocationIsFallback).toBe(false);
        expect(mockedHome).not.toHaveBeenCalled();   // 있는데 DB 를 읽을 이유가 없다
    });

    test('내 주소도 없으면 null 로 둔다 — 없는 숫자를 지어내지 않는다 (규칙 ④)', () => {
        mockedHome.mockReturnValue(null);
        const s = sessionWith(null, null);
        ensureDriverOrigin('driver-1', s as any);
        expect(s.driverLocation).toBeNull();
        expect(s.driverLocationIsFallback).toBe(false);
    });
});

/**
 * 🧟 **가상 좌표는 모의 주행이 도는 동안에만 «지금 위치»다** (기사님 실측 2026-09-01)
 *
 * 실측: 판이 끝나고 2분 뒤 잡은 첫짐의 경로가 **집(초월읍)이 아니라 이천에서** 시작했다.
 * 로그가 그대로 말한다 — 00:57:19 «모의 종료»로 집에 되돌렸는데, 00:59:07 에 가상 좌표
 * 하나(13.1km 점프)가 다시 덮었고 **아무도 그걸 걷어내지 않았다.** 그 좌표를 기점으로
 * 01:00·01:02 두 콜의 카카오 경로가 계산됐다.
 *
 * ── 왜 안 걷혔나 ──
 * 걷어내기(`clearMockLocation`)가 **한 갈래에만** 달려 있었다: 시뮬이 폴리라인 끝에
 * 닿아 스스로 끝날 때(`mock-driving-ended`). 그런데 실제로 판이 끝나는 길은 여럿이다 —
 * 마지막 하차로 활성 콜이 0건이 되어 국면이 `STANDBY` 로 돌아가거나, 탭을 닫거나,
 * 새로고침하거나. 그 길들에는 걷어내는 손이 없었다.
 *
 * ── 고침 ──
 * **끝났다는 사건을 기다리지 않는다.** 읽는 자리에서 «이 좌표가 아직 유효한가»를 묻는다:
 * 모의 GPS 는 `dispatchPhase === 'DELIVERING'` 일 때만 흐르므로(관제웹 `useMock` 의 조건),
 * 국면이 그걸 벗어난 순간 가상 좌표는 **정의상** 낡은 값이다. 시각을 재는 추측이 아니라
 * 만드는 조건 그대로다.
 *
 * 🔴 **실 GPS 는 안 걷는다.** 차를 세워 두면 국면이 STANDBY 라도 기사님은 진짜 거기 계신다.
 *    걷어내는 것은 «가짜라서»지 «안 달려서»가 아니다.
 *
 * 클래스: 「같은 사실을 사건 하나에만 매단다」 — #88(경로 홀더)과 같은 뿌리의 다른 자리다.
 * 그때 고친 것은 «어느 콜의 선을 그리는가»였고, 이건 «어디서 출발하는가»다.
 */
describe('가상 좌표는 운행 국면을 벗어나면 «지금 위치»가 아니다', () => {
    beforeEach(() => mockedHome.mockReset());

    const mockSession = (phase: string, isMock: boolean) => ({
        ...sessionWith({ x: 127.406, y: 37.299 }, 60_000),   // 1분 전 — 낡지 않았다
        driverLocationIsMock: isMock,
        activeFilter: { dispatchPhase: phase },
    });

    test('🔴 국면이 STANDBY 면 가상 좌표를 걷어내고 내 주소로 메운다 — 0901 실측', () => {
        mockedHome.mockReturnValue(HOME);
        const s = mockSession('STANDBY', true);
        ensureDriverOrigin('driver-1', s as any);
        expect(s.driverLocation).toEqual({ x: HOME.x, y: HOME.y });
        expect(s.driverLocationIsFallback).toBe(true);
    });

    test('🔴 GATHERING(합짐 수집) 도 마찬가지다 — 달리지 않으면 시뮬도 안 돈다', () => {
        mockedHome.mockReturnValue(HOME);
        const s = mockSession('GATHERING', true);
        ensureDriverOrigin('driver-1', s as any);
        expect(s.driverLocation).toEqual({ x: HOME.x, y: HOME.y });
    });

    test('운행 중(DELIVERING)이면 가상 좌표가 그대로 «지금 위치»다', () => {
        mockedHome.mockReturnValue(HOME);
        const s = mockSession('DELIVERING', true);
        ensureDriverOrigin('driver-1', s as any);
        expect(s.driverLocation).toEqual({ x: 127.406, y: 37.299 });
        expect(mockedHome).not.toHaveBeenCalled();
    });

    test('🔴 실 GPS 는 국면과 무관하게 남는다 — 세워 둬도 기사님은 거기 계신다', () => {
        mockedHome.mockReturnValue(HOME);
        const s = mockSession('STANDBY', false);
        ensureDriverOrigin('driver-1', s as any);
        expect(s.driverLocation).toEqual({ x: 127.406, y: 37.299 });
        expect(mockedHome).not.toHaveBeenCalled();
    });
});

/**
 * 🔒 규칙 — **심사·필터 경로는 비움만 부르면 안 된다.** 비움 뒤 메움이 없으면
 * «내 주소 기준으로 계산합니다» 로그가 거짓이 된다. 이 검사가 그 자리를 지킨다.
 */
import fs from 'fs';
import path from 'path';
describe('규칙: 낡음-비움을 부르는 곳은 메움(ensureDriverOrigin)을 쓴다', () => {
    const SRC = path.join(__dirname, '../../src');
    for (const rel of ['core/engine/OrderEvaluator.ts', 'services/dispatchEngine.ts']) {
        test(rel, () => {
            const code = fs.readFileSync(path.join(SRC, rel), 'utf-8');
            expect(code).not.toMatch(/^\s*dropStaleLocation\(/m);   // 비움 단독 호출 금지
            expect(code).toContain('ensureDriverOrigin(');
        });
    }
});
