import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import { useEffect } from "react";
import Dashboard from "./pages/Dashboard";
import Settlement from "./pages/Settlement";
import Login from "./pages/Login";
import DevTools from "./components/dev/DevTools";
import { logRoadmapEvent } from "./lib/roadmapLogger";
import { useAuth } from "./contexts/AuthContext";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-gray-500">
        <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mb-4"></div>
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
      {/* 배포 테스트를 위해 임시로 DevTools 강제 활성화 */}
      <DevTools /> 
    </BrowserRouter>
  );
}
