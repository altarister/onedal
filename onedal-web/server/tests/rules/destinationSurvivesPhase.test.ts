import { readFileSync } from 'fs';
import { join } from 'path';
import { getUserSession } from '../../src/state/userSessionStore';
import { buildAppProgressKm } from '../../src/state/filterManager';
import { initGeoService } from '../../src/services/geoService';
import { unionRegions } from '../../src/services/geoService';

beforeAll(() => { initGeoService(); });

/**
 * 🎯 **도착 목표는 국면이 바뀌어도 살아 있다** (기사님 확정 2026-08-25)
 *
 * 기사님: *"내가 노선을 선택했을때 여주시로 갈꺼고 여주시를 포함한 반경 5km 에 있는것
 * 까지 콜로 잡아줘 이렇게 이야기 한것 같은데.. 그것이 아니였어?"*
 * + *"가남→세종대왕면 , 가남→점동면 둘다 콜이 올라와야 한다고 난 보는데."*
 *
 * ── 실측 (2026-08-25 10:20:35 · 10:20:45, 상차·차종·요금이 똑같은 대비쌍) ──
 *     ⑧ 가남 → 세종대왕면  도착지(14중 세종대왕면)=✅  → 잡힘
 *     ⑨ 가남 → 점동면      도착지(14중 점동면)=❌     → **못 잡음**
 *   둘 다 여주시인데 갈렸다. 앱은 «시 별칭 **과** 동 목록» 을 둘 다 보는데,
 *   합짐·주행중의 동 목록이 **경로 경유으로 통째로 덮어써져** 여주 전역이 사라진다.
 *
 * 🔴 **뿌리**: 콜을 하나 잡는 순간 `syncDetourFilter` 가 경유 지명을
 *    `destinationKeywords` 에 밀어 넣고, `recalculateDerivedFields` 의
 *    도시 기반 재계산은 `else if` 라 **다시는 돌지 않는다.**
 *
 *        첫짐    destinationKeywords = 여주 32개   ← 도착목표에서 파생
 *          ↓ KEEP
 *        합짐    destinationKeywords = 경유 104개  ← 덮어쓴다
 *
 *    화면에는 «여주시」가 그대로 남아 있는데 판정에서만 사라진다 (규칙 ⑤-4 ④ — 화면이
 *    조용히 거짓말한다).
 *
 * ── 고침의 모양 ──
 *   `destinationKeywords` = **경유 ∪ 도착목표(첫짐에서 상속)**
 *   도착목표는 저장하지 않는다 — 노선의 목적지는 도중에 안 바뀌므로 첫짐에서 파생한다 (규칙 ③).
 *
 * 🔴 **그런데 상차지 축이 뚫리면 안 된다.** `buildAppProgressKm` 은 `destinationKeywords`
 *    를 그대로 훑으며 경유에 없는 동까지 `null` 로 내보낸다. 그러면 앱의
 *    `RouteOrderFilter` 가 «상차지 순서 미상 — 통과» 로 흘려보내, **점동면에서 싣는
 *    콜이 통과한다** — 2026-08-18 파주 사고(78km 뒤로 돌아가 싣기)와 같은 형태다.
 *
 *    도착목표는 **하차지만** 연다. 상차지는 끝까지 경로 위여야 한다.
 */

const USER = 'test-dest-survives';

/** 합짐 국면 세션 — 경유은 경로 위 4개, 도착목표는 여주시 */
function session(over: { keywords?: string[] } = {}) {
    const s = getUserSession(USER);
    s.phaseSettings.first.destinationCity = '여주시';
    s.phaseSettings.first.dropoffRadiusKm = 5;
    s.activeFilter.destinationCity = '여주시';
    s.activeFilter.dispatchPhase = 'GATHERING';
    s.activeFilter.destinationKeywords = over.keywords ?? ['초월읍', '부발읍', '가남읍'];
    // 경유 — 여기 있는 동만 «경로 위»다. 스냅에 실패한 동(산북면)도 경로 위이므로 목록엔 있다
    s.detourFlat = ['초월읍', '부발읍', '가남읍', '산북면'];
    s.detourProgressKm = { 초월읍: 16.5, 부발읍: 40.2, 가남읍: 48.5 };   // 산북면은 스냅 실패
    s.myOrders = [{
        id: 'A', status: 'ORDER_CONFIRMED', capturedAt: new Date().toISOString(),
        routePolyline: [{ x: 127.1, y: 37.4 }, { x: 127.5, y: 37.2 }],
    } as any];
    return s;
}

describe('도착 목표가 국면을 넘어 살아남는다', () => {
    it('🔴 경유에 도착목표를 합치면 여주 전역이 들어온다 (점동면 포함)', () => {
        const 경유 = {
            flat: ['초월읍', '부발읍', '가남읍'],
            grouped: { '광주시': ['초월읍'], '이천시': ['부발읍'], '여주시': ['가남읍'] },
            customCityFilters: ['광주시', '광주', '이천시', '이천', '여주시', '여주'],
        };
        const merged = unionRegions(경유, '여주시', 5);

        expect(merged.flat).toContain('점동면');       // 도착목표로 들어온다
        expect(merged.flat).toContain('초월읍');       // 경유 것도 그대로 남는다
        expect(merged.grouped['여주시']).toContain('점동면');
        expect(merged.customCityFilters).toContain('여주시');
        // 경유에만 있던 시(광주)의 별칭이 사라지면 앱의 2단계 필터가 그 시를 통째로 막는다
        expect(merged.customCityFilters).toContain('광주시');
    });

    it('도착목표가 없으면 경유 그대로다 (첫짐 도시를 안 정했을 때)', () => {
        const 경유 = { flat: ['초월읍'], grouped: { '광주시': ['초월읍'] }, customCityFilters: ['광주시'] };
        expect(unionRegions(경유, '', 5)).toEqual(경유);
    });

    /**
     * 🔴 **조립은 한 곳뿐이다** («경유 4벌» 클래스 · 실측 2026-08-25 12:35:50).
     *
     * `syncDetourFilter` 와 `refreshDetourIfNeeded` 가 **각각** 경유 목록을 조립하고 있었다.
     * 도착 목표를 앞쪽에만 넣었더니, 출발하는 순간 뒤쪽이 돌면서 **131개 → 27개** 로
     * 되돌렸다. 한쪽만 고치면 다른 쪽이 조용히 덮는다 (규칙 ③).
     */
    it('🔴 도착목표 상속은 recalculateDetourFilter 한 곳에서만 한다', () => {
        const strip = (p: string) => readFileSync(join(__dirname, p), 'utf8')
            .split('\n').filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');

        const fm = strip('../../src/state/filterManager.ts');
        const fn = fm.slice(fm.indexOf('export const recalculateDetourFilter'));
        expect(fn).toMatch(/unionRegions\(/);
        expect(fn).toMatch(/phaseSettings\.first/);
        expect(fn).toMatch(/first\.destinationCity/);

        // 다른 곳이 직접 조립하면 또 갈라진다 — 경유 목록의 원천은 위 한 곳이다
        const de = strip('../../src/services/dispatchEngine.ts');
        const sync = de.slice(de.indexOf('export const syncDetourFilter'));
        expect(sync).not.toMatch(/getDetourRegions\(/);
        expect(sync).toMatch(/recalculateDetourFilter\(/);
    });

    it('🔴 도착목표를 넣어도 상차지 축은 안 뚫린다 — progressKm 은 경로 위만', () => {
        // 경유 4개 + 도착목표에서 온 점동면·세종대왕면
        const s = session({ keywords: ['초월읍', '부발읍', '가남읍', '산북면', '점동면', '세종대왕면'] });
        const progress = buildAppProgressKm(s);

        // 경로 위 동은 진행도와 함께 내려간다
        expect(progress['초월읍']).toBe(16.5);
        expect(progress['가남읍']).toBe(48.5);

        // 🔴 경로 위인데 스냅에 실패한 동은 **null 로 나간다** — «모르는 것»과 «경로 밖»은 다르다.
        //    이걸 빼면 앱이 «경로 밖 — 차단» 으로 읽어 멀쩡한 상차지가 막힌다.
        expect(progress).toHaveProperty('산북면');
        expect(progress['산북면']).toBeNull();

        // 🔴 도착목표로만 들어온 동은 **키 자체가 없어야** 한다.
        //    있으면 앱이 «순서 미상 — 통과» 로 읽어 그 동에서 싣는 콜을 허용한다.
        expect(progress).not.toHaveProperty('점동면');
        expect(progress).not.toHaveProperty('세종대왕면');
    });
});
