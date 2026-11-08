import { describe, it, expect } from 'vitest';
import { isLetGoScreen, isListScreen, screenReportOf, REPORTED_SCREENS } from './screenKinds';
import { STANDARD_SCREENS } from './networkPages';
import { landsAfterAcceptOf } from './networkPages';

/**
 * 🖐️ **«잡은 콜을 놓았다»는 목록 복귀이되, 배차망이 수락 뒤 스스로 보내는 페이지는 아니다** (38 F42 · 71 «가»).
 * 화물24시는 «신청» 뒤 같은 화면의 «배차내역»을 누르면 «배차내역 목록»(내 오더 · 목록 복귀 표시)으로 간다 — 계약한 화면이지 놓은 화면이 아니다.
 * 인성 «완료 탭»(`MY_ORDERS` + 페이지 이름 «완료 탭»)은 기사님이 손으로 가는 목록이라 놓음이다.
 * 그 사실은 배차망 정의 표의 `landsAfterAccept` 한 칸이다. 못 잡는 것: 원달앱 목록 복귀 리셋(원달앱 74 · 생성 파일로 같은 칸을 읽음).
 */
describe('🖐️ 놓음을 뜻하는 화면', () => {
    it('🔴 콜 목록 · 인성 완료 탭은 놓음 · 화물24시 배차내역 목록(수락 뒤 배차망이 보냄)은 목록 복귀여도 놓음 아님', () => {
        expect(isLetGoScreen('LIST', 'insung')).toBe(true);
        expect(isLetGoScreen('MY_ORDERS', 'insung', '완료 탭')).toBe(true);
        expect(isListScreen('MY_ORDERS', 'hwamul24', '배차내역 목록')).toBe(true);   // 목록 복귀(미리보기 정리 등)는 그대로
        expect(landsAfterAcceptOf('hwamul24', '배차내역 목록')).toBe(true);
        expect(isLetGoScreen('MY_ORDERS', 'hwamul24', '배차내역 목록')).toBe(false);
        expect(isLetGoScreen('DETAIL_CONFIRMED', 'insung')).toBe(false);
        expect(isLetGoScreen(null)).toBe(false);
    });
});

/** 🧭 보고 몸의 화면 칸 셋 — 보내는 값 목록 밖(원달앱 안 값 · 옛 값)과 글자 아닌 것은 null */
describe('🧭 화면 칸 셋 꺼내기', () => {
    it('보내는 값 목록은 기준 페이지 + 바탕화면 · 모름', () => {
        expect([...REPORTED_SCREENS]).toEqual([...STANDARD_SCREENS, 'LAUNCHER', 'UNKNOWN']);
    });

    it('목록 안 값 · 페이지 이름 · 덧칸 이름은 그대로', () => {
        expect(screenReportOf({ screenContext: 'DETAIL_PRE_CONFIRM', screenPage: '확정 전 상세', screenOverlay: '적요 팝업' }))
            .toEqual({ screenContext: 'DETAIL_PRE_CONFIRM', screenPage: '확정 전 상세', screenOverlay: '적요 팝업' });
    });

    it('목록 밖 값(원달앱 안 값 POPUP_MEMO) → null', () => {
        expect(screenReportOf({ screenContext: 'POPUP_MEMO', screenPage: '확정 전 상세' }))
            .toEqual({ screenContext: null, screenPage: '확정 전 상세', screenOverlay: null });
    });

    it('글자가 아니면 null · 몸이 없어도 칸 셋', () => {
        expect(screenReportOf({ screenContext: 3, screenPage: null, screenOverlay: {} }))
            .toEqual({ screenContext: null, screenPage: null, screenOverlay: null });
        expect(screenReportOf(undefined)).toEqual({ screenContext: null, screenPage: null, screenOverlay: null });
    });
});
