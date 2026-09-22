import { parseDetailedRawText } from '../../src/utils/parser';

/**
 * 📄 **상세 원문 파서 — 못 찾은 칸으로 아는 값을 덮지 않는다**
 *
 * `/detail` 은 첫 보고가 남긴 기억 위에 파서 결과를 **통째로 펼친다** (`{ ...pendingOrder, ...parsedDetails }`).
 * 파서는 못 찾은 칸도 `undefined` 로 채워 돌려줘서, 첫 보고가 넣은 값이 조용히 지워졌다.
 * 인성 상세에는 «차종» 줄이 있어 안 드러났다 — 픽커 상세에는 차종이 없어,
 * 첫 보고가 넣은 **차종 일반값(다마스 · 규칙 ⑤-2)** 이 둘째 보고에서 사라진다.
 */

/** 09-14 17:05:38 폰 로그 `📄 [상세 실물]` — 픽커 상세 화면 글자 */
const PICKER_DETAIL = [
    '뒤로가기', '퀵', '배송 154분 남음', '준비 24분 포함', '경기 광주시 초월읍', '모다아울렛 곤지암점',
    '픽업 7.2km', '17:15까지 픽업', '경기 이천시 신둔면', '신둔농협하나로마트 예스파크점', '배송 10.0km',
    '19:40까지 배송', '최종 수익', '10,000', 'P', '배송비', '10,000P', '넘기기', '수락하기',
].join('\n');

describe('상세 원문 파서 — 못 찾은 칸 (#119)', () => {

    it('🔴 못 찾은 칸은 결과에 싣지 않는다 (undefined 로 싣지 않는다)', () => {
        const r = parseDetailedRawText(PICKER_DETAIL);
        const undefinedKeys = Object.entries(r).filter(([, v]) => v === undefined).map(([k]) => k);
        expect(undefinedKeys).toEqual([]);
    });

    it('🔴 첫 보고가 넣은 픽커 차종 일반값이 둘째 보고에서 살아남는다', () => {
        const remembered = { vehicleType: '다마스', tagsText: '차종미확인' };
        const merged = { ...remembered, ...parseDetailedRawText(PICKER_DETAIL) };
        expect(merged.vehicleType).toBe('다마스');
        expect(merged.tagsText).toBe('차종미확인');
    });
});
