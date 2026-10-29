import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateBaseCall, findMockEntry } from '@altari/core-simulator';
import type { CallDraft } from '@altari/core-simulator';
import {
    ISFLEX_MEMO_SAMPLES, isflexAcceptLabel, isflexDetailKm, isflexDropoffLabel, isflexDropoffPoint, isflexFare, isflexFareWon,
    isflexListKm, isflexPickupLabel, isflexPickupPoint, isflexRunKm, isflexTitle, toIsflexCall,
} from '@altari/ui-simulators';
import type { IsflexCall } from '@altari/ui-simulators';
import { FIXED_NOW, seededRandom } from './seededRandom';
import { isflexA, isflexB, isflexC } from './fixtures';

/**
 * 🛵 **인성플렉스 콜 칸 · 화면 글자** (기획서 61 부록 A 2장 · 3-1)
 *
 * 글자 꼴은 실물 캡처(`ex_images/인성플렉스/` 02 · 07 · 08~12)의 접근성 글자로 단언한다 — 원달앱 파서의 기대가 아니라 실물이 기준이다.
 * 못 잡는 것: 실물 «총 수입»이 운임에서 무엇을 뗀 값인지 · 오늘 예약 앞글자 꼴(실물을 모른다).
 */
describe('글자 함수 — 실물 글자 그대로', () => {
    it('목록 칸 · 상세 칸 [실물 02 · 08 · 10 · 12]', () => {
        expect(isflexListKm(24.3)).toBe('24.3');
        expect(isflexDetailKm(24.4)).toBe('24.4km');
        expect(isflexRunKm(30.1)).toBe('약 30.1km');
        expect(isflexFare(21252)).toBe('21,252');
        expect(isflexFareWon(21252)).toBe('21,252원');
        expect(isflexAcceptLabel(21252)).toBe('21,252원 \n수행하기');
    });

    it('출발 · 도착 · 머리 — 실물 10 «@경기 수원시영통구 @낼08:20/수원이의동» · «서울 중구 10:20전/쌍림동»', () => {
        expect(isflexPickupLabel(isflexB)).toBe('@낼08:20/수원이의동');
        expect(isflexDropoffLabel(isflexB)).toBe('10:20전/쌍림동');
        expect(isflexTitle(isflexB)).toBe('@낼08:20/수원이의동 → 10:20전/쌍림동');
        expect(isflexPickupPoint(isflexB)).toBe('@경기 수원시영통구 @낼08:20/수원이의동');
        expect(isflexDropoffPoint(isflexB)).toBe('서울 중구 10:20전/쌍림동');
    });

    it('실물 08 · 12 — 서울 · 인천은 구 하나', () => {
        expect(isflexPickupPoint(isflexA)).toBe('@서울 강남구 @역삼동');
        expect(isflexDropoffPoint(isflexA)).toBe('서울 강남구 대치동');
        expect(isflexPickupPoint(isflexC)).toBe('@경기 파주시 @동패동');
        expect(isflexDropoffPoint(isflexC)).toBe('인천 영종구 운서동');
    });

    it('🔴 적요 견본에 «요금» · «완료» 낱말이 없다 — 인성 표식 · 인성 «완료 탭»과 겹친다', () => {
        for (const m of ISFLEX_MEMO_SAMPLES) {
            expect(m).not.toContain('요금');
            expect(m).not.toContain('완료');
        }
    });
});

describe('toIsflexCall — 공통 칸은 그대로, 인성플렉스 칸만 더한다', () => {
    const config = { driverLon: 127.2553, driverLat: 37.4095, maxPickupKm: 15, minFare: 30000 };
    let drafts: CallDraft[] = [];
    let calls: IsflexCall[] = [];
    beforeAll(() => {
        vi.useFakeTimers();
        vi.setSystemTime(FIXED_NOW);
        drafts = Array.from({ length: 80 }, (_, i) => generateBaseCall(config, undefined, seededRandom(1000 + i))!);
        calls = drafts.map((d, i) => toIsflexCall(d, { minFare: config.minFare }, seededRandom(3000 + i)));
    });
    afterAll(() => { vi.useRealTimers(); });

    it('① 공통 칸은 한 칸도 안 바뀐다', () => {
        calls.forEach((c, i) => {
            const { fare: _fare, net: _net, vehicleKind: _k, vehicleWord: _w, reservePrefix: _r, deadlinePrefix: _d,
                pickupDong: _pd, dropoffDong: _dd, tags: _t, memo: _m, paymentType: _p, ...common } = c;
            expect(common).toEqual(drafts[i]);
        });
    });

    it('② 같은 씨앗이면 같은 콜', () => {
        drafts.forEach((d, i) => expect(toIsflexCall(d, { minFare: config.minFare }, seededRandom(3000 + i))).toEqual(calls[i]));
    });

    it('③ 랜덤 수입은 원 단위 끝이 흩어진다(전부 천 원 단위가 아니다)', () => {
        expect(calls.filter(c => c.fare % 1000 !== 0).length).toBeGreaterThan(calls.length / 2);
        calls.forEach(c => expect(c.fare).toBeGreaterThan(0));
    });

    it('④ 상차가 내일이면 «낼» 앞글자 세 꼴 가운데 하나 · 오늘이면 없음', () => {
        for (const c of calls) {
            const tomorrow = new Date(c.pickupAt!).getDate() !== FIXED_NOW.getDate();
            if (tomorrow) expect(c.reservePrefix).toMatch(/^낼(\d{2}:\d{2}\/|\d{1,2}:\d{2}\)|\d{2}시\/)$/);
            else expect(c.reservePrefix).toBe('');
        }
    });

    it('⑥ 적요는 비면 «없음» · 견본이면 견본 그대로 · 결제는 선불 · 착불 · 없음', () => {
        for (const c of calls) {
            expect(['없음', ...ISFLEX_MEMO_SAMPLES]).toContain(c.memo);
            expect([undefined, '선불', '착불']).toContain(c.paymentType);
            expect(c.vehicleWord).toBe(c.vehicleKind === '오토바이' ? '오토' : c.vehicleKind);
        }
    });
});

describe('⑤ 문제지 · 개별콜 콜은 섞지 않는다 — netFields 와 정한 요금만', () => {
    const pickup = findMockEntry('삼성로 129')!;
    const dropoff = findMockEntry('판교역로 235')!;
    const config = { driverLon: pickup.lon, driverLat: pickup.lat, maxPickupKm: 15, minFare: 30000 };

    it('정한 것이 없으면 접두 · 꼬리표 · 결제 없음 · 적요 «없음» · 오토바이 «오토» · 요금 그대로', () => {
        const forced = { pickup, dropoff, fare: 21252 };
        const c = toIsflexCall(generateBaseCall(config, forced)!, { minFare: 30000, forced }, seededRandom(1));
        expect([c.reservePrefix, c.deadlinePrefix, c.tags, c.memo, c.paymentType, c.vehicleWord, c.fare]).toEqual(['', '', [], '없음', undefined, '오토', 21252]);
        expect(c.pickupDong).toBe(pickup.region);
    });

    it('netFields 가 정하면 그대로 · 칩에 없는 차종은 승용/소형 칩에 받은 낱말 그대로', () => {
        const forced = { pickup, dropoff, fare: 9000, vehicleType: '1t',
            netFields: { reservePrefix: '낼8:30)', deadlinePrefix: '10:20전/', tags: '과적,급송', memo: '박스1개 친절하게 부탁합니다', paymentType: '착불' } };
        const c = toIsflexCall(generateBaseCall(config, forced)!, { minFare: 30000, forced });
        expect([c.reservePrefix, c.deadlinePrefix, c.tags, c.memo, c.paymentType, c.vehicleKind, c.vehicleWord])
            .toEqual(['낼8:30)', '10:20전/', ['과적', '급송'], '박스1개 친절하게 부탁합니다', '착불', '승용/소형', '1t']);
    });
});
