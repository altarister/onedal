/**
 * ⚖️ **앱 판정을 옳게 옮겨 적는가** — 이게 틀리면 화면의 ⭕/❌ 가 **거짓말**을 한다.
 *
 * 🔴 **판정 규칙은 여기서 검사하지 않는다** — 그건 앱의 일이다(`InsungParser`).
 *    여기에 판정 사본을 두면 앱과 갈라진다. 이 검사가 무는 것은
 *    **«앱이 준 낱말을 삼키지 않는가»** 하나다.
 */
import { describe, it, expect } from 'vitest';
import { viewOfVerdict, viewAll, tallyMarks, MARK_SIGN, VERDICT_AXIS_LABEL } from './callVerdict';

const HELD = [{ pickup: '경기 광주시 초월읍 경충대로', dropoff: '경기 성남시 분당구 구미동', fare: 100_000 }];

describe('버린 콜 — 앱 판정을 옮겨 적는다', () => {

    it('🟢 통과한 콜이 쥔 콜에 있으면 «잡음»', () => {
        const r = viewOfVerdict({ pickup: '초월읍', dropoff: '구미동', fare: 100_000, verdict: 'pass' }, [...HELD]);
        expect(r.mark).toBe('kept');
    });

    /**
     * 🔴 **판정이 매칭보다 먼저다**.
     *    매칭을 먼저 보면 앱이 **보지도 않은**(`locked`) 콜이 쥔 콜과 짝지어져 🟢 로 뜬다.
     */
    it('❔ 쥔 콜과 같아 보여도 locked 면 «못 잼»이다', () => {
        const r = viewOfVerdict({ pickup: '초월읍', dropoff: '구미동', fare: 100_000, verdict: 'locked' }, [...HELD]);
        expect(r.mark).toBe('unknown');
    });

    it('❌ 쥔 콜과 같아 보여도 앱이 떨어뜨렸으면 «탈락»이다', () => {
        const r = viewOfVerdict({ pickup: '초월읍', dropoff: '구미동', fare: 100_000, verdict: 'fare' }, [...HELD]);
        expect(r.mark).toBe('dropped');
    });

    /**
     * 🔴 **한 번 잡은 콜은 한 줄만 설명한다**.
     *    짝이 지어지면 그 콜을 빼낸다 — 안 빼면 «마장면 → 마장면 · 200천» 같은 줄이 여러 건 뜰 때
     *    **전부** 쥔 콜 하나에 붙어 죄다 🟢 가 된다.
     */
    it('같은 구간·같은 요금이 여러 건이면 한 줄만 «잡음»', () => {
        const rows = [
            { pickup: '초월읍', dropoff: '구미동', fare: 100_000, verdict: 'pass' },
            { pickup: '초월읍', dropoff: '구미동', fare: 100_000, verdict: 'pass' },
            { pickup: '초월읍', dropoff: '구미동', fare: 100_000, verdict: 'pass' },
        ];
        const marks = viewAll(rows, HELD).map(x => x.v.mark);
        expect(marks.filter(m => m === 'kept')).toHaveLength(1);
        expect(marks.filter(m => m === 'missed')).toHaveLength(2);
    });

    /** 🔴 **이 한 건이 이 화면의 존재 이유다** — 앱은 통과라 했는데 안 잡힌 콜 */
    it('⭕ 앱이 «pass» 라 했는데 안 잡았으면 «놓침»', () => {
        expect(viewOfVerdict({ pickup: '초월읍', dropoff: '구미동', verdict: 'pass' }).mark).toBe('missed');
    });

    it('❌ 떨어뜨린 축이 오면 «탈락» — 축 이름을 한국어로 적는다', () => {
        const r = viewOfVerdict({ verdict: 'region' });
        expect(r.mark).toBe('dropped');
        expect(r.why).toContain('지역');
    });

    /**
     * 🔴 **«잠겨서 안 봤다»는 걸러진 것과 다르다**.
     *    축 이름으로 적으면 «지역에서 떨어졌다»가 되어 거짓말이 된다 (규칙 ④).
     */
    it('❔ locked 는 탈락이 아니라 «못 잼»', () => {
        const r = viewOfVerdict({ verdict: 'locked' });
        expect(r.mark).toBe('unknown');
        expect(r.why).toContain('잠겨');
    });

    it('❔ 판정을 안 실은 콜(구앱·옛 행)은 «못 잼»', () => {
        expect(viewOfVerdict({ verdict: null }).mark).toBe('unknown');
        expect(viewOfVerdict({}).mark).toBe('unknown');
    });

    /**
     * 🔴 **모르는 낱말을 «기타»로 뭉개지 않는다** — 앱이 축을 새로 더했을 때
     *    화면이 조용히 삼키면, 새 축으로 떨어진 콜을 영영 못 본다.
     */
    it('표에 없는 축 이름은 그대로 적는다', () => {
        const r = viewOfVerdict({ verdict: 'schedule' });
        expect(r.mark).toBe('dropped');
        expect(r.why).toBe('schedule');
    });

    /** ⚠️ `intel` 주소는 짧은 이름이다 — 긴 주소에 드는지로 맞춘다 */
    it('짧은 주소가 긴 주소에 들면 같은 콜로 본다', () => {
        const r = viewOfVerdict({ pickup: '초월읍', dropoff: '구미동', fare: 100_000, verdict: 'pass' }, [...HELD]);
        expect(r.mark).toBe('kept');
    });

    it('요금이 다르면 다른 콜이다 (같은 구간이 하루에 여러 번 뜬다)', () => {
        const r = viewOfVerdict({ pickup: '초월읍', dropoff: '구미동', fare: 50_000, verdict: 'pass' }, [...HELD]);
        expect(r.mark).toBe('missed');
    });

    it('앱이 보내는 축 여섯을 전부 한국어로 안다', () => {
        for (const axis of ['vehicle', 'region', 'fare', 'pickup', 'blacklist', 'routeOrder']) {
            expect(VERDICT_AXIS_LABEL[axis]).toBeTruthy();
        }
    });

    it('요약은 갈래별로 센다', () => {
        expect(tallyMarks(['kept', 'missed', 'missed', 'dropped'])).toEqual({
            kept: 1, missed: 2, dropped: 1, unknown: 0,
        });
    });

    it('기호 표가 네 갈래를 모두 덮는다', () => {
        expect(Object.keys(MARK_SIGN).sort()).toEqual(['dropped', 'kept', 'missed', 'unknown']);
    });
});
