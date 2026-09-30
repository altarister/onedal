// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import { anyRegionHit, sigunguHintBefore } from '@onedal/shared';

/**
 * 🏘️ **이름이 같은 다른 지역 동은 앞에 보이는 시군구로 가른다** (평택 고덕동 실사고 · 기사님 «가» · onedal-1f «가»).
 *
 * 규칙(서버 anyRegionHit · 원달앱 RegionMatch 한 벌): 맞은 동이 destinationDongSigungu 에 있고, 그 바로 앞 토막이 시군구 꼴인데
 * 칸의 꼴이 아니면 다른 곳. 목록 페이지에서 상세 주소가 안 보이면(시도만 · 없음) 통과 — 상세 페이지는 요건 확인(하차 주소 시·군·구)이 먼저 막는다.
 * 여러 시군구에 걸리는 구 이름(중구)은 앞 토막까지 두 토막으로.
 * 문제지는 shared/src/regionMatchCases.json 한 벌 — 원달앱 JUnit 도 같은 표를 읽는다.
 */
const sheet = JSON.parse(readFileSync(join(__dirname, '../../../shared/src/regionMatchCases.json'), 'utf8'));

describe('🏘️ 동명이동 문제지 (서버)', () => {
    for (const c of sheet.cases.filter((c: any) => c.only !== 'picker')) {
        it(`${c.expect ? '통과' : '불통과'} — ${c.text} (${c.why})`, () => {
            expect(anyRegionHit(c.text, [c.keyword], {}, sheet.dongSigungu)).toBe(c.expect);
        });
    }

    it('칸이 없으면 지금과 같다 — 평택 고덕동도 통과(호환)', () => {
        expect(anyRegionHit('경기 평택시 고덕동', ['고덕동'], {})).toBe(true);
    });

    it('앞 토막 가르기 — 겹치는 구는 두 토막 · 시도만은 모름', () => {
        expect(sigunguHintBefore('서울 중구 ')).toBe('서울 중구');
        expect(sigunguHintBefore('중구 ')).toBeNull();
        expect(sigunguHintBefore('서울 ')).toBeNull();
        expect(sigunguHintBefore('경기 평택시 ')).toBe('평택시');
        expect(sigunguHintBefore('경기 성남시 ')).toBe('성남시');   // 구가 셋이어도 가리키는 시는 하나
    });
});

describe('🏘️ 칸 파생 — 도착 목록 가운데 이름이 겹치는 동만', () => {
    const { updateActiveFilter } = require('../../src/state/filterManager');
    const { getUserSession, clearUserSession } = require('../../src/state/userSessionStore');
    const U = 'test-dong-sigungu';
    afterAll(() => clearUserSession(U));

    it('🔴 고덕동(강동구 묶음)은 싣고 · 겹치지 않는 동은 안 싣는다 · 값은 시 별칭 꼴', () => {
        const session = getUserSession(U);
        session.activeFilter.userOverrides = true;     // 목적지로 다시 펴지 않고 준 목록 그대로
        updateActiveFilter(U, {
            destinationKeywords: ['고덕동', '명일동'],
            destinationGroups: { '서울 강동구': ['고덕동', '명일동'] },
            customCityFilters: ['서울 강동구', '강동구', '강동'],
        });
        const f = session.activeFilter;
        expect(Object.keys(f.destinationDongSigungu ?? {})).toEqual(['고덕동']);
        /* 값은 시 별칭 함수가 낸 꼴 그대로 — 구 단독 꼴(«강동구»)은 서버가 지도를 불러온 뒤에야 붙는다(부팅 · 검사는 지도 없음) */
        const { cityAliases } = require('../../src/services/geoService');
        expect(f.destinationDongSigungu['고덕동'].sort()).toEqual([...new Set(cityAliases('서울 강동구'))].sort());
    });
});

describe('🏘️ 채점기도 같은 원본', () => {
    it('🔴 픽커 알람 채점기가 지역 대조를 shared regionMatch 에서 가져온다 — 사본 regionHit 이 없다', () => {
        const grader = readFileSync(join(__dirname, '../../../../onedal-sim/scripts/pickerAlarmGrade.mjs'), 'utf8');
        expect(grader).toContain("from '../../onedal-web/shared/src/regionMatch.ts'");
        expect(grader).not.toMatch(/function regionHit\(/);
        expect(grader).toMatch(/dongTokenMatch\(dropoff, \[\.\.\.keys, \.\.\.\(f\.cityAliases \?\? \[\]\)\], f\.dongSigungu \?\? \{\}\)/);
    });
});
