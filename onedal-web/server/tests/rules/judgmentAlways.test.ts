import { readFileSync } from 'fs';
import { join } from 'path';
import { judge, CRITERIA, toSnapshot, DEFAULT_JUDGMENT } from '@onedal/shared';
import { firstLoadFacts } from '../../src/core/engine/judgeFacts';

/**
 * 🎨 **판정 없이 끝나는 심사는 없다** (2026-09-14 폰 시험 · 버그 대장 #123)
 *
 * 기사님: *"판정색은 서버로그에 있어야해. 없으면 문제야."*
 *
 * 18:28:09 · 18:28:56 · 18:29:34 — 픽커 «광주 초월읍» 상차 콜 세 건이 좌표를 못 찾자
 * 서버 판정기가 **판정 함수를 부르지 않고** «상차지 주소를 찾지 못했습니다» 이유만 남기고 끝났다.
 * 서버 로그에 `🎨 [판정]` 줄이 없고, 장부(`order_judgments`)에도 없고, 관제웹은 «카카오 연산 실패»뿐이었다.
 *
 * 설계는 이미 정해져 있었다 — `onedal-web/shared/src/criteria.ts` 머리 표:
 * «주소 못 찾음 · 카카오 실패 · API 키 없음 → **잴 수 없음** (🔴)». 코드가 그 길을 안 탔다.
 *
 * 클래스: 「판단이 한쪽 경로에만 있다」 — 판정을 **성공 갈래 안에서만** 만들었다.
 * → 구조: 관제웹에 보내기 직전 **한 곳**에서 «판정이 없으면 잴 수 없음 판정»을 남긴다. 실패 갈래가 늘어도 빠지지 않는다.
 */

const SRC = join(__dirname, '../../src');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const evaluator = codeOnly(readFileSync(join(SRC, 'core/engine/OrderEvaluator.ts'), 'utf8'));

describe('판정 없이 끝나지 않는다 (#123)', () => {

    it('🔴 관제웹에 보내기 전 한 곳에서 — 판정이 없으면 잴 수 없음 판정을 남기고 로그에 적는다', () => {
        const emit = evaluator.indexOf('io.to(userId).emit("order-evaluated"');
        const fallback = evaluator.lastIndexOf('if (!(securedOrder as any).judgment)', emit);
        expect(emit).toBeGreaterThan(-1);
        expect(fallback).toBeGreaterThan(-1);
        const block = evaluator.slice(fallback, emit);
        expect(block).toMatch(/judge\(CRITERIA/);
        expect(block).toMatch(/OrderRepository\.saveJudgment\(/);
        expect(block).toMatch(/🎨 \[판정\]/);
    });

    it('좌표가 없어 걸린 시간을 모르면 — 🔴 · 점수 없음 · «잴 수 없음» 딱지 (관제웹이 «판단 불가»로 읽는 모양)', () => {
        const v = toSnapshot(judge(CRITERIA, firstLoadFacts({
            fare: 10_000, totalMinutes: null, excludedHits: [], pickupBackward: null, tags: ['판정 불가 — 후보콜의 상차지 주소를 찾지 못했습니다'],
        }), DEFAULT_JUDGMENT));
        expect(v.color).toBe('사고');
        expect(v.score).toBeNull();
        expect(v.tags.some(t => t.startsWith('잴 수 없음'))).toBe(true);
        expect(v.tags.some(t => t.includes('상차지 주소를 찾지 못했습니다'))).toBe(true);
    });
});
