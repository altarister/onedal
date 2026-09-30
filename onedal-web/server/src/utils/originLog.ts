import { slog } from "./fileLogger";

/**
 * 🌐 **처음 보는 Origin 을 한 줄** (reviews/29 1단계 H · onedal-1f) — CORS 를 좁히기 전에 실제로 붙는 출처 목록을 모은다.
 *    관제앱 웹뷰의 Origin 을 폰에서 확인하지 못해, 틀린 목록으로 좁히면 관제앱이 통째로 끊긴다. Origin 마다 한 번(서버가 뜬 동안).
 */
const seen = new Set<string>();

export function noteOrigin(origin: string | undefined, via: string): void {
    if (!origin || seen.has(origin)) return;
    if (seen.size >= 200) return;   // 이상한 출처가 쏟아져도 로그가 넘치지 않게
    seen.add(origin);
    slog('통신', `🌐 [처음 보는 Origin] ${origin} · ${via}`);
}
