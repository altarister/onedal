/**
 * 📦 **옛 양식 보고 → 새 원달앱 보고(기본 콜 + 봉투)** (계획서 F2-b · F2-c 준비)
 * 누가: drive · scenario 가 앱 보고(/confirm · /detail)를 흉내 낼 때 부른다
 * 언제: 시험 콜을 «앱이 올린다» 문으로 넣을 때
 * 어디서: cd onedal-web && pnpm drive · pnpm scenario
 * 무엇을: 평평한 시험 콜을 원달앱 최소 기본 콜과 같은 규칙(평평 칸 → 묶음 · 요금은 «옛 요금» 줄)으로 바꾸고 갈래 · 원문 · 시각 · 좌표는 봉투로
 * 왜: 원달앱은 이제 order 를 안 보낸다 — 시험 도구가 서버가 곧 안 받을 모양을 쓰지 않게
 * (shared 를 못 가져오는 스크립트라 같은 규칙을 여기 둔다 — 서버 tests/fixtures/newAppReport.ts · 원달앱 BaseCallReport.minimalOf 와 짝)
 */
export function newAppReport(body) {
    const { order, ...rest } = body;
    const { type, rawText, timestamp, pickupX, pickupY, dropoffX, dropoffY, ...f } = order;
    return {
        ...rest,
        baseCall: {
            id: f.id, targetApp: rest.targetApp ?? f.targetApp,
            /* 연락처는 원달앱 플러그인이 상세 팝업에서 읽어 담는 값 — 시험 콜이 주면 그대로 싣는다 */
            route: { pickup: { addressDetail: f.pickup, ...(f.pickupDetails?.[0] ?? {}) }, dropoff: { addressDetail: f.dropoff, ...(f.dropoffDetails?.[0] ?? {}) }, pickupDistance: f.pickupDistance, deliveryDistance: f.deliveryDistance },
            money: { lines: f.fare > 0 ? [{ kind: 'unknown', won: f.fare, label: '옛 요금' }] : [], paymentType: f.paymentType, billingType: f.billingType },
            load: { vehicleType: f.vehicleType, itemSize: f.itemSize, itemDescription: f.itemDescription },
            time: { pickup: { text: f.scheduleText, reserved: f.reserved, day: f.reservedDay, at: f.reservedAt } },
            job: { tagsText: f.tagsText, detailMemo: f.detailMemo, tripType: f.tripType, orderForm: f.orderForm },
        },
        report: { type, rawText, timestamp, pickupX, pickupY, dropoffX, dropoffY },
    };
}
