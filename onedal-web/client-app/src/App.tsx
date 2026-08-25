import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import { ServerSwitch } from './components/ServerSwitch'
import { useEffect } from "react";
import Dashboard from "./pages/Dashboard";
import Settlement from "./pages/Settlement";
import Login from "./pages/Login";
import { logRoadmapEvent } from "./lib/roadmapLogger";
import { useAuth } from "./contexts/AuthContext";
import { useNativeLocation } from "./hooks/useNativeLocation";
import { useGpsTelemetry } from "./hooks/useGpsTelemetry";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center text-text-muted">
        <div className="w-8 h-8 border-4 border-info border-t-transparent rounded-full animate-spin mb-4"></div>
        <p>인증 정보를 확인 중입니다...</p>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

// Navigation Wrapper
function AppLayout() {
  const location = useLocation();

  // 네이티브 GPS 추적 시작 (앱: 고정밀 GPS, 브라우저: navigator.geolocation 폴백)
  useNativeLocation();
  // GPS 좌표 변경 시 서버에 소켓으로 텔레메트리 전송
  useGpsTelemetry();

  useEffect(() => {
    logRoadmapEvent("웹", "1DAL 웹(관제웹) 로그인됨");
  }, []);

  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settlement" element={<Settlement />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* 하단 네비게이션 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur-xl flex z-50 rounded-t-2xl shadow-[0_-4px_30px_rgba(0,0,0,0.08)]">
        <Link
          to="/"
          className={`flex-1 pt-3.5 pb-5 text-center font-black text-sm transition-colors relative ${location.pathname === "/" ? "text-info" : "text-text-muted"
            }`}
        >
          {location.pathname === "/" && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-info rounded-b-full" />}
          실시간
        </Link>
        <Link
          to="/settlement"
          className={`flex-1 pt-3.5 pb-5 text-center font-black text-sm transition-colors relative ${location.pathname === "/settlement" ? "text-info" : "text-text-muted"
            }`}
        >
          {location.pathname === "/settlement" && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-info rounded-b-full" />}
          정산
        </Link>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      {/* 🔊 볼륨 업 → 서버 고르기. **최상위에 둔다** — 어느 화면이든 열려야 한다.
          🔴 2026-08-25: 자동 삽입이 AuthGuard 의 «로딩 중» 분기에 붙어,
             로그인이 끝나면 컴포넌트 자체가 사라져 아무 반응이 없었다. */}
      <ServerSwitch />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route 
          path="/*" 
          element={
            <AuthGuard>
              <AppLayout />
            </AuthGuard>
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}
