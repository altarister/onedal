import { readFileSync } from 'fs';
import { join } from 'path';
import { parseLocationDetails, promoteDetailAddresses } from '../../src/utils/parser';

/**
 * 📍 **직접콜의 주소는 팝업 상세가 채운다 — 승격은 한 곳에서** (2026-08-30 · 버그 대장 #77)
 *
 * 알람 모드 첫 실전(7지점 문제지)에서 잡힌 직접콜이 장부에
 * `수집중(상세확인필요) → 수집중(상세확인필요)` 로 남았고, 그 주소 없는 콜이
 * 경로·progressKm 를 오염시켜 **03·05 미탐 + 07 오탐**을 만들었다.
 *
 * 🔴 **구조 결함**: 팝업의 «위치» 를 콜 주소로 올리는 승격이 **심사(OrderEvaluator) 안에만**
 *    있었다. 직접콜은 규칙 ①(심사하지 않는다)로 그 문을 안 지나므로 승격도 못 받았다.
 *    재료(`pickupDetails[0].addressDetail`)는 detail.ts 가 **모든 콜에서** 뽑고 있었는데도.
 *
 * 예전에 잘 되던 이유: 앱의 캐시 매칭(요금으로 리스트 콜 역추적)이 리스트의 진짜 주소를
 * 재활용해 이 구멍을 **가려 줬다.** 시뮬 상세 화면의 요금 `45,000(선불)` 이 파싱을 빠져나가
 * `fare=0` 이 되자 매칭이 무너졌고, 구멍이 드러났다 (08-25 «다마스→계산서필» 이 첫 관찰).
 *
 * → 승격을 `promoteDetailAddresses` **한 함수**로 꺼내 detail 수신 직후(분기 전)에 두고,
 *   심사도 같은 함수를 쓴다. 필터콜·직접콜·미리보기가 **같은 문**으로 주소를 얻는다.
 */

/** 🧾 실물 증거 — 2026-08-30 10:30 폰(OneDalPrefs)에 남은 실제 상세 원문의 뼈대 */
const REAL_RAW_TEXT = [
    '고양퀵서비스-031-932-7722', '전표', '상태 :', '신규', '물품 :', '마대 1개',
    '차량 :', '다마스', '요금 : 45,000(선불)',
    '[출발지상세]',
    '출발지 상세', '고객', '곤지암성당', '부서', '후문 상차장', '담당', '강주임',
    '전화1', '010-4690-9355', '전화2', '010-3305-6572', '출발', '곤지암읍',
    '위치', '경기 광주시 곤지암읍 경충대로543번길 19 곤지암성당',
    '닫기', '위치보기', '확정(9)',
    '[도착지상세]',
    '도착지 상세', '고객', '서울동경기인삼농협 하나로마트 이천점', '부서', '자재창고',
    '담당', '윤부장', '전화1', '010-3293-9494', '도착', '신둔면',
    '위치', '경기 이천시 신둔면 둔터로124번길 160 서울동경기인삼농협 하나로마트 이천점',
    '닫기', '위치보기',
].join('\n');

const srv = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('📍 승격 함수 — 팝업의 «위치»가 콜 주소가 된다', () => {
    it('🔴 «수집중» 이 실제 주소로 승격된다 (실물 rawText)', () => {
        const order: any = {
            pickup: '수집중(상세확인필요)', dropoff: '수집중(상세확인필요)',
            pickupDetails: parseLocationDetails(REAL_RAW_TEXT, '[출발지상세]'),
            dropoffDetails: parseLocationDetails(REAL_RAW_TEXT, '[도착지상세]'),
        };
        promoteDetailAddresses(order);
        expect(order.pickup).toBe('경기 광주시 곤지암읍 경충대로543번길 19 곤지암성당');
        expect(order.dropoff).toBe('경기 이천시 신둔면 둔터로124번길 160 서울동경기인삼농협 하나로마트 이천점');
    });

    it('상세가 없으면 있던 주소를 건드리지 않는다 (지어내지 않는다 — 규칙 ④)', () => {
        const order: any = { pickup: '경기 광주시 초월읍', dropoff: '경기 이천시 신둔면' };
        promoteDetailAddresses(order);
        expect(order.pickup).toBe('경기 광주시 초월읍');
        expect(order.dropoff).toBe('경기 이천시 신둔면');
    });

    it('위치 칸이 비면 승격하지 않는다', () => {
        const order: any = {
            pickup: '수집중(상세확인필요)', dropoff: '수집중(상세확인필요)',
            pickupDetails: [{}], dropoffDetails: [{}],
        };
        promoteDetailAddresses(order);
        expect(order.pickup).toBe('수집중(상세확인필요)');
    });
});

describe('📍 배선 — 승격이 분기 «앞» 공통 경로에 있다', () => {
    /**
     * 🔴 detail.ts 가 파싱 직후·직접콜 분기 **전에** 승격을 부른다.
     *    분기 뒤에 부르면 이 사고 그대로 되돌아온다.
     */
    it('🔴 detail.ts: parseLocationDetails 뒤 · isManual 분기 앞', () => {
        const c = codeOnly(srv('routes/detail.ts'));
        const parseAt = c.indexOf('parseLocationDetails');
        const promoteAt = c.indexOf('promoteDetailAddresses');
        const branchAt = c.indexOf('isManual');
        expect(parseAt).toBeGreaterThan(-1);
        expect(promoteAt).toBeGreaterThan(parseAt);
        expect(promoteAt).toBeLessThan(branchAt);
    });

    /** 🔴 심사도 **같은 함수**를 쓴다 — 승격 판단이 두 벌이 되지 않게 (규칙 ③) */
    it('🔴 OrderEvaluator 는 자기 승격 코드를 갖지 않는다', () => {
        const c = codeOnly(srv('core/engine/OrderEvaluator.ts'));
        expect(c).toMatch(/promoteDetailAddresses/);
        expect(c).not.toMatch(/pickup = securedOrder\.pickupDetails\[0\]\.addressDetail/);
    });
});
