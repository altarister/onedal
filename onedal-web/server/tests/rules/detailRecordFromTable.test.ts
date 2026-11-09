import { readFileSync } from 'fs';
import { join } from 'path';
import { detailRecordOf, pickupClockMsOf, callCargoHintsOf, parseCargoHints } from '@onedal/shared';

/**
 * 📄 **상세 원문의 콜 자료(상태 · 결제 · 수수료 · 연락처 …)는 배차망 정의 표대로 읽는다** (기사님 «1~5 모두 가» · onedal-69).
 *    서버는 칸마다 상세 화면 정의 줄의 읽는 법(pageFieldOf · 조각 part)으로 읽고, 못 찾은 칸은 싣지 않는다(아는 값을 지우지 않는다).
 *    인성: 구분 «왕복» → tripType · 형태 «급송» → orderForm(급송 표시) · 빈 «탁송료 :»는 빈 칸 · 결제 괄호 둘째 «(계산서)» → billingType ·
 *    머리 줄 «고양퀵서비스-031-932-7722» → 배차사 이름 · 전화 · 적요는 팝업 글(줄바꿈 → 공백) · 없으면 본문 «적요상세» 줄(상차 약속 시각 무변화).
 *    돈 · 짐 묶음은 조각 이름이 갈래 이름인 줄만 읽는다(돈 줄 · 짐 줄) — 조각 없는 요금 줄은 안 읽고, 하나도 안 읽히면 묶음 칸이 없다.
 */
/** 공통 문제지 — 서버만의 «칸 → 콜 자료» 대응은 여기서 같은 원문으로 묻는다(두 곳이 안 갈리게) */
const SHEET = JSON.parse(readFileSync(join(__dirname, '../../../shared/src/network/pageReadCases.json'), 'utf8')) as { cases: Array<{ network: string; field: string; part?: string; texts: string[]; expect: string | null }> };
const sheetText = (network: string, field: string) => SHEET.cases.find(c => c.network === network && c.field === field)!.texts.join(' ');
/** 같은 칸 · 같은 조각 · 같은 답의 문제지 원문 — 한 칸에 원문이 여럿일 때 */
const sheetOf = (network: string, field: string, expect: string, part?: string) =>
    SHEET.cases.find(c => c.network === network && c.field === field && c.part === part && c.expect === expect)!.texts.join(' ');

const FULL = '고양퀵서비스-031-932-7722\n전표\n상태 : 신규\n물품 : 박스 1개\n차량 : 다마스\n탁송료 :\n수수료 : 23%\n요금 : 50,000(카드)(계산서)\n구분 : 편도\n형태 : 보통\n적요상세 *카고 입니다. 세금계산서필 03:57 상차.\n[적요상세/정보]\n적요 상세\n적요 내용\n까대기 있음 직접운반\n대기 30분\n닫기\n[출발지상세]\n고객 가나상사\n위치: 경기 광주시 경안동 1-2\n부서 물류팀\n담당 김철수\n전화1 010-1234-5678\n전화2 031-000-0000\n[도착지상세]\n고객\n다라상회\n위치\n서울 용산구 한남동 12\n전화1 010-9999-8888\n';
const BODY = '(주)신한로직스-1588-5480\n상태 : 배송\n물품 : 서류\n차량 : 트럭-1t\n탁송료 : 3,000\n수수료 : 20%\n요금 : 85,000(신용)\n구분 : 왕복\n형태 : 급송\n적요상세 10시전하차 착불\n';

describe('📄 상세 콜 자료 — 정의 표', () => {
    it('🔴 인성 상세(팝업까지) — 칸마다 표대로', () => {
        expect(detailRecordOf('insung', FULL)).toEqual({
            stageText: '신규', itemDescription: '박스 1개', paymentType: '카드', billingType: '계산서', commissionRate: '23%',
            tripType: '편도', orderForm: '보통', detailMemo: '까대기 있음 직접운반 대기 30분',
            dispatcherName: '고양퀵서비스', dispatcherPhone: '031-932-7722',
            money: { lines: [], feeRateText: '23%', paymentType: '카드', paymentShown: '카드', billingType: '계산서', billingShown: '계산서' },
            pickupDetails: [{ customerName: '가나상사', addressDetail: '경기 광주시 경안동 1-2', department: '물류팀', contactName: '김철수', phone1: '010-1234-5678', phone2: '031-000-0000' }],
            dropoffDetails: [{ customerName: '다라상회', addressDetail: '서울 용산구 한남동 12', phone1: '010-9999-8888' }],
        });
    });
    it('🔴 인성 상세(팝업 없음) — 급송 · 왕복 · 탁송료 · 본문 적요', () => {
        expect(detailRecordOf('insung', BODY)).toEqual({
            stageText: '배송', itemDescription: '서류', paymentType: '신용', commissionRate: '20%', tollFare: '3,000',
            tripType: '왕복', orderForm: '급송', detailMemo: '10시전하차 착불',
            dispatcherName: '(주)신한로직스', dispatcherPhone: '1588-5480', pickupDetails: [], dropoffDetails: [],
            money: { lines: [], feeRateText: '20%', paymentType: '신용', paymentShown: '신용', billingType: null, billingShown: null },
        });
    });
    it('🔴 구분 · 형태는 표시 글자 표(badgeWords)로 정한다 — 그 갈래 값 · 다른 뜻 낱말은 칸 없음 · 표에 없는 낱말은 «모름»', () => {
        const reserved = detailRecordOf('insung', BODY.replace('형태 : 급송', '형태 : 예약'));
        expect(reserved.tripType).toBe('왕복');
        expect(reserved).not.toHaveProperty('orderForm');
        expect(detailRecordOf('insung', BODY.replace('형태 : 급송', '형태 : 특송')).orderForm).toBe('모름');
        const overload = detailRecordOf('isflex', sheetOf('isflex', 'tags', '과적'));
        expect(overload).not.toHaveProperty('tripType');
        expect(overload).not.toHaveProperty('orderForm');
        const urgent = detailRecordOf('isflex', sheetOf('isflex', 'tags', '과적').replace('오토 과적', '오토 과적 급'));
        expect(urgent.orderForm).toBe('급송');
        expect(urgent).not.toHaveProperty('tripType');
    });
    it('🔴 적요는 팝업 글이 먼저 — 본문 «03:57 상차»가 상차 약속 시각이 되지 않는다(지금과 같음)', () => {
        const captured = Date.parse('2030-01-01T02:00:00+09:00');
        expect(pickupClockMsOf(detailRecordOf('insung', FULL), captured, 30)).toBe(captured + 30 * 60_000);
    });
    it('🔴 첫 상차 시각만 있고 날 글자가 없으면 오늘 그 시각 · 날만 있고 시각이 없으면 모름 · 지난 시각이면 다음 순서', () => {
        const captured = Date.parse('2030-01-01T16:30:00+09:00');
        expect(pickupClockMsOf({ pickupDetails: [{ requestedTime: '17:04' }] }, captured, 20)).toBe(Date.parse('2030-01-01T17:04:00+09:00'));
        expect(pickupClockMsOf({ pickupDetails: [{ requestedDay: 1 }] }, captured, 20)).toBeNull();
        expect(pickupClockMsOf({ pickupDetails: [{ requestedTime: '15:00' }] }, captured, 20)).toBe(captured + 20 * 60_000);
    });
    it('🔴 화물24시 결제방법 · 픽커 물품정보도 표대로(기사님 «가») — 원문은 공통 문제지에서', () => {
        expect(detailRecordOf('hwamul24', sheetText('hwamul24', 'payment')).paymentType).toBe('착불');
        expect(detailRecordOf('kakaopicker', sheetText('kakaopicker', 'itemSize')).itemDescription).toBe('초소형 세 변의 합 70cm ∙ 2kg 이하');
    });
    it('🔴 화물24시 결제방법 «선/착불» → 결제 · «인수증» → 증빙(결제는 비움) — 버려지지 않는다', () => {
        expect(detailRecordOf('hwamul24', '운송료 180,000 수수료 20,000 결제방법 선/착불 합계금액 200,000')).toMatchObject({ paymentType: '선/착불' });
        const receipt = detailRecordOf('hwamul24', '운송료 140,000 수수료 0 결제방법 인수증 합계금액 140,000');
        expect(receipt.billingType).toBe('인수증');
        expect(receipt.paymentType).toBeUndefined();
    });
    it('🔴 화물24시 상세 상차지 · 하차지 칸 → 정거장 상세 주소 · 끝 괄호 상호(주소 9) — 원문은 공통 문제지에서', () => {
        const sheet = SHEET.cases.find(c => c.network === 'hwamul24' && c.field === 'pickup')!.texts.join(' ');
        expect(detailRecordOf('hwamul24', sheet)).toMatchObject({
            pickupDetails: [{ addressDetail: '경기 군포 당정동 공단로124번길 4', customerName: '크레텍' }],
            dropoffDetails: [{ addressDetail: '경기 안산 단원구 와동왕복' }],
        });
        expect(detailRecordOf('hwamul24', sheet).dropoffDetails[0].customerName).toBeUndefined();
    });
    it('🔴 플렉스 상세 원문 → 정거장 빈 목록 그대로 — 조각 없는 출발 · 도착 줄은 정거장을 만들지 않는다', () => {
        expect(detailRecordOf('isflex', sheetText('isflex', 'pickup'))).toMatchObject({ pickupDetails: [], dropoffDetails: [] });
    });
    it('🔴 인성 머리표 없는 원문 → 빈 목록 그대로', () => {
        const noTags = FULL.replace('[출발지상세]', '').replace('[도착지상세]', '');
        expect(detailRecordOf('insung', noTags)).toMatchObject({ pickupDetails: [], dropoffDetails: [] });
    });
    it('화면 글자가 «모름»이면 결제 · 증빙에 담지 않는다 — «모름» 값은 돈 묶음(paymentOf)에서만', () => {
        expect(detailRecordOf('insung', '요금 : 40,000(모름)(모름)')).toEqual({ pickupDetails: [], dropoffDetails: [],
            money: { lines: [], feeRateText: null, paymentType: '모름', paymentShown: '모름', billingType: '모름', billingShown: '모름' } });
        expect(detailRecordOf('hwamul24', '결제방법 모름').paymentType).toBeUndefined();
    });
    it('결제 괄호가 알려진 결제수단이 아니면 싣지 않는다 · 못 찾은 칸은 싣지 않는다', () => {
        expect(detailRecordOf('insung', '요금 : 40,000(협의)')).toEqual({ pickupDetails: [], dropoffDetails: [],
            money: { lines: [], feeRateText: null, paymentType: '모름', paymentShown: '협의', billingType: null, billingShown: null } });
        expect(Object.values(detailRecordOf('kakaopicker', '픽업지 경기 광주시 경안동 넘기기')).some(v => v === undefined)).toBe(false);
    });
    it('🔴 화물24시 «화물상세정보» → 돈 줄 · 수수료율 글자 · 결제 · 증빙 / 짐 차종 글자 · 짐 줄 / 화물번호 — 조각 이름이 갈래 이름', () => {
        const card = detailRecordOf('hwamul24', sheetOf('hwamul24', 'fare', '6,000', 'vat'));
        expect(card.money).toEqual({
            lines: [{ kind: 'vat', won: 6000, shown: '6,000' }, { kind: 'insurance', won: 260, shown: '260' }, { kind: 'unknown', won: 65144, shown: '65,144' }],
            feeRateText: '[ 카드수납 수수료 = (운송료+부가세) x1.298% ]', paymentType: '카드', paymentShown: '카드', billingType: null, billingShown: null,
        });
        const receipt = detailRecordOf('hwamul24', sheetOf('hwamul24', 'vehicleType', '3.5톤', 'ton'));
        expect(receipt.money).toEqual({
            lines: [{ kind: 'total', won: 140000, shown: '140,000' }, { kind: 'fee', won: 0, shown: '0' }, { kind: 'insurance', won: 610, shown: '610' }],
            feeRateText: null, paymentType: null, paymentShown: null, billingType: '인수증', billingShown: '인수증',
        });
        expect(receipt.load).toEqual({ vehicleText: '3.5톤', sizeText: null, itemText: null, lines: [{ kind: 'body', shown: '윙바디' }, { kind: 'weight', shown: '3.85톤' }] });
        expect(detailRecordOf('hwamul24', sheetOf('hwamul24', 'payment', '선/착불')).money).toMatchObject({ paymentType: '선/착불', paymentShown: '선/착불' });
        expect(detailRecordOf('hwamul24', sheetOf('hwamul24', 'orderNo', '3-9483-2159')).orderNo).toBe('3-9483-2159');
    });
    it('🔴 픽커 상세 → 기사님 몫(«최종 수익») · 배송비 · 프로모션 · 짐 줄 치수 · 무게 · 취급 주의 · 가게 주문 번호', () => {
        const delivery = detailRecordOf('kakaopicker', sheetOf('kakaopicker', 'fare', '100', 'promo'));
        expect(delivery.money?.lines).toEqual([{ kind: 'income', won: 5600, shown: '5,600' }, { kind: 'deliveryFee', won: 5500, shown: '5,500' }, { kind: 'promo', won: 100, shown: '100' }]);
        expect(delivery.clientOrderNo).toBe('요기요 주문번호 : 903');
        expect(delivery.load).toBeUndefined();
        const sized = detailRecordOf('kakaopicker', sheetOf('kakaopicker', 'itemSize', '세 변의 합 140cm', 'dimension'));
        expect(sized.load).toEqual({ vehicleText: null, sizeText: null, itemText: null,
            lines: [{ kind: 'dimension', shown: '세 변의 합 140cm' }, { kind: 'weight', shown: '20kg 이하' }, { kind: 'care', shown: '전자제품이에요' }] });
        expect(sized.money?.lines).toEqual([{ kind: 'income', won: 12243, shown: '12,243' }]);
    });
    it('🔴 픽커 적요 = 정의 표 «적요로 잇는 줄»(픽업 장소 → 물품 정보 → 유의사항)을 « / » 로 — 짐 · 상차 힌트는 이은 적요를 읽지 않는다', () => {
        const raw = sheetOf('kakaopicker', 'memo', '매장 직원에게 문의 오더번호 261002072502618', 'pickupPlace')
            .replace(' 최종 수익', ' 유의사항 공장 4시 상차 부탁드립니다.\n박스 1개 최종 수익');
        const rec = detailRecordOf('kakaopicker', raw);
        expect(rec.detailMemo).toBe('매장 직원에게 문의 오더번호 261002072502618 / 초소형 세 변의 합 70cm ∙ 2kg 이하 / 공장 4시 상차 부탁드립니다. 박스 1개');
        const call = { ...rec, targetApp: 'kakaopicker' as const };
        expect(callCargoHintsOf(call)).toEqual(parseCargoHints(rec.itemDescription));
        const captured = Date.parse('2030-01-01T02:00:00+09:00');
        expect(pickupClockMsOf(call, captured, 30)).toBe(captured + 30 * 60_000);
        expect(detailRecordOf('kakaopicker', '픽업지 경기 광주시 경안동 물품 정보 소형 세 변의 합 100cm ∙ 5kg 이하 최종 수익 10,830 넘기기').detailMemo).toBe('소형 세 변의 합 100cm ∙ 5kg 이하');
    });
    it('적요 줄이 있는 배차망은 적요를 힌트로 읽는다(인성 «03:57 상차» 본문 적요 — 지금과 같음)', () => {
        const rec = detailRecordOf('insung', BODY.replace('적요상세 10시전하차 착불', '적요상세 03:57 상차'));
        expect(callCargoHintsOf({ ...rec, targetApp: 'insung' }).promisedAt).toBe('03:57');
    });
    it('🔴 인성 상세 → 의뢰인(«의뢰지») · 가린 «***»는 못 읽은 것(칸 없음)', () => {
        expect(detailRecordOf('insung', sheetOf('insung', 'contact', '쑥쑥 TEST', 'requester')).requesterName).toBe('쑥쑥 TEST');
        const hidden = SHEET.cases.find(c => c.network === 'insung' && c.part === 'requester' && c.texts[0].includes('일류화물'))!.texts.join(' ');
        expect(detailRecordOf('insung', hidden)).not.toHaveProperty('requesterName');
    });
    it('🔴 플렉스 확정 전 상세 → 돈 줄 없음 · 결제만 / 돈 · 짐 조각 줄이 하나도 안 읽히면 묶음 칸 없음', () => {
        const flex = detailRecordOf('isflex', sheetText('isflex', 'pickup'));
        expect(flex.money).toEqual({ lines: [], feeRateText: null, paymentType: '착불', paymentShown: '착불', billingType: null, billingShown: null });
        expect(flex).not.toHaveProperty('load');
        const none = detailRecordOf('kakaopicker', '픽업지 경기 광주시 경안동 넘기기');
        expect(none).not.toHaveProperty('money');
        expect(none).not.toHaveProperty('load');
    });
    it('🔴 서버가 상세 원문을 짐작 함수로 읽지 않는다', () => {
        expect(readFileSync(join(__dirname, '../../src/routes/detail.ts'), 'utf8')).not.toMatch(/parseDetailedRawText|parseLocationDetails|utils\/parser/);
    });
});
