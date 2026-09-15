import { readFileSync } from 'fs';
import { join } from 'path';
import { initGeoService, pickupListFor } from '../../src/services/geoService';
import { APP_FILTER_KEYS, callFilterBlocker, quadShapeFrom } from '@onedal/shared';

/**
 * 📋 **상차 목록 — 실제 지도로** (기사님 확정 표 2026-09-15 · `docs/지금/필터.md` «상차 목록 · 하차 목록» · 계획 검사 `shared/src/pickupList.test.ts`).
 * 좌표는 이천 왕복 시나리오 실값(`src/core/simScenarioIcheon.ts`) · 반경은 그때 자동 반경이 준 값.
 */
const MODA = { x: 127.312587, y: 37.363298 };           // 모다아울렛 (초월읍)
const TERMINAL = { x: 127.446936, y: 37.277421 };       // 이천터미널 (중리동)
const HD_SINDUN = { x: 127.40410, y: 37.30574 };        // HD현대 신둔 (신둔면)
const CHOWOL_STATION = { x: 127.299905, y: 37.373379 }; // 초월역 (초월읍)
const radii = { pickupRadiusKm: 4.55, destinationRadiusKm: 4.55, quadRadiusKm: 15.9, detourRadiusKm: 2.73 };
const shape = quadShapeFrom(null);
const base = { radii, shape, destinationCity: '이천시', homeCity: '광주시' };

beforeAll(() => { initGeoService(); });

describe('상차 목록 — 실제 지도', () => {
    it('🔴 콜 전: 내 위치 반경뿐 — 뒤쪽이라도 반경 안이면 들고 · 마름모 안 먼 곳은 안 든다', () => {
        const r = pickupListFor({ ...base, me: MODA, line: null, homeOn: false, homeCaught: false });
        expect(r.list).toContain('초월읍');   // 서 있는 동 (원)
        /* 🔴 기사님 2026-09-15 개정: 출발 전 상차지는 내 위치 반경뿐 — «아무리 빨리 가도 마름모 영역까지 상차를 20분 안에 할 수 없잖아» */
        expect(r.list).not.toContain('중리동');   // 17km 앞 이천터미널 — 마름모 안이지만 반경 밖
        expect(r.list).not.toContain('역삼1동');   // 원도 마름모도 아닌 곳
    });

    it('🔴 D3 — 복귀콜을 쥐고 되돌아가는 경로에서 이천터미널에 서 있어도 다시 지날 신둔면이 든다 · 경로 위라도 원 밖은 안 든다', () => {
        const line = [HD_SINDUN, TERMINAL, HD_SINDUN, CHOWOL_STATION];
        const r = pickupListFor({ ...base, me: TERMINAL, line, homeOn: true, homeCaught: true });
        expect(r.list).toContain('신둔면');
        expect(r.list).not.toContain('초월읍');   // 가까워지면 올라온다
    });

    it('🔴 복귀 대기 · 쥔 콜 없음: 가까운 관내(이천 원 안)와 집 방향이 둘 다 든다', () => {
        const r = pickupListFor({ ...base, me: TERMINAL, line: null, homeOn: true, homeCaught: false });
        expect(r.list).toContain('중리동');   // 이천 안 — 관내
        expect(r.list).toContain('신둔면');   // 집 방향 마름모
    });

    it('🔴 시나리오 A1 — 콜 전 초월읍에서 뒤쪽·원 밖 경안동(이마트 광주점 7km)은 안 든다', () => {
        const r = pickupListFor({ ...base, me: MODA, line: null, homeOn: false, homeCaught: false });
        expect(r.list).not.toContain('경안동');
    });

    it('🔴 시나리오 D4 — 복귀콜 둘을 쥐고 우리주유소에 서면 경로 밖 마장면 상차는 안 든다', () => {
        const WOORI = { x: 127.39719, y: 37.31740 }, GONJIAM_STAR = { x: 127.33209, y: 37.35310 };
        const r = pickupListFor({ ...base, me: WOORI, line: [WOORI, GONJIAM_STAR, CHOWOL_STATION], homeOn: true, homeCaught: true });
        expect(r.list).not.toContain('마장면');
        expect(r.list).toContain('신둔면');
    });

    it('🔴 읍·면·동 이름만 싣는다', () => {
        const r = pickupListFor({ ...base, me: MODA, line: null, homeOn: false, homeCaught: false });
        expect(r.list.filter(n => /(시|구|군)$/.test(n))).toEqual([]);
    });
});

describe('상차 목록 배선', () => {
    const SRC = join(__dirname, '../../src');
    const code = (p: string) => readFileSync(join(SRC, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    it('🔴 앱에 실린다 — 옛 칸(상차 반경 · 순서표)도 1단계 동안 함께', () => {
        for (const k of ['pickupKeywords', 'pickupRadiusKm', 'orderKm']) expect(APP_FILTER_KEYS as readonly string[]).toContain(k);
    });

    it('🔴 그물 목록을 다시 만들 때 · GPS 가 0.5km 움직일 때 다시 만든다 — 계산은 pickupListFor 한 곳', () => {
        const fm = code('state/filterManager.ts');
        const rebuild = fm.slice(fm.indexOf('export function rebuildNetFilter('));
        expect(rebuild.slice(0, rebuild.indexOf('\n}'))).toMatch(/rebuildPickupList\(session, userId\)/);
        const pick = fm.slice(fm.indexOf('export function rebuildPickupList('));
        expect(pick.slice(0, pick.indexOf('\n}'))).toMatch(/pickupListFor\(/);
        expect(pick.slice(0, pick.indexOf('\n}'))).toMatch(/refreshKeywordTraps\(session\)/);
        expect(code('socket/socketHandlers.ts')).toMatch(/maybeRebuildPickupList\(userId, io\)/);
    });

    it('🔴 빈 상차 목록은 고장 — 잡지 않는다 (규칙 ④) · 아직 안 만들었으면 막지 않는다', () => {
        const b = { isSharedMode: false, destinationCity: '이천시', destinationKeywords: ['중리동'] } as any;
        expect(callFilterBlocker({ ...b, pickupKeywords: [] })).toMatch(/상차 목록/);
        expect(callFilterBlocker({ ...b, pickupKeywords: ['중리동'] })).toBeNull();
        expect(callFilterBlocker(b)).toBeNull();
    });
});
