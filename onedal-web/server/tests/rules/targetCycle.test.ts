import { readFileSync } from "fs";
import { join } from "path";

/**
 * 🧭 복귀는 기사님 손으로만 바뀐다
 *
 * 복귀는 **목적지 한 칸이 느는 것**일 뿐이다 (기사님 확정) —
 * 목적지행 첫콜을 잡는 것과 다르지 않다. 그래서 서버가 방향을 대신 정하지 않는다.
 *
 * 🔴 **켜는 것** — 기사님은 목적지에 닿기 전에 켜신다. 그래야 목적지 방면과 집 방면의 콜을
 *    둘 다 보신다. 하차를 마친 뒤에 서버가 켜 주면 이미 늦은 자리다.
 * 🔴 **끄는 것** — 목적지에 다다랐다고 목적지가 꺼지지 않는 것처럼, 집에 닿아도 복귀는 켜진 채다.
 *    다음에 어디로 갈지는 기사님이 정하신다.
 */

const SRC = join(__dirname, "../../src");
const codeOnly = (s: string) => readFileSync(join(SRC, s), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const SHARED = join(__dirname, "../../../shared/src");
const sharedCode = (s: string) => readFileSync(join(SHARED, s), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('🔴 방향을 서버가 정하는 길이 없다 (L1 — 코드 모양)', () => {
    const en = codeOnly('services/dispatchEngine.ts');

    it('하차를 마쳐도 서버가 복귀를 켜거나 끄지 않는다', () => {
        expect(en).not.toMatch(/decideTargetAfterDelivery/);
        expect(sharedCode('phases.ts')).not.toMatch(/decideTargetAfterDelivery/);
    });

    it('🔴 집 반경으로 방향을 판정하는 값이 없다 — 집에 닿아도 복귀는 켜진 채다', () => {
        expect(sharedCode('phases.ts')).not.toMatch(/HOME_RADIUS_KM/);
    });

    it('🔴 «서버가 방향을 바꿨다»고 알리는 소켓이 없다', () => {
        expect(codeOnly('socket/socketHandlers.ts')).not.toMatch(/target-auto-switched/);
        expect(en).not.toMatch(/target-auto-switched/);
    });

    it("🔴 방향을 바꾸는 것은 기사님 버튼 하나 — by=driver 로만 기록된다", () => {
        expect(codeOnly('socket/socketHandlers.ts')).toMatch(/setCallTarget\(userId, data\?\.phase \?\? 'DEST', io, 'driver'\)/);
        expect(en).not.toMatch(/setCallTarget\([^)]*'auto'\)/);
    });

    it('🔴 복귀를 켜고 끄면 바로 하차 · 상차 목록을 다시 만든다 — 켠 시각을 적은 뒤 (#146)', () => {
        /* 바로 다시 만들지 않으면 복귀를 꺼도 목록이 서버 재시작까지 «이천 ∪ 광주»로 남고 지도에도 광주 원이 남는다 */
        const start = en.indexOf('export async function setCallTarget(');
        expect(start).toBeGreaterThan(-1);
        const body = en.slice(start, en.indexOf('\n}', start));
        const rec = body.indexOf('recordCallTarget(');
        expect(rec).toBeGreaterThan(-1);
        /* «집으로 가는 콜을 잡았나»가 켠 시각(call_target_events)을 읽으니 적은 뒤에 만든다 */
        expect(body.indexOf('rebuildNetFilter(userId, io)')).toBeGreaterThan(rec);
    });
});
