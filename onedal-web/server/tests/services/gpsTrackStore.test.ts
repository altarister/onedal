import { shouldStoreGpsPoint } from '../../src/services/gpsTrackStore';


/**
 * ⏸️ **서 있는 것도 남긴다** (현황판 실측 2026-09-12)
 *
 * 현황판: *"정차 시작 → 6초 재전송: 50m 미만 && 15초 미만 → 버림 / 12초: 버림 /
 * 18초째: 문턱 넘음. **그런데 `dwellSec` 이 18이라 이미 출발**"* —
 * 실측 191점에 **제자리 구간 0건, 최소 걸음 51m**. 재전송분이 하나도 안 들어왔다.
 *
 * 🔴 **소스만 보는 검사는 이것을 못 잡았다.** *"재전송 주기가 문턱보다 짧다"* 를 물어
 *    초록이었는데, **짧아서 더 버려지는** 관계였다 (방향이 반대였다).
 *    그래서 여기서 **함수를 직접 먹여** 본다.
 */
describe('shouldStoreGpsPoint — 서 있는 점', () => {
    const at = (ms: number) => ({ x: 127.4, y: 37.3, atMs: ms });

    it('🔴 서 있으면 거리·시간을 안 본다 — 같은 자리 1초 뒤라도 남긴다', () => {
        expect(shouldStoreGpsPoint(at(0), at(1_000), true)).toBe(true);
    });

    it('안 서 있으면 그대로 문턱을 본다 — 제자리 점이 무한정 쌓이지 않는다', () => {
        expect(shouldStoreGpsPoint(at(0), at(1_000))).toBe(false);
        expect(shouldStoreGpsPoint(at(0), at(1_000), false)).toBe(false);
    });

    it('🔴 정차 18초를 6초마다 보내면 **세 점이 남는다** — 전에는 0점이었다', () => {
        /* 실제 리듬 그대로: 0 → 6 → 12 → 18초, 좌표는 한 톨도 안 변한다 */
        let last = at(0);
        let kept = 0;
        for (const t of [6_000, 12_000, 18_000]) {
            if (shouldStoreGpsPoint(last, at(t), true)) { kept++; last = at(t); }
        }
        expect(kept).toBe(3);
    });
});
