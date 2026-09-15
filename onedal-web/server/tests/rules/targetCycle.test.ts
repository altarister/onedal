import { readFileSync } from "fs";
import { join } from "path";
import { decideTargetAfterDelivery, HOME_RADIUS_KM } from "@onedal/shared";

/**
 * 🧭 타겟 자동 순환 규칙 (근거: docs/기록/결정_이력.md «타겟은 사이클이 끝나면 저절로 넘어간다» ·
 *    docs/지금/필터.md «복귀 켬 — 규칙 ⑤-4 의 다섯» · 버그 대장 #130 · #131)
 * 노선 끝→복귀 (집 근처면 유지) · 🔴 복귀는 **마지막 복귀콜을 집 가까이 내렸을 때만** 끈다 — 쥔 콜 0건으로 끄지 않는다.
 */

const SRC = join(__dirname, "../../src");
const codeOnly = (s: string) => readFileSync(join(SRC, s), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const near = HOME_RADIUS_KM;
const far = HOME_RADIUS_KM + 10;
const base = { remainingCount: 0, distToHomeKm: far, deliveredHomeCall: false, homeCallsInProgress: 0 };

describe('노선 끝 — 순수 함수 (L2)', () => {
    it('노선(DEST) 콜을 다 내렸고 집이 멀다 → 복귀 제안', () => {
        expect(decideTargetAfterDelivery({ ...base, current: 'DEST' })).toBe('HOME');
    });
    it('노선 콜이 아직 남았다 → 전환 없음', () => {
        expect(decideTargetAfterDelivery({ ...base, current: 'DEST', remainingCount: 1 })).toBeNull();
    });
    it('노선 끝 · 이미 집 근처 → 전환 없음 — 복귀가 무의미하다', () => {
        expect(decideTargetAfterDelivery({ ...base, current: 'DEST', distToHomeKm: near })).toBeNull();
    });
    it('🔴 집까지 거리를 모르면 전환하지 않는다 — 지어내지 않는다', () => {
        expect(decideTargetAfterDelivery({ ...base, current: 'DEST', distToHomeKm: null })).toBeNull();
        expect(decideTargetAfterDelivery({ ...base, current: 'HOME', distToHomeKm: null, deliveredHomeCall: true })).toBeNull();
    });
    it('타겟을 모르면 노선으로 취급', () => {
        expect(decideTargetAfterDelivery({ ...base, current: undefined })).toBe('HOME');
    });
});

describe('🔴 복귀 끝 — 마지막 복귀콜을 집 가까이 내렸을 때만 (L2 · #131)', () => {
    it('복귀콜을 집 가까이 내렸고 남은 복귀콜이 없다 → 노선으로', () => {
        expect(decideTargetAfterDelivery({ ...base, current: 'HOME', distToHomeKm: near, deliveredHomeCall: true })).toBe('DEST');
    });
    it('🔴 복귀 켬 · 목적지 콜만 내려 0건 → 유지 — 2026-09-15 02:03:27 B1·B3 자리 (#130)', () => {
        expect(decideTargetAfterDelivery({ ...base, current: 'HOME', distToHomeKm: 17.4, deliveredHomeCall: false })).toBeNull();
    });
    it('🔴 복귀콜 3개 중 첫 콜을 가는 길 중간에 내려 0건 → 유지 — 둘째를 아직 못 잡았다', () => {
        expect(decideTargetAfterDelivery({ ...base, current: 'HOME', distToHomeKm: far, deliveredHomeCall: true })).toBeNull();
    });
    it('집 가까이 내렸어도 다른 복귀콜이 남았다 → 유지', () => {
        expect(decideTargetAfterDelivery({ ...base, current: 'HOME', distToHomeKm: near, deliveredHomeCall: true, homeCallsInProgress: 1, remainingCount: 1 })).toBeNull();
    });
    it('집 가까이 목적지 콜을 내렸다(복귀콜 아님) → 유지', () => {
        expect(decideTargetAfterDelivery({ ...base, current: 'HOME', distToHomeKm: near, deliveredHomeCall: false })).toBeNull();
    });
});

describe('배선 구조 (L1 — 코드 모양)', () => {
    const en = codeOnly('services/dispatchEngine.ts');
    const call = en.indexOf('decideTargetAfterDelivery({');

    it("🔴 자동 순환은 DELIVERED 처리부 한 곳에만 있다 — 취소·방출로 0건이 된 것은 무산이지 완료가 아니다", () => {
        expect(en.match(/decideTargetAfterDelivery\(/g)?.length).toBe(1);
        expect(codeOnly('state/filterManager.ts')).not.toMatch(/decideTargetAfterDelivery/);
        expect(codeOnly('socket/socketHandlers.ts')).not.toMatch(/decideTargetAfterDelivery/);
    });

    it('🔴 «쥔 콜 0건»이 자동 순환을 감싸지 않는다 — 복귀 끝은 0건이 아니라 복귀콜 하차로 안다 (#131)', () => {
        expect(call).toBeGreaterThan(-1);
        expect(en.slice(Math.max(0, call - 600), call)).not.toMatch(/if \(remaining\.length === 0\)/);
    });

    it('🔴 «복귀콜인가»는 목적지 계산과 같은 함수로 묻는다', () => {
        expect(en.slice(call, call + 500)).toMatch(/homeCallsOf\(session, userId,/);
    });

    it('🔴 전환은 setCallTarget 한 길 — 자동은 by=auto · 기사님 버튼은 by=driver 로 기록된다', () => {
        expect(en.slice(call, call + 900)).toMatch(/setCallTarget\(userId, next, io, 'auto'\)/);
        expect(codeOnly('socket/socketHandlers.ts')).toMatch(/setCallTarget\(userId, data\?\.phase \?\? 'DEST', io, 'driver'\)/);
    });

    it('🔴 복귀를 켜고 끄면 바로 하차 · 상차 목록을 다시 만든다 — 켠 시각을 적은 뒤 (#146)', () => {
        /* 2026-09-15 15:47:09 복귀를 껐는데 목록이 서버 재시작(15:49:20)까지 옛 «이천 ∪ 광주»였다 — 지도에도 광주 원이 남았다 */
        const start = en.indexOf('export async function setCallTarget(');
        expect(start).toBeGreaterThan(-1);
        const body = en.slice(start, en.indexOf('\n}', start));
        const rec = body.indexOf('recordCallTarget(');
        expect(rec).toBeGreaterThan(-1);
        /* «복귀콜을 잡았나»가 켠 시각(call_target_events)을 읽으니 적은 뒤에 만든다 */
        expect(body.indexOf('rebuildNetFilter(userId, io)')).toBeGreaterThan(rec);
    });
});
