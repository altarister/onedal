import { getDistanceKm } from '../../lib/routeUtils';

/**
 * 🚗 **주행/정차 판정 — 순수 함수 한 곳** (v23 Ⅲ · 기사님 확정 0831 · 버그 대장 #132).
 *
 * 이동 20km/h↑ 유지 초 → drive · 5km/h↓ 유지 초 → idle. 무대 신호(`useDriveMotion`)와 지도 배지(`MovingBadge`)가
 * **같은 함수**를 부른다 — 속도 계산이 두 벌이면 «자막은 정차인데 배지는 이동 중»이 난다 (0831).
 *
 * 🔴 **좌표가 끊기면 속도는 «모름»(`null`)이다 — 마지막 속도 그대로가 아니다** (규칙 ④).
 *    2026-09-15 이천 왕복: 앞 바퀴 모의 주행이 «주행 75km/h» 에서 끝나 좌표가 끊겼는데 속도가 그대로 남아
 *    54분 동안 «주행»이 박혔다 → A2 KEEP 으로 경로가 생기자 차가 서 있는데 «🚀 출발»이 켜졌다.
 *    모르는 속도는 주행이 아니다 — 출발은 달린 것이 재어졌을 때만 켠다.
 * 🔴 끊겼다 다시 온 좌표는 **그 좌표부터 새로 잰다** — 끊긴 동안 간 거리를 순간 속도로 치면 곧장 «주행»이 된다.
 */

/** 좌표가 이 시간 넘게 안 오면 «없는 것»으로 본다 — 실 GPS 끊김(`useMasterGps`)과 같은 질문이라 같은 값이다 */
export const GPS_STALE_MS = 15_000;

export interface MotionState {
    /** km/h — 모르면 null */
    speed: number | null;
    last: { lat: number; lng: number; time: number } | null;
    driveSince: number;
    idleSince: number;
    mode: 'drive' | 'idle';
}

export function initialMotion(): MotionState {
    return { speed: null, last: null, driveSince: 0, idleSince: 0, mode: 'idle' };
}

/** 좌표 한 점 — 속도를 잰다 */
export function motionOnFix(st: MotionState, loc: { lat: number; lng: number }, now: number): MotionState {
    let speed: number | null = null;
    if (st.last && now - st.last.time <= GPS_STALE_MS) {
        const h = (now - st.last.time) / 3_600_000;
        if (h > 0) {
            /**
             * 🔴 **내려갈 땐 즉시, 올라갈 땐 평활** (기사님 실측 0831 2판).
             *    양방향 EWMA 는 모의 순항(수천 km/h)에서 0 으로 내려오는 데만 ~17초 — 12초 정차 안에 «5km/h↓ 10초»가 영영 안 찬다.
             *    상한 250 은 GPS 튐(순간 수백 km/h)이 문턱을 흔들지 않게 한다.
             */
            const measured = Math.min(250, getDistanceKm(st.last.lat, st.last.lng, loc.lat, loc.lng) / h);
            speed = measured < 5 ? measured : ((st.speed ?? 0) * 0.7) + (measured * 0.3);
        } else {
            speed = st.speed;
        }
    }
    return { ...st, speed, last: { lat: loc.lat, lng: loc.lng, time: now } };
}

/** 1초 눈금 — 끊김을 보고, 유지 초를 세어 판정한다 */
export function motionOnTick(st: MotionState, now: number, holdMs: number): MotionState {
    const stale = !st.last || now - st.last.time > GPS_STALE_MS;
    const speed = stale ? null : st.speed;
    const fast = speed !== null && speed >= 20;
    const slow = speed === null || speed <= 5;
    let { driveSince, idleSince, mode } = st;
    if (fast) { idleSince = 0; if (!driveSince) driveSince = now; if (now - driveSince >= holdMs) mode = 'drive'; }
    else driveSince = 0;
    if (slow) { if (!idleSince) idleSince = now; if (now - idleSince >= holdMs) mode = 'idle'; }
    else idleSince = 0;
    return { ...st, speed, driveSince, idleSince, mode };
}
