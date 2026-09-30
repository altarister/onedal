// @ts-nocheck
import { generatePin, tryConsumePin } from '../../src/state/pairingStore';

/**
 * 🔑 **서버 로그에 폰 연결 번호를 통째로 찍지 않는다** (reviews/29 1단계 I · onedal-1f).
 * 로그 파일을 읽는 사람이 3분 안에 그 번호로 남의 계정에 폰을 붙일 수 있었다 — 뒤 두 자리만 남긴다.
 */
describe('🔑 PIN 로그 가림', () => {
    it('🔴 발급 · 사용 줄에 여섯 자리가 없다 · 뒤 두 자리는 있다', () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        const { pin } = generatePin('u-pinlog');
        tryConsumePin(pin, { ip: '7.7.7.7', deviceId: 'd-pinlog' });
        const lines = log.mock.calls.map(c => c.join(' ')).filter(l => l.includes('PIN'));
        expect(lines.length).toBeGreaterThanOrEqual(2);
        for (const l of lines) {
            expect(l).not.toContain(pin);
            expect(l).toContain(pin.slice(-2));
        }
        log.mockRestore();
    });
});
