import { linkClosedLine } from '../../src/socket/supplySocket';

/**
 * 📴 **관제앱이 블루투스를 닫은 까닭을 서버 로그 한 줄로** — 기사님 관제폰 logcat 없이 «왜 자동이 알람으로 내려갔나»를 가린다.
 * 원달앱은 «관제앱 끊김 (status 0)»만 안다. 닫은 까닭 · 붙어 있던 시간 · 마지막으로 들은 때는 관제앱만 안다.
 */
describe('📴 관제앱 블루투스 닫음 한 줄', () => {
    const at = Date.parse('2026-10-08T01:04:50+09:00');

    it('🔴 까닭 · 폰 · 붙어 있던 초 · 마지막으로 들은 ms · 관제앱 시각을 한 줄에', () => {
        const line = linkClosedLine({ deviceId: 'A24', name: 'A24', why: '5120ms 동안 답 없음', connectedMs: 58_300, silentMs: 5_120, at }, at + 300);
        expect(line).toContain('A24');
        expect(line).toContain('5120ms 동안 답 없음');
        expect(line).toContain('붙어 있던 58초');
        expect(line).toContain('마지막으로 들은 지 5120ms');
        expect(line).toContain('관제앱 01:04:50');
        expect(line).not.toContain('늦게 닿음');
    });

    it('🔴 소켓이 끊겨 들고 있다 늦게 보냈으면 «늦게 닿음 N초»를 붙인다', () => {
        const line = linkClosedLine({ deviceId: 'A24', name: 'A24', why: '블루투스 끊김 (status 8)', connectedMs: 4_100, silentMs: 300, at }, at + 95_000);
        expect(line).toContain('늦게 닿음 95초');
    });

    it('🔴 증명 전이라 폰 번호를 모르면 기기 주소로 — 빈칸으로 두지 않는다', () => {
        const line = linkClosedLine({ deviceId: null, name: 'AA:BB:CC:DD:EE:FF', why: '붙기를 못 마쳤다', connectedMs: 16_000, silentMs: 16_000, at }, at);
        expect(line).toContain('AA:BB:CC:DD:EE:FF');
    });

    it('🔴 칸이 비거나 이상해도 줄은 나온다 — 받은 것을 버리지 않는다', () => {
        const line = linkClosedLine({} as never, at);
        expect(line).toContain('📴 [블루투스 닫음]');
    });
});
