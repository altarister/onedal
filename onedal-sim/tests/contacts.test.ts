import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getNextDropoffDetail, getNextPickupDetail } from '@altari/ui-simulators';
import { seededRandom } from './seededRandom';

/**
 * 🔒 **인성 상세 팝업의 연락처를 그대로 잠근다** (2026-09-14 · 카카오픽커_시뮬레이터.md 0단계 0-2 ②)
 *
 * 인성 상세 화면에서 출발지·도착지를 누르면 이 함수가 연락처를 채운다. **누를 때만** 불리므로
 * 화면 글자 스냅숏(`screens.test.tsx`)은 이 동작을 못 본다 — 그래서 옮기기 전에 따로 적어 둔다.
 *
 * 🔴 도착지는 모듈 안 순번(`dropoffIdx`)을 한 칸씩 넘기며 꺼낸다 — **부르는 순서가 곧 결과**다.
 *    이 파일의 검사 순서를 바꾸면 스냅숏이 달라진다. 옮긴 뒤에도 같은 순서로 불러 같은 결과여야 한다.
 */
describe('인성 연락처 — 고정 난수 · 정해진 순서', () => {
    beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(seededRandom(4242)); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('상차지 연락처 — 지역 이름으로 찾기 · 없는 지역 · 빈 이름', () => {
        expect([
            getNextPickupDetail('경기 / 광주시 / 초월읍'),
            getNextPickupDetail('경기 성남시 분당구'),
            getNextPickupDetail('제주 / 서귀포시 / 대정읍'),
            getNextPickupDetail(),
        ]).toMatchSnapshot();
    });

    it('하차지 연락처 — 순번이 한 칸씩 넘어간다', () => {
        expect([
            getNextDropoffDetail('경기 / 광주시 / 초월읍'),
            getNextDropoffDetail('경기 / 광주시 / 초월읍'),
            getNextDropoffDetail('서울 / 강남구 / 역삼동'),
            getNextDropoffDetail('제주 / 서귀포시 / 대정읍'),
            getNextDropoffDetail(),
        ]).toMatchSnapshot();
    });
});
