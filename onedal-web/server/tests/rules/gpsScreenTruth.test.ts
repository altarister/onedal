import { readFileSync } from 'fs';
import { join } from 'path';

const client = (rel: string) => readFileSync(
    join(__dirname, '../../../client-app/src', rel), 'utf8');
const code = (rel: string) => client(rel).split('\n')
    .filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');

/**
 * 🛰️ **GPS 는 "도착"까지만 안다 — "상차했다"는 보고만 안다** (2026-08-19 실측)
 *
 * 상단 요약이 "상차 1건 (1t)" 라고 표시했는데, 장부(orders.status)는 두 콜 다
 * ORDER_CONFIRMED — 상차 보고를 누른 적이 없다. `VehicleStatusPanel` 이
 * **GPS 가 상차지 500m 안을 지나가면 상차 완료로 간주**하는 자체 pickedUpSet 을
 * 들고 있었다. 지나가기만 해도 실은 것이 되는 추측이고, 카드·장부와 다른 말을
 * 하는 "한 화면 두 세상" 클래스다 (#11 과 같은 뿌리).
 *
 * 실었는가의 원천은 하나 — 기사님의 상차 완료 보고(ORDER_PICKED_UP), 판별은
 * shared 의 isAlreadyLoaded 하나다.
 */
describe('적재 요약 — 상차는 추측하지 않는다', () => {
    it('🔴 GPS 근접으로 상차를 간주하는 로컬 세트가 없다', () => {
        expect(code('components/dashboard/VehicleStatusPanel.tsx')).not.toMatch(/pickedUpSet/);
    });

    it('🔴 예약/상차 분류는 상태(isAlreadyLoaded) 하나로 한다', () => {
        expect(code('components/dashboard/VehicleStatusPanel.tsx')).toMatch(/isAlreadyLoaded/);
    });
});

/**
 * 🖥️ **다음 정거장에 가까워지면 그 콜 화면으로** (기사님 2026-08-19)
 *
 * *"모의 주행이 현 경유지에 가까이 왔을 때 화면에 보이도록 화면 선택해 줄 수 있을까?"*
 * 서버가 이미 근접 예고(next-stop-approaching)·도착(auto-arrived)에 orderId 를
 * 실어 보낸다 — 덱이 그 콜 카드로 넘어간다.
 */
describe('덱 — 근접·도착한 정거장의 콜로 화면이 따라간다', () => {
    it('🔴 PinnedRoute 가 근접/도착 이벤트를 받아 덱에 넘긴다', () => {
        // 0831 개편: 근접/도착 구독은 파생 제조소로 이사 — 불변식은 그대로다
        const c = code('components/dashboard/PinnedRoute.tsx') + code('hooks/useRouteDerivations.ts') + code('stores/gpsFocusStore.ts');
        expect(c).toMatch(/next-stop-approaching/);
        expect(c).toMatch(/auto-arrived/);
    });

    it('🔴 CallDeck 이 그 콜 카드로 이동한다', () => {
        expect(code('components/dashboard/CallDeck.tsx')).toMatch(/gpsFocus/);
    });
});
