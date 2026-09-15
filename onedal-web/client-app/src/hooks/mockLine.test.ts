import { describe, it, expect } from 'vitest';
import { mockLineOf, mockDriveOn } from './mockLine';

/**
 * 🎭 **모의 주행이 달릴 선 — 심사 중에는 직전 선을 지킨다** (2026-09-15 다섯 번째 바퀴 · onedal-49 가설).
 *
 * 후보콜이 판정에 들어오는 순간 서버가 후보를 넣은 합짐 미리보기 선(`OrderEvaluator` 의 merged.polyline)을 싣고,
 * 관제웹 경로 홀더의 선이 100점 → 496점으로 바뀌었다(06:30:08.971). 모의 주행이 그 선으로 갈아타 13.1km 튀었고,
 * 서버가 다음 틱을 «하차지를 떠났다»로 읽어 B1 을 가짜로 하차 완료했다. 실 GPS 는 선을 안 따르니 시험 도구만 막는다.
 * 🔴 지도에 그리는 선(심사 중 미리보기)은 그대로다 — 모의 주행이 달리는 선만 가른다.
 */
const A = [{ x: 1, y: 1 }, { x: 2, y: 2 }];
const B = [{ x: 9, y: 9 }, { x: 8, y: 8 }];

describe('모의 주행 선', () => {
    it('심사 중이 아니면 지금 선을 달린다', () => {
        expect(mockLineOf(A, B, false)).toBe(B);
    });
    it('🔴 심사 중이면 직전 선을 지킨다 — 미리보기 선으로 갈아타지 않는다', () => {
        expect(mockLineOf(A, B, true)).toBe(A);
    });
    it('직전 선이 없으면(처음부터 심사 중) 지금 선 — 멈추지 않는다', () => {
        expect(mockLineOf(null, B, true)).toBe(B);
    });
    it('선이 사라지면 사라진다 — 콜이 끝났다', () => {
        expect(mockLineOf(A, null, false)).toBeNull();
    });
});

/**
 * 🅿️ **콜이 0건이 되어 선이 사라져도 켜 둔 모의 주행은 그 자리 좌표를 계속 낸다** (2026-09-15 여섯 번째 바퀴).
 * 10:55:56 콜 0건 → 선이 사라져 모의 주행이 좌표를 끊었고, 6초 뒤 B3 심사 기점이 집 주소(서버 «5초 안에 보낸 모의 주행»이 끊김)로 잡혀
 * 이천 관고동에 선 차가 중리동 → 사음동 → 신둔 → 중리동으로 오갔다 (onedal-49 진단).
 */
describe('모의 주행이 좌표를 내는가', () => {
    const base = { simulator: true, running: true, realLive: false, hasLine: true, parked: false };
    it('선이 있고 켜 뒀으면 낸다', () => expect(mockDriveOn(base)).toBe(true));
    it('🔴 선이 사라져도 달리던 자리가 있으면 그 자리에서 대기하며 낸다', () =>
        expect(mockDriveOn({ ...base, hasLine: false, parked: true })).toBe(true));
    it('한 번도 달린 적 없고 선도 없으면 안 낸다 — 좌표를 지어내지 않는다', () =>
        expect(mockDriveOn({ ...base, hasLine: false, parked: false })).toBe(false));
    it('기사님이 끄면 안 낸다', () => expect(mockDriveOn({ ...base, running: false, parked: true })).toBe(false));
    it('실 GPS 가 살아 있으면 안 낸다', () => expect(mockDriveOn({ ...base, realLive: true, parked: true })).toBe(false));
    it('개발 빌드가 아니면 안 낸다', () => expect(mockDriveOn({ ...base, simulator: false, parked: true })).toBe(false));
});
