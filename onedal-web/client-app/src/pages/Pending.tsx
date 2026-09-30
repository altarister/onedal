import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { TARGET_APP_LABEL } from '@onedal/shared';
import { EMPTY_INFO, type JoinInfo } from '../lib/joinFlow';
import { JoinShell, SectionCard } from './JoinSteps';

/**
 * ⏳ **승인 기다리는 중** — 관리자가 운영센터에서 승인하면 관제 화면이 열린다 (reviews/29 6장 `approved_at`).
 *    🔴 «승인됐나»는 서버가 답한다 — 지금은 목업이라 신청 내용(이 브라우저에 남은 것)만 보인다.
 */

/** 예시 자료 — 신청 내용이 이 브라우저에 없을 때 보이는 모양 */
const EXAMPLE: JoinInfo = { vehicle: '1t', phone: '010-****-1234', networks: ['insung', 'kakaopicker'], region: '광주 · 이천', youtubeChannel: '' };

function loadInfo(): JoinInfo {
    try {
        const raw = sessionStorage.getItem('onedal-join-draft');
        if (raw) { const d = JSON.parse(raw); if (d?.info?.vehicle) return { ...EMPTY_INFO, ...d.info }; }
    } catch { /* 저장소가 막혀 있어도 흐름은 돈다 */ }
    return EXAMPLE;
}

export default function Pending() {
    const info = loadInfo();
    return (
        <JoinShell title="승인 기다리는 중" subtitle="관리자가 확인하면 관제 화면이 열립니다">
            <div className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-4 flex items-center gap-3">
                <span className="text-2xl">⏳</span>
                <div className="text-sm">
                    <div className="font-bold">신청이 접수됐습니다</div>
                    <div className="text-text-muted">보통 하루 안에 승인됩니다. 승인되면 이 계정으로 관제 화면이 열립니다.</div>
                </div>
            </div>
            <SectionCard title="신청 내용">
                <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
                    <dt className="text-text-muted">차종</dt><dd className="font-semibold">{info.vehicle}</dd>
                    <dt className="text-text-muted">연락처</dt><dd className="font-semibold">{info.phone}</dd>
                    <dt className="text-text-muted">배차망</dt><dd className="font-semibold">{info.networks.map(n => TARGET_APP_LABEL[n]).join(' · ')}</dd>
                    <dt className="text-text-muted">활동 지역</dt><dd className="font-semibold">{info.region}</dd>
                </dl>
                <Button asChild variant="outline" size="sm"><Link to="/join?step=info">가입 정보 고치기</Link></Button>
            </SectionCard>
            <SectionCard title="기다리는 동안">
                <p className="text-sm text-text-muted">앱 두 개를 미리 받아 설치해 두면 승인 직후 바로 쓸 수 있습니다.</p>
                <Button asChild className="w-full"><Link to="/join/apps">앱 받기 · 설치 안내</Link></Button>
            </SectionCard>
            <p className="text-center text-xs text-text-muted"><Link to="/withdraw" className="underline">신청 취소 · 탈퇴</Link></p>
        </JoinShell>
    );
}
