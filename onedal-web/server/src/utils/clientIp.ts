import { BlockList, isIPv4 } from "net";

/**
 * 🌐 **폰 · 브라우저의 진짜 IP — 한 함수** (onedal-69 · f5 교차 리뷰).
 *    클라우드플레어를 거친 요청은 req.ip 가 에지라 남끼리 섞인다 — 그때만 클라우드플레어가 덮어쓰는 `cf-connecting-ip` 머리를 믿는다.
 *    🔴 실서버는 노드가 바로 열려 있다 — 클라우드플레어 밖에서 바로 붙은 요청의 머리는 아무 값이나 넣을 수 있어 버리고 req.ip 를 쓴다.
 *    믿는 바로 붙은 쪽: 클라우드플레어 공개 대역(아래 상수) · 루프백(같은 기계의 터널).
 * ⚠️ 루프백을 믿는 것은 «루프백으로 오는 것은 전부 클라우드플레어 터널을 거친 것»일 때만 맞다 —
 *    실서버 앞에 바깥으로 열린 프록시(nginx 등)를 루프백으로 붙이면 그 앞으로 온 위조 머리도 믿게 된다.
 */
/* 출처: https://www.cloudflare.com/ips-v4 · https://www.cloudflare.com/ips-v6 — 클라우드플레어가 대역을 바꾸면 여기를 고친다 */
const CLOUDFLARE_V4 = ['173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
    '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14',
    '172.64.0.0/13', '131.0.72.0/22'];
const CLOUDFLARE_V6 = ['2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32'];

const trusted = new BlockList();
for (const c of CLOUDFLARE_V4) { const [a, p] = c.split('/'); trusted.addSubnet(a, Number(p), 'ipv4'); }
for (const c of CLOUDFLARE_V6) { const [a, p] = c.split('/'); trusted.addSubnet(a, Number(p), 'ipv6'); }
trusted.addSubnet('127.0.0.0', 8, 'ipv4');
trusted.addAddress('::1', 'ipv6');

/** 바로 붙은 쪽이 머리를 믿어도 되는 곳인가 — IPv4 를 IPv6 꼴(::ffff:a.b.c.d)로 받은 것도 IPv4 로 본다 */
function isTrustedHop(ip: string | undefined): boolean {
    if (!ip) return false;
    const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    try { return isIPv4(v4) ? trusted.check(v4, 'ipv4') : trusted.check(ip, 'ipv6'); } catch { return false; }
}

export function clientIpOf(req: { get?: (name: string) => string | undefined; ip?: string }): string {
    const header = req.get?.('cf-connecting-ip');
    if (header && isTrustedHop(req.ip)) return header;
    return req.ip ?? '?';
}
