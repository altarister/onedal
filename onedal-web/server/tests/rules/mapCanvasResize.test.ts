import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🗺️ **지도 칸 크기가 바뀌면 다시 그린다** (기사님 «좋아» · 관제웹 지도 찌그러짐).
 *
 * 필터가 펼쳐지면 지도 칸이 줄어드는데, 지도는 내용이 바뀔 때만 다시 그려 옛 그림이 눌린 채 남았다.
 * 칸 크기를 지켜보는 ResizeObserver 하나 → 한 프레임에 한 번만 다시 그린다(`scheduleDraw`).
 * 🔴 크기가 실제로 바뀐 때만 · 한 프레임에 최대 한 번 · 시트 가림 애니메이션과 **같은 길** · 언마운트 때 끊는다.
 */
const canvas = readFileSync(join(__dirname, '../../../client-app/src/components/dashboard/PinnedRouteCanvas.tsx'), 'utf8');

describe('🗺️ 지도 칸 크기 지켜보기', () => {
    it('🔴 캔버스를 ResizeObserver 로 지켜보고, 크기가 같으면 안 그린다', () => {
        expect(canvas).toContain('new ResizeObserver(');
        expect(canvas).toMatch(/if \(width === lastSize\.current\.w && height === lastSize\.current\.h\) return;/);
    });

    it('🔴 다시 그리기는 scheduleDraw 하나 — 한 프레임에 최대 한 번(이미 걸려 있으면 안 건다)', () => {
        expect(canvas).toMatch(/const scheduleDraw = useCallback\(\(\) => \{\s*if \(rafRef\.current != null\) return;/);
        expect(canvas.match(/requestAnimationFrame\(/g)?.length).toBe(1);   // 시트 애니메이션도 scheduleDraw 를 지난다
    });

    it('언마운트 때 observer 를 끊고 걸린 프레임을 취소한다', () => {
        expect(canvas).toContain('ro.disconnect();');
        expect(canvas).toContain('cancelAnimationFrame(rafRef.current)');
    });
});
