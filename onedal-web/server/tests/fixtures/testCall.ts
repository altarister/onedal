import type { CallStop, OfficeOrder } from '@onedal/shared';

/** 지운 맨 위 칸 — 검사 콜이 옛 칸 이름을 못 쓰게 막는다 */
type FlatKey = 'pickup' | 'dropoff' | 'pickupX' | 'pickupY' | 'dropoffX' | 'dropoffY' | 'scheduleText' | 'reservedDay' | 'reservedAt' | 'pickupDistance' | 'deliveryDistance';

export type TestCallFields = { pickups?: CallStop[]; dropoffs?: CallStop[] } & { [K in FlatKey]?: never } & { [key: string]: unknown };

/**
 * 🧪 **검사용 콜 한 건** — 정거장 목록 꼴 콜을 바로 만든다.
 *    `pickups` · `dropoffs` 의 정거장 칸을 그대로 `pickupDetails` · `dropoffDetails` 에 넣고 나머지 콜 칸은 그대로 둔다.
 *    정거장을 안 주면 빈 정거장 한 곳 — 콜은 늘 상차 · 하차가 한 곳 이상이다.
 */
export function testCall({ pickups = [{}], dropoffs = [{}], ...call }: TestCallFields = {}): OfficeOrder {
    return { ...call, pickupDetails: pickups, dropoffDetails: dropoffs } as unknown as OfficeOrder;
}
