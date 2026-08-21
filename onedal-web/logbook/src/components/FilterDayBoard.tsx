import { useState, useEffect } from 'react';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import axios from 'axios';

/**
 * 📊 **설정과 성과** (필터 정의 4장 · 확정안 구현 6의 조회면 · 기사님 확정 4 — 운행일지에)
 *
 * "이 설정이 얼마를 벌었나" — 자정마다 서버가 남긴 하루 기록(설정 스냅샷 + 매출 ·
 * 완료 콜 · 취소 소진 · 판정 색 분포)을 표로 편다. 콜할인율·반경을 감이 아니라
 * 성과로 정하게 하는 자리다. 기록이 없으면(첫 자정 전) 그렇다고 말한다.
 */

interface FilterDay {
    day: string;
    revenue: number;
    calls: number;
    cancels: Record<string, number>;
    colors: Record<string, number>;
    settings: Record<string, { destinationCity?: string; pickupRadiusKm?: number;
        detourAllowKm?: number; dropoffRadiusKm?: number; discountPct?: number }>;
}

const COLOR_EMOJI: Record<string, string> = { '꿀': '🔵', '보통': '🟢', '똥': '🟡', '사고': '🔴' };

export default function FilterDayBoard() {
    const [days, setDays] = useState<FilterDay[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState<string | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        axios.get<{ days: FilterDay[] }>('/api/logbook/filter-days', {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((res) => setDays(res.data.days))
            .catch((err) => {
                console.error('filter-days API 호출 실패:', err);
                setError('설정과 성과를 불러오지 못했습니다.');
            });
    }, []);

    return (
        <div className="bg-surface rounded-lg border border-border-card shadow-sm p-6">
            <div className="flex items-center gap-2 mb-1">
                <SlidersHorizontal className="w-4 h-4 text-text-muted" />
                <h3 className="font-bold">설정과 성과</h3>
            </div>
            <p className="text-xs text-text-muted mb-4">
                그날의 필터 설정이 얼마를 벌었나 — 자정마다 한 줄씩 쌓입니다. 콜할인율·반경 조정의 근거가 됩니다.
            </p>

            {error && <p className="text-sm text-danger">{error}</p>}
            {!error && days === null && <Loader2 className="w-5 h-5 animate-spin text-text-muted" />}
            {!error && days?.length === 0 && (
                <p className="text-sm text-text-muted">아직 기록이 없습니다 — 첫 자정이 지나면 어제 치가 여기 쌓입니다.</p>
            )}

            {!!days?.length && (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-text-muted border-b border-border-card">
                                <th className="py-2 pr-3">날짜</th>
                                <th className="py-2 pr-3 text-right">매출</th>
                                <th className="py-2 pr-3 text-right">완료</th>
                                <th className="py-2 pr-3">취소 소진</th>
                                <th className="py-2 pr-3">판정 색</th>
                                <th className="py-2">그날 설정</th>
                            </tr>
                        </thead>
                        <tbody>
                            {days.map((d) => (
                                <FilterDayRow key={d.day} d={d} open={open === d.day}
                                    onToggle={() => setOpen(open === d.day ? null : d.day)} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function FilterDayRow({ d, open, onToggle }: { d: FilterDay; open: boolean; onToggle: () => void }) {
    const first = d.settings?.first;
    const cancelsText = Object.entries(d.cancels).length
        ? Object.entries(d.cancels).map(([app, n]) =>
            `${app === 'insung' ? '인성' : app === 'hwamul24' ? '24시' : app} ${n}`).join(' · ')
        : '0';
    const colorsText = Object.entries(d.colors)
        .map(([c, n]) => `${COLOR_EMOJI[c] ?? c}${n}`).join(' ') || '—';

    return (
        <>
            <tr className="border-b border-border-card/60 hover:bg-surface-hover/40 cursor-pointer" onClick={onToggle}>
                <td className="py-2 pr-3 font-medium tabular-nums">{d.day}</td>
                <td className="py-2 pr-3 text-right font-bold tabular-nums">{d.revenue.toLocaleString()}원</td>
                <td className="py-2 pr-3 text-right tabular-nums">{d.calls}콜</td>
                <td className="py-2 pr-3 tabular-nums">🚫 {cancelsText}</td>
                <td className="py-2 pr-3">{colorsText}</td>
                <td className="py-2 text-xs text-text-muted">
                    {first
                        ? `첫짐 ${first.destinationCity || '—'} · 상차 ${first.pickupRadiusKm}km · 할인 ${first.discountPct}% ${open ? '▲' : '▼'}`
                        : '—'}
                </td>
            </tr>
            {open && (
                <tr className="border-b border-border-card/60 bg-surface-hover/20">
                    <td colSpan={6} className="py-2 px-3 text-xs text-text-muted">
                        {Object.entries(d.settings).map(([phase, s]) => (
                            <span key={phase} className="inline-block mr-4 tabular-nums">
                                <b>{phase}</b> {s.destinationCity ? `${s.destinationCity} · ` : ''}상차 {s.pickupRadiusKm}km · 우회 {s.detourAllowKm}km · 하차 {s.dropoffRadiusKm}km · 할인 {s.discountPct}%
                            </span>
                        ))}
                    </td>
                </tr>
            )}
        </>
    );
}
