import { describe, it, expect } from 'vitest';
import { initialMotion, motionOnFix, motionOnTick, GPS_STALE_MS } from './driveMotion';

/**
 * 🚗 **주행/정차 판정 — 좌표가 끊기면 «마지막 속도 그대로»가 아니다**.
 *
 * 좌표가 끊겼는데 마지막 속도가 그대로 남으면 «주행»이 박혀, 경로가 생기는 순간 차가 서 있는데
 * «🚀 출발»이 켜진다. 규칙 ④ — 없는 값(끊긴 좌표)을 마지막 값으로 지어내지 않는다.
 */
const HOLD = 10_000;
const LAT_PER_KM = 1 / 110.574;
/** 1초마다 북쪽으로 km 만큼 간 좌표를 넣는다 */
function drive(st: ReturnType<typeof initialMotion>, fromMs: number, seconds: number, kmPerSec: number, lat0 = 37.3) {
    for (let s = 0; s <= seconds; s++) {
        const now = fromMs + s * 1000;
        st = motionOnFix(st, { lat: lat0 + s * kmPerSec * LAT_PER_KM, lng: 127.3 }, now);
        st = motionOnTick(st, now, HOLD);
    }
    return st;
}

describe('주행/정차 판정', () => {
    it('좌표가 한 번도 없으면 주행이 아니다', () => {
        let st = initialMotion();
        for (let s = 0; s < 30; s++) st = motionOnTick(st, s * 1000, HOLD);
        expect(st.mode).toBe('idle');
    });

    it('20km/h 넘게 유지 초만큼 달리면 주행', () => {
        const st = drive(initialMotion(), 0, 12, 0.03);   // 108km/h
        expect(st.mode).toBe('drive');
    });

    it('같은 자리 좌표가 유지 초만큼 이어지면 정차 — 모의 주행 정차 연기', () => {
        let st = drive(initialMotion(), 0, 12, 0.03);
        const t0 = 13_000, lat = 37.3 + 12 * 0.03 * LAT_PER_KM;
        for (let s = 0; s <= 12; s++) {
            st = motionOnFix(st, { lat, lng: 127.3 }, t0 + s * 1000);
            st = motionOnTick(st, t0 + s * 1000, HOLD);
        }
        expect(st.mode).toBe('idle');
    });

    it('🔴 달리다가 좌표가 끊기면 속도를 «모름»으로 보고 주행을 내린다 — 마지막 속도로 박히지 않는다', () => {
        let st = drive(initialMotion(), 0, 12, 0.03);
        expect(st.mode).toBe('drive');
        const lastFix = 12_000;
        for (let s = 1; s <= 60; s++) st = motionOnTick(st, lastFix + s * 1000, HOLD);
        expect(st.speed).toBeNull();
        expect(st.mode).toBe('idle');
    });

    it('🔴 끊긴 뒤라도 끊김 기준 안이면 아직 속도를 믿는다 — 좌표 한두 번 늦은 것으로 정차가 되지 않는다', () => {
        let st = drive(initialMotion(), 0, 12, 0.03);
        st = motionOnTick(st, 12_000 + GPS_STALE_MS - 1000, HOLD);
        expect(st.speed).not.toBeNull();
        expect(st.mode).toBe('drive');
    });

    it('끊겼다 다시 오면 그 좌표부터 새로 잰다 — 끊긴 동안 간 거리를 순간 속도로 치지 않는다', () => {
        let st = drive(initialMotion(), 0, 12, 0.03);
        for (let s = 1; s <= 60; s++) st = motionOnTick(st, 12_000 + s * 1000, HOLD);
        /* 60초 뒤 30km 떨어진 곳에서 좌표 — 끊김을 이어 재면 1800km/h(상한 250) 로 곧장 주행이 된다 */
        st = motionOnFix(st, { lat: 37.3 + 30 * LAT_PER_KM, lng: 127.3 }, 73_000);
        expect(st.speed).toBeNull();
    });
});
