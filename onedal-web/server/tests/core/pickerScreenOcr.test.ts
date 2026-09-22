import { parsePickerDetailOcr, OcrLine } from '../../src/core/plugins/kakaopicker/pickerScreenOcr';

/**
 * 📷 **픽커 상세를 그림으로 읽는다 — 실측 한 판을 통째로 문다**.
 *
 * ── 문제지의 출처 ──
 * 기사님이 A24 에서 픽커 상세를 열어 두시고, 내가 `adb exec-out screencap` 으로 찍어
 * 가로 540px·JPEG60(29KB)으로 줄인 뒤 macOS Vision 으로 읽은 **그 출력 그대로**다.
 * 🔬 **문제지를 만든 그림이 레포에 있다** —
 *    `ex_images/카카오픽커/실물_20260913_내가찍음/33_상세_예약콜_위례_삼성2동_보낼크기.jpg` (29KB).
 *    줄이기 전 원본(722KB)과 **읽힌 글자가 한 자도 다르지 않아서** 줄인 쪽만 담았다.
 * 🔴 **지어낸 줄이 하나도 없다** — 오타(`세 변의`→`세 번의`)까지 OCR 이 낸 그대로 둔다.
 *
 * ── 이 검사가 지키는 것 ──
 * 같은 화면을 접근성 트리로 읽으면 **배송지가 한 글자도 안 온다** (같은 시각 앱 로그):
 *
 *     퀵 14.4km 퀵 16.9km 퀵 19.3km 픽업지 경기 성남시 수정구 위례동
 *     위례역푸르지오4단지아파트kotlin.Unit 물품 정보 초소형 …
 *
 * 「서울 강남구 삼성2동 / 더에스엠씨그룹」이 없고, 화면에 없는 거리 셋이 섞여 있고,
 * 건물명에 픽커 앱 자체의 `content-desc` 버그인 `kotlin.Unit` 이 붙는다.
 * **그래서 이미지로 간다.** 이 검사는 «이미지 쪽은 성한가»를 못박는다.
 */

/** 🔬 실측 OCR 출력 — 위에서 아래 순서, 텍스트는 한 글자도 안 고쳤다 */
const 실물_위례_삼성2동: OcrLine[] = [
    { y: 20, text: '4:16 799 0' },                     // 상태바 시계 — 시각처럼 생긴 잡음
    { y: 92, text: '배송' },                            // 지도 위 말풍선
    { y: 161, text: '픽업' },                           // 지도 위 말풍선
    { y: 257, text: '9광주' },                          // 지도 라벨(헛읽음)
    { y: 257, text: '•과천' },
    { y: 274, text: '0성남' },
    { y: 309, text: '간양' },
    { y: 379, text: '8워요' },
    { y: 488, text: '• 내일 15:00 픽업예약' },
    { y: 574, text: '픽업 16.9km' },
    { y: 577, text: '• 경기 성남시 수정구 위례동' },
    { y: 598, text: '내일 15:00' },
    { y: 611, text: '위례역푸르지오4단지아파트' },
    { y: 651, text: '배송 10.1km' },
    { y: 657, text: '• 서울 강남구 삼성2동' },
    { y: 675, text: '내일 16:40' },
    { y: 690, text: '더에스엠씨그룹' },
    { y: 774, text: '물품 정보' },
    { y: 777, text: '초소형 세 번의 합 70cm 2kg 이하' },
    { y: 842, text: '유의사항' },
    { y: 844, text: '흐트러질 수 있으니, 파손' },
    { y: 901, text: '남기기' },                          // 「넘기기」를 헛읽은 것
    { y: 901, text: '수락하기' },
];

describe('픽커 상세를 그림으로 읽는다', () => {

    it('🔴 배송지가 나온다 — 접근성 트리에는 한 글자도 없던 것', () => {
        const r = parsePickerDetailOcr(실물_위례_삼성2동)!;
        expect(r.dropoff.admin).toBe('서울 강남구 삼성2동');
        expect(r.dropoff.place).toBe('더에스엠씨그룹');
    });

    it('픽업지는 kotlin.Unit 없이 성하게 나온다', () => {
        const r = parsePickerDetailOcr(실물_위례_삼성2동)!;
        expect(r.pickup.admin).toBe('경기 성남시 수정구 위례동');
        expect(r.pickup.place).toBe('위례역푸르지오4단지아파트');
        expect(r.pickup.place).not.toContain('kotlin');
    });

    /**
     * 🔴 **거리는 화면에 적힌 둘뿐이다.** 접근성 트리는 14.4·16.9·19.3 **셋**을 줬는데
     *    화면에는 16.9 와 10.1 밖에 없다 — 셋 중 어느 것이 무엇인지 알 길이 없었다.
     */
    it('거리는 픽업·배송 둘이고, 직선이라는 사실이 이름에 박혀 있다', () => {
        const r = parsePickerDetailOcr(실물_위례_삼성2동)!;
        expect(r.pickup.straightKm).toBe(16.9);
        expect(r.dropoff.straightKm).toBe(10.1);
    });

    /**
     * 🔴 **예약 콜이라는 축을 2026-09-13 에 처음 봤다.** 접근성 트리에 이 줄이 없어서
     *    우리는 내일 15:00 콜을 **지금 콜로 알고** 판정하고 있었다.
     */
    it('예약 콜과 그 시각을 읽는다 — 지금 콜이 아니다', () => {
        const r = parsePickerDetailOcr(실물_위례_삼성2동)!;
        expect(r.reserved).toBe(true);
        expect(r.pickup.at).toBe('내일 15:00');
        expect(r.dropoff.at).toBe('내일 16:40');
    });

    it('물품 크기는 화면 줄 그대로 싣는다 — 우리 체계로 환산하지 않는다', () => {
        const r = parsePickerDetailOcr(실물_위례_삼성2동)!;
        expect(r.itemSize).toBe('초소형 세 번의 합 70cm 2kg 이하');
    });

    /**
     * 🔴 **지도 라벨이 주소로 새지 않는다.** 화면 위쪽 절반은 지도라 「과천」·「성남」·「광주」가
     *    글자로 떠 있다. 그걸 주소로 집으면 **엉뚱한 좌표로 경로를 낸다** —
     *    이 제품에서 가장 큰 사고(색을 틀리는 것)로 곧장 이어진다.
     */
    it('지도 위 지명이 주소로 새지 않는다', () => {
        const r = parsePickerDetailOcr(실물_위례_삼성2동)!;
        for (const 잡음 of ['과천', '성남시 분당', '광주', '안양']) {
            expect(r.pickup.place).not.toBe(잡음);
            expect(r.dropoff.place).not.toBe(잡음);
        }
        expect(r.pickup.admin.startsWith('경기 ')).toBe(true);
        expect(r.dropoff.admin.startsWith('서울 ')).toBe(true);
    });

    /**
     * 🔴 **상세가 아닌 화면을 찍으면 반쪽을 만들지 않는다** (규칙 ④).
     *    알람이 헛도는 동안 홈·리스트가 찍힐 수 있다.
     */
    it('상세가 아니면 null 이다 — 반쪽 콜을 만들지 않는다', () => {
        const 홈화면: OcrLine[] = [
            { y: 163, text: '김윤서님이 관심있는' },
            { y: 508, text: '우리동네 이마트배송하고' },
            { y: 534, text: '시간당 최대 27,000원 벌기' },
            { y: 741, text: '퀵 1건 배송완료하고' },
        ];
        expect(parsePickerDetailOcr(홈화면)).toBeNull();
    });

    it('머리가 하나만 있으면 null 이다 — 반쯤 스크롤된 화면', () => {
        const 반쪽: OcrLine[] = [
            { y: 574, text: '픽업 16.9km' },
            { y: 577, text: '경기 성남시 수정구 위례동' },
            { y: 611, text: '위례역푸르지오4단지아파트' },
        ];
        expect(parsePickerDetailOcr(반쪽)).toBeNull();
    });

    /**
     * 🔴 **머리와 행정동은 «같은 줄»이라 y 가 뒤집힐 수 있다.**
     *    실물에서는 `픽업 16.9km`(574) 가 `경기 성남시…`(577) 보다 3px 위였지만,
     *    둘은 화면상 **같은 가로줄**이고 OCR 이 어느 쪽을 위로 놓을지는 글자 모양이 정한다.
     *    뒤집힌 판에서 「머리 아래부터」로 자르면 **행정동이 통째로 사라져 `null` 이 된다** —
     *    콜이 조용히 없어지는 자리라, 여유(SLACK)를 두고 그 사실을 여기서 문다.
     */
    it('행정동이 머리보다 몇 px 위에 찍혀도 읽는다', () => {
        const 뒤집힘: OcrLine[] = [
            { y: 571, text: '• 경기 성남시 수정구 위례동' },   // 🔴 머리보다 3px 위
            { y: 574, text: '픽업 16.9km' },
            { y: 598, text: '내일 15:00' },
            { y: 611, text: '위례역푸르지오4단지아파트' },
            { y: 648, text: '• 서울 강남구 삼성2동' },        // 🔴 머리보다 3px 위
            { y: 651, text: '배송 10.1km' },
            { y: 690, text: '더에스엠씨그룹' },
        ];
        const r = parsePickerDetailOcr(뒤집힘)!;
        expect(r).not.toBeNull();
        expect(r.pickup.admin).toBe('경기 성남시 수정구 위례동');
        expect(r.dropoff.admin).toBe('서울 강남구 삼성2동');
        expect(r.dropoff.place).toBe('더에스엠씨그룹');
    });

    /**
     * 건물명이 없는 콜도 있다 (노상·아파트 단지 입구 등). 그때 **지어내지 않는다**.
     */
    it('건물명이 없으면 null 로 둔다 — 지어내지 않는다', () => {
        const 건물없음: OcrLine[] = [
            { y: 574, text: '픽업 16.9km' },
            { y: 577, text: '경기 성남시 수정구 위례동' },
            { y: 598, text: '내일 15:00' },
            { y: 651, text: '배송 10.1km' },
            { y: 657, text: '서울 강남구 삼성2동' },
            { y: 690, text: '더에스엠씨그룹' },
        ];
        const r = parsePickerDetailOcr(건물없음)!;
        expect(r.pickup.place).toBeNull();
        expect(r.dropoff.place).toBe('더에스엠씨그룹');
    });
});

/**
 * 🔬 실측 2 — 2026-09-19 A24 · 폰 안 ML Kit 출력 그대로 (아래 60% 를 540폭으로 자른 판).
 *    09-13 판과 다른 점: **오늘 콜**이라 시각이 「10:00까지 픽업」·「12:39까지 배송」 줄로 온다.
 *    첫 판에서는 이 줄이 시각으로 안 잡혀 **건물명 자리에 「10:00까지 픽업」이 들어가고 시각은 null** 이었다.
 */
const 실물_광남1동_남한산성면: OcrLine[] = [
    { y: 31, text: '퀵 반나절 예약' },
    { y: 94, text: '오늘 10:00 픽업예약' },
    { y: 190, text: '픽업 5.0km' },
    { y: 193, text: '경기 광주시 광남1동' },
    { y: 222, text: '10:00까지 픽업' },
    { y: 235, text: '온미' },
    { y: 283, text: '경기 광주시 남한산성면' },
    { y: 285, text: '배송 10.8km' },
    { y: 315, text: '12:39까지 배송' },
    { y: 328, text: '산성달숨' },                      // 상호를 헛읽은 것 — 그대로 둔다
    { y: 428, text: '물품 정보' },
    { y: 429, text: '중형 세 변의 합 140cm. 20kg 이하' },
    { y: 565, text: '넘기기' },
    { y: 567, text: '수락하기' },
];

describe('픽커 상세 — 오늘 콜의 「HH:MM까지 픽업」 줄 (2026-09-19 A24 실측)', () => {
    it('시각은 「10:00까지」로 읽히고 건물명 자리에 새지 않는다', () => {
        const r = parsePickerDetailOcr(실물_광남1동_남한산성면)!;
        expect(r).not.toBeNull();
        expect(r.pickup.admin).toBe('경기 광주시 광남1동');
        expect(r.pickup.at).toBe('10:00까지');
        expect(r.pickup.place).toBe('온미');
        expect(r.dropoff.admin).toBe('경기 광주시 남한산성면');
        expect(r.dropoff.at).toBe('12:39까지');
        expect(r.dropoff.place).toBe('산성달숨');
        expect(r.pickup.straightKm).toBe(5.0);
        expect(r.dropoff.straightKm).toBe(10.8);
        expect(r.reserved).toBe(true);
        expect(r.itemSize).toBe('중형 세 변의 합 140cm. 20kg 이하');
    });
});

/**
 * 📷 **머리가 줄 «가운데»에 오는 판** — 실측 실패 (이상 기록 #46·#48·#39).
 *
 * 픽커 상세에는 모양이 둘이다. 하나는 「픽업 2.2km」가 줄 처음에 오고, 다른 하나는 **주소 뒤에** 붙는다.
 * 정규식이 `^` 로 줄 처음만 봐서 뒤 모양을 통째로 놓쳤다 — 사진에 배송지가 또렷이 찍혀 있는데
 * 「머리 둘 누락」으로 버리고 접근성이 읽은 반쪽만 서버로 갔다. 그 콜은 하차지가 빈 글자라 좌표를 못 찾았다.
 *
 * 🔴 «먼저 나오는 것 하나만» 이라는 지도 라벨 방어는 그대로다 — `^` 가 그 방어가 아니었다.
 * 🔴 앱 `PickerScreenOcrTest` 와 **같은 문제지**다. 한쪽만 고치면 두 벌이 갈린다.
 */
describe('📷 머리가 주소 뒤에 오는 상세', () => {
    const 실물_곤지암_신둔면: OcrLine[] = [
        { y: 40, text: '뒤로가기' },
        { y: 70, text: '아래 창 올리기' },
        { y: 110, text: '퀵 배송' },
        { y: 150, text: '224분 남음' },
        { y: 180, text: '준비 19분 포함' },
        { y: 240, text: '경기 광주시 초월읍 모다아울렛 곤지암점 픽업 2.2km 17:48까지 픽업' },
        { y: 300, text: '경기 이천시 신둔면 신둔농협하나로마트 예스파크점 배송 10.0km 20:47까지 배송' },
        { y: 360, text: '픽업 장소 매장 직원에게 문의' },
        { y: 400, text: '오더번호 260919170258396' },
        { y: 440, text: '물품 정보 중형' },
        { y: 480, text: '최종 수익 10,000 P' },
        { y: 510, text: '배송비 10,000P' },
        { y: 560, text: '넘기기' },
        { y: 600, text: '수락하기' },
    ];

    it('🔴 머리가 주소 뒤에 와도 읽는다 — 줄 처음만 보지 않는다', () => {
        const r = parsePickerDetailOcr(실물_곤지암_신둔면);
        expect(r).not.toBeNull();
        expect(r!.pickup.straightKm).toBe(2.2);
        expect(r!.dropoff.straightKm).toBe(10.0);
    });

    it('🔴 지도 라벨과 안 섞인다 — 먼저 나오는 머리 하나씩만 본다', () => {
        const r = parsePickerDetailOcr([{ y: 90, text: '배송' }, { y: 160, text: '픽업' }, ...실물_곤지암_신둔면]);
        expect(r).not.toBeNull();
        expect(r!.pickup.straightKm).toBe(2.2);
    });
});
