import { wonText, MILESTONE_LABEL, timingError } from '@onedal/shared';
import type { SecuredOrder } from '@onedal/shared';
import type { CallRecords } from '../../hooks/records';
import { rawFieldsOf } from './callCardViews';

/**
 * 🗄️ **판정 근거 · 원본 데이터 서랍** — 펼친 콜 카드(`PinnedRouteCard`)의 «위 덩어리» 안, 배송 주행 줄 아래.
 * 이 파일은 위(`PinnedRouteCard`)를 가져오지 않는다 — 방향: PinnedRouteCard → CallEvidenceDrawer → callCardViews.
 * 바깥 일(저장소 · 소켓 · 타이머)을 하는 곳: 없음 — 콜 · 단독 경로 · 마일스톤 이력은 props 로 받는다.
 *
 * 🔴 단독 경로·요금·수수료는 본문에 펴지 않는다 — 덱 헤더가 이미 같은 값을 띄우므로 중복이고, 세로만 잡아먹는다.
 *    판단에 참고하는 값이지 **지금 할 일**이 아니라 여기로 내린다 (문제가 생겼을 때만 연다).
 */
export default function CallEvidenceDrawer({ route, soloKm, soloMin, milestoneLog }: {
    route: SecuredOrder;
    soloKm: number | null | undefined;
    soloMin: number | null | undefined;
    milestoneLog: CallRecords['milestones'];
}) {
    return (
        <details className="group" onClick={e => e.stopPropagation()}>
            <summary className="cursor-pointer list-none text-[11px] font-bold text-text-muted py-1 select-none">
                <span className="group-open:hidden">▸ 판정 근거 · 원본 데이터</span>
                <span className="hidden group-open:inline">▾ 판정 근거 · 원본 데이터</span>
            </summary>

            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted px-0.5 mt-1 mb-2">
                <span>단독 {soloKm ? `${Number(soloKm).toFixed(1)}km / ${soloMin || 0}분` : '연산 중'}</span>
                <span>·</span>
                <span>{wonText(route.fare)}{route.paymentType ? `(${route.paymentType})` : ''}</span>
                {route.commissionRate && <><span>·</span><span>수수료 {route.commissionRate}</span></>}
                {route.scheduleText && <><span>·</span><span className="text-warning font-bold">🕒 {route.scheduleText}</span></>}
            </div>

            {/* 마일스톤 이력 — 진행 점이 이미 "어디까지 왔나"를 보여주므로
                **실제 시각과 예상 오차**가 궁금할 때만 편다 */}
            {milestoneLog.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-text-muted">
                    {milestoneLog.map(m => (
                        <span key={m.milestone}>
                            {MILESTONE_LABEL[m.milestone as keyof typeof MILESTONE_LABEL]} {m.occurredAt?.slice(11, 16)}
                            {(() => {
                                const err = timingError(m.predictedAt, m.occurredAt);
                                if (err === null) return null;
                                return <b className={err > 5 ? 'text-danger ml-1' : 'text-success ml-1'}>
                                    {err > 0 ? `+${err}분` : err < 0 ? `${err}분` : '정시'}
                                </b>;
                            })()}
                        </span>
                    ))}
                </div>
            )}

            {(route.approvalReasons?.length || route.rejectionReasons?.length) ? (
                <div className="flex flex-col gap-1 mb-2 mt-1">
                    {route.approvalReasons?.map((r, i) => (
                        <div key={`a${i}`} className="text-[11px] text-success">👍 {r}</div>
                    ))}
                    {route.rejectionReasons?.map((r, i) => (
                        <div key={`r${i}`} className="text-[11px] text-danger">💩 {r}</div>
                    ))}
                </div>
            ) : null}

            <div className="max-h-56 overflow-y-auto pr-1 flex flex-col gap-1 select-text font-mono">
                {rawFieldsOf(route).map(([k, v]) => (
                    <div key={k} className="flex bg-surface-alt/40 p-1 rounded text-[10px]">
                        <span className="w-[120px] flex-shrink-0 text-text-muted font-bold select-all">route.{k} :</span>
                        <span className="text-text-muted truncate flex-1">{v?.toString() || '-'}</span>
                    </div>
                ))}
                <div className="flex flex-col bg-surface-alt/40 p-1 rounded text-[10px]">
                    <span className="text-text-muted font-bold mb-1 select-all">route.pickupDetails :</span>
                    <span className="text-text-muted break-all whitespace-pre-wrap leading-snug">{JSON.stringify(route.pickupDetails, null, 2) || '-'}</span>
                </div>
                <div className="flex flex-col bg-surface-alt/40 p-1 rounded text-[10px]">
                    <span className="text-text-muted font-bold mb-1 select-all">route.dropoffDetails :</span>
                    <span className="text-text-muted break-all whitespace-pre-wrap leading-snug">{JSON.stringify(route.dropoffDetails, null, 2) || '-'}</span>
                </div>
            </div>
        </details>
    );
}
