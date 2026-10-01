import type { OpsBoardKakao, OpsMember } from '@onedal/shared';
import { api, useOps } from '../api/ops';
import { kakaoTotalOf } from '../api/kakaoTotal';
import { Card, ErrorBand, KV, Table, memberName, type Column } from '../ui';

/**
 * 🗺️ **카카오 호출 — 오늘 / 이달** (서버 `GET /api/ops/board/kakao` · 표 `kakao_usage_days` · 읽기만).
 *    카카오 키는 하나를 모두가 나눠 쓴다 — 누가(또는 서버 스스로가) 많이 쓰는지 본다. 길찾기와 좌표 찾기는 카카오 한도가 따로라 칸을 나눈다.
 *    «주인 없음» = 요청 흐름 밖에서 서버가 스스로 부른 것(로컬에서는 시뮬레이터 문의 호출도 여기 쌓인다).
 *    🔴 한도 숫자 · 경고 색은 없다 — «몇 건이면 위험»은 설정값이라 기사님이 정하신 뒤에 넣는다. 수만 보인다.
 *    한 덩어리 부품이다 — 놓는 쪽은 회원 목록과 다시 읽는 박자(`tick`)만 준다.
 */
type Row = OpsBoardKakao['rows'][number];
const pair = (v: { today: number; month: number }) => `${v.today} / ${v.month}`;

export default function KakaoUsageCard({ members, tick }: { members: OpsMember[]; tick: number }) {
    const { data, error, reload } = useOps(() => api.boardKakao(), [tick]);
    const rows = data?.rows ?? [];
    const total = kakaoTotalOf(rows);
    const who = (r: Row) => r.memberId == null ? '주인 없음 — 서버가 스스로 부른 것' : memberName(members, r.memberId);
    const cols: Column<Row>[] = [
        { key: 'who', label: '누구', render: r => r.memberId == null ? <span className="text-text-muted">{who(r)}</span> : <b>{who(r)}</b> },
        { key: 'route', label: '길찾기 오늘 / 이달', render: r => pair(r.route) },
        { key: 'local', label: '좌표 찾기 오늘 / 이달', render: r => pair(r.local) },
    ];
    return (
        <Card title={`🗺️ 카카오 호출 — 오늘 / 이달${data ? ` (${data.day})` : ''} · 키 하나를 모두가 나눠 쓴다`}>
            {error && <ErrorBand text={error} onRetry={reload} />}
            <Table rows={rows} columns={cols} rowKey={r => r.memberId ?? '(주인 없음)'} empty={data ? '이달 호출 없음' : '읽는 중…'} card={r => (
                <div className="space-y-1">
                    <div className={r.memberId == null ? 'text-text-muted' : 'font-bold'}>{who(r)}</div>
                    <KV k="길찾기 오늘 / 이달" v={pair(r.route)} />
                    <KV k="좌표 찾기 오늘 / 이달" v={pair(r.local)} />
                </div>
            )} />
            {rows.length > 0 && (
                <div className="flex flex-wrap justify-between gap-2 text-sm font-bold border-t border-border-card pt-2">
                    <span>합계</span>
                    <span>길찾기 {pair(total.route)} · 좌표 찾기 {pair(total.local)}</span>
                </div>
            )}
        </Card>
    );
}
