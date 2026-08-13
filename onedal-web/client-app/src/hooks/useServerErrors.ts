import { useEffect, useState } from 'react';
import { socket } from '../lib/socket';

/**
 * [2026-08-10 전수조사] 서버가 보내는 오류를 화면에 띄운다.
 *
 * 🔴 서버는 `safeOn` 래퍼에서 핸들러 예외를 잡아 `handler-error` 로 돌려주고 있었는데,
 *    **관제탑이 그 이벤트를 아무도 듣고 있지 않았다.**
 *
 *    그래서 DB 컬럼이 없어 `save-cargo-report` 가 실패했을 때
 *    화면에서는 "통화 종료 저장을 눌렀는데 아무 일도 안 일어난다"로만 보였다.
 *    서버 콘솔에는 `🚨 [소켓 핸들러 실패]` 가 찍히고 있었는데도.
 *
 *    크래시를 막은 안전망이 오히려 원인을 감춘 셈이다.
 *    **조용한 실패는 실패한 줄도 모르게 만든다.**
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
         * ack 4종. 서버는 처리 결과를 돌려주는데 **아무도 듣지 않고 있었다.**
         * 화면은 낙관적으로만 그리고, 실패하면 1초 `sync-active-orders` 가 되돌려
         * "눌렀는데 되돌아갔다"로만 보였다. 왜 실패했는지는 아무도 몰랐다.
         */
        const ACK_EVENTS = ['decision-ack', 'recalculate-route-ack', 'hunt-phase-ack', 'milestone-result'] as const;
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
