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



