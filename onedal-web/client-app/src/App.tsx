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
import { isNaviDevice, markNaviDevice, clearNaviDevice } from "./lib/naviDevice";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center text-text-muted">
        <div className="w-8 h-8 border-4 border-info border-t-transparent rounded-full animate-spin mb-4"></div>
        <p>인증 정보를 확인 중입니다...</p>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    /**
     * 🔴 **가려던 곳을 들고 간다** (기사님 지적 2026-09-03).
     * 예전에는 로그인이 끝나면 **무조건 홈**이었다 — 개인 폰이 `/navi` 를 열어도
     * 로그인 뒤에는 **관제 화면**에 서 있었고, 그 화면은 좌표를 서버로 보낸다.
     * 「관제가 2개」가 로그인 한 번으로 생기던 자리다.
     */
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
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
   * 🔴 **주소만으로 끄면 홈에 닿는 순간 켜진다** (기사님 지적 2026-09-03:
   *    *"우리 페이지가 로그인 하면 리다이렉트 해서 홈으로 가. 그거서는 허용하면 안되잖아."*).
   *    로그인 리다이렉트·뒤로 가기·잘못 누른 링크 — 홈에 닿는 길은 여럿이다.
   *    그래서 **기기에 표시를 남겨** 그 뒤로도 계속 끈다 (규칙 ② 안전장치는 겹쳐 둔다).
   */
  const [naviDevice, setNaviDevice] = useState(isNaviDevice);
  useEffect(() => {
    if (naviOnly && !naviDevice) { markNaviDevice(); setNaviDevice(true); }
  }, [naviOnly, naviDevice]);
  /**
   * 🟢 **위치는 «쓰되 보내지 않는다».** 개인 폰도 차 안에 있으니 좌표는 같다 —
   *    그 좌표로 «지금 여기서 출발»하는 링크를 만든다. 서버로 **안 보내므로** 관제폰과
   *    섞이지 않는다. 보내는 자리는 `useGpsTelemetry` 하나뿐이라 그것만 끄면 된다.
   */
  useNativeLocation();
  // GPS 좌표 변경 시 서버에 소켓으로 텔레메트리 전송 — 🧭 내비 화면에서는 끈다
  useGpsTelemetry(!naviOnly && !naviDevice);

  useEffect(() => {
    logRoadmapEvent("웹", "1DAL 웹(관제웹) 로그인됨");
  }, []);

  return (
    <div className="min-h-screen">
      {/* 🧭 **조용히 끄지 않는다** — 이 브라우저를 나중에 관제로 쓸 때
          «왜 궤적이 안 남지»를 헤매지 않도록 화면이 먼저 말한다 (관제웹 규칙:
          «저장된 값이 목록에 없으면 다른 항목을 대신 보여주지 않는다» 와 같은 결). */}
      {naviDevice && !naviOnly && (
        <div className="mx-3 mt-3 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-[13px] font-bold text-warning flex items-center gap-2">
          <span className="flex-1 leading-snug">🧭 이 브라우저는 <b>내비 폰</b>으로 표시돼 있어 위치를 서버로 <b>보내지 않습니다</b>.</span>
          <button
            onClick={() => { clearNaviDevice(); setNaviDevice(false); }}
            className="shrink-0 rounded-lg bg-warning/20 px-2.5 py-1.5 text-[12px] font-black">
            관제폰으로 쓰기
          </button>
        </div>
      )}

      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settlement" element={<Settlement />} />
        {/* 🧭 내비 한 장 — 개인 폰(아이폰)이 여는 화면. 지도·콜·결재 없이 큰 버튼 하나.
            위치는 위에서 껐다 (관제폰과 좌표가 섞이면 도착 판정이 흔들린다) */}
        <Route path="/navi" element={<Navi />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* 하단 네비게이션 — 🎭 무대(새 화면)와 🧭 내비 한 장에서는 숨김.
          내비는 개인 폰이 여는 «큰 버튼 하나»짜리 화면이라 관제 메뉴가 갈 자리가 없다 —
          실물에서 이 바가 안내문을 덮었다 (기사님 폰 캡처 2026-09-03).
          🎭 무대는 기사님 0831: 시트가 그 자리를 쓴다.
          정산은 헤더 아바타 → 설정 경로가 아니라 «토글 끄면» 다시 보인다 — 비교 운행용 임시 규칙,
          새 화면 확정 시 정산 가는 길을 다시 정한다 (아바타 메뉴 등). */}
      {!(location.pathname === "/" && stageOn) && !naviOnly && (
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
