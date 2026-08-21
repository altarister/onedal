import { readFileSync } from 'fs';
import { join } from 'path';
import { filterVersionOf } from '../../src/core/helpers';

const scrap = () => readFileSync(join(__dirname, '../../src/routes/scrap.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 🧭 **피기백 규격 v2** (기사님 확정 2026-08-22 — "같은 목록을 왜 두 번 보내나")
 *
 * 실측: 대기 상태 응답 4.0KB 중 destinationKeywords(1.06KB)와 progressKm(1.96KB)의
 * **키 집합이 동일**했고(buildAppProgressKm 이 키워드를 순회해 만든다), 필터가 안
 * 바뀌어도 매 5초 전부 재전송됐다.
 *
 *   ① 중복 제거 — 신앱은 도착 목록을 `키워드 ∪ progressKm 키` 로 합친다.
 *      서버는 progressKm 에 실린 동을 키워드에서 뺀다
 *   ② 버전 게이트 — 내용 해시가 같으면 필터 본문을 생략한다
 *
 * 🔴 신호는 앱이 보내는 `filterVersion` 필드 하나다 — 없으면(구앱·scenario)
 *    지금 그대로 전부 보낸다. scenario 가 구프로토콜로 남아 호환을 상시 검증한다.
 */
describe('filterVersionOf — 내용 해시 (카운터가 아니다, 규칙 ③)', () => {
    it('같은 내용이면 같은 버전 — 요청마다 흔들리지 않는다', () => {
        const f = { destinationKeywords: ['금촌동'], isActive: true, progressKm: {} };
        expect(filterVersionOf(f)).toBe(filterVersionOf({ ...f }));
    });

    it('🔴 한 칸이라도 바뀌면 버전이 바뀐다 — 낡은 필터로 콜을 잡지 않는다', () => {
        const f = { destinationKeywords: ['금촌동'], isActive: true };
        expect(filterVersionOf(f)).not.toBe(filterVersionOf({ ...f, isActive: false }));
        expect(filterVersionOf(f)).not.toBe(filterVersionOf({ ...f, destinationKeywords: ['문산읍'] }));
    });
});

describe('scrap 응답 — v2 게이트의 배선', () => {
    it('🔴 v2 신호는 filterVersion 필드의 존재다 — 구앱(필드 없음)에는 전부 보낸다', () => {
        expect(scrap()).toMatch(/hasOwnProperty\.call\(req\.body, 'filterVersion'\)/);
    });

    it('🔴 progressKm 에 실린 동을 키워드에서 뺀다 (중복 제거)', () => {
        expect(scrap()).toMatch(/\.filter\(\(k: string\) => !\(k in progressKeys\)\)/);
    });

    it('🔴 버전이 같으면 본문을 생략한다 — 앱은 저장본을 유지한다', () => {
        expect(scrap()).toMatch(/req\.body\.filterVersion === filterVersion\) responseFilter = undefined/);
    });

    it('빈 필터 고장 검사(callFilterBlocker)는 중복 제거 전 원본 기준이다', () => {
        const s = scrap();
        // callFilterBlocker 호출이 speaksV2 블록보다 앞에 있어야 한다
        expect(s.indexOf('callFilterBlocker(')).toBeLessThan(s.indexOf('speaksV2'));
    });
});
