import { IAppPlugin } from '../IAppPlugin';

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

    /** 🚫 콜 한 벌의 글 — 상세 팝업 글이 곧 콜 글이다(잔상 보고 없음) */
    callTextOf(rawText: string): string {
        return rawText;
    }

    evaluateCustomRules(rawText: string): string[] {
        const reasons: string[] = [];
        // 화물24 전용 룰 예시
        // if (rawText.includes("수작업")) reasons.push("수작업 오더 (화물24 룰)");
        return reasons;
    }
}
