// @ts-nocheck
import { OrderEvaluator } from '../../src/core/engine/OrderEvaluator';
import { KakaoPickerPlugin } from '../../src/core/plugins/kakaopicker/KakaoPickerPlugin';

/**
 * 🚫 **제외 키워드는 콜 한 벌의 글에서만 찾는다** (onedal-1f «가»).
 * 라이브 19:29 픽커 판정이 «잡으면 사고 — 제외 키워드(대기)» 였다 — 콜에는 «대기»가 없고,
 * 앱이 보낸 화면 글의 목록 잔상 «… 2,825 퀵 오더카드 대기 중...» 에 걸렸다.
 * 픽커는 유의사항·물품이 칸으로 안 오고 화면 글 안에만 있다 — 화면 글을 통째로 빼면 유의사항을 놓친다.
 * 그래서 배차망마다 «콜 한 벌의 글»(`callTextOf`)을 정한다 — 픽커는 마지막 «픽업지»부터 «넘기기»/«수락하기» 앞까지. 규칙(제외 키워드면 빨강)은 그대로.
 */
/** 라이브 intel 6289 (09-30 19:28:59 · PICKER_DETAIL) 원문 그대로 */
const LIVE = '퀵 5.6km 퀵 15.0km 퀵 15.7km 퀵 5.5km 퀵 16.5km 퀵 16.7km 퀵 19.5km 퀵 단거리 준비 완료 소형 18.9km 기흥 구갈 기흥 구갈 2,825 퀵 오더카드 대기 중... 픽업지 경기 광주시 광남2동 힐스테이트태전5단지아파트 물품 정보 초소형 세 변의 합 70cm ∙ 2kg 이하 최종 수익 11,396 11,396 배송비 11,396P 11,396P 넘기기 수락하기';
const WITH_NOTE = LIVE.replace('최종 수익', '유의사항 경비실 앞 대기 부탁드립니다 최종 수익');

const hitsOf = (app: string, rawText: string) => {
    const reasons: string[] = [], pros: string[] = [];
    const order = { pickup: '경기 광주시 광남2동', dropoff: '서울 강동구 둔촌1동', fare: 11396, rawText };
    return new OrderEvaluator(app).runStage1ShapeFilter(order, { excludedKeywords: ['대기'] }, reasons, pros).excludedHits;
};

describe('🚫 제외 키워드 — 찾는 글의 범위', () => {
    it('🔴 픽커 라이브 원문 — 목록 잔상의 «대기»에는 안 걸린다', () => {
        expect(hitsOf('kakaopicker', LIVE)).toEqual([]);
    });
    it('🔴 픽커 유의사항의 «대기»에는 걸린다 — 화면 글을 통째로 버리지 않는다', () => {
        expect(hitsOf('kakaopicker', WITH_NOTE)).toEqual(['대기']);
    });
    it('🔴 픽커 콜 한 벌 — 마지막 «픽업지»부터 «넘기기» 앞까지 · «픽업지»가 없으면 빈 글', () => {
        const p = new KakaoPickerPlugin();
        expect(p.callTextOf(LIVE)).toBe('픽업지 경기 광주시 광남2동 힐스테이트태전5단지아파트 물품 정보 초소형 세 변의 합 70cm ∙ 2kg 이하 최종 수익 11,396 11,396 배송비 11,396P 11,396P');
        expect(p.callTextOf('퀵 오더카드 대기 중...')).toBe('');
    });
    it('인성은 지금처럼 화면 글 전부', () => {
        expect(hitsOf('insung', '적요: 1층 대기')).toEqual(['대기']);
    });
});
