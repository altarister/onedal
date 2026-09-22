import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { trailOfShown, hiddenPastIds } from './pastCalls';

/**
 * 🙈 **지나간 콜 숨기기** (기사님 지시 2026-09-13: *"오른쪽 끝에 지나간 콜 숨기기가
 *    있으면 좋겠는데… 아코디언의 콜타이틀중 배송이 끝난콜을 숨겼다 보였다"*).
 *
 * ── 왜 필요한가 ──
 * 덱은 **하차를 마친 콜도 사이클이 끝날 때까지 함께 보여 준다**(`deckOfCycle`) — 6단계가
 * 채워진 모습을 볼 수 없다는 기사님 말씀으로 그렇게 정했다. 그런데 콜이 여섯이면 끝난
 * 줄이 목록을 눌러앉아 **지금 할 콜이 아래로 밀린다.**
 *
 * 🔴 **끝난 콜은 «지운다»가 아니라 «접는다»다.** 목록에서 빼면 `openIdx`(목록 자리)가
 *    다른 콜을 가리킨다 — 화면규칙 L3 가 경고한 그 자리다(*"콜은 번호로 찾는다 —
 *    뺄셈으로 찾지 않는다"*). 그래서 **배열은 그대로 두고 «숨길 id»만 넘긴다.**
 * 🔴 **언마운트하지 않는다** — 접힌 콜을 마운트한 채 숨기는 규칙이 이미 있다
 *   . 여기도 같다.
 *
 * 🔴 **열어 둔 콜은 숨기지 않는다.** 기사님이 끝난 콜을 일부러 펼쳐 보는 중에 하차가
 *    찍히면, 숨김이 켜져 있다는 이유로 **보고 있던 것이 사라진다.** 손이 고른 것이
 *    자동 규칙보다 세다. 닫으면 그때 사라진다 — 스스로 맞아 들어간다.
 */
const call = (id: string, status: string) => ({ id, status });

describe('🙈 지나간 콜 숨기기', () => {

    it('숨김이 꺼져 있으면 아무것도 숨기지 않는다', () => {
        const got = hiddenPastIds([call('a', 'ORDER_DELIVERED'), call('b', 'ORDER_PICKED_UP')], false, null);
        expect([...got]).toEqual([]);
    });

    it('배송이 끝난 콜만 숨긴다', () => {
        const got = hiddenPastIds([
            call('a', 'ORDER_DELIVERED'),
            call('b', 'ORDER_PICKED_UP'),
            call('c', 'ORDER_COMPLETED'),
            call('d', 'ORDER_CONFIRMED'),
        ], true, null);
        expect([...got].sort()).toEqual(['a', 'c']);
    });

    /**
     * 🔴 **이 한 건이 손을 지킨다** — 끝난 콜을 펼쳐 보는 중에 숨김이 켜져 있어도
     *    보고 있던 것이 사라지지 않는다.
     */
    it('🔴 열어 둔 콜은 끝났어도 숨기지 않는다', () => {
        const got = hiddenPastIds([call('a', 'ORDER_DELIVERED'), call('c', 'ORDER_DELIVERED')], true, 'a');
        expect([...got]).toEqual(['c']);
    });

    /** ⚠️ 취소·방출은 애초에 덱에 없다 (`deckOfCycle`) — 여기서 다시 가르지 않는다 */
    it('빈 목록이면 빈 집합이다', () => {
        expect([...hiddenPastIds([], true, null)]).toEqual([]);
    });
});

/**
 * 🗺️ **시트와 지도가 «같은 집합»을 본다** (기사님 지시 2026-09-13:
 *    *"지도에 있는 역인 부분과 순번도 같이 숨겨줘"*).
 *
 * 🔴 처음엔 숨길 id 를 **시트를 넘기는 JSX 안에서** 만들었다. 지도까지 숨기려면 그 식이
 *    **두 곳**이 되고, 한쪽에 조건이 붙는 순간 **«목록에선 접혔는데 지도엔 남는»** 상태가
 *    된다 — 이 레포가 반복해 당한 «파생 두 벌»(경유 4벌 · 상태목록 3벌 · 시별칭)이다.
 * 🟢 그래서 `hiddenIds` 를 **한 번 만들어** 시트와 지도가 그것만 본다 (규칙 ③).
 *
 * 🔬 **소스를 읽는 검사인 이유** — 고장은 «두 곳에서 각자 계산한다»이고 그건 배선이다.
 *    순수 함수 검사로는 못 잡는다 (둘 다 같은 함수를 부르니 결과가 같다).
 */
const STAGE = readFileSync(join(__dirname, '../components/stage/StageView.tsx'), 'utf8');
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const stage = codeOnly(STAGE);

describe('🗺️ 시트와 지도가 같은 집합을 본다', () => {

    it('🔴 숨길 id 를 만드는 자리가 한 곳뿐이다', () => {
        expect((stage.match(/hiddenPastIds\(/g) || []).length).toBe(1);
    });

    it('🔴 시트와 지도가 그 한 벌을 받는다', () => {
        expect(stage).toMatch(/hiddenIds=\{hiddenIds\}/);          // 시트(덱)
        expect(stage).toMatch(/visitedTrail=\{shownTrail\}/);      // 지도 발자취
        expect(stage).toMatch(/hiddenIds\.has\(v\.orderId\)/);   // 그 집합으로 걸렀다
    });

    /** 🔴 지도가 걸러지지 않은 목록을 그대로 받으면 «지도엔 남는» 상태가 된다 */
    it('🔴 지도가 걸러지지 않은 발자취를 받지 않는다', () => {
        expect(stage).not.toMatch(/visitedTrail=\{derived\.visitedTrail\}/);
    });
});

/**
 * 🗺️ **지나간 콜을 숨기면 지도 자취도 가린다** (기사님 확정 · 사이클 = 하루).
 *    자취는 하루 종일 쌓이는데 조각에 콜 이름이 없다 — 저장 칸을 더하지 않고 **시각으로 가른다**(규칙 ③):
 *    보이는 콜 중 가장 먼저 잡은 시각보다 **앞선 점**은 숨긴 콜들의 길이다. 시각을 모르는 점은 남긴다(규칙 ④).
 */
describe('🗺️ 숨긴 콜의 자취', () => {
    const seg = [[{ lng: 1, lat: 1, atMs: 100 }, { lng: 2, lat: 2, atMs: 200 }], [{ lng: 3, lat: 3, atMs: 300 }, { lng: 4, lat: 4 }]];
    it('🔴 보이는 콜이 잡힌 시각보다 앞선 점은 숨긴다', () => {
        expect(trailOfShown(seg, 250)).toEqual([[{ lng: 3, lat: 3, atMs: 300 }, { lng: 4, lat: 4 }]]);
    });
    it('숨김이 없으면(null) 그대로다', () => {
        expect(trailOfShown(seg, null)).toBe(seg);
    });
});

