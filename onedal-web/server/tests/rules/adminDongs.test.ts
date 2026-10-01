// @ts-nocheck
import db from '../../src/db';
import { withAdminDongs, ADMIN_SAME_NAME_DONGS, anyRegionHit } from '@onedal/shared';
import { updateActiveFilter } from '../../src/state/filterManager';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { initGeoService } from '../../src/services/geoService';

/**
 * 🗺️ **목적지 낱말에 행정동을 함께 싣는다** (기사님 «가» 1 · onedal-69 · f5 와 한 벌).
 *    픽커 화면은 행정동 이름(위례동 · 광남1동 · 역삼1동 · 처인구 중앙동)을 쓰고 명부는 법정동뿐이라, 목적지 안 콜이 «경유 이탈»로 떨어졌다.
 *    표는 행정안전부 KIKmix(shared/src/adminDongs.ts) · 판단은 서버 목록 한 벌 — 원달앱 RegionMatch · 서버 anyRegionHit 이 같은 목록을 본다.
 *    🔴 노이즈: 행정동은 그 관할 법정동이 목록에 하나라도 있을 때만 더한다 · 법정동이 빠지면 행정동도 걷힌다 · 같은 이름이 여러 시구에 있으면 시구로 가른다.
 */
const U = 'test-admin-dongs';
beforeAll(() => { initGeoService(); db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, `${U}@test`, U); });
afterAll(() => { db.prepare(`DELETE FROM user_settings WHERE user_id = ?`).run(U); db.prepare(`DELETE FROM users WHERE id = ?`).run(U); clearUserSession(U); });

describe('🗺️ 행정동 펴기 — 순수 함수', () => {
    it('🔴 관할 법정동이 묶음에 있으면 그 시구에 행정동을 더한다 · 없으면 안 더한다(노이즈)', () => {
        expect(withAdminDongs({ '성남시 수정구': ['복정동', '수진동'] })['성남시 수정구']).toContain('위례동');
        expect(withAdminDongs({ '성남시 수정구': ['수진동'] })['성남시 수정구']).not.toContain('위례동');
        expect(withAdminDongs({ '용인시 처인구': ['김량장동'] })['용인시 처인구']).toContain('중앙동');
    });
    it('🔴 되풀이해도 같다 · 법정동이 빠지면 더했던 행정동도 걷힌다 · 법정동 이름은 안 걷는다', () => {
        const once = withAdminDongs({ '성남시 수정구': ['복정동', '수진동'] });
        expect(withAdminDongs(once)).toEqual(once);
        const trimmed = { '성남시 수정구': once['성남시 수정구'].filter((d: string) => d !== '복정동') };
        expect(withAdminDongs(trimmed)['성남시 수정구']).not.toContain('위례동');
        expect(withAdminDongs({ '성남시 중원구': ['중앙동'] })['성남시 중원구']).toEqual(['중앙동']);   // 중원구의 중앙동은 법정동
    });
    it('🔴 같은 행정동 이름이 여러 시구에 있으면 겹침 이름이다(시구로 가른다)', () => {
        expect(ADMIN_SAME_NAME_DONGS.has('위례동')).toBe(true);    // 수정구 · 송파구
        expect(ADMIN_SAME_NAME_DONGS.has('중앙동')).toBe(true);    // 처인구 행정 · 중원구 법정 …
    });
});

describe('🗺️ 서버 목적지 낱말 — 판정과 원달앱이 같은 목록', () => {
    it('🔴 목적지가 수정구면 «경기 성남시 수정구 위례동»은 통과 · 송파구 위례동은 안 맞는다', () => {
        const s = getUserSession(U);
        s.activeFilter = { ...s.activeFilter, destinationKeywords: ['복정동', '수진동', '창곡동'], destinationGroups: { '성남시 수정구': ['복정동', '수진동', '창곡동'] } };
        const f = updateActiveFilter(U, {});
        expect(f.destinationKeywords).toContain('위례동');
        expect(f.destinationGroups['성남시 수정구']).toContain('위례동');
        expect(f.destinationDongSigungu['위례동']).toEqual(expect.arrayContaining(['성남시 수정구']));
        expect(anyRegionHit('경기 성남시 수정구 위례동 위례광장로 #', f.destinationKeywords, f.keywordTraps, f.destinationDongSigungu)).toBe(true);
        expect(anyRegionHit('서울 송파구 위례동 #', f.destinationKeywords, f.keywordTraps, f.destinationDongSigungu)).toBe(false);
    });
});
