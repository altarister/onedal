import { readFileSync } from 'fs';
import { join } from 'path';
import { detailRecordOf, pickupClockMsOf } from '@onedal/shared';

/**
 * 📄 **상세 원문의 콜 자료(상태 · 결제 · 수수료 · 연락처 …)는 배차망 정의 표대로 읽는다** (기사님 «1~5 모두 가» · onedal-69).
 *    서버는 칸마다 상세 화면 정의 줄의 읽는 법(pageFieldOf · 조각 part)으로 읽고, 못 찾은 칸은 싣지 않는다(아는 값을 지우지 않는다).
 *    인성: 구분 «왕복» → tripType · 형태 «급송» → orderForm(급송 표시) · 빈 «탁송료 :»는 빈 칸 · 결제 괄호 둘째 «(계산서)» → billingType ·
 *    머리 줄 «고양퀵서비스-031-932-7722» → 배차사 이름 · 전화 · 적요는 팝업 글(줄바꿈 → 공백) · 없으면 본문 «적요상세» 줄(상차 약속 시각 무변화).
 */
/** 공통 문제지 — 서버만의 «칸 → 콜 자료» 대응은 여기서 같은 원문으로 묻는다(두 곳이 안 갈리게) */
const SHEET = JSON.parse(readFileSync(join(__dirname, '../../../shared/src/pageReadCases.json'), 'utf8')) as { cases: Array<{ network: string; field: string; texts: string[]; expect: string | null }> };
const sheetText = (network: string, field: string) => SHEET.cases.find(c => c.network === network && c.field === field)!.texts.join(' ');

const FULL = '고양퀵서비스-031-932-7722\n전표\n상태 : 신규\n물품 : 박스 1개\n차량 : 다마스\n탁송료 :\n수수료 : 23%\n요금 : 50,000(카드)(계산서)\n구분 : 편도\n형태 : 보통\n적요상세 *카고 입니다. 세금계산서필 03:57 상차.\n[적요상세/정보]\n적요 상세\n적요 내용\n까대기 있음 직접운반\n대기 30분\n닫기\n[출발지상세]\n고객 가나상사\n위치: 경기 광주시 경안동 1-2\n부서 물류팀\n담당 김철수\n전화1 010-1234-5678\n전화2 031-000-0000\n[도착지상세]\n고객\n다라상회\n위치\n서울 용산구 한남동 12\n전화1 010-9999-8888\n';
const BODY = '(주)신한로직스-1588-5480\n상태 : 배송\n물품 : 서류\n차량 : 트럭-1t\n탁송료 : 3,000\n수수료 : 20%\n요금 : 85,000(신용)\n구분 : 왕복\n형태 : 급송\n적요상세 10시전하차 착불\n';

describe('📄 상세 콜 자료 — 정의 표', () => {
    it('🔴 인성 상세(팝업까지) — 칸마다 표대로', () => {
        expect(detailRecordOf('insung', FULL)).toEqual({
            receiptStatus: '신규', itemDescription: '박스 1개', paymentType: '카드', billingType: '계산서', commissionRate: '23%',
            tripType: '편도', orderForm: '보통', detailMemo: '까대기 있음 직접운반 대기 30분',
            dispatcherName: '고양퀵서비스', dispatcherPhone: '031-932-7722',
            pickupDetails: [{ customerName: '가나상사', addressDetail: '경기 광주시 경안동 1-2', department: '물류팀', contactName: '김철수', phone1: '010-1234-5678', phone2: '031-000-0000' }],
            dropoffDetails: [{ customerName: '다라상회', addressDetail: '서울 용산구 한남동 12', phone1: '010-9999-8888' }],
        });
    });
    it('🔴 인성 상세(팝업 없음) — 급송 · 왕복 · 탁송료 · 본문 적요', () => {
        expect(detailRecordOf('insung', BODY)).toEqual({
            receiptStatus: '배송', itemDescription: '서류', paymentType: '신용', commissionRate: '20%', tollFare: '3,000',
            tripType: '왕복', orderForm: '급송', detailMemo: '10시전하차 착불',
            dispatcherName: '(주)신한로직스', dispatcherPhone: '1588-5480', pickupDetails: [], dropoffDetails: [],
        });
    });
    it('🔴 적요는 팝업 글이 먼저 — 본문 «03:57 상차»가 상차 약속 시각이 되지 않는다(지금과 같음)', () => {
        const captured = Date.parse('2030-01-01T02:00:00+09:00');
        expect(pickupClockMsOf(detailRecordOf('insung', FULL), captured, 30)).toBe(captured + 30 * 60_000);
    });
    it('🔴 화물24시 결제방법 · 픽커 물품정보도 표대로(기사님 «가») — 원문은 공통 문제지에서', () => {
        expect(detailRecordOf('hwamul24', sheetText('hwamul24', 'payment')).paymentType).toBe('착불');
        expect(detailRecordOf('kakaopicker', sheetText('kakaopicker', 'itemSize')).itemDescription).toBe('초소형 세 변의 합 70cm ∙ 2kg 이하');
    });
    it('결제 괄호가 알려진 결제수단이 아니면 싣지 않는다 · 못 찾은 칸은 싣지 않는다', () => {
        expect(detailRecordOf('insung', '요금 : 40,000(협의)')).toEqual({ pickupDetails: [], dropoffDetails: [] });
        expect(Object.values(detailRecordOf('kakaopicker', '픽업지 경기 광주시 경안동 넘기기')).some(v => v === undefined)).toBe(false);
    });
    it('🔴 서버가 상세 원문을 짐작 함수로 읽지 않는다', () => {
        expect(readFileSync(join(__dirname, '../../src/routes/detail.ts'), 'utf8')).not.toMatch(/parseDetailedRawText|parseLocationDetails|utils\/parser/);
    });
});
