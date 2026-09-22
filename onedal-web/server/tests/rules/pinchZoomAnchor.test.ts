import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🤏 **핀치 줌은 두 손가락 중간을 붙잡는다** (기사님 실주행 지적 2026-09-03)
 *
 * 기사님: *"손가락 중간을 기준점으로 줌인이 될 거라 생각했는데..
 * 한쪽 방향으로 치우쳐서 줌인되었어."*
 *
 * ── 뿌리 ──
 * 휠·버튼은 `zoomAround` 가 기준점을 잡고 팬을 보정했는데, **핀치만**
 * `zoomRef.current += scaleDiff` 로 배율만 바꾸고 팬을 안 건드렸다.
 * 그래서 확대의 중심이 «두 손가락 중간»이 아니라 화면이 원래 잡고 있던 중심이었고,
 * 손가락이 가운데서 벗어날수록 쏠렸다.
 * 2026-09-01 에 «확대 기준점이 화면 원점»을 고쳤는데 **그 수리가 이 갈래를 안 지났다.**
 *
 * ── 그래서 무엇을 잠그나 ──
 * 계산의 옳음은 `mapProjection.test.ts` 의 `pinchStep` 검사가 본다.
 * 여기서는 **컴포넌트가 그 계산을 실제로 부르는가**를 본다 — 옳은 함수를 만들어 두고
 * 안 부르면 화면은 그대로 틀린다 (이 레포가 반복해 당한 형태).
 */
const CANVAS = join(__dirname, '../../../client-app/src/components/dashboard/PinnedRouteCanvas.tsx');
const src = () => readFileSync(CANVAS, 'utf8');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('🤏 핀치 줌 — 컴포넌트가 기준점 계산을 부른다', () => {
    it('핀치 갈래가 pinchStep 을 쓴다', () => {
        expect(codeOnly(src())).toMatch(/pinchStep\(/);
    });

    it('🔴 배율만 바꾸던 옛 식이 남아 있지 않다', () => {
        // `zoomRef.current = ... zoomRef.current + scaleDiff` — 팬을 안 건드리던 그 줄
        expect(codeOnly(src())).not.toMatch(/zoomRef\.current\s*\+\s*scaleDiff/);
    });

    it('중간점은 **캔버스 안 좌표**로 넘긴다 — 화면 좌표 그대로면 여백만큼 어긋난다', () => {
        const c = codeOnly(src());
        // 두 손가락의 평균에서 캔버스 왼쪽·위를 빼야 캔버스 안 좌표가 된다
        expect(c).toMatch(/\/ 2 - rect\.left/);
        expect(c).toMatch(/\/ 2 - rect\.top/);
        // 그렇게 만든 값을 pinchStep 에 넘긴다
        expect(c).toMatch(/pinchStep\([^)]*\bmid\b/);
    });

    it('기준점은 그리는 쪽과 같은 것을 쓴다 (anchorBaseOf · 가림 높이 포함)', () => {
        expect(codeOnly(src())).toMatch(/anchorBaseOf\([\s\S]{0,120}?occludedNow\.current/);
    });
});

/**
 * 🔭 **맞춤 모드와 손은 층이 다르다** (기사님 지적 2026-09-04)
 *
 * 기사님: *"구간, 현위치를 선택한 후 드래그하면 줌이 유지되어야 할 것 같아."*
 *
 * 모드는 **기준 배율**을 정하고(`viewCoordsFor` → `computeViewport`),
 * 팬·줌은 그 **위에 더해지는 값**이다. 처음엔 드래그에서 `setViewMode('all')` 을 불렀는데 —
 * 그러면 기준이 통째로 바뀌어 **손가락을 조금만 움직여도 화면이 전체로 튀어나갔다.**
 * 팬은 모드와 무관하게 쌓이므로 **안 풀어도 손은 이미 이긴다.**
 */
describe('🔭 지도 맞춤 — 끌어도 배율이 유지된다', () => {
    it('드래그·핀치가 모드를 되돌리지 않는다', () => {
        const c = codeOnly(src());
        // 제스처 갈래(팬 누적 · 핀치)에서 setViewMode 를 부르면 기준이 바뀌어 화면이 튄다
        expect(c).not.toMatch(/setViewMode\('all'\);\s*\n\s*panRef\.current\.x \+=/);
        expect(c).not.toMatch(/setViewMode\('all'\);\s*\n\s*const step = pinchStep/);
    });

    /**
     * 🔭 **«맞춰 달라»는 한 함수가 한다** (2026-09-05)
     *
     * 예전에는 버튼의 `onClick` 안에 `setViewMode(m); zoomRef=1; panRef={0,0}` 이
     * 늘어서 있었고, 이 검사는 **그 줄 모양**을 봤다. 그런데 그 자리에
     * **`drawMap()` 이 빠져 있었다** — 이미 그 모드면 리액트가 상태를 안 바꾸므로
     * 리렌더가 없고, 따라서 그리기도 없어서 *"현위치를 다시 눌러도 안 온다"* 가 됐다.
     *
     * 🔴 그래서 넷(모드·줌·팬·그리기)을 `pickViewMode` 하나로 묶었다.
     *    이 검사도 **줄 모양이 아니라 «그 함수를 부르는가»** 를 본다 —
     *    #96 의 교훈 그대로다: **옳은 함수를 만들어 두고 안 부르면 화면은 그대로 틀리다.**
     *    (함수가 옳은가는 `client-app/src/lib/mapProjection.test.ts` 4건이 본다)
     */
    it('«맞춰 달라»는 `pickViewMode` 한 곳을 지난다', () => {
        const c = codeOnly(src());
        // 보기 버튼 셋(전체·현구간·현위치)
        expect(c).toMatch(/onClick=\{\(\) => pickViewMode\(m, \{[^}]*draw: drawMap/);
        // 「초기화」도 같은 문을 쓴다 — 갈래가 둘이면 한쪽만 고쳐진다 (#96)
        expect(c).toMatch(/onClick=\{\(\) => pickViewMode\('all', \{[^}]*draw: drawMap/);
        // 🔴 옛 방식(손으로 늘어놓기)이 되살아나면 빨간불
        expect(c).not.toMatch(/setViewMode\(m\);\s*zoomRef\.current = 1/);
    });

    it('되돌리고 **그리는** 일은 `mapProjection.pickViewMode` 안에 있다', () => {
        const lib = codeOnly(readFileSync(join(__dirname,
            '../../../client-app/src/lib/mapProjection.ts'), 'utf8'));
        const fn = lib.match(/export function pickViewMode[\s\S]*?\n\}/)?.[0] ?? '';
        expect(fn).toMatch(/zoom\.current = 1/);
        expect(fn).toMatch(/pan\.current = \{ x: 0, y: 0 \}/);
        // 🔴 이것이 빠져 있던 것이 #97 이다 — 되돌린 **뒤에** 그린다
        expect(fn).toMatch(/pan\.current = \{ x: 0, y: 0 \};[\s\S]*?draw\(\)/);
    });
});
