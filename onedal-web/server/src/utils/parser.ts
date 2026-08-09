import type { LocationDetailInfo, PaymentType } from "@onedal/shared";
import { PAYMENT_TYPES } from "@onedal/shared";

/**
 * 텍스트 블록 안에서 특정 키워드(예: "상호/이름", "위치", "전화1")로 시작하는 줄을 찾아
 * 그 뒤의 내용을 추출합니다.
 */
function extractField(lines: string[], keyword: string): string | undefined {
    const index = lines.findIndex(l => l.startsWith(keyword) || l.includes(`${keyword}:`));
    if (index === -1) return undefined;

    let content = lines[index].replace(new RegExp(`^.*${keyword}\\s*[:]*\\s*`), "").trim();
    // 만약 한 줄에 값이 없고 라벨만 있었다면, 다음 줄의 텍스트가 진짜 값일 확률이 높음
    if (content === "" && index + 1 < lines.length) {
        content = lines[index + 1].trim();
    }
    return content || undefined;
}

/**
 * \n 으로 연결된 텍스트 청크를 받아 LocationDetailInfo 객체로 변환합니다.
 */
export function parseLocationDetails(rawText: string, searchTag: "[출발지상세]" | "[도착지상세]"): LocationDetailInfo[] {
    if (!rawText) return [];

    const results: LocationDetailInfo[] = [];
    const chunks = rawText.split(searchTag);

    // 첫 번째 덩어리는 보통 태그 앞이므로 버리고, 그 이후 덩어리들을 파싱 (보통 1개만 존재)
    for (let i = 1; i < chunks.length; i++) {
        // 다음 태그(예: [도착지상세])가 나오기 전까지의 문자열을 한 블록으로 간주
        const block = chunks[i].split("\n[")[0].trim();
        const lines = block.split("\n").map(l => l.trim());

        const info: LocationDetailInfo = {};

        const customerName = extractField(lines, "고객");
        if (customerName) info.customerName = customerName;

        // 사용자가 명시한 "위치"
        const addressDetail = extractField(lines, "위치");
        if (addressDetail) info.addressDetail = addressDetail;

        const department = extractField(lines, "부서");
        if (department) info.department = department;

        const contactName = extractField(lines, "담당");
        if (contactName) info.contactName = contactName;

        const phone1 = extractField(lines, "전화1");
        if (phone1) info.phone1 = phone1;

        const phone2 = extractField(lines, "전화2");
        if (phone2) info.phone2 = phone2;

        results.push(info);
    }

    return results;
}

/**
 * 원시 텍스트에서 요금을 읽는다.
 *
 * ⚠️ 이름은 "Mockup"이지만 **목업 전용이 아니다.** `detail.ts`에서 앱이 요금을 못 긁었을 때
 *    (`fare <= 0`) 실제로 호출되는 폴백 경로다. 앱의 리스트 파서는 차종코드 옆 만 단위
 *    축약값("라 2.2")을 읽도록 만들어져 있어, 확정 상세 화면("요금 : 40,000(신용)")에서는
 *    요금을 못 잡고 0을 보낸다. 그때 이 함수가 판정의 유일한 근거가 된다.
 *
 * 표기가 세 종류라 "이 숫자가 원 단위인가 축약형인가"를 판별해야 한다.
 *   ① 쉼표 있음  `40,000`  → **원 단위 확정**. 축약형은 쉼표를 쓰지 않는다
 *   ② 접미사/소수 `4.5만` `42.5` → 축약형
 *   ③ 맨 정수    `45` `45000` → 크기로 판별 (1000 미만이면 축약형)
 */
export function parseMockupFare(rawText: string): number | undefined {
    if (!rawText) return undefined;

    // 1. 명시적 요금 포맷 (예: "요금 : 40,000(신용)", "요금: 45000", "금액 4.5만")
    //    쉼표를 포함해서 잡는다. 예전에는 `\d+`가 쉼표에서 멈춰 "40,000"을 40으로 읽었다.
    const fareMatch = rawText.match(/(?:요금|금액)\s*[:]?\s*([\d,]+(?:\.\d+)?)\s*(만|천)?/);
    if (fareMatch) {
        const hadComma = fareMatch[1].includes(",");
        const val = parseFloat(fareMatch[1].replace(/,/g, ""));
        if (!Number.isFinite(val)) return undefined;

        if (fareMatch[2] === "만") return val * 10000;
        if (fareMatch[2] === "천") return val * 1000;

        // 쉼표는 "원 단위로 쓴 금액"이라는 확실한 신호다 (40,000 → 40000원)
        if (hadComma) return val;

        // 🔴 예전 규칙은 `val >= 10 && val <= 9999` 이면 축약형으로 보고 ×1000 했다.
        //    그래서 "요금 : 8000"(8천원 똥콜)이 **800만원 초꿀콜**로 판정되어
        //    하한가 필터를 그대로 통과했다. 1000원 미만일 때만 축약형으로 본다
        //    (800원짜리 퀵은 존재하지 않으므로 800은 80만원 축약으로 읽는 게 맞다).
        if (val < 1000) return val * 1000;
        return val;
    }

    // 2. 정확한 4~5자리 정수 (최소 1만원 이상)
    const exactNumMatch = rawText.match(/\b([1-9]\d{3,5})\b/);
    if (exactNumMatch) {
        return parseInt(exactNumMatch[1], 10);
    }

    // 3. 인성콜 축약형 (예: "45", "42.5" -> 45000원)
    const shortNumMatch = rawText.match(/\b([1-9]\d?(?:\.\d)?)\b/);
    if (shortNumMatch) {
        const val = parseFloat(shortNumMatch[1]);
        if (val >= 10 && val <= 999) return val * 1000;
    }

    return undefined;
}

/**
 * [목업 지원 전용] 거리 텍스트 파싱
 */
export function parseMockupDistance(rawText: string): number | undefined {
    if (!rawText) return undefined;

    // 명시적 km 포맷
    const distMatch = rawText.match(/(\d+(?:\.\d+)?)\s*(?:km|KM|킬로)/i);
    if (distMatch) return parseFloat(distMatch[1]);

    // "거리: 52.9" 포맷
    const shortDist = rawText.match(/거리\s*[:]?\s*(\d+(?:\.\d+)?)/);
    if (shortDist) return parseFloat(shortDist[1]);

    // km 구문이 없는 순수 숫자 추출 (안드로이드 앱과 동일하게 100.0 미만의 소수점/정수는 거리로 추정)
    // 인성콜 특유의 약어(예: "오 12.5") 지원
    const blindDists = rawText.match(/\b(\d+\.\d+)\b/g);
    if (blindDists) {
        let maxDist = 0;
        for (const str of blindDists) {
            const val = parseFloat(str);
            if (val > maxDist && val < 100.0) maxDist = val;
        }
        if (maxDist > 0) return maxDist;
    }

    // 100.0 미만의 정수 (예: "73") 인데 맥락상 거리일 확률이 있는 경우
    // 하지만 "45"(4.5만) 같은 요금과 겹칠 위험이 있으므로 소수점 혹은 km/거리 텍스트가 있을때만 위에서 잡힙니다.
    // 추가 강구책으로 앞/뒤에 아무것도 안 붙은 두자리수 미만 숫자를 잡아냅니다.
    const blindInts = rawText.match(/\s(\d{1,2})\s/g);
    if (blindInts) {
        let maxDist = 0;
        for (const str of blindInts) {
            const val = parseInt(str.trim(), 10);
            if (val > maxDist && val < 100) maxDist = val;
        }
        if (maxDist > 0) return maxDist;
    }

    return undefined;
}

/**
 * [목업 지원 전용] 차종 텍스트 파싱
 */
export function parseMockupVehicleType(rawText: string): string | undefined {
    if (!rawText) return undefined;

    const vehicles = ["오토바이", "다마스", "라보", "1t", "1.4톤", "2.5톤", "3.5톤", "5톤"];
    for (const v of vehicles) {
        if (rawText.includes(v)) return v;
    }

    // 약어 매칭 (안드로이드 정규식 참조)
    const shorts: Record<string, string> = {
        "오": "오토바이", "다": "다마스", "라": "라보", "1t": "1톤", "1.4t": "1.4톤"
    };

    // 텍스트 앞부분이나 특정 심볼과 결합된 한 글자를 찾습니다.
    for (const [key, val] of Object.entries(shorts)) {
        if (new RegExp(`(?:\\s|^|\\[|\\()${key}(?:\\s|\\d|$)`).test(rawText)) {
            return val;
        }
    }

    return undefined;
}

/**
 * [Dumb Client / Smart Server]
 * 원본 텍스트(rawText)로부터 세부 메타데이터를 정규식으로 추출합니다.
 */
export function parseDetailedRawText(rawText: string): any {
    if (!rawText) return {};

    const result: any = {};
    const lines = rawText.split('\n').map(l => l.trim());

    // 1. 배차사 / 연락처
    result.dispatcherName = extractField(lines, "배차사") || extractField(lines, "화주명") || extractField(lines, "화주");
    result.dispatcherPhone = extractField(lines, "배차화물전화") || extractField(lines, "화물전화") || extractField(lines, "배차전화");

    // 2. 상태/형태
    result.receiptStatus = extractField(lines, "상태") || extractField(lines, "접수");
    result.tripType = extractField(lines, "운송구분") || extractField(lines, "운행구분") || extractField(lines, "왕복여부") || "편도";
    result.orderForm = extractField(lines, "오더형태") || "일반";

    // 3. 결제 관련
    // 결제방법은 **독립 필드가 아니라 요금 값의 괄호 안**에 있다 (`요금 : 40,000(신용)`).
    // 예전에는 존재하지 않는 "결제방법" 필드명을 찾고 있어 실측 16건이 전부 null 이었다.
    // 괄호 안 자유 텍스트("협의" 등)를 결제수단으로 오인하지 않도록 알려진 값만 채택한다.
    const payInFare = rawText.match(/(?:요금|금액)\s*[:]?\s*[\d,.]+\s*\(([^)]+)\)/);
    const payCandidate = payInFare?.[1]?.trim();
    result.paymentType = (PAYMENT_TYPES.includes(payCandidate as PaymentType) ? payCandidate : undefined)
        || extractField(lines, "결제방법") || extractField(lines, "지불") || extractField(lines, "결제");
    result.billingType = extractField(lines, "계산서") || extractField(lines, "영수증");
    result.commissionRate = extractField(lines, "수수료") || extractField(lines, "수수료율");
    result.tollFare = extractField(lines, "탁송료") || extractField(lines, "경유비");

    // 4. 차종 및 화물 상세
    result.vehicleType = extractField(lines, "차종") || extractField(lines, "요청차종");
    result.itemDescription = extractField(lines, "물품") || extractField(lines, "품목") || extractField(lines, "화물명");

    // 5. 픽업 시간
    result.pickupTime = extractField(lines, "상차일시") || extractField(lines, "상차시간") || extractField(lines, "출발시간");

    // 6. 적요 (상세 메모)
    // 팝업 상세본 "[적요상세/정보]"가 있으면 최우선으로 파싱
    if (rawText.includes("[적요상세/정보]")) {
        const parts = rawText.split("[적요상세/정보]")[1];
        if (parts) {
            // 안드로이드 접근성 노드는 화면 전체를 다시 가져오므로, 
            // 팝업 안의 진짜 내용만 발라내려면 '적요 내용'과 '닫기' 사이의 텍스트만 추출해야 함.
            const match = parts.split("\n[")[0].match(/적요 내용\s*([\s\S]*?)\s*닫기/);
            if (match && match[1]) {
                let block = match[1].replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim();
                if (block.length > 0) result.detailMemo = block;
            }
        }
    }

    if (!result.detailMemo && rawText.includes("적요상세 ")) {
        const parts = rawText.split("적요상세 ")[1];
        if (parts) {
            result.detailMemo = parts.trim();
        }
    }

    // 팝업 상세본이 없으면 본문 프리뷰 텍스트에서 추출 (다음 팝업 태그 [ 가 나오기 전까지만)
    if (!result.detailMemo) {
        const memoIndex = lines.findIndex(l => l.startsWith("적요") || l.startsWith("특기사항") || l.startsWith("기타사항"));
        if (memoIndex !== -1) {
            let endIndex = lines.findIndex((l, idx) => idx > memoIndex && l.startsWith("["));
            if (endIndex === -1) endIndex = lines.length;

            const memoContent = lines.slice(memoIndex, endIndex).join('\n').replace(/^(적요|특기사항|기타사항)\s*[:]?\s*/, "").trim();
            result.detailMemo = memoContent || undefined;
        }
    }

    return result;
}

