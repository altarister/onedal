import { describe, expect, it } from 'vitest';
import { filterAlarmLine } from './filterAlarmLine';

describe('🔔 필터 통과 띠 문구', () => {
    it('🔴 목록이 내려가 앱이 못 열면 — 올리거나 직접 여시라고', () => {
        expect(filterAlarmLine({ passed: 2, listHeaderHidden: true }, '카카오 픽커 '))
            .toBe('카카오 픽커 필터 통과 2건 — 목록이 내려가 앱이 못 엽니다 — 맨 위로 올리거나 직접 여십시오');
    });
    /* 🔴 기사님 «스캔앱에 누를 것이 없는데 계속 나온다 — 저 노티는 지우는 것이 맞다» — 보통 갈래는 띠가 없다(소리는 그대로) */
    it('🔴 아니면(모름 포함) 띠가 없다', () => {
        expect(filterAlarmLine({ passed: 1 }, '')).toBeNull();
        expect(filterAlarmLine({ passed: 1, listHeaderHidden: false }, '카카오 픽커 ')).toBeNull();
    });
});
