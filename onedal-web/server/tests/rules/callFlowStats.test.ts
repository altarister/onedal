import { readFileSync } from 'fs';
import { join } from 'path';
import db from '../../src/db';
import { sigunguOfShort } from '@onedal/shared';
import { groupSameCalls, rollupDay, mergeOldDays } from '../../src/services/callFlowStats';

/**
 * 📊 **콜 흐름 통계 — 목록에 뜬 실물 콜을 하루 × 시 × 출발 시군구 × 도착 시군구로 센다** (reviews/25 3단계 · 기사님 결정).
 *
 * 재료는 intel 의 목록 줄(INTEL_BULK) 가운데 실물 앱(source='real')뿐이고, 시각은 ISO 칸(timestamp)만 읽는다.
 * 같은 콜 = 상차 + 하차 + 30분 창(요금은 처음·마지막). 시군구는 서버 지도 명부(DONG_CENTROIDS) 한 벌 — 둘 이상이면 «모호», 없으면 «모름».
 * 묶기는 그날 지우고 다시 넣기 한 트랜잭션(되풀이해도 같다) · 90일 지난 날은 기사 칸을 뺀 합친 줄로.
 */
const SRC = join(__dirname, '../../src');

describe('📊 시군구 — 서버 지도 명부 한 벌', () => {
    it('앞 토막이 시군구 실마리, 뒤 토막이 동 줄기', () => {
        expect(sigunguOfShort('광주 경안')).toBe('광주시');
        expect(sigunguOfShort('용산 한남')).toBe('서울 용산구');
    });
    it('번호 동(«종로1»)은 명부의 한 이름(«종로»)으로 찾는다', () => {
        expect(sigunguOfShort('종로1')).toBe('서울 종로구');
    });
    it('🔴 후보 시군구가 둘 이상이면 추측하지 않고 «모호»', () => {
        expect(sigunguOfShort('중앙')).toBe('모호');
    });
    /* 🔴 픽커는 행정동 이름(위례 · 광남1 · 중앙 · 구성)을 쓰고 명부는 법정동뿐이다 — 동으로 못 찾아도 앞 토막이 시군구 하나로 정해지면 그 시군구 (onedal-69 «가» Q9) */
    it('🔴 행정동이라 동으로 못 찾아도 앞 토막이 시군구 하나면 그 시군구', () => {
        expect(sigunguOfShort('수정 위례')).toBe('성남시 수정구');
        expect(sigunguOfShort('광주 광남1')).toBe('광주시');
        expect(sigunguOfShort('처인 중앙')).toBe('용인시 처인구');
        expect(sigunguOfShort('기흥 구성')).toBe('용인시 기흥구');
    });
    it('🔴 한 토막이 여러 시에 있으면 그대로 «모호» — 앞 토막이 없으면 추측하지 않는다', () => {
        expect(sigunguOfShort('용산')).toBe('모호');
        expect(sigunguOfShort('중구')).toBe('모호');
    });
    it('명부에 없으면 «모름» — 버리지 않는다', () => {
        expect(sigunguOfShort('없는동네 쀍쀍')).toBe('모름');
        expect(sigunguOfShort('')).toBe('모름');
    });
});

describe('📊 같은 콜 — 상차 + 하차 + 30분 창', () => {
    const t = (min: number) => new Date(Date.parse('2020-01-02T10:00:00+09:00') + min * 60_000).toISOString();
    const row = (min: number, fare: number, extra: Record<string, unknown> = {}) => ({
        user_id: 'u1', targetApp: 'kakaopicker', pickup: '광주 경안', dropoff: '용산 한남', fare, timestamp: t(min), ...extra,
    }) as any;

    it('29분 안에 다시 보이면 한 콜 · 요금은 처음과 마지막', () => {
        const calls = groupSameCalls([row(0, 9693), row(29, 11393)]);
        expect(calls.length).toBe(1);
        expect(calls[0].fareFirst).toBe(9693);
        expect(calls[0].fareLast).toBe(11393);
    });
    it('31분 떨어지면 두 콜', () => {
        expect(groupSameCalls([row(0, 9693), row(31, 9693)]).length).toBe(2);
    });
    it('창은 미끄러진다 — 계속 떠 있으면 하나', () => {
        expect(groupSameCalls([row(0, 1), row(25, 1), row(50, 1), row(75, 1)]).length).toBe(1);
    });
});

describe('📊 하루 묶기 · 90일 합치기', () => {
    const DAY = '2020-01-02';
    const OLD = '2020-01-01';
    const U1 = 'test-stats-u1', U2 = 'test-stats-u2';
    const iso = (day: string, h: number, m = 0) => new Date(Date.parse(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`)).toISOString();
    const ins = db.prepare(`INSERT INTO intel (user_id, device_id, type, pickup, dropoff, fare, timestamp, targetApp, vehicleType, deliveryDistanceKm, verdict, reservedDay, source)
        VALUES (?, 'd', 'INTEL_BULK', ?, ?, ?, ?, 'kakaopicker', '다마스', ?, ?, ?, ?)`);
    const cleanup = () => {
        db.prepare(`DELETE FROM intel WHERE user_id IN (?, ?)`).run(U1, U2);
        db.prepare(`DELETE FROM stats_flows WHERE day IN (?, ?)`).run(DAY, OLD);
        db.prepare(`DELETE FROM stats_rollup_days WHERE day IN (?, ?)`).run(DAY, OLD);
        db.prepare(`DELETE FROM users WHERE id IN (?, ?)`).run(U1, U2);
    };
    beforeAll(() => {
        cleanup();
        for (const u of [U1, U2]) db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(u, `g-${u}`, `${u}@test`, '통계검사');
        ins.run(U1, '광주 경안', '용산 한남', 9693, iso(DAY, 10, 0), 12.3, 'pass', 1, 'real');
        ins.run(U1, '광주 경안', '용산 한남', 11393, iso(DAY, 10, 20), 12.3, 'pass', 1, 'real');   // 같은 콜
        ins.run(U1, '중앙', '용산 한남', 8000, iso(DAY, 11, 0), null, 'fare', 0, 'real');          // 출발 모호
        ins.run(U1, '광주 경안', '용산 한남', 7000, iso(DAY, 12, 0), null, null, 0, 'sim');        // 시뮬 — 안 센다
        ins.run(U1, '광주 경안', '용산 한남', 7000, iso(DAY, 13, 0), null, null, 0, null);         // 옛 앱 — 안 센다
        ins.run(U1, '광주 경안', '용산 한남', 9000, iso(OLD, 9, 0), null, null, 0, 'real');
        ins.run(U2, '광주 경안', '용산 한남', 9500, iso(OLD, 9, 10), null, null, 0, 'real');
    });
    afterAll(cleanup);

    it('🔴 실물 목록 줄만 센다 · 같은 콜은 한 번 · 표지에 가려진 비율 재료', () => {
        rollupDay(DAY);
        const rows = db.prepare(`SELECT * FROM stats_flows WHERE day = ? ORDER BY hour`).all(DAY) as any[];
        const total = rows.reduce((s, r) => s + r.calls, 0);
        expect(total).toBe(2);
        const ten = rows.find(r => r.hour === 10);
        expect(ten).toMatchObject({ user_id: U1, from_sigungu: '광주시', to_sigungu: '서울 용산구', calls: 1,
            fare_calls: 1, fare_first_sum: 9693, fare_last_sum: 11393, km_calls: 1, km_sum: 12.3, reserved_calls: 1, passed_calls: 1, drivers: 1 });
        expect(rows.find(r => r.hour === 11)?.from_sigungu).toBe('모호');
        const mark = db.prepare(`SELECT * FROM stats_rollup_days WHERE day = ?`).get(DAY) as any;
        expect(mark).toMatchObject({ real_rows: 3, calls: 2, resolved_calls: 1 });
    });

    it('되풀이해도 같은 결과 — 그날 지우고 다시 넣기', () => {
        const before = db.prepare(`SELECT * FROM stats_flows WHERE day = ? ORDER BY hour`).all(DAY);
        rollupDay(DAY);
        expect(db.prepare(`SELECT * FROM stats_flows WHERE day = ? ORDER BY hour`).all(DAY)).toEqual(before);
    });

    it('🔴 90일 지난 날은 기사 칸을 뺀 합친 줄 — drivers 는 서로 다른 기사 수', () => {
        rollupDay(OLD);
        mergeOldDays(Date.parse('2020-06-01T12:00:00+09:00'));
        const rows = db.prepare(`SELECT * FROM stats_flows WHERE day = ?`).all(OLD) as any[];
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ user_id: '', drivers: 2, calls: 2, fare_calls: 2, fare_first_sum: 18500, km_calls: 0 });
        expect((db.prepare(`SELECT merged_at FROM stats_rollup_days WHERE day = ?`).get(OLD) as any).merged_at).toBeTruthy();
    });
});

describe('📊 부르는 자리 — 서버가 뜰 때 + 1시간마다 · 영업일 전환에는 없다', () => {
    it('listen 뒤 startStatsRollup · 첫 묶기는 부팅을 붙잡지 않는다', () => {
        expect(readFileSync(join(SRC, 'index.ts'), 'utf8')).toContain('startStatsRollup();');
        const svc = readFileSync(join(SRC, 'services/callFlowStats.ts'), 'utf8');
        expect(svc).toContain('setImmediate(run);');
        expect(svc).toMatch(/setInterval\(run, 3_600_000\)\.unref\(\)/);
        expect(readFileSync(join(SRC, 'state/filterManager.ts'), 'utf8')).not.toContain('rollup');
    });
});
