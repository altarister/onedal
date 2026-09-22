import { LIST_SCREENS, PICKER_SCREEN_LABELS, screenLabelOf } from '@onedal/shared';

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
