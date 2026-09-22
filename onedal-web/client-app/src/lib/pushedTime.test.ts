import { describe, it, expect } from 'vitest';
import { parseClock, pushClock, gapLabel, gapTone } from './pushedTime';

/**
 * 🧪 **밀린 시각을 미리 보여 준다** (기사님 확정 · «가» 안)
 *
 * 합짐이 앞에 끼면 뒤 정거장이 그만큼 밀린다. 그것을 **잡기 전에** 보여 줘야
 * «감수하고 KEEP» 하시는 판단이 선다.
 */
describe('시각 읽기', () => {
    it('«~» 가 붙어 있어도 읽는다', () => {
        expect(parseClock('~17:54')).toBe(17 * 60 + 54);
        expect(parseClock('17:54')).toBe(17 * 60 + 54);
    });

    /** 🔴 못 읽으면 `null` — 지어내지 않는다 (규칙 ④) */
    it('시각이 아니면 null', () => {
        expect(parseClock('완료')).toBeNull();
        expect(parseClock('')).toBeNull();
        expect(parseClock('99:99')).toBeNull();
    });
});

describe('시각 밀기', () => {
    it('34분 밀면 17:54 가 18:28 이 된다', () => {
        expect(pushClock('~17:54', 34)).toBe('~18:28');
    });

    /** 🔴 «~»(통화 전 추정)는 밀려도 여전히 추정이다 — 표시를 지우지 않는다 (규칙 ⑤-2) */
    it('«~» 표시를 그대로 살린다', () => {
        expect(pushClock('~17:54', 34).startsWith('~')).toBe(true);
        expect(pushClock('17:54', 34)).toBe('18:28');
    });

    it('당겨지는 것도 된다', () => {
        expect(pushClock('~17:54', -4)).toBe('~17:50');
    });

    it('자정을 넘어가면 감긴다', () => {
        expect(pushClock('23:50', 20)).toBe('00:10');
        expect(pushClock('00:10', -20)).toBe('23:50');
    });

    /** 🔴 못 읽으면 원문 그대로 — 화면이 빈칸이 되느니 옛 값이 낫다 */
    it('못 읽는 값은 건드리지 않는다', () => {
        expect(pushClock('완료', 34)).toBe('완료');
    });

    it('0 분이면 그대로다', () => {
        expect(pushClock('~17:54', 0)).toBe('~17:54');
    });
});

describe('차이를 어떻게 적나', () => {
    it('밀리면 +, 당겨지면 −', () => {
        expect(gapLabel(34)).toBe('+34분');
        expect(gapLabel(-4)).toBe('-4분');
    });

    it('0 이면 안 적는다', () => {
        expect(gapLabel(0)).toBe('');
    });

    /**
     * 🔴 **밀리는 것은 나쁜 일이다** — 밀리면 나쁜 색, 당겨지면 좋은 색으로 적는다.
     *    「+34분」이 초록이면 **좋은 일로 읽힌다** — 색이 곧 결정이다 (규칙 ⑤-3).
     */
    it('밀림과 당김의 색이 다르다', () => {
        expect(gapTone(34)).toBe('bad');
        expect(gapTone(-4)).toBe('good');
        expect(gapTone(0)).toBe('none');
    });
});
