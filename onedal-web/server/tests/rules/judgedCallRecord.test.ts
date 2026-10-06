// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import db from '../../src/db';
import { OrderRepository } from '../../src/repositories/OrderRepository';
import { judgmentRecordOf } from '../../src/core/engine/judgmentRecord';

/**
 * 🧾 **판정할 때 «무슨 콜이었고 어떤 필터였나»를 판정 장부에 함께 남긴다** (reviews/43 · 기사님 «1 예»).
 * 미리보기 · 체험 콜은 orders 에 안 쓰이고 판정 표에만 남는다 — 콜 내용 · 그때의 서버 필터가 같이 없으면
 * 운영센터에서 «오늘 안 잡은 콜이 어떤 필터로 올라와 무슨 색 몇 점이었나»를 못 본다.
 * 못 잡는 것: 원달앱이 덜 읽어 올린 콜 내용 · 폰 필터와 서버 필터의 한 판 어긋남(화면이 «서버 필터 기준»이라 적는다).
 */
const FILTER = {
    destinationCity: '이천시', goalCity: '이천시', callTarget: 'DEST', pickupRadiusKm: 12, minFare: 8000,
    isActive: true, userOverrides: true,
    pickupKeywords: ['경안동', '쌍령동'], destinationKeywords: ['관고동', '증포동', '신둔면'], excludedKeywords: ['착불'],
};
const PREVIEW = { id: 'TEST-JREC-1', pickup: '경기 광주시 광남1동', dropoff: '경기 이천시 관고동', fare: 23000, targetApp: 'kakaopicker', isPreview: true };

describe('판정 기록 — 콜 내용 · 필터 요약', () => {
    afterAll(() => db.prepare(`DELETE FROM order_judgments WHERE orderId LIKE 'TEST-JREC-%'`).run());

    it('미리보기 콜 — 내용과 «미리보기» 표시 · 서버 필터 요약(목록은 개수만)', () => {
        const r = judgmentRecordOf(PREVIEW, FILTER);
        expect(r.call).toEqual({ pickup: '경기 광주시 광남1동', dropoff: '경기 이천시 관고동', fare: 23000, targetApp: 'kakaopicker', kind: '미리보기' });
        expect(r.filter).toEqual({ destinationCity: '이천시', goalCity: '이천시', callTarget: 'DEST', pickupRadiusKm: 12, minFare: 8000,
            isActive: true, todayOnly: true, pickupCount: 2, dropoffCount: 3, excludedCount: 1 });
    });

    it('체험 콜은 «체험» · 잡을 수 있는 콜은 «콜»', () => {
        expect(judgmentRecordOf({ ...PREVIEW, isPreview: false, isSimulated: true }, FILTER).call.kind).toBe('체험');
        expect(judgmentRecordOf({ ...PREVIEW, isPreview: false }, FILTER).call.kind).toBe('콜');
    });

    it('저장하면 판정 detail 에 call · filter 가 남는다 — 판정 칸(축 · 색 · 점수)은 그대로', () => {
        OrderRepository.saveJudgment('TEST-JREC-2', 'test-jrec-user',
            { color: '보통', score: 55, axes: [], gates: [], tags: [], ...judgmentRecordOf(PREVIEW, FILTER) });
        const row = db.prepare(`SELECT color, score, detail FROM order_judgments WHERE orderId = 'TEST-JREC-2'`).get();
        const d = JSON.parse(row.detail);
        expect([row.color, row.score]).toEqual(['보통', 55]);
        expect(d.call.kind).toBe('미리보기');
        expect(d.filter.destinationCity).toBe('이천시');
    });

    it('판정 엔진의 저장 자리는 모두 같은 기록을 같이 넘긴다 — 한 자리라도 빠지면 그 갈래 판정은 내용 · 필터가 빈다', () => {
        const src = readFileSync(join(__dirname, '../../src/core/engine/OrderEvaluator.ts'), 'utf8');
        const saves = src.match(/OrderRepository\.saveJudgment\([^;]*\)/g) ?? [];
        expect(saves.length).toBeGreaterThanOrEqual(3);
        for (const s of saves) expect(s).toMatch(/\.\.\.record/);
        expect(src).toMatch(/const record = judgmentRecordOf\(securedOrder, snap\.filter\)/);
    });
});
