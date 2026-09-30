// @ts-nocheck
import { generatePin, tryConsumePin, PIN_TRY } from '../../src/state/pairingStore';

/**
 * 🔢 **폰 연결 번호(6자리) 시도 한도** (reviews/29 1단계 F · onedal-1f «가» · 코드 상수 — 기사님이 고칠 값이 아니다).
 * 3분 안에 90만 가지를 대입하면 남의 계정에 폰을 붙일 수 있었다. 같은 IP 가 10분에 5번 틀리면 10분 잠그고,
 * 같은 폰(deviceId)이 3번 틀리면 그 폰을 10분 잠근다. 기사님이 번호를 한두 번 잘못 치는 일은 넉넉히 넘긴다.
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
