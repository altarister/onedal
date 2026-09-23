import { readFileSync } from 'fs';
import { join } from 'path';
import { getUserSession } from '../../src/state/userSessionStore';
import { originOf, MOCK_GPS_OWNER_QUIET_MS } from '../../src/services/geoService';

/**
 * 📍 **서버가 다시 떠도 «내가 어디 있나»는 한 답이다** (기사님 실측 2026-09-23)
 *
 * ── 실측 ──
 * 부팅 직후 로그가 19밀리초 사이에 두 답을 냈다:
 * ```
 * 22:55:14.302  📍 [위치 복구] 마지막 점 — 127.38383, 37.29290 (출처 mock)   ← 이천
 * 22:55:14.341  📋 [상차 목록] 내 위치 4.6km(집 주소로 대신) → 10곳          ← 집(초월) 기준
 * 22:55:14.357  ✅ [Bootstrap 완료] 키워드=26개 — 관제탑에 확정 필터 1회 전송
 * 22:55:14.360  📋 [상차 목록] 내 위치 4.6km → 9곳                          ← 이천 기준
 * ```
 * 관제웹은 둘을 겹쳐 받아 **영역은 집 둘레, 점은 이천**이 되었다.
 * 기사님: *"녹색원이 저리 작은데 이천시 근처에 보라 점이 찍힌다는것이 틀린거지.
 * 서버랑 관제앱이랑 뭔가 싱크가 틀어진거면 그것 부터 맞춰야 하는거아냐?"*
 *
 * ── 까닭 ──
 * `originOf` ③ 은 모의 좌표를 «콜을 쥐었거나 모의 주행이 돌 때만» 믿는다. 그 «돌고 있나»는
 * 메모리에만 사는 `mockGpsOwner` 라, 서버가 다시 뜨면 **좌표는 복구되는데 그 칸만 빈다.**
 * 그래서 같은 좌표를 놓고 첫 답은 «집 주소로 대신», 다음 답은 «이천»이 된다.
 *
 * 🔴 **고친 것**: 좌표를 복구할 때 임자도 **그 점을 받은 시각으로** 함께 되살린다.
 *    시각을 지어내지 않으므로, 묵은 점이면 여전히 집 주소로 간다 (원래 방어 그대로).
 */
const USER = 'test-boot-origin';
const 이천 = { x: 127.383826605868, y: 37.2929022381899 };

function session(over: { fixAt: number; ownerAt: number | null }) {
    const s = getUserSession(USER);
    s.lastFix = { ...이천 };
    s.lastFixAt = over.fixAt;
    s.lastFixIsMock = true;
    s.lastFixSource = 'mock';
    s.activeFilter.dispatchPhase = 'STANDBY';   // 빈 차 — ③ 이 걸리는 자리
    s.mockGpsOwner = over.ownerAt === null ? null : { socketId: '복구', at: over.ownerAt, warned: false };
    return s;
}

describe('📍 부팅 직후에도 기점은 한 답이다', () => {
    const now = Date.parse('2026-09-23T13:55:14.360Z');
    const 방금 = now - 2_000;   // 2초 전에 받은 점

    it('🔴 임자가 비면 같은 좌표인데도 집 주소로 간다 — 이것이 그날의 두 답이었다', () => {
        const s = session({ fixAt: 방금, ownerAt: null });
        /* 집 주소가 없는 검사 세션이라 «모른다»(null)로 답한다 — 이천을 안 쓰는 것이 요점 */
        expect(originOf(s, now)).toBeNull();
    });

    it('🔴 임자를 그 점의 시각으로 되살리면 좌표를 그대로 쓴다 — 답이 하나다', () => {
        const s = session({ fixAt: 방금, ownerAt: 방금 });
        expect(originOf(s, now)).toMatchObject({ ...이천, source: 'mock', isFallback: false });
    });

    it('🔴 묵은 점이면 되살려도 안 쓴다 — «멈춘 뒤 남은 모의 좌표» 방어는 그대로다', () => {
        const 오래 = now - (MOCK_GPS_OWNER_QUIET_MS + 60_000);
        const s = session({ fixAt: 오래, ownerAt: 오래 });
        expect(originOf(s, now)).toBeNull();
    });

    it('🔴 복구하는 곳이 임자도 함께 세운다 — 시각은 그 점의 것을 쓴다 (지어내지 않는다)', () => {
        const en = readFileSync(join(__dirname, '../../src/services/dispatchEngine.ts'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        const i = en.indexOf('session.lastFixSource = (lastPt.source');
        expect(i).toBeGreaterThan(-1);
        const body = en.slice(i, i + 400);
        expect(body).toMatch(/lastPt\.source === 'mock'/);
        expect(body).toMatch(/mockGpsOwner = \{[^}]*at: lastPt\.atMs/);
    });
});
