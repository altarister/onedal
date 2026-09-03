import { useEffect, useMemo, useState } from 'react';
import { JUDGMENT_FIELDS, type JudgmentConfig, type JudgmentField } from '@onedal/shared';
import { useJudgmentStore, ensureJudgmentSocketSubscribed, saveJudgment } from '../../../stores/judgmentStore';

/**
 * 🎯 **판정 기준** 탭 — 서버가 콜에 색을 매기는 값을 기사님이 직접 고치는 자리.
 *
 * 기사님(2026-08-15): *"나중에 실지로 도로에 나가서 데이터를 모아서 쉽게 수정할 수 있도록
 * **사용자 설정 팝업에서 수정 가능하도록** 하는 기능이 필요하겠다."*
 *
 * 🔴 **폼을 손으로 그리지 않는다.** `JUDGMENT_FIELDS` 표를 읽어 **자동 생성**한다 —
 *    값이 하나 늘면 표에 한 줄만 더하면 되고 이 파일은 안 고친다.
 *    (`PHASE_FIELDS` 가 이미 같은 패턴이다)
 *
 * 🔴 **칸마다 근거(`why`)를 띄운다.** 기사님: *"수정할 때마다 문서를 읽어야 할 건데..
 *    문서가 항상 최종본이 아닐 수 있고."* → 문서를 안 열어도 왜 그 값인지 보인다.
 *
 * 🔴 **`오늘만` 버튼이 없다.** 그건 콜 필터에만 있다 (기사님 2026-08-16).
 *    판정 기준은 바꾸면 계속 적용된다 — 도로에서 데이터를 모아 조정하는 성격이라 그렇다.
 */
/**
 * 🔴 **여기 없는 묶음은 화면에 아예 안 뜬다** (2026-09-03 코드 리뷰가 잡음).
 *    `JUDGMENT_FIELDS` 에 칸을 넣어도 이 줄에 묶음 이름이 없으면 **고칠 길이 없다** —
 *    «판정 기준 탭에서 고친다»는 주석·설명만 남고 화면에는 없는 상태가 된다.
 *    지나침(신규)과 정차·여유(그동안 안 보이고 있었다) 둘을 함께 넣는다.
 */
const GROUP_ORDER = ['합짐', '첫짐', '모를 때', '데드라인', '지나침', '정차·여유', '가중치', '색 경계'] as const;
const GROUP_ICON: Record<string, string> = {
    '합짐': '📦', '첫짐': '🚚', '모를 때': '🔧', '데드라인': '⏱️', '지나침': '👣',
    '정차·여유': '🅿️', '가중치': '⚖️', '색 경계': '🎨',
};
const GROUP_HINT: Record<string, string> = {
    '합짐': '경로에 콜을 더할 때 — 추가 주행과 우회 거리로 색을 낸다',
    '첫짐': '빈 차로 잡는 첫 콜',
    '모를 때': '통화 전이라 모르는 값을 **일반값**으로 채운다 (불리한 값이 아니다)',
    '데드라인': '콜마다 자동으로 서는 배달 상한 — 통화 전 추정을 이 안으로 깎는다. 통화로 합의하면 데드라인이 미뤄진다',
    '가중치': '0 이면 색에 반영하지 않는다 (표시는 계속한다)',
    '색 경계': '총점이 몇 점 이상이면 무슨 색인가',
};

const readField = (cfg: JudgmentConfig, f: JudgmentField): number =>
    (cfg[f.path[0]] as any)[f.path[1]];

export default function JudgmentSettingsTab() {
    const { judgment, loaded } = useJudgmentStore();
    useEffect(() => { ensureJudgmentSocketSubscribed(); }, []);

    /** 편집 중인 값 (서버 값과 다르면 「적용」이 켜진다) */
    const [draft, setDraft] = useState<Record<string, number>>({});
    useEffect(() => {
        const next: Record<string, number> = {};
        for (const f of JUDGMENT_FIELDS) next[f.col] = readField(judgment, f);
        setDraft(next);
    }, [judgment]);

    const changed = useMemo(
        () => JUDGMENT_FIELDS.filter(f => draft[f.col] !== readField(judgment, f)),
        [draft, judgment],
    );

    const apply = () => {
        // 기사님 5번: 바꾼 값을 **한 번에** 보낸다. 칸마다 저장하지 않는다
        const next: JudgmentConfig = JSON.parse(JSON.stringify(judgment));
        for (const f of JUDGMENT_FIELDS) (next[f.path[0]] as any)[f.path[1]] = draft[f.col];
        saveJudgment(next);
    };

    const reset = () => {
        const next: Record<string, number> = {};
        for (const f of JUDGMENT_FIELDS) next[f.col] = readField(judgment, f);
        setDraft(next);
    };

    return (
        <div className="space-y-4 text-sm">
            <p className="text-xs text-text-muted leading-relaxed">
                콜을 <b>집은 뒤</b> 서버가 색(🔵🟢🟡)을 매기는 기준입니다.
                콜을 <b>집기 전</b>에 거르는 조건은 <b>🔍 필터</b>에 있습니다 — 둘은 따로 돕니다.
                <br />여기서 바꾸면 <b>계속 적용</b>됩니다 (「오늘만」이 없습니다).
            </p>

            {GROUP_ORDER.map(group => {
                const fields = JUDGMENT_FIELDS.filter(f => f.group === group);
                if (fields.length === 0) return null;
                return (
                    <section key={group} className="rounded-lg border border-border/60 p-3">
                        <div className="mb-1 font-bold">{GROUP_ICON[group]} {group}</div>
                        <div className="mb-2 text-[11px] text-text-muted">{GROUP_HINT[group]}</div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                            {fields.map(f => (
                                <label key={f.col} className="block">
                                    <span className="text-xs font-medium">{f.label}</span>
                                    <span className="ml-1 flex items-baseline gap-1">
                                        <input
                                            type="number"
                                            className="w-20 rounded border border-border bg-surface px-2 py-1 text-right tabular-nums"
                                            disabled={!loaded}
                                            min={f.min} max={f.max} step={f.int ? 1 : 0.5}
                                            value={draft[f.col] ?? ''}
                                            onChange={e => {
                                                const raw = Number(e.target.value);
                                                if (!Number.isFinite(raw)) return;
                                                setDraft(d => ({ ...d, [f.col]: Math.min(f.max, Math.max(f.min, raw)) }));
                                            }}
                                        />
                                        <span className="text-[11px] text-text-muted">{f.unit}</span>
                                    </span>
                                    {/* 🔴 근거를 여기 띄운다 — 문서를 안 열어도 왜 그 값인지 보인다 */}
                                    {f.why && <span className="mt-0.5 block text-[10px] leading-tight text-text-muted/80">ⓘ {f.why}</span>}
                                </label>
                            ))}
                        </div>
                    </section>
                );
            })}

            <div className="flex items-center gap-2 border-t border-border/60 pt-3">
                <span className="text-xs text-text-muted">
                    {!loaded ? '서버에서 불러오는 중…'
                        : changed.length === 0 ? '바뀐 값 없음'
                        : `${changed.length}곳 변경 — ${changed.map(f => f.label).join(', ')}`}
                </span>
                <div className="ml-auto flex gap-2">
                    <button
                        className="rounded border border-border px-3 py-1.5 text-xs disabled:opacity-40"
                        disabled={changed.length === 0} onClick={reset}
                    >되돌리기</button>
                    <button
                        className="rounded bg-primary px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                        disabled={changed.length === 0} onClick={apply}
                    >적용</button>
                </div>
            </div>
        </div>
    );
}
