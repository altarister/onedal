import { describe, it, expect } from 'vitest';
import { isDeviceQuiet, DEVICE_QUIET_MS } from './index';

/**
 * ⏱️ **폰이 조용한가** (기사님 확정)
 *
 * 판정은 `isDeviceQuiet` 하나다 (`routes/devices.ts` 가 부른다).
 *
 * ⑤-4 의 다섯 —
 * ① `DeviceSession.prevSeen`(메모리만) ② **30초** ③ `lastSeen` 을 덮기 직전
 * ④ 폰 이름 옆 `⏱️` — **조용할 때만** ⑤ **관제웹 배지 하나뿐**
 */
describe('⏱️ 폰이 조용한가', () => {
    it('기준은 30초다 — **생존신고 60초의 절반**이다', () => {
        /**
         * 🔴 지어낸 값이 아니다. 앱은 일이 생기면 그때 보내고(수초) 아무 일도 없으면
         *    60초마다 보낸다 — **간격이 그 중간값으로 나오는 일이 거의 없다.**
         *    그래서 30초는 «둘 중 어느 쪽인가»를 가장 잘 가른다.
         */
        expect(DEVICE_QUIET_MS).toBe(30_000);
    });

    it('30초를 넘게 말이 없으면 조용하다', () => {
        expect(isDeviceQuiet(0, 31_000)).toBe(true);
    });

    it('일이 있어 자주 말하면 조용하지 않다', () => {
        expect(isDeviceQuiet(0, 3_200)).toBe(false);
    });

    it('경계는 «넘어야» 조용하다 — 딱 30초는 아직 아니다', () => {
        expect(isDeviceQuiet(0, DEVICE_QUIET_MS)).toBe(false);
        expect(isDeviceQuiet(0, DEVICE_QUIET_MS + 1)).toBe(true);
    });

    it('🔴 첫 보고는 «조용»이 아니다 — 모르는 것과 조용한 것은 다르다 (규칙 ④)', () => {
        expect(isDeviceQuiet(undefined, 99_999)).toBe(false);
    });

    it('시계가 거꾸로 가도 조용하다고 하지 않는다', () => {
        expect(isDeviceQuiet(5_000, 1_000)).toBe(false);
    });
});
