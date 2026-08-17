import { readFileSync } from "fs";
import { join } from "path";

/**
 * 🔴 경로 재탐색(지도 추천/시간/거리)은 **두 기억을 함께 갱신한다** (2026-08-17 실측 사고).
 *
 * 재계산이 pendingOrdersData 사본에만 새 폴리라인을 쓰면:
 * 지도는 남양주 우회를 그리는데 경유 재계산은 myOrders 의 옛(서울 통과) 폴리라인을 읽어
 * 지역이 안 바뀌고 — filter-updated 는 "변화 없음"으로 침묵해 앱이 옛 동네로 계속 거른다.
 */
const codeOnly = (s: string) => readFileSync(join(__dirname, "../../src", s), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('경로 재탐색 — 두 기억 동시 갱신', () => {
    const en = codeOnly('services/dispatchEngine.ts');
    const fn = en.slice(en.indexOf('export async function recalculateKakaoRoute'));

    it('🔴 단독 재계산이 myOrders 쌍둥이에도 경로를 쓴다', () => {
        const solo = fn.slice(0, fn.indexOf('} else {'));
        expect(solo).toMatch(/applySoloRoute\(securedOrder, result\)/);
        expect(solo).toMatch(/myOrders\.find\(c => c\.id === orderId\)/);
        expect(solo).toMatch(/applySoloRoute\(activeTwin as any, result\)/);
    });

    it('재탐색 문구(kakaoTimeExt)도 쌍둥이에 반영 — 주기 sync 가 옛 문구로 되돌리지 않게', () => {
        expect(fn).toMatch(/twin\.kakaoTimeExt = timeExt/);
    });

    it('활성 콜이면 경유 필터를 다시 파생시킨다 (syncDetourFilter)', () => {
        expect(fn).toMatch(/getActiveCalls\(session\)\.some\(c => c\.id === securedOrder\.id\)[\s\S]{0,80}syncDetourFilter\(userId, io\)/);
    });
});
