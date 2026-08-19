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
describe('사유 목록 — **단계마다** 관심사가 다르다', () => {
    it('🔴 상차지 도착: 이동 문제 + 그 장소 문제 (짐 이야기는 없다)', () => {
        const r = arrivalReasonsFor('ARRIVE_PICKUP');
        expect(r).toEqual(expect.arrayContaining(['교통 지연', '사고', '진입 곤란', '주소 다름', '점심시간', '문 잠김']));
        // 아직 문을 열기 전이다 — 짐 상태를 말할 수 없다
        expect(r).not.toContain('물건 없음');
        expect(r).not.toContain('짐 무너짐');
    });

    it('🔴 상차 완료: 화주·짐 문제 (여기서 비로소 실어 본다)', () => {
        const r = arrivalReasonsFor('LOADED');
        expect(r).toEqual(expect.arrayContaining(['화주 미준비', '물건 없음', '상차 중 파손']));
        expect(r).not.toContain('교통 지연');   // 오는 길 이야기는 도착에서 끝났다
    });

    it('🔴 하차지 도착: 이동 + 그 장소 + **짐 상태** (문을 열면 보인다)', () => {
        const r = arrivalReasonsFor('ARRIVE_DROPOFF');
        expect(r).toEqual(expect.arrayContaining([
            '교통 지연', '사고', '진입 곤란', '주소 다름', '수령인 부재',
            '짐 무너짐', '결박 풀림', '파손 발견',
        ]));
    });

    it('🔴 하차 완료: 인수 단계의 문제', () => {
        const r = arrivalReasonsFor('DELIVERED');
        expect(r).toEqual(expect.arrayContaining(['검수 지연', '인수 거부']));
    });

    /**
     * 🔴 `수량 다름` 은 **사유가 아니다** (기사님 확정 2026-08-19: *"3 실측폼"*).
     *    실측 폼에 실제 수량을 적으면 `cargoMismatchRatio` 가 신고와의 차이를 스스로 센다.
     *    사유로 또 적으면 같은 사실이 두 곳에 살고 갈라진다 (규칙 ③).
     */
    it('🔴 수량 다름은 어느 단계에도 없다 — 실측 폼이 답한다', () => {
        expect(ARRIVAL_REASONS).not.toContain('수량 다름');
    });

    it('🔴 기타는 모든 단계 맨 끝에 있다 — 목록을 고칠 재료', () => {
        for (const step of ['ARRIVE_PICKUP', 'LOADED', 'ARRIVE_DROPOFF', 'DELIVERED'] as const) {
            const r = arrivalReasonsFor(step);
            expect(r[r.length - 1]).toBe('기타');
        }
        expect(REASON_NEEDS_MEMO).toBe('기타');
    });
});

/**
 * 📦 **짐 폼은 완료 단계에만 있다** (기사님 확정 2026-08-19)
 *
 * 기사님: *"상차지 도착에서는 단위·수량·방법·보호·성질 이것들이 모두 없어야 하는 거
 * 아닌가? 상차지 도착에 관한 것만 있으면 될 것 같은데."*
 *
 * 🔴 단순히 지저분해서가 아니다. **도착 시점에 수량을 적으면 그건 추측인데 `ACTUAL`
 *    (실측)로 저장된다** — 문을 열기도 전에 "실측"이 생기고, 그 값으로
 *    `cargoMismatchRatio`(신고 vs 실측)가 계산되어 **가짜 불일치 경고**가 뜬다.
 *    실측이 가능한 시점은 **실어 본 뒤**다.
 */
describe('짐 폼 — 실어 본 뒤에만', () => {
    const sheet = () => readFileSync(join(__dirname,
        '../../../client-app/src/components/dashboard/StopCallSheet.tsx'), 'utf8');
    const code = () => sheet().split('\n')
        .filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');

    it('🔴 현장 폼에서 짐 입력은 완료 단계(showDone)에만 그려진다', () => {
        expect(code()).toMatch(/showDone && cargoForm|\{showDone \?[\s\S]{0,80}cargoForm/);
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
