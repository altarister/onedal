import { readFileSync } from 'fs';
import { join } from 'path';
import { initGeoService, pickupListFor } from '../../src/services/geoService';
import { APP_FILTER_KEYS, callFilterBlocker, type GoalZone } from '@onedal/shared';

/**
 * 📋 **상차 목록 — 실제 지도로** (기사님 확정 2026-09-15 · `docs/지금/필터.md` «상차 영역» · 모양 검사 `shared/src/filterArea.test.ts`).
 *
 * 살아 있는 목적지 중 하나라도 운행 뒤가 아니면 **현위치 영역 전체**, 전부 운행 뒤면 **현위치 영역 ∩ 라인 영역**.
 * 좌표는 이천 왕복 시나리오 실값(`src/core/simScenarioIcheon.ts`) · 반경은 그때 자동 반경이 준 값.
 */
const MODA = { x: 127.312587, y: 37.363298 };           // 모다아울렛 (초월읍)
const TERMINAL = { x: 127.446936, y: 37.277421 };       // 이천터미널 (중리동)
const HD_SINDUN = { x: 127.40410, y: 37.30574 };        // HD현대 신둔 (신둔면)
const CHOWOL_STATION = { x: 127.299905, y: 37.373379 }; // 초월역 (초월읍)
const radii = { pickupRadiusKm: 4.55, detourRadiusKm: 2.73 };
const dest = (state: GoalZone['state']): GoalZone => ({ city: '이천시', isHome: false, state });
const home = (state: GoalZone['state']): GoalZone => ({ city: '광주시', isHome: true, state });

beforeAll(() => { initGeoService(); });

describe('상차 목록 — 실제 지도', () => {
    it('🔴 콜 없음: 내 위치 반경뿐 — 뒤쪽이라도 반경 안이면 들고 · 먼 곳은 안 든다', () => {
        const r = pickupListFor({ radii, me: MODA, line: null, zones: [dest('idle')] });
        expect(r.list).toContain('초월읍');
        expect(r.list).not.toContain('중리동');   // 17km 앞 이천터미널 — 반경 밖
        expect(r.list).not.toContain('역삼1동');
    });

    it('🔴 콜을 잡아 경로가 생김 (운행 전) → 현위치 영역 전체 — 라인 밖이라도 원 안이면 든다', () => {
        const line = [TERMINAL, HD_SINDUN, CHOWOL_STATION];
        const idle = pickupListFor({ radii, me: TERMINAL, line: null, zones: [dest('idle')] }).list;
        const routed = pickupListFor({ radii, me: TERMINAL, line, zones: [dest('routed')] }).list;
        const driving = pickupListFor({ radii, me: TERMINAL, line, zones: [dest('driving')] }).list;
        expect(routed).toEqual(idle);
        /* 운행 뒤는 원 ∩ 라인 — 원 전체보다 좁다 */
        expect(driving.every(n => routed.includes(n))).toBe(true);
        expect(driving.length).toBeLessThan(routed.length);
    });

    it('🔴 운행 뒤 · 목적지 콜 남음 · 복귀 켬 (집은 콜 없음) → 현위치 영역 전체 · 이천 안 관내도 든다', () => {
        const line = [TERMINAL, HD_SINDUN, CHOWOL_STATION];
        const both = pickupListFor({ radii, me: TERMINAL, line, zones: [dest('driving'), home('idle')] }).list;
        expect(both).toEqual(pickupListFor({ radii, me: TERMINAL, line: null, zones: [dest('idle')] }).list);
        expect(both).toContain('중리동');
    });

    it('🔴 D3 — 복귀콜을 쥐고 되돌아가는 경로에서 이천터미널에 서 있어도 다시 지날 신둔면이 든다 · 경로 위라도 원 밖은 안 든다', () => {
        const line = [HD_SINDUN, TERMINAL, HD_SINDUN, CHOWOL_STATION];
        const r = pickupListFor({ radii, me: TERMINAL, line, zones: [home('driving')] });
        expect(r.list).toContain('신둔면');
        expect(r.list).not.toContain('초월읍');   // 가까워지면 올라온다
    });

    it('🔴 시나리오 A1 — 콜 전 초월읍에서 뒤쪽·원 밖 경안동(이마트 광주점 7km)은 안 든다', () => {
        expect(pickupListFor({ radii, me: MODA, line: null, zones: [dest('idle')] }).list).not.toContain('경안동');
    });

    it('🔴 시나리오 D4 — 복귀콜만 쥐고 운행 중 우리주유소에 서면 경로 밖 마장면 상차는 안 든다', () => {
        const WOORI = { x: 127.39719, y: 37.31740 }, GONJIAM_STAR = { x: 127.33209, y: 37.35310 };
        const r = pickupListFor({ radii, me: WOORI, line: [WOORI, GONJIAM_STAR, CHOWOL_STATION], zones: [home('driving')] });
        expect(r.list).not.toContain('마장면');
        expect(r.list).toContain('신둔면');
    });

    it('🔴 운행 뒤인데 라인이 없으면 현위치 영역 전체 — 라인을 지어내지 않는다 (규칙 ④)', () => {
        const noLine = pickupListFor({ radii, me: TERMINAL, line: null, zones: [dest('driving')] });
        expect(noLine.list).toEqual(pickupListFor({ radii, me: TERMINAL, line: null, zones: [dest('idle')] }).list);
    });

    it('🔴 목적지가 없으면 빈 목록 — 빈 목록은 고장으로 막힌다 (아래 배선)', () => {
        expect(pickupListFor({ radii, me: TERMINAL, line: null, zones: [] }).list).toEqual([]);
    });

    it('🔴 시 · 군 · 구로 묶은 목록도 낸다 — 하차 목록이 같은 이름의 다른 동을 안 빼게 (리뷰 2026-09-15)', () => {
        const r = pickupListFor({ radii, me: MODA, line: null, zones: [dest('idle')] });
        expect([...new Set(Object.values(r.grouped).flat())].sort()).toEqual([...r.list].sort());
        expect(Object.keys(r.grouped).some(k => k.includes('광주'))).toBe(true);
    });

    it('🔴 읍·면·동 이름만 싣는다', () => {
        const r = pickupListFor({ radii, me: MODA, line: null, zones: [dest('idle')] });
        expect(r.list.filter(n => /(시|구|군)$/.test(n))).toEqual([]);
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
        /* 목적지 상태 · 가까이 옴은 하차 목록과 같은 한 곳 (`goalZonesNow` · 2026-09-15) */
        expect(body).toMatch(/goalZonesNow\(session, userId/);
        expect(body).toMatch(/pickupListFor\(/);
        expect(body).toMatch(/refreshKeywordTraps\(session\)/);
        /* 🔴 지도 재료(복귀 켬 · 복귀콜 쥠 · 집 · 라인)가 바뀌어도 «바뀌었다»고 알린다 — 목록만 보면 옛 재료로 그린다 (2026-09-15 15:47) */
        expect(body).toMatch(/pickupAreaKey\(/);
        expect(code('socket/socketHandlers.ts')).toMatch(/maybeRebuildPickupList\(userId, io\)/);
    });

    /**
     * 🔎 **코드 리뷰 2026-09-15** — 상차 목록이 늦는 길 둘 · 노선/동선이 갈리는 길 하나.
     *   ① 필터 판에서 목적지 · 반경 · 자동 반경을 바꾸면 하차 목록만 새로 만들고 상차 목록은 0.5km 움직일 때까지 옛것이었다
     *      (목적지 없이 떴다가 정하면 빈 상차 목록이 남아 원달앱이 전부 막았다)
     *   ② 손으로 고친 필터(`userOverrides`)면 상차 목록까지 건너뛰었다 — #146 과 같은 모양
     *   ③ 동선인데 하차 조각은 라인이 있다고 보고 그물엔 라인을 안 넘겨 «종착지 마름모 + 원»만 남았다
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
        expect(body).toMatch(/mergeDropoffGroups\(parts, session\.pickupGroups/);
        expect(fm).toMatch(/session\.pickupGroups = /);
    });
    it('🔴 지도 재료도 서버와 같다 — 판정 중 후보콜은 안 센다 · 동선이면 상차 띠가 없다 · 띠가 없으면 원 전체', () => {
        const sv = readFileSync(join(__dirname, '../../../client-app/src/components/stage/StageView.tsx'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        expect(sv).toMatch(/liveRoute\.filter\(o => !isEvaluating\(o\.status\)\)/);
        expect(sv).not.toMatch(/activeCalls: liveRoute,/);
        expect(sv).toMatch(/const pickupLine = routeMode/);
        expect(sv).not.toMatch(/pickupShape === 'meLine' && !\(pickupLine/);
    });

    it('🔴 빈 상차 목록은 고장 — 잡지 않는다 (규칙 ④) · 아직 안 만들었으면 막지 않는다', () => {
        const b = { isSharedMode: false, destinationCity: '이천시', destinationKeywords: ['중리동'] } as any;
        expect(callFilterBlocker({ ...b, pickupKeywords: [] })).toMatch(/상차 목록/);
        expect(callFilterBlocker({ ...b, pickupKeywords: ['중리동'] })).toBeNull();
        expect(callFilterBlocker(b)).toBeNull();
    });
});
