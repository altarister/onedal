import { describe, expect, it } from 'vitest';
import { morningCardOf, keptTodayCount, runningCount } from './morningCard';

/**
 * 📊 **아침 카드 — 오늘 이 시간엔 어디 → 어디가 많다** (reviews/25 4단계 · 1f 결정).
 * 세 줄 이내 · 먼발치 1~2초. 같은 요일 · 지금부터 3시간 창 · 흐름 둘 · 주마다 N건 · 표본 적으면 «(표본 N일)» · 0일이면 한 줄.
 * 모호·모름은 순위에서 빼고 꼬리의 «동네 못 가림 N%»로만. 꼬리 «내 폰이 본 목록 기준».
 */
// 2026-10-05 월요일 09:10 (로컬 = KST)
const NOW = new Date(2026, 9, 5, 9, 10).getTime();
const cell = (group: string, from: string, to: string, calls: number, fare: number | null = 11000, fareCalls = calls) =>
    ({ group, targetApp: 'kakaopicker', from, to, mine: { calls, fareCalls, fareFirstAvg: fare, fareLastAvg: fare }, all: null, fewOthers: false });

describe('📊 아침 카드', () => {
    it('같은 요일 · 3시간 창의 흐름 둘 · 주마다 N건', () => {
        const card = morningCardOf({
            days: ['2026-09-14', '2026-09-21', '2026-09-28', '2026-09-29'],   // 월요일 셋 + 화요일 하나
            cells: [
                cell('월 9시', '광주시', '서울 용산구', 6, 10000),
                cell('월 10시', '광주시', '서울 용산구', 3, 13000),
                cell('월 11시', '이천시', '광주시', 3),
                cell('월 12시', '성남시 분당구', '서울 강남구', 30),    // 창 밖(12시~)
                cell('화 9시', '광주시', '이천시', 30),                  // 다른 요일
                cell('월 9시', '모호', '서울 용산구', 2),                // 순위에서 뺀다
            ],
        }, NOW);
        expect(card.lines).toEqual([
            '📊 월요일 9~12시 · 최근 4주',
            '광주시 → 서울 용산구 · 주마다 3.0건 · 평균 1.1만',
            '이천시 → 광주시 · 주마다 1.0건 · 평균 1.1만',
        ]);
        expect(card.tail).toBe('내 폰이 본 목록 기준 · 동네 못 가림 14%');
    });

    it('🔴 같은 요일 표본이 2일 이하면 «(표본 N일)»', () => {
        const card = morningCardOf({ days: ['2026-09-28'], cells: [cell('월 9시', '광주시', '서울 용산구', 2)] }, NOW);
        expect(card.lines[0]).toBe('📊 월요일 9~12시 · 최근 4주 (표본 1일)');
    });

    it('🔴 쌓인 같은 요일이 0일이면 한 줄', () => {
        const card = morningCardOf({ days: [], cells: [] }, NOW);
        expect(card.lines).toEqual(['📊 아직 쌓인 날이 없다 — 내일 아침부터']);
        expect(card.tail).toBe('내 폰이 본 목록 기준');
    });

    it('표본은 있는데 이 시간대 흐름이 없으면 그렇게 적는다', () => {
        const card = morningCardOf({ days: ['2026-09-28'], cells: [] }, NOW);
        expect(card.lines[1]).toBe('이 시간대에 본 콜이 없다');
    });

    it('남이 3명 이상 섞인 칸은 합계(all)를 쓴다 — 내 값보다 넓다', () => {
        const c = { ...cell('월 9시', '광주시', '서울 용산구', 1), all: { calls: 9, fareCalls: 9, drivers: 4, fareFirstAvg: 12000, fareLastAvg: 12000 } };
        const card = morningCardOf({ days: ['2026-09-28'], cells: [c] }, NOW);
        expect(card.lines[1]).toBe('광주시 → 서울 용산구 · 주마다 9.0건 · 평균 1.2만');
    });

    it('🔴 평균 요금은 요금을 아는 콜로만 가중한다 — 모르는 콜이 평균을 낮추지 않는다', () => {
        const card = morningCardOf({ days: ['2026-09-28'], cells: [
            cell('월 9시', '광주시', '서울 용산구', 5, 20000, 1),      // 5콜 가운데 요금 아는 1콜 · 2만
            cell('월 10시', '광주시', '서울 용산구', 1, 10000, 1),
        ] }, NOW);
        expect(card.lines[1]).toBe('광주시 → 서울 용산구 · 주마다 6.0건 · 평균 1.5만');
    });

    it('🔴 요금을 아는 콜이 하나도 없으면 평균을 적지 않는다', () => {
        const card = morningCardOf({ days: ['2026-09-28'], cells: [cell('월 9시', '광주시', '서울 용산구', 3, null, 0)] }, NOW);
        expect(card.lines[1]).toBe('광주시 → 서울 용산구 · 주마다 3.0건');
    });
});

describe('📊 오늘 잡은 콜 — 카드가 보이는 조건', () => {
    const at = (d: Date) => d.toISOString();
    it('capturedAt 이 오늘 영업일인 잡은 콜만 센다 — 심사 중(아직 안 잡음) · 어제 콜은 안 센다', () => {
        const today = new Date(2026, 9, 5, 8, 0), yday = new Date(2026, 9, 4, 20, 0);
        const n = keptTodayCount([
            { status: 'ORDER_CONFIRMED', capturedAt: at(today) },
            { status: 'ORDER_DELIVERED', capturedAt: at(today) },
            { status: 'ORDER_SECURED_EVALUATING', capturedAt: at(today) },
            { status: 'ORDER_CONFIRMED', capturedAt: at(yday) },
        ] as any, NOW);
        expect(n).toBe(2);
    });
});

describe('📊 진행 중 콜 — 카드가 보이는 둘째 조건', () => {
    it('🔴 잡아서 아직 끝나지 않은 콜만 센다 — 심사 중 · 끝난 콜은 안 센다', () => {
        expect(runningCount([
            { status: 'ORDER_CONFIRMED' }, { status: 'ORDER_PICKED_UP' },
            { status: 'ORDER_AWAITING_DECISION' }, { status: 'ORDER_DELIVERED' }, { status: 'SAFE_CANCEL' },
        ])).toBe(2);
    });
});
