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

/**
 * 🧩 **앱이 지역명만 보기 때문에 목업과 달라지는 두 곳** (기사님 결정 2026-09-14 «나» · 7지점 두 번째 바퀴).
 *
 *   03 곤지암→관고 — 실제 상차지(곤지암성당)는 경로에서 2.15km 로 띠(2.73km) 안인데 **곤지암읍 동 중심점**은 5.36km →
 *                    목록에 안 들어가 «경로 밖». 목업은 상차지 좌표로 재지만 앱은 동 이름뿐이다 →
 *                    **동 경계가 띠에 걸치면 넣는다** (옛 계산 방식 · 앱은 넉넉하게 올린다 규칙 ⑤)
 *   05 사음동→중리동 — 사음동은 목적지 영역 안이라 목록에 있지만 순서표는 경로 영역 동만 → «경로 밖».
 *                    필터는 방향을 안 본다(같은 날 결정) → **목록에 든 동은 순서표에 다 넣고, 모르면 null**(앱: 순서 미상 → 통과)
 */
describe('🧩 앱은 지역명만 본다 — 동을 넉넉하게', () => {
    const { buildAppOrderKm } = require('../../src/state/filterManager');
    it('🔴 목록에 있는데 경로 위가 아닌 동도 순서표에 null 로 나간다 (05 사음동)', () => {
        const s = {
            myOrders: [{ id: 'o1', status: 'ORDER_CONFIRMED' }],
            detourOrderKm: { 신둔면: 10.0 },
            detourFlat: ['신둔면'],
            activeFilter: { destinationKeywords: ['신둔면', '사음동'] },
        } as any;
        const out = buildAppOrderKm(s);
        expect(out.신둔면).toBe(10.0);
        expect(out).toHaveProperty('사음동');
        expect(out.사음동).toBeNull();
    });
    it('🔴 경로 영역은 동 경계가 띠에 걸치면 넣는다 — 그물 목록에 더한다 (03 곤지암읍)', () => {
        const net = body(fm, 'function netKeywordsOf');
        expect(net).toMatch(/getDetourRegions\(/);
    });
});

/**
 * 🧭 **지나온 곳 빼기가 목적지 쪽 동을 먹었다** («7지점» 세 번째 바퀴 · 2026-09-14 20:49:47).
 *
 *   ① 서버가 부팅 때 지난 바퀴 끝 위치(신둔 · 20:33:52 · 16분 묵음)를 되살렸고, 01 KEEP 순간 그 위치로
 *      새 경로의 19.2km 까지를 «지나왔다»며 21 → 10곳으로 뺐다. 새 위치는 20:50:14 에야 왔다
 *      → 빼기는 **지금 위치(`originOf` · 묵었거나 집 주소로 대신한 것 아님)**로만 한다
 *   ② «경계가 걸치면 넣기»(#121 후속)가 그물이 이미 넣은 목적지 영역 동(관고동·사음동)에도 순서를 붙여 빼기에 걸렸다.
 *      목업 규칙: 목적지·마름모로 든 동은 «아직 안 간 곳»이라 진행도가 없다(`callNet.lineZoneOf` `onlyByLine`)
 *      → 걸쳐서 **새로 들어온 동에만** 순서를 붙인다
 */
describe('🧭 지나온 곳 빼기 — 지금 위치로, 경로 영역 동만', () => {
    it('🔴 빼기는 지금 위치로만 — 묵었거나 집 주소로 대신한 위치면 안 뺀다', () => {
        const trim = body(fm, 'export function applyTraveledTrim');
        expect(trim).toMatch(/originOf\(session\b/);
        expect(trim).toMatch(/isFallback/);
        expect(trim).not.toMatch(/const gps = session\.lastFix/);
    });
    it('🔴 걸쳐서 더한 순서는 그물이 이미 넣은 동에 안 붙는다', () => {
        const net = body(fm, 'function netKeywordsOf');
        expect(net).toMatch(/inNet\.has\(name\)/);
    });
});
