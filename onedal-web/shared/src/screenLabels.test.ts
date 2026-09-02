import { describe, it, expect } from 'vitest';
import { deviceScreenBadge } from './screenLabels';

/**
 * 🖥️ **폰 상태 바 — 6번(화면 켜짐)과 9번(화면명)은 배지 하나다**
 * (기사님과 확정 2026-09-02 · `docs/기획/폰_상태바.md` §2).
 *
 * 🔴 **위가 꺼지면 아래는 뜻이 없다.** 화면이 꺼진 폰은 배차망도 화면명도 «아까 그것»이다.
 *    그걸 그대로 그리면 화면이 *"지금 픽커 홈에 있다"* 고 **단언**한다 —
 *    2026-09-02 오전에 세 자리를 고친 «읽지 않고 단언한다» 와 같은 병이다.
 *
 * ⚠️ **표시를 합치는 것이지 값을 합치는 것이 아니다** (설계 문서 §2).
 *    `isScreenOn` 과 `screenContext` 는 그대로 둔 채, 그리는 자리에서만 하나로 고른다.
 */
describe('deviceScreenBadge — 화면 켜짐과 화면명은 한 배지', () => {
    it('화면이 꺼져 있으면 배지는 «💤 화면 꺼짐» 하나뿐 — 배차망·화면명이 함께 나가지 않는다', () => {
        const badge = deviceScreenBadge({
            status: 'ONLINE',
            targetApp: 'kakaopicker',
            screenContext: 'LIST',
            isScreenOn: false,
        });
        expect(badge).not.toBeNull();
        expect(badge!.label).toBe('💤 화면 꺼짐');
        expect(badge!.network).toBeNull();
        // 옛 화면명이 어디로도 새 나가면 안 된다
        expect(badge!.label).not.toContain('리스트');
    });

    it('화면이 켜져 있으면 배차망 + 화면명을 함께 그린다', () => {
        const badge = deviceScreenBadge({
            status: 'ONLINE',
            targetApp: 'kakaopicker',
            screenContext: 'LIST',
            isScreenOn: true,
        });
        expect(badge!.network).toBe('픽커');
        expect(badge!.label).toBe('콜리스트');   // 폭을 아끼려 낱말을 붙인다 (기사님 0831)
    });

    it('화면 켜짐을 안 보내는 구앱은 예전처럼 그린다 — 모름을 «꺼짐»으로 지어내지 않는다', () => {
        const badge = deviceScreenBadge({
            status: 'ONLINE',
            targetApp: 'insung',
            screenContext: 'DETAIL_PRE_CONFIRM',
        });
        expect(badge!.network).toBe('인성');
        expect(badge!.label).toBe('상세페이지');
    });

    /**
     * 📵 **말이 없는 폰의 화면 이름은 «아까 그것»이다** (기사님 지적 2026-09-02:
     * *"접근성 꺼지면 알 수 없는 화면으로 나오는데 '접근성 꺼짐' 이렇게 표현되면 좋겠는데"*).
     *
     * 옛 화면 이름을 계속 그리면 화면이 *"지금 이 화면이다"* 라고 단언한다 — 그 폰은
     * 아무 말도 안 하고 있는데. 오전에 고친 «읽지 않고 단언한다»의 마지막 자리다.
     */
    it('끊긴 폰에는 옛 화면 이름 대신 «왜 끊겼는지»를 그린다', () => {
        const badge = deviceScreenBadge({
            status: 'OFFLINE',
            targetApp: 'insung',
            screenContext: 'LIST',
            isScreenOn: false,
            offlineReason: 'ACCESSIBILITY_OFF',
        });
        expect(badge!.network).toBeNull();
        expect(badge!.label).toBe('접근성 꺼짐');
        expect(badge!.label).not.toContain('리스트');
    });

    it('앱이 스스로 내려간 것과 접근성이 꺼진 것을 가른다 — 하실 일이 다르다', () => {
        expect(deviceScreenBadge({ status: 'OFFLINE', offlineReason: 'APP_SHUTDOWN' })!.label)
            .toBe('앱 꺼짐');
    });

    it('까닭을 못 들었으면 «연결 끊김» — 지어내지 않는다 (규칙 ④)', () => {
        const badge = deviceScreenBadge({ status: 'OFFLINE', targetApp: 'insung', screenContext: 'LIST' });
        expect(badge!.label).toBe('연결 끊김');
    });

    it('화면명도 배차망도 없으면 아무것도 안 그린다', () => {
        expect(deviceScreenBadge({ status: 'ONLINE' })).toBeNull();
    });

    it('배차망만 알고 화면을 모르면 배차망만 그린다', () => {
        const badge = deviceScreenBadge({ status: 'ONLINE', targetApp: 'insung', isScreenOn: true });
        expect(badge!.network).toBe('인성');
        expect(badge!.label).toBe('');
    });
});
