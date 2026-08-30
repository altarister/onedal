import { IAppPlugin, AdjustedPricing } from '../IAppPlugin';

/**
 * 🌐 카카오T픽커 플러그인 — **수집 전용 1차** (기사님 확정 2026-08-30 · docs/지금/픽커_수집.md)
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

    evaluateCustomRules(_rawText: string): string[] {
        return [];
    }
}
