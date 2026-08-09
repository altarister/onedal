import { parseMockupFare, parseDetailedRawText } from '../../src/utils/parser';

/**
 * 2026-08-10 — `ex_images/인성/상세-확정(...).png` 판독으로 실제 화면 표기를 확인하고 작성.
 *
 * 확정 상세 화면의 요금 줄은 이렇게 생겼다:
 *     요금 : 40,000(신용)
 *
 * 이 포맷이 두 가지 문제를 동시에 드러냈다.
 *   ① 결제방법이 "결제방법" 필드가 아니라 **요금 값의 괄호 안**에 있다
 *   ② 쉼표가 들어가는데 파서가 `\d+`로 읽어 `40` 에서 끊긴다
 */
describe("parseMockupFare — 요금 파싱", () => {
    describe("쉼표가 있으면 원 단위로 확정한다", () => {
        // 인성콜 축약형("45" = 45,000원)은 쉼표를 쓰지 않는다.
        // 따라서 쉼표의 존재 자체가 "이건 원 단위다"라는 신호다.
        it.each([
            ["요금 : 40,000(신용)", 40000],
            ["요금 : 100,000(신용)", 100000],
            ["요금 : 40,500(신용)", 40500],   // 예전엔 백 단위가 잘려 40,000 이었다
            ["요금 : 8,000(착불)", 8000],     // 예전엔 8원
            ["요금 : 9,500", 9500],           // 예전엔 9원
            ["요금 : 1,250,000", 1250000],
        ])("%s → %i원", (raw: string, expected: number) => {
            expect(parseMockupFare(raw)).toBe(expected);
        });

        it("라벨과 값이 줄바꿈으로 나뉘어 있어도 읽는다", () => {
            // 접근성 노드가 라벨/값을 별도 노드로 주면 rawText 에서 줄이 갈린다
            expect(parseMockupFare("요금\n40,000(신용)")).toBe(40000);
        });
    });

    describe("🔴 쉼표 없는 정수를 1000배로 뻥튀기하던 버그", () => {
        // 기존 규칙: `val >= 10 && val <= 9999` 이면 축약형으로 보고 ×1000.
        // 8000원짜리 똥콜이 800만원 초꿀콜로 판정되어 하한가 필터를 그대로 통과했다.
        it.each([
            ["요금 : 8000", 8000],    // 예전엔 8,000,000원
            ["요금 : 9900", 9900],    // 예전엔 9,900,000원
            ["요금 : 30000", 30000],
            ["요금 : 45000", 45000],
            ["요금 : 120000", 120000],
        ])("%s → %i원", (raw: string, expected: number) => {
            expect(parseMockupFare(raw)).toBe(expected);
        });
    });

    describe("축약 표기는 그대로 지원한다", () => {
        it.each([
            ["요금 : 4.5만", 45000],
            ["요금 : 45", 45000],      // 인성콜 축약형: 세 자리 미만은 천 단위
            ["요금 : 42.5", 42500],
            ["요금 : 800", 800000],    // 800원짜리 퀵은 없다 → 80만원 축약으로 본다
        ])("%s → %i원", (raw: string, expected: number) => {
            expect(parseMockupFare(raw)).toBe(expected);
        });
    });

    it("요금 정보가 없으면 undefined", () => {
        expect(parseMockupFare("")).toBeUndefined();
        expect(parseMockupFare("상태 : 배송")).toBeUndefined();
    });
});

describe("parseDetailedRawText — 결제방법 추출", () => {
    // 파서는 "결제방법"/"지불"/"결제" 라는 필드명을 찾고 있었는데
    // 실제 화면에는 그런 필드가 없다. 그래서 실측 16건이 전부 null 이었다.
    it("요금 괄호 안의 결제방법을 읽는다", () => {
        const raw = ["상태 : 배송", "차량 : 다마스", "요금 : 40,000(신용)", "구분 : 편도"].join("\n");
        expect(parseDetailedRawText(raw).paymentType).toBe("신용");
    });

    it.each(["신용", "선불", "착불", "카드", "현금"])("결제수단 '%s' 를 인식한다", (pay: string) => {
        expect(parseDetailedRawText(`요금 : 55,000(${pay})`).paymentType).toBe(pay);
    });

    it("괄호가 없으면 paymentType 은 undefined (억지로 만들지 않는다)", () => {
        expect(parseDetailedRawText("요금 : 55,000").paymentType).toBeUndefined();
    });

    it("괄호 안이 알려진 결제수단이 아니면 무시한다", () => {
        // 예: "요금 : 40,000(협의)" 같은 자유 텍스트를 결제수단으로 오인하면 안 된다
        expect(parseDetailedRawText("요금 : 40,000(협의)").paymentType).toBeUndefined();
    });

    it("기존 '결제방법' 필드 표기도 계속 지원한다", () => {
        expect(parseDetailedRawText("결제방법 : 착불").paymentType).toBe("착불");
    });
});
