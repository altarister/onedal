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
        socket.on('handler-error', onError);
        return () => { socket.off('handler-error', onError); };
    }, []);

    const dismiss = (at: number) => setErrors(prev => prev.filter(e => e.at !== at));
    return { errors, dismiss };
}
