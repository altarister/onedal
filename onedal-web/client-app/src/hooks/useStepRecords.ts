/**
 * 🔄 **파생 치환 ① — 타임라인·카운트다운의 재료를 새 장부에서** (2026-08-21)
 *
 * `useCallProgress` 가 옛 장부(통화신고·마일스톤 이벤트)를 모으듯, 이 훅은
 * **여섯 단계 행**(`steps-synced`)을 모아 옛 장부 모양으로 바꿔(`recordsOfSteps`)
 * 내놓는다. `deriveRouteTimeline` 등 계산은 한 줄도 안 바뀐다 — 재료 출처만 바뀐다.
 *
 * 서버는 KEEP·통화 저장·마일스톤·GPS·되돌리기·경로 재계산 때마다 `steps-synced` 를
 * 쏘므로, 옛 이벤트(`cargo-report-saved`·`milestone-log`)와 같은 시점에 갱신된다.
 */
import { useEffect, useState } from 'react';
import { socket } from '../lib/socket';
import { recordsOfSteps, dwellLedgerOfSteps } from '@onedal/shared';
import type { StepViewRow } from '@onedal/shared';
import type { CallRecords } from './records';

export function useStepRecords(orderIds: string[]): Map<string, CallRecords> {
    const [records, setRecords] = useState<Map<string, CallRecords>>(new Map());

    const key = orderIds.join(',');
    useEffect(() => {
        const onSynced = (p: { orderId: string; steps: StepViewRow[] }) => {
            if (!orderIds.includes(p.orderId)) return;
            setRecords(prev => {
                const next = new Map(prev);
                // ⏱️ 손으로 적은 정차도 함께 — 타임라인이 이걸로 뒤를 민다 (「−5분」)
                next.set(p.orderId, {
                    ...(recordsOfSteps(p.steps) as CallRecords),
                    dwell: dwellLedgerOfSteps(p.steps),
                });
                return next;
            });
        };
        socket.on('steps-synced', onSynced);
        // 처음 열 때 저장된 것을 읽는다 — 새로고침해도 카운트다운이 바로 선다
        for (const id of orderIds) socket.emit('request-steps', { orderId: id });
        return () => { socket.off('steps-synced', onSynced); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return records;
}
