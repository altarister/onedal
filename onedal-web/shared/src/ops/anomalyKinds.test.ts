import { describe, it, expect } from 'vitest';
import { anomalyKindOf, anomalyKindLabel, anomalyTabsOf } from './anomalyKinds';

/** 🗂️ 운영센터 «앱 이상 기록» 탭 — 원달앱이 까닭 앞에 붙이는 «KIND:» 로 가른다(기사님 «전체보기 · 이상한 이유 카테고리를 탭으로») */
describe('앱 이상 기록 까닭 갈래', () => {
    it('앞머리 «KIND:» 를 떼어 갈래로 — 콜론이 없으면 «기타»', () => {
        expect(anomalyKindOf('CALL_TAKEN: 이미 배정된 콜 — …')).toBe('CALL_TAKEN');
        expect(anomalyKindOf('SCREEN_UNKNOWN: 낯선 글')).toBe('SCREEN_UNKNOWN');
        expect(anomalyKindOf('그냥 글')).toBe('OTHER');
        expect(anomalyKindOf('소문자: 앞머리 아님')).toBe('OTHER');
    });

    it('원달앱이 쓰는 갈래는 모두 한글 이름이 있다 · 모르는 갈래는 영문 그대로(지어내지 않는다)', () => {
        for (const k of ['CALL_TAKEN', 'SCREEN_UNKNOWN', 'DETAIL_MISMATCH', 'REQUIREMENT_UNMET', 'TAP_FAILED', 'SNAPSHOT_PARSE_FAILED', 'SNAPSHOT_MISMATCH', 'VEHICLE_UNKNOWN']) {
            expect(anomalyKindLabel(k), k).not.toBe(k);
        }
        expect(anomalyKindLabel('NEW_KIND')).toBe('NEW_KIND');
        expect(anomalyKindLabel('OTHER')).toBe('기타');
    });

    it('탭은 «전체» 다음 많은 순 · 개수가 맞다 · 없는 갈래는 탭이 없다', () => {
        const tabs = anomalyTabsOf(['TAP_FAILED: a', 'CALL_TAKEN: b', 'TAP_FAILED: c', '이상']);
        expect(tabs.map(t => [t.kind, t.count])).toEqual([['ALL', 4], ['TAP_FAILED', 2], ['CALL_TAKEN', 1], ['OTHER', 1]]);
        expect(tabs[0].label).toBe('전체');
    });
});
