import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🕸️ **필터 목록은 그물 한 벌이 만든다 — 모든 때에** (전수표 1단계 · 기사님 확정 2026-09-14).
 *
 * «7지점 한 바퀴»에서 06 콜(중리동 → 초월읍)이 도착지 축을 통과했다. 이천 **시 경계**에서 10km 넓힌
 * 옛 계산(turf)이 초월읍을 담았다 — 그물이면 빠진다(중심 18km). 옛 계산이 돌던 때:
 *   · 서버 부팅 · 마지막 콜이 끝나 0건 → `rebuildDestinationKeywords` → `getCityRegionsWithRadius`
 *   · KEEP · 경로 재계산 · 재탐색 · 귀가콜 → `syncDetourFilter` → `recalculateDetourFilter`
 *   · 합짐 중 반경 변경 → 소켓이 옛 계산을 먼저 하고 그물이 덮음
 * 그물(`netKeywordsOf`)은 필터 값을 만질 때만 돌았다 (로그: 옛 29회 ↔ 그물 28회).
 *
 * 결정 (docs/기획/목업_이식_전수표.md):
 *   · 라인은 **KEEP 순간 경로로 얼린다** — 하차·취소·재탐색으로 다시 안 잰다 (#18)
 *   · 지나온 동은 **GPS 진행도**로 뺀다 — 그물 라인과 같은 셈(`progressAlongKm`) (#19)
 */
const read = (rel: string) => readFileSync(join(__dirname, '../../src', rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const fm = read('state/filterManager.ts');
const de = read('services/dispatchEngine.ts');
const sh = read('socket/socketHandlers.ts');
const body = (src: string, head: string) => {
    const i = src.indexOf(head);
    expect(i).toBeGreaterThan(-1);
    const next = src.slice(i + head.length).search(/\n(export )?(async )?(function|const) /);
    return src.slice(i, next < 0 ? undefined : i + head.length + next);
};

describe('🕸️ 필터 목록 — 그물 한 벌 (1단계)', () => {
    it('🔴 KEEP·경로 재계산(syncDetourFilter)이 옛 계산을 안 부르고 그물 한 곳을 부른다', () => {
        const b = body(de, 'export const syncDetourFilter');
        expect(b).toMatch(/rebuildNetFilter\(userId, io\)/);
        expect(b).not.toMatch(/recalculateDetourFilter\(|getDetourRegions\(|getCityRegionsWithRadius\(/);
    });

    it('🔴 부팅·콜 0건(rebuildDestinationKeywords)이 시 경계 버퍼를 안 쓰고 그물 한 곳을 부른다', () => {
        const b = body(de, 'export function rebuildDestinationKeywords');
        expect(b).toMatch(/rebuildNetFilter\(userId, io\)/);
        expect(b).not.toMatch(/getCityRegionsWithRadius\(/);
    });

    it('🔴 합짐 중 반경 변경도 옛 계산을 안 거친다 — 소켓·refreshDetourIfNeeded', () => {
        expect(body(fm, 'function refreshDetourIfNeeded')).not.toMatch(/recalculateDetourFilter\(/);
        expect(sh).not.toMatch(/recalculateDetourFilter\(/);
    });

    it('🔴 그물이 진행도를 함께 낸다 — 목록과 진행도가 한 벌 (netKeywordsOf 가 progressKm 을 돌려준다)', () => {
        expect(body(fm, 'function netKeywordsOf')).toMatch(/progressKm/);
    });

    it('🔴 라인은 KEEP 순간에 얼린다 — 경로 재계산(하차·취소)은 라인을 안 바꾼다', () => {
        const keep = body(de, 'export async function handleDecision');
        expect(keep).toMatch(/session\.filterLine = getActivePolyline\(session\)[\s\S]{0,40}syncDetourFilter\(userId, io\)/);
        expect(body(de, 'export async function recalculateActiveKakaoRoute')).not.toMatch(/filterLine\s*=/);
        /* 사이클이 끝나면 비운다 — 어제 경로가 다음 첫짐에 살아나지 않게 */
        expect(fm).toMatch(/session\.filterLine = null/);
    });

    it('🔴 지나온 동은 얼린 라인 위 GPS 진행도로 뺀다 — 그물과 같은 셈', () => {
        const trim = body(fm, 'export function applyTraveledTrim');
        expect(trim).toMatch(/filterLineOf\(session\)/);
        expect(trim).toMatch(/progressAlongKm\(/);
        expect(trim).not.toMatch(/progressAlongPolyline\(/);
    });
});

/**
 * 🗺️ **지도도 같은 것을 그린다** (전수표 #19 지도 · #60 · 2026-09-14).
 *
 * 서버는 얼린 라인 위 GPS 진행도로 지나온 동을 앱 목록에서 뺀다. 지도(`useCallNet`)는 그걸 몰라
 * **지나온 동을 계속 점으로 찍고**(`departed: false`), 라인 띠도 통째로 칠했다 — 화면과 판정이 다른 말을 한다.
 *   · 동 점 = 서버가 앱에 내린 지역명 목록과 겹치는 것만 (새 칸 없이 이미 오는 `destinationKeywords`)
 *   · 라인 띠 = 이동 중이면 내 진행도 뒤는 안 긋는다 (목업 `MapMockup.tsx:2575`)
 */
describe('🗺️ 지도 — 지나온 곳을 판정과 같게', () => {
    const client = (rel: string) => readFileSync(join(__dirname, '../../../client-app/src', rel), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    it('🔴 지도의 동 점은 서버 목록과 겹치는 것만 남긴다', () => {
        const hook = client('hooks/useCallNet.ts');
        expect(hook).toMatch(/serverKeywords/);
        expect(hook).toMatch(/\.pass\.filter\(/);
        expect(client('components/stage/StageView.tsx')).toMatch(/serverKeywords: filter\?\.destinationKeywords/);
    });
    it('🔴 이동 중이면 라인 띠를 내 진행도 뒤부터 긋지 않는다', () => {
        const stage = client('components/stage/StageView.tsx');
        expect(stage).toMatch(/trimKm:[\s\S]{0,120}DELIVERING[\s\S]{0,200}progressAlongKm\(/);
        expect(client('components/dashboard/PinnedRouteCanvas.tsx')).toMatch(/acc < \(?netOverlay\.trimKm/);
    });
});
