import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import type { OpsMember } from '@onedal/shared';
import { Badge } from '@onedal/ui/badge';
import { subscribe } from './api/ops';

/**
 * 🏢 **운영센터 화면 틀 — 왼쪽 메뉴 · 머리 · 표 · 배지**. PC 폭이 기본이고 폰 폭에서는 메뉴가 위로 접힌다.
 *    부품(Badge · Button …)은 `@onedal/ui` 에서 온다 (ui/CLAUDE.md).
 */

export const NAV: { to: string; label: string; mark: string }[] = [
    { to: '/members', label: '회원', mark: '👥' },
    { to: '/calls', label: '통화 도우미', mark: '📞' },
    { to: '/map', label: '지도', mark: '🗺️' },
    { to: '/phones', label: '폰', mark: '📱' },
    { to: '/anomalies', label: '이상 기록', mark: '⚠️' },
    { to: '/board', label: '현황판(점검)', mark: '🧰' },
    { to: '/contents', label: '페이지 글', mark: '📝' },
    { to: '/notices', label: '공지', mark: '📢' },
    { to: '/releases', label: '앱 배포', mark: '📦' },
    { to: '/stats', label: '통계', mark: '📊' },
    { to: '/audit', label: '기록', mark: '🧾' },
];

/** 예시 자료가 바뀌면 다시 그린다 — 서버가 생기면 소켓 · 다시 읽기로 바뀐다 */
export function useTick() {
    const [, setN] = useState(0);
    useEffect(() => subscribe(() => setN(n => n + 1)), []);
}

export function Shell({ children }: { children: ReactNode }) {
    const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
    useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);
    return (
        <div className="min-h-screen bg-bg-base text-text-primary md:flex">
            <aside className="md:w-56 md:min-h-screen bg-surface border-b md:border-b-0 md:border-r border-border-card">
                <div className="px-4 py-3 flex items-center justify-between md:block">
                    <Link to="/members" className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-lg bg-gradient-to-tr from-accent-alt to-info flex items-center justify-center text-white font-black text-sm">1D</span>
                        <span className="font-black">운영센터</span>
                    </Link>
                    <button type="button" onClick={() => setDark(v => !v)} className="text-xs text-text-muted md:mt-2" aria-label="테마 바꾸기">{dark ? '🌙 어둡게' : '☀️ 밝게'}</button>
                </div>
                <nav className="flex md:flex-col overflow-x-auto px-2 pb-2 md:pb-4 gap-1">
                    {NAV.map(n => (
                        <NavLink key={n.to} to={n.to} className={({ isActive }) => `shrink-0 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-info/15 text-info font-bold' : 'text-text-muted hover:bg-surface-alt'}`}>
                            <span>{n.mark}</span><span>{n.label}</span>
                        </NavLink>
                    ))}
                </nav>
                <div className="hidden md:block px-4 pb-4 text-[11px] text-text-muted">관리자: 와이프 · 열람은 기록에 남습니다</div>
            </aside>
            <main className="flex-1 min-w-0 p-4 md:p-6 space-y-4">{children}</main>
        </div>
    );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
    return (
        <header className="flex items-start justify-between gap-3 flex-wrap">
            <div>
                <h1 className="text-2xl font-black tracking-tight">{title}</h1>
                {sub && <p className="text-sm text-text-muted mt-0.5">{sub}</p>}
            </div>
            {right && <div className="flex gap-2 flex-wrap">{right}</div>}
        </header>
    );
}

export function Card({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={`rounded-2xl border border-border-card bg-surface p-4 space-y-3 ${className}`}>
            {title && <h2 className="text-sm font-bold text-text-muted">{title}</h2>}
            {children}
        </section>
    );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'ok' | 'warn' | 'bad' }) {
    const color = tone === 'ok' ? 'text-success' : tone === 'warn' ? 'text-warning' : tone === 'bad' ? 'text-danger' : 'text-text-primary';
    return (
        <div className="rounded-2xl border border-border-card bg-surface p-4">
            <div className="text-xs font-bold text-text-muted">{label}</div>
            <div className={`text-3xl font-black mt-1 ${color}`}>{value}</div>
            {hint && <div className="text-xs text-text-muted mt-1">{hint}</div>}
        </div>
    );
}

export interface Column<T> { key: string; label: string; render: (row: T) => ReactNode; className?: string }

export function Table<T>({ rows, columns, rowKey, empty = '없습니다', onRow }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; empty?: string; onRow?: (r: T) => void }) {
    return (
        <div className="overflow-x-auto rounded-2xl border border-border-card bg-surface">
            <table className="w-full text-sm">
                <thead className="text-xs text-text-muted bg-surface-alt/60">
                    <tr>{columns.map(c => <th key={c.key} className={`text-left font-bold px-3 py-2 whitespace-nowrap ${c.className ?? ''}`}>{c.label}</th>)}</tr>
                </thead>
                <tbody>
                    {rows.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-text-muted">{empty}</td></tr>}
                    {rows.map(r => (
                        <tr key={rowKey(r)} onClick={onRow ? () => onRow(r) : undefined} className={`border-t border-border-card ${onRow ? 'cursor-pointer hover:bg-surface-alt/50' : ''}`}>
                            {columns.map(c => <td key={c.key} className={`px-3 py-2 align-top ${c.className ?? ''}`}>{c.render(r)}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/** 회원 상태 글 — 사실 시각 칸에서만 만든다 (`approvedAt` · `suspendedAt` · `withdrawnAt` · `paidUntil`). 상태 이름 칸은 없다 */
export function memberStatus(m: OpsMember, todayKey = new Date().toISOString().slice(0, 10)): { text: string; tone: 'ok' | 'warn' | 'bad' | 'muted' } {
    if (m.withdrawnAt) return { text: '탈퇴', tone: 'muted' };
    if (m.suspendedAt) return { text: m.suspendAfterActive ? '정지 (끝난 뒤)' : '정지', tone: 'bad' };
    if (!m.approvedAt) return { text: '승인 대기', tone: 'warn' };
    if (m.paidUntil && m.paidUntil < todayKey) return { text: '유예', tone: 'warn' };
    return { text: '사용 중', tone: 'ok' };
}

export function StatusBadge({ m }: { m: OpsMember }) {
    const s = memberStatus(m);
    const cls = s.tone === 'ok' ? 'bg-success/15 text-success border-success/30' : s.tone === 'warn' ? 'bg-warning/15 text-warning border-warning/30' : s.tone === 'bad' ? 'bg-danger/15 text-danger border-danger/30' : 'bg-surface-alt text-text-muted border-border-card';
    return <Badge variant="outline" className={cls}>{s.text}</Badge>;
}

export const VERDICT_DOT: Record<string, string> = { 꿀: '🔵', 보통: '🟢', 똥: '🟡', 사고: '🔴' };

export function fmtTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    const t = new Date(iso);
    const today = new Date();
    const same = t.toDateString() === today.toDateString();
    const hm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    return same ? hm : `${t.getMonth() + 1}/${t.getDate()} ${hm}`;
}

export function fmtWon(n: number): string { return `${n.toLocaleString('ko-KR')}원`; }

export function memberName(members: OpsMember[], id: string | null): string {
    if (!id) return '(연결 안 됨)';
    return members.find(m => m.id === id)?.name ?? id;
}
