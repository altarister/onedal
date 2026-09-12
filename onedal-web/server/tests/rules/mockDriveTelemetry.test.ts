import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 📡 **모의 주행이 서버까지 «사실»을 보내는가** (현황판 실측 2026-09-12)
 *
 * 현황판이 화면이 아니라 **`gps_tracks` 로 재서** 둘을 잡아 줬다:
 *
 * 🔴 ① **정차 18초가 서버에 안 왔다** — 좌표가 안 변하니 `gpsBridge` 의 「같은 자리는
 *    안 보낸다」가 한 번도 안 내보냈다. 궤적에 정차 흔적이 **0건**(최장 간격 7초)이고,
 *    «5km/h↓ 가 이어지면 정차»가 **발화할 입력조차 없었다** — 18초를 둔 목적이
 *    서버 쪽에서는 이룰 수 없었다.
 *
 * 🔴 ② **배속이 차의 속도로 기록됐다** — 평균 4,251 · 최고 39,415 km/h.
 *    *"배속은 «시간을 빨리 돌리는 것»이지 «차가 빨라지는 것»이 아니니까요"* (현황판).
 *    그 궤적으로는 나중에 «여기서 막혔나»를 읽을 수가 없다.
 *
 * 🔴 **`simStep.test.ts` 는 이것을 못 본다** — 순수 함수라 «함수가 옳게 섰나»만 안다.
 *    현황판 지적 그대로다: *"**함수는 옳게 섰는데 좌표가 안 나갔습니다.**"*
 *    그 틈을 이 검사가 맡는다 — 보내는 자리와 적는 자리를 본다.
 *
 * ⚠️ `pnpm drive` 로는 못 본다. 그 도구는 정거장으로 **순간이동**하는 재생기라
 *    경로를 걷지도, 18초를 서지도, 배속을 쓰지도 않는다 (넣어 봤다가 걷어냈다).
 */

const SERVER = join(__dirname, '../../src');
const CLIENT = join(__dirname, '../../../client-app/src');
const read = (abs: string) => readFileSync(abs, 'utf8');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('모의 주행 — 서버까지 사실이 간다', () => {

    it('🔴 ① 같은 자리라도 주기적으로 보낸다 — 정차도 «사실»이다', () => {
        const bridge = codeOnly(read(join(CLIENT, 'lib/gpsBridge.ts')));
        /* 거르기 자체는 남는다 (2026-08-14 중복 발신) — 다만 시간 예외가 있어야 한다 */
        expect(bridge).toMatch(/same-position/);
        expect(bridge).toMatch(/SAME_SPOT_RESEND_MS/);
        const i = bridge.indexOf("reason: 'same-position'");
        const guard = bridge.slice(bridge.lastIndexOf('if (lastSent', i), i);
        expect(guard).toMatch(/now - lastSent\.at < SAME_SPOT_RESEND_MS/);
    });

    /**
     * 🔴 **이 검사는 처음에 «거꾸로» 였다** (현황판이 잡아 줬다 · 2026-09-12).
     *
     * 처음엔 *"재전송 주기가 서버 문턱(15초)보다 짧다"* 를 물었다. **방향이 반대다** —
     * 짧아서 **더 버려진다.** 6초·12초 재전송이 «50m 미만 + 15초 미만»에 걸려 전부
     * 버려지고, 18초째에야 문턱을 넘는데 그때는 이미 출발한 뒤다. 그래서
     * **검사는 초록인데 정차는 0건**이었다 — 소스만 보는 검사의 전형적인 거짓 초록이다.
     *
     * 🟢 **관계를 없앴다.** 두 숫자가 서로를 알 필요가 없게, «서 있다»는 **사실**을 실어
     *    보내고 그 점은 문턱을 안 본다 (현황판 (가)안). 이제 물 것은 **그 길이 이어졌는가**다.
     */
    it('🔴 ① «서 있다»가 클라에서 서버까지 간다 — 주기와 문턱이 서로를 몰라도 된다', () => {
        const bridge = codeOnly(read(join(CLIENT, 'lib/gpsBridge.ts')));
        expect(bridge).toMatch(/stopped: extra\?\.stopped/);
        const master = codeOnly(read(join(CLIENT, 'hooks/useMasterGps.ts')));
        expect(master).toMatch(/stopped: mockGps\.stopped/);
        const sim = codeOnly(read(join(CLIENT, 'hooks/useMockGpsSimulator.ts')));
        expect(sim).toMatch(/stopped: simRef\.current\.phase === 'dwell'/);
        const sock = codeOnly(read(join(SERVER, 'socket/socketHandlers.ts')));
        expect(sock).toMatch(/loc\.stopped/);
    });

    it('🔴 ① 서 있으면 궤적 문턱을 안 본다 — «같은 자리에 있다»도 사실이다', () => {
        const store = codeOnly(read(join(SERVER, 'services/gpsTrackStore.ts')));
        const i = store.indexOf('export function shouldStoreGpsPoint');
        const body = store.slice(i, store.indexOf('\n}', i));
        /* 🔴 «서 있다»가 **거리·시간 문턱보다 먼저** 와야 한다 — 뒤에 두면 이미 걸러진다 */
        expect(body.indexOf('if (stopped) return true')).toBeGreaterThan(-1);
        expect(body.indexOf('if (stopped) return true')).toBeLessThan(body.indexOf('MIN_MOVE_KM'));
        const geo = codeOnly(read(join(SERVER, 'services/geoService.ts')));
        expect(geo).toMatch(/shouldStoreGpsPoint\(lastPt, nowPt, stopped\)/);
    });

    it('🔴 ② 배속을 서버까지 실어 보낸다', () => {
        const bridge = codeOnly(read(join(CLIENT, 'lib/gpsBridge.ts')));
        expect(bridge).toMatch(/speedMultiplier: extra\?\.speedMultiplier/);
        const master = codeOnly(read(join(CLIENT, 'hooks/useMasterGps.ts')));
        expect(master).toMatch(/speedMultiplier: mockSpeed/);
        const sock = codeOnly(read(join(SERVER, 'socket/socketHandlers.ts')));
        expect(sock).toMatch(/loc\.speedMultiplier/);
    });

    it('🔴 ② 궤적에는 «나눈» 속도를 남긴다 — 배속 그대로가 아니다', () => {
        const geo = codeOnly(read(join(SERVER, 'services/geoService.ts')));
        const i = geo.indexOf('bufferGpsPoint(');
        const near = geo.slice(Math.max(0, i - 400), i + 200);
        expect(near).toMatch(/speedKmh \/ mult/);
    });

    it('🔴 ② «얼마로 달렸나»와 «얼마로 돌렸나»는 다른 칸이다 (규칙 ⑤-4 ⑤)', () => {
        const db = codeOnly(read(join(SERVER, 'db.ts')));
        const ensured = db.slice(db.indexOf("ensureColumns('gps_tracks'"));
        expect(ensured.slice(0, 300)).toMatch(/speed_multiplier: 'REAL DEFAULT 1'/);
    });

    it('🔴 ③ 경로가 갈리면 «지금 자리»에서 다시 잡는다 — 1초에 10.9km 뛰던 것', () => {
        /**
         * 현황판: *"한 점이 **1초에 10.9km** 뛰었습니다 … 경로 인덱스를 건너뛴 자리로 의심"*.
         * 🔴 예전엔 `length` 로만 견줘, 점 수가 같으면 **옛 인덱스를 그대로** 썼다 —
         *    새 경로의 그 번째 점은 전혀 다른 자리다.
         */
        const sim = codeOnly(read(join(CLIENT, 'hooks/useMockGpsSimulator.ts')));
        /**
         * 🔴 **«내용»으로 견준다 — 참조도 길이도 아니다** (기사님 실측 2026-09-12 두 번째).
         *    ⓐ `length` 만 보면 점 수가 같은 다른 경로에 옛 인덱스를 써 10.9km 뛴다
         *    ⓑ **참조**로 보면 `sync-active-orders` 마다 새 배열이라 **매번 다시 잡아**
         *       걸음이 끊긴다 (*"이번에는 경로도 잘못 돌았어"*) — ⓐ 를 고치며 낸 것이다
         */
        expect(sim).toMatch(/sig\(routeRef\.current\) !== sig\(routePolyline\)/);
        expect(sim).not.toMatch(/routeRef\.current\?\.length !== routePolyline\?\.length/);
        expect(sim).not.toMatch(/if \(routeRef\.current !== routePolyline\)/);
        /* 🔴 «지금 서 있는 자리»도 함께 비운다 — 안 그러면 옛 보간 좌표가 기점이 된다 */
        const i = sim.indexOf('sig(routeRef.current) !== sig(routePolyline)');
        expect(sim.slice(i, i + 400)).toMatch(/simRef\.current\.at =/);
    });
});
