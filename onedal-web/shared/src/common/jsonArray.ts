/**
 * 🧾 **JSON 배열 칸 읽기 — 뿌리 하나** (공통 함수 7 · `jsonArray.test`).
 *    DB 의 JSON 글자 칸(제외 지역 · 받는 차종 · 단계 행 짐 태그 · 보호 · 뒷일)을 읽는다.
 *    깨졌거나 · 비었거나 · 배열이 아니면 null — «[]» 는 [] 그대로 둔다(«비어 있음»과 «없음»을 가르는 것은 부르는 자리의 몫).
 */
export function jsonArrayOf(text: unknown): unknown[] | null {
    if (typeof text !== 'string' || !text) return null;
    try {
        const v = JSON.parse(text);
        return Array.isArray(v) ? v : null;
    } catch { return null; }
}
