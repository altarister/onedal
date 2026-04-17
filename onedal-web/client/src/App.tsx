import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import { useEffect } from "react";
import Dashboard from "./pages/Dashboard";
import Settlement from "./pages/Settlement";
import DevTools from "./components/dev/DevTools";
import { logRoadmapEvent } from "./lib/roadmapLogger";

// Navigation Wrapper
function AppLayout() {
  const location = useLocation();

  useEffect(() => {
    logRoadmapEvent("웹", "1DAL 웹(관제웹) 시작, 로그인");
  }, []);

  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settlement" element={<Settlement />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* 하단 네비게이션 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur border-t border-gray-800 flex z-50">
        <Link
          to="/"
          className={`flex-1 py-4 text-center font-bold text-sm transition-colors ${location.pathname === "/" ? "text-violet-400" : "text-gray-500"
            }`}
        >
          실시간
        </Link>
        <Link
          to="/settlement"
          className={`flex-1 py-4 text-center font-bold text-sm transition-colors ${location.pathname === "/settlement" ? "text-violet-400" : "text-gray-500"
            }`}
        >
          정산
        </Link>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
      {/* 배포 테스트를 위해 임시로 DevTools 강제 활성화 */}
      <DevTools /> 
    </BrowserRouter>
  );
}
