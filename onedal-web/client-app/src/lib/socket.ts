import { io } from "socket.io-client";

// Vite proxy 환경 또는 프로덕션 URL 확인 (ex: http://localhost:4000)
const envURL = import.meta.env.VITE_API_URL;
const baseURL = envURL ? envURL.replace('/api', '') : undefined;

// 브라우저 탭 당 단 1개의 소켓 파이프를 유지 (싱글톤)
// React 18 StrictMode 더블 마운트나 여러 컴포넌트 마운트에 의한 소켓 중복 생성을 막음
export const socket = io(baseURL || undefined, { 
    transports: ["websocket"],
    auth: (cb) => {
        const token = localStorage.getItem("access_token");
        cb({ token });
    }
});

