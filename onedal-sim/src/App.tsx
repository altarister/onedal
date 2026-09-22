/**
 * 🚚 **1DAL 배차망 시뮬레이터** — 앱폰이 읽을 가짜 배차망 화면
 *
 * 사업자가 없어 실 배차망 앱을 설치할 수 없는 동안, **이것이 이 제품의 유일한 배차망**이다.
 * 앱폰(AccessibilityService)이 이 페이지를 읽고 → 필터를 걸고 → 자동 터치한다.
 *
 * 🔴 **배차망은 라우트로 갈리지 않는다 — 주소의 `?net=` 이 가른다** (기사님 확정).
 *
 * 설정은 한 벌이다 — 배차망마다 설정이 한 벌씩이면 한쪽만 자라 문제지 탭·점검·`fillers`(채움 콜 수)가
 * 한 배차망에서 빠진다. 문제지·주소·콜 생성은 공용이고, 갈리는 것은 **그리는 화면 한 장**뿐이다.
 *
 *   /                       설정 한 장 (배차망은 헤더의 스위치)
 *   /dispatch?net=insung    화면만 갈아 끼운다 (배차망 이름은 서버·원달앱과 같다)
 *
 * ⚠️ 옛 주소(`/inseong` · `/hwamul24` · `?net=inseong`)는 **넘김으로 남긴다** — 폰·북마크·문서에 적힌
 *    주소가 조용히 죽으면 «왜 안 뜨지»로 반나절이 간다. 쿼리(`?preset=…`)도 함께 옮긴다.
 *    `?net=inseong` 은 DispatchPage 가 `nets.ts` 의 `renamedNetKey` 로 넘긴다.
 *
 * 회사를 늘리는 법: `packages/ui-simulators/<회사>/` 에 화면을 만들고
 * `packages/ui-simulators/src/nets.ts` 의 `SIM_NETS` 에 한 줄. 앱 쪽은 이미 플러그인
 * 구조(IScrapParser)라 파서만 붙이면 된다.
 */
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { SetupPage } from './pages/SetupPage';
import { DispatchPage } from './pages/DispatchPage';

/** 옛 배차 주소 → 새 주소. 쿼리를 그대로 들고 간다 (문제지·간격을 잃지 않는다) */
function LegacyDispatchRedirect({ net }: { net: 'insung' | 'hwamul24' }) {
    const { search } = useLocation();
    const params = new URLSearchParams(search);
    params.set('net', net);
    return <Navigate to={`/dispatch?${params.toString()}`} replace />;
}

/** 라우트 — 주소 넘김 검사(`tests/addressRedirect.test.tsx`)가 MemoryRouter 로 감싸 그대로 쓴다 */
export function AppRoutes() {
    return (
        <Routes>
            <Route path="/" element={<SetupPage />} />
            <Route path="/dispatch" element={<DispatchPage />} />

            {/* 옛 주소 — 설정은 한 장이므로 둘 다 루트로 보낸다 */}
            <Route path="/inseong" element={<Navigate to="/" replace />} />
            <Route path="/hwamul24" element={<Navigate to="/" replace />} />
            {/* 옛 폴더 이름 경로는 새 배차망 이름으로 바로 간다 — `?net=inseong` 을 거쳐 두 번 넘지 않는다 */}
            <Route path="/inseong/dispatch" element={<LegacyDispatchRedirect net="insung" />} />
            <Route path="/hwamul24/dispatch" element={<LegacyDispatchRedirect net="hwamul24" />} />

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <AppRoutes />
        </BrowserRouter>
    );
}
