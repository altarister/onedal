// @ts-nocheck
import { OrderEvaluator } from '../../src/core/engine/OrderEvaluator';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * 🚫 **제외 키워드는 배차망별 칸에서만 찾는다** (기사님 «화물24시 "화물정보" · 인성은 "적요" · 카카오픽커 "물품정보" 에서 찾기» + «가» · reviews/34 3단계 5③).
 *    인성 = 적요 + 결제 괄호 + 구분 · 화물24시 = 화물정보 + 결제방법 · 픽커 = 물품정보 + 유의사항 — 정의 표의 excludeScan 칸 목록(shared excludeScanTextOf).
 *    주소 · 화주 이름 · 화면 머리 · 버튼 · 목록 잔상은 안 본다. 라이브 19:29 픽커 «대기»가 목록 잔상(«퀵 오더카드 대기 중...»)에 걸렸던 것도 여기서 막힌다.
 */
/** 라이브 intel 6289 (09-30 19:28:59 · PICKER_DETAIL) 원문 그대로 */
const LIVE = '퀵 5.6km 퀵 15.0km 퀵 15.7km 퀵 5.5km 퀵 16.5km 퀵 16.7km 퀵 19.5km 퀵 단거리 준비 완료 소형 18.9km 기흥 구갈 기흥 구갈 2,825 퀵 오더카드 대기 중... 픽업지 경기 광주시 광남2동 힐스테이트태전5단지아파트 물품 정보 초소형 세 변의 합 70cm ∙ 2kg 이하 최종 수익 11,396 11,396 배송비 11,396P 11,396P 넘기기 수락하기';
const WITH_NOTE = LIVE.replace('최종 수익', '유의사항 경비실 앞 대기 부탁드립니다 최종 수익');
/** 화물24시 실물 상세(캡처 18 · 결제방법만 «착불») — 노드를 한 칸 띄어 이은 원문 */
const HW = '화물상세정보 ID : 37788 잔액 : 50,000원 화물과퀵 60분 안보기 화물번호:3-9483-2159 상차지 경기 군포 부곡동 당상 5Km 하차지 서울 중구 을지로6가 당착 36Km 화물정보 지금상 당착 59박스 독차 톤수 1톤 운송료 60,000 결제방법 착불 배차신청 돌아가기';
/** 인성 상세 원문(원달앱 DetailCollectMachine — 상세 글 + 적요 팝업 + 위치 팝업 · 줄바꿈 이음) */
const IS = '고양퀵서비스\n상태 : 신규\n요금 : 50,000(착불)\n구분 : 왕복\n[적요상세/정보]\n적요 내용\n1층 대기 30분\n닫기\n[출발지상세]\n위치 경기 광주시 초월읍 퀵물류센터\n';

const hitsOf = (app: string, rawText: string, kw: string, pickup = '경기 광주시 광남2동') => {
    const reasons: string[] = [], pros: string[] = [];
    const order = { pickup, dropoff: '서울 강동구 둔촌1동', fare: 11396, rawText };
    return new OrderEvaluator(app).runStage1ShapeFilter(order, { excludedKeywords: [kw] }, reasons, pros).excludedHits;
};

describe('🚫 제외 키워드 — 배차망별 칸', () => {
    it('🔴 픽커 라이브 원문 — 목록 잔상의 «대기»에는 안 걸린다', () => {
        expect(hitsOf('kakaopicker', LIVE, '대기')).toEqual([]);
    });
    it('🔴 픽커 유의사항의 «대기»에는 걸린다 — 유의사항도 찾는 칸이다(기사님 «가»)', () => {
        expect(hitsOf('kakaopicker', WITH_NOTE, '대기')).toEqual(['대기']);
    });
    it('🔴 화물24시 — 화물정보 · 결제방법은 보고, 화주 이름(«화물과퀵») · 버튼 · 주소는 안 본다', () => {
        expect(hitsOf('hwamul24', HW, '퀵')).toEqual([]);
        expect(hitsOf('hwamul24', HW, '배차신청')).toEqual([]);
        expect(hitsOf('hwamul24', HW, '착불')).toEqual(['착불']);
        expect(hitsOf('hwamul24', HW, '독차')).toEqual(['독차']);
    });
    it('🔴 인성 — 적요 · 결제 괄호 · 구분은 보고, 화주 이름 · 위치 팝업 주소는 안 본다', () => {
        expect(hitsOf('insung', IS, '대기')).toEqual(['대기']);
        expect(hitsOf('insung', IS, '착불')).toEqual(['착불']);
        expect(hitsOf('insung', IS, '왕복')).toEqual(['왕복']);
        expect(hitsOf('insung', IS, '퀵')).toEqual([]);
    });
    it('🔴 콜 주소(상차 · 하차)는 제외어 찾는 칸이 아니다', () => {
        expect(hitsOf('insung', IS, '광남', '경기 광주시 광남2동')).toEqual([]);
    });
    it('🔴 서버 플러그인에는 콜 글 자르기가 없다 — 배차망마다 다른 것은 정의 표 한 곳', () => {
        const dir = join(__dirname, '../../src/core/plugins');
        const all = readdirSync(dir, { recursive: true } as any).filter((f: string) => String(f).endsWith('.ts'))
            .map((f: string) => readFileSync(join(dir, String(f)), 'utf8')).join('\n');
        expect(all).not.toMatch(/callTextOf/);
    });
});
