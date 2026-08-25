import { io } from "socket.io-client";

// 🎯 주소를 정하는 곳은 `serverTarget` 하나다 — apiClient 와 같은 값을 본다 (규칙 ③)
import { socketBase } from "./serverTarget";
const baseURL = socketBase();

// 브라우저 탭 당 단 1개의 소켓 파이프를 유지 (싱글톤)
// React 18 StrictMode 더블 마운트나 여러 컴포넌트 마운트에 의한 소켓 중복 생성을 막음
export const socket = io(baseURL || undefined, { 
    transports: ["websocket"],
    auth: (cb) => {
        const token = localStorage.getItem("access_token");
        cb({ token });
    }
});

