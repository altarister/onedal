import { useEffect, useState } from 'react';
import { socket } from '../lib/socket';

/**
 * 서버가 보내는 오류를 화면에 띄운다.
 *
 * 🔴 서버는 `safeOn` 래퍼에서 핸들러 예외를 잡아 `handler-error` 로 돌려준다. 관제웹이 이것을 안 들으면
 *    서버 쪽 실패(예: DB 컬럼이 없어 `save-cargo-report` 가 실패)가 화면에서
 *    «통화 종료 저장을 눌렀는데 아무 일도 안 일어난다»로만 보이고, 원인은 서버 콘솔에만 남는다.
 *    크래시를 막는 안전망이 원인을 감추지 않게 여기서 띄운다.
 */
export interface ServerError {
    event: string;
    message: string;
    at: number;
}

export function useServerErrors() {
    const [errors, setErrors] = useState<ServerError[]>([]);

    useEffect(() => {
        const onError = (e: { event: string; message: string }) => {
            console.error(`🚨 [서버 오류] ${e.event}: ${e.message}`);
            setErrors(prev => [{ ...e, at: Date.now() }, ...prev].slice(0, 5));
        };
        /**
         * ack 4종 — 서버가 돌려주는 처리 결과를 듣는다. 안 들으면 화면은 낙관적으로만 그리고,
         * 실패하면 1초 `sync-active-orders` 가 되돌려 "눌렀는데 되돌아갔다"로만 보이고 까닭은 안 남는다.
         */
        const ACK_EVENTS = ['decision-ack', 'recalculate-route-ack', 'call-target-ack', 'milestone-result'] as const;
        const ackHandlers = ACK_EVENTS.map(ev => {
            const h = (r: { success?: boolean; msg?: string; reason?: string; duplicated?: boolean }) => {
                if (r?.success === false) {
                    onError({ event: ev, message: r.msg || r.reason || '알 수 없는 이유로 실패했습니다' });
                }
                // duplicated 는 오류가 아니다 (같은 보고를 두 번 누른 정상 상황)
            };
            socket.on(ev, h);
            return [ev, h] as const;
        });

        socket.on('handler-error', onError);
        return () => {
            socket.off('handler-error', onError);
            ackHandlers.forEach(([ev, h]) => socket.off(ev, h));
        };
    }, []);

    const dismiss = (at: number) => setErrors(prev => prev.filter(e => e.at !== at));
    return { errors, dismiss };
}
