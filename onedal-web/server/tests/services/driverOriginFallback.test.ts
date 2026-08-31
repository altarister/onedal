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
