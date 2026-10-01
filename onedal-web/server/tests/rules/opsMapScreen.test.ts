import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🗺️ **운영센터 지도 화면 — 서버 위치 문 하나 · 키 없는 배경 타일 · 뱃지는 서버가 센 것 그대로** (reviews/33 3단계 · 46 서버 f71abda0 · onedal-69 «가»).
 *    🔴 관제웹 지도 부품(PinnedRouteCanvas)은 그대로다 — 좌표 일반식 셋만 shared `mapTile` 로 옮겨 같이 쓴다(식이 두 벌이면 한쪽만 고쳐진다).
 *    🔴 카카오 지도 SDK · 키를 들이지 않는다(도메인 등록 · 관제앱 출처 처리가 붙는다) — OpenStreetMap 타일 + «© OpenStreetMap» 표기.
 */
const WEB = join(__dirname, '../../..');
const read = (f: string) => readFileSync(join(WEB, f), 'utf8');

describe('🗺️ 운영센터 지도 화면', () => {
    it('🔴 지도 쪽은 서버 위치 문 하나를 읽는다 — 뱃지는 서버 regions 그대로(화면이 다시 세지 않는다) · 예시 좌표 없음', () => {
        const page = read('ops/src/pages/MapPage.tsx');
        expect(page).toContain('api.locations()');
        expect(page).toContain('loc?.regions.map(');
        expect(page).not.toMatch(/api\/example|SPOTS|STOPS|\d{2}\.\d{3,}/);   // 박아 둔 좌표가 없다
        expect(read('ops/src/api/ops.ts')).toContain("get<OpsLocations>('/locations')");
    });

    it('🔴 배경은 키 없는 OpenStreetMap 타일 + 표기 · 카카오 지도 키 · SDK 를 읽지 않는다', () => {
        const canvas = read('ops/src/pages/OpsMapCanvas.tsx');
        expect(canvas).toContain('https://tile.openstreetmap.org/');
        expect(canvas).toContain("'© OpenStreetMap'");
        expect(canvas).not.toMatch(/VITE_KAKAO|kakao\.maps|dapi\.kakao/);
        expect(canvas).toMatch(/fitViewOf\(dots, size\.w, size\.h\)/);
    });

    it('🔴 좌표 일반식 셋은 shared 한 벌 — 관제웹 mapProjection 은 다시 내보내기만 · 관제웹 지도 부품은 그 파일에서 그대로 가져간다', () => {
        const proj = read('client-app/src/lib/mapProjection.ts');
        expect(proj).toContain("import { TILE_SIZE, TILE_MAX_ZOOM, projectMercator } from '@onedal/shared';");
        expect(proj).toContain('export { TILE_SIZE, TILE_MAX_ZOOM, projectMercator };');
        expect(proj).not.toMatch(/export function projectMercator|export const TILE_SIZE = /);
        const panel = read('client-app/src/components/dashboard/PinnedRouteCanvas.tsx');
        expect(panel).toContain("} from '../../lib/mapProjection';");
        expect(panel).toContain('https://tile.openstreetmap.org/');
    });
});
