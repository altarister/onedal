/**
 * 🧾 JSON 배열 칸 읽기
 * 누가: 서버 · 관제웹 · shared 단계 코드가 부른다
 * 언제: DB 의 JSON 글자 칸을 읽을 때
 * 어디서: 단계 행의 짐 태그 · 보호 · 뒷일, 제외 지역, 받는 차종
 * 무엇을: 글자를 배열로 바꾼다
 * 어떻게: 깨졌거나 비었으면 null, «[]» 는 [] 로 돌려준다
 * 왜: 칸마다 파싱 코드를 따로 두지 않고 «비어 있음»과 «없음»을 가르게 한다
 */
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
