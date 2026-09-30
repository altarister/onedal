import { AsyncLocalStorage } from "node:async_hooks";

/**
 * 🪪 **이 일이 누구의 일인가 — 로그 줄 끝 «@기사»** (reviews/29 1단계 J).
 *    기사가 둘이 되면 한 로그 파일에 두 기사의 줄이 섞인다. 요청(로그인 문 · 폰 문)과 소켓 이벤트가 그 흐름에 기사를 싣고,
 *    파일에 쓸 때 줄 끝에 붙인다. 타이머 콜백처럼 흐름 밖에서 찍힌 줄은 표시가 없다(받아들인다).
 * ⚠️ DB 를 읽지 않는다 — db.ts → fileLogger → 여기 순서라 DB 를 읽으면 서로를 부른다. 이름은 부르는 쪽이 넘긴다.
 */
export const logContext = new AsyncLocalStorage<{ who?: string }>();

export const whoNow = (): string | undefined => logContext.getStore()?.who;

/** 표시 이름 — «알타리(알타리)» 는 괄호 앞만 · 이름이 없으면 id 앞 6자 */
export const whoLabel = (name: string | null | undefined, id: string | null | undefined): string | undefined =>
    name?.split('(')[0].trim() || (id ? id.slice(0, 6) : undefined);

/** 지금 흐름(요청 하나)의 남은 일에 기사를 싣는다 — express 미들웨어 · 폰 문에서 */
export function enterLogWho(name: string | null | undefined, id: string | null | undefined): void {
    const who = whoLabel(name, id);
    if (who) logContext.enterWith({ who });
}
