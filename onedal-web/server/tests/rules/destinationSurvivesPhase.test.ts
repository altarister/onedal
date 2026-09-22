import { readFileSync } from 'fs';
import { join } from 'path';
import { getUserSession } from '../../src/state/userSessionStore';
import { buildAppOrderKm } from '../../src/state/filterManager';
import { initGeoService } from '../../src/services/geoService';
import { unionRegions } from '../../src/services/geoService';

beforeAll(() => { initGeoService(); });

/**
 * 🎯 **도착 목표는 국면이 바뀌어도 살아 있다** (기사님 확정)
 *
 * 기사님: *"내가 노선을 선택했을때 여주시로 갈꺼고 여주시를 포함한 반경 5km 에 있는것
 * 까지 콜로 잡아줘 이렇게 이야기 한것 같은데.. 그것이 아니였어?"*
 * + *"가남→세종대왕면 , 가남→점동면 둘다 콜이 올라와야 한다고 난 보는데."*
 *
 * ── 까닭 (상차·차종·요금이 똑같은 대비쌍) ──
 *     ⑧ 가남 → 세종대왕면  도착지(경유 안)  → 잡힌다
 *     ⑨ 가남 → 점동면      도착지(경유 밖)  → 도착목표를 안 합치면 **못 잡는다**
 *   둘 다 여주시다. 앱은 «시 별칭 **과** 동 목록» 을 둘 다 보는데, 콜을 하나 잡으면
 *   합짐·주행중의 동 목록이 **경로 경유로 통째로 덮여** 여주 전역이 사라진다.
 *
 *        첫짐    destinationKeywords = 여주 32개   ← 도착목표에서 파생
 *          ↓ KEEP
 *        합짐    destinationKeywords = 경유 104개  ← 도착목표를 안 합치면 이렇게 덮인다
 *
 *    화면에는 «여주시»가 그대로 남아 있는데 판정에서만 사라진다 (규칙 ⑤-4 ④ — 화면이
 *    조용히 거짓말한다).
 *
 * ── 규칙 ──
 *   `destinationKeywords` = **경유 ∪ 도착목표**
 *   도착목표는 따로 저장하지 않고 `goalCityOf` 한 곳에서 파생한다 (규칙 ③).
 *
 * 🔴 **상차지 축** — `buildAppOrderKm` 은 `destinationKeywords` 를 훑으며 경로 위 동은 진행도를,
 *    경로 밖 동(도착목표에서 들어온 동 포함)은 `null`(순서 미상 → 통과)로 내보낸다.
 *    필터는 방향을 안 본다(기사님 결정) — 키를 빼서 «경로 밖 — 차단»으로 만들면 목적지 영역 안의
 *    좋은 콜까지 막힌다. 뒤로 가는 상차는 필터 영역이 뺀다.
 */

const USER = 'test-dest-survives';

/** 합짐 국면 세션 — 경유은 경로 위 4개, 도착목표는 여주시 */
function session(over: { keywords?: string[] } = {}) {
    const s = getUserSession(USER);
    /* 값이 한 벌이라 평면(activeFilter)에 바로 둔다 */
    s.activeFilter.destinationCity = '여주시';
    s.activeFilter.destinationRadiusKm = 5;
    s.activeFilter.dispatchPhase = 'GATHERING';
    s.activeFilter.destinationKeywords = over.keywords ?? ['초월읍', '부발읍', '가남읍'];
    // 경유 — 여기 있는 동만 «경로 위»다. 스냅에 실패한 동(산북면)도 경로 위이므로 목록엔 있다
    s.detourFlat = ['초월읍', '부발읍', '가남읍', '산북면'];
    // 앱에 내려가는 순서의 원천은 순서 전용 detourOrderKm 이다 (#78 — 트림용과 갈라짐)
    s.detourOrderKm = { 초월읍: 16.5, 부발읍: 40.2, 가남읍: 48.5 };   // 산북면은 스냅 실패
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
     * 🔴 **도착 목표는 «지금 쓰는 값»에서 읽는다 — 국면 설정을 직접 뒤지지 않는다** (기사님 실측).
     *
     * 국면 설정(`phaseSettings.first`)을 직접 읽으면, 화면과 서버는 **복귀행 · 목적 광주시** 라고
     * 말하는데 판정은 **파주**를 본다. 그러면 광주로 내리는 콜(곤지암읍·경안동)이 전부 «도착지 밖»으로 떨어진다.
     *
     *     화면·서버 타겟         복귀행 · 광주시
     *     앱이 받은 필터         destinationCity=광주시
     *     국면 설정을 직접 읽으면 phaseSettings.first.destinationCity = 파주시   ← 🔴
     *
     * ── 구조 ──
     *   ① 국면 설정(phaseSettings)  →  ② 평면 필터(activeFilter)  →  ③ 파생 목록
     *                applyPhaseToFilter          syncDetourFilter
     *
     *   ①과 ② 사이에 **국면 전환·`override`·`auto` 파생**이 있다. ③을 만들면서 ①을
     *   직접 읽으면 그 변환이 통째로 무시된다.
     *
     * 🔴 **파생은 바로 윗단만 본다.** 두 단계를 건너뛰면
     *    ①을 다시 해석하게 되고, 그것은 `applyPhaseToFilter` 를 **두 번째로 구현하는 것**이라
     *    «같은 규칙 두 벌»이 된다.
     */
    it('🔴 도착목표는 activeFilter 에서 읽는다 (국면 설정을 직접 뒤지지 않는다)', () => {
        // 🔴 주석을 통째로 걷어낸다 — 줄머리만 보면 블록 주석 **안쪽**이 남아
        //    "안 읽는다"고 적어 둔 설명이 위반으로 잡힌다
        const strip = (p: string) => readFileSync(join(__dirname, p), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

        const fm = strip('../../src/state/filterManager.ts');
        // 함수 하나만 본다 — 파일 끝까지 보면 다른 함수의 phaseSettings 를 잡는다
        const from = fm.indexOf('export const recalculateDetourFilter');
        const end = fm.indexOf('\n};', from);            // 화살표 함수의 끝
        const fn = fm.slice(from, end === -1 ? undefined : end);
        expect(fn).toMatch(/unionRegions\(/);
        /**
         * `activeFilter.destinationCity` 를 **직접** 읽지 않고 `goalCityOf(session, userId)` 를 읽는다.
         *    그 함수가 «activeFilter 의 목적지 + 복귀면 집 시» 를 **한 곳에서** 낸다 — 복귀를 켤 때
         *    목적지를 덮어쓰면 복귀를 끄고 돌아올 때 원래 목적지가 없다. **국면 설정을 직접 뒤지지
         *    않고 바로 윗단(activeFilter 파생) 하나만 본다.**
         */
        expect(fn).toMatch(/goalCityOf\(session, userId\)/);
        expect(fn).not.toMatch(/phaseSettings/);
        expect(fn).toMatch(/activeFilter\.destinationRadiusKm/);
        // 국면 설정을 직접 읽으면 타겟(노선·관내·복귀)이 바뀌어도 안 따라간다
        expect(fn).not.toMatch(/phaseSettings/);

        // 조립하는 곳이 둘이면 한쪽만 고쳐져, 한쪽이 만든 경유 목록을 다른 쪽이 덮어 되돌린다
        const de = strip('../../src/services/dispatchEngine.ts');
        const sync = de.slice(de.indexOf('export const syncDetourFilter'));
        expect(sync).not.toMatch(/getDetourRegions\(/);
        // 조립은 한 곳(rebuildNetFilter)이다
        expect(sync).toMatch(/rebuildNetFilter\(/);
    });

    it('🔴 타겟이 복귀행으로 바뀌면 목록도 따라간다 (2026-08-25 18:58 실측)', () => {
        const 경유 = {
            flat: ['금촌동'], grouped: { '파주시': ['금촌동'] },
            customCityFilters: ['파주시', '파주'],
        };
        // 복귀행 · 목적 광주시 — 화면이 말하는 그 값으로 합친다
        const merged = unionRegions(경유, '광주시', 1);
        expect(merged.flat).toContain('곤지암읍');     // 광주시 안 — 내릴 수 있어야 한다
        expect(merged.flat).toContain('경안동');
        expect(merged.customCityFilters).toContain('광주시');
        expect(merged.flat).toContain('금촌동');       // 경유 것도 그대로 남는다
    });

    it('🔴 도착목표를 넣어도 상차지 축은 안 뚫린다 — progressKm 은 경로 위만', () => {
        // 경유 4개 + 도착목표에서 온 점동면·세종대왕면
        const s = session({ keywords: ['초월읍', '부발읍', '가남읍', '산북면', '점동면', '세종대왕면'] });
        const progress = buildAppOrderKm(s);

        // 경로 위 동은 진행도와 함께 내려간다
        expect(progress['초월읍']).toBe(16.5);
        expect(progress['가남읍']).toBe(48.5);

        // 🔴 경로 위인데 스냅에 실패한 동은 **null 로 나간다** — «모르는 것»과 «경로 밖»은 다르다.
        //    이걸 빼면 앱이 «경로 밖 — 차단» 으로 읽어 멀쩡한 상차지가 막힌다.
        expect(progress).toHaveProperty('산북면');
        expect(progress['산북면']).toBeNull();

        // (기사님 결정 — 필터는 방향을 안 본다) 도착목표로 들어온 동도 **null 로 나간다** — 순서 미상 → 통과.
        //    키를 빼서 «경로 밖 — 차단»으로 만들면 목적지 영역 안의 상차지까지 막힌다. 뒤로 가는 상차는 필터 영역이 뺀다.
        expect(progress).toHaveProperty('점동면');
        expect(progress['점동면']).toBeNull();
        expect(progress['세종대왕면']).toBeNull();
    });
});
