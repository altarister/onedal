import db from '../../src/db';
import { shouldStoreGpsPoint, GPS_TRACK, pruneGpsTracks, flushGpsBuffer, bufferGpsPoint } from '../../src/services/gpsTrackStore';
import { isSpeedSampleUsable, gpsPointOf } from '../../src/services/geoService';
import { planArrivalStops } from '../../src/services/routeComposer';

/**
 * 🛰️ **주행 궤적을 남긴다** (기사님 확정 2026-08-26)
 *
 * 기사님: *"내가 가끔 네비게이션이 가리키는 경로를 놓쳐서 지나치거나 할 경우가 있거든..
 * 그러면 얼마나 우회하게 되는 건지.. 약속 시간에 늦는다면 전화해서 상하차지와의 약속을
 * 수정하든지 해야 하거든.. 그런 기능을 만들려면 지금 부여받은 경로와 현실의 주행 궤적을
 * 매칭해야 차이를 확인할 수 있을 듯."*
 *
 * ── 왜 필요했나 ──
 * 좌표는 소켓으로 흘려보내고 **메모리에만 살았다.** 저장하는 표가 없어서 —
 *   · 1회차(08-23)·2회차(08-26) 둘 다 궤적을 못 남겼다 (필드테스트 «발견 3»)
 *   · 2회차에서 **상차지 5곳 중 3곳이 GPS 자동 감지 실패**했는데, **몇 미터 차이로
 *     빗나갔는지를 모른다.** 반경 500m 를 늘릴 일인지 장소를 바꿀 일인지 판단이 안 된다
 *   · 「위치 점프」 경고 줄에서 복원해 봤지만 그 줄은 시각이 없고 «이상할 때만» 찍혀
 *     **궤적이 아니라 흔들린 순간 모음**이었다 (실제로 한 번 오독했다)
 *
 * ── 비용을 누른 세 가지 (기사님 승인) ──
 * 서버가 작다 — **메모리 911MB 중 가용 345MB**. 디스크는 29G 중 22G 여유.
 *   ① **문턱** 50m 또는 15초 — 다 저장하면 3.2MB/일, 이러면 0.7MB/일
 *   ② **일괄 쓰기** 20점 또는 30초마다 트랜잭션 하나 — 1점씩 넣는 것보다 수십 배 싸다
 *   ③ **7일 보관** 부팅 때 정리 — 8일째 부팅하면 1일차가 지워진다. 상한 5MB 에서 멈춘다
 *      (서버 로그가 3일치만 두는 것과 같은 규칙)
 */
const U = 'gps-track-test-user';

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name, avatar, role)
                VALUES (?,?,?,?,?,'USER')`).run(U, `gid-${U}`, 'gps@onedal.local', '검사용', '');
});
afterEach(() => { db.prepare('DELETE FROM gps_tracks WHERE user_id = ?').run(U); });
afterAll(() => { db.prepare('DELETE FROM users WHERE id = ?').run(U); });

describe('솎기 — 정차 중에는 거의 안 쌓인다', () => {
    const P = (x: number, y: number, t: number) => ({ x, y, atMs: t });

    it('첫 점은 언제나 남긴다 (비교 대상이 없다)', () => {
        expect(shouldStoreGpsPoint(null, P(127.29, 37.37, 0))).toBe(true);
    });

    it('🔴 50m 를 못 움직였고 15초도 안 지났으면 버린다 — 정차 중 폭증을 막는다', () => {
        const prev = P(127.2900, 37.3700, 0);
        // 약 10m 이동 · 1초 뒤
        expect(shouldStoreGpsPoint(prev, P(127.29011, 37.3700, 1_000))).toBe(false);
    });

    it('50m 이상 움직였으면 남긴다', () => {
        const prev = P(127.2900, 37.3700, 0);
        // 약 90m 이동
        expect(shouldStoreGpsPoint(prev, P(127.2910, 37.3700, 1_000))).toBe(true);
    });

    it('안 움직여도 15초가 지나면 남긴다 — «거기 있었다»는 기록이 필요하다', () => {
        const prev = P(127.2900, 37.3700, 0);
        expect(shouldStoreGpsPoint(prev, P(127.2900, 37.3700, 16_000))).toBe(true);
    });

    it('문턱은 상수로 박아 두지 않고 한 곳에서 온다', () => {
        expect(GPS_TRACK.MIN_MOVE_KM).toBeCloseTo(0.05, 3);
        expect(GPS_TRACK.MIN_GAP_MS).toBe(15_000);
        expect(GPS_TRACK.KEEP_DAYS).toBe(7);
    });
});

describe('일괄 쓰기 — 좌표마다 디스크를 두드리지 않는다', () => {
    it('🔴 모았다가 한 번에 넣는다 (버퍼가 차기 전에는 표가 비어 있다)', () => {
        for (let i = 0; i < 3; i++) {
            bufferGpsPoint(U, { x: 127.29 + i * 0.001, y: 37.37, atMs: Date.now() + i * 20_000, source: 'native' });
        }
        const before = db.prepare('SELECT count(*) c FROM gps_tracks WHERE user_id=?').get(U) as any;
        expect(before.c).toBe(0);            // 아직 메모리에만

        flushGpsBuffer();
        const after = db.prepare('SELECT count(*) c FROM gps_tracks WHERE user_id=?').get(U) as any;
        expect(after.c).toBe(3);
    });

    it('비어 있을 때 flush 해도 터지지 않는다', () => {
        expect(() => flushGpsBuffer()).not.toThrow();
    });
});

describe('보관 7일 — 8일째 부팅하면 1일차가 지워진다', () => {
    const day = 24 * 60 * 60 * 1000;

    it('🔴 7일보다 오래된 점만 지운다', () => {
        const now = Date.now();
        const ins = db.prepare(`INSERT INTO gps_tracks (user_id, at_ms, x, y, source) VALUES (?,?,?,?,?)`);
        ins.run(U, now - 8 * day, 127.1, 37.1, 'native');   // 8일 전 — 지워야
        ins.run(U, now - 6 * day, 127.2, 37.2, 'native');   // 6일 전 — 남아야
        ins.run(U, now, 127.3, 37.3, 'native');             // 오늘 — 남아야

        const removed = pruneGpsTracks(now);
        expect(removed).toBeGreaterThanOrEqual(1);

        const left = db.prepare('SELECT at_ms FROM gps_tracks WHERE user_id=? ORDER BY at_ms').all(U) as any[];
        expect(left).toHaveLength(2);
        expect(left.every(r => now - r.at_ms <= GPS_TRACK.KEEP_DAYS * day)).toBe(true);
    });
});

/**
 * 🚨 **경고가 너무 자주 울리면 경고가 아니다** (2026-08-26 실측)
 *
 * 2회차 주행 로그의 「위치 점프」 **70줄 중 43줄이 `0.0km 를 0.0초에`** 였다 —
 * 1m 움직인 것을 `46395km/h` 로 경고했다. `속도 = 거리 ÷ 시간` 인데 시간 바닥이
 * 0.001초라 거리가 작아도 속도가 폭발한다. 진짜 점프와 구분이 안 됐고,
 * 그 줄로 궤적을 복원하려다 **실제로 한 번 오독했다.**
 */
describe('위치 점프 경고 — 표본이 작으면 속도를 믿지 않는다', () => {
    it('🔴 1m 를 0.1초에 — 속도가 폭발하지만 경고하지 않는다', () => {
        expect(isSpeedSampleUsable(0.001, 0.1)).toBe(false);
    });

    it('🔴 안 움직였는데 시간만 지난 것도 표본이 아니다', () => {
        expect(isSpeedSampleUsable(0.0, 5)).toBe(false);
    });

    it('50m 이상 · 1초 이상이면 속도를 잰다', () => {
        expect(isSpeedSampleUsable(0.05, 1)).toBe(true);
        expect(isSpeedSampleUsable(5.0, 2)).toBe(true);
    });
});

/**
 * 🧭 **궤적에 «그때 어느 콜이었나»가 붙는다** (2026-08-28 실측으로 드러남)
 *
 * 3회차 주행 뒤 라이브 DB 를 열어 보니 —
 *
 *     궤적 1,894점 · 콜이 붙은 점 **0개** · 서로 다른 콜 **0개**
 *
 * `gps_tracks.order_id` 칸은 처음부터 있었고 *"그때 어느 콜을 향하고 있었나 — 경로 대조의
 * 열쇠"* 라는 주석까지 달려 있었는데, **채우는 쪽을 안 이었다.** `geoService` 가
 * `bufferGpsPoint` 를 부를 때 `orderId` 를 안 실었다.
 *
 * 🔴 **이게 비면 이 표를 만든 목적이 사라진다.** 기사님이 원한 것은
 *    *"부여받은 경로와 현실의 주행 궤적을 매칭해 얼마나 우회했는지"* 인데,
 *    **합짐 두세 개를 동시에 싣고 있으면 시각만으로는 어느 콜 구간인지 못 가린다** —
 *    하필 그게 이 제품의 핵심 상황이다.
 *
 * 🔴 **«다음 정거장»을 여기서 다시 계산하지 않는다** (규칙 ③).
 *    `watchArrival` 이 쓰는 것과 **같은 함수**에서 온다 — 두 벌이 되면 궤적이 가리키는 콜과
 *    도착 감지가 보는 콜이 갈라진다. 이 레포가 반복해 당한 사고 클래스다
 *    (경유 4벌 · 상태목록 3벌 · 시별칭).
 */
describe('궤적에 콜을 붙인다 — 경로 대조의 열쇠', () => {
    const order = (id: string, over: object = {}) => ({
        id, status: 'ORDER_CONFIRMED', pickup: `${id}-상차`, dropoff: `${id}-하차`,
        pickupX: 127.20, pickupY: 37.40, dropoffX: 126.80, dropoffY: 37.70,
        fare: 50000, ...over,
    }) as any;
    const sess = (calls: any[], fired: string[] = []) => ({
        myOrders: calls, arrivalFired: new Set(fired), driverLocation: null,
    }) as any;
    const GPS = { x: 127.00, y: 37.50 };

    it('🔴 좌표에 «그때 향하던 콜»이 실린다', () => {
        const p = gpsPointOf(sess([order('A')]), GPS, 1_000, 'native', 40);
        expect(p.orderId).toBe('A');
        expect(p.stopType).toBe('pickup');
    });

    it('🔴 이미 다녀온 정거장은 건너뛴다 — 상차를 찍었으면 다음은 하차지다', () => {
        const p = gpsPointOf(sess([order('A')], ['A:pickup']), GPS, 1_000, 'native', 40);
        expect(p.orderId).toBe('A');
        expect(p.stopType).toBe('dropoff');
    });

    it('활성 콜이 없으면 비운다 — 지어내지 않는다 (규칙 ④)', () => {
        const p = gpsPointOf(sess([]), GPS, 1_000, 'native', 40);
        expect(p.orderId).toBeNull();
        expect(p.stopType).toBeNull();
    });

    it('🔴 «다음 정거장»의 원천이 watchArrival 과 같다 — 두 벌이 아니다', () => {
        const calls = [order('A'), order('B')];
        const p = gpsPointOf(sess(calls), GPS, 1_000, 'native', 40);
        const expected = planArrivalStops(calls, GPS)[0];
        expect(p.orderId).toBe(expected.orderId);
        expect(p.stopType).toBe(expected.stopType);
    });

    it('좌표·시각·출처·속도는 그대로 실린다', () => {
        const p = gpsPointOf(sess([order('A')]), GPS, 123_456, 'mock', 7);
        expect([p.x, p.y, p.atMs, p.source, p.speedKmh]).toEqual([127.00, 37.50, 123_456, 'mock', 7]);
    });
});
