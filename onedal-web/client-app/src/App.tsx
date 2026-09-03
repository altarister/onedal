import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import { ServerSwitch } from './components/ServerSwitch'
import { useState, useEffect } from "react";
import Dashboard from "./pages/Dashboard";
import Navi from "./pages/Navi";
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
  // 🎭 무대 토글 즉시 반영 — localStorage 만 읽으면 다음 렌더까지 옛 값이 남는다
  const [stageOn, setStageOn] = useState(() => localStorage.getItem('stagePreview') === '1');
  useEffect(() => {
    const on = () => setStageOn(localStorage.getItem('stagePreview') === '1');
    window.addEventListener('stage-preview-changed', on);
    return () => window.removeEventListener('stage-preview-changed', on);
  }, []);

  /**
   * 🧭 **내비 화면(`/navi`)에서는 위치를 안 보낸다** (기사님 지적 2026-09-03).
   *
   * 기사님: *"관제가 2개 열리면 안된다고 한것 같은데."* — 맞다. 개인 폰(아이폰)에서
   * 이 웹을 열면 **관제폰과 좌표가 한 차량으로 섞인다.** 서버는 두 위치를 오가는 것으로
   * 보고 「위치 점프」를 찍으며, 도착·지나침 판정이 통째로 흔들린다.
   *
   * 🔴 훅을 라우트 안으로 내리는 것이 더 정직하지만, 그러면 관제 화면의 GPS 시작 시점이
   *    바뀐다. **가장 단순한 길**로 여기서 끈다 (기사님 «가장 간단한걸로 하자»).
   *    `naviGpsOff.test.ts` 가 이 한 줄이 사라지는 것을 막는다.
   */
  const naviOnly = location.pathname.startsWith('/navi');
  /**
   * 🟢 **위치는 «쓰되 보내지 않는다».** 개인 폰도 차 안에 있으니 좌표는 같다 —
   *    그 좌표로 «지금 여기서 출발»하는 링크를 만든다. 서버로 **안 보내므로** 관제폰과
   *    섞이지 않는다. 보내는 자리는 `useGpsTelemetry` 하나뿐이라 그것만 끄면 된다.
   */
  useNativeLocation();
  // GPS 좌표 변경 시 서버에 소켓으로 텔레메트리 전송 — 🧭 내비 화면에서는 끈다
  useGpsTelemetry(!naviOnly);

  useEffect(() => {
    logRoadmapEvent("웹", "1DAL 웹(관제웹) 로그인됨");
  }, []);

  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settlement" element={<Settlement />} />
        {/* 🧭 내비 한 장 — 개인 폰(아이폰)이 여는 화면. 지도·콜·결재 없이 큰 버튼 하나.
            위치는 위에서 껐다 (관제폰과 좌표가 섞이면 도착 판정이 흔들린다) */}
        <Route path="/navi" element={<Navi />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* 하단 네비게이션 — 🎭 무대(새 화면)에서는 숨김 (기사님 0831: 시트가 그 자리를 쓴다).
          정산은 헤더 아바타 → 설정 경로가 아니라 «토글 끄면» 다시 보인다 — 비교 운행용 임시 규칙,
          새 화면 확정 시 정산 가는 길을 다시 정한다 (아바타 메뉴 등). */}
      {!(location.pathname === "/" && stageOn) && (
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
      )}
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
