import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🧾 **심사석이 «기존 콜이 어떻게 되나»를 말한다** (전수표 4단계 #43 #45 #46 #47 · 목업 «④ 후보콜에 대한 심사 결론»).
 *
 * 합짐 심사는 이미 후보를 넣은 경로의 정거장 타임라인(`tlAfter`)을 만든다 — 그런데 결과를 **관문 문장 하나와
 * 최소 버퍼 숫자**로만 썼다. 정거장마다 약속·예정·늦음이 스냅샷에 없어서 심사석이 «누가 몇 분»을 못 보였고,
 * 🔴 정거장 순서를 못 받으면 `late` 가 비어 관문이 **통과** — 모르는 것이 «약속 보존»으로 읽혔다.
 *
 *   · 스냅샷에 `stops`(기존 정거장마다 약속·예정·늦음) · `unknownWhy`(모르는 까닭)를 싣는다
 *   · 모르면 **딱지**를 붙인다 — 점수는 안 건드린다 (규칙 ⑤-2 · 모르는 값으로 떨어뜨리지 않는다)
 *   · 저장(`order_judgments.detail`)과 되살리기(`getJudgmentVerdict`)가 둘을 함께 다룬다 — 새로고침에 사라지지 않게
 *   · 심사석은 결론을 `seatConclusion` 한 곳에서 낸다
 */
const code = (rel: string) => readFileSync(join(__dirname, '../../', rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('🧾 심사석 — 기존 콜 정거장 (4단계)', () => {
    it('🔴 합짐 심사가 스냅샷에 정거장 줄과 모르는 까닭을 싣는다 · 모르면 딱지', () => {
        const ev = code('src/core/engine/OrderEvaluator.ts');
        expect(ev).toMatch(/dry\.stops\s*=/);
        expect(ev).toMatch(/dry\.unknownWhy\s*=/);
        expect(ev).toMatch(/기존 콜 도착 모름/);
    });
    it('🔴 저장과 되살리기가 둘을 함께 다룬다', () => {
        const repo = code('src/repositories/OrderRepository.ts');
        const save = repo.slice(repo.indexOf('saveJudgment('), repo.indexOf('getJudgmentVerdict('));
        expect(save).toMatch(/stops/);
        expect(save).toMatch(/unknownWhy/);
        const load = repo.slice(repo.indexOf('getJudgmentVerdict('), repo.indexOf('public static getJudgment('));
        expect(load).toMatch(/stops/);
        expect(load).toMatch(/unknownWhy/);
    });
    /**
     * 📞 **전수표 #42 의 빠진 둘** — 목업 시트 심사 카드의 «더 쓰는 시간»(시급의 분모 · 합짐이면 전체 경로가 늘어나는 만큼)과
     *    «☎️ 전화할 곳»(가장 크게 밀리는 기존 정거장). 숫자는 판정이 이미 쓴 값이다 — 화면이 다시 재지 않는다 (규칙 ③).
     */
    it('🔴 첫짐·합짐 판정이 «더 쓰는 시간»을 싣고 · 정거장 줄에 동 이름이 있다', () => {
        const ev = code('src/core/engine/OrderEvaluator.ts');
        expect((ev.match(/dry\.extraMin\s*=/g) ?? []).length).toBeGreaterThanOrEqual(2);
        expect(ev).toMatch(/place:\s*placeOf\(/);
    });
    it('🔴 «더 쓰는 시간»도 저장·되살리기에 함께 · 심사석이 보인다', () => {
        const repo = code('src/repositories/OrderRepository.ts');
        expect(repo.slice(repo.indexOf('saveJudgment('), repo.indexOf('getJudgmentVerdict('))).toMatch(/extraMin/);
        expect(repo.slice(repo.indexOf('getJudgmentVerdict('), repo.indexOf('public static getJudgment('))).toMatch(/extraMin/);
        expect(code('../client-app/src/components/dashboard/JudgmentSeat.tsx')).toMatch(/judgment\?\.extraMin/);
    });
    it('🔴 심사석은 결론을 seatConclusion 한 곳에서 낸다', () => {
        expect(code('../client-app/src/components/dashboard/JudgmentSeat.tsx')).toMatch(/seatConclusion\(/);
    });
});
