import { IAppPlugin, AdjustedPricing } from '../IAppPlugin';

/**
 * 🌐 카카오T픽커 플러그인 — **수집 전용 1차** (기사님 확정)
 *
 * 픽커 주소는 앱이 이미 «구 동» 두 토큰으로 정리해 보낸다 (네이티브 트리 실측) —
 * 인성처럼 괄호·법인명이 안 붙어서 정규화가 사실상 통과다. 요율·룰 재조정도 없다:
 * 픽커는 판정을 안 타는 수집 전용이라 이 플러그인의 일은 intel 저장 전 정리뿐이다.
 */
export class KakaoPickerPlugin implements IAppPlugin {
    readonly appId = 'kakaopicker';

    normalizeAddress(rawAddress: string): string {
        return rawAddress.trim();
    }

    normalizePlaceName(rawName: string): string {
        return rawName.trim();
    }

    applyPricingExceptions(actualFare: number, fairPrice: number, minAcceptable: number): AdjustedPricing {
        // 수집 전용 — 판정을 안 타므로 재조정 없음. 잡기 시작하는 날 다시 본다
        return { adjustedFairPrice: fairPrice, adjustedMinAcceptable: minAcceptable };
    }

    /**
     * 🚫 픽커 상세의 콜 한 벌 — **마지막 «픽업지»부터 «넘기기»/«수락하기» 앞까지**(픽업지 · 물품 정보 · 유의사항).
     *    그 앞은 목록 잔상(«퀵 오더카드 대기 중...»), 뒤는 버튼 글자다. 유의사항·물품이 칸으로 안 와 화면 글을 통째로 버리지 않는다.
     *    «픽업지»가 없으면 콜 글을 못 믿으니 빈 글 — 주소·적요 칸만 본다.
     */
    callTextOf(rawText: string): string {
        const start = rawText.lastIndexOf('픽업지');
        if (start < 0) return '';
        const rest = rawText.slice(start);
        const end = rest.search(/넘기기|수락하기/);
        return (end < 0 ? rest : rest.slice(0, end)).trim();
    }

    evaluateCustomRules(_rawText: string): string[] {
        return [];
    }
}
