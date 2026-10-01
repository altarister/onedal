// @ts-nocheck
import { generatePin, tryConsumePin, PIN_TRY } from '../../src/state/pairingStore';
import { clientIpOf } from '../../src/utils/clientIp';
import devicesRouter from '../../src/routes/devices';

/**
 * 🔢 **폰 연결 번호(6자리) 시도 한도** (reviews/29 1단계 F · onedal-1f «가» · 코드 상수 — 기사님이 고칠 값이 아니다).
 * 3분 안에 90만 가지를 대입하면 남의 계정에 폰을 붙일 수 있었다. 같은 IP 가 10분에 5번 틀리면 10분 잠그고,
 * 같은 폰(deviceId)이 3번 틀리면 그 폰을 10분 잠근다. 기사님이 번호를 한두 번 잘못 치는 일은 넉넉히 넘긴다.
 * 🌐 IP 는 폰의 진짜 IP(`clientIpOf`)로 센다 — 실서버의 req.ip 는 클라우드플레어 에지라 남끼리 잠금이 섞인다.
 *    머리(cf-connecting-ip)는 바로 붙은 쪽이 클라우드플레어 대역 · 루프백일 때만 믿는다 — 실서버는 노드가 바로 열려 있어 그 밖에서 온 머리는 위조다 (onedal-69 · f5).
 */
let now = 1_000_000_000_000;
beforeEach(() => { jest.spyOn(Date, 'now').mockImplementation(() => now); });
afterEach(() => jest.restoreAllMocks());

describe('🔢 연결 번호 시도 한도', () => {
    it('🔴 같은 IP 가 5번 틀리면 잠긴다 — 맞는 번호도 잠긴 동안은 안 받는다 · 다른 IP 는 된다', () => {
        const { pin } = generatePin('u-limit-1');
        for (let i = 0; i < PIN_TRY.IP_FAILS; i++) expect(tryConsumePin('000001', { ip: '1.1.1.1', deviceId: `d${i}` })).toMatchObject({ ok: false, locked: false });
        expect(tryConsumePin(pin, { ip: '1.1.1.1', deviceId: 'dx' })).toMatchObject({ ok: false, locked: true });
        expect(tryConsumePin(pin, { ip: '2.2.2.2', deviceId: 'dy' })).toMatchObject({ ok: true, userId: 'u-limit-1' });
    });

    it('🔴 같은 폰이 3번 틀리면 그 폰이 잠긴다', () => {
        const { pin } = generatePin('u-limit-2');
        for (let i = 0; i < PIN_TRY.DEVICE_FAILS; i++) tryConsumePin('000002', { ip: `3.3.3.${i}`, deviceId: 'd-same' });
        expect(tryConsumePin(pin, { ip: '4.4.4.4', deviceId: 'd-same' })).toMatchObject({ ok: false, locked: true });
    });

    it('🔴 잠금은 10분 뒤 풀리고 · 한두 번 틀린 뒤 맞는 번호는 곧바로 된다', () => {
        now += PIN_TRY.LOCK_MS + 1;
        const { pin } = generatePin('u-limit-3');
        tryConsumePin('000003', { ip: '1.1.1.1', deviceId: 'd-same' });
        expect(tryConsumePin(pin, { ip: '1.1.1.1', deviceId: 'd-same' })).toMatchObject({ ok: true, userId: 'u-limit-3' });
    });

});

describe('🌐 폰의 진짜 IP — 한 함수', () => {
    const withCf = (ip: string, cf?: string) => ({ get: (h: string) => (h === 'cf-connecting-ip' ? cf : undefined), ip });
    it('🔴 클라우드플레어 대역 · 루프백에서 온 머리만 믿는다', () => {
        expect(clientIpOf(withCf('172.70.0.1', '5.5.5.5'))).toBe('5.5.5.5');            // 172.64.0.0/13
        expect(clientIpOf(withCf('::ffff:162.158.1.2', '5.5.5.5'))).toBe('5.5.5.5');    // IPv4 를 IPv6 꼴로 받은 것
        expect(clientIpOf(withCf('2606:4700::1', '5.5.5.5'))).toBe('5.5.5.5');
        expect(clientIpOf(withCf('127.0.0.1', '5.5.5.5'))).toBe('5.5.5.5');
        expect(clientIpOf(withCf('::1', '5.5.5.5'))).toBe('5.5.5.5');
    });
    it('🔴 그 밖에서 바로 붙어 넣은 머리는 위조라 버린다 · 머리가 없으면 req.ip', () => {
        expect(clientIpOf(withCf('82.21.0.1', '5.5.5.5'))).toBe('82.21.0.1');
        expect(clientIpOf(withCf('::ffff:82.21.0.1', '5.5.5.5'))).toBe('::ffff:82.21.0.1');
        expect(clientIpOf(withCf('172.70.0.1'))).toBe('172.70.0.1');
    });

    it('🔴 연결 문 — 같은 에지를 지나도 머리가 다른 두 사람은 따로 센다', async () => {
        now += PIN_TRY.LOCK_MS + PIN_TRY.WINDOW_MS + 1;
        const layer = devicesRouter.stack.find((l: any) => l.route?.path === '/pair' && l.route.methods.post);
        const pair = async (cf: string, pin: string, deviceId: string) => {
            let status = 200;
            const res = { status: (c: number) => { status = c; return res; }, json: () => res };
            await layer.route.stack[layer.route.stack.length - 1].handle(
                { ip: '172.70.0.1', get: (h: string) => (h === 'cf-connecting-ip' ? cf : undefined), body: { pin, deviceId }, app: { get: () => undefined } }, res);
            return status;
        };
        for (let i = 0; i < PIN_TRY.IP_FAILS; i++) await pair('5.5.5.5', '000005', `da${i}`);
        expect(await pair('5.5.5.5', '000005', 'da-x')).toBe(429);
        expect(await pair('6.6.6.6', '000005', 'db-0')).toBe(401);   // 남은 안 잠겼다 — 틀린 번호라 401
    });
});
