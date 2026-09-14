import { readFileSync } from "fs";
import { join } from "path";
import { decideNextTargetAfterCycle, HOME_RADIUS_KM } from "@onedal/shared";

/**
 * 🧭 타겟 자동 순환 규칙 (근거: docs/기록/결정_이력.md «타겟은 사이클이 끝나면.md)
 * 노선 끝→복귀 (집 근처면 유지) · 관내 끝→복귀 · 복귀 끝→노선 · 자동은 제안일 뿐.
 */

const SRC = join(__dirname, "../../src");
const codeOnly = (s: string) => readFileSync(join(SRC, s), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('순환 판정 — 순수 함수 (L2)', () => {
    it('노선(DEST) 끝 · 집이 멀다 → 복귀 제안', () => {
        expect(decideNextTargetAfterCycle('DEST', HOME_RADIUS_KM + 1, false)).toBe('HOME');
    });
    it('노선 끝 · 이미 집 근처(5km 안) → 전환 없음 — 복귀가 무의미하다', () => {
        expect(decideNextTargetAfterCycle('DEST', HOME_RADIUS_KM, false)).toBeNull();
        expect(decideNextTargetAfterCycle('DEST', 0.3, false)).toBeNull();
    });
    it('🔴 집까지 거리를 모르면 전환하지 않는다 — 지어내지 않는다', () => {
        expect(decideNextTargetAfterCycle('DEST', null, false)).toBeNull();
        expect(decideNextTargetAfterCycle('LOCAL', null, false)).toBeNull();
    });
    it('관내(LOCAL) 끝 → 복귀 제안 (시간 채우기 뒤 귀가)', () => {
        expect(decideNextTargetAfterCycle('LOCAL', 20, false)).toBe('HOME');
    });
    it('복귀(HOME) 끝 → 노선으로 — 복귀콜을 싣고 끝났으면 거리 몰라도 성립 (집에 온 것이 사실이므로)', () => {
        expect(decideNextTargetAfterCycle('HOME', null, true)).toBe('DEST');
        expect(decideNextTargetAfterCycle('HOME', 1, true)).toBe('DEST');
    });
    it('🔴 복귀를 켰는데 복귀콜 없이 끝났다 → 복귀를 유지한다 — 목적지 콜만 내려놓은 것은 복귀가 끝난 게 아니다 (#130)', () => {
        /* 2026-09-15 이천 왕복 02:03:27 — C1 에서 복귀를 켜고 B1·B3(이천 콜) 하차가 끝나자 HOME → DEST 로 꺼져,
           C3 복귀콜이 «이천시» 판으로 찍히고 D3(곤지암읍)이 막혔다 */
        expect(decideNextTargetAfterCycle('HOME', 17.4, false)).toBeNull();
        expect(decideNextTargetAfterCycle('HOME', null, false)).toBeNull();
    });
    it('타겟을 모르면 노선으로 취급 (안전 기본값과 같은 결)', () => {
        expect(decideNextTargetAfterCycle(undefined, 20, false)).toBe('HOME');
    });
});

describe('배선 구조 (L1 — 코드 모양)', () => {
    const en = codeOnly('services/dispatchEngine.ts');

    it("🔴 자동 순환은 DELIVERED 처리부에만 있다 — 취소·방출로 0건이 된 것은 무산이지 완료가 아니다", () => {
        // decideNextTargetAfterCycle 호출은 dispatchEngine 한 곳
        expect(en.match(/decideNextTargetAfterCycle\(/g)?.length).toBe(1);
        // STANDBY 복귀 불변식(filterManager)에는 없다
        expect(codeOnly('state/filterManager.ts')).not.toMatch(/decideNextTargetAfterCycle/);
    });

    it('🔴 전환은 setCallTarget 한 길로만 간다 — 파생을 손으로 만들지 않는다', () => {
        const block = en.slice(en.indexOf('decideNextTargetAfterCycle(session'));   // 호출부 (import 줄이 아니라)
        expect(block.slice(0, 600)).toMatch(/setCallTarget\(userId, next, io\)/);
    });

    it('🔴 «복귀콜을 잡았나»는 목적지 계산과 같은 함수로 묻는다 — 두 곳이 다른 답을 내지 않게 (#130)', () => {
        const block = en.slice(en.indexOf('decideNextTargetAfterCycle(session'));
        expect(block.slice(0, 200)).toMatch(/homeCallCaught\(session, userId\)/);
        const fm = codeOnly('state/filterManager.ts');
        expect(fm).toMatch(/export function homeCallCaught\(/);
        const goals = fm.slice(fm.indexOf('export function goalCitiesOf'), fm.indexOf('export function goalCitiesOf') + 700);
        expect(goals).toMatch(/homeCallCaught\(session, userId\)/);
    });

    it('스와이프가 자동을 이긴다 — set-call-target 핸들러에 자동 전환 가드가 없다', () => {
        expect(codeOnly('socket/socketHandlers.ts')).not.toMatch(/decideNextTargetAfterCycle/);
    });
});
