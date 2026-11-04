import { describe, it, expect } from 'vitest';
import { SINGLE_POINT_ZOOM, TILE_SIZE, fitViewOf, projectMercator, screenOf, tilesIn } from './mapTile';

/** 🌍 지도 타일 일반식 — 운영센터 지도가 점들을 한 화면에 담고, 그 화면을 타일로 빈틈없이 덮는다 */
describe('mapTile', () => {
    const gwangju = { lat: 37.41, lng: 127.25 }, icheon = { lat: 37.27, lng: 127.44 };

    it('웹 메르카토르 — 경도 0 · 위도 0 이 한가운데(0.5, 0.5) · 북쪽이 위(ny 가 작다)', () => {
        expect(projectMercator(0, 0)).toEqual({ nx: 0.5, ny: 0.5 });
        expect(projectMercator(127, 38).ny).toBeLessThan(projectMercator(127, 37).ny);
    });
    it('점이 없으면 보기도 없다(지어낸 자리로 펴지 않는다) · 하나면 동네 줌', () => {
        expect(fitViewOf([], 800, 600)).toBeNull();
        expect(fitViewOf([gwangju], 800, 600)?.zoom).toBe(SINGLE_POINT_ZOOM);
    });
    it('🔴 여러 점은 다 화면 안에 들어온다 — 한 단계 더 키우면 하나는 밖으로 나간다(가장 크게 맞춘 줌)', () => {
        const W = 800, H = 600, v = fitViewOf([gwangju, icheon], W, H)!;
        for (const p of [gwangju, icheon]) {
            const s = screenOf(p, v, W, H);
            expect(s.x).toBeGreaterThanOrEqual(0); expect(s.x).toBeLessThanOrEqual(W);
            expect(s.y).toBeGreaterThanOrEqual(0); expect(s.y).toBeLessThanOrEqual(H);
        }
        const closer = { ...v, zoom: v.zoom + 2 };
        const out = [gwangju, icheon].some(p => { const s = screenOf(p, closer, W, H); return s.x < 0 || s.x > W || s.y < 0 || s.y > H; });
        expect(out).toBe(true);
    });
    it('🔴 타일 목록이 화면을 빈틈없이 덮는다 — 네 모서리가 어느 타일 안에든 있다 · 타일 번호는 그 줌의 범위 안', () => {
        const W = 800, H = 600, v = fitViewOf([gwangju, icheon], W, H)!;
        const tiles = tilesIn(v, W, H);
        const covers = (x: number, y: number) => tiles.some(t => x >= t.left && x < t.left + t.size && y >= t.top && y < t.top + t.size);
        for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1], [W / 2, H / 2]]) expect(covers(x, y)).toBe(true);
        const n = Math.pow(2, v.zoom);
        for (const t of tiles) { expect(t.size).toBe(TILE_SIZE); expect(t.tx).toBeGreaterThanOrEqual(0); expect(t.tx).toBeLessThan(n); expect(t.ty).toBeGreaterThanOrEqual(0); expect(t.ty).toBeLessThan(n); }
    });
});
