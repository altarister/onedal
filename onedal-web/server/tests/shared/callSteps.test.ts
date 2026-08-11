import { deriveCallStep, canRewindTo, remainingToStop, CALL_STEPS, CALL_STEP_COUNT, STEP_MILESTONE } from '@onedal/shared';
import type { CargoReport } from '@onedal/shared';

/**
 * [Phase 8.5] 콜 진행 6단계는 **저장하지 않고 파생**한다.
 *
 * 2026-08-10 하루에 여섯 번(BB·DD·II·JJ·PP·WW) 겪은 문제가 전부
 * "저장해 둔 값이 실제와 갈라진" 것이었다. 단계도 같은 함정에 빠지기 쉬워서
 * 서버에 이미 있는 증거(마일스톤·통화 기록)만으로 판정한다.
 */
const ms = (...names: string[]) => names.map(milestone => ({ milestone }));
const call = (stop: 'pickup' | 'dropoff'): CargoReport =>
    ({ stopType: stop, kind: 'DECLARED' } as CargoReport);

describe('deriveCallStep — 증거만으로 현재 단계를 구한다', () => {
    it('아무 기록도 없으면 상차지 통화부터', () => {
        const p = deriveCallStep();
        expect(p.index).toBe(0);
        expect(p.current?.id).toBe('CALL_PICKUP');
        expect(p.done).toEqual([false, false, false, false, false, false]);
    });

    it('상차지 통화만 했으면 다음은 하차지 통화', () => {
        const p = deriveCallStep([], [call('pickup')]);
        expect(p.current?.id).toBe('CALL_DROPOFF');
        expect(p.done[0]).toBe(true);
    });

    it('두 통화를 마치면 상차지 도착 차례', () => {
        const p = deriveCallStep([], [call('pickup'), call('dropoff')]);
        expect(p.current?.id).toBe('ARRIVE_PICKUP');
    });

    it.each([
        ['ARRIVED_PICKUP',  'LOADED'],
        ['PICKED_UP',       'ARRIVE_DROPOFF'],
        ['ARRIVED_DROPOFF', 'DELIVERED'],
    ])('%s 이 있으면 다음은 %s', (given, next) => {
        expect(deriveCallStep(ms(given)).current?.id).toBe(next);
    });

    it('하차 완료면 모두 끝', () => {
        const p = deriveCallStep(ms('DELIVERED'));
        expect(p.allDone).toBe(true);
        expect(p.current).toBeNull();
        expect(p.index).toBe(CALL_STEP_COUNT);
    });

    it('🔴 뒤쪽 증거가 앞쪽을 함축한다 — 통화를 건너뛰고 상차해도 되돌아가지 않는다', () => {
        // 적요만 보고 바로 출발한 경우. 통화 기록이 없어도 상차는 이미 끝났다
        const p = deriveCallStep(ms('PICKED_UP'), []);
        expect(p.current?.id).toBe('ARRIVE_DROPOFF');
        expect(p.done[0]).toBe(false);   // 통화는 안 한 것으로 남는다 (건너뜀 표시)
        expect(p.done[3]).toBe(true);
    });

    it('마일스톤이 순서 없이 들어와도 가장 앞선 것을 따른다', () => {
        expect(deriveCallStep(ms('ARRIVED_PICKUP', 'PICKED_UP', 'ARRIVED_DROPOFF')).current?.id)
            .toBe('DELIVERED');
    });
});

describe('건너뛰기 — 화면 로컬 상태와 증거를 합친다', () => {
    it('건너뛰면 그만큼 앞으로 간다', () => {
        expect(deriveCallStep([], [], 2).current?.id).toBe('ARRIVE_PICKUP');
    });

    it('🔴 증거가 더 앞서면 증거가 이긴다 — 화면이 서버 기록을 되돌릴 수 없다', () => {
        const p = deriveCallStep(ms('PICKED_UP'), [], 1);
        expect(p.current?.id).toBe('ARRIVE_DROPOFF');
    });

    it('건너뛰기가 범위를 넘어도 안전하다', () => {
        const p = deriveCallStep([], [], 99);
        expect(p.index).toBe(CALL_STEP_COUNT);
        expect(p.allDone).toBe(true);
    });
});

describe('되돌아가기 — 끝난 단계만', () => {
    it('지나온 단계로는 돌아갈 수 있다', () => {
        const p = deriveCallStep(ms('PICKED_UP'));   // index 4
        expect(canRewindTo(p, 0)).toBe(true);
        expect(canRewindTo(p, 3)).toBe(true);
    });

    it('🔴 아직 오지 않은 단계로는 건너뛸 수 없다 — 기록이 뒤엉킨다', () => {
        const p = deriveCallStep(ms('PICKED_UP'));   // index 4
        expect(canRewindTo(p, 4)).toBe(false);
        expect(canRewindTo(p, 5)).toBe(false);
    });

    it('음수는 막는다', () => {
        expect(canRewindTo(deriveCallStep(ms('PICKED_UP')), -1)).toBe(false);
    });
});

describe('단계 정의', () => {
    it('통화 두 단계만 선택이다', () => {
        expect(CALL_STEPS.filter(s => s.optional).map(s => s.id)).toEqual(['CALL_PICKUP', 'CALL_DROPOFF']);
    });

    it('필수 네 단계는 각각 마일스톤과 짝이 있다', () => {
        CALL_STEPS.filter(s => !s.optional).forEach(s => {
            expect(STEP_MILESTONE[s.id]).toBeTruthy();
        });
    });

    it('통화 단계에는 마일스톤이 없다 (보고할 것이 아니다)', () => {
        expect(STEP_MILESTONE.CALL_PICKUP).toBeUndefined();
        expect(STEP_MILESTONE.CALL_DROPOFF).toBeUndefined();
    });
});

/**
 * 🔴 2026-08-11 — 하차지 통화 화면이 "상차지 → 하차지" 주행만 세고 있었다.
 * 아직 상차지에 가지도 않았는데 접근 주행과 상차 작업이 통째로 빠져서
 * 도착 예상이 이르게 나오고 `지각` 판정이 낙관적이었다.
 * 그 화면을 보고 약속하면 기사님이 **못 지킬 시각**을 약속하게 된다.
 */
describe('remainingToStop — 지금부터 이 정거장까지', () => {
    const base = {
        approachMinutes: 12, approachKm: 9, soloMinutes: 75, soloKm: 68, pickupDwellMinutes: 15,
        arrivedPickup: false, pickedUp: false, arrivedDropoff: false,
    };

    it('상차지 · 아직 안 감 → 접근 주행만', () => {
        const r = remainingToStop({ ...base, stop: 'pickup' });
        expect(r).toEqual({ driveMinutes: 12, driveKm: 9, leadMinutes: 0, leadLabel: null });
    });

    it('상차지 · 도착함 → 더 갈 곳이 없다', () => {
        const r = remainingToStop({ ...base, stop: 'pickup', arrivedPickup: true });
        expect(r.driveMinutes).toBe(0);
    });

    it('🔴 하차지 · 아직 상차지에도 안 감 → 접근 + 주행, 그리고 상차 시간이 남는다', () => {
        const r = remainingToStop({ ...base, stop: 'dropoff' });
        expect(r).toEqual({ driveMinutes: 87, driveKm: 77, leadMinutes: 15, leadLabel: '상차' });
    });

    it('하차지 · 상차지 도착만 함 → 접근은 끝났고 상차 시간은 남았다', () => {
        const r = remainingToStop({ ...base, stop: 'dropoff', arrivedPickup: true });
        expect(r).toEqual({ driveMinutes: 75, driveKm: 68, leadMinutes: 15, leadLabel: '상차' });
    });

    it('하차지 · 상차 완료 → 남은 건 주행뿐', () => {
        const r = remainingToStop({ ...base, stop: 'dropoff', arrivedPickup: true, pickedUp: true });
        expect(r).toEqual({ driveMinutes: 75, driveKm: 68, leadMinutes: 0, leadLabel: null });
    });

    it('하차지 · 도착함 → 0', () => {
        const r = remainingToStop({ ...base, stop: 'dropoff', pickedUp: true, arrivedDropoff: true });
        expect(r.driveMinutes).toBe(0);
    });

    it('거리도 같은 규칙으로 합쳐진다 — 통화에서 "몇 km 몇 분" 을 그대로 읽는다', () => {
        // 아직 상차지에도 안 갔다면 하차지까지는 접근 + 단독을 더한 거리다
        expect(remainingToStop({ ...base, stop: 'dropoff' }).driveKm).toBe(77);
        expect(remainingToStop({ ...base, stop: 'pickup' }).driveKm).toBe(9);
    });

    it('🔴 모르는 구간이 있으면 0 으로 때우지 않고 null 을 준다', () => {
        // 현위치를 몰라 접근 주행이 없다 → 하차지까지 총 시간을 알 수 없다
        expect(remainingToStop({ ...base, stop: 'dropoff', approachMinutes: null }).driveMinutes).toBeNull();
        expect(remainingToStop({ ...base, stop: 'pickup', approachMinutes: undefined }).driveMinutes).toBeNull();
        // 0 도 "모른다"로 본다 — 서버가 접근 구간을 못 넣으면 0 이 온다
        expect(remainingToStop({ ...base, stop: 'pickup', approachMinutes: 0 }).driveMinutes).toBeNull();
    });

    it('구간을 몰라도 상차 시간은 그대로 남는다 — 아는 것까지는 반영한다', () => {
        const r = remainingToStop({ ...base, stop: 'dropoff', approachMinutes: null });
        expect(r.leadMinutes).toBe(15);
    });
});
