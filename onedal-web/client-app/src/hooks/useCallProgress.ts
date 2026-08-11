import { useEffect, useState } from 'react';
import { socket } from '../lib/socket';
import type { CargoReport } from '@onedal/shared';

export interface MilestoneRow { milestone: string; occurredAt: string; predictedAt?: string }
export interface CallRecords { reports: CargoReport[]; milestones: MilestoneRow[] }

/**
 * 진행 중인 **여러 콜의 기록을 한 곳에서** 받아 둔다.
 *
 * ══ 왜 카드 밖으로 뺐는가 ══
 *
 * 기사님: *"진행 중인 콜이 2개 있다면 각각 어디까지 진행되고 있는지
 * **모두 스와이핑해야만 보인다.** 그건 문제가 있다. 스와이프 영역 위에
 * 콜마다의 진행 상황이 노출되어야 **폰에 손대지 않고**
 * 아직 전화하지 않은 부분이 어디인지 인지할 수 있을 것 같다."*
 *
 * 예전에는 각 카드가 자기 것만 따로 불러왔다. 그래서 **덱 위에 요약을 띄울 수가 없었다** —
 * 화면에 없는 카드의 진행 상황은 아무도 몰랐기 때문이다.
 * 기록을 위로 올리면 요약도, 카드도 **같은 하나의 출처**를 본다.
 *
 * 서버는 저장·보고 직후 `cargo-report-saved` · `milestone-log` 를 그 소켓으로 되쏜다.
 * 그래서 여기서 한 번만 듣고 있으면 카드가 따로 물을 이유가 없다.
 * (요청은 이 훅만 보낸다 — 두 곳에서 물으면 응답이 겹쳐 어느 쪽이 최신인지 알 수 없다)
 */
export function useCallProgress(orderIds: string[]): Map<string, CallRecords> {
    const [records, setRecords] = useState<Map<string, CallRecords>>(new Map());

    // 배열은 매 렌더 새 참조라 의존성으로 못 쓴다 — 내용으로 비교한다
    const key = orderIds.join(',');

    useEffect(() => {
        const ids = key ? key.split(',') : [];
        if (ids.length === 0) return;

        const put = (orderId: string, patch: Partial<CallRecords>) =>
            setRecords(prev => {
                const cur = prev.get(orderId) ?? { reports: [], milestones: [] };
                const next = new Map(prev);
                next.set(orderId, { ...cur, ...patch });
                return next;
            });

        const onReports = (d: { orderId: string; reports: CargoReport[] }) =>
            put(d.orderId, { reports: d.reports || [] });
        const onMilestones = (d: { orderId: string; milestones: MilestoneRow[] }) =>
            put(d.orderId, { milestones: d.milestones || [] });

        socket.on('cargo-report-saved', onReports);
        socket.on('milestone-log', onMilestones);
        for (const id of ids) {
            socket.emit('request-cargo-reports', { orderId: id });
            socket.emit('request-milestones', { orderId: id });
        }
        return () => {
            socket.off('cargo-report-saved', onReports);
            socket.off('milestone-log', onMilestones);
        };
    }, [key]);

    return records;
}

/** 기록이 아직 안 온 콜도 빈 값으로 다룬다 — `undefined` 를 화면마다 방어하지 않게 */
export const EMPTY_RECORDS: CallRecords = { reports: [], milestones: [] };
