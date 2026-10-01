/**
 * 다중 콜 어플리케이션(인성콜, 화물24 등)의 상이한 
 * 주소 포맷, 필터 룰을 정규화하는 플러그인 인터페이스입니다.
 */
export interface IAppPlugin {
    readonly appId: string;

    /**
     * 앱마다 다른 동/호수 표기법이나 괄호를 카카오 API가 인식할 수 있도록 정규화합니다.
     */
    normalizeAddress(rawAddress: string): string;

    /**
     * 앱 고유의 '블랙리스트 텍스트'나 특수 룰을 검사합니다.
     */
    evaluateCustomRules(rawText: string): string[];
}
