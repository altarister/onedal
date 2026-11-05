// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import { detailRecordOf } from '@onedal/shared';

/**
 * 📐 **비교 기준 — 같은 상세 글로 지금 서버가 읽는 콜 값** (계획서 A2).
 * 기본 콜로 옮기는 내내 이 값이 안 변해야 운행이 그대로다. 앱 파서 쪽은 원달앱 `CallSnapshotTest` 가 같은 문제지를 푼다.
 * 🔴 기대값은 지금 동작을 적은 것이다. 맞다는 뜻이 아니다.
 */
const SHEET = JSON.parse(readFileSync(join(__dirname, '../../../shared/src/network/callSnapshotCases.json'), 'utf8'));

describe('📐 콜 값 비교 기준 — 서버 상세 읽기', () => {
    it('문제지가 네 배차망을 모두 담는다', () => {
        const all = ['insung', 'hwamul24', 'kakaopicker', 'isflex'];
        expect(new Set(SHEET.server.map(c => c.network))).toEqual(new Set(all));
        expect(new Set(SHEET.app.map(c => c.network))).toEqual(new Set(all));
    });
    it.each(SHEET.server.map(c => [c.network, c.why, c]))('%s — %s', (_network, _why, c) => {
        expect(JSON.parse(JSON.stringify(detailRecordOf(c.network, c.rawText)))).toEqual(c.expect);
    });
});
