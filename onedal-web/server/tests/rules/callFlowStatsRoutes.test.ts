import { readFileSync } from 'fs';
import { join } from 'path';
import { flowsForViewer, flowsForAdmin } from '../../src/services/callFlowStats';

/**
 * 📊 **통계 읽는 문 둘** (reviews/25 3단계 · 1f 결정 ②).
 *
 * 관제웹·뉴스레터 문: **내 줄은 그대로**, 남의 줄이 섞인 칸은 **서로 다른 남의 기사 3명 이상**일 때만 합친 값.
 * 남이 2명 이하면 «내 값만» — 칸 합계를 같이 주지 않는다(합계 − 내 값으로 남의 값이 역산되지 않게). 기사 칸(user_id)은 아예 없다.
 * 어드민 문: 인증 + 관리자만, 기사 칸을 준다.
 */
const SRC = join(__dirname, '../../src');
const row = (user: string, calls: number, extra: Record<string, unknown> = {}) => ({
    day: '2026-10-05', hour: 9, target_app: 'kakaopicker', from_sigungu: '광주시', to_sigungu: '서울 용산구',
    vehicle_type: '', user_id: user, drivers: 1, calls, fare_first_sum: calls * 10000, fare_last_sum: calls * 11000,
    fare_min: 10000, fare_max: 11000, km_sum: 0, reserved_calls: 0, passed_calls: 0, ...extra,
}) as any;

describe('📊 관제웹·뉴스레터 문 — 내 줄 + 남은 3명 이상일 때만', () => {
    it('🔴 남이 2명이면 «내 값만» — 칸 합계가 없다', () => {
        const [cell] = flowsForViewer([row('me', 2), row('a', 5), row('b', 1)], 'me', 'weekday');
        expect(cell.mine?.calls).toBe(2);
        expect(cell.all).toBeNull();
        expect(cell.fewOthers).toBe(true);
    });

    it('남이 3명 이상이면 칸 합계를 준다 (내 값과 함께)', () => {
        const [cell] = flowsForViewer([row('me', 2), row('a', 5), row('b', 1), row('c', 1)], 'me', 'weekday');
        expect(cell.all).toMatchObject({ calls: 9, drivers: 4 });
        expect(cell.mine?.calls).toBe(2);
        expect(cell.fewOthers).toBe(false);
    });

    it('🔴 기사 id 는 응답에 없다', () => {
        const out = JSON.stringify(flowsForViewer([row('me', 2), row('a', 5), row('b', 1), row('c', 1)], 'me', 'hour'));
        for (const id of ['"a"', '"b"', '"c"', 'user_id', '"me"']) expect(out).not.toContain(id);
    });

    it('합친 줄(90일 뒤 · 기사 칸 없음)은 남으로 센다 — 내가 섞였을 수 있으니 drivers − 1 만 남으로 친다', () => {
        const [few] = flowsForViewer([row('', 6, { drivers: 3 })], 'me', 'weekday');
        expect(few.all).toBeNull();             // 남 ≥ 2 로만 쳐서 3 미만 — 가린다
        const [many] = flowsForViewer([row('', 9, { drivers: 4 })], 'me', 'weekday');
        expect(many.all?.calls).toBe(9);
    });

    it('묶는 기준은 읽을 때 계산한다 — 요일 · 시 · 달 · 계절', () => {
        expect(flowsForViewer([row('me', 1)], 'me', 'weekday')[0].group).toBe('월');   // 2026-10-05 는 월요일
        expect(flowsForViewer([row('me', 1)], 'me', 'hour')[0].group).toBe('9시');
        expect(flowsForViewer([row('me', 1)], 'me', 'month')[0].group).toBe('10월');
        expect(flowsForViewer([row('me', 1)], 'me', 'season')[0].group).toBe('가을');
    });
});

describe('📊 어드민 문 — 기사 칸을 준다', () => {
    it('기사마다 한 줄', () => {
        const out = flowsForAdmin([row('a', 5), row('b', 1)], 'weekday');
        expect(out.map(r => r.userId).sort()).toEqual(['a', 'b']);
    });
});

describe('📊 문 자리', () => {
    it('관제웹 문은 인증 · 어드민 문은 인증 + 관리자 · 입구에 한 줄', () => {
        const route = readFileSync(join(SRC, 'routes/stats.ts'), 'utf8');
        expect(route).toMatch(/router\.get\("\/flows", requireAuth,/);
        expect(route).toMatch(/router\.get\("\/flows\/admin", requireAuth, requireAdmin,/);
        expect(readFileSync(join(SRC, 'index.ts'), 'utf8')).toContain('app.use("/api/stats", statsRouter);');
    });
});
