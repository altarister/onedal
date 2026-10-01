import { readFileSync } from 'fs';
import { join } from 'path';
import { kakaoTotalOf } from '../../../ops/src/api/kakaoTotal';

/**
 * 🗺️ **운영센터 카카오 호출 카드 — 주인 없는 호출도 보인다** (reviews/29 5단계 · 46 서버 9f860fbf · onedal-69 «가»).
 *    카카오 키는 하나라 한쪽이 한도를 다 쓰면 모두 멈춘다 — 서버가 스스로 부른 것(주인 없음)이 화면에 없으면 «누가 썼나»의 합이 안 맞는다.
 *    🔴 한도 숫자 · 경고 색은 넣지 않는다(설정값 — 기사님 몫). 합계는 서버 줄들의 덧셈이다.
 */
const SRC = join(__dirname, '../../../ops/src');
const read = (f: string) => readFileSync(join(SRC, f), 'utf8');

describe('🗺️ 운영센터 카카오 호출 카드', () => {
    it('합계는 줄들의 덧셈 — 주인 없음(null) 줄도 센다 · 줄이 없으면 0', () => {
        const rows = [
            { memberId: 'a', route: { today: 3, month: 40 }, local: { today: 1, month: 5 } },
            { memberId: null, route: { today: 2, month: 10 }, local: { today: 0, month: 7 } },
        ];
        expect(kakaoTotalOf(rows)).toEqual({ route: { today: 5, month: 50 }, local: { today: 1, month: 12 } });
        expect(kakaoTotalOf([])).toEqual({ route: { today: 0, month: 0 }, local: { today: 0, month: 0 } });
    });

    it('🔴 카드는 서버 문 하나를 읽고 memberId null 줄을 «주인 없음»으로 그린다 — 한 덩어리 부품(놓는 쪽은 회원 목록과 박자만)', () => {
        const card = read('pages/KakaoUsageCard.tsx');
        expect(card).toContain('api.boardKakao()');
        expect(card).toContain("r.memberId == null ? '주인 없음");
        expect(card).toContain('kakaoTotalOf(rows)');
        expect(card).not.toMatch(/api\/example|client\.(post|put)|write\(/);
        expect(card.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/limit|한도|text-danger|bg-danger/);   // 한도 · 경고 색 없음(설명 주석은 뺀다)
        expect(read('pages/Inspect.tsx')).toContain('<KakaoUsageCard members={members} tick={tick} />');
        expect(read('api/ops.ts')).toContain("get<OpsBoardKakao>('/board/kakao')");
    });

    it('회원 상세의 카카오 칸은 늘 값을 그린다 — «아직 안 셈» 갈래가 없다(서버가 0 / 0 을 준다)', () => {
        const d = read('pages/MemberDetail.tsx');
        expect(d).not.toContain('아직 안 셈');
        expect(d).toContain('`${usage.today} / ${usage.month}`');
    });
});
