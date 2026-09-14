import { describe, it, expect } from 'vitest';
import { mockLineOf } from './mockLine';

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
