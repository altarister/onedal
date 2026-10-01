/**
 * 🌐 **폰 · 브라우저의 진짜 IP — 한 함수** (onedal-69 «가»).
 *    실서버는 클라우드플레어를 거쳐 req.ip 가 중계 에지다 — 같은 에지를 지나는 남끼리 한 IP 로 섞인다.
 *    클라우드플레어가 붙이는 `cf-connecting-ip` 머리를 먼저 읽고, 없으면(로컬 · 바로 붙음) req.ip.
 * ⚠️ 머리는 위조할 수 있다(실서버에 바로 붙으면) — 막는 데 쓰는 곳은 req.ip 도 함께 센다(`pairingStore` 의 HOP_FAILS).
 */
export function clientIpOf(req: { get?: (name: string) => string | undefined; ip?: string }): string {
    return req.get?.('cf-connecting-ip') ?? req.ip ?? '?';
}
