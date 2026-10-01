import { useState } from 'react';
import { deviceLabel } from '@onedal/shared';
import { EXAMPLE_STAGE, example, useExampleTick } from '../api/example';
import { Card, PageHeader, Stat, fmtDateTime, fmtTime, memberName, ExampleBand } from '../ui';

/**
 * 🧰 **현황판(점검)** — 관제웹 PC 오른쪽 현황판 가운데 «여러 폰을 한눈에 · 서버 점검 · 필터 전문 · 버린 콜»을 여기로 옮긴다
 *    (기사님 «현황판도 어드민 어딘가로 이사» · 칸 표는 reviews/31). 운전 중 기사가 1~2초에 보는 것(내 폰 · 내 필터 · 내 콜)은 관제웹에 남는다.
 *    🔴 관제웹 현황판 코드는 아직 그대로다 — 이 쪽은 예시 자료이고, 이사는 기사님이 보신 뒤다.
 */


export default function Board() {
    useExampleTick();
    const members = example.members();
    const phones = example.phones();
    const [who, setWho] = useState('m-driver1');
    const [phoneId, setPhoneId] = useState('d-3f1c9a2e-7b4d-4e8a-9c1d-0a6b2e5f7c11');
    const pd = example.boardPhoneDetail(phoneId);
    const phone = phones.find(p => p.deviceId === phoneId);

    return (
        <>
            <PageHeader title="현황판 (점검)" sub="관제웹 오른쪽 현황판에서 옮겨 온 칸 — 여러 폰 · 서버 · 필터 전문 · 버린 콜" />
            <ExampleBand stage={EXAMPLE_STAGE.board} />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <Stat label="서버 부팅" value={fmtDateTime(example.boardServer().bootedAt)} hint={`${example.boardServer().branch} · ${example.boardServer().commit}`} />
                <Stat label="소켓 연결" value={example.boardServer().sockets} hint="관제웹 · 운영센터" />
                <Stat label="마지막 폰 보고" value={fmtTime(example.boardServer().lastScrapAt)} tone="ok" />
                <Stat label="DB · 시간대" value={example.boardServer().db} hint={example.boardServer().tz} />
                <Stat label="어긋남" value={0} tone="ok" hint="화면 두 자리가 다른 말" />
            </div>

            <Card title="📱 폰 — 관제웹 현황판 «앱» 탭에서 옮김 (이 폰이 든 필터 · 일하고 있나 · 성적표 · 누적)">
                <div className="flex flex-wrap gap-2">
                    {phones.filter(p => p.deviceName.includes('배차망')).map(p => (
                        <button key={p.deviceId} type="button" onClick={() => setPhoneId(p.deviceId)} className={`rounded-lg px-3 py-1.5 text-sm ${phoneId === p.deviceId ? 'bg-info/15 text-info font-bold' : 'bg-surface-alt'}`}>
                            <span className={p.status === 'ONLINE' ? 'text-success' : 'text-danger'}>●</span> {memberName(members, p.memberId)} · {deviceLabel(p)}
                        </button>
                    ))}
                </div>
                {pd && phone && (
                    <div className="grid md:grid-cols-4 gap-3 text-sm">
                        <div className="rounded-xl border border-border-card p-3 space-y-1">
                            <div className="text-xs font-bold text-text-muted">📡 이 폰이 든 필터</div>
                            <Row k="지문" v={pd.filterHash} /><Row k="받은 지" v={`${pd.filterAgeSec}초`} tone={pd.filterAgeSec > 600 ? 'warn' : undefined} /><Row k="모드" v={phone.mode} />
                        </div>
                        <div className="rounded-xl border border-border-card p-3 space-y-1">
                            <div className="text-xs font-bold text-text-muted">👁️ 폰이 일하고 있나</div>
                            <Row k="분당 훑기" v={pd.scansPerMin} tone={pd.scansPerMin === 0 ? 'warn' : undefined} /><Row k="마지막 목록" v={`${pd.lastList} · ${pd.listCount}건`} /><Row k="화면 켜짐 · 노드" v={`${pd.screenOn ? '켜짐' : '꺼짐'} · ${pd.nodeCount}`} />
                        </div>
                        <div className="rounded-xl border border-border-card p-3 space-y-1">
                            <div className="text-xs font-bold text-text-muted">🔍 이 폰의 성적표 (마지막 보고)</div>
                            <Row k="본 콜 → 통과" v={`${pd.tally.seen} → ${pd.tally.passed}`} /><Row k="요금 · 지역 · 차종에 막힘" v={`${pd.tally.blockedFare} · ${pd.tally.blockedArea} · ${pd.tally.blockedVehicle}`} />
                        </div>
                        <div className="rounded-xl border border-border-card p-3 space-y-1">
                            <div className="text-xs font-bold text-text-muted">📊 누적</div>
                            <Row k="수집 · 수락" v={`${pd.cumulative.collected} · ${pd.cumulative.accepted}`} /><Row k="취소 / 한도" v={`${pd.cumulative.cancels} / ${pd.cumulative.cancelLimit}`} tone={pd.cumulative.cancels >= pd.cumulative.cancelLimit ? 'warn' : undefined} /><Row k="앱" v={`v${phone.appVersion}`} />
                        </div>
                    </div>
                )}
            </Card>

            <div className="grid lg:grid-cols-2 gap-4">
                <Card title={<span>🧾 필터 전문 — 서버가 준 그대로 · <select value={who} onChange={e => setWho(e.target.value)} className="rounded border border-border-card bg-surface px-2 py-0.5 text-xs">{members.filter(m => m.role !== 'ADMIN' && example.boardFilterFull(m.id)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></span>}>
                    <pre className="text-xs leading-relaxed rounded-xl bg-bg-base border border-border-card p-3 overflow-x-auto">{JSON.stringify(example.boardFilterFull(who), null, 2)}</pre>
                    <p className="text-xs text-text-muted">읽기만 — 필터를 고치는 손잡이는 기사 관제웹에 있습니다.</p>
                </Card>
                <Card title="🗑️ 버린 콜 — 앱이 거른 것 (서버가 받은 그대로)">
                    {example.boardDropped().map((d, i) => (
                        <div key={i} className="text-sm flex justify-between gap-2 border-t border-border-card first:border-t-0 pt-1 first:pt-0">
                            <span><span className="text-text-muted">{fmtTime(d.at)}</span> <b>{memberName(members, d.memberId)}</b> · {d.app} · {d.line}</span>
                            <span className="text-warning shrink-0">{d.why}</span>
                        </div>
                    ))}
                </Card>
            </div>

            <Card title="🧪 시험 도구 — 개발 PC 에서만 (실서버에서는 이 칸이 없다)">
                <p className="text-sm text-text-muted">관제웹 현황판의 «위치 찍기 · 모의 주행(정차 · 서행) · 개별콜 · 시나리오 셋 · 콜 기억 비우기»는 시험 도구라 여기로 옮기되 개발 빌드에서만 그린다. 목업에서는 자리만.</p>
            </Card>
        </>
    );
}

function Row({ k, v, tone }: { k: string; v: string | number; tone?: 'warn' }) {
    return <div className="flex justify-between gap-2"><span className="text-text-muted">{k}</span><span className={`font-semibold ${tone === 'warn' ? 'text-warning' : ''}`}>{v}</span></div>;
}
