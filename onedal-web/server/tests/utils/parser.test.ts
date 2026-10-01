import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { pageFareOf } from '@onedal/shared';
import { parseDetailedRawText } from '../../src/utils/parser';

/**
 * `ex_images/인성/상세-확정(...).png` 판독으로 확인한 실제 화면 표기에 맞춘다.
 *
 * 확정 상세 화면의 요금 줄은 이렇게 생겼다:
 *     요금 : 40,000(신용)
 *
 * 서버는 원달앱과 같은 정의 표(NETWORK_PAGES) · 같은 숫자 규칙(쉼표 떼고 정수)으로 읽는다(shared pageFareOf · reviews/34 3단계).
 * 만 · 천 · 축약은 짐작하지 않는다 — 상세 화면은 실물 · 시뮬 모두 «85,000» 꼴이다.
 */
const fare = (raw: string) => pageFareOf('insung', 'detail', raw) ?? undefined;

describe("인성 상세 요금 — 정의 표대로", () => {
    it("🔴 «수납금액» · «금액» 은 인성 요금 이름표가 아니다 — 못 읽음 · «요금 : N» 은 그대로", () => {
        expect(fare("부가세 6,000 수납금액 65,144 결제방법 카드")).toBeUndefined();
        expect(fare("요금 : 50,000(카드)")).toBe(50000);
        expect(fare("금액 30,000")).toBeUndefined();
    });

    describe("쉼표가 있으면 원 단위로 읽는다", () => {
        it.each([
            ["요금 : 40,000(신용)", 40000],
            ["요금 : 100,000(신용)", 100000],
            ["요금 : 40,500(신용)", 40500],   // 백 단위를 자르면 40,000 이 된다
            ["요금 : 8,000(착불)", 8000],     // 쉼표에서 끊으면 8원
            ["요금 : 9,500", 9500],           // 쉼표에서 끊으면 9원
            ["요금 : 1,250,000", 1250000],
        ])("%s → %i원", (raw: string, expected: number) => {
            expect(fare(raw)).toBe(expected);
        });

        it("라벨과 값이 줄바꿈으로 나뉘어 있어도 읽는다", () => {
            // 접근성 노드가 라벨/값을 별도 노드로 주면 rawText 에서 줄이 갈린다
            expect(fare("요금\n:\n40,000(신용)")).toBe(40000);
        });
    });

    describe("🔴 쉼표 없는 정수를 1000배로 뻥튀기하지 않는다", () => {
        // ×1000 하면 8000원짜리 똥콜이 800만원 초꿀콜로 판정되어 하한가 필터를 그대로 통과한다.
        it.each([
            ["요금 : 8000", 8000],
            ["요금 : 9900", 9900],
            ["요금 : 30000", 30000],
            ["요금 : 45000", 45000],
            ["요금 : 120000", 120000],
        ])("%s → %i원", (raw: string, expected: number) => {
            expect(fare(raw)).toBe(expected);
        });
    });

    it("🔴 이름표 없는 숫자는 못 읽음 — 화물24시 화물번호 · «60분»", () => {
        expect(fare("화물번호:3-9483-2159 경기 광주시 → 서울 용산구 운송료 60,000원")).toBeUndefined();
        expect(fare("상차 60분 안보기 1t 카고")).toBeUndefined();
    });

    it("요금 정보가 없으면 undefined", () => {
        expect(fare("")).toBeUndefined();
        expect(fare("상태 : 배송")).toBeUndefined();
    });
});

describe("parseDetailedRawText — 결제방법 추출", () => {
    // 실제 화면에는 "결제방법"/"지불"/"결제" 라는 필드가 없다 — 필드명만 찾으면
    // 실측 16건이 전부 null 이 된다. 요금 괄호 안을 읽는다.
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

/* 🔴 못 찾은 칸을 지어내지 않는다 — «편도» · «일반»을 지어내면 관제웹 콜 상세에 화면에 없던 글자가 뜬다 (reviews/34 1단계 ③ · 기사님 «가») */
describe("parseDetailedRawText — 운송구분 · 오더형태는 원문에 있을 때만", () => {
    it("🔴 이름표가 없으면 칸 없음 — «편도» · «일반»을 지어내지 않는다", () => {
        const got = parseDetailedRawText(["상태 : 신규", "차량 : 다마스", "요금 : 50,000(카드)"].join("\n"));
        expect(got.tripType).toBeUndefined();
        expect(got.orderForm).toBeUndefined();
    });
    it("원문에 있으면 그대로 — «오더형태 : 급송» → 급송(급송 표시 길) · «운송구분 : 왕복» → 왕복", () => {
        const got = parseDetailedRawText(["운송구분 : 왕복", "오더형태 : 급송"].join("\n"));
        expect(got.tripType).toBe("왕복");
        expect(got.orderForm).toBe("급송");
    });
    it("판정(core/engine)은 이 두 칸을 읽지 않는다 — 비어도 판정 무변화", () => {
        const dir = join(__dirname, "../../src/core/engine");
        const hits = readdirSync(dir).filter(f => f.endsWith(".ts") && /tripType|orderForm/.test(readFileSync(join(dir, f), "utf8")));
        expect(hits).toEqual([]);
    });
});
