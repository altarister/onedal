import { IAppPlugin } from '../IAppPlugin';

export class Hwamul24Plugin implements IAppPlugin {
    readonly appId = 'hwamul24';

    normalizeAddress(rawAddress: string): string {
        // 화물24 주소 특징: 콤마 뒤에 상세 주소가 붙는 경우가 많으므로 날림
        return rawAddress.split(',')[0].trim();
    }

    evaluateCustomRules(rawText: string): string[] {
        const reasons: string[] = [];
        // 화물24 전용 룰 예시
        // if (rawText.includes("수작업")) reasons.push("수작업 오더 (화물24 룰)");
        return reasons;
    }
}
