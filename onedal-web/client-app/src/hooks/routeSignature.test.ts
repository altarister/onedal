import { describe, it, expect } from 'vitest';
import { routeSignature } from './routeSignature';

/**
 * 🧬 **경로가 바뀌었나 — 그 판단이 세 번 틀렸다**.
 *
 * ── 왜 이 검사가 있나 ──
 * 모의 주행은 «지금 달리는 경로»의 인덱스를 들고 걷는다. 경로가 갈리면 인덱스를 다시
 * 잡아야 하는데, **«갈렸나»를 무엇으로 보느냐**로 하루에 세 번 넘어졌다:
 *
 *   ⓐ `length` 만      → 점 수가 같은 다른 경로에 **옛 인덱스**를 써 **10.9km** 뛰었다
 *   ⓑ 참조(`!==`)      → `sync-active-orders` 마다 새 배열이라 **매 틱 다시 잡아** 걸음이 끊겼다
 *                        (기사님: *"이번에는 경로도 잘못 돌았어"*)
 *   ⓒ 양끝 + 길이      → 느슨했다. **콜이 끝나 경로가 다시 짜였는데 그 셋이 같아** 또 뛰었다
 *                        (실측 21:36:11 — 한 틱에 10,916m)
 *
 * 🔴 **중간을 봐야 한다.** 같은 두 점을 잇는 길은 여럿이고(콜이 빠지면 경유가 바뀐다),
 *    양끝만으로는 그 차이가 안 드러난다.
 * 🔴 **참조로 돌아가지 않는다** — 값이 같으면 같은 지문이어야 한다. 그게 ⓑ 의 교훈이다.
 */
const pt = (x: number, y: number) => ({ x, y });

describe('경로 지문 — 갈렸는가', () => {

    it('같은 배열이면 같은 지문 (참조가 달라도)', () => {
        const a = [pt(127.1, 37.1), pt(127.2, 37.2), pt(127.3, 37.3)];
        const b = a.map(p => ({ ...p }));          // 값은 같고 참조만 다르다
        expect(routeSignature(a)).toBe(routeSignature(b));
    });

    /**
     * 🔴 **이 한 건이 오늘 두 번 놓친 것이다** — 양끝과 점 수가 같은 다른 길.
     *    콜 하나가 끝나 경유가 빠지면 실제로 이런 모양이 된다.
     */
    it('🔴 양끝·점 수가 같아도 중간이 다르면 다른 지문이다', () => {
        const before = [pt(127.0, 37.0), pt(127.5, 37.9), pt(127.4, 37.2), pt(128.0, 38.0)];
        const after = [pt(127.0, 37.0), pt(127.1, 37.1), pt(127.2, 37.2), pt(128.0, 38.0)];
        expect(before.length).toBe(after.length);                    // 점 수 같음
        expect(before[0]).toEqual(after[0]);                         // 시작 같음
        expect(before[3]).toEqual(after[3]);                         // 끝 같음
        expect(routeSignature(before)).not.toBe(routeSignature(after));
    });

    it('점 수가 다르면 다른 지문이다', () => {
        const a = [pt(127.0, 37.0), pt(127.5, 37.5), pt(128.0, 38.0)];
        expect(routeSignature(a)).not.toBe(routeSignature([...a, pt(128.1, 38.1)]));
    });

    it('빈 경로·없음은 같은 «없음» 지문이다', () => {
        expect(routeSignature(null)).toBe(routeSignature([]));
        expect(routeSignature(undefined)).toBe(routeSignature(null));
    });

    /**
     * ⚠️ **긴 경로에서도 싸야 한다** — 매 틱은 아니어도 `sync` 마다 돈다.
     *    점 2,000개를 전부 이어 붙이면 문자열이 수만 자가 된다. **표본만 본다.**
     */
    it('긴 경로에서도 지문이 짧다 (전부 이어 붙이지 않는다)', () => {
        const long = Array.from({ length: 2000 }, (_, i) => pt(127 + i * 1e-4, 37 + i * 1e-4));
        expect(routeSignature(long).length).toBeLessThan(200);
    });

    /** 🔴 표본이 듬성해도 **중간 한 점이 바뀌면 잡아야** 뜻이 있다 */
    it('🔴 긴 경로의 중간 한 점이 바뀌면 다른 지문이다', () => {
        const a = Array.from({ length: 2000 }, (_, i) => pt(127 + i * 1e-4, 37 + i * 1e-4));
        const b = a.map((p, i) => (i === 1000 ? pt(126.5, 36.5) : p));
        expect(routeSignature(a)).not.toBe(routeSignature(b));
    });
});
