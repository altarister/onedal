// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import db from '../../src/db';
import opsRouter from '../../src/routes/ops';
import { countKakao, kakaoUsageOf } from '../../src/services/kakaoUsage';
import { logContext, enterLogWho } from '../../src/utils/logContext';
import { kstDateText } from '@onedal/shared';

/**
 * 🗺️ **카카오 사용량 — 회원 · 한국 날마다 센다** (reviews/27 8장 ⑥ ⑭ · 29 5단계 · onedal-69 «가» Q3 · Q4).
 *    카카오 키는 하나라 한 회원이 한도를 다 쓰면 모두 멈춘다 — 누가 얼마나 쓰는지 운영센터 회원 상세에 보인다(«카카오 오늘 / 이달»).
 *    «누구 몫»은 로그 «@기사»와 같은 맥락(logContext 의 userId) 한 벌 — 요청 · 폰 문 · 소켓 이벤트 · 1초 고리의 회원 하나가 싣는다.
 *    주인을 모르면(흐름 밖) '' 로 센다. 길찾기(apis-navi)와 좌표 찾기(dapi 등)는 카카오 한도가 따로라 칸을 나눈다. 세기만 한다(운행 무변화).
 */
const U = 'test-kakao-usage', A = 'test-kakao-admin';
const today = () => kstDateText(Date.now());
const row = (id: string) => db.prepare(`SELECT route_calls, local_calls FROM kakao_usage_days WHERE user_id = ? AND day = ?`).get(id, today()) ?? { route_calls: 0, local_calls: 0 };
const ROUTE = 'https://apis-navi.kakaomobility.com/v1/directions?origin=1,2';
const LOCAL = 'https://dapi.kakao.com/v2/local/search/address.json?query=x';

beforeAll(() => {
    for (const id of [U, A]) db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(id, `g-${id}`, `${id}@test`, id);
    db.prepare(`UPDATE users SET approved_at = datetime('now'), ops_allowed_at = datetime('now') WHERE id = ?`).run(A);
    db.prepare(`DELETE FROM kakao_usage_days WHERE user_id IN (?, '')`).run(U);
});
afterAll(() => {
    db.prepare(`DELETE FROM kakao_usage_days WHERE user_id IN (?, '')`).run(U);
    db.prepare(`DELETE FROM ops_audit WHERE admin_id = ?`).run(A);
    for (const id of [U, A]) db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
});

describe('🗺️ 카카오 사용량', () => {
    it('🔴 그 회원 흐름 안의 호출은 그 회원 오늘 줄에 — 길찾기 · 좌표 찾기 따로', () => {
        logContext.run({ userId: U }, () => { countKakao(ROUTE); countKakao(ROUTE); countKakao(LOCAL); });
        expect(row(U)).toEqual({ route_calls: 2, local_calls: 1 });
    });
    it('🔴 주인을 모르면 «주인 없음»(\'\') 줄에', () => {
        const before = row('').route_calls;
        countKakao(ROUTE);
        expect(row('').route_calls).toBe(before + 1);
    });
    it('🔴 요청 · 폰 문의 enterLogWho 가 회원을 싣는다 — 로그 «@기사»와 같은 칸', async () => {
        await logContext.run({}, async () => {
            enterLogWho('검사', U);
            await Promise.resolve();
            countKakao(ROUTE);
        });
        expect(row(U).route_calls).toBe(3);
    });
    it('🔴 운영센터 회원 상세 «카카오 오늘 / 이달» — 길찾기 수', async () => {
        expect(kakaoUsageOf(U)).toEqual({ today: 3, month: expect.any(Number) });
        expect(kakaoUsageOf(U).month).toBeGreaterThanOrEqual(3);
        const layer = opsRouter.stack.find((l: any) => l.route?.path === '/members/:id' && l.route.methods.get);
        let out: any;
        const res = { status: () => res, json: (b: any) => { out = b; return res; } };
        await layer.route.stack[layer.route.stack.length - 1].handle({ app: { get: () => undefined }, params: { id: U }, query: {}, user: { id: A }, headers: {} }, res);
        expect(out.kakaoUsage).toEqual(kakaoUsageOf(U));
    });
    it('🔴 카카오를 부르는 fetch 넷이 모두 센다 · 소켓 이벤트 · 연결 · 1초 고리가 회원을 싣는다', () => {
        const svc = readFileSync(join(__dirname, '../../src/services/kakaoService.ts'), 'utf8');
        const sim = readFileSync(join(__dirname, '../../src/routes/sim.ts'), 'utf8');
        expect(svc.match(/countKakao\(/g)?.length).toBe(2);
        expect(sim.match(/countKakao\(/g)?.length).toBe(2);
        const sock = readFileSync(join(__dirname, '../../src/socket/socketHandlers.ts'), 'utf8');
        expect(sock).toMatch(/logContext\.run\(\{ who: whoLabel\(socket\.data\.user\?\.name, socket\.data\.user\?\.id\), userId: socket\.data\.user\?\.id \}/);
        /* 연결 처리는 enterWith 가 아니라 run 으로 — enterWith 는 socket.io 의 다른 흐름(다음 연결 · 내부 타이머)으로 새어 남의 일에 회원이 붙는다 (f5 교차 리뷰) */
        expect(sock).toMatch(/io\.on\("connection", \(socket: Socket\) => logContext\.run\(\{ who: whoLabel\(socket\.data\.user\?\.name, socket\.data\.user\?\.id\), userId: socket\.data\.user\?\.id \}, \(\) => \{/);
        expect(sock).not.toMatch(/enterLogWho\(/);
        expect(sock).toMatch(/for \(const uid of userIds\) logContext\.run\(\{ userId: uid \}/);
    });

    /* 🏢 운영센터 현황판 «카카오 호출 — 오늘 / 이달» (onedal-ea 문 모양 · onedal-69 «가») — 이달에 센 주인만 줄로 · 주인 없음('')은 null · 합은 화면이 더한다 */
    it('🔴 /board/kakao — 주인마다 길찾기 · 좌표 찾기의 오늘 / 이달 · 주인 없음은 memberId null', async () => {
        const layer = opsRouter.stack.find((l: any) => l.route?.path === '/board/kakao' && l.route.methods.get);
        expect(layer).toBeTruthy();
        let out: any;
        const res = { status: () => res, json: (b: any) => { out = b; return res; } };
        await layer.route.stack[layer.route.stack.length - 1].handle({ app: { get: () => undefined }, params: {}, query: {}, user: { id: A }, headers: {} }, res);
        expect(out.day).toBe(today());
        const mine = out.rows.find((r: any) => r.memberId === U);
        expect(mine).toEqual({ memberId: U, route: { today: 3, month: expect.any(Number) }, local: { today: 1, month: expect.any(Number) } });
        expect(out.rows.some((r: any) => r.memberId === null)).toBe(true);
        expect(out.rows.some((r: any) => r.memberId === '')).toBe(false);
        expect(out.rows.every((r: any) => r.route.month + r.local.month > 0)).toBe(true);
    });
});
