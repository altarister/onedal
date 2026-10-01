import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { COLOR_DOT, hhmmText, isoKst, kstDateText, opsMemberStatus, wonText, type OpsCounts, type OpsMember } from '@onedal/shared';
import { useTheme } from '@onedal/ui/theme';
import { Badge } from '@onedal/ui/badge';
import {
    AlertTriangle, BarChart3, FileText, LogOut, Map as MapIcon, Megaphone, Moon, MoreHorizontal, Package, Phone, ScrollText, Smartphone, Sun, Users, Wrench, X,
} from 'lucide-react';
import { api, countsRefresh, useOps } from './api/ops';
import { logout, session } from './api/client';
import { useSignalConnected } from './api/socket';

/**
 * 🏢 **운영센터 화면 틀** — PC 는 왼쪽 메뉴 + 윗줄(마지막 갱신 · 관리자), 폰은 윗줄 + 아래 탭 넷(+ 더 보기).
 *    표는 폰 폭에서 카드로 바뀐다(`Table` 의 `card`). 부품은 `@onedal/ui`, 판정 점은 shared `COLOR_DOT` 한 벌.
 *    시각 글자는 shared 의 `hhmmText` · `isoKst` · `kstDateText` 를 거친다 — 화면이 직접 파싱하지 않는다(`toISOString()` 은 UTC 라 새벽 0~9시에 하루 어긋난다).
 */

/** 메뉴 옆 숫자는 서버 `/ops/counts`(할 일이 있는 것만) — 틀이 60초마다, 그리고 쓰기 뒤 바로 다시 읽는다 */
export const NAV: { to: string; label: string; icon: ReactNode; badge?: (c: OpsCounts) => number }[] = [
    { to: '/members', label: '회원', icon: <Users className="size-4" />, badge: c => c.pendingMembers },
    { to: '/calls', label: '통화 도우미', icon: <Phone className="size-4" />, badge: c => c.callsTodo },
    { to: '/map', label: '지도', icon: <MapIcon className="size-4" /> },
    { to: '/phones', label: '폰', icon: <Smartphone className="size-4" />, badge: c => c.phonesOffline },
    { to: '/anomalies', label: '이상 기록', icon: <AlertTriangle className="size-4" /> },
    { to: '/board', label: '현황판(점검)', icon: <Wrench className="size-4" /> },
    { to: '/contents', label: '페이지 글', icon: <FileText className="size-4" /> },
    { to: '/notices', label: '공지', icon: <Megaphone className="size-4" /> },
    { to: '/releases', label: '앱 배포', icon: <Package className="size-4" /> },
    { to: '/stats', label: '통계', icon: <BarChart3 className="size-4" /> },
    { to: '/audit', label: '기록', icon: <ScrollText className="size-4" /> },
];
/** 폰 아래 탭 — 자주 쓰는 넷. 나머지는 «더 보기» */
const PHONE_TABS = ['/members', '/calls', '/phones', '/anomalies'];

function NavBadge({ n }: { n: number }) {
    if (!n) return null;
    return <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-warning text-black text-[11px] font-black flex items-center justify-center">{n}</span>;
}

export function Shell({ children }: { children: ReactNode }) {
    const location = useLocation();
    const navigate = useNavigate();
    const [minute, setMinute] = useState(0);
    useEffect(() => { const t = setInterval(() => setMinute(m => m + 1), 60_000); return () => clearInterval(t); }, []);
    useEffect(() => countsRefresh.add(() => setMinute(m => m + 1)), []);   // 쓰기 뒤 바로
    const counts = useOps(() => api.counts(), [minute]);
    const c: OpsCounts = counts.data ?? { pendingMembers: 0, callsTodo: 0, phonesOffline: 0 };
    const signalOn = useSignalConnected();
    const [refreshedAt, setRefreshedAt] = useState(() => new Date());
    useEffect(() => { if (counts.data) setRefreshedAt(new Date()); }, [counts.data]);
    const leave = async () => { await logout(); navigate('/login', { replace: true }); };
    const logoutButton = (
        <button type="button" onClick={() => void leave()} className="flex items-center gap-1 text-xs text-text-muted rounded-md px-2 py-1 hover:bg-surface-alt" aria-label="로그아웃">
            <LogOut className="size-3.5" /> 로그아웃
        </button>
    );
    const { theme, toggleTheme } = useTheme();   // 관제웹과 같은 토글 · localStorage 에 남는다
    const dark = theme === 'dark';
    const [more, setMore] = useState(false);
    useEffect(() => { setMore(false); }, [location.pathname]);
    const themeButton = (
        <button type="button" onClick={toggleTheme} className="flex items-center gap-1 text-xs text-text-muted rounded-md px-2 py-1 hover:bg-surface-alt" aria-label="테마 바꾸기">
            {dark ? <><Sun className="size-3.5" /> 밝게로</> : <><Moon className="size-3.5" /> 어둡게로</>}
        </button>
    );
    const rest = NAV.filter(n => !PHONE_TABS.includes(n.to));

    return (
        <div className="min-h-screen bg-bg-base text-text-primary md:flex">
            {/* PC 왼쪽 메뉴 */}
            <aside className="hidden md:flex md:w-56 md:min-h-screen flex-col bg-surface border-r border-border-card">
                <div className="px-4 py-4">
                    <Link to="/members" className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-lg bg-gradient-to-tr from-accent-alt to-info flex items-center justify-center text-white font-black text-sm">1D</span>
                        <span className="font-black">운영센터</span>
                    </Link>
                </div>
                <nav className="flex flex-col px-2 gap-0.5">
                    {NAV.map(n => (
                        <NavLink key={n.to} to={n.to} className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-info/15 text-info font-bold' : 'text-text-muted hover:bg-surface-alt hover:text-text-primary'}`}>
                            {n.icon}<span>{n.label}</span>{n.badge && <NavBadge n={n.badge(c)} />}
                        </NavLink>
                    ))}
                </nav>
                <div className="mt-auto px-4 py-4 space-y-2 text-[11px] text-text-muted">
                    <div className="flex gap-1">{themeButton}{logoutButton}</div>
                    <div>관리자: {session.name || '관리자'}</div>
                    <div>열람은 기록에 남습니다</div>
                </div>
            </aside>

            <div className="flex-1 min-w-0 flex flex-col">
                {/* 윗줄 — 폰에서는 제목 · PC 에서는 마지막 갱신 · 관리자 */}
                <div className="sticky top-0 z-20 bg-surface/90 backdrop-blur border-b border-border-card px-4 h-11 flex items-center gap-3">
                    <Link to="/members" className="md:hidden flex items-center gap-2 font-black"><span className="w-7 h-7 rounded-md bg-gradient-to-tr from-accent-alt to-info flex items-center justify-center text-white text-xs">1D</span>운영센터</Link>
                    <div className="ml-auto flex items-center gap-3 text-xs text-text-muted">
                        <span>마지막 갱신 {clockOf(refreshedAt)}</span>
                        <span className={signalOn ? 'text-success' : ''} title="서버 신호(콜이 바뀌면 바로 다시 읽기) — 끊기면 30초마다">{signalOn ? '● 신호 연결' : '○ 신호 끊김 — 30초마다'}</span>
                        <span className="hidden md:inline">{session.name || '관리자'}</span>
                        <span className="md:hidden">{themeButton}</span>
                    </div>
                </div>
                <main className="flex-1 min-w-0 p-3 md:p-6 space-y-3 md:space-y-4 pb-20 md:pb-6">{children}</main>
            </div>

            {/* 폰 아래 탭 */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface/95 backdrop-blur border-t border-border-card grid grid-cols-5">
                {NAV.filter(n => PHONE_TABS.includes(n.to)).map(n => (
                    <NavLink key={n.to} to={n.to} className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'text-info font-bold' : 'text-text-muted'}`}>
                        {n.icon}<span>{n.label.replace('통화 도우미', '통화')}</span>
                        {n.badge && n.badge(c) > 0 && <span className="absolute top-1 right-1/4 min-w-4 h-4 px-1 rounded-full bg-warning text-black text-[10px] font-black flex items-center justify-center">{n.badge(c)}</span>}
                    </NavLink>
                ))}
                <button type="button" onClick={() => setMore(v => !v)} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${more || rest.some(n => n.to === location.pathname) ? 'text-info font-bold' : 'text-text-muted'}`}>
                    <MoreHorizontal className="size-4" /><span>더 보기</span>
                </button>
            </nav>
            {more && (
                <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMore(false)}>
                    <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-surface p-4 pb-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-2"><span className="font-bold">더 보기</span><button type="button" onClick={() => setMore(false)} aria-label="닫기"><X className="size-4" /></button></div>
                        <div className="grid grid-cols-2 gap-2">
                            {rest.map(n => (
                                <NavLink key={n.to} to={n.to} className={({ isActive }) => `flex items-center gap-2 rounded-xl px-3 py-3 text-sm ${isActive ? 'bg-info/15 text-info font-bold' : 'bg-surface-alt'}`}>{n.icon}<span>{n.label}</span></NavLink>
                            ))}
                        </div>
                        <div className="mt-3 flex justify-between text-xs text-text-muted"><span>관리자: {session.name || '관리자'}</span>{logoutButton}</div>
                    </div>
                </div>
            )}
        </div>
    );
}

/** 🧪 예시 자료 띠 — 서버 문이 아직 없는 쪽의 머리에. 자료가 예시라는 개별 사실로 그린다 */
export function ExampleBand({ stage }: { stage: string }) {
    return <div className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm">🧪 예시 자료입니다 — 서버 문은 {stage}. 여기서 누른 것은 기록에 남지 않습니다.</div>;
}

/** 서버가 안 될 때 — 예시 자료로 대신 그리지 않는다 */
export function ErrorBand({ text, onRetry }: { text: string; onRetry: () => void }) {
    return (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm flex items-center justify-between gap-3">
            <span>⚠️ {text}</span>
            <button type="button" onClick={onRetry} className="rounded-md border border-border-card px-2 py-1 text-xs hover:bg-surface-alt">다시</button>
        </div>
    );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
    return (
        <header className="flex items-start justify-between gap-3 flex-wrap">
            <div>
                <h1 className="text-xl md:text-2xl font-black tracking-tight">{title}</h1>
                {sub && <p className="text-xs md:text-sm text-text-muted mt-0.5">{sub}</p>}
            </div>
            {right && <div className="flex gap-2 flex-wrap">{right}</div>}
        </header>
    );
}

export function Card({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={`rounded-2xl border border-border-card bg-surface p-3 md:p-4 space-y-3 ${className}`}>
            {title && <h2 className="text-sm font-bold text-text-muted">{title}</h2>}
            {children}
        </section>
    );
}

/** 숫자 타일 — 작게. 폰에서는 한 줄 칩 모양 */
export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'ok' | 'warn' | 'bad' }) {
    const color = tone === 'ok' ? 'text-success' : tone === 'warn' ? 'text-warning' : tone === 'bad' ? 'text-danger' : 'text-text-primary';
    return (
        <div className="rounded-xl border border-border-card bg-surface px-3 py-2 flex items-baseline justify-between gap-2 md:block">
            <div className="text-[11px] md:text-xs font-bold text-text-muted">{label}</div>
            <div className={`text-lg md:text-2xl font-black md:mt-0.5 ${color}`}>{value}</div>
            {hint && <div className="hidden md:block text-[11px] text-text-muted mt-0.5">{hint}</div>}
        </div>
    );
}
export function StatRow({ children }: { children: ReactNode }) {
    return <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{children}</div>;
}

export interface Column<T> { key: string; label: string; render: (row: T) => ReactNode; className?: string }

/** 표 — PC 는 표, 폰은 `card` 가 있으면 줄마다 카드(글자가 세로로 쌓이지 않게) */
export function Table<T>({ rows, columns, rowKey, empty = '없습니다', onRow, card }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; empty?: string; onRow?: (r: T) => void; card?: (r: T) => ReactNode }) {
    const table = (
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
    if (!card) return table;
    return (
        <>
            <div className="md:hidden space-y-2">
                {rows.length === 0 && <div className="rounded-2xl border border-border-card bg-surface px-3 py-6 text-center text-sm text-text-muted">{empty}</div>}
                {rows.map(r => (
                    <div key={rowKey(r)} onClick={onRow ? () => onRow(r) : undefined} className={`rounded-2xl border border-border-card bg-surface p-3 text-sm ${onRow ? 'active:bg-surface-alt/60' : ''}`}>{card(r)}</div>
                ))}
            </div>
            <div className="hidden md:block">{table}</div>
        </>
    );
}

/** 카드 안의 «이름 — 값» 한 줄 */
export function KV({ k, v }: { k: string; v: ReactNode }) {
    return <div className="flex justify-between gap-3 text-xs"><span className="text-text-muted shrink-0">{k}</span><span className="text-right">{v}</span></div>;
}

/** 회원 상태 글 — 규칙은 shared `opsMemberStatus` 한 곳(서버도 같은 규칙). 여기는 오늘(한국 날)만 넣는다 */
export function memberStatus(m: OpsMember) { return opsMemberStatus(m, todayKey()); }

export function StatusBadge({ m }: { m: OpsMember }) {
    const s = memberStatus(m);
    const cls = s.tone === 'ok' ? 'bg-success/15 text-success border-success/30' : s.tone === 'warn' ? 'bg-warning/15 text-warning border-warning/30' : s.tone === 'bad' ? 'bg-danger/15 text-danger border-danger/30' : 'bg-surface-alt text-text-muted border-border-card';
    return <Badge variant="outline" className={cls}>{s.text}</Badge>;
}

/** 허락 글 — «허락 시각» 이 있으면 켜짐 · 기한이 비면 «기한 없음» */
export function allowText(allowedAt: string | null, until: string | null): string {
    if (!allowedAt) return '—';
    return until ? `${until} 까지` : '기한 없음';
}

export { COLOR_DOT };

/** 콜 상태 — 영어 코드를 기사님 하루의 말로 */
const STATUS_KO: Record<string, string> = { ORDER_CONFIRMED: '진행 중', ORDER_DELIVERED: '하차 완료', ORDER_CANCELLED: '취소', ORDER_RELEASED: '방출' };
export function statusKo(status: string): string { return STATUS_KO[status] ?? status.replace('ORDER_', ''); }

/** 한국 날 — 브라우저 시간대(기사님 · 관리자는 한국). `toISOString()` 은 UTC 라 쓰지 않는다 */
/** 한국 달력 날 `YYYY-MM-DD` — shared `kstDateText` 하나(영업일 키가 아니다 — 화면이 스스로 묶는 자리에만 쓴다 · 서버가 영업일로 센 값은 그대로 센다) */
export function dayKey(at: Date | string | number = new Date()): string {
    return kstDateText(at) ?? kstDateText(Date.now()) ?? '';
}
export function todayKey(): string { return dayKey(new Date()); }
export function plusDaysKey(n: number, from: Date | string = new Date()): string {
    const t = from instanceof Date ? new Date(from) : new Date(isoKst(from) ?? from);
    t.setDate(t.getDate() + n);
    return dayKey(t);
}
const clockOf = (t: Date) => hhmmText(t) ?? '--:--';

/** «HH:MM» — 오늘이 아니면 «M/D HH:MM». 시각 글자는 shared `hhmmText` */
export function fmtTime(iso: string | null | undefined): string {
    const hm = hhmmText(iso);
    if (!hm) return '—';
    const day = dayKey(iso!);
    return day === todayKey() ? hm : `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))} ${hm}`;
}

/** 날짜까지 — «몇 시»만으로는 어느 날인지 모르는 값(서버 부팅 등) */
export function fmtDateTime(iso: string | null | undefined): string {
    const hm = hhmmText(iso);
    if (!hm) return '—';
    const day = dayKey(iso!);
    return `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))} ${hm}`;
}

/** 금액 — shared `wonText` 한 벌 */
export const fmtWon = (n: number): string => wonText(n);

export function memberName(members: OpsMember[], id: string | null): string {
    if (!id) return '(연결 안 됨)';
    return members.find(m => m.id === id)?.name ?? id;
}
