import { readFileSync } from 'fs';
import { join } from 'path';
import { ARRIVAL_REASONS, arrivalReasonsFor, REASON_NEEDS_MEMO } from '@onedal/shared';

/**
 * 📍 **도착 사유 — 겪은 일을 남긴다** (기사님 확정 2026-08-19)
 *
 * 기사님: *"상차지 / 하차지 도착에 인자값을 바꾸면 좀더 의미 있어질 것 같은데..
 * 결박이 풀려 있는지 중간에 사고가 있었는지 등등."*
 *
 * 기획: [docs/도착_사유_기획.md](../../../../docs/도착_사유_기획.md)
 *
 * 🔴 **이 값은 아무것도 판정하지 않는다** — 색·필터·약속과 무관하다. 그래서 목록이
 *    아직 가설이어도(§3-4) 안전하다. 대신 `기타` + 메모로 **목록을 고칠 재료**를 모은다.
 */
describe('사유 목록 — 정거장마다 다르다', () => {
    it('🔴 상차지: 화주 미준비 · 물건 없음 · 진입 곤란 (+ 공통)', () => {
        const r = arrivalReasonsFor('pickup');
        expect(r).toContain('화주 미준비');
        expect(r).toContain('물건 없음');
        expect(r).toContain('진입 곤란');
    });

    it('🔴 하차지: 짐 무너짐 · 결박 풀림 · 파손 발견 · 수령인 부재 (+ 공통)', () => {
        const r = arrivalReasonsFor('dropoff');
        expect(r).toContain('짐 무너짐');
        expect(r).toContain('결박 풀림');
        expect(r).toContain('파손 발견');
        expect(r).toContain('수령인 부재');
    });

    it('공통(교통 지연·사고)은 양쪽에 다 있다', () => {
        for (const stop of ['pickup', 'dropoff'] as const) {
            expect(arrivalReasonsFor(stop)).toContain('교통 지연');
            expect(arrivalReasonsFor(stop)).toContain('사고');
        }
    });

    /**
     * 🔴 `수량 다름` 은 **넣지 않는다** (기사님 2026-08-19):
     *    *"이건 상차 완료해야 아는 거니까 도착에서는 빼자."*
     *    도착은 가서 본 것, 수량은 실어 봐야 아는 것. 실측(ACTUAL)을 고치면
     *    `cargoMismatchRatio` 가 스스로 센다 — 두 곳에 살면 갈라진다 (규칙 ③).
     */
    it('🔴 수량 다름은 사유가 아니다 — 상차 완료가 답할 일이다', () => {
        expect(ARRIVAL_REASONS).not.toContain('수량 다름');
    });

    /**
     * 🔴 **`기타` 를 반드시 둔다** — 목록이 가설이라(§3-4), 목록 밖의 일이 어디에도
     *    안 남으면 **목록을 고칠 근거 자체가 사라진다.**
     */
    it('🔴 기타가 양쪽에 있고, 그때만 메모를 받는다', () => {
        expect(arrivalReasonsFor('pickup')).toContain('기타');
        expect(arrivalReasonsFor('dropoff')).toContain('기타');
        expect(REASON_NEEDS_MEMO).toBe('기타');
    });

    it('사유는 맨 끝이 기타다 — 목록이 길어져도 자리가 안 바뀐다', () => {
        for (const stop of ['pickup', 'dropoff'] as const) {
            const r = arrivalReasonsFor(stop);
            expect(r[r.length - 1]).toBe('기타');
        }
    });
});

describe('저장 — 사유가 장부에 남는다', () => {
    const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');

    it('🔴 order_milestones 에 reasons 칸이 있다', () => {
        expect(read('../../src/db.ts')).toMatch(/ensureColumns\('order_milestones'[\s\S]{0,200}reasons/);
    });

    it('🔴 도착을 기록할 때 사유를 함께 적는다', () => {
        const engine = read('../../src/services/dispatchEngine.ts');
        expect(engine).toMatch(/reasons/);
    });

    it('🔴 관제웹이 사유를 보내고, 서버가 그대로 받는다', () => {
        expect(read('../../../client-app/src/components/dashboard/StopCallSheet.tsx')).toMatch(/reasons/);
        expect(read('../../src/socket/socketHandlers.ts')).toMatch(/reasons/);
    });

    it('🔴 장부 보기(pnpm ledger)에도 나온다 — 쓰기만 하고 안 읽으면 죽은 데이터다', () => {
        expect(read('../../../scripts/ledger.mjs')).toMatch(/reasons/);
    });
});
