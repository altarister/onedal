import { describe, expect, it } from 'vitest';
import { filterAlarmLine } from './filterAlarmLine';

describe('🔔 필터 통과 띠 문구', () => {
    it('🔴 앱이 못 열었고 기사님 손이 필요하면 — 까닭과 함께 직접 여시라고', () => {
        expect(filterAlarmLine({ passed: 2, openBlocked: 'acceptVisible' }, '픽커 '))
            .toBe('픽커 필터 통과 2건 — 앱이 못 열었습니다: 오더카드가 떠 있어 안 누름 — 직접 여십시오');
    });
    it('🔴 곧 스스로 풀리는 까닭은 띠가 없다 — 1~2초 뒤 앱이 연다', () => {
        expect(filterAlarmLine({ passed: 1, openBlocked: 'listMoving' }, '픽커 ')).toBeNull();
        expect(filterAlarmLine({ passed: 1, openBlocked: 'handFirst' }, '픽커 ')).toBeNull();
    });
    /* 🔴 기사님 «스캔앱에 누를 것이 없는데 계속 나온다 — 저 노티는 지우는 것이 맞다» — 앱이 여는 갈래는 띠가 없다(소리는 그대로) */
    it('🔴 까닭이 없으면(앱이 연다) 띠가 없다', () => {
        expect(filterAlarmLine({ passed: 1 }, '')).toBeNull();
    });
});
