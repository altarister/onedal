import { parseCargoHints, hasCargoHints } from '@onedal/shared';

/**
 * 실측 데이터(local.db 16건 전수)에서 뽑은 실제 문자열로 검증한다.
 * 원칙: **텍스트에 적힌 것만 돌려준다.** 추측하면 기사님이 확인 없이 저장할 때
 * 적재 판정이 틀어진다.
 */
describe('parseCargoHints — 적요에서 통화 시트 미리 채우기', () => {
    const 인성적요 = '*카고 입니다. 세금계산서필 12:42상차. 마스크 카톤마대 1개명세서폐기. 현위치 ➔ 상차지 0.2KM. 상차지 ➔ 하차지 59.3KM';

    it('인성 적요의 `HH:MM상차` 를 상차 약속 시각으로 읽는다', () => {
        // 실측 16건 전부 이 형태였다 — 가장 신뢰할 수 있는 패턴
        expect(parseCargoHints(인성적요).promisedAt).toBe('12:42');
    });

    it('개수를 읽는다', () => {
        expect(parseCargoHints('마대 1개').quantity).toBe(1);
        expect(parseCargoHints('쇼핑백 2개').quantity).toBe(2);
        expect(parseCargoHints('1시상차 6박스 카트가지고 고객님앞 갖다주세요').quantity).toBe(6);
    });

    it('`1시상차` 축약형도 받는다', () => {
        expect(parseCargoHints('1시상차 6박스 카트가지고').promisedAt).toBe('01:00');
        expect(parseCargoHints('9시30분상차').promisedAt).toBe('09:30');
    });

    it('상하차 방법이 적혀 있을 때만 읽는다', () => {
        expect(parseCargoHints('카트가지고 고객님앞').handling).toBe('수작업');
        expect(parseCargoHints('지게차 상차').handling).toBe('지게차');
        expect(parseCargoHints('크레인 필요').handling).toBe('호이스트');
        expect(parseCargoHints('마대 1개').handling).toBeUndefined();
    });

    it('적요의 낱말을 단위로 그대로 읽는다', () => {
        // 단위를 기사님이 쓰는 말로 두니 추측할 것이 없어졌다.
        // 예전에는 "마대"를 소·중·대 중 무엇으로 볼지 알 수 없어 포기했다.
        expect(parseCargoHints('마대 1개').unit).toBe('마대');
        expect(parseCargoHints('박스 1개').unit).toBe('라면박스');
        expect(parseCargoHints('서류봉투').unit).toBe('서류봉투');
        expect(parseCargoHints('파렛트 2개').unit).toBe('파레트');
        expect(parseCargoHints('쇼핑백 2개').unit).toBe('쇼핑백');
        // '가전' 은 단위가 아니다 — 냉장고와 전기면도기가 같은 부피일 리 없다.
        // 2026-08-12 에 성질에서도 뺐다 (부피도 취급도 제각각이라 묶이지 않는다).
        expect(parseCargoHints('소형 가전').unit).toBeUndefined();
        expect(parseCargoHints('소형 가전').tags).toBeUndefined();
    });

    it('더 구체적인 낱말이 먼저 잡힌다', () => {
        // "서류봉투"가 "봉투"보다, "톤백"이 "백"보다 우선
        expect(parseCargoHints('서류봉투 3개').unit).toBe('서류봉투');
        expect(parseCargoHints('톤백 1개').unit).toBe('톤백');
    });

    it('아는 낱말이 없으면 단위도 undefined — 지어내지 않는다', () => {
        expect(parseCargoHints('명세서폐기').unit).toBeUndefined();
    });

    it('여러 필드를 합쳐 근거 문구를 만든다', () => {
        expect(parseCargoHints('1시상차 6박스 카트가지고').summary).toBe('라면박스 · 6개 · 수작업 · 01:00 상차');
        expect(parseCargoHints('냉장고 1개 파손주의').summary).toBe('파손주의 · 1개');
    });

    it('물품명과 적요를 함께 넘길 수 있다', () => {
        const h = parseCargoHints('마대 1개', 인성적요);
        expect(h.quantity).toBe(1);
        expect(h.promisedAt).toBe('12:42');
    });

    it('읽을 게 없으면 빈 힌트', () => {
        expect(hasCargoHints(parseCargoHints(''))).toBe(false);
        expect(hasCargoHints(parseCargoHints('명세서폐기'))).toBe(false);
        expect(hasCargoHints(parseCargoHints(인성적요))).toBe(true);
    });

    it('말도 안 되는 개수는 무시한다', () => {
        expect(parseCargoHints('12345개').quantity).toBeUndefined();
    });
});
