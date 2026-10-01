import { IAppPlugin } from '../IAppPlugin';

export class InsungPlugin implements IAppPlugin {
    readonly appId = 'insung';

    normalizeAddress(rawAddress: string): string {
        // 인성콜 주소 특징: 끝에 (건물명) 이 붙는 경우가 많음
        return rawAddress.replace(/\(.*?\)$/g, '').trim();
    }

    /** 🚫 콜 한 벌의 글 — 상세 팝업 글이 곧 콜 글이다(잔상 보고 없음) */
    callTextOf(rawText: string): string {
        return rawText;
    }

    evaluateCustomRules(rawText: string): string[] {
        const reasons: string[] = [];
        // 예: if (rawText.includes("착불")) reasons.push("착불 오더 (인성콜 룰)");
        return reasons;
    }
}
