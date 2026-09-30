import { Link } from 'react-router-dom';
import { Button } from '@onedal/ui/button';
import type { ContentKind } from '../lib/joinFlow';
import { ContentSlot, JoinShell } from './JoinSteps';

/**
 * 📄 **약관 셋 — 서비스 약관 · 개인정보 처리방침 · 위치정보 이용약관** (한 부품 · 종류만 다르다 — 쓰는 곳이 셋이라 갈래를 둔다).
 *    글은 운영센터 «페이지 글»에서 온다(판 번호째). 구글 로그인 «공개» 전환 때 이 주소를 처리방침 주소로 낸다.
 */

const TITLE: Record<Extract<ContentKind, 'terms' | 'privacy' | 'location'>, { title: string; hint: string }> = {
    terms: { title: '서비스 약관', hint: '예: 무엇을 해 주는 서비스인지 · 회원의 책임 · 서비스 중단 때의 처리 · 결제는 유튜브 규정' },
    privacy: { title: '개인정보 처리방침', hint: '예: 받는 항목 · 목적 · 보유 기간 · 관리자가 무엇을 보는가 · 탈퇴 뒤 파기' },
    location: { title: '위치정보 이용약관', hint: '예: 위치를 언제 받고 · 누가 보고 · 얼마나 두는가' },
};

export default function Terms({ kind }: { kind: 'terms' | 'privacy' | 'location' }) {
    const t = TITLE[kind];
    return (
        <JoinShell title={t.title} subtitle="1DAL">
            <ContentSlot kind={kind} placeholder={t.hint} />
            <Button asChild variant="outline" className="w-full"><Link to="/join">가입 화면으로</Link></Button>
        </JoinShell>
    );
}
