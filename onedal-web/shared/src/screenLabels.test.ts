import { describe, it, expect } from 'vitest';
import { deviceScreenBadge, screenLabelOf } from './screenLabels';

/**
 * 🖥️ **폰 상태 바 — 6번(화면 켜짐)과 9번(화면명)은 배지 하나다**
 * (기사님과 확정).
 *
 * 🔴 **위가 꺼지면 아래는 뜻이 없다.** 화면이 꺼진 폰은 배차망도 화면명도 «아까 그것»이다.
 *    그걸 그대로 그리면 화면이 *"지금 픽커 홈에 있다"* 고 **단언**한다 —
 *    «읽지 않고 단언한다» 병이다.
 *
 * ⚠️ **표시를 합치는 것이지 값을 합치는 것이 아니다**.
 *    `isScreenOn` 과 `screenContext` 는 그대로 둔 채, 그리는 자리에서만 하나로 고른다.
 */
describe('deviceScreenBadge — 화면 켜짐과 화면명은 한 배지', () => {
    it('🔴 서버가 뜬 뒤 아직 못 들은 폰은 «⏳ 로딩 중» — «통신 끊김»이라고 단언하지 않는다', () => {
        expect(deviceScreenBadge({ status: 'OFFLINE', offlineReason: 'NOT_HEARD_YET' as any })?.label).toBe('⏳ 로딩 중');
        expect(deviceScreenBadge({ status: 'OFFLINE' })?.label).toBe('📵 통신 끊김');
    });
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
        // 꺼지기 전에 읽은 화면명이 어디로도 새 나가면 안 된다
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
        expect(badge!.label).toBe('콜리스트');   // 폭을 아끼려 낱말을 붙인다 (기사님)
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
     * 📵 **말이 없는 폰의 화면 이름은 «아까 그것»이다** (기사님 지적:
     * *"접근성 꺼지면 알 수 없는 화면으로 나오는데 '접근성 꺼짐' 이렇게 표현되면 좋겠는데"*).
     *
     * 마지막으로 읽은 화면 이름을 계속 그리면 화면이 *"지금 이 화면이다"* 라고 단언한다 — 그 폰은
     * 아무 말도 안 하고 있는데. «읽지 않고 단언한다» 병이다.
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
        expect(badge!.label).toBe('⚠️ 접근성 꺼짐');
        expect(badge!.label).not.toContain('리스트');
    });

    it('앱이 스스로 내려간 것과 접근성이 꺼진 것을 가른다 — 하실 일이 다르다', () => {
        expect(deviceScreenBadge({ status: 'OFFLINE', offlineReason: 'APP_SHUTDOWN' })!.label)
            .toBe('🛑 앱 종료됨');
    });

    it('까닭을 못 들었으면 «📵 통신 끊김» — 지어내지 않는다 (규칙 ④)', () => {
        const badge = deviceScreenBadge({ status: 'OFFLINE', targetApp: 'insung', screenContext: 'LIST' });
        expect(badge!.label).toBe('📵 통신 끊김');
    });

    it('화면명도 배차망도 없으면 아무것도 안 그린다', () => {
        expect(deviceScreenBadge({ status: 'ONLINE' })).toBeNull();
    });

    it('배차망만 알고 화면을 모르면 배차망만 그린다', () => {
        const badge = deviceScreenBadge({ status: 'ONLINE', targetApp: 'insung', isScreenOn: true });
        expect(badge!.network).toBe('인성');
        expect(badge!.label).toBe('');
    });

    it('Tier 2: 바탕화면 홈 런처인 경우 «📱 바탕화면 (홈)»으로 배차망 없이 표기한다', () => {
        const badge = deviceScreenBadge({
            status: 'ONLINE',
            targetApp: 'kakaopicker',
            screenContext: 'LAUNCHER',
            isScreenOn: true,
        });
        expect(badge!.network).toBeNull();
        expect(badge!.label).toBe('📱 바탕화면 (홈)');
    });

    it('Tier 2: 타 앱인 경우 «📱 기타 앱 (배차망 밖)»으로 표기한다', () => {
        const badge = deviceScreenBadge({
            status: 'ONLINE',
            targetApp: 'kakaopicker',
            screenContext: 'OTHER_APP',
            isScreenOn: true,
        });
        expect(badge!.network).toBeNull();
        expect(badge!.label).toBe('📱 기타 앱 (배차망 밖)');
    });

    it('Tier 2: 원달앱 자기 화면은 실어 온 이름 «📱 원달앱 화면»으로 — «미등록 팝업»이 아니다', () => {
        const badge = deviceScreenBadge({
            status: 'ONLINE',
            targetApp: 'kakaopicker',
            screenContext: 'OTHER_APP',
            screenPage: '원달앱 화면',
            isScreenOn: true,
        });
        expect(badge!.network).toBeNull();
        expect(badge!.label).toBe('📱 원달앱 화면');
    });

    it('Tier 1: 배차망 앱 내에서 미등록 화면/팝업인 경우 «⚠️ 미등록 팝업»으로 표기한다', () => {
        const badge = deviceScreenBadge({
            status: 'ONLINE',
            targetApp: 'kakaopicker',
            screenContext: 'UNKNOWN',
            isScreenOn: true,
        });
        expect(badge!.network).toBe('픽커');
        expect(badge!.label).toBe('⚠️ 미등록 팝업');
    });
});

/** 🧭 reviews/35 2단계 — 표가 낸 기준 값 둘과 화물24시 홈이 관제웹에 이름으로 뜬다(«알 수 없는 화면» 빨간 깜빡임이 아니다) */
describe('넘어가는 중 · 배차망 메뉴 · 화물24시 홈', () => {
    it('세 배차망 모두 «넘어가는 중» · «배차망 메뉴»', () => {
        for (const net of ['insung', 'hwamul24', 'kakaopicker']) {
            expect(screenLabelOf(net, 'TRANSITION' as any)?.label, net).toBe('넘어가는 중');
            expect(screenLabelOf(net, 'NETWORK_MENU' as any)?.label, net).toBe('배차망 메뉴');
        }
    });

    it('인성 · 화물24시 홈은 «홈» — 인성 첫 화면(«인성퀵화면분할»)이 «미등록»으로 안 보인다 (reviews/46)', () => {
        expect(screenLabelOf('hwamul24', 'HOME')?.label).toBe('홈');
        expect(screenLabelOf('insung', 'HOME')?.label).toBe('홈');
    });
});

/** 🧭 reviews/35 5단계 — 새 원달앱이 싣는 배차망 페이지 이름 · 덧칸 이름을 배지가 그대로 그린다(기사님 «가») · 옛 원달앱은 지금 이름 */
describe('배지 — 배차망 페이지 이름 · 덧칸', () => {
    it('페이지 이름 + «· 덧칸 이름» · 색은 화면 값의 색', () => {
        const b = deviceScreenBadge({ status: 'ONLINE', targetApp: 'insung', screenContext: 'DETAIL_PRE_CONFIRM', isScreenOn: true, screenPage: '확정 전 상세', screenOverlay: '출발지 상세 팝업' } as any);
        expect(b!.label).toBe('확정 전 상세 · 출발지 상세 팝업');
        expect(b!.color).toBe(screenLabelOf('insung', 'DETAIL_PRE_CONFIRM')!.color);
        const c = deviceScreenBadge({ status: 'ONLINE', targetApp: 'kakaopicker', screenContext: 'LIST', isScreenOn: true, screenPage: '신규 리스트' } as any);
        expect(c!.label).toBe('신규 리스트');
    });

    it('페이지 이름이 없으면(옛 원달앱) 지금 이름 그대로', () => {
        const b = deviceScreenBadge({ status: 'ONLINE', targetApp: 'insung', screenContext: 'POPUP_PICKUP', isScreenOn: true });
        expect(b!.label).toBe('출발지팝업');
    });
});

