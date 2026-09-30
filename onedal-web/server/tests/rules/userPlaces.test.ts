// @ts-nocheck
import db, { seedUserPlaces } from '../../src/db';
import { PlaceRepository } from '../../src/repositories/PlaceRepository';
import { getPlaceInsights } from '../../src/services/statService';
import placesRouter from '../../src/routes/logbook/places';

/**
 * 🏪 **거래처는 공용 한 줄 · 개인 칸은 기사별** (reviews/29 1단계 C · 기준 1 · onedal-1f «가»).
 * places 는 UNIQUE(addressDetail, customerName) 라 기사 둘의 같은 거래처가 한 줄로 합쳐져 메모·별점·방문 수가 섞였다.
 * 표를 다시 만들지 않고 개인 칸(별점 · 블랙리스트 메모 · 방문 수 · 연락처)을 user_places 로 옮긴다.
 */
const A = 'test-up-a', B = 'test-up-b';
const ADDR = '테스트시 테스트동 1-1 (userPlaces)';

afterAll(() => {
    const ids = (db.prepare(`SELECT id FROM places WHERE addressDetail LIKE '%(userPlaces)%'`).all() as any[]).map(r => r.id);
    for (const id of ids) {
        db.prepare(`DELETE FROM user_places WHERE place_id = ?`).run(id);
        db.prepare(`DELETE FROM places WHERE id = ?`).run(id);
    }
});

describe('🏪 거래처 기사별', () => {
    it('🔴 같은 거래처를 두 기사가 잡으면 places 한 줄 · user_places 두 줄 · 방문 수는 각자', () => {
        const p1 = PlaceRepository.upsertPlace(A, ADDR, '테스트상회', '테스트동', 127, 37, '02-000-0000');
        const p2 = PlaceRepository.upsertPlace(B, ADDR, '테스트상회', '테스트동', 127, 37, null);
        PlaceRepository.upsertPlace(A, ADDR, '테스트상회', '테스트동', null, null, null);
        expect(p1).toBe(p2);
        const rows = db.prepare(`SELECT user_id, visitCount FROM user_places WHERE place_id = ? ORDER BY user_id`).all(p1) as any[];
        expect(rows).toEqual([{ user_id: A, visitCount: 2 }, { user_id: B, visitCount: 1 }]);
    });

    it('🔴 블랙리스트 메모는 적은 기사에게만', () => {
        const pid = PlaceRepository.upsertPlace(A, ADDR, '테스트상회', '테스트동', null, null, null);
        PlaceRepository.appendPlaceMemo(A, pid, '대기 40분');
        const memo = (u: string) => (db.prepare(`SELECT blacklistMemo FROM user_places WHERE user_id = ? AND place_id = ?`).get(u, pid) as any)?.blacklistMemo ?? null;
        expect(memo(A)).toBe('대기 40분');
        expect(memo(B)).toBeNull();
    });

    it('🔴 자주 가는 곳 · 블랙리스트 통계는 자기 것만', () => {
        const pid = PlaceRepository.upsertPlace(A, ADDR, '테스트상회', '테스트동', null, null, null);
        db.prepare(`UPDATE user_places SET rating = 1.0 WHERE user_id = ? AND place_id = ?`).run(A, pid);
        expect(getPlaceInsights(A, 50).blacklisted.some(p => p.id === pid)).toBe(true);
        expect(getPlaceInsights(B, 50).blacklisted.some(p => p.id === pid)).toBe(false);
        expect(getPlaceInsights(B, 50).hotspots.find(p => p.id === pid)?.visitCount).toBe(1);
    });

    it('🔴 /api/logbook/places/hotspots 는 로그인한 기사 것만', async () => {
        const layer = placesRouter.stack.find((l: any) => l.route?.path === '/hotspots');
        const h = layer.route.stack[layer.route.stack.length - 1].handle;
        let out: any = null;
        await h({ query: { limit: '50' }, user: { id: B } }, { json: (b: any) => { out = b; }, status: () => ({ json: () => {} }) });
        expect(out.blacklisted.some((p: any) => p.addressDetail === ADDR)).toBe(false);
    });

    it('🔴 옛 줄 옮기기 — places 의 개인 칸을 주인 앞으로 한 번 · 두 번 불러도 같다', () => {
        const r = db.prepare(`INSERT INTO places (addressDetail, customerName, region, rating, blacklistMemo, visitCount) VALUES (?, '옛상회', '테스트동', 1.5, '옛 메모', 7) RETURNING id`)
            .get('옛주소 (userPlaces)') as any;
        seedUserPlaces('test-up-owner');
        seedUserPlaces('test-up-owner');
        const rows = db.prepare(`SELECT user_id, rating, blacklistMemo, visitCount FROM user_places WHERE place_id = ?`).all(r.id) as any[];
        expect(rows).toEqual([{ user_id: 'test-up-owner', rating: 1.5, blacklistMemo: '옛 메모', visitCount: 7 }]);
    });
});
