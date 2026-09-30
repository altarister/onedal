import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './ui';
import Members from './pages/Members';
import MemberDetail from './pages/MemberDetail';
import MembersCheck from './pages/MembersCheck';
import Calls from './pages/Calls';
import MapPage from './pages/MapPage';
import Phones from './pages/Phones';
import Anomalies from './pages/Anomalies';
import Contents from './pages/Contents';
import Notices from './pages/Notices';
import Releases from './pages/Releases';
import Stats from './pages/Stats';
import Audit from './pages/Audit';
import Board from './pages/Board';

/**
 * 🏢 **운영센터 주소 — reviews/29 5장 그대로.** 관리자 검사(`role === 'ADMIN'` 이 아니면 «관리자만 들어옵니다»)는
 *    서버 문 `/api/ops/*` 와 함께 3단계에 붙는다 — 지금은 목업이라 로그인 없이 연다.
 */
export default function App() {
    return (
        <BrowserRouter>
            <Shell>
                <Routes>
                    <Route path="/" element={<Navigate to="/members" replace />} />
                    <Route path="/members" element={<Members />} />
                    <Route path="/members/check" element={<MembersCheck />} />
                    <Route path="/members/:id" element={<MemberDetail />} />
                    <Route path="/calls" element={<Calls />} />
                    <Route path="/map" element={<MapPage />} />
                    <Route path="/phones" element={<Phones />} />
                    <Route path="/anomalies" element={<Anomalies />} />
                    <Route path="/board" element={<Board />} />
                    <Route path="/contents" element={<Contents />} />
                    <Route path="/notices" element={<Notices />} />
                    <Route path="/releases" element={<Releases />} />
                    <Route path="/stats" element={<Stats />} />
                    <Route path="/audit" element={<Audit />} />
                    <Route path="*" element={<Navigate to="/members" replace />} />
                </Routes>
            </Shell>
        </BrowserRouter>
    );
}
