import { readFileSync } from 'fs';
import { join } from 'path';

const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const read = (rel: string) => codeOnly(readFileSync(join(__dirname, '../../../client-app/src', rel), 'utf8'));

/**
 * 🟡 **후보 경로는 확정 경로와 **함께** 보인다 — 다른 레이어다** (기사님 확정)
 *
 * 기사님: *"지금 영역은 그냥 경로에 그려 두고, 새로 추가되는 경로(후보)는 새 레이어에 그리자.
 * 그러면 기존 경로와 새 경로가 한 지도 위에 보일 거고, 버리면 새 레이어만 리셋하면 되니까."*
 *
 * 왜 «가고 있는 길»과 «이 콜을 붙이면 갈 길»이 함께 보여야 하나 — 기사님이 그 둘을 견주어
 * 1~2초에 누르신다. 화면규칙이 실물 시트를 판정 중에 내리는 까닭도 «지도가 판정의 근거다
 * (후보 경로가 노란 점선으로 겹쳐 뜬다)» 였는데, 정작 그 점선이 안 떴다.
 *
 * 무엇을 막나
 * - **둘 중 하나만 그리는 것** — `drawHolder = 확정 ?? 후보` 는 콜을 쥐고 있으면 후보를 영영 안 그린다
 * - **후보가 영역을 흔드는 것** — 상차·하차 영역은 **확정 콜만** 본다. 후보를 세면 목적지 상태가
 *   `routed` 가 되고 종착지가 후보 하차지로 바뀌어, 잡지도 않은 콜 때문에 앱 목록이 통째로 움직인다
 * - 후보를 **실선으로 그리는 것** — 노란 점선이 «아직 내 콜이 아니다»의 뜻이다
 */
describe('🟡 후보 경로는 별도 레이어다', () => {
    const stage = read('components/stage/StageView.tsx');
    const canvas = read('components/dashboard/PinnedRouteCanvas.tsx');
    const derive = read('hooks/useRouteDerivations.ts');

    /**
     * 🔴 콜이 0건이면 후보가 **실선 자리**를 대신한다 (`drawHolder = 확정 ?? 후보`) — 그건 맞다.
     *    막을 것은 «확정이 있으면 후보를 안 그리는 것»이다. 그래서 별도 레이어가 따로 있고,
     *    **같은 콜일 때만** 비어야 한다 (두 번 그리지 않게).
     */
    it('🔴 확정이 있어도 후보를 그린다 — 같은 콜일 때만 레이어가 빈다', () => {
        expect(derive).toMatch(/candidateHolder/);
        expect(derive).toMatch(/previewHolder\.id !== drawHolder\?\.id/);
    });

    it('🔴 무대 지도가 후보 경로를 따로 넘긴다', () => {
        expect(stage).toMatch(/candidateHolder=\{/);
    });

    it('🔴 캔버스가 후보 경로를 받는다', () => {
        expect(canvas).toMatch(/candidateHolder\?:/);
    });

    it('🔴 영역 재료는 확정 콜만 본다 — 후보를 세면 앱 목록이 흔들린다', () => {
        expect(stage).toMatch(/liveRoute\.filter\(o => !isEvaluating\(o\.status\)\)/);
    });

    it('🔴 후보는 노란 점선이다 — 실선으로 그리지 않는다', () => {
        expect(canvas).toMatch(/setLineDash|\[10, 8\]/);
        expect(canvas).toMatch(/#e6b422/);
    });
});
