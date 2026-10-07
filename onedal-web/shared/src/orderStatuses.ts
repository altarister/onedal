import type { OrderStatus } from './index';

/**
 * 🔙 **잡았다가 무른 콜 — 안전취소 · 방출 둘. 원천은 여기 하나**.
 *    종결 목록(`TERMINAL_STATUSES`) · 복귀콜 셈 · 서버 장부의 취소 시각 · 시뮬 채점이 이것을 파생해 쓴다 — 새 종결 상태가 생기면 여기에만 더한다.
 *    작은 파일에 두는 까닭: shared 안 파일이 `./index` 에서 런타임 값을 가져오면 부팅 순서에 따라 «초기화 전 접근»으로 멈춘다(shared CLAUDE 함정).
 */
export const LET_GO_STATUSES = ['SAFE_CANCEL', 'ORDER_RELEASED_BY_ME', 'ORDER_RELEASED_BY_OFFICE'] as const satisfies readonly OrderStatus[];
export type LetGoStatus = typeof LET_GO_STATUSES[number];

/** 🔙 **잡았다가 무른 콜인가** — «잡은 콜» 수에서 따로 센다 (운영센터 «오늘 판정받은 콜») */
export function isLetGoStatus(status: string | null | undefined): boolean {
    return (LET_GO_STATUSES as readonly string[]).includes(status ?? '');
}
