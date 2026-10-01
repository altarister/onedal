import { io } from "socket.io-client";

// 🎯 주소를 정하는 곳은 `serverTarget` 하나다 — apiClient 와 같은 값을 본다 (규칙 ③)
import { socketBase } from "./serverTarget";
const baseURL = socketBase();

export function getClientSessionId(): string {
    let id = sessionStorage.getItem("1dal_client_session_id");
    if (!id) {
        id = "sess_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now().toString(36);
        sessionStorage.setItem("1dal_client_session_id", id);
    }
    return id;
}

export function getClientDeviceInfo(): string {
    if (typeof navigator === "undefined") return "웹 브라우저";
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) return "안드로이드 (" + (navigator.platform || "Mobile") + ")";
    if (/iphone|ipad|ipod/i.test(ua)) return "아이폰/아이패드";
    if (/mac/i.test(ua)) return "Mac 브라우저";
    if (/win/i.test(ua)) return "Windows PC";
    return "웹 브라우저";
}

// 브라우저 탭 당 단 1개의 소켓 파이프를 유지 (싱글톤)
// React 18 StrictMode 더블 마운트나 여러 컴포넌트 마운트에 의한 소켓 중복 생성을 막음
export const socket = io(baseURL || undefined, { 
    transports: ["websocket"],
    auth: (cb) => {
        const token = localStorage.getItem("access_token");
        const clientSessionId = getClientSessionId();
        const deviceInfo = getClientDeviceInfo();
        cb({ token, clientSessionId, deviceInfo });
    }
});

/**
 * 🔌 **닫혀 있으면 한 번 잇는다** — 서버가 막힌 계정(승인 전 · 정지 …)의 소켓을 거절하면 socket.io 는 스스로 다시 시도하지 않는다.
 *    그래서 «내 상태를 막 읽어 통과로 판정한 순간»(승인 대기 화면 · 멈춤 화면 · 관제 화면의 문지기)에만 부른다.
 *    🔴 붙어 있거나(connected) 스스로 다시 잇는 중(active)이면 아무것도 안 한다 — 붙은 소켓을 끊었다 잇지 않는다(운전 중 결재가 끊긴다).
 *    🔴 1초 고리 · 소켓 이벤트에서 부르지 않는다 — «다른 기기에서 접속»으로 서버가 끊은 소켓을 되살리면 세션 인계가 깨진다.
 */
export function ensureSocketConnected(): void {
    if (!socket.connected && !socket.active) socket.connect();
}
