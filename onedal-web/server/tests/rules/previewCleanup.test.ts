import { readFileSync } from 'fs';
import { join } from 'path';
import { getUserSession } from '../../src/state/userSessionStore';
import { forceCancelEvaluatingOrder } from '../../src/services/dispatchEngine';
import { initGeoService } from '../../src/services/geoService';
import { OrderRepository } from '../../src/repositories/OrderRepository';
import * as devices from '../../src/routes/devices';

/**
 * 🧹 **심사 콜 정리는 한 곳에서 세고 한 곳에서 적는다 — 미리보기는 세지도 적지도 않는다** (2026-09-15 · 기사님 «버그부터 잡자»).
 *
 * 미리보기 심사석을 끄는 방법을 찾다 나온 꼬임 셋 (onedal-b5 진단 · onedal-49 검토 요청):
 * ⓐ 인성 안전취소 타임아웃(detail.ts)이 `forceCancelEvaluatingOrder`(여기서 이미 셈) 뒤에 `countCancel(TIMEOUT)` 을 **또** 불렀다 —
 *    보통 콜은 **두 번** 세고, 미리보기는 캐시가 지워진 뒤라 딱지를 못 봐 **세면 안 되는데 한 번** 셌다. `order-canceled` 도 두 번 나갔다.
 * ⓑ `forceCancelEvaluatingOrder` 가 미리보기도 장부에 SAFE_CANCEL 행으로 썼다 → 관제웹 취소 수(`helpers` 의 SAFE_CANCEL 행 수)가 부풀었다.
 *    미리보기는 인성에서 아무 일도 없던 콜이다 (용어집 §9) — 장부에 들어가는 길이 이 한 줄뿐이었다.
 * ⓒ 비상 보고(emergency.ts)도 캐시를 지운 뒤 딱지 없이 셌다 — 같은 클래스.
 * 클래스: **취소를 세는 자리·적는 자리가 경로마다 흩어졌다** (08-18 «취소 저장의 네 번째 경로»와 같은 뿌리).
 */
const USER = 'test-preview-cleanup';
const io = { to: () => ({ emit: jest.fn() }) } as any;

beforeAll(() => { initGeoService(); });
afterEach(() => jest.restoreAllMocks());

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
        const body = src.slice(src.indexOf('const timeoutTimer = setTimeout'), src.indexOf('(cancelSec + SERVER_CLEANUP_EXTRA_SEC) * 1000'));
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
 * 카드를 여는 순간 폰이 아직 그려지지 않은 옛 화면(LIST)을 한 번 더 보내면, 방금 연 미리보기를 «리스트 이탈»로 치웠다
 * (22:15 픽커 S3 — 확정 요청 0.16초 뒤 LIST 보고 → 정리 → 판정 카드만 남고 수락한 콜은 번호 없이 `unknown`).
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

    const touch = (phone: string, ...screens: string[]) =>
        screens.forEach(sc => devices.touchDeviceSession(phone, ADMIN, 0, sc as any, io));

    it('🔴 목록 → 카드 열기 → 옛 목록 보고가 또 와도 방금 연 미리보기를 안 치운다', () => {
        touch('phone-late-list', 'LIST');
        const s = preview('phone-late-list', 'pv-late');
        touch('phone-late-list', 'LIST');
        expect(s.pendingOrdersData.has('pv-late')).toBe(true);
    });

    /** 실제 픽커 9/02 — 카드를 여는 순간 «알 수 없는 화면»이 0.05~0.18초 끼었다 (68건 중 3건) */
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

    /** 실제 픽커 9/02 18:56:47 — 상세를 보다가 열었고 1.4초 만에 목록으로 나갔다 */
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

    it('🔴 픽커 미리보기에는 «상세 대기 시간 + 정리 여유» 뒤 치우는 타이머가 걸린다 — 취소할 수 있게 등록한다', () => {
        const src = readFileSync(join(__dirname, '../../src/routes/orders.ts'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        const body = src.slice(src.indexOf('else if ((pendingOrder as any).isPreview)'));
        expect(body.length).toBeLessThan(src.length);
        expect(body).toMatch(/pickerAlarmDetailSec \+ SERVER_CLEANUP_EXTRA_SEC/);
        expect(body).toMatch(/forceCancelEvaluatingOrder\(userId, pendingOrder\.id, io, 'TIMEOUT'\)/);
        expect(body).toMatch(/activeTimers\.set\(`presecured_\$\{pendingOrder\.id\}`/);
    });
});
