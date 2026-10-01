import { Link } from 'react-router-dom';
import { Button } from '@onedal/ui/button';
import { EXAMPLE_STAGE, example, useExampleTick } from '../api/example';
import { Card, StatusBadge, fmtTime, memberName, todayKey, ExampleBand } from '../ui';

/** 🎫 매달 멤버 대조(«회원» 쪽의 칸 · 12월 뒤) — 멤버 전용 게시물의 확인 번호와 회원이 적은 번호를 견준다 (reviews/29 Q8) */
export default function MembersCheck() {
    useExampleTick();
    const members = example.members();
    const checks = example.checks();
    const code = example.monthCode();
    const month = todayKey().slice(0, 7);
    const expiring = members.filter(m => m.paidUntil && m.role !== 'ADMIN').sort((a, b) => (a.paidUntil! < b.paidUntil! ? -1 : 1));

    return (
        <>
            <ExampleBand stage={EXAMPLE_STAGE.checks} />
            <div className="grid md:grid-cols-3 gap-4">
                <Card title={`이번 달 확인 번호 — ${month}`}>
                    <div className="text-4xl font-black tracking-widest">{code}</div>
                    <p className="text-xs text-text-muted">멤버 전용 게시물에 올린 번호. 회원은 관제웹에서 이 번호를 적는다. 다음 달에는 새 번호로.</p>
                    <Button type="button" size="sm" variant="outline" onClick={() => alert('예시입니다 — 6단계에서 서버가 새 번호를 만들고 이전 번호는 닫습니다')}>새 번호 만들기</Button>
                </Card>
                <Card title="이번 달 대조" className="md:col-span-2">
                    <table className="w-full text-sm">
                        <thead className="text-xs text-text-muted"><tr><th className="text-left py-1">회원</th><th className="text-left">적은 번호</th><th className="text-left">결과</th><th className="text-left">유료 기한</th><th></th></tr></thead>
                        <tbody>
                            {checks.map(c => {
                                const m = members.find(x => x.id === c.memberId)!;
                                const match = c.codeEntered === code;
                                return (
                                    <tr key={c.memberId} className="border-t border-border-card">
                                        <td className="py-2"><Link to={`/members/${m.id}`} className="font-bold underline-offset-2 hover:underline">{m.name}</Link> <StatusBadge m={m} /></td>
                                        <td className={c.codeEntered ? (match ? 'text-success font-bold' : 'text-danger font-bold') : 'text-text-muted'}>{c.codeEntered ?? '안 적음'}</td>
                                        <td>{c.result === 'OK' ? `✓ 일치 (${fmtTime(c.checkedAt)})` : c.result === 'MISMATCH' ? '✗ 불일치' : '—'}</td>
                                        <td>{m.paidUntil ?? '없음'}</td>
                                        <td className="text-right">
                                            {!c.result && c.codeEntered && <Button type="button" size="xs" onClick={() => example.checkMember(m.id, match)}>{match ? '일치 → 기한 +1달' : '불일치로 적기'}</Button>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </Card>
            </div>
            <Card title="기한 만료 예정 — 지나면 서버가 자동 정지 → 14일 유예 → 탈퇴 처리는 관리자 손">
                {expiring.length === 0 && <p className="text-sm text-text-muted">없습니다</p>}
                {expiring.map(m => <div key={m.id} className="text-sm flex justify-between"><span>{memberName(members, m.id)}</span><span className="text-text-muted">{m.paidUntil}</span></div>)}
            </Card>
        </>
    );
}
