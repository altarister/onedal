import { useState } from 'react';
import {
    CARGO_SIZES, HANDLING_METHODS, cargoPoints, parseCargoHints, hasCargoHints,
    CARGO_TAGS, CARGO_TAG_META, describeSlack, computeSlackMinutes,
} from '@onedal/shared';
import type { CargoReport, CargoSize, HandlingMethod, CargoReportKind } from '@onedal/shared';
import { socket } from '../../lib/socket';

/**
 * [Phase 8.4] 정거장 카드 — 전화 + 통화 결과 입력
 *
 * 이 UI가 열리는 순간은 거의 항상 **"지금 전화를 걸려는 순간"** 이다.
 * 그래서 전화번호를 가장 크게, 탭 한 번으로 걸리게 둔다.
 *
 * 입력은 **통화하면서** 한다. 키보드를 띄우면 실패한다.
 *   크기 1탭 · 개수 1탭 · 방법 1탭 = 3탭이면 끝.
 * kg 를 묻지 않는 이유: 우리 판정은 적재 점수(1t=30점) 축으로 돌아가므로
 * "칸을 몇 개 먹는가"만 알면 된다. 정확한 무게는 알아도 쓸 데가 없다.
 *
 * 같은 폼을 현장에서 `ACTUAL` 모드로 다시 띄운다. 신고값이 회색으로 미리 채워져
 * 있으므로 **다른 것만 다시 탭하면 된다.**
 */

const QUANTITIES = [1, 2, 3, 5, 10];

/**
 * 마감 시각도 **키보드 없이** 넣는다.
 * 기사님 예시가 "2시에 잡았는데 5시까지" 였다 — 절대 시각보다 **몇 시간 뒤**가 자연스럽다.
 */
const DEADLINE_PRESETS: Array<[string, number]> = [
    ['+1시간', 60], ['+2시간', 120], ['+3시간', 180], ['+5시간', 300], ['오늘 중', -1],
];

function presetToIso(minutes: number): string {
    const d = new Date();
    if (minutes < 0) { d.setHours(23, 59, 0, 0); return d.toISOString(); }
    return new Date(d.getTime() + minutes * 60000).toISOString();
}

const hhmm = (iso?: string) =>
    iso ? new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';

interface Props {
    orderId: string;
    stopType: 'pickup' | 'dropoff';
    /** 정거장 라벨 (예: "상차지") */
    label: string;
    address: string;
    /** 담당자명 (없으면 생략) */
    contactName?: string;
    phones: string[];
    reports: CargoReport[];
    /** 적요·물품 텍스트 — 통화 시트를 미리 채울 힌트를 뽑는다 */
    memoTexts?: (string | undefined)[];
    /** 현장 도착 후 실측 입력 모드를 기본으로 연다 */
    defaultKind?: CargoReportKind;
}

export default function StopCallSheet({
    orderId, stopType, label, address, contactName, phones, reports, memoTexts, defaultKind = 'DECLARED',
}: Props) {
    const [open, setOpen] = useState(false);
    const [kind, setKind] = useState<CargoReportKind>(defaultKind);

    const declared = reports.find(r => r.stopType === stopType && r.kind === 'DECLARED');
    const actual = reports.find(r => r.stopType === stopType && r.kind === 'ACTUAL');
    const saved = kind === 'DECLARED' ? declared : actual;
    // 실측 입력 시 신고값을 밑그림으로 깔아둔다 — 다른 것만 고치면 된다
    const ghost = kind === 'ACTUAL' ? declared : undefined;

    const [size, setSize] = useState<CargoSize | undefined>(saved?.sizeClass);
    const [qty, setQty] = useState<number | undefined>(saved?.quantity);
    const [handling, setHandling] = useState<HandlingMethod | undefined>(saved?.handling);
    const [memo, setMemo] = useState(saved?.memo || '');
    const [tags, setTags] = useState<string[]>(saved?.tags || []);
    const [deadlineAt, setDeadlineAt] = useState<string | undefined>(saved?.deadlineAt);

    const eff = {
        sizeClass: size ?? ghost?.sizeClass,
        quantity: qty ?? ghost?.quantity,
        handling: handling ?? ghost?.handling,
    };
    const points = cargoPoints(eff);

    // 적요에서 뽑은 힌트. **자동으로 채우지 않는다** — 탭해야 들어간다.
    // 추측값이 확인 없이 저장되면 적재 판정이 틀어지기 때문이다.
    const hints = parseCargoHints(...(memoTexts || []));
    const applyHints = () => {
        if (hints.sizeClass) setSize(hints.sizeClass);
        if (hints.quantity != null) setQty(hints.quantity);
        if (hints.handling) setHandling(hints.handling);
    };

    const save = () => {
        socket.emit('save-cargo-report', {
            orderId, stopType, kind,
            sizeClass: eff.sizeClass, quantity: eff.quantity, handling: eff.handling,
            // 적요에서 읽은 상차 약속 시각. 시간창 경로 최적화(8.7)의 입력이 된다
            promisedAt: saved?.promisedAt || hints.promisedAt,
            deadlineAt,
            tags: tags.length ? tags : undefined,
            memo: memo || undefined,
        });
        setOpen(false);
    };

    const chip = (active: boolean, isGhost = false) =>
        `px-2.5 py-2 rounded-md text-xs font-bold border transition-colors ${
            active ? 'bg-info text-white border-info'
            : isGhost ? 'bg-surface-alt/40 text-text-muted border-border border-dashed'
            : 'bg-surface-alt/40 text-text-primary border-border hover:bg-surface-hover'
        }`;

    // 요약 배지: 접힌 상태에서도 "이 정거장은 파악됐나"를 한눈에
    const summary = declared
        ? `${declared.sizeClass ?? '?'}${declared.quantity ? `×${declared.quantity}` : ''}${declared.handling ? ` · ${declared.handling}` : ''}`
        : null;

    return (
        <div className="rounded-md border border-border bg-surface-alt/20 p-2.5">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-black text-text-muted">{label}</span>
                        {contactName && <span className="text-[11px] text-text-primary font-bold">{contactName}</span>}
                        {summary && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-info/15 text-info">{summary}</span>
                        )}
                        {actual && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-success/15 text-success">현장확인</span>
                        )}
                    </div>
                    <div className="text-[12px] text-text-primary leading-snug mt-0.5 break-keep">{address}</div>
                </div>
            </div>

            {/* 전화: 가장 크게, 탭 한 번 */}
            <div className="flex gap-1.5 mt-2">
                {phones.length === 0 && (
                    <span className="text-[11px] text-text-muted py-2">연락처 없음</span>
                )}
                {phones.map((p, i) => (
                    <a
                        key={p}
                        href={`tel:${p.replace(/[^0-9+]/g, '')}`}
                        onClick={e => e.stopPropagation()}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md bg-success/12 border border-success/40 text-success text-[13px] font-black tabular-nums active:scale-[0.98] transition-transform"
                    >
                        <span>📞</span>{p}{i === 1 && <span className="text-[10px] font-bold opacity-70">보조</span>}
                    </a>
                ))}
                <button
                    onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
                    className={`px-3 py-2.5 rounded-md text-[12px] font-black border transition-colors ${
                        open ? 'bg-info text-white border-info' : 'bg-surface-alt/60 text-text-primary border-border'
                    }`}
                >
                    {saved ? '수정' : '기록'}
                </button>
            </div>

            {open && (
                <div className="mt-2.5 pt-2.5 border-t border-border flex flex-col gap-2" onClick={e => e.stopPropagation()}>
                    {/* 신고값 / 실측값 전환 */}
                    <div className="flex gap-1">
                        {(['DECLARED', 'ACTUAL'] as CargoReportKind[]).map(k => (
                            <button key={k} onClick={() => setKind(k)}
                                className={`flex-1 py-1.5 rounded text-[11px] font-bold border ${
                                    kind === k ? 'bg-info/20 text-info border-info/50' : 'bg-transparent text-text-muted border-border'
                                }`}>
                                {k === 'DECLARED' ? '📞 통화로 들음' : '👁 현장 확인'}
                            </button>
                        ))}
                    </div>

                    {/* 적요에 적힌 것 — 한 번 탭하면 아래 칩에 들어간다 */}
                    {hasCargoHints(hints) && (
                        <button onClick={applyHints}
                            className="flex items-center gap-2 text-left px-2 py-1.5 rounded-md bg-warning/10 border border-warning/35 border-dashed">
                            <span className="text-[10px] font-black text-warning flex-shrink-0">적요에서</span>
                            <span className="text-[11px] text-text-primary font-bold flex-1 truncate">{hints.summary}</span>
                            <span className="text-[10px] font-black text-warning flex-shrink-0">적용 ▸</span>
                        </button>
                    )}

                    <Row title="크기">
                        {CARGO_SIZES.map(sz => (
                            <button key={sz} onClick={() => setSize(sz)}
                                className={chip(eff.sizeClass === sz, size === undefined && ghost?.sizeClass === sz)}>{sz}</button>
                        ))}
                    </Row>

                    <Row title="개수">
                        {QUANTITIES.map(q => (
                            <button key={q} onClick={() => setQty(q)}
                                className={chip(eff.quantity === q, qty === undefined && ghost?.quantity === q)}>
                                {q === 10 ? '10+' : q}
                            </button>
                        ))}
                    </Row>

                    <Row title="상하차">
                        {HANDLING_METHODS.map(h => (
                            <button key={h} onClick={() => setHandling(h)}
                                className={chip(eff.handling === h, handling === undefined && ghost?.handling === h)}>{h}</button>
                        ))}
                    </Row>

                    {/* 화물 성질 — 취급 방법과 시간 민감도를 결정한다.
                        위험물 + 식료품처럼 함께 실을 수 없는 조합은 서버가 판정에서 걸러낸다. */}
                    <Row title="성질">
                        {CARGO_TAGS.map(t => {
                            const on = tags.includes(t);
                            return (
                                <button key={t}
                                    onClick={() => setTags(prev => on ? prev.filter(x => x !== t) : [...prev, t])}
                                    title={CARGO_TAG_META[t].hint}
                                    className={`px-2 py-1.5 rounded-md text-[11px] font-bold border transition-colors ${
                                        on ? 'bg-info text-white border-info' : 'bg-surface-alt/40 text-text-primary border-border'
                                    }`}>
                                    {CARGO_TAG_META[t].icon} {t}
                                </button>
                            );
                        })}
                    </Row>

                    {/* 🔴 마감 시각 — 이게 있어야 합짐 우회를 몇 분까지 허용할지 계산할 수 있다.
                        기사님: "2시에 잡았는데 5시까지는 와야 한다" */}
                    <Row title="마감">
                        {DEADLINE_PRESETS.map(([label, mins]) => {
                            const iso = presetToIso(mins);
                            const on = deadlineAt && Math.abs(new Date(deadlineAt).getTime() - new Date(iso).getTime()) < 90_000;
                            return (
                                <button key={label} onClick={() => setDeadlineAt(on ? undefined : iso)}
                                    className={chip(!!on)}>{label}</button>
                            );
                        })}
                    </Row>

                    {deadlineAt && (() => {
                        // 남은 주행 시간을 모르면 0으로 본다 — 여기서는 "마감까지 몇 분"이 핵심이다
                        const slack = computeSlackMinutes(deadlineAt, 0, Date.now());
                        const d = describeSlack(slack);
                        return (
                            <div className={`text-[11px] font-bold px-2 py-1.5 rounded-md ${
                                d.level === 'tight' ? 'bg-danger/12 text-danger'
                                : d.level === 'ample' ? 'bg-success/12 text-success'
                                : 'bg-info/10 text-info'
                            }`}>
                                🕒 {hhmm(deadlineAt)}까지 · {d.text}
                            </div>
                        );
                    })()}

                    <input
                        value={memo}
                        onChange={e => setMemo(e.target.value)}
                        placeholder="메모 (선택) — 예: 지하 2층, 경비실 통과"
                        className="w-full bg-surface-alt/40 border border-border rounded-md px-2 py-2 text-[12px] text-text-primary placeholder:text-text-muted/70"
                    />

                    <div className="flex items-center justify-between gap-2">
                        {/* 이 짐이 몇 점을 먹는지 즉시 보여준다 — 합짐 여력을 그 자리에서 판단할 수 있게 */}
                        <span className="text-[11px] text-text-muted">
                            적재 <b className="text-text-primary tabular-nums">{points}</b>점
                            <span className="opacity-70"> / 1t = 30점</span>
                        </span>
                        <button onClick={save}
                            className="px-4 py-2 rounded-md bg-info text-white text-[12px] font-black active:scale-[0.98] transition-transform">
                            저장
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2">
            <span className="w-[38px] flex-shrink-0 text-[11px] font-bold text-text-muted">{title}</span>
            <div className="flex gap-1.5 flex-wrap">{children}</div>
        </div>
    );
}
