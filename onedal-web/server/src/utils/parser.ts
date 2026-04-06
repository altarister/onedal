import type { LocationDetailInfo } from "@onedal/shared";

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

        const customerName = extractField(lines, "상호/이름");
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
