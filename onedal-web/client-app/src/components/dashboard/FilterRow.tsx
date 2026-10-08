/* 🧰 필터창의 행 — 필터창(`OrderFilterModal`)이 부른다 */

/** 🧰 **필터의 행** — 어디로 · 얼마나 넓게 · 어떤 콜 · 빼는 곳 (기사님 확정) */
export type RowId = 'where' | 'wide' | 'call' | 'exclude';

/**
 * 🧰 **행 하나 — 머리를 누르면 열리고 닫힌다.** 안쪽 상자 없이 구분선만 긋는다 (필터가 이미 상자다).
 *    닫혀 있어도 머리의 요약으로 값이 읽힌다 — 지도를 가리지 않으려고 닫아 두는 것이지 감추는 것이 아니다.
 */
export function FilterRow({ id, title, summary, open, onToggle, danger = false, children }: {
    id: RowId; title: string; summary: string; open: boolean; onToggle: (id: RowId) => void; danger?: boolean; children: React.ReactNode;
}) {
    return (
        <div id={id} className="border-b border-border-card last:border-b-0">
            <button type="button" aria-expanded={open} onClick={() => onToggle(id)}
                className="w-full min-h-[40px] flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-hover/30">
                <span className={`shrink-0 text-[13px] font-black ${danger ? 'text-danger' : open ? 'text-info' : 'text-text-primary'}`}>{title}</span>
                <span className="flex-1 min-w-0 truncate text-right text-[12px] font-bold text-text-muted tabular-nums">{summary}</span>
                <span className={`inline-block shrink-0 text-[10px] text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
            </button>
            {open && <div className="px-3 pb-2.5 space-y-1.5">{children}</div>}
        </div>
    );
}
