import { IAppPlugin } from '../IAppPlugin';

/**
 * 🌐 카카오T픽커 플러그인 — **수집 전용 1차** (기사님 확정)
 *
 * 픽커 주소는 앱이 이미 «구 동» 두 토큰으로 정리해 보낸다 (네이티브 트리 실측) —
 * 인성처럼 괄호·법인명이 안 붙어서 정규화가 사실상 통과다. 이 플러그인의 일은 주소 정리다
 * (콜 한 벌의 글 범위는 shared 정의 표의 `callText`).
 */
export class KakaoPickerPlugin implements IAppPlugin {
    readonly appId = 'kakaopicker';

    normalizeAddress(rawAddress: string): string {
        return rawAddress.trim();
    }

    evaluateCustomRules(_rawText: string): string[] {
        return [];
    }
}
