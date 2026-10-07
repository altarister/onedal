import { readFileSync } from 'fs';
import { join } from 'path';

/** 🩶 **지나간 정거장 원은 테두리가 투명하다** — 흰 테두리가 남으면 지나간 곳으로 눈이 간다 */
const PALETTE = join(__dirname, '../../../client-app/src/styles/callPalette.ts');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('🩶 지도 — 지나간 정거장', () => {
    /** 🔴 색은 아직 안 간 콜만 쓴다 — 색이 넷이라 지나간 콜이 색을 들고 있으면 5번째 콜과 겹친다 */
    /* 지나간 정거장 원은 흐린 회색 — 관제웹 pinnedRouteLayers.test «다녀온 정거장은 흐린 회색 원» 이 동작으로 문다 */

    it('🔴 지나간 정거장 테두리는 투명이다', () => {
        expect(codeOnly(readFileSync(PALETTE, 'utf8'))).toMatch(/visited \? 'transparent'/);
    });
});
