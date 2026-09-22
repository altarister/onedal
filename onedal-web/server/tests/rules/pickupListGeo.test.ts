import { readFileSync } from 'fs';
import { join } from 'path';
import { initGeoService, pickupListFor } from '../../src/services/geoService';
import { getUserSession } from '../../src/state/userSessionStore';
import { rebuildPickupList } from '../../src/state/filterManager';
import { APP_FILTER_KEYS, callFilterBlocker } from '@onedal/shared';

/**
 * 📋 **상차 목록 — 실제 지도로** (기사님 확정 · 모양 검사 `shared/src/filterArea.test.ts`).
 *
 * 살아 있는 목적지 중 하나라도 운행 뒤가 아니면 **현위치 영역 전체**, 전부 운행 뒤면 **현위치 영역 ∩ 라인 영역**.
 * 좌표는 이천 왕복 시나리오 실값(`src/core/simScenarioIcheon.ts`) · 반경은 그때 자동 반경이 준 값.
 */
const MODA = { x: 127.312587, y: 37.363298 };           // 모다아울렛 (초월읍)
const TERMINAL = { x: 127.446936, y: 37.277421 };       // 이천터미널 (중리동)
const HD_SINDUN = { x: 127.40410, y: 37.30574 };        // HD현대 신둔 (신둔면)
const CHOWOL_STATION = { x: 127.299905, y: 37.373379 }; // 초월역 (초월읍)
const radii = { pickupRadiusKm: 4.55, detourRadiusKm: 2.73 };
/* 🧱 조각을 그대로 넘긴다 — `pickupListFor` 는 «무엇을 켤까»를 다시 판단하지 않는다 */
const parts = (line: boolean, goalCities: string[] = []) => ({ line, goalCities });

beforeAll(() => { initGeoService(); });

describe('상차 목록 — 실제 지도', () => {
    it('🔴 콜 없음: 내 위치 반경뿐 — 뒤쪽이라도 반경 안이면 들고 · 먼 곳은 안 든다', () => {
        const r = pickupListFor({ radii, me: MODA, line: null, parts: parts(false) });
        expect(r.list).toContain('초월읍');
        expect(r.list).not.toContain('중리동');   // 17km 앞 이천터미널 — 반경 밖
        expect(r.list).not.toContain('역삼1동');
    });

    it('🔴 콜을 잡아 경로가 생김 (운행 전) → 현위치 영역 전체 — 라인 밖이라도 원 안이면 든다', () => {
        const line = [TERMINAL, HD_SINDUN, CHOWOL_STATION];
        const idle = pickupListFor({ radii, me: TERMINAL, line: null, parts: parts(false) }).list;
        const routed = pickupListFor({ radii, me: TERMINAL, line, parts: parts(false) }).list;
        const driving = pickupListFor({ radii, me: TERMINAL, line, parts: parts(true) }).list;
        expect(routed).toEqual(idle);
        /* 운행 뒤는 원 ∩ 라인 — 원 전체보다 좁다 */
        expect(driving.every(n => routed.includes(n))).toBe(true);
        expect(driving.length).toBeLessThan(routed.length);
    });

    /**
     * 🔴 **복귀를 켜도 상차가 안 늘어난다**.
     *
     * «모든 목적지가 운행 뒤인가»를 물어 라인을 켜면, 복귀를 켤 때 집이 «콜 없음»으로 들어와
     * 그 물음이 거짓이 되고 **라인이 통째로 꺼진다** — 상차지가 118곳에서 419곳으로 늘어 뒤쪽이 전부 통과한다.
     * 그래서 조각은 «내가 달리나»만 본다 — 목적지가 몇이든 답이 같다.
     */
    it('🔴 복귀를 켜도(목적지 둘) 상차는 라인으로 좁힌 그대로다 — 원 전체로 늘지 않는다', () => {
        const line = [TERMINAL, HD_SINDUN, CHOWOL_STATION];
        const both = pickupListFor({ radii, me: TERMINAL, line, parts: parts(true) }).list;
        const whole = pickupListFor({ radii, me: TERMINAL, line: null, parts: parts(false) }).list;
        expect(both.length).toBeLessThan(whole.length);
        expect(both).toEqual(pickupListFor({ radii, me: TERMINAL, line, parts: parts(true) }).list);
    });

    it('🔴 D3 — 복귀콜을 쥐고 되돌아가는 경로에서 이천터미널에 서 있어도 다시 지날 신둔면이 든다 · 경로 위라도 원 밖은 안 든다', () => {
        const line = [HD_SINDUN, TERMINAL, HD_SINDUN, CHOWOL_STATION];
        const r = pickupListFor({ radii, me: TERMINAL, line, parts: parts(true) });
        expect(r.list).toContain('신둔면');
        expect(r.list).not.toContain('초월읍');   // 가까워지면 올라온다
    });

    it('🔴 시나리오 A1 — 콜 전 초월읍에서 뒤쪽·원 밖 경안동(이마트 광주점 7km)은 안 든다', () => {
        expect(pickupListFor({ radii, me: MODA, line: null, parts: parts(false) }).list).not.toContain('경안동');
    });

    it('🔴 시나리오 D4 — 복귀콜만 쥐고 운행 중 우리주유소에 서면 경로 밖 마장면 상차는 안 든다', () => {
        const WOORI = { x: 127.39719, y: 37.31740 }, GONJIAM_STAR = { x: 127.33209, y: 37.35310 };
        const r = pickupListFor({ radii, me: WOORI, line: [WOORI, GONJIAM_STAR, CHOWOL_STATION], parts: parts(true) });
        expect(r.list).not.toContain('마장면');
        expect(r.list).toContain('신둔면');
    });

    it('🔴 운행 뒤 상차 띠는 현위치부터 앞으로만 · 뒤는 평평하게 — 곤지암에서 지나온 초월읍은 안 든다 (기사님 2026-09-15 «뒤를 자르는 Cap»)', () => {
        const GONJIAM_STAR = { x: 127.33209, y: 37.35310 }, WOORI = { x: 127.39719, y: 37.31740 };
        const r = pickupListFor({ radii, me: GONJIAM_STAR, line: [CHOWOL_STATION, GONJIAM_STAR, WOORI, HD_SINDUN], parts: parts(true) });
        expect(r.list).toContain('곤지암읍');
        expect(r.list).not.toContain('초월읍');
    });

    it('🔴 운행 뒤인데 라인이 없으면 현위치 영역 전체 — 라인을 지어내지 않는다 (규칙 ④)', () => {
        const noLine = pickupListFor({ radii, me: TERMINAL, line: null, parts: parts(true) });
        expect(noLine.list).toEqual(pickupListFor({ radii, me: TERMINAL, line: null, parts: parts(false) }).list);
    });

    /**
     * 🔴 **목적지 개수는 조각이 볼 사실이 아니다** — 조각은 «출발했나 · 경로가 있나 · 가까이 온 목적지»만 본다.
     *    그래서 «목적지를 모르면 빈 목록»은 부르는 쪽(`rebuildPickupList`)이 가른다. 여기서 그 배선을 문다.
     */
    it('🔴 목적지가 없으면 빈 목록 — 빈 목록은 고장으로 막힌다 (아래 배선)', () => {
        const fm = readFileSync(join(__dirname, '../../src/state/filterManager.ts'), 'utf8');
        expect(fm).toMatch(/zones\.length === 0\s*\n?\s*\? \{ list: \[\] as string\[\]/);
    });

    it('🔴 시 · 군 · 구로 묶은 목록도 낸다 — 하차 목록이 같은 이름의 다른 동을 안 빼게 (리뷰 2026-09-15)', () => {
        const r = pickupListFor({ radii, me: MODA, line: null, parts: parts(false) });
        expect([...new Set(Object.values(r.grouped).flat())].sort()).toEqual([...r.list].sort());
        expect(Object.keys(r.grouped).some(k => k.includes('광주'))).toBe(true);
    });

    it('🔴 읍·면·동 이름만 싣는다', () => {
        const r = pickupListFor({ radii, me: MODA, line: null, parts: parts(false) });
        expect(r.list.filter(n => /(시|구|군)$/.test(n))).toEqual([]);
    });
});

/**
 * 📏 **상차 목록은 자동 반경을 먼저 재고 만든다** (#149 · 기사님 «목현동으로 다시 봐줘»).
 *
 * 자동 반경이 쓸 «잰 거리»(`radiusDistanceKm`)가 비어 있을 때(서버를 다시 켠 직후) 상차 목록을 먼저 만들면
 * 원값(10km)으로 만든다. 하차 목록(`netKeywordsOf`)이 뒤에서 거리를 재 넣고 지도가 줄어든 원(예: 4.6km)을 그려도
 * 상차 목록은 0.5km 움직일 때까지 10km 그대로라, 집(광주 초월)에서 **북서 7.4km** 목현동이 목록에 들어
 * 지도 원 밖에 초록 점이 찍힌다. 그래서 거리를 재는 자리를 하나(`holdRadiusDistance`)로 두고
 * 상차 · 하차 목록이 반경을 쓰기 전에 부른다.
 */
describe('📏 상차 목록은 자동 반경을 먼저 잰다 (#149)', () => {
    it('🔴 잰 거리가 비어 있어도(재시작 직후) 먼저 재고 줄인 반경으로 만든다 — 목현동은 안 든다', () => {
        const U = 'test-pickup-radius-first';
        const HOME = { x: 127.29444030053442, y: 37.376686997522675 };   // 광주 초월 (그날 집 주소)
        const s = getUserSession(U);
        Object.assign(s.activeFilter, {
            destinationCity: '이천시', callTarget: 'DEST', routeMode: true,
            radiusAuto: true, radiusBaseKm: 40, radiusDistanceKm: undefined,
            pickupRadiusKm: 10, destinationRadiusKm: 10, quadRadiusKm: 35, detourRadiusKm: 6, srcAngleDeg: 120, dstAngleDeg: 120,
        });
        Object.assign(s, { lastFix: HOME, lastFixAt: Date.now(), lastFixSource: 'gps', lastFixIsMock: false });
        rebuildPickupList(s, U);
        expect(s.activeFilter.radiusDistanceKm).toBeGreaterThan(17);
        expect(s.activeFilter.radiusDistanceKm).toBeLessThan(20);
        expect(s.activeFilter.pickupKeywords ?? []).not.toContain('목현동');
        expect(s.activeFilter.pickupKeywords ?? []).toContain('초월읍');
    });
    it('🔴 거리를 재는 자리는 한 곳 — 상차 목록 · 하차 목록이 반경을 쓰기 전에 부른다', () => {
        const fm = readFileSync(join(__dirname, '../../src/state/filterManager.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        expect((fm.match(/heldRadiusDistanceKm\(/g) || []).length).toBe(1);
        const pick = fm.slice(fm.indexOf('export function rebuildPickupList('));
        const body = pick.slice(0, pick.indexOf('\n}'));
        expect(body.indexOf('holdRadiusDistance(')).toBeGreaterThan(-1);
        expect(body.indexOf('holdRadiusDistance(')).toBeLessThan(body.indexOf('effectiveRadii('));
        const net = fm.slice(fm.indexOf('function netKeywordsOf('));
        expect(net.slice(0, net.indexOf('autoRadii('))).toMatch(/holdRadiusDistance\(session, city, me\)/);
    });
});

describe('상차 목록 배선', () => {
    const SRC = join(__dirname, '../../src');
    const code = (p: string) => readFileSync(join(SRC, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    it('🔴 앱에 실린다 — 옛 칸(상차 반경 · 순서표)도 1단계 동안 함께', () => {
        for (const k of ['pickupKeywords', 'pickupRadiusKm', 'orderKm']) expect(APP_FILTER_KEYS as readonly string[]).toContain(k);
    });

    it('🔴 그물 목록을 다시 만들 때 · GPS 가 0.5km 움직일 때 다시 만든다 — 목적지 상태는 goalZonesOf · 계산은 pickupListFor 한 곳', () => {
        const fm = code('state/filterManager.ts');
        const rebuild = fm.slice(fm.indexOf('export function rebuildNetFilter('));
        expect(rebuild.slice(0, rebuild.indexOf('\n}'))).toMatch(/rebuildPickupList\(session, userId\)/);
        const pick = fm.slice(fm.indexOf('export function rebuildPickupList('));
        const body = pick.slice(0, pick.indexOf('\n}'));
        /* 목적지 상태 · 가까이 옴은 하차 목록과 같은 한 곳 (`goalZonesNow`) */
        expect(body).toMatch(/goalZonesNow\(session, userId/);
        expect(body).toMatch(/pickupListFor\(/);
        expect(body).toMatch(/refreshKeywordTraps\(session\)/);
        /* 🔴 지도 재료(복귀 켬 · 복귀콜 쥠 · 집 · 라인)가 바뀌어도 «바뀌었다»고 알린다 — 목록만 보면 옛 재료로 그린다 */
        expect(body).toMatch(/pickupAreaKey\(/);
        expect(code('socket/socketHandlers.ts')).toMatch(/maybeRebuildPickupList\(userId, io\)/);
    });

    /**
     * 🔎 **상차 목록이 늦으면 안 되는 길 둘 · 노선/동선이 갈리면 안 되는 길 하나.**
     *   ① 필터 판에서 목적지 · 반경 · 자동 반경을 바꾸면 상차 목록도 그때 새로 만든다 — 0.5km 움직일 때까지
     *      미루면 목적지 없이 떴다가 정할 때 빈 상차 목록이 남아 원달앱이 전부 막는다
     *   ② 손으로 고친 필터(`userOverrides`)여도 상차 목록은 새로 만든다 — #146 과 같은 모양
     *   ③ 동선이면 하차 조각도 그물도 라인이 없다고 본다 — 한쪽만 라인을 보면 «마지막 하차지 마름모 + 원»만 남는다
     */
    it('🔴 필터 판 값이 바뀌어 하차 목록을 다시 만들 때 상차 목록을 먼저 만든다 · 시 별칭은 목록에 든 시 전부로', () => {
        const fm = code('state/filterManager.ts');
        /* 필터 판 값이 바뀌면 `updateActiveFilter` → `recalculateDerivedFields` 의 지리 재계산 분기가 목록을 만든다 */
        const upd = fm.slice(fm.indexOf('function recalculateDerivedFields('));
        const geo = upd.slice(upd.indexOf('needsGeoRecalc) {'), upd.indexOf('session.activeFilter.customCityFilters = customCityFilters'));
        expect(geo).toMatch(/rebuildPickupList\(session, userId\)[\s\S]*netOfGoals\(/);
        expect(geo).not.toMatch(/getCityRegionsWithRadius\(/);
    });
    it('🔴 손으로 고친 필터여도 상차 목록은 새로 만든다', () => {
        const fm = code('state/filterManager.ts');
        const r = fm.slice(fm.indexOf('export function rebuildNetFilter('));
        const body = r.slice(0, r.indexOf('\n}'));
        expect(body.indexOf('rebuildPickupList(session, userId)')).toBeGreaterThan(-1);
        expect(body.indexOf('rebuildPickupList(session, userId)')).toBeLessThan(body.indexOf('userOverrides'));
    });
    it('🔴 하차 목록은 동선이면 라인이 없다고 본다 · 상차 목록은 시 · 군 · 구로 묶어 뺀다', () => {
        const fm = code('state/filterManager.ts');
        const n = fm.slice(fm.indexOf('function netOfGoals('));
        const body = n.slice(0, n.indexOf('\n}'));
        expect(body).toMatch(/routeMode === false/);
        expect(body).toMatch(/mergeDropoffGroups\(parts, session\.activeFilter\.pickupGroups/);
        expect(fm).toMatch(/f\.pickupGroups = grouped/);
    });
    it('📍 지도 동 점 — 서버가 상차 목록 묶음을 필터에 싣고 · 무대가 dongDotsOf 로 · 캔버스 «동 점» 레이어 (기사님 2026-09-15 «다시 넣어줘»)', () => {
        const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        const CLIENT = join(__dirname, '../../../client-app/src');
        expect(readFileSync(join(__dirname, '../../../shared/src/index.ts'), 'utf8')).toMatch(/pickupGroups\?: Record<string, string\[\]>/);
        const sv = strip(readFileSync(join(CLIENT, 'components/stage/StageView.tsx'), 'utf8'));
        expect(sv).toMatch(/dongDotsOf\(\{\s*pickupGroups: filter\.pickupGroups/);
        expect(sv).toMatch(/dropoffGroups: filter\.destinationGroups/);
        const canvas = strip(readFileSync(join(CLIENT, 'components/dashboard/PinnedRouteCanvas.tsx'), 'utf8'));
        expect(canvas).toMatch(/\['dots', '동 점'\]/);
        expect(canvas).toMatch(/dongDots\.both/);
        /* 묶음은 필터 한 곳에 산다 — 세션에 또 두지 않는다 (규칙 ③) · 원달앱에는 안 간다 (이름 목록 `pickupKeywords` 가 간다) */
        expect(code('state/userSessionStore.ts')).not.toMatch(/pickupGroups/);
        expect(APP_FILTER_KEYS as readonly string[]).not.toContain('pickupGroups');
    });
    it('🔴 지도 재료도 서버와 같다 — 판정 중 후보콜은 안 센다 · 동선이면 상차 띠가 없다 · 띠가 없으면 원 전체', () => {
        const sv = readFileSync(join(__dirname, '../../../client-app/src/components/stage/StageView.tsx'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        expect(sv).toMatch(/liveRoute\.filter\(o => !isEvaluating\(o\.status\)\)/);
        expect(sv).not.toMatch(/activeCalls: liveRoute,/);
        expect(sv).toMatch(/const drawLine = routeMode/);
        /* 🔴 띠를 켤지는 조각이 정한다 — 화면이 다시 판단하지 않는다 */
        expect(sv).toMatch(/const pickupLine = pickupParts\.line \? drawLine : null/);
    });

    it('✂️ 라인 띠는 현위치부터 · 시작은 평평하게 — 서버 상차 목록 · 지도 «상차» · «하차» 띠가 같은 함수 (기사님 2026-09-15 «2»)', () => {
        expect(code('services/geoService.ts')).toMatch(/lineFromPoint\(/);
        expect(code('services/geoService.ts')).toMatch(/isAheadOf\(p, cut\)/);
        const CLIENT = join(__dirname, '../../../client-app/src');
        const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        const sv = strip(readFileSync(join(CLIENT, 'components/stage/StageView.tsx'), 'utf8'));
        expect((sv.match(/lineFromPoint\(/g) || []).length).toBeGreaterThanOrEqual(2);
        const canvas = strip(readFileSync(join(CLIENT, 'components/dashboard/PinnedRouteCanvas.tsx'), 'utf8'));
        expect(canvas).toMatch(/const clipAhead = /);
        expect((canvas.match(/clipAhead\(/g) || []).length).toBeGreaterThanOrEqual(2);   // 상차 띠 · 하차 띠
        /* 🔴 상차 띠의 자름 방향은 «첫 점 → 끝점» — 마지막 한 구간에서 뽑으면 골목이 영역을 돌린다 */
        expect(canvas).toMatch(/clipAhead\(c2d, \[band\[0\], band\[band\.length - 1\]\]/);
        expect(canvas).not.toMatch(/lineCap = 'butt'/);
        expect(canvas).not.toMatch(/trimKm/);
    });

    it('🔴 빈 상차 목록은 고장 — 잡지 않는다 (규칙 ④) · 아직 안 만들었으면 막지 않는다', () => {
        const b = { isSharedMode: false, destinationCity: '이천시', destinationKeywords: ['중리동'] } as any;
        expect(callFilterBlocker({ ...b, pickupKeywords: [] })).toMatch(/상차 목록/);
        expect(callFilterBlocker({ ...b, pickupKeywords: ['중리동'] })).toBeNull();
        expect(callFilterBlocker(b)).toBeNull();
    });
});
