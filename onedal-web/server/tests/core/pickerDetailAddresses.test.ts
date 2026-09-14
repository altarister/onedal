import { readFileSync } from 'fs';
import { join } from 'path';
import { pickerDetailAddresses } from '../../src/core/plugins/kakaopicker/pickerDetailText';

/**
 * 📍 **픽커 상세의 전체 주소로 위치를 찾는다 — 인성과 같은 자리** (2026-09-14 폰 시험 · 버그 대장 #124)
 *
 * 18:28:09 · 18:28:56 · 18:29:34 — 픽커 콜 주소가 리스트 줄임 이름 «광주 초월읍» 이라,
 * 카카오는 «경기 광주시 초월읍» 을 맞게 줬는데 서버의 지역 불일치 방어가 «광주»를 광주광역시로 보고 버렸다.
 * 인성은 상세 팝업의 **전체 주소**(«경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점»)를
 * `promoteDetailAddresses` 로 콜 주소로 올려서 늘 찾는다. 픽커 상세 화면에도 전체 주소가 있다.
 *
 * 원달앱이 보내는 상세 글자는 **띄어쓰기로 이어 붙인 한 줄**이다 (`screenTexts.joinToString(" ")`).
 */

/** 09-14 17:05:38 폰 로그 — 시뮬레이터 픽커 상세 (배송지가 보인다) */
const SIM_DETAIL = [
    '뒤로가기', '퀵', '배송 154분 남음', '준비 24분 포함', '경기 광주시 초월읍', '모다아울렛 곤지암점',
    '픽업 7.2km', '17:15까지 픽업', '경기 이천시 신둔면', '신둔농협하나로마트 예스파크점', '배송 10.0km',
    '19:40까지 배송', '픽업 장소', '매장 직원에게 문의', '오더번호 260914170513458', '물품 정보', '초소형',
    '최종 수익', '10,000', 'P', '배송비', '10,000P', '넘기기', '수락하기',
].join(' ');

/** 09-14 18:28:56 폰 로그 — 배송지에 건물명이 없는 상세 */
const SIM_DETAIL_NO_PLACE = '뒤로가기 퀵 배송 108분 남음 경기 광주시 초월읍 모다아울렛 곤지암점 픽업 2.2km 19:06까지 픽업 경기 이천시 중리동 배송 15.2km 20:17까지 배송 픽업 장소 매장 직원에게 문의';

/** 09-13 실물 픽커 접근성 글자 (`pickerScreenOcr.ts` 머리 주석) — 배송지가 아예 없고 건물명에 `kotlin.Unit` 이 붙는다 */
const REAL_DETAIL = '퀵 14.4km 퀵 16.9km 퀵 19.3km 픽업지 경기 성남시 수정구 위례동 위례역푸르지오4단지아파트kotlin.Unit 물품 정보 초소형';

describe('픽커 상세 글자 → 전체 주소 (#124)', () => {

    it('🔴 시뮬레이터 상세 — 픽업·배송 전체 주소 (시·도 + 시·군·구 + 동·읍·면 + 건물명)', () => {
        expect(pickerDetailAddresses(SIM_DETAIL)).toEqual({
            pickup: '경기 광주시 초월읍 모다아울렛 곤지암점',
            dropoff: '경기 이천시 신둔면 신둔농협하나로마트 예스파크점',
        });
    });

    it('건물명이 없으면 행정동까지만', () => {
        expect(pickerDetailAddresses(SIM_DETAIL_NO_PLACE)).toEqual({
            pickup: '경기 광주시 초월읍 모다아울렛 곤지암점',
            dropoff: '경기 이천시 중리동',
        });
    });

    it('🔴 실물 픽커 — 배송지가 없으면 null (지어내지 않는다) · 건물명의 kotlin.Unit 은 뗀다', () => {
        expect(pickerDetailAddresses(REAL_DETAIL)).toEqual({
            pickup: '경기 성남시 수정구 위례동 위례역푸르지오4단지아파트',
            dropoff: null,
        });
    });

    it('리스트 줄임 이름만 있으면 아무것도 안 올린다 — «광주 초월읍» 은 시·도 머리가 없다', () => {
        expect(pickerDetailAddresses('퀵 준비 완료 광주 초월읍 이천 신둔면 10,000')).toEqual({ pickup: null, dropoff: null });
        expect(pickerDetailAddresses('')).toEqual({ pickup: null, dropoff: null });
    });

    it('🔴 /detail 이 픽커 상세 주소를 인성과 같은 자리(promoteDetailAddresses)보다 먼저 채운다', () => {
        const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        const detail = codeOnly(readFileSync(join(__dirname, '../../src/routes/detail.ts'), 'utf8'));
        const fill = detail.indexOf('pickerDetailAddresses(');
        const promote = detail.indexOf('promoteDetailAddresses(pendingOrder)');
        expect(fill).toBeGreaterThan(-1);
        expect(promote).toBeGreaterThan(fill);
    });
});
