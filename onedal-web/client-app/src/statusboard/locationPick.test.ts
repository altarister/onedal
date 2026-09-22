import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 📍 **「위치 찍기」가 서버에 무엇이라고 말하나** (서버 지적).
 *
 * 🏠 집 · 주소로 찾기로 찍은 좌표는 **`'manual'` 로** 나간다. 서버는 `manual` 을
 * 알아듣는다(소켓 문에 화이트리스트가 없어 온 그대로 통과하고, `originOf`·
 * `gps_tracks.source` 가 그 낱말을 쥔다).
 *
 * 🔴 **그래야 궤적에서 «달린 것»과 «찍은 것»을 가른다.** 찍은 좌표가 `'mock'` 으로 섞이면
 *    가짜를 진짜로 읽는다 — 파주 156km 사고가 그렇게 났다.
 *
 * 🔬 **왜 소스를 읽는 검사인가** — 고장은 «어떤 낱말을 넘기는가»이고 그것은 **부르는
 *    자리**에 있다. `gpsBridge.test.ts` 는 낱말이 타입에 있는지(tsc)와 나가는 모양을 물고,
 *    여기는 **현황판이 실제로 그 낱말을 넘기는지**를 문다. 런타임 검사로는 못 잡는다 —
 *    문자열을 바꿔 넣어도 함수는 그대로 돌기 때문이다.
 */
const PANEL = join(__dirname, 'StatusBoard.tsx');
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const panel = codeOnly(readFileSync(PANEL, 'utf8'));

describe('📍 위치 찍기 — 출처를 바로 말한다', () => {

    it("🔴 'manual' 로 보낸다", () => {
        expect(panel).toMatch(/publishLocation\(lat,\s*lng,\s*'manual'\)/);
    });

    /** 🔴 «못 보낸다»·«모의 주행으로 적힌다» 문구가 있으면 화면이 지금과 다른 사실을 말한다 */
    it('🔴 «모의 주행으로 적힌다»는 문구가 남아 있지 않다', () => {
        expect(panel).not.toMatch(/manual 을 못 보낸다/);
        expect(panel).not.toMatch(/서버는 🧪 모의 주행으로 적는다/);
    });

    /** 🔴 보내는 문은 여전히 하나다 — 여기서 `socket.emit` 을 새로 내지 않는다 */
    it('🔴 소켓을 직접 쏘지 않는다 (문은 publishLocation 하나)', () => {
        expect(panel).not.toMatch(/socket\.emit/);
    });
});
