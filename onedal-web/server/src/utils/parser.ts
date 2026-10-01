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

    // 2. 상태/형태 — 못 찾으면 칸 없음(«편도» · «일반»을 지어내지 않는다 · 관제웹은 빈 칸의 줄을 안 그린다)
    result.receiptStatus = extractField(lines, "상태") || extractField(lines, "접수");
    result.tripType = extractField(lines, "운송구분") || extractField(lines, "운행구분") || extractField(lines, "왕복여부");
    result.orderForm = extractField(lines, "오더형태");

    // 3. 결제 관련
    // 결제방법은 **독립 필드가 아니라 요금 값의 괄호 안**에 있다 (`요금 : 40,000(신용)`).
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

    /**
     * 🔴 **못 찾은 칸은 싣지 않는다**.
     * `/detail` 은 이 결과를 첫 보고의 기억 위에 통째로 펼친다 — `undefined` 칸이 있으면 아는 값을 지운다.
     * 인성 상세에는 «차종» 줄이 있어 안 드러났고, 픽커 상세(차종 칸 없음)에서 첫 보고가 넣은
     * 차종 일반값(규칙 ⑤-2)이 사라졌다.
     */
    return Object.fromEntries(Object.entries(result).filter(([, v]) => v !== undefined));
}


