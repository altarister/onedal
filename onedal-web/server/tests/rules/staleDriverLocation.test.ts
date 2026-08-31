import { readFileSync } from 'fs';
import { join } from 'path';
import { getUserSession } from '../../src/state/userSessionStore';
import { dropStaleLocation, DRIVER_LOCATION_STALE_MS } from '../../src/services/geoService';

/**
 * 📍 **낡은 좌표는 «지금 위치»가 아니다** (기사님 실측 2026-08-25)
 *
 * 기사님: *"지금 내 위치 조정 하고 랜덤 콜을 잡고 있는데.. 경로가 이상하게 그리는건 이유가 뭐야?"*
 *
 * ── 실측 ──
 *   14:24  모의 주행이 **여주 세종대왕면**(127.5847, 37.2920)에서 끝났다
 *   18:49  **광주**에서 콜을 잡았다 — 4시간 25분 뒤
 *   그 사이 GPS 가 한 번도 안 왔는데, 서버는 그 자리를 «지금 내 위치»로 믿었다.
 *
 *   경로 요청 origin 이 세 번 다 소수점 14자리까지 같았다:
 *     18:49 · 18:50 · 18:51   origin=127.58473548568698,37.29198716004579
 *
 *   그래서 «광주에서 실어 파주로 가는 콜»의 접근 구간이 **여주 → 광주 40km 뒤로**
 *   잡혔고, 지도가 그걸 그렸다.
 *
 * 🔴 **실제 운행에서도 같은 형태로 난다.** 터널·실내 주차장에서 GPS 가 끊긴 채 다음
 *    콜을 잡으면, 서버는 **끊기기 직전 자리**를 현위치로 쓴다.
 *
 * ── 고침 ──
 *   좌표에 **받은 시각**을 달고, 경로를 그리기 직전에 낡았으면 **비운다.**
 *   비우면 이미 있는 «내 주소로 메우기» 길이 받고, 화면이 «내 주소 기준»이라고 말한다
 *   (`driverLocationIsFallback`). 없는 값을 지어내지 않는다 (규칙 ④).
 *
 * ⚠️ **타이머를 두지 않는다.** 읽는 순간 빼기 한 번이다 —
 *    타이머는 좀비가 되고(규칙 ②), 5분마다 깨어나도 «4분 59초»와 «9분 59초»를
 *    똑같이 취급해 오히려 부정확하다. 낡음은 저장하는 상태가 아니라 **시각 차이에서
 *    파생되는 값**이다 (규칙 ③).
 */
const USER = 'test-stale-loc';
const 여주 = { x: 127.58473548568698, y: 37.29198716004579 };

function session(over: { at?: number | null } = {}) {
    const s = getUserSession(USER);
    s.driverLocation = { ...여주 };
    s.driverLocationAt = 'at' in over ? over.at! : Date.now();
    s.driverLocationIsFallback = false;
    return s;
}

describe('낡은 현위치 — 경로 기점으로 쓰지 않는다', () => {
    it('값의 근거 — 5분 (관제웹이 붙어 있으면 위치는 초 단위로 온다)', () => {
        expect(DRIVER_LOCATION_STALE_MS).toBe(5 * 60 * 1000);
    });

    it('🔴 4시간 25분 지난 좌표는 비운다 (2026-08-25 실측)', () => {
        const 받은시각 = Date.parse('2026-08-25T05:24:00.000Z');   // 14:24 KST
        const 콜잡은시각 = Date.parse('2026-08-25T09:49:00.000Z'); // 18:49 KST
        const s = session({ at: 받은시각 });

        dropStaleLocation(s, 콜잡은시각);

        expect(s.driverLocation).toBeNull();
        expect(s.driverLocationAt).toBeNull();
    });

    it('5분 안이면 그대로 쓴다 — 신호가 잠깐 끊겨도 접근 구간을 잃지 않는다', () => {
        const now = Date.now();
        const s = session({ at: now - 4 * 60 * 1000 });
        dropStaleLocation(s, now);
        expect(s.driverLocation).toEqual(여주);
    });

    it('경계에서 버리지 않는다 — 딱 5분은 아직 쓴다', () => {
        const now = Date.now();
        const s = session({ at: now - DRIVER_LOCATION_STALE_MS });
        dropStaleLocation(s, now);
        expect(s.driverLocation).not.toBeNull();
    });

    it('받은 시각을 모르면 건드리지 않는다 — 없는 값으로 지우지 않는다 (규칙 ④)', () => {
        const now = Date.now();
        const s = session({ at: null });
        dropStaleLocation(s, now);
        expect(s.driverLocation).toEqual(여주);
    });

    /** 판단이 두 벌이 되면 한쪽만 고쳐진다 (규칙 ③ — 이 레포가 반복해 당한 형태) */
    it('🔴 낡음을 재는 곳은 한 곳뿐이다', () => {
        const code = (rel: string) => readFileSync(join(__dirname, rel), 'utf8')
            .split('\n').filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');
        for (const f of ['../../src/services/dispatchEngine.ts', '../../src/core/engine/OrderEvaluator.ts']) {
            expect(code(f)).not.toMatch(/driverLocationAt\s*[<>]/);   // 직접 비교 금지
        }
        // 2026-08-31 — 비움 단독(dropStaleLocation)은 «내 주소 메우기»가 안 따라와
        //   합짐이 전부 🔴 로 나왔다. 호출부는 비움+메움 한 몸(ensureDriverOrigin)만 부른다.
        //   불변식은 그대로다 — 낡음 판단은 여전히 dropStaleLocation 안 한 곳뿐이다.
        expect(code('../../src/services/dispatchEngine.ts')).toMatch(/ensureDriverOrigin\(/);
    });

    it('🔴 좌표를 받을 때 시각을 남긴다', () => {
        const geo = readFileSync(join(__dirname, '../../src/services/geoService.ts'), 'utf8');
        expect(geo).toMatch(/driverLocationAt\s*=/);
    });
});
