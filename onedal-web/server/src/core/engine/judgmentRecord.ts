import type { JudgedCallInfo, JudgedFilterInfo } from '@onedal/shared';

/**
 * 🧾 **판정할 때 함께 남길 «무슨 콜이었고 어떤 필터였나»** (reviews/43 · 기사님 «1 예»).
 *
 * 미리보기 · 체험 콜은 orders 에 안 쓰이고 판정 표에만 남는다 — 그 한 줄에 콜 내용과 판정 때의 서버 필터를
 * 같이 적어야 운영센터가 «오늘 안 잡은 콜이 어떤 필터로 올라와 무슨 색 몇 점이었나»를 보여 준다.
 * 판정 시작 때 뜬 필터 사진(`snap.filter`)을 받는다 — 판정 도중 필터가 바뀌어도 그 판정의 필터다.
 * 🔴 필터는 **서버 필터**다 — 원달앱이 걸러 올린 폰 필터와는 다음 보고까지 한 판 어긋날 수 있다.
 */
type CallLike = { pickup?: string; dropoff?: string; fare?: number; targetApp?: string | null; isPreview?: boolean; isSimulated?: boolean };
type FilterLike = {
    destinationCity?: string | null; goalCity?: string | null; callTarget?: string | null;
    pickupRadiusKm?: number | null; minFare?: number | null; isActive?: boolean | null; userOverrides?: boolean;
    pickupKeywords?: string[]; destinationKeywords?: string[]; excludedKeywords?: string[];
};

export function judgmentRecordOf(order: CallLike, filter: FilterLike): { call: JudgedCallInfo; filter: JudgedFilterInfo } {
    return {
        call: {
            pickup: order.pickup ?? '',
            dropoff: order.dropoff ?? '',
            fare: order.fare ?? 0,
            targetApp: order.targetApp ?? null,
            kind: order.isSimulated ? '체험' : order.isPreview ? '미리보기' : '콜',
        },
        filter: {
            destinationCity: filter.destinationCity ?? null,
            goalCity: filter.goalCity ?? null,
            callTarget: filter.callTarget ?? null,
            pickupRadiusKm: filter.pickupRadiusKm ?? null,
            minFare: filter.minFare ?? null,
            isActive: filter.isActive ?? null,
            todayOnly: !!filter.userOverrides,
            pickupCount: filter.pickupKeywords?.length ?? 0,
            dropoffCount: filter.destinationKeywords?.length ?? 0,
            excludedCount: filter.excludedKeywords?.length ?? 0,
        },
    };
}
