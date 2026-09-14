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
import { originOf } from '../../src/services/geoService';
import { SettingsRepository } from '../../src/repositories/SettingsRepository';

jest.mock('../../src/repositories/SettingsRepository', () => ({
    SettingsRepository: { getHomeLocation: jest.fn() },
}));
const mockedHome = SettingsRepository.getHomeLocation as jest.Mock;

const HOME = { x: 127.3, y: 37.4, address: '경기도 광주시 초월읍' };

/** 🔑 «마지막으로 받은 좌표»만 든 세션 — 기점은 `originOf` 가 고른다 (2026-09-12 개편) */
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
 * 🔄 **2026-09-12 — «만드는 조건»이 «경로가 있으면»으로 바뀌었다** (기사님 *"출발을 해야
 *    상차를 하지"*). 그래서 걷어내는 자리도 **빈 차(STANDBY)** 하나로 좁아졌다 —
 *    규칙은 그대로고 조건만 따라 움직인 것이다.
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
     * 🔄 **개정 2026-09-12 — 전제가 바뀌었다.**
     *
     * 이 검사의 근거는 *"달리지 않으면 시뮬도 안 돈다"* 였다 — 당시 모의 주행은
     * `dispatchPhase === 'DELIVERING'` 이라야 돌았으므로, GATHERING 에 가상 좌표가
     * 남아 있으면 **정의상 낡은 값**이었다.
     *
     * 🔴 그런데 **그러면 상차지까지 갈 수가 없었다.** DELIVERING 이 되려면 상차를 마쳐야 하고,
     *    상차를 하려면 상차지까지 가야 하고, **가는 것이 모의 주행**이다 —
     *    기사님 2026-09-12: *"출발을 해야 상차를 하지"*. 그래서 조건을 «경로가 있으면»으로
     *    바꿨고, GATHERING 에서도 시뮬이 돈다.
     *
     * 🔴 **규칙의 뜻은 그대로다** — «가상 좌표는 만들어지는 조건을 벗어나면 낡은 값».
     *    만들어지는 조건이 «경로가 있음»으로 바뀌었으니, 경로를 쥔 GATHERING 에서는
     *    **살아 있는 값**이다. 빈 차(STANDBY)는 잡은 콜이 없어 경로도 없다 — 위 검사 그대로 걷는다.
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
 * 🔒 규칙 — **기점을 읽는 곳은 «고르는 함수» 하나만 부른다** (2026-09-12 개편).
 *
 * 🔄 예전 규칙은 *«비움만 부르면 안 된다 — 비움 뒤 메움이 없으면 로그가 거짓이 된다»* 였다.
 *    비우고 채우는 손이 있었기 때문이다. 지금은 **비울 것도 채울 것도 없다** —
 *    `originOf` 가 물을 때마다 고르므로 그 짝을 맞출 일이 사라졌다 (기사님 지시).
 *
 * 🔴 대신 이것을 문다: **원자료를 기점으로 곧장 «읽지» 않는다.** `session.lastFix` 를
 *    그대로 읽으면 낡은 좌표·빈 차의 가짜 좌표가 그대로 경로 기점이 된다.
 *
 * ⚠️ **읽기와 쓰기는 다르다** (2026-09-12 — 이 검사가 오탐을 냈다).
 *    서버가 다시 뜰 때 `gps_tracks` 의 마지막 점으로 `session.lastFix` 를 **되살리는**
 *    코드가 들어오자 이 검사가 빨간불을 냈다. 그건 **채우는 손**이지 «기점으로 읽는 손»이
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
 * 🔴 **주행이 끝나도 «콜을 쥔 동안»에는 안 걷는다** (기사님 실측 2026-09-12 14:38).
 *
 * 기사님: *"이천을 했는데.. 뭔가 이상해"* — 로그가 그대로 말한다:
 * ```
 * 14:38:16 🧹 [모의 종료] 가상 위치를 걷어냅니다 — 내 주소 기준으로 복귀
 * 14:38:16 📍 [출발지 대체] GPS 미수신 — 내 주소(경기도 광주 초월 동광뷰엘) 기준으로 계산
 * 14:38:17 📡 [번호] 1사음동상 · 2중리동하 …   ← 직전엔 1초월읍상 · 2곤지암읍상
 * ```
 * **콜이 3건 남아 있는데** 위치가 집으로 튀고 그 집 기준으로 순서가 다시 짜였다.
 * 화면의 버퍼도 −23분으로 뒤집혔다 — 집에서 재니 거리가 멀어진 것이다.
 *
 * 🔴 **원인: 같은 질문에 답하는 손이 둘인데 한쪽만 고쳤다** (2026-09-12 · 내가 낸 것).
 *    그날 아침 「콜 쥔 동안엔 안 걷는다」를 `expireMockLocation`(읽는 자리)에만 넣고,
 *    `clearMockLocation`(주행이 경로 끝에 닿는 자리)에는 안 넣었다.
 *    규칙 ③ «파생값을 만들었으면 그 입력도 한 곳에서» — 가드를 **베끼지 말고 모은다.**
 *
 * ⚠️ 경로 끝은 «판의 끝»이 아니다. 콜을 더 잡으면 경로가 늘어나고(574 → 642 포인트)
 *    시뮬은 «이어 달림»으로 따라간다. 그 사이에 좌표를 걷으면 판이 통째로 흔들린다.
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
 * 🎭 **모의 주행이 좌표를 계속 보내는 동안은 빈 차여도 그 자리가 «지금 위치»다** (2026-09-15 다섯 번째 바퀴 · onedal-49 합의).
 *
 * ③ «빈 차인데 가짜 좌표면 집 주소»는 **멈춘 뒤 남은** 모의 좌표(2026-08-14 파주 156km)를 막으려던 것이다.
 * 모의 주행은 이제 경로 끝에서도 그 자리 좌표를 계속 보낸다(#133). 그 동안은 모의 GPS 소켓 임자(`mockGpsOwner`)가
 * 5초 안에 보냈으니 **돌고 있는 모의 주행**이다 — 집 주소로 물러서면 이천에서 빈 차로 서 있는데 상차 목록이 집 둘레로 틀어진다.
 * 실 GPS 는 원래 제한이 없다 — 제품 동작은 안 바뀐다.
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
