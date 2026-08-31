import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🔒 **«한 곳으로 모았다»가 참인지 검사가 지킨다** (기사님 지시 2026-09-01)
 *
 * 기사님: *"아무 생각 없이 수정하지 말고 깊이 생각하고 수정해."*
 *
 * ── 2026-08-31 하루에 같은 실수를 네 번 했다 ──
 * 전부 «한 곳으로 모았다»고 **선언한 커밋**에서 나왔고, 형태가 하나다:
 * **새 원천은 만들었는데 부르는 곳을 세지 않았다.**
 *
 *   상차 약속   — 만드는 곳이 셋인데 하나만 고쳤다 → 심사 카드는 «+0분», 덱은 «−5분»
 *   경로 홀더   — 관제웹만 고치고 서버 안에 판정이 둘 남았다
 *   주행/정차   — `useDriveMotion` 에서 mock 특례를 지우고 `MovingBadge` 는 뒀다
 *                 → 한 화면에 «정차 중»과 «시뮬 주행»이 나란히 떴다
 *   정거장 번호 — 세는 재료가 셋이라 «신둔면이 6이었다가 3이었다가» 뛰었다
 *
 * 그날 새로 쓴 검사들도 **새 원천만** 불렀다. 옛 자리는 안 부르니 전부 초록이었다 —
 * 이 레포가 이미 아는 병이다: *"있는 검사가 안 불리면 없는 것이다."*
 *
 * 🔴 그래서 규칙을 하나 세운다 — **«모았다»고 말하려면 여기에 검사를 한 줄 더한다.**
 *    다짐은 다음 날 사라지지만 빨간불은 안 사라진다.
 */
const WEB = join(__dirname, '../../..');
const read = (rel: string) => readFileSync(join(WEB, rel), 'utf8');
/** 주석은 뺀다 — 사고 이력을 적어 둔 문장이 «코드에 있다»로 오독되면 안 된다 */
const codeOnly = (src: string) =>
    src.split('\n').filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');

describe('상차 약속을 만드는 곳은 pickupClockMsOf 하나', () => {
    /**
     * 약속은 «통화 약속 > 적요 상차 시각 > 콜 잡은 시각 + 20분» 이라는 **사다리**다.
     * 그 사다리를 다시 짜면(= 설정값에 60_000 을 곱하면) 적요·통화 갈래가 빠진 반쪽이 된다 —
     * 2026-08-31 에 `stepSeeder` 가 정확히 그 반쪽을 들고 DB 에 저장하고 있었다.
     */
    const FILES = [
        'shared/src/timing.ts',
        'server/src/services/stepSeeder.ts',
        'server/src/core/engine/OrderEvaluator.ts',
    ];
    for (const rel of FILES) {
        it(`🔴 ${rel} — 설정값(상차 약속 분)을 직접 시각으로 환산하지 않는다`, () => {
            const code = codeOnly(read(rel));
            for (const line of code.split('\n')) {
                if (!/pickupPromiseMin/.test(line)) continue;
                // 같은 줄에서 분→밀리초 환산이 보이면 사다리를 다시 짠 것이다
                expect(line).not.toMatch(/\*\s*60[_ ]?000/);
            }
        });
    }

    it('🔴 약속이 도착 예상을 따라가는 옛 식이 되살아나지 않는다', () => {
        /** `max(도착 예상, 시계)` — 여유를 늘 0으로 만들고 늦음을 감추던 식 */
        const timing = codeOnly(read('shared/src/timing.ts'));
        const seeder = codeOnly(read('server/src/services/stepSeeder.ts'));
        expect(timing).not.toMatch(/Math\.max\([^)]*capturedMs[^)]*clock/);
        expect(seeder).not.toMatch(/Math\.max\(pickupEta/);
    });
});

describe('«달리는가»를 판정하는 곳은 하나 — 모의 특례는 없다', () => {
    /**
     * 모의 좌표라고 무조건 «주행»으로 치면 시뮬 정차 연기(18초)가 통째로 묻힌다.
     * 2026-08-31: `useDriveMotion` 에서만 특례를 지워, 무대 자막(«정차 중») 옆에서
     * 배지가 «시뮬 주행»이라고 반대말을 했다.
     */
    const panel = codeOnly(read('client-app/src/components/dashboard/VehicleStatusPanel.tsx'));

    it('🔴 모의면 속도를 0 으로 눌러 두지 않는다', () => {
        expect(panel).not.toMatch(/isMock\s*\)\s*\{?\s*setCurrentSpeed\(0\)/);
    });

    it('🔴 «움직이는가»를 출처로 판정하지 않는다 — 속도로만 판정한다', () => {
        expect(panel).not.toMatch(/isMoving\s*=\s*gpsIsMock\s*\|\|/);
        expect(panel).toMatch(/isMoving\s*=\s*currentSpeed\s*>/);
    });
});

describe('정지도 사건이다 — 화면이 «아직 여기 있다»를 듣는다', () => {
    /**
     * 2026-09-01 실측: 정거장에 18초 서 있는데 배지가 «이동 중 87km/h» 였다.
     * 서버 중복 거르기가 **화면 알림까지** 막아, 정차 동안 좌표 알림이 한 번도 안 나갔다.
     * 정지는 «사건이 없는 것»이 아니라 «같은 자리에 있다»는 사실이다 (규칙 ④).
     */
    it('🔴 같은 자리라도 화면에는 알린다 (서버로만 안 보낸다)', () => {
        const bridge = codeOnly(read('client-app/src/lib/gpsBridge.ts'));
        const beforeDedupe = bridge.slice(0, bridge.indexOf('reason: \'same-position\''));
        expect(beforeDedupe).toMatch(/dispatchEvent\(new CustomEvent\('local-gps-update'/);
    });
});

describe('도착은 사건이라 덮이지 않는다', () => {
    /**
     * 2026-08-31 야간 판: 도착 6번 중 시트가 2번만 올라갔다. 도착을 포커스 그릇(gpsFocus)에
     * 담아 읽었는데 그 그릇에 «달리는 중 덱 따라가기»도 담겨, 도착 직후 다음 정거장이
     * 바뀌면서 **도착을 덮어썼다.** KEEP 이 한 번도 안 틀린 이유는 소켓을 직접 듣기 때문이다.
     */
    const view = codeOnly(read('client-app/src/components/stage/StageView.tsx'));

    it('🔴 도착 마중은 소켓(auto-arrived)에서 직접 받는다', () => {
        expect(view).toMatch(/socket\.on\('auto-arrived'/);
    });

    it('🔴 포커스 그릇의 kind 로 시트를 올리지 않는다', () => {
        expect(view).not.toMatch(/gpsFocus[\s\S]{0,40}kind\s*!==\s*'arrive'/);
    });
});

describe('정거장 번호를 세는 곳은 하나', () => {
    /**
     * 번호를 «지금 남은 목록의 몇 번째»로 매번 새로 세면, 서버가 경로를 다시 세울 때마다
     * 뛴다 (실측: «신둔면이 6이었다가 3이었다가»). 다녀온 정거장을 목록에서 빼면 그 콜의
     * 번호가 통째로 사라진다 (실측: 요약줄의 «초월읍 → 신둔면» 앞 번호).
     */
    const der = codeOnly(read('client-app/src/hooks/useRouteDerivations.ts'));

    it('🔴 번호는 stopNoOf 한 곳에서 나온다', () => {
        expect(der).toMatch(/const stopNoOf = useMemo/);
        expect(der).toMatch(/const visitOrderMap = useMemo/);
    });

    it('🔴 남은 목록의 인덱스로 번호를 만들지 않는다 (옛 방식이 되살아나지 않게)', () => {
        expect(der).not.toMatch(/buildVisitOrderMap/);
        expect(der).not.toMatch(/pickupIdx \+= |dropoffIdx \+= /);   // 다녀온 개수만큼 밀던 보정
    });

    it('🔴 출발하면 얼린다 — 재계산으로 번호가 바뀌지 않는다', () => {
        expect(der).toMatch(/isDriving \? stopNoRef\.current : new Map/);
    });

    it('🔴 지도 캔버스가 스스로 세지 않는다 — 번호는 실려 온다', () => {
        /**
         * 2026-09-01 실측: 이름표는 «1. 곤지암읍», 지도 마커는 «2 곤지암읍» —
         * 캔버스가 «다녀온 개수 + 남은 목록 인덱스»로 **또** 세고 있었다 (네 번째 벌).
         * 이 검사를 처음 쓸 때 파생만 보고 캔버스를 안 봐서 놓쳤다.
         */
        const canvas = codeOnly(read('client-app/src/components/dashboard/PinnedRouteCanvas.tsx'));
        expect(canvas).not.toMatch(/trail\.length \+ i \+ 1/);
        expect(canvas).toMatch(/p\.no/);
    });
});
