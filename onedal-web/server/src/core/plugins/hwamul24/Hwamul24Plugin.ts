import { IAppPlugin, AdjustedPricing } from '../IAppPlugin';

export class Hwamul24Plugin implements IAppPlugin {
    readonly appId = 'hwamul24';

    normalizeAddress(rawAddress: string): string {
        // 화물24 주소 특징: 콤마 뒤에 상세 주소가 붙는 경우가 많으므로 날림
        return rawAddress.split(',')[0].trim();
    }

    normalizePlaceName(rawName: string): string {
        // 대괄호 [ ] 등 제거
        return rawName.replace(/\[.*?\]/g, '').trim();
    }

    applyPricingExceptions(actualFare: number, fairPrice: number, minAcceptable: number): AdjustedPricing {
        // 화물24는 수수료가 이미 공제된 금액이라 가정할 경우 보정치 1.15 곱함
        return { 
            adjustedFairPrice: fairPrice * 1.15,
            adjustedMinAcceptable: minAcceptable * 1.15 
        };
    }

    evaluateCustomRules(rawText: string): string[] {
        const reasons: string[] = [];
        // 화물24 전용 룰 예시
        // if (rawText.includes("수작업")) reasons.push("수작업 오더 (화물24 룰)");
        return reasons;
    }
}
