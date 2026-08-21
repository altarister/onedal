/**
 * 🚚 **1DAL 배차망 시뮬레이터** — 앱폰이 읽을 가짜 배차망 화면
 *
 * 사업자가 없어 실 배차망 앱을 설치할 수 없는 동안, **이것이 이 제품의 유일한 배차망**이다.
 * 앱폰(AccessibilityService)이 크롬으로 이 페이지를 읽고 → 필터를 걸고 → 자동 터치한다.
 * `~/reps/map/map`(지도 암기 게임)에서 배차 시뮬레이터 부분만 옮겨 왔다 (2026-08-22).
 * 게임 쪽은 그대로 두고, 여기는 **화면과 파서가 한 레포에서 짝을 이루도록** 하는 것이 목적이다.
 *
 * 회사를 늘리는 법: `packages/ui-simulators/<회사>/` 에 화면을 만들고 아래에 라우트 두 줄.
 * 앱 쪽은 이미 플러그인 구조(IScrapParser)라 파서만 붙이면 된다.
 */
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { InseongSetupPage } from './pages/InseongSetupPage';
import { InseongDispatchPage } from './pages/InseongDispatchPage';
import { Hwamul24SetupPage } from './pages/Hwamul24SetupPage';
import { Hwamul24DispatchPage } from './pages/Hwamul24DispatchPage';

/** 어느 배차망을 띄울지 고르는 첫 화면 — 폰에서 크롬으로 열었을 때의 입구 */
function Home() {
    return (
        <div className="min-h-screen bg-gray-900 text-white p-6 flex flex-col gap-4">
            <h1 className="text-xl font-bold">🚚 1DAL 배차망 시뮬레이터</h1>
            <p className="text-sm text-gray-400">앱폰이 읽을 화면입니다. 배차망을 고르세요.</p>
            <Link to="/inseong" className="block bg-blue-600 rounded-lg p-4 font-bold">인성콜</Link>
            <Link to="/hwamul24" className="block bg-emerald-600 rounded-lg p-4 font-bold">화물24시</Link>
        </div>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/inseong" element={<InseongSetupPage />} />
                <Route path="/inseong/dispatch" element={<InseongDispatchPage />} />
                <Route path="/hwamul24" element={<Hwamul24SetupPage />} />
                <Route path="/hwamul24/dispatch" element={<Hwamul24DispatchPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
