import type { ContentKind, JoinState } from '../lib/joinFlow';

/**
 * 📝 **가입 · 탈퇴 · 페이지 글 — 서버 문은 아직 없다** (reviews/29 2단계 · 서버 문 `/api/join` 은 ab 가 만든다).
 *    화면(`pages/Join*` · `Pending` · `Withdraw` · `Terms`)은 **이 파일만** 부른다 — 서버가 생기면 이 세 함수만 채운다.
 *    🔴 지금은 목업이다: 보내지 않고 바로 끝난 것으로 돌려준다. 글은 빈 글이다.
 */

export async function submitJoin(_state: JoinState): Promise<{ ok: true }> {
    return { ok: true };
}

export async function submitWithdraw(): Promise<{ ok: true }> {
    return { ok: true };
}

/** 운영센터 «페이지 글»에서 적은 글 — 비어 있으면 화면이 «(글 자리 — 운영센터에서 적습니다)»를 보인다 */
export async function fetchContents(_kind: ContentKind): Promise<{ title: string; body: string; version: number } | null> {
    return null;
}
