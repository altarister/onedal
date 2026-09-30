import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { fetchContents } from '../api/join';
import type { ContentKind } from '../lib/joinFlow';

/**
 * 📝 **가입 · 승인 대기 · 탈퇴 · 약관 화면의 공통 틀** — 머리(1DAL 표시 + 단계 점) · 가운데 폭 · 글 자리.
 *    관제 화면(`Dashboard`)과는 다른 자리다: 운전 중이 아니라 **집에서 한 번** 보는 화면이라 글이 길어도 된다.
 */

export function JoinShell({ title, subtitle, steps, step, labels, children }: {
    title: string;
    subtitle?: string;
    steps?: readonly string[];
    step?: string;
    labels?: Record<string, string>;
    children: ReactNode;
}) {
    return (
        <div className="min-h-screen bg-bg-base text-text-primary">
            <header className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-border-card">
                <div className="mx-auto w-full max-w-md px-4 py-3 flex items-center gap-3">
                    <Link to="/join" className="w-8 h-8 rounded-lg bg-gradient-to-tr from-accent-alt to-info flex items-center justify-center shrink-0" aria-label="1DAL">
                        <span className="text-white font-black text-sm">1D</span>
                    </Link>
                    <div className="min-w-0">
                        <h1 className="text-base font-black leading-tight truncate">{title}</h1>
                        {subtitle && <p className="text-xs text-text-muted truncate">{subtitle}</p>}
                    </div>
                </div>
                {steps && step && <StepBar steps={steps} step={step} labels={labels} />}
            </header>
            <main className="mx-auto w-full max-w-md px-4 py-5 space-y-4">{children}</main>
        </div>
    );
}

export function StepBar({ steps, step, labels }: { steps: readonly string[]; step: string; labels?: Record<string, string> }) {
    const at = Math.max(0, steps.indexOf(step));
    return (
        <ol className="mx-auto w-full max-w-md px-4 pb-3 flex items-center gap-2" aria-label="단계">
            {steps.map((s, i) => {
                const done = i < at, now = i === at;
                return (
                    <li key={s} className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={`shrink-0 w-6 h-6 rounded-full text-xs font-black flex items-center justify-center border ${now ? 'bg-info text-white border-info' : done ? 'bg-success/15 text-success border-success/40' : 'bg-surface-alt text-text-muted border-border-card'}`}>
                            {done ? '✓' : i + 1}
                        </span>
                        <span className={`text-xs truncate ${now ? 'font-bold text-text-primary' : 'text-text-muted'}`}>{labels?.[s] ?? s}</span>
                        {i < steps.length - 1 && <span className="flex-1 h-px bg-border-card" />}
                    </li>
                );
            })}
        </ol>
    );
}

/** 운영센터 «페이지 글»에서 온 글을 보인다 — 비어 있으면 자리만 보인다 (글은 기사님이 채운다) */
export function ContentSlot({ kind, placeholder }: { kind: ContentKind; placeholder: string }) {
    const [content, setContent] = useState<{ title: string; body: string; version: number } | null | undefined>(undefined);
    useEffect(() => {
        let alive = true;
        fetchContents(kind).then(c => { if (alive) setContent(c); });
        return () => { alive = false; };
    }, [kind]);
    if (content === undefined) return <div className="h-16 rounded-xl bg-surface-alt animate-pulse" />;
    if (content === null) {
        return (
            <div className="rounded-xl border border-dashed border-border-hover bg-surface-alt/60 px-4 py-5 text-sm text-text-muted text-center">
                (글 자리 — 운영센터 «페이지 글»에서 적습니다)<br />
                <span className="text-xs">{placeholder}</span>
            </div>
        );
    }
    return (
        <article className="rounded-xl border border-border-card bg-surface p-4 text-sm leading-relaxed whitespace-pre-wrap">
            <h2 className="font-bold mb-2">{content.title} <span className="text-xs text-text-muted font-normal">v{content.version}</span></h2>
            {content.body}
        </article>
    );
}

export function SectionCard({ title, children }: { title?: string; children: ReactNode }) {
    return (
        <section className="rounded-2xl border border-border-card bg-surface p-4 space-y-3">
            {title && <h2 className="text-sm font-bold text-text-muted">{title}</h2>}
            {children}
        </section>
    );
}
