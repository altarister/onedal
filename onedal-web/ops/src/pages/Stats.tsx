import { useState } from 'react';
import { Button } from '@onedal/ui/button';
import { api } from '../api/ops';
import { Card, PageHeader, fmtWon, memberName, useTick } from '../ui';

/** 📊 콜 흐름 통계 — 어느 동네에서 어디로 가는 콜이 많은가 (회원 칸 포함 · 관리자 문). 회원에게 보내는 것은 3명 이상 섞인 칸만(reviews/25) */
export default function Stats() {
    useTick();
    const members = api.members();
    const rows = api.stats();
    const [by, setBy] = useState<'요일' | '회원'>('요일');
    const max = Math.max(...rows.map(r => r.calls));
    return (
        <>
            <PageHeader title="통계" sub="콜 흐름 — 출발 → 도착 · 건수 · 평균 요금" right={<>{(['요일', '회원'] as const).map(b => <Button key={b} type="button" size="sm" variant={by === b ? 'default' : 'outline'} onClick={() => setBy(b)}>{b}별</Button>)}</>} />
            <Card>
                <table className="w-full text-sm">
                    <thead className="text-xs text-text-muted"><tr><th className="text-left py-1">{by}</th><th className="text-left">출발 → 도착</th><th className="text-left">건수</th><th className="text-left">평균 요금</th><th className="w-1/3"></th></tr></thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr key={i} className="border-t border-border-card">
                                <td className="py-2">{by === '요일' ? r.group : memberName(members, r.memberId)}</td>
                                <td>{r.from} → {r.to}</td>
                                <td className="font-bold">{r.calls}</td>
                                <td>{fmtWon(r.fareAvg)}</td>
                                <td><div className="h-2 rounded bg-info/70" style={{ width: `${(r.calls / max) * 100}%` }} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <p className="text-xs text-text-muted">실물 배차망 콜만 셉니다 — 시뮬레이터 콜은 통계에 안 들어갑니다. 지금은 예시 숫자입니다.</p>
            </Card>
        </>
    );
}
