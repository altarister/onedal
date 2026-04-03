import { io } from "socket.io-client";

// 브라우저 탭 당 단 1개의 소켓 파이프를 유지 (싱글톤)
// React 18 StrictMode 더블 마운트나 여러 컴포넌트 마운트에 의한 소켓 중복 생성을 막음
export const socket = io({ 
    transports: ["websocket"],
    // 너무 잦은 재접속 시도 방지 등 옵션 가능
});
