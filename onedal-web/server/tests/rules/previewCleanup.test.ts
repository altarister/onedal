import { readFileSync } from 'fs';
import { join } from 'path';
import { getUserSession } from '../../src/state/userSessionStore';
import { cancelWait } from '../../src/state/waits';
import { forceCancelEvaluatingOrder } from '../../src/services/dispatchEngine';
import { initGeoService } from '../../src/services/geoService';
import { OrderRepository } from '../../src/repositories/OrderRepository';
import * as devices from '../../src/routes/devices';
import { UNKNOWN_LEAVE_SEC } from '@onedal/shared';

/**
 * 🧹 **심사 콜 정리는 한 곳에서 세고 한 곳에서 적는다 — 미리보기는 세지도 적지도 않는다**.
 *
 * 지키는 것 셋:
 * ⓐ 인성 안전취소 타임아웃(detail.ts)은 `forceCancelEvaluatingOrder`(여기서 이미 센다) 하나만 부른다 — 뒤에 `countCancel(TIMEOUT)` 을
 *    **또** 부르면 보통 콜은 **두 번** 세고, 미리보기는 캐시가 지워진 뒤라 딱지를 못 봐 **세면 안 되는데 한 번** 센다. `order-canceled` 도 두 번 나간다.
 * ⓑ `forceCancelEvaluatingOrder` 는 미리보기를 장부에 쓰지 않는다 — SAFE_CANCEL 행으로 쓰면 관제웹 취소 수(`helpers` 의 SAFE_CANCEL 행 수)가 부푼다.
 *    미리보기는 인성에서 아무 일도 없던 콜이다.
 * ⓒ 비상 보고(emergency.ts)도 캐시를 지우기 전에 딱지를 뽑아 넘긴다 — 같은 클래스.
 * 클래스: **취소를 세는 자리·적는 자리가 경로마다 흩어지면** 한쪽만 고쳐진다.
 */
const USER = 'test-preview-cleanup';
const io = { to: () => ({ emit: jest.fn() }) } as any;

beforeAll(() => { initGeoService(); });
/**
 * ⏳ **목록 복귀가 건 «이탈 유예» 타이머는 검사마다 끝에 치운다** — 안 치우면 검사가 끝난 뒤 타이머가 돌아
 *    «Cannot log after tests are done»과 없는 콜의 장부 쓰기(FK 오류)를 남긴다. 치우는 길은 장부의 `cancelWait` 다.
 */
afterEach(() => {
    jest.restoreAllMocks();
    for (const u of [USER, 'ADMIN_USER']) {
        const s = getUserSession(u);
        for (const key of [...s.entries.keys()])
            if (key.startsWith('listExit_')) cancelWait(s, key, '검사 끝');
    }
});

function evaluating(id: string, preview: boolean) {
    const s = getUserSession(USER);
    s.pendingOrdersData.set(id, {
        id, status: 'ORDER_SECURED_EVALUATING', capturedDeviceId: 'phone-1', capturedAt: new Date().toISOString(),
        pickup: '초월읍', dropoff: '신둔면', fare: 50000, isPreview: preview,
    } as any);
    s.deviceEvaluatingMap.set('phone-1', id);
    return s;
}

describe('🧹 심사 콜 정리', () => {
    it('🔴 미리보기를 정리하면 장부에 안 쓴다 — 없던 콜이다', () => {
        const up = jest.spyOn(OrderRepository, 'upsertOrder').mockImplementation(() => undefined as any);
        const st = jest.spyOn(OrderRepository, 'updateOrderStatus').mockImplementation(() => null);
        evaluating('pv-1', true);
        forceCancelEvaluatingOrder(USER, 'pv-1', io);
        expect([up.mock.calls.length, st.mock.calls.length]).toEqual([0, 0]);
    });

    it('보통 콜을 정리하면 장부에 SAFE_CANCEL 로 쓰고 취소를 한 번 센다', () => {
        const up = jest.spyOn(OrderRepository, 'upsertOrder').mockImplementation(() => undefined as any);
        const st = jest.spyOn(OrderRepository, 'updateOrderStatus').mockImplementation(() => null);
        const inc = jest.spyOn(devices, 'incrementDeviceStats').mockImplementation(() => undefined);
        evaluating('auto-1', false);
        forceCancelEvaluatingOrder(USER, 'auto-1', io, 'TIMEOUT');
        expect([up.mock.calls.length, st.mock.calls[0]?.[2], inc.mock.calls.length]).toEqual([1, 'SAFE_CANCEL', 1]);
    });

    it('🔴 안전취소 타임아웃은 정리 함수 하나만 부른다 — 따로 세지 않는다 (두 번 세던 자리)', () => {
        const src = readFileSync(join(__dirname, '../../src/routes/detail.ts'), 'utf8');
        const start = src.indexOf('armWait(session, `timeout_');
        expect(start).toBeGreaterThan(-1);
        const body = src.slice(start, src.indexOf('} catch', start));
        expect(body).toMatch(/forceCancelEvaluatingOrder\(userId, payload\.order\.id, io, 'TIMEOUT'\)/);
        expect(body).not.toMatch(/countCancel\(/);
        expect(body).not.toMatch(/emit\("order-canceled"/);
    });

    it('🔴 비상 보고는 캐시를 지우기 전에 미리보기 딱지를 뽑아 넘긴다', () => {
        const src = readFileSync(join(__dirname, '../../src/routes/emergency.ts'), 'utf8');
        expect(src).toMatch(/countCancel\(session, deviceId, targetOrderId, reason, wasPreview, io\)/);
        expect(src.indexOf('const wasPreview')).toBeGreaterThan(-1);
        expect(src.indexOf('const wasPreview')).toBeLessThan(src.indexOf('session.pendingOrdersData.delete(targetOrderId)'));
    });
});

/**
 * 🧹 **목록으로 «돌아왔을» 때만 심사 콜을 치운다** — «지금 목록이다»로 치우지 않는다 (#154).
 * 카드를 여는 순간 폰이 아직 그려지지 않은 직전 화면(LIST)을 한 번 더 보낼 수 있다 — «지금 목록이다»로 치우면 방금 연 미리보기를
 * «리스트 이탈»로 치워, 판정 카드만 남고 수락한 콜은 번호 없이 `unknown` 이 된다 (픽커 실측: 확정 요청 0.16초 뒤 LIST 보고).
 * 원달앱도 «LIST 로 돌아왔느냐»(직전 화면)로 가른다.
 */
describe('🧹 목록으로 돌아왔을 때만 치운다', () => {
    const ADMIN = 'ADMIN_USER';   // user_devices 에 없는 기기는 여기로 간다
    const preview = (phone: string, id: string) => {
        const s = getUserSession(ADMIN);
        s.pendingOrdersData.set(id, {
            id, status: 'ORDER_SECURED_EVALUATING', capturedDeviceId: phone, capturedAt: new Date().toISOString(),
            pickup: '사음동', dropoff: '중리동', fare: 50000, isPreview: true,
        } as any);
        s.deviceEvaluatingMap.set(phone, id);
        return s;
    };

    /** 🤝 **잡은 콜** — 미리보기가 아니다. 상세까지 봤다(`detailSeen`) */
    const secured = (phone: string, id: string) => {
        const s = getUserSession(ADMIN);
        s.pendingOrdersData.set(id, {
            id, status: 'ORDER_SECURED_EVALUATING', capturedDeviceId: phone, capturedAt: new Date().toISOString(),
            pickup: '오송읍', dropoff: '논현동', fare: 38500, isPreview: false, detailSeen: true,
        } as any);
        s.deviceEvaluatingMap.set(phone, id);
        return s;
    };

    const touch = (phone: string, ...screens: string[]) =>
        screens.forEach(sc => devices.touchDeviceSession(phone, ADMIN, 0, sc as any, io));

    it('🔴 목록 → 카드 열기 → 옛 목록 보고가 또 와도 방금 연 미리보기를 안 치운다', () => {
        touch('phone-late-list', 'LIST');
        const s = preview('phone-late-list', 'pv-late');
        touch('phone-late-list', 'LIST');
        expect(s.pendingOrdersData.has('pv-late')).toBe(true);
    });

    /** 실제 픽커 — 카드를 여는 순간 «알 수 없는 화면»이 0.05~0.18초 낀다 (68건 중 3건) */
    it('🔴 목록 → 카드 열기 → 잠깐 알 수 없는 화면 → 옛 목록 보고가 와도 안 치운다 — 상세를 아직 못 봤다', () => {
        touch('phone-blip', 'LIST');
        const s = preview('phone-blip', 'pv-blip');
        touch('phone-blip', 'UNKNOWN', 'LIST');
        expect(s.pendingOrdersData.has('pv-blip')).toBe(true);
    });

    it('목록 → 카드 열기 → 상세 → 목록이면 치운다', () => {
        touch('phone-seen', 'LIST');
        const s = preview('phone-seen', 'pv-seen');
        touch('phone-seen', 'UNKNOWN', 'DETAIL_PRE_CONFIRM', 'LIST');
        expect(s.pendingOrdersData.has('pv-seen')).toBe(false);
    });

    /**
     * 🔴 **한 상차지에서 콜을 잇따라 잡을 때는 «버린 것»이 아니다** (기사님 · 실주행 04:31).
     *
     * 오송읍에서 콜 셋이 나가던 날, 앱이 하나를 잡고 **다음 콜을 잡으러 목록으로 돌아가자**
     * 서버가 「화면 이탈」로 보고 방금 잡은 콜을 강제 취소했다 — 취소 카운트까지 +1 됐다.
     * 목록으로 돌아간 같은 행동이 «안 잡겠다»와 «다음 것도 잡겠다» 두 뜻을 갖는다.
     * 가르는 사실은 **곧 새 선점이 뒤따르는가** 하나다.
     */
    /** 📋 새 원달앱은 인성 완료 탭을 MY_ORDERS + 페이지 이름으로 보낸다 — 서버가 표에서 목록 복귀를 찾아 옛 LIST_COMPLETED 와 같게 (reviews/35 5단계) */
    it('🔴 인성 완료 탭(MY_ORDERS + «완료 탭»)으로 가면 잡은 콜에 목록 이탈 유예가 걸린다 — 옛 LIST_COMPLETED 와 같다', () => {
        touch('phone-done-tab', 'DETAIL_PRE_CONFIRM');
        const s = secured('phone-done-tab', 'sc-done-tab');
        devices.touchDeviceSession('phone-done-tab', ADMIN, 0, 'MY_ORDERS' as any, io, undefined, undefined, undefined, undefined, undefined, undefined, 'insung', { screenPage: '완료 탭' } as any);
        expect(s.entries.has('listExit_sc-done-tab')).toBe(true);
        touch('phone-my-tab', 'DETAIL_PRE_CONFIRM');
        const t = secured('phone-my-tab', 'sc-my-tab');
        devices.touchDeviceSession('phone-my-tab', ADMIN, 0, 'MY_ORDERS' as any, io, undefined, undefined, undefined, undefined, undefined, undefined, 'kakaopicker', { screenPage: '내 오더 탭' } as any);
        expect(t.entries.has('listExit_sc-my-tab')).toBe(false);
    });

    it('🔴 목록으로 갔지만 곧 다음 콜을 잡으면 앞 콜을 안 죽인다 — 오송읍 셋', () => {
        touch('phone-next-call', 'DETAIL_PRE_CONFIRM');
        const s = secured('phone-next-call', 'ord-first');
        touch('phone-next-call', 'LIST');                 // 다음 콜을 잡으러 목록으로
        expect(s.pendingOrdersData.has('ord-first')).toBe(true);
    });

    /** 실제 픽커 — 상세를 열고 1.4초 만에 목록으로 나간 경우 */
    it('상세에서 열고 → 알 수 없는 화면 → 목록이면 치운다 — 열 때 이미 상세였다', () => {
        touch('phone-back-list', 'DETAIL_PRE_CONFIRM');
        const s = preview('phone-back-list', 'pv-back');
        touch('phone-back-list', 'UNKNOWN', 'LIST');
        expect(s.pendingOrdersData.has('pv-back')).toBe(false);
    });
});

/**
 * 🛟 **안전장치 둘 — 폰이 보고를 못 보내도 미리보기는 치운다** (#155).
 * 앱을 끄거나 폰이 꺼지면 «목록으로 돌아왔다»가 영영 안 온다 — 픽커는 안전취소 타이머도 없어 판정 카드가 남는다.
 * 🔴 수락 안 한 미리보기만 — 기사님이 잡은 콜은 서버가 버리지 않는다 (규칙 ①).
 */
describe('🛟 미리보기 안전장치', () => {
    const ADMIN = 'ADMIN_USER';
    const put = (phone: string, id: string, isPreview: boolean) => {
        const s = getUserSession(ADMIN);
        s.pendingOrdersData.set(id, {
            id, status: 'ORDER_AWAITING_DECISION', capturedDeviceId: phone, capturedAt: new Date().toISOString(),
            pickup: '사음동', dropoff: '중리동', fare: 50000, isPreview,
        } as any);
        s.deviceEvaluatingMap.set(phone, id);
        return s;
    };

    it('🔴 폰이 끊겼다고 알리면 그 폰의 미리보기를 치운다', () => {
        const clean = (devices as any).cleanPreviewOfDevice;
        expect(typeof clean).toBe('function');
        const s = put('phone-off', 'pv-off', true);
        clean(ADMIN, 'phone-off', io, '폰 끊김');
        expect(s.pendingOrdersData.has('pv-off')).toBe(false);
    });

    it('🔴 끊겨도 미리보기가 아닌 콜은 안 치운다', () => {
        const clean = (devices as any).cleanPreviewOfDevice;
        expect(typeof clean).toBe('function');
        const s = put('phone-off-kept', 'manual-off', false);
        clean(ADMIN, 'phone-off-kept', io, '폰 끊김');
        expect(s.pendingOrdersData.has('manual-off')).toBe(true);
    });

    it('🔴 끊김 보고 경로가 미리보기 정리를 부른다', () => {
        const src = readFileSync(join(__dirname, '../../src/routes/devices.ts'), 'utf8');
        const body = src.slice(src.indexOf('router.post("/:deviceId/offline"'), src.indexOf('POST /api/devices/:deviceId/mode'));
        expect(body).toMatch(/cleanPreviewOfDevice\(/);
    });

    it('🔴 데드맨이 무응답을 끊김으로 넘길 때 그 폰의 미리보기를 치운다 — 앱이 아무 말도 못 하고 죽은 경우', () => {
        const src = readFileSync(join(__dirname, '../../src/routes/devices.ts'), 'utf8');
        const body = src.slice(src.indexOf('getActiveDevicesSnapshot'), src.indexOf('GET /api/devices (유저별)'));
        /* 까닭을 «통신 두절»로 적고(앱이 보낸 «앱 꺼짐»과 다르다) 미리보기를 치운다 */
        expect(body).toMatch(/NO_CONTACT/);
        expect(body).toMatch(/cleanPreviewOfDevice\(/);
    });
});

/**
 * 👀 **미리보기 심사석은 «그 폰이 상세를 보고 있는 동안»만 산다** (기사님 확정).
 *
 * 기사님: *"미리보기 끄는 건 그 미리보기 판정을 연 스캔폰의 상태값 즉 상세페이지일 때만 노출하고
 * 페이지를 이탈하면 끄는 걸로 예외 없이 적용해."* · *"타이머로 미리보기 켜고 끄기 하는 기능은 빼."*
 *
 * 조건은 둘이다 — **상세를 한 번 봤고**(열리는 중에는 안 치운다 · #154) **지금도 상세다**.
 * 🔴 «상세»는 양의 목록(`shared.DETAIL_SCREENS`)이다. «목록도 모름도 아니면 상세»로 뒤집어 재면
 *    `HOME` · `MY_ORDERS` · 운행 화면까지 상세가 되어, 수락한 뒤에도 미리보기가 떠 있게 된다.
 */
describe('👀 미리보기 노출 — 상세를 보고 있는 동안만', () => {
    const ADMIN = 'ADMIN_USER';
    const preview = (phone: string, id: string) => {
        const s = getUserSession(ADMIN);
        s.pendingOrdersData.set(id, {
            id, status: 'ORDER_SECURED_EVALUATING', capturedDeviceId: phone, capturedAt: new Date().toISOString(),
            pickup: '사음동', dropoff: '중리동', fare: 50000, isPreview: true,
        } as any);
        s.deviceEvaluatingMap.set(phone, id);
        return s;
    };
    const touch = (phone: string, ...screens: string[]) =>
        screens.forEach(sc => devices.touchDeviceSession(phone, ADMIN, 0, sc as any, io));

    it('🔴 내 오더 탭으로 가면 치운다 — 목록이 아니어도 상세를 떠난 것이다', () => {
        touch('phone-my', 'DETAIL_PRE_CONFIRM');
        const s = preview('phone-my', 'pv-my');
        touch('phone-my', 'MY_ORDERS');
        expect(s.pendingOrdersData.has('pv-my')).toBe(false);
    });

    it('🔴 홈으로 가면 치운다', () => {
        touch('phone-home', 'DETAIL_PRE_CONFIRM');
        const s = preview('phone-home', 'pv-home');
        touch('phone-home', 'HOME');
        expect(s.pendingOrdersData.has('pv-home')).toBe(false);
    });

    it('상세 위 팝업은 이탈이 아니다 — 인성은 팝업으로 적요 · 출발지 · 도착지를 훑는다', () => {
        touch('phone-popup', 'DETAIL_PRE_CONFIRM');
        const s = preview('phone-popup', 'pv-popup');
        touch('phone-popup', 'POPUP_MEMO', 'POPUP_PICKUP', 'POPUP_DROPOFF', 'DETAIL_PRE_CONFIRM');
        expect(s.pendingOrdersData.has('pv-popup')).toBe(true);
    });

    it('🔴 알 수 없는 화면이 스치면 안 치운다 — 카드를 여는 순간 0.05~0.18초 낀다 (실제 픽커 68건 중 3건)', () => {
        touch('phone-blip2', 'DETAIL_PRE_CONFIRM');
        const s = preview('phone-blip2', 'pv-blip2');
        touch('phone-blip2', 'UNKNOWN', 'DETAIL_PRE_CONFIRM');
        expect(s.pendingOrdersData.has('pv-blip2')).toBe(true);
    });

    it('🔴 알 수 없는 화면이 유예를 넘겨 이어지면 치운다 — 배차망 앱 밖으로 나간 것이다', () => {
        touch('phone-unk', 'DETAIL_PRE_CONFIRM');
        const s = preview('phone-unk', 'pv-unk');
        touch('phone-unk', 'UNKNOWN');
        expect(s.pendingOrdersData.has('pv-unk')).toBe(true);
        jest.spyOn(Date, 'now').mockReturnValue(Date.now() + (UNKNOWN_LEAVE_SEC + 1) * 1000);
        touch('phone-unk', 'UNKNOWN');
        expect(s.pendingOrdersData.has('pv-unk')).toBe(false);
    });

    it('🔴 넘어가는 중(콜을 누른 직후 틀)이 스치면 안 치운다 — 알 수 없는 화면과 같은 유예', () => {
        touch('phone-tr', 'DETAIL_PRE_CONFIRM');
        const s = preview('phone-tr', 'pv-tr');
        touch('phone-tr', 'TRANSITION', 'DETAIL_PRE_CONFIRM');
        expect(s.pendingOrdersData.has('pv-tr')).toBe(true);
    });

    it('🔴 넘어가는 중이 유예를 넘겨 이어지면 치운다', () => {
        touch('phone-tr2', 'DETAIL_PRE_CONFIRM');
        const s = preview('phone-tr2', 'pv-tr2');
        touch('phone-tr2', 'TRANSITION');
        expect(s.pendingOrdersData.has('pv-tr2')).toBe(true);
        jest.spyOn(Date, 'now').mockReturnValue(Date.now() + (UNKNOWN_LEAVE_SEC + 1) * 1000);
        touch('phone-tr2', 'TRANSITION');
        expect(s.pendingOrdersData.has('pv-tr2')).toBe(false);
    });

    it('🔴 목록 → 카드 열기 → 넘어가는 중 → 옛 목록 보고가 와도 안 치운다 — 상세를 아직 못 봤다', () => {
        touch('phone-tr3', 'LIST');
        const s = preview('phone-tr3', 'pv-tr3');
        touch('phone-tr3', 'TRANSITION', 'LIST');
        expect(s.pendingOrdersData.has('pv-tr3')).toBe(true);
    });

    /**
     * 🧭 **배차망 메뉴는 서버에게 홈과 같다** — 상세를 떠난 것(미리보기를 접는다)이고 목록 복귀가 아니다(잡은 콜은 남긴다).
     * 상세를 봤나(`isDetailish` — 스치는 화면도 목록도 아니면 참)도 홈과 같게 친다: 상세를 안 본 콜도 메뉴를 거쳐 목록에 오면 «목록 이탈 유예»가 걸린다(상세를 본 것으로 친다).
     */
    it('🔴 배차망 메뉴는 홈과 같은 결과다 — 미리보기 · 잡은 콜 · 상세를 봤나', () => {
        const run = (screen: string) => {
            const tag = screen.toLowerCase();
            touch(`ph-pv-${tag}`, 'DETAIL_PRE_CONFIRM');
            const a = preview(`ph-pv-${tag}`, `pv-${tag}`);
            touch(`ph-pv-${tag}`, screen);
            const s = getUserSession(ADMIN);
            touch(`ph-sc-${tag}`, 'DETAIL_PRE_CONFIRM');
            s.pendingOrdersData.set(`sc-${tag}`, { id: `sc-${tag}`, status: 'ORDER_SECURED_EVALUATING', capturedDeviceId: `ph-sc-${tag}`, capturedAt: new Date().toISOString(), pickup: '오송읍', dropoff: '논현동', fare: 38500, isPreview: false, detailSeen: true } as any);
            s.deviceEvaluatingMap.set(`ph-sc-${tag}`, `sc-${tag}`);
            touch(`ph-sc-${tag}`, screen);
            touch(`ph-un-${tag}`, 'LIST');
            s.pendingOrdersData.set(`un-${tag}`, { id: `un-${tag}`, status: 'ORDER_SECURED_EVALUATING', capturedDeviceId: `ph-un-${tag}`, capturedAt: new Date().toISOString(), pickup: '오송읍', dropoff: '논현동', fare: 38500, isPreview: false } as any);
            s.deviceEvaluatingMap.set(`ph-un-${tag}`, `un-${tag}`);
            touch(`ph-un-${tag}`, screen);
            const unseenAtMenu = s.pendingOrdersData.has(`un-${tag}`);
            touch(`ph-un-${tag}`, 'LIST');
            return { previewKept: a.pendingOrdersData.has(`pv-${tag}`), securedKept: s.pendingOrdersData.has(`sc-${tag}`), unseenAtMenu, listExitArmed: s.entries.has(`listExit_un-${tag}`) };
        };
        const home = run('HOME');
        expect(run('NETWORK_MENU')).toEqual(home);
        expect(home).toEqual({ previewKept: false, securedKept: true, unseenAtMenu: true, listExitArmed: true });
    });

    it('🔴 상세를 아직 못 봤으면 안 치운다 — 카드가 열리는 중이다 (#154)', () => {
        touch('phone-opening', 'LIST');
        const s = preview('phone-opening', 'pv-opening');
        touch('phone-opening', 'LIST');
        expect(s.pendingOrdersData.has('pv-opening')).toBe(true);
    });
});

/**
 * ⏱️ **타이머는 «남은 판정 시간»을 알릴 뿐 콜을 끄지 않는다** (기사님 확정).
 * 끄는 것은 폰의 화면 상태 하나가 정한다 (위 describe).
 */
describe('⏱️ 미리보기 타이머 — 표시만', () => {
    const codeOf = (rel: string) => readFileSync(join(__dirname, '../../src', rel), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    it('🔴 미리보기 타이머가 콜을 취소하지 않는다', () => {
        const src = codeOf('routes/orders.ts');
        const body = src.slice(src.indexOf('isPreview'));
        expect(body.length).toBeLessThan(src.length);
        expect(body).not.toMatch(/forceCancelEvaluatingOrder/);
    });

    it('🔴 남은 판정 시간은 배차망별 값이다 — 인성 · 화물24시는 안전취소 시간, 픽커는 상세 대기 시간', () => {
        const src = codeOf('routes/orders.ts');
        expect(src).toMatch(/safeCancelSecOf/);
        expect(src).toMatch(/pickerAlarmDetailSec/);
    });
});
