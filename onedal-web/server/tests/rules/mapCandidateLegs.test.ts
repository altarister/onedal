import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🗺️ **심사 중 — 이 후보가 늘린 구간을 판정 색으로 강조한다** (목업 `MapMockup.tsx` 의 «이 콜을 끼면 이렇게 간다»).
 *
 * 결재 전 경로를 **통째로 노란 점선 한 줄**로 그리면(`isPreviewRoute` 면 구간을 안 나눔)
 * 기사님이 1~2초에 «어디가 늘었나»를 못 본다 — 기존 길과 새로 붙는 길이 같은 모양이다.
 *   · 구간 주인(`sectionStops`)이 후보 콜이면 **판정 색 · 굵게**
 *   · 나머지는 노란 점선 그대로 — «아직 내 콜이 아니다»는 지킨다
 *   · 재료가 어긋나면 한 줄 노란 점선으로 물러난다 (규칙 ④)
 * ⚠️ 목업의 **깜빡임은 안 옮겼다** — 캔버스를 0.26초마다 다시 칠해야 하고, 그러면 지도 프레임이 늦어진다.
 */
const client = (rel: string) => readFileSync(join(__dirname, '../../../client-app/src', rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('🗺️ 심사 중 후보 구간 강조', () => {
    it('🔴 미리보기도 구간을 나눠 그리고, 후보 콜 구간은 판정 색으로 칠한다', () => {
        const cv = client('components/dashboard/PinnedRouteCanvas.tsx');
        expect(cv).not.toMatch(/isPreviewRoute \? \[\] : sectionLinesOf/);
        expect(cv).toMatch(/candidateColor/);
        expect(cv).toMatch(/secStops!?\[i\]\.orderId === routeHolder!?\.id/);
    });
});
