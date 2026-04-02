import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Settlement from "./pages/Settlement";
import OrderFilterConfig from "./pages/OrderFilterConfig";

// Navigation Wrapper
function AppLayout() {
  const location = useLocation();

  return (
    <div className="min-h-screen pb-20">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settlement" element={<Settlement />} />
        <Route path="/settings/filter" element={<OrderFilterConfig />} />
      </Routes>

      {/* 하단 네비게이션 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur border-t border-gray-800 flex z-50">
        <Link
          to="/"
          className={`flex-1 py-4 text-center font-bold text-sm transition-colors ${location.pathname === "/" ? "text-violet-400" : "text-gray-500"
            }`}
        >
          📡 실시간
        </Link>
        <Link
          to="/settlement"
          className={`flex-1 py-4 text-center font-bold text-sm transition-colors ${location.pathname === "/settlement" ? "text-violet-400" : "text-gray-500"
            }`}
        >
          💰 정산
        </Link>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
