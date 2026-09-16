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

    /**
     * 🔴 **수락 뒤 화면의 버튼 글자를 건물명에 붙이지 않는다** (2026-09-14 21:28:04 폰 시험).
     * 원달앱이 수락 뒤 보낸 원문 그대로 — 서버 장부 픽업지가 «… 모다아울렛 곤지암점 오더 확인» 이 됐다.
     */
    it('🔴 수락 뒤 화면 — «오더 확인» 버튼 글자는 건물명이 아니다 (21:28:04 · 21:31:08 원문)', () => {
        expect(pickerDetailAddresses('뒤로가기 배정 취소 픽업 준비 45분 남음 배송 132분 남음 픽업지 경기 광주시 초월읍 모다아울렛 곤지암점 오더 확인'))
            .toEqual({ pickup: '경기 광주시 초월읍 모다아울렛 곤지암점', dropoff: null });
        expect(pickerDetailAddresses('뒤로가기 배정 취소 픽업 준비 완료 배송 0분 남음 픽업지 경기 광주시 곤지암읍 곤지암성당 오더 확인').pickup)
            .toBe('경기 광주시 곤지암읍 곤지암성당');
    });

    /**
     * 🔴 **«배송지» 표시가 앞에 있으면 배송지다 — 먼저 나왔다고 픽업지로 올리지 않는다** (2026-09-14 리뷰).
     * 실물 수락 뒤 아래 창(실물 17)에는 **배송지 주소만** 있다 — 순서로만 정하면 배송지를 픽업지로 올린다.
     */
    it('🔴 «픽업지»·«배송지» 표시가 주소 앞에 있으면 그 칸이다 — 없을 때만 순서대로', () => {
        expect(pickerDetailAddresses('배송 물품 가지러 왔습니다 오더 확인 260902091827593 배송지 경기 광주시 초월읍 쌍용 스윗닷홈 배송 물품 버거 세트'))
            .toEqual({ pickup: null, dropoff: '경기 광주시 초월읍 쌍용 스윗닷홈' });
        // 시뮬레이터 배송 이동 화면 (4단계) — «배송지» 표시 뒤 주소 · 아래 «오더 확인» 버튼
        expect(pickerDetailAddresses('뒤로가기 배송 시간 120분 남음 물품 파손/분실을 주의해 이동해주세요 배송지 경기 과천시 중앙동 픽커 고정 오더 확인'))
            .toEqual({ pickup: null, dropoff: '경기 과천시 중앙동 픽커 고정' });
    });

    /**
     * 🚶 **도보 콜 상세는 라벨 글자가 다르다 — «픽업지 정보» · «도착지 정보»** (실물 라이브 19:25).
     *
     * 퀵은 «픽업지»·«배송지» 인데 도보는 뒤에 «정보» 가 붙는다. 그래서 라벨이 안 걸려
     * 출발·도착이 **하나도 안 채워졌다.** 도보 콜은 목록에 동 이름이 아예 없어(가게 이름 → 건물 이름)
     * 이 상세가 **주소를 얻는 유일한 자리**다.
     *
     * 🔴 «DerivedState(value=픽업 0m)@165403119» 은 픽커 앱이 뱉는 잡음 글자다 (`kotlin.Unit` 계열) — 뗀다.
     */
    it('🔴 실물 도보 상세 — «픽업지 정보»·«도착지 정보» 라벨로 출발·도착을 채운다', () => {
        const WALK_DETAIL =
            '도보 승용차로 36분 소요 예상 배송 31분 남음 준비 8분 포함 ' +
            '픽업지 정보 DerivedState(value=픽업 0m)@165403119 죽의고수-성남점 경기 성남시 중원구 금빛로61번길 11 1층 일부호 ' +
            '도착지 정보 배송 1.4km 일성아파트 경기 성남시 중원구 순환로198번길 12 일성아파트';
        const got = pickerDetailAddresses(WALK_DETAIL);
        expect(got.pickup).toContain('경기 성남시 중원구');
        expect(got.dropoff).toContain('경기 성남시 중원구');
        expect(`${got.pickup} ${got.dropoff}`).not.toContain('DerivedState');
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
