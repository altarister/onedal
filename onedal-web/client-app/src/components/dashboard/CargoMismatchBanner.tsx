import { useEffect, useState } from 'react';
import { socket } from '../../lib/socket';
import { telHref } from '../../lib/routeUtils';
import type { SecuredOrder } from '@onedal/shared';

/**
 * [Phase 8.4] 신고 불일치 경고 — 경고에서 **행동까지** 이어진다.
 *
 * 기사님: *"거짓된 통화로 확인되면 퀵사무실과 통화하여 이 콜의 수행 여부를
 * 결정할 수 있어야 함."*
 *
 * 경고만 띄우고 끝내면 기사님이 화면을 나가 전화번호를 다시 찾아야 한다.
 * 그래서 **퀵사무실 전화 버튼과 판단 버튼을 같은 카드에** 둔다.
 * 어느 쪽을 고르든 그 장소에 기록이 남아 다음에 같은 곳을 잡을 때 미리 보인다.
 */
interface Mismatch {
    orderId: string;
    stopType: 'pickup' | 'dropoff';
    ratio: number;
}

export default function CargoMismatchBanner({ orders }: { orders: SecuredOrder[] }) {
    const [alerts, setAlerts] = useState<Mismatch[]>([]);

    useEffect(() => {
        const onMismatch = (m: Mismatch) => {
            setAlerts(prev => {
                // 같은 오더·정거장은 최신 것 하나만 (현장에서 여러 번 고쳐 입력한다)
                const rest = prev.filter(a => !(a.orderId === m.orderId && a.stopType === m.stopType));
                return [...rest, m];
            });
        };
        const onResolved = (d: { orderId: string }) =>
            setAlerts(prev => prev.filter(a => a.orderId !== d.orderId));

        socket.on('cargo-mismatch', onMismatch);
        socket.on('cargo-mismatch-resolved', onResolved);
        return () => {
            socket.off('cargo-mismatch', onMismatch);
            socket.off('cargo-mismatch-resolved', onResolved);
        };
    }, []);

    if (alerts.length === 0) return null;

    return (
        <div className="flex flex-col gap-2 mx-3 mt-3">
            {alerts.map(a => {
                const order = orders.find(o => o.id === a.orderId);
                const where = a.stopType === 'pickup' ? '상차지' : '하차지';
                const bigger = a.ratio >= 1;
                const quickPhone =
                    order?.companyName?.match(/\d{2,3}-\d{3,4}-\d{4}/)?.[0] || order?.dispatcherPhone || '';

                const resolve = (action: 'CONTINUE' | 'RELEASE') =>
                    socket.emit('resolve-cargo-mismatch', {
                        orderId: a.orderId, stopType: a.stopType, ratio: a.ratio, action,
                    });

                return (
                    <div key={`${a.orderId}-${a.stopType}`}
                         className="rounded-xl border border-danger/45 bg-danger/10 px-4 py-3">
                        <div className="flex items-start gap-2.5">
                            <span className="text-lg leading-none mt-0.5">🚨</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-text-primary">
                                    {where} 짐이 신고와 다릅니다 — 실제가 {a.ratio.toFixed(1)}배 {bigger ? '많음' : '적음'}
                                </p>
                                <p className="text-xs text-text-muted mt-0.5 break-keep">
                                    {order ? `${order.pickup} → ${order.dropoff}` : a.orderId.slice(0, 8)}
                                    {bigger && ' · 이대로 실으면 남은 합짐 계획이 깨집니다'}
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-2 mt-2.5">
                            {quickPhone && (
                                <a href={telHref(quickPhone)}
                                   className="flex-1 text-center py-2.5 rounded-md bg-info/15 border border-info/40 text-info text-[12px] font-black">
                                    🏢 사무실 {quickPhone}
                                </a>
                            )}
                            <button onClick={() => resolve('CONTINUE')}
                                    className="flex-1 py-2.5 rounded-md bg-surface-alt/60 border border-border text-text-primary text-[12px] font-black">
                                그대로 수행
                            </button>
                            <button onClick={() => resolve('RELEASE')}
                                    className="flex-1 py-2.5 rounded-md bg-warning/15 border border-warning/45 text-warning text-[12px] font-black">
                                🙋‍♂️ 방출
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
