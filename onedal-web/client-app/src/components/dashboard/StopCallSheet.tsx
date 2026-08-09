import { useState } from 'react';
import { CARGO_SIZES, HANDLING_METHODS, cargoPoints } from '@onedal/shared';
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
    /** 현장 도착 후 실측 입력 모드를 기본으로 연다 */
    defaultKind?: CargoReportKind;
}

export default function StopCallSheet({
    orderId, stopType, label, address, contactName, phones, reports, defaultKind = 'DECLARED',
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

    const eff = {
        sizeClass: size ?? ghost?.sizeClass,
        quantity: qty ?? ghost?.quantity,
        handling: handling ?? ghost?.handling,
    };
    const points = cargoPoints(eff);

    const save = () => {
        socket.emit('save-cargo-report', {
            orderId, stopType, kind,
            sizeClass: eff.sizeClass, quantity: eff.quantity, handling: eff.handling,
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
