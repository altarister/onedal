import { useEffect, useState } from 'react';
import { api, useOps } from '../api/ops';
import KakaoUsageCard from './KakaoUsageCard';
import Phones from './Phones';
import Anomalies from './Anomalies';
import { ErrorBand, PageHeader, Stat, fmtDateTime, fmtTime } from '../ui';

/**
 * 🧰 **점검** — 뭔가 고장 났나 · 배차망이 바뀌었나(reviews/33 · 읽기만 · 10초마다).
 *    서버 점검(부팅 · 커밋 · 붙은 화면 · 마지막 폰 보고) · 전 회원 폰 접속 · 카카오 호출 · 이상 기록(앱이 못 읽은 화면 · 처음 보는 글자).
 *    회원을 골라 보던 칸(그 폰이 받는 필터 · 앱이 올린 콜)은 회원 상세의 «폰 · 필터» 칸에 있다(`MemberPhoneFilter`).
 *    🔴 관제웹 현황판은 그대로다. 시험 도구 · «어긋남»은 관제웹 화면 안에서만 뜻이 있어 여기 없다.
 */
export default function Inspect() {
    const [tick, setTick] = useState(0);
    useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 10_000); return () => clearInterval(t); }, []);
    const { data, error, reload } = useOps(() => Promise.all([api.members(), api.boardServer()]), [tick]);
    const [members, server] = data ?? [[], null];
    return (
        <>
            <PageHeader title="점검" sub="서버 · 폰 접속 · 카카오 호출 · 이상 기록 — 읽기만 · 10초마다" />
            {error && <ErrorBand text={error} onRetry={reload} />}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <Stat label="서버 부팅" value={fmtDateTime(server?.bootedAt)} hint={server ? `${server.branch} · ${server.commit}` : undefined} />
                <Stat label="붙은 화면" value={server ? `${server.sockets.web} · ${server.sockets.ops}` : '—'} hint="관제웹 · 운영센터" />
                <Stat label="마지막 폰 보고" value={fmtTime(server?.lastScrapAt)} tone={server?.lastScrapAt ? 'ok' : undefined} />
                <Stat label="오류 (부팅 뒤 · 오늘)" value={!server ? '—' : server.errorsToday.count === 0 ? '없음' : `${server.errorsToday.count}줄 · ${server.errorsToday.kinds}가지`}
                    tone={server && server.errorsToday.count > 0 ? 'warn' : undefined} hint="서버를 다시 띄우면 0" />
                <Stat label="DB" value={server?.dbFile ?? '—'} hint={server ? `커밋 ${fmtDateTime(server.committedAt)}` : undefined} />
            </div>
            <Phones />
            <KakaoUsageCard members={members} tick={tick} />
            <Anomalies />
        </>
    );
}
