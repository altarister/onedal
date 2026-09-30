import { describe, expect, it } from 'vitest';
import { radiusScaleNoteOf } from './radiusNote';

/**
 * 📏 **필터 화면의 반경 설명 한 줄** — 자동으로 줄였으면 까닭, 내일 콜을 받으면 «내일 콜은 줄이지 않은 N km 그대로» (기사님 «가» · onedal-1f).
 */
const today = { radiusDistanceKm: 33.747, radiusBaseKm: 50 };
describe('📏 반경 설명', () => {
    it('🔴 줄였고 내일 콜도 받으면 — 내일 콜은 기본 반경 그대로', () => {
        expect(radiusScaleNoteOf({ ...today, reservationMode: 'tomorrowToo' }, { pickupRadiusKm: 25 }))
            .toBe('목적지(33.7km)가 기준거리 50km 보다 가까워 반경 넷을 ×0.67 로 줄였습니다 · 내일 콜은 줄이지 않은 25km 그대로');
    });
    it('🔴 오늘 콜만이면 내일 이야기가 없다', () => {
        expect(radiusScaleNoteOf({ ...today, reservationMode: 'today' }, { pickupRadiusKm: 25 }))
            .toBe('목적지(33.7km)가 기준거리 50km 보다 가까워 반경 넷을 ×0.67 로 줄였습니다');
    });
    it('안 줄였으면(배율 1) 지금 문구 그대로 · 거리를 못 재면 지금 문구 그대로', () => {
        expect(radiusScaleNoteOf({ radiusDistanceKm: 60.6, radiusBaseKm: 50, reservationMode: 'tomorrowToo' }, { pickupRadiusKm: 25 }))
            .toBe('목적지가 60.6km 라 기준거리 50km 로는 안 줄어듭니다 — 60.6km 위로 올려야 줄어듭니다');
        expect(radiusScaleNoteOf({ reservationMode: 'tomorrowToo' }, { pickupRadiusKm: 25 }))
            .toBe('거리를 못 재서 배율 ×1.0 — 반경은 원값 그대로입니다');
    });
});
