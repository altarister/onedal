import { LIST_SCREENS, PICKER_SCREEN_LABELS, screenLabelOf, isListScreen } from '@onedal/shared';

/**
 * 📋 **픽커 «내 오더» 탭은 관제웹에 «내 오더»로 보인다** (기사님 지시 · 이름표가 없으면 «알 수 없는 화면»으로 뜬다)
 *
 * 🔴 리스트 계열(`LIST_SCREENS`)이 아니다 — 넣으면 서버의 «리스트로 이탈» 정리가 미리보기 콜을 곧바로 치운다.
 *    픽커는 수락하면 곧바로 내 오더로 오므로, 그 순간 콜을 치우면 원달앱의 승격(딱지 없는 `/detail`)이 빈 자리에 들어간다.
 */
describe('📋 픽커 내 오더 화면 이름', () => {
    it('픽커 이름표에 «내 오더»가 있다 — 알 수 없는 화면이 아니다', () => {
        expect(PICKER_SCREEN_LABELS.MY_ORDERS?.label).toBe('내 오더');
        expect(screenLabelOf('kakaopicker', 'MY_ORDERS')?.label).toBe('내 오더');
    });

    it('🔴 리스트 계열이 아니다 — 서버가 미리보기 콜을 치우지 않게', () => {
        expect(LIST_SCREENS).not.toContain('MY_ORDERS');
    });
});

/**
 * 📋 **«내 오더» 하나 + «목록 복귀인가»는 배차망 정의 표의 사실** (reviews/35 5단계).
 * 새 원달앱은 인성 완료 탭 · 화물24시 배차내역 목록도 MY_ORDERS 로 보내고 페이지 이름을 싣는다 — 서버가 표에서 목록 복귀를 찾는다.
 * 옛 원달앱의 LIST_COMPLETED 는 그대로 목록 복귀다.
 */
describe('📋 내 오더 + 목록 복귀는 표에서', () => {
    it('인성 완료 탭 · 화물24시 배차내역 목록은 목록 복귀 — 픽커 내 오더 탭은 아니다', () => {
        expect(isListScreen('MY_ORDERS', 'insung', '완료 탭')).toBe(true);
        expect(isListScreen('MY_ORDERS', 'hwamul24', '배차내역 목록')).toBe(true);
        expect(isListScreen('MY_ORDERS', 'kakaopicker', '내 오더 탭')).toBe(false);
    });

    it('페이지 이름이 없으면(옛 원달앱) MY_ORDERS 는 목록이 아니고 LIST_COMPLETED 는 목록이다', () => {
        expect(isListScreen('MY_ORDERS')).toBe(false);
        expect(isListScreen('LIST_COMPLETED')).toBe(true);
        expect(isListScreen('LIST', 'insung', '신규 콜 목록')).toBe(true);
    });
});
