import { readFileSync } from 'fs';
import { join } from 'path';
import { filterVersionOf } from '../../src/core/helpers';

const scrap = () => readFileSync(join(__dirname, '../../src/routes/scrap.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 🧭 **피기백 규격 v2** — 버전 게이트: 내용 해시가 같으면 필터 본문을 생략한다.
 *
 * 🔴 신호는 앱이 보내는 `filterVersion` 필드 하나다 — 없으면(구앱·scenario)
 *    늘 전부 보낸다. scenario 가 구프로토콜로 남아 호환을 상시 검증한다.
 * 📋 하차 목록은 v2 에도 줄이지 않는다 — 원달앱은 하차 목록만 보므로 빼면 그 동으로 가는 콜이 막힌다
 *    (행동 검사는 `appFilterOf.test.ts` «상차 목록 · 하차 목록 두 모음»).
 */
describe('filterVersionOf — 내용 해시 (카운터가 아니다, 규칙 ③)', () => {
    it('같은 내용이면 같은 버전 — 요청마다 흔들리지 않는다', () => {
        const f = { destinationKeywords: ['금촌동'], isActive: true };
        expect(filterVersionOf(f)).toBe(filterVersionOf({ ...f }));
    });

    it('🔴 한 칸이라도 바뀌면 버전이 바뀐다 — 낡은 필터로 콜을 잡지 않는다', () => {
        const f = { destinationKeywords: ['금촌동'], isActive: true };
        expect(filterVersionOf(f)).not.toBe(filterVersionOf({ ...f, isActive: false }));
        expect(filterVersionOf(f)).not.toBe(filterVersionOf({ ...f, destinationKeywords: ['문산읍'] }));
    });
});

describe('보고 응답에는 필터 · 결재가 없다 — 관제앱 공급 한 길 (reviews/50 ①-5)', () => {
    it('🔴 보고 문은 필터 본문 · 판 게이트 · 결재 · 빨리 접기를 싣지 않는다', () => {
        for (const gone of ['dispatchEngineArgs', 'speaksV2', 'piggybackDecision', 'foldAfter', 'responseFilter']) expect(scrap()).not.toContain(gone);
    });

    it('🔴 공급도 하차 목록을 줄이지 않는다 — 걸러 낸 목록으로 갈아 끼우지 않는다', () => {
        const supply = readFileSync(join(__dirname, '../../src/state/phoneSupply.ts'), 'utf8');
        expect(supply).not.toMatch(/destinationKeywords:[^\n]*\n?[^\n]*\.filter\(/);
    });

    it('빈 필터 고장 검사(callFilterBlocker)는 공급 필터를 만드는 한 곳(appFilterOf)에 있다', () => {
        expect(readFileSync(join(__dirname, '../../src/state/appFilter.ts'), 'utf8')).toContain('callFilterBlocker(');
    });
});
