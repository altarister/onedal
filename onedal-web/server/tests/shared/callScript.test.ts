import { buildCallScript, DEFAULT_BUFFER_MINUTES } from '@onedal/shared';

/**
 * 기사님이 실제로 하는 통화를 그대로 문장으로 만든다.
 *
 *   상차지 "여기서 이동하는데 얼마가 걸리니 얼마나 후 도착 예정이다.
 *           여유시간 얼마 잡고 몇 시까지 갈 수 있을 듯싶다. 내가 수행해도 될까요?"
 *   하차지 "상차를 몇 시까지 완료하면 (…) 하차지까지 얼마나 걸릴 예정이다. (…)"
 */
const 오후2시 = new Date('2026-08-10T14:00:00+09:00').getTime();

describe('상차지 대본', () => {
    it('이동 시간 → 도착 예정 → 여유 포함 약속 시각 순서로 말한다', () => {
        const s = buildCallScript({
            stopType: 'pickup', nowMs: 오후2시, approachMinutes: 25, bufferMinutes: 20,
        });
        expect(s.text).toBe(
            '여기서 상차지까지 25분 걸립니다. 14시 25분 도착 예정이고, 여유 20분 잡으면 ' +
            '14시 45분까지는 갈 수 있을 것 같습니다. 제가 수행해도 될까요?'
        );
        expect(s.incomplete).toBe(false);
    });

    it('약속 시각 = 예상 도착 + 여유', () => {
        const s = buildCallScript({ stopType: 'pickup', nowMs: 오후2시, approachMinutes: 30, bufferMinutes: 30 });
        expect(new Date(s.etaMs).getHours()).toBe(14);
        expect(new Date(s.proposedMs).getHours()).toBe(15);
    });

    it('🔴 이동 시간을 모르면 지어내지 않고 "확인 중"이라 말한다', () => {
        const s = buildCallScript({ stopType: 'pickup', nowMs: 오후2시, approachMinutes: null, bufferMinutes: 20 });
        expect(s.text).toContain('확인 중');
        expect(s.incomplete).toBe(true);
    });
});

describe('하차지 대본', () => {
    it('상차 완료 시각에서 출발해 하차 도착을 계산한다', () => {
        const 상차완료 = new Date('2026-08-10T15:30:00+09:00').getTime();
        const s = buildCallScript({
            stopType: 'dropoff', nowMs: 오후2시, pickupDoneAtMs: 상차완료,
            lineHaulMinutes: 65, bufferMinutes: 20,
        });
        expect(s.text).toBe(
            '상차를 15시 30분까지 완료하면 하차지까지 65분 걸려서 16시 35분 도착 예정입니다. ' +
            '여유 20분 잡으면 16시 55분까지는 갈 수 있을 것 같습니다. 제가 수행해도 될까요?'
        );
    });

    it('상차 약속이 아직 없으면 지금 + 이동 + 상차 소요로 추정한다', () => {
        const s = buildCallScript({
            stopType: 'dropoff', nowMs: 오후2시,
            approachMinutes: 25, pickupDwell: 19, lineHaulMinutes: 60, bufferMinutes: 20,
        });
        // 14:00 + 25 + 19 = 14:44 상차 완료 → +60 = 15:44 도착 → +20 = 16:04
        expect(s.text).toContain('상차를 14시 44분까지 완료하면');
        expect(s.text).toContain('15시 44분 도착 예정');
        expect(s.text).toContain('16시 4분까지는');
    });

    it('계산 근거를 남긴다 — 담당자가 되물으면 답할 수 있어야 한다', () => {
        const s = buildCallScript({
            stopType: 'dropoff', nowMs: 오후2시,
            approachMinutes: 25, pickupDwell: 19, lineHaulMinutes: 60, bufferMinutes: 20,
        });
        expect(s.steps).toEqual([
            { label: '여기서 상차지까지', minutes: 25 },
            { label: '상차', minutes: 19 },
            { label: '상차지에서 하차지까지', minutes: 60 },
            { label: '여유', minutes: 20 },
        ]);
    });
});

it('기본 여유는 20분', () => {
    expect(DEFAULT_BUFFER_MINUTES).toBe(20);
});
