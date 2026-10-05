import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🕒 **단계 보고의 시각도 서버 입구에서 본다** — 통화 결과(saveCargoReport · opsCallHelper 검사)와 같은 규칙.
 * 관제앱 소켓 `report-milestone` 만 시각(occurredAt · predictedAt)을 실어 오고, 그 값으로 상태 보고(reportMilestone)와
 * 단계 기록(bridgeMilestone) 두 곳에 쓴다 — 그래서 둘보다 먼저, 처리 맨 앞에서 한 번 본다.
 * GPS 자동 보고는 서버가 만든 시각만 쓴다(시각을 안 넘긴다).
 * 못 잡는 것: 검사 줄의 내용이 맞는지(시각 판별은 `notTime` 한 줄) — 여기서는 자리와 순서만 본다.
 */
const src = readFileSync(join(__dirname, '../../src/socket/socketHandlers.ts'), 'utf8');

describe('단계 보고 시각 — 입구에서 본다', () => {
    const start = src.indexOf('orderOn("report-milestone"');
    const body = src.slice(start, src.indexOf('orderOn("undo-milestone"', start));

    it('시각 둘을 보고, 시각이 아니면 쓰기 전에 멈춘다', () => {
        expect(start).toBeGreaterThan(-1);
        const gate = body.search(/notTime\(data\.occurredAt\)\s*\|\|\s*notTime\(data\.predictedAt\)/);
        expect(gate).toBeGreaterThan(-1);
        expect(gate).toBeLessThan(body.indexOf('reportMilestone('));
        expect(gate).toBeLessThan(body.indexOf('bridgeMilestone('));
    });
});
