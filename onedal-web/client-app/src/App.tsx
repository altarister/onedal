import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { ServerSwitch } from './components/ServerSwitch'
import { useState, useEffect } from "react";
import Dashboard from "./pages/Dashboard";
import SheetMockup from "./pages/SheetMockup";
import MapMockup from "./pages/MapMockup";
import DrawerMockup from "./pages/DrawerMockup";
import Settlement from "./pages/Settlement";
import Login from "./pages/Login";
import Join from "./pages/Join";
import JoinApps from "./pages/JoinApps";
import Pending from "./pages/Pending";
import Withdraw from "./pages/Withdraw";
import Terms from "./pages/Terms";
import Blocked from "./pages/Blocked";
import { fetchMeSafe } from "./api/join";
import { ensureSocketConnected } from './lib/socket';
import { gateDecision, type GateDecision } from "./lib/joinFlow";
import type { ContentKind } from "@onedal/shared";
import { logRoadmapEvent, startMemoryWatch } from "./lib/roadmapLogger";
import { useAuth } from "./contexts/AuthContext";
import { useNativeLocation } from "./hooks/useNativeLocation";
import { useGpsTelemetry } from "./hooks/useGpsTelemetry";
import { isNaviDevice, markNaviDevice, clearNaviDevice } from "./lib/naviDevice";
import { SessionGuard } from "./components/session/SessionGuard";

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
     * 🔴 **가려던 곳을 들고 간다** (기사님 지적).
     * 로그인이 끝나면 가려던 주소로 돌아간다 — 무조건 홈으로 보내면 개인 폰이 내비 주소를 열어도
     * 로그인 뒤 **관제 화면**에 서고, 그 화면은 좌표를 서버로 보내 「관제가 2개」가 된다.
     */
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  
  return <>{children}</>;
}

/**
 * 🚪 **로그인 뒤 문지기** — `/api/join/me` 를 한 번 읽어 승인 전이면 승인 대기로, 막힘(정지 · 탈퇴 · 유료 기한)이면 «이용이 멈췄습니다»로 보낸다.
 *    갈래는 `lib/joinFlow` 의 `gateDecision` 하나 — 🔴 문이 안 되면(옛 서버 · 장애) `ok` 라 기사님 운행을 막지 않는다.
 *    🔴 읽는 동안 지금 화면을 막지 않는다 — 먼저 그리고, 답이 오면 보낸다 (관제 화면 지연 0).
 *    🔴 다시 동의할 약관(reconsent)은 화면을 옮기지 않는다 — 운전 중 결재를 못 막게 띠 한 줄만 (`/join?reconsent=1`).
 */
function MemberGate() {
  const location = useLocation();
  const [decision, setDecision] = useState<GateDecision>('ok');
  const [reconsent, setReconsent] = useState<ContentKind[]>([]);
  useEffect(() => {
    let alive = true;
    fetchMeSafe().then(r => {
      if (!alive) return;
      const d = gateDecision(r.me, r.failed);
      setDecision(d);
      setReconsent(r.me?.reconsent ?? []);
      if (d === 'ok') ensureSocketConnected();   // 승인 대기 화면을 거치지 않고 온 경우(새로고침 · 주소 직접) — 닫혀 있을 때만 한 번
    });
    return () => { alive = false; };
  }, []);
  if (decision === 'pending' && location.pathname !== '/pending') return <Navigate to="/pending" replace />;
  if (decision === 'blocked' && location.pathname !== '/blocked') return <Navigate to="/blocked" replace />;
  if (reconsent.length > 0 && location.pathname === '/') {
    return (
      <div className="mx-3 mt-3 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-[13px] font-bold text-warning flex items-center gap-2">
        <span className="flex-1">📄 새 약관 — 동의해 주세요</span>
        <Link to="/join?reconsent=1" className="shrink-0 rounded-lg bg-warning/20 px-2.5 py-1.5 text-[12px] font-black">동의하러</Link>
      </div>
    );
  }
  return null;
}

// Navigation Wrapper
function AppLayout() {
  const location = useLocation();

  /**
   * 🧭 **내비 화면에서는 위치를 안 보낸다** (기사님 지적).
   *
   * 기사님: *"관제가 2개 열리면 안된다고 한것 같은데."* — 맞다. 개인 폰(아이폰)에서
   * 이 웹을 열면 **관제폰과 좌표가 한 차량으로 섞인다.** 서버는 두 위치를 오가는 것으로
   * 보고 「위치 점프」를 찍으며, 도착·지나침 판정이 통째로 흔들린다.
   *
   * 🔴 훅을 라우트 안으로 내리는 것이 더 정직하지만, 그러면 관제 화면의 GPS 시작 시점이
   *    바뀐다. **가장 단순한 길**로 여기서 끈다 (기사님 «가장 간단한걸로 하자»).
   *    `naviGpsOff.test.ts` 가 이 한 줄이 사라지는 것을 막는다.
   */
  /**
   * ⚠️ **개인폰이 받는 내비 화면은 지금 없다 — 새로 만든다** — 정거장 목록이 아니라 «다음 한 곳» 하나를
   *    카카오내비로 여는 화면.
   * 🔴 **그때까지도 이 줄은 살아 있어야 한다** — 개인폰이 좌표를 보내면 관제폰과 섞인다.
   *    새 화면을 만들 때 **그 주소를 여기 적는다.** 지금은 그 주소가 없어 아무 화면도 안 걸린다
   *    (`naviDevice` 표시가 남아 있어 한 번 내비로 쓴 브라우저는 계속 안 보낸다).
   */
  const naviOnly = location.pathname.startsWith('/navi');
  /**
   * 🔴 **주소만으로 끄면 홈에 닿는 순간 켜진다** (기사님 지적:
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
    logRoadmapEvent("통신", "웹", "1DAL 웹(관제웹) 로그인됨");
    /**
     * 🧠 **메모리를 30초마다 남긴다** — 관제웹이 크롬 「Aw, Snap!」으로 죽을 때
     *    «쌓이다 죽었나, 갑자기 죽었나»를 가르는 유일한 흔적이다. 로그 버퍼가 2초에 한 번
     *    모아 보내므로 죽기 직전 줄은 사라진다 (`roadmapLogger.startMemoryWatch`).
     */
    startMemoryWatch();
  }, []);

  return (
    <div className="min-h-screen">
      {/* 🛡️ 단일 세션 인계 관리 — 다른 기기에서 열었을 때 충돌 팝업 및 종료 처리 */}
      <SessionGuard />
      {/* 🚪 승인 전 · 막힘 → 보냄 · 새 약관 → 띠 (문이 안 되면 그대로) */}
      <MemberGate />

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
        {/* 🚪 탈퇴 — 로그인한 기사만 (reviews/29 «관제웹 기사 쪽 페이지») */}
        <Route path="/withdraw" element={<Withdraw />} />
        {/* 🚫 이용이 멈췄습니다 — 정지 · 탈퇴 · 유료 기한 (MemberGate 가 보낸다) */}
        <Route path="/blocked" element={<Blocked />} />
        {/* 🧭 내비 한 장 자리 — 개인 폰(아이폰)이 여는 화면을 새로 만들면 여기 건다. 지금은 이 줄이 없어
            `/navi` 도 아래 줄로 홈에 간다. 위치는 위에서 끈다 (관제폰과 좌표가 섞이면 도착 판정이 흔들린다) */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* 하단 네비게이션 — 🎭 관제(무대)와 🧭 내비 한 장에서는 숨김.
          관제는 시트가 그 자리를 쓴다.
          내비는 개인 폰이 여는 «큰 버튼 하나»짜리 화면이라 관제 메뉴가 갈 자리가 없다 —
          이 바가 뜨면 안내문을 덮는다.
          🔴 **관제에서 정산으로 가는 길은 아직 없다** — 정산은 운행일지(logbook)가 받기로 했다
             (기사님 확정). 정산 화면에서는 이 바가 떠서 관제로 돌아올 수 있다. */}
      {location.pathname !== "/" && !naviOnly && (
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
          🔴 AuthGuard 안쪽에 두면 로그인이 끝나거나 «로딩 중» 분기가 바뀔 때
             컴포넌트 자체가 사라져 볼륨 업에 아무 반응이 없다. */}
      <ServerSwitch />
      {/* 🛡️ 바깥 경계 — 큰 칸 경계(Dashboard) 밖에서 난 오류도 하얀 화면 대신 빨간 상자 + 새로고침 */}
      <ErrorBoundary label="관제앱 화면">
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* 🪗 **시트 아코디언 목업** — 로그인 밖에 둔다 (기사님 요청).
            고정값만 그리고 서버·소켓·GPS 를 안 쓴다. 디자인을 두 테마로 보는 자리다. */}
        <Route path="/mockup/sheet" element={<SheetMockup />} />
        {/* 🗺️ **지도 실험실** — 필터 두 단계(영역→거리)를 지도 클릭으로 검증한다 (기사님).
            자기 캔버스로만 그리고 서버·소켓·GPS 를 안 쓴다 — 다른 화면에 영향 없음 */}
        <Route path="/mockup/map" element={<MapMockup />} />
        {/* ☰ **왼쪽 서랍 목업** — 끝난 콜(완료됨·취소·방출)을 관제에서 빼 여기로 (기사님).
            새 화면으로 굳히면 옛 화면의 탭 줄이 사라지는데, 폰에서는 현황판도 안 떠 볼 곳이 없어진다.
            고정값만 그리고 서버·소켓·GPS 를 안 쓴다 */}
        <Route path="/mockup/drawer" element={<DrawerMockup />} />
        {/* 📝 **가입 · 승인 대기 · 앱 받기 · 약관 — 로그인 밖** (reviews/29 «관제웹 기사 쪽 페이지»).
            주소를 받은 새 계정이 로그인 전에 읽는다. 글은 운영센터 «페이지 글»에서 온다 · 서버 문은 `api/join.ts` 한 곳 */}
        <Route path="/join" element={<Join />} />
        <Route path="/join/apps" element={<JoinApps />} />
        <Route path="/pending" element={<Pending />} />
        <Route path="/terms" element={<Terms kind="terms" />} />
        <Route path="/privacy" element={<Terms kind="privacy" />} />
        <Route path="/location-terms" element={<Terms kind="location" />} />
        <Route
          path="/*" 
          element={
            <AuthGuard>
              <AppLayout />
            </AuthGuard>
          } 
        />
      </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
