import { IAppPlugin, AdjustedPricing } from '../IAppPlugin';

export class InsungPlugin implements IAppPlugin {
    readonly appId = 'insung';

    normalizeAddress(rawAddress: string): string {
        // 인성콜 주소 특징: 끝에 (건물명) 이 붙는 경우가 많음
        return rawAddress.replace(/\(.*?\)$/g, '').trim();
    }

    normalizePlaceName(rawName: string): string {
        // (주), 주식회사, 유한회사 등 제거
        return rawName.replace(/\(주\)|주식회사|유한회사|\s/g, '').trim();
    }

    applyPricingExceptions(actualFare: number, fairPrice: number, minAcceptable: number): AdjustedPricing {
        // 인성콜은 특별한 예외 없이 표준 요율을 따릅니다.
        return { adjustedFairPrice: fairPrice, adjustedMinAcceptable: minAcceptable };
    }

    evaluateCustomRules(rawText: string): string[] {
        const reasons: string[] = [];
        // 예: if (rawText.includes("착불")) reasons.push("착불 오더 (인성콜 룰)");
        return reasons;
    }
}
