import { readFileSync } from 'fs';
import { join } from 'path';
import { initGeoService, getRegionsTouchingCircle, getDetourRegions } from '../../src/services/geoService';
import { APP_FILTER_KEYS, pickupListOf, callFilterBlocker } from '@onedal/shared';

/**
 * 📋 **상차 목록 — 실제 지도로** (기사님 확정 2026-09-15 · `docs/지금/필터.md` «상차 목록 · 하차 목록» · 판단 검사 `shared/src/pickupList.test.ts`).
 *
 * 좌표는 이천 왕복 시나리오 실값(`src/core/simScenarioIcheon.ts`).
 */
const MODA = { x: 127.312587, y: 37.363298 };           // 모다아울렛 (초월읍)
const TERMINAL = { x: 127.446936, y: 37.277421 };       // 이천터미널 (중리동)
const HD_SINDUN = { x: 127.40410, y: 37.30574 };        // HD현대 신둔 (신둔면)
const CHOWOL_STATION = { x: 127.299905, y: 37.373379 }; // 초월역 (초월읍)
const ME_KM = 4.55;    // 시나리오 때 자동 반경이 준 현위반경
const LINE_KM = 2.73;  // 시나리오 때 라인반경

beforeAll(() => { initGeoService(); });

describe('상차 목록 — 실제 지도', () => {
    it('내 영역은 동 경계가 원에 걸친 동이다 — 서 있는 동은 든다', () => {
        expect(getRegionsTouchingCircle(TERMINAL, ME_KM)).toContain('중리동');
    });

    it('🔴 A1 — 콜 전 초월읍에서는 17km 밖 이천터미널(중리동) 상차가 안 든다', () => {
        const list = pickupListOf({ stage: 'before', meDongs: getRegionsTouchingCircle(MODA, ME_KM), lineDongs: null, dropDongs: [] });
        expect(list).toContain('초월읍');
        expect(list).not.toContain('중리동');
    });

    it('🔴 D3 — 되돌아가는 경로에서 이천터미널에 서 있어도 다시 지날 신둔면이 든다', () => {
        const line = [HD_SINDUN, TERMINAL, HD_SINDUN, CHOWOL_STATION];
        const lineDongs = getDetourRegions(line, LINE_KM)?.flat ?? [];
        const list = pickupListOf({ stage: 'line', meDongs: getRegionsTouchingCircle(TERMINAL, ME_KM), lineDongs, dropDongs: [] });
        expect(list).toContain('신둔면');
        expect(list).not.toContain('초월읍');   // 경로 위지만 내 위치 둘레 밖 — 가까워지면 올라온다
    });
});

describe('상차 목록 배선', () => {
    const SRC = join(__dirname, '../../src');
    const code = (p: string) => readFileSync(join(SRC, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    it('🔴 앱에 실린다 — 옛 칸(상차 반경 · 순서표)도 1단계 동안 함께', () => {
        for (const k of ['pickupKeywords', 'pickupRadiusKm', 'orderKm']) expect(APP_FILTER_KEYS as readonly string[]).toContain(k);
    });

    it('🔴 그물 목록을 다시 만들 때 상차 목록도 · GPS 가 0.5km 움직일 때도 다시 만든다', () => {
        const fm = code('state/filterManager.ts');
        const rebuild = fm.slice(fm.indexOf('export function rebuildNetFilter('));
        expect(rebuild.slice(0, rebuild.indexOf('\n}'))).toMatch(/rebuildPickupList\(session, userId\)/);
        expect(code('socket/socketHandlers.ts')).toMatch(/maybeRebuildPickupList\(userId, io\)/);
    });

    it('🔴 빈 상차 목록은 고장 — 잡지 않는다 (규칙 ④) · 아직 안 만들었으면(옛 흐름) 막지 않는다', () => {
        const base = { isSharedMode: false, destinationCity: '이천시', destinationKeywords: ['중리동'] } as any;
        expect(callFilterBlocker({ ...base, pickupKeywords: [] })).toMatch(/상차 목록/);
        expect(callFilterBlocker({ ...base, pickupKeywords: ['중리동'] })).toBeNull();
        expect(callFilterBlocker(base)).toBeNull();
    });

    it('🔴 오탐 막는 낱말은 상차 목록 ∪ 하차 목록으로 한 벌 — 상차 목록을 만들 때도 같은 함수로 다시 잰다', () => {
        const fm = code('state/filterManager.ts');
        expect(fm).toMatch(/trapsForKeywords\(\[\.\.\.new Set\(\[\.\.\.\(f\.destinationKeywords \?\? \[\]\), \.\.\.\(f\.pickupKeywords \?\? \[\]\)\]\)\]\)/);
        const pick = fm.slice(fm.indexOf('export function rebuildPickupList('));
        expect(pick.slice(0, pick.indexOf('\n}'))).toMatch(/refreshKeywordTraps\(session\)/);
    });
});
