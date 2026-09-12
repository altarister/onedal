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

    it('🔴 ① 그 주기는 서버 저장 문턱(15초)보다 짧다 — 안 그러면 한 점도 안 남는다', () => {
        const bridge = read(join(CLIENT, 'lib/gpsBridge.ts'));
        const m = bridge.match(/SAME_SPOT_RESEND_MS = ([\d_]+)/);
        expect(m).not.toBeNull();
        const ms = Number(m![1].replace(/_/g, ''));
        expect(ms).toBeGreaterThan(0);
        expect(ms).toBeLessThan(15_000);
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
        expect(sim).toMatch(/routeRef\.current !== routePolyline/);
        expect(sim).not.toMatch(/routeRef\.current\?\.length !== routePolyline\?\.length/);
        /* 🔴 «지금 서 있는 자리»도 함께 비운다 — 안 그러면 옛 보간 좌표가 기점이 된다 */
        const i = sim.indexOf('routeRef.current !== routePolyline');
        expect(sim.slice(i, i + 400)).toMatch(/simRef\.current\.at =/);
    });
});
