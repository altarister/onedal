import { IAppPlugin } from '../IAppPlugin';

export class InsungPlugin implements IAppPlugin {
    readonly appId = 'insung';

    normalizeAddress(rawAddress: string): string {
        // 인성콜 주소 특징: 끝에 (건물명) 이 붙는 경우가 많음
        return rawAddress.replace(/\(.*?\)$/g, '').trim();
    }

    evaluateCustomRules(rawText: string): string[] {
        const reasons: string[] = [];
        // 예: if (rawText.includes("착불")) reasons.push("착불 오더 (인성콜 룰)");
        return reasons;
    }
}
