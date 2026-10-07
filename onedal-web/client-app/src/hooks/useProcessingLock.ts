import { useState, useEffect } from 'react';
import { socket } from '../lib/socket';

type SocketLike = { on(ev: string, h: (p: any) => void): unknown; off(ev: string, h: (p: any) => void): unknown };

/**
 * 🔓 **결재가 실패로 돌아오면 잠금을 푼다** — 결재 응답 실패(`decision-ack` success:false) · 처리 실패(`handler-error` event:'decision').
 * 실패면 콜 자료가 그대로라 «자료가 바뀌면 푼다»가 안 돈다 — 안 풀면 KEEP · 거절이 다시 안 눌린다.
 * @returns 듣기를 끊는 함수
 */
export function listenDecisionFailure(s: SocketLike, onUnlock: () => void): () => void {
    const onAck = (r: { success?: boolean }) => { if (r?.success === false) onUnlock(); };
    const onError = (e: { event?: string }) => { if (e?.event === 'decision') onUnlock(); };
    s.on('decision-ack', onAck);
    s.on('handler-error', onError);
    return () => {
        s.off('decision-ack', onAck);
        s.off('handler-error', onError);
    };
}

/**
 * 🪧 **결재 처리 중인 콜 — 두 번 눌리는 것을 막는 잠금 하나** (목록 `PinnedRoute` · 판정석 `StageView` 가 같이 쓴다 · D3 P6-02).
 * 푸는 때: [resetKey](그 자리 콜 자료)가 바뀔 때 · 결재가 실패로 돌아올 때.
 */
export function useProcessingLock(resetKey: unknown) {
    const [processingId, setProcessingId] = useState<string | null>(null);
    // 서버 통신 완료 시 (상태가 변하거나 삭제될 때) 로딩 상태 즉각 해제
    useEffect(() => { setProcessingId(null); }, [resetKey]);
    useEffect(() => listenDecisionFailure(socket, () => setProcessingId(null)), []);
    return [processingId, setProcessingId] as const;
}
