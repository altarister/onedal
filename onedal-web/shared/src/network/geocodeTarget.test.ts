import { describe, it, expect } from 'vitest';
import { geocodeTargetOf } from './pageRead';

/**
 * 📍 **이 콜을 어느 글로 지오코딩하나 · 다시 찍나 — 한 곳** (90판 · 24 발견 · 71 «가»).
 * 손 확정 콜은 보고의 상차지 글이 목록의 «초월읍»이라 동 대표점(행정복지센터)으로 찍혀 실제 상차지와 3km 어긋났다 —
 * 상세 팝업에서 읽은 주소(정거장 addressDetail)가 있으면 그것이 먼저다. 좌표는 «고른 글»을 따라가는 값이라,
 * 찍은 글과 지금 고른 글이 다르면 다시 찍는다(짧은 글로 먼저 찍힌 콜에 상세 주소가 오면).
 * 못 잡는 것: 실제 카카오 좌표 — 폰(손 확정 콜 «🌍 상차지 변환: '경기 … 경충대로 907 …'» · 상차지에서 «🏁 [도착 감지]»).
 */
const DETAIL = '경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점';
describe('📍 geocodeTargetOf', () => {
    it('🔴 상세 주소가 있으면 그것 · 없거나 비면 목록 글', () => {
        expect(geocodeTargetOf('insung', { listText: '초월읍', addressDetail: DETAIL }).text).toBe(DETAIL);
        expect(geocodeTargetOf('insung', { listText: '초월읍', addressDetail: '  ' }).text).toBe('초월읍');
        expect(geocodeTargetOf('insung', { listText: '신둔면' }).text).toBe('신둔면');
    });
    it('🔴 짧은 글로 먼저 찍힘 → 상세 주소 도착 → 다시 찍는다 · 같은 글이면 안 찍는다', () => {
        const first = { listText: '초월읍', geo: { x: 127.2879, y: 37.3852 }, geoText: '초월읍' };
        expect(geocodeTargetOf('insung', first).need).toBe(false);
        const later = { ...first, addressDetail: DETAIL };
        expect(geocodeTargetOf('insung', later)).toEqual({ text: DETAIL, need: true });
        expect(geocodeTargetOf('insung', { ...later, geoText: DETAIL }).need).toBe(false);
    });
    it('좌표가 없으면 찍는다 · 찍은 글을 모르는 옛 콜도 한 번 다시 찍는다', () => {
        expect(geocodeTargetOf('insung', { listText: '초월읍' }).need).toBe(true);
        expect(geocodeTargetOf('insung', { listText: '초월읍', geo: { x: 1, y: 2 } }).need).toBe(true);
        expect(geocodeTargetOf('insung', null)).toEqual({ text: '', need: true });
    });
});
