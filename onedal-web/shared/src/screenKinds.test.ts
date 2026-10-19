import { describe, it, expect } from 'vitest';
import { isLetGoScreen, isListScreen } from './screenKinds';
import { landsAfterAcceptOf } from './networkPages';

/**
 * 🖐️ **«잡은 콜을 놓았다»는 목록 복귀이되, 배차망이 수락 뒤 스스로 보내는 페이지는 아니다** (38 F42 · 71 «가»).
 * 화물24시는 «신청» 뒤 같은 화면의 «배차내역»을 누르면 «배차내역 목록»(내 오더 · 목록 복귀 표시)으로 간다 — 계약한 화면이지 놓은 화면이 아니다.
 * 인성 «완료 탭»은 기사님이 손으로 가는 목록이라 놓음이다(옛 LIST_COMPLETED).
 * 그 사실은 배차망 정의 표의 `landsAfterAccept` 한 칸이다. 못 잡는 것: 원달앱 목록 복귀 리셋(원달앱 74 · 생성 파일로 같은 칸을 읽음).
 */
describe('🖐️ 놓음을 뜻하는 화면', () => {
    it('🔴 콜 목록 · 인성 완료 탭은 놓음 · 화물24시 배차내역 목록(수락 뒤 배차망이 보냄)은 목록 복귀여도 놓음 아님', () => {
        expect(isLetGoScreen('LIST', 'insung')).toBe(true);
        expect(isLetGoScreen('LIST_COMPLETED', 'insung')).toBe(true);
        expect(isLetGoScreen('MY_ORDERS', 'insung', '완료 탭')).toBe(true);
        expect(isListScreen('MY_ORDERS', 'hwamul24', '배차내역 목록')).toBe(true);   // 목록 복귀(미리보기 정리 등)는 그대로
        expect(landsAfterAcceptOf('hwamul24', '배차내역 목록')).toBe(true);
        expect(isLetGoScreen('MY_ORDERS', 'hwamul24', '배차내역 목록')).toBe(false);
        expect(isLetGoScreen('DETAIL_CONFIRMED', 'insung')).toBe(false);
        expect(isLetGoScreen(null)).toBe(false);
    });
});
