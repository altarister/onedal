/**
 * 📍 **GPS 가 낡거나 없으면 내 주소로 대신한다 — 심사 직전에도**
 *
 * 기점이 비면 origin 이 null 로 카카오에 가고, 구간 주행분이 전부 null →
 * 타임라인 도착예상 없음 → 버퍼 못 잼 → 약속 축 «잴 수 없음» → **합짐 전부 🔴 사고**가 된다.
 *
 * 그래서 기점은 `originOf` 가 **물을 때마다** 고른다 — 마지막으로 받은 좌표(`lastFix`)가 5분 안이고
 * 쓸 수 있으면 그 자리, 아니면 내 주소. 비우는 쪽과 메우는 쪽을 따로 두면 둘이 다른 시점에 살아
 * 한쪽만 도는 틈이 생긴다(세션 중간 심사 직전에 origin 이 빈다). 고르는 함수 하나면 그 틈이 없다.
 */
import { originOf } from '../../src/services/geoService';
import { SettingsRepository } from '../../src/repositories/SettingsRepository';

jest.mock('../../src/repositories/SettingsRepository', () => ({
    SettingsRepository: { getHomeLocation: jest.fn() },
}));
const mockedHome = SettingsRepository.getHomeLocation as jest.Mock;

const HOME = { x: 127.3, y: 37.4, address: '경기도 광주시 초월읍' };

/** 🔑 «마지막으로 받은 좌표»만 든 세션 — 기점은 `originOf` 가 고른다 */
function sessionWith(loc: { x: number; y: number } | null, atMsAgo: number | null) {
    return {
        userId: 'driver-1',
        lastFix: loc,
        lastFixAt: atMsAgo == null ? null : Date.now() - atMsAgo,
        lastFixIsMock: false,
    };
}

describe('originOf — 기점은 물을 때 고른다 (비우지도 채우지도 않는다)', () => {
    beforeEach(() => mockedHome.mockReset());

    test('낡은 GPS(4시간 전)는 비우고 내 주소로 메운다 — 13:35 사고 재현', () => {
        mockedHome.mockReturnValue(HOME);
        const s = sessionWith({ x: 127.9, y: 37.9 }, 251 * 60_000);
        expect(originOf(s)).toEqual({ x: HOME.x, y: HOME.y, source: 'home', isFallback: true });
        /* 🔴 원자료는 그대로 — 아무도 지우지 않는다 */
    });

    test('처음부터 비어 있어도(부트스트랩 전 심사) 내 주소로 메운다', () => {
        mockedHome.mockReturnValue(HOME);
        const s = sessionWith(null, null);
        expect(originOf(s)).toEqual({ x: HOME.x, y: HOME.y, source: 'home', isFallback: true });
        /* 🔴 원자료는 그대로 — 아무도 지우지 않는다 */
    });

    test('싱싱한 GPS 는 건드리지 않는다 — 진짜 위치가 언제나 이긴다', () => {
        mockedHome.mockReturnValue(HOME);
        const gps = { x: 127.5, y: 37.5 };
        const s = sessionWith(gps, 60_000);
        expect(originOf(s)).toMatchObject({ ...gps, isFallback: false });
        
        expect(mockedHome).not.toHaveBeenCalled();   // 있는데 DB 를 읽을 이유가 없다
    });

    test('내 주소도 없으면 null 로 둔다 — 없는 숫자를 지어내지 않는다 (규칙 ④)', () => {
        mockedHome.mockReturnValue(null);
        const s = sessionWith(null, null);
        expect(originOf(s)).toBeNull();
        
    });
});

/**
 * 🧟 **가상 좌표는 콜을 쥔 동안(또는 모의 주행이 도는 동안)에만 «지금 위치»다** (기사님 실측)
 *
 * 빈 차에 남은 가상 좌표를 «지금 위치»로 쓰면, 모의 주행이 끝난 뒤 잡은 첫짐의 경로가
 * **집(초월읍)이 아니라 시험하던 자리(이천)에서** 시작한다.
 *
 * **끝났다는 사건을 기다리지 않는다.** 모의 주행이 끝나는 길은 여럿이다 — 마지막 하차로
 * 활성 콜이 0건이 되어 국면이 `STANDBY` 로 돌아가거나, 탭을 닫거나, 새로고침하거나.
 * 사건마다 걷어내는 손을 달면 한 갈래가 빠진다. 그래서 읽는 자리(`originOf`)에서
 * «이 좌표가 아직 유효한가»를 묻는다: 모의 주행은 경로가 있을 때(콜을 쥔 GATHERING·DELIVERING) 돌므로
 * (기사님 *"출발을 해야 상차를 하지"*), 빈 차(STANDBY)의 가상 좌표는 **만드는 조건을 벗어난** 낡은 값이다.
 *
 * 🔴 **실 GPS 는 안 걷는다.** 차를 세워 두면 국면이 STANDBY 라도 기사님은 진짜 거기 계신다.
 *    걷어내는 것은 «가짜라서»지 «안 달려서»가 아니다.
 *
 * 클래스: 「같은 사실을 사건 하나에만 매단다」 — #88(경로 홀더)과 같은 뿌리의 다른 자리다.
 * 그쪽은 «어느 콜의 선을 그리는가», 이쪽은 «어디서 출발하는가»다.
 */
describe('가상 좌표는 운행 국면을 벗어나면 «지금 위치»가 아니다', () => {
    beforeEach(() => mockedHome.mockReset());

    const mockSession = (phase: string, isMock: boolean) => ({
        ...sessionWith({ x: 127.406, y: 37.299 }, 60_000),   // 1분 전 — 낡지 않았다
        lastFixIsMock: isMock,
        activeFilter: { dispatchPhase: phase },
    });

    test('🔴 국면이 STANDBY 면 가상 좌표를 걷어내고 내 주소로 메운다 — 0901 실측', () => {
        mockedHome.mockReturnValue(HOME);
        const s = mockSession('STANDBY', true);
        expect(originOf(s)).toEqual({ x: HOME.x, y: HOME.y, source: 'home', isFallback: true });
        /* 🔴 원자료는 그대로 — 아무도 지우지 않는다 */
    });

    /**
     * 🔄 **GATHERING 에서도 가상 좌표는 살아 있다.**
     *
     * DELIVERING 이 되려면 상차를 마쳐야 하고, 상차를 하려면 상차지까지 가야 하고,
     * **가는 것이 모의 주행**이다 — 기사님: *"출발을 해야 상차를 하지"*.
     * 그래서 모의 주행은 «경로가 있으면» 돌고, 경로를 쥔 GATHERING 에서 가상 좌표는
     * **살아 있는 값**이다. 빈 차(STANDBY)는 잡은 콜이 없어 경로도 없다 — 위 검사 그대로 걷는다.
     */
    test('🔄 GATHERING(콜을 쥐고 상차지로 가는 중)에서는 가상 좌표가 살아 있다', () => {
        mockedHome.mockReturnValue(HOME);
        const s = mockSession('GATHERING', true);
        expect(originOf(s)).toMatchObject({ x: 127.406, y: 37.299, isFallback: false });
        expect(mockedHome).not.toHaveBeenCalled();
    });

    test('운행 중(DELIVERING)이면 가상 좌표가 그대로 «지금 위치»다', () => {
        mockedHome.mockReturnValue(HOME);
        const s = mockSession('DELIVERING', true);
        expect(originOf(s)).toMatchObject({ x: 127.406, y: 37.299, isFallback: false });
        expect(mockedHome).not.toHaveBeenCalled();
    });

    test('🔴 실 GPS 는 국면과 무관하게 남는다 — 세워 둬도 기사님은 거기 계신다', () => {
        mockedHome.mockReturnValue(HOME);
        const s = mockSession('STANDBY', false);
        expect(originOf(s)).toMatchObject({ x: 127.406, y: 37.299, isFallback: false });
        expect(mockedHome).not.toHaveBeenCalled();
    });
});

/**
 * 🔒 규칙 — **기점을 읽는 곳은 «고르는 함수» 하나만 부른다**.
 *
 * `originOf` 가 물을 때마다 고르므로 **비울 것도 채울 것도 없다** (기사님 지시).
 *
 * 🔴 대신 이것을 문다: **원자료를 기점으로 곧장 «읽지» 않는다.** `session.lastFix` 를
 *    그대로 읽으면 낡은 좌표·빈 차의 가짜 좌표가 그대로 경로 기점이 된다.
 *
 * ⚠️ **읽기와 쓰기는 다르다.**
 *    서버가 다시 뜰 때 `gps_tracks` 의 마지막 점으로 `session.lastFix` 를 **되살리는**
 *    코드는 **채우는 손**이지 «기점으로 읽는 손»이
 *    아니다 — 되살린 좌표도 결국 `originOf` 가 5분 문턱으로 다시 거른다.
 *    🔴 **느슨하게 풀지 않는다.** «= 로 채우는 줄»만 빼고 나머지는 그대로 문다 —
 *       풀어 버리면 진짜 위반(원자료를 그대로 기점 삼기)도 함께 통과한다.
 */
import fs from 'fs';
import path from 'path';
describe('규칙: 기점은 originOf 로만 읽는다', () => {
    const SRC = path.join(__dirname, '../../src');
    for (const rel of ['core/engine/OrderEvaluator.ts', 'services/dispatchEngine.ts']) {
        test(rel, () => {
            const code = fs.readFileSync(path.join(SRC, rel), 'utf-8')
                .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
            expect(code).toContain('originOf(');
            /**
             * 🔴 원자료를 기점으로 곧장 **읽지** 않는다.
             *    «`session.lastFixXxx = …`» 처럼 **채우는 줄은 뺀다** — 복구가 그 자리다.
             *    (`===`·`!==` 같은 비교는 채우기가 아니므로 `=` 뒤에 `=` 가 오면 안 센다)
             */
            const reads = code.split('\n')
                .filter(l => /session\.lastFix(?!\w)/.test(l))
                .filter(l => !/session\.lastFix\w*\s*=[^=]/.test(l));
            expect(reads).toEqual([]);
        });
    }
});

/**
 * 🔴 **주행이 경로 끝에 닿아도 «콜을 쥔 동안»에는 안 걷는다** (기사님 실측).
 *
 * 콜을 쥔 채 가상 좌표를 걷으면 위치가 집으로 튀고 그 집 기준으로 정거장 순서가 다시 짜여,
 * 화면의 버퍼가 음수로 뒤집힌다 — 집에서 재니 거리가 멀어진 것이다.
 *
 * 🔴 같은 질문(«이 가상 좌표가 아직 지금 위치인가»)에 답하는 손이 둘이면 한쪽만 고쳐진다.
 *    규칙 ③ «파생값을 만들었으면 그 입력도 한 곳에서» — 가드를 **베끼지 말고** `originOf` 한 곳에 모은다.
 *
 * ⚠️ 경로 끝은 «시험의 끝»이 아니다. 콜을 더 잡으면 경로가 늘어나고
 *    시뮬은 «이어 달림»으로 따라간다. 그 사이에 좌표를 걷으면 순서·버퍼가 통째로 흔들린다.
 */
describe('모의 종료 — 콜을 쥔 동안에는 가상 좌표를 걷지 않는다', () => {
    beforeEach(() => mockedHome.mockReset());

    const drivingSession = (phase: string) => ({
        ...sessionWith({ x: 127.446, y: 37.277 }, 5_000),   // 이천 어딘가 · 5초 전
        lastFixIsMock: true,
        driverLocationIsFallback: false,
        activeFilter: { dispatchPhase: phase },
    });

    for (const phase of ['GATHERING', 'DELIVERING']) {
        test(`🔴 ${phase} 면 경로 끝에 닿아도 그 자리에 남는다 — 집으로 튀지 않는다`, () => {
            mockedHome.mockReturnValue(HOME);
            const s = drivingSession(phase);
            expect(originOf(s)).toMatchObject({ x: 127.446, y: 37.277, isFallback: false });
            
        });
    }

    test('🔴 빈 차(STANDBY)면 걷어내고 내 주소로 메운다 — 이 장치의 원래 목적', () => {
        mockedHome.mockReturnValue(HOME);
        const s = drivingSession('STANDBY');
        expect(originOf(s)).toMatchObject({ x: HOME.x, y: HOME.y, isFallback: true });
        
    });
});

/**
 * 🎭 **모의 주행이 좌표를 계속 보내는 동안은 빈 차여도 그 자리가 «지금 위치»다**.
 *
 * ③ «빈 차인데 가짜 좌표면 집 주소»는 **멈춘 뒤 남은** 모의 좌표(파주 156km)를 막는 것이다.
 * 모의 주행은 경로 끝에서도 그 자리 좌표를 계속 보낸다(#133). 그 동안은 모의 GPS 소켓 임자(`mockGpsOwner`)가
 * 5초 안에 보냈으니 **돌고 있는 모의 주행**이다 — 집 주소로 물러서면 이천에서 빈 차로 서 있는데 상차 목록이 집 둘레로 틀어진다.
 * 실 GPS 에는 이 제한이 없다 — 실주행 동작과는 무관하다.
 */
describe('originOf ③ — 돌고 있는 모의 주행', () => {
    beforeEach(() => mockedHome.mockReset());
    const now = 1_000_000;
    const standbyMock = (ownerAt: number | null) => ({
        userId: 'u1', lastFix: { x: 127.4469, y: 37.2774 }, lastFixAt: now - 1000, lastFixIsMock: true, lastFixSource: 'mock' as const,
        activeFilter: { dispatchPhase: 'STANDBY' },
        mockGpsOwner: ownerAt == null ? null : { socketId: 's1', at: ownerAt, warned: false },
    });

    it('🔴 빈 차 + 모의 좌표라도 모의 GPS 가 5초 안에 왔으면 그 자리를 쓴다', () => {
        mockedHome.mockReturnValue({ x: 127.29, y: 37.37, address: '집' });
        const o = originOf(standbyMock(now - 2000), now);
        expect(o).toMatchObject({ x: 127.4469, y: 37.2774, isFallback: false });
    });

    it('🔴 모의 GPS 가 5초 넘게 조용하면(멈춘 뒤 남은 좌표) 지금처럼 집 주소로 대신한다', () => {
        mockedHome.mockReturnValue({ x: 127.29, y: 37.37, address: '집' });
        expect(originOf(standbyMock(now - 6000), now)).toMatchObject({ isFallback: true });
        expect(originOf(standbyMock(null), now)).toMatchObject({ isFallback: true });
    });
});
