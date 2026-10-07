/**
 * 🗺️ **지도 읽기 · 이름** — 부팅 때 전국 읍면동 지도를 한 번 읽어 들고(모듈 상태는 여기에만) · 시 별칭 · 지명 사전 · 함정 낱말 · 고를 시 목록 · 좌표 → 동 이름.
 * 🔴 이 파일은 지역 셈(geoRegions) · 기점 · 도착(geoMotion)을 가져오지 않는다 — 둘이 이 파일을 읽는다.
 * 바깥 일을 하는 함수: initGeoService(지도 파일 읽기 · 로그) (나머지는 들고 있는 지도 자료와 받은 값만 본다)
 */
import fs from 'fs';
import path from 'path';
import { sidoOf, sggList } from '@onedal/shared';
import bbox from '@turf/bbox';
import booleanIntersects from '@turf/boolean-intersects';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import buffer from '@turf/buffer';
import centroid from '@turf/centroid';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import simplify from '@turf/simplify';
import union from '@turf/union';
import { featureCollection, lineString, point } from '@turf/helpers';
import type { FeatureCollection, Polygon, MultiPolygon, Feature } from 'geojson';
import { slog } from '../utils/fileLogger';

/**
 * 배럴(`@turf/turf`) 대신 **쓰는 것만** 가져온다.
 *
 * 배럴은 클러스터링·보간 등 이 프로젝트가 안 쓰는 모듈까지 전부 끌고 오는데,
 * 그 중 하나가 node_modules 안에 TypeScript 원본을 담고 있어 **jest 가 파싱 단계에서 죽었다.**
 * (`tsx`·`tsc` 는 멀쩡히 도는데 jest 만 못 읽어서 지리 테스트를 못 쓰고 있었다)
 */

export const turf = {
    bbox, booleanIntersects, booleanPointInPolygon, buffer, centroid,
    featureCollection, lineString, nearestPointOnLine, point, simplify, union,
};

export let mergedMapFeatureCollection: FeatureCollection<Polygon | MultiPolygon> & { features: Array<Feature<Polygon | MultiPolygon> & { bbox?: number[] }> } | null = null;

export function initGeoService() {
    try {
        const filePath = path.join(__dirname, '../../mapData/merged_map.geojson');
        const data = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(data);
        if (parsed && parsed.type === 'FeatureCollection') {
            // [최적화] 서버 로딩 시점에 전국 읍면동 폴리곤의 Bounding Box를 미리 계산하여 메모리에 저장
            parsed.features.forEach((f: any) => {
                f.bbox = turf.bbox(f);
                // 중심점도 여기서 한 번만 구한다. 요청마다 1239개를 다시 계산하면
                // 그것만으로 100ms 가 나간다
                f.centroid = turf.centroid(f);
                /**
                 * 버퍼링용 **간소화 사본** (약 200m 오차).
                 *
                 * `turf.buffer` 는 꼭짓점 수에 비례해 비싸고, **반경이 작을수록 더 비싸다** —
                 * 작은 버퍼는 원본의 해안선 같은 디테일을 그대로 물고 나오기 때문이다.
                 * 실측: `용인 1km` 42개 동 버퍼링에 **1415ms**, 10km 는 530ms.
                 *
                 * 필터의 최소 단위가 읍/면/동이라 200m 오차는 결과를 바꾸지 않는다.
                 * 간소화 후: 같은 연산이 **13ms** 다 (100배). 경유 계산이 이미 쓰던 수법이다.
                 */
                try { f.simplified = turf.simplify(f, { tolerance: 0.002, highQuality: false }); }
                catch { f.simplified = f; }
            });
            mergedMapFeatureCollection = parsed;
            adminNameSet = null;   // 지도가 다시 로드되면 지명 사전도 다시 만든다
            districtNameCount = null;   // 구 이름 유일성도 같은 이유로 다시 센다
            slog('부팅', `🗺️ [GeoService] 전국 자치구/읍면동 폴리곤 로드 성공 (총 ${parsed.features?.length || 0}개 방어구역)`);
        } else {
            console.warn(`🗺️ [GeoService] merged_map.geojson 형식이 올바른 FeatureCollection이 아닙니다.`);
        }
    } catch (e) {
        console.error(`🗺️ [GeoService] GeoJSON 지도 데이터 로드 실패 (mapData/merged_map.geojson 확인 요망):`, e);
    }
}

/**
 * 시/구 이름 하나에서 **앱이 도착지 텍스트에서 찾아볼 별칭들**을 만든다.
 *
 * 앱의 2단계 필터는 "시가 맞고 **동도** 맞아야 통과"로 판정한다
 * (`InsungParser.kt` 의 `hasCityAlias && hasDongMatch`).
 * 배차망이 `파주시` 로 쓸지 `파주` 로 쓸지 모르니 둘 다 넣는다.
 *
 * 🔴 별칭이 빈 배열이면 앱의 2단계 필터가 `isNotEmpty()` 조건에 걸려 아예 돌지 않고,
 *    동 이름 하나만 보고 판정한다.
 *
 *    수도권 안에만 **같은 이름의 동이 97개** 있다. 그러면 파주 필터에
 *    `신촌동`(서울 서대문구 · 성남 수정구에도 있다) · `당하동`(인천 서구) ·
 *    `군내면`(포천시) 콜이 그대로 통과한다. 경유 밖인데 꿀콜로 보인다.
 */
export function cityAliases(parentName: string): string[] {
    const out = new Set<string>([parentName]);

    // 예: 광주시 → 광주, 송파구 → 송파
    if (/[시군구]$/.test(parentName)) out.add(parentName.slice(0, -1));

    /**
     * 🏙️ **구 단독형** — 배차망 리스트가 그렇게 준다 (기사님 지적).
     *
     * `성남시 분당구` 의 별칭이 `성남시 분당구`·`성남시 분당` 뿐이라, 리스트 카드에
     * **`분당구`** 라고만 뜨는 콜은 **어느 쪽도 안 맞았다.** 실측에서 합짐 국면의
     * 구 단위 콜이 전멸했다 — `분당구`·`동작구`·`단원구`·`강동구` 전부 ❌.
     *
     * 첫짐(파주 목적지)은 동·읍·면뿐이라 안 걸렸다. **합짐은 경로가 서울·성남을
     * 지나므로** 그 지역 콜을 통째로 놓쳤다.
     *
     * ⚠️ **이름이 겹치는 구는 넣지 않는다.** `중구` 는 서울에도 인천에도 있어서,
     *    단독형을 실으면 서울 중구를 지날 때 인천 중구 콜을 잡는다.
     *    잘못 잡으면 배차망 취소 횟수(10회)를 쓴다 — *"안 잡는 것과 잡고 나서
     *    버리는 것은 전혀 다르다"* (`RouteOrderFilter`).
     *    판단은 **지도에서 센다** — 손으로 적은 목록을 두지 않는다 (규칙 ⑤-4 ②).
     */
    const tail = parentName.split(' ').pop() ?? '';
    if (tail !== parentName && /구$/.test(tail) && isUniqueDistrictName(tail)) {
        out.add(tail);
        out.add(tail.slice(0, -1));   // 분당구 → 분당 (리스트가 줄여 쓰는 경우)
    }

    // 특수 룰: 광주광역시와 헷갈리지 않도록 경기 광주는 앞에 도를 붙인 표기도 받는다
    if (parentName === '광주시') {
        out.add('경기 광주');
        out.add('경기 광주시');
        out.add('경광주');
    }
    return Array.from(out);
}

/**
 * 🏙️ **이 구 이름이 지도 안에서 유일한가** — 부팅 때 한 번 세어 캐시한다.
 *
 * 겹치면(서울 중구 / 인천 중구) 단독형을 못 쓴다. 목록을 상수로 적어 두면
 * 지도가 넓어질 때 조용히 틀리므로 **데이터에서 파생시킨다** (규칙 ③).
 */
let districtNameCount: Map<string, number> | null = null;
export function isUniqueDistrictName(district: string): boolean {
    /**
     * 🔴 **방위 이름은 지도를 보기 전에 거른다**.
     *
     * 지도(`merged_map.geojson`)는 **수도권만** 담는다. 그래서 세어 보면 `서구`(인천)가
     * "유일"로 나오는데, 실제로는 대전·광주·부산·대구에도 있다 —
     * **없는 데이터를 근거로 유일하다고 판정하는 것**이다.
     *
     * 이름 자체가 답을 갖고 있다: `구` 를 떼고 **한 글자**면 방위·중심을 가리키는 말이지
     * 고유명이 아니다 (`서`·`동`·`남`·`북`·`중`). 손으로 목록을 적지 않아도 갈린다.
     */
    if (district.length <= 2) return false;

    if (!districtNameCount) {
        districtNameCount = new Map();
        const parents = new Set<string>();
        for (const f of mergedMapFeatureCollection?.features ?? []) {
            const props: any = f.properties || {};
            parents.add(props.intel?.parentName || props.SIG_KOR_NM || '');
        }
        for (const p of parents) {
            const t = p.split(' ').pop() ?? '';
            if (t && t !== p && /구$/.test(t)) districtNameCount.set(t, (districtNameCount.get(t) ?? 0) + 1);
        }
    }
    return districtNameCount.get(district) === 1;
}

/**
 * [첫짐 전용] 선택한 도시의 읍/면/동을 radiusKm 만큼 확장하고,
 * 그 안에 **중심점이 들어오는** 전국 읍/면/동을 수집합니다.
 * (BBox 고속 필터링 + Set 중복제거 적용)
 *
 * ⚠️ «걸치면»이 아니라 «중심점이 들어오면»이다. 아래 판정부의 주석 참고.
 */
/**
 * 🧪 **지금 지도가 담고 있는 것** — 판 점검(`/api/sim/preflight`)이 읽는다.
 * 「1,968개」인지 「1,239개」인지가 충청 확장이 실렸는지를 한 줄로 말해 준다.
 */
export function mapCoverage(): { features: number; sido: string[] } {
    const fs = mergedMapFeatureCollection?.features ?? [];
    const sido = new Set<string>();
    for (const f of fs) sido.add(String((f.properties as any)?.code ?? '').slice(0, 2));
    sido.delete('');
    return { features: fs.length, sido: [...sido].sort() };
}

/** 🗺️ 지금 지도에 실린 지역 수 — 0 이면 지도 자료를 아직 못 읽었다(내일 상차 목록의 열쇠에 든다) */
export function mapFeatureCount(): number {
    return mergedMapFeatureCollection?.features?.length ?? 0;
}

// ─────────────────────────────────────────────────────────────
// 🗺️ 전국 지명 사전 — 키워드 트랩 계산 (regionMatch 사전 확장)
//
// "남동"(광주 인근 동)이 "인천 남동구" 에 contains 로 걸려 인천행이 복귀행 필터를
// 통과한 사고의 원천 수리다. 동 이름(EMD_KOR_NM)과 상위 지명 낱말(parentName)을
// 사전으로 모아, 키워드로 시작하는 **더 긴 다른 지명**을 트랩으로 계산한다.
// 트랩은 필터 파생 때 함께 만들어 피기백(keywordTraps)에 실린다.
// ─────────────────────────────────────────────────────────────
let adminNameSet: Set<string> | null = null;
function allAdminNames(): Set<string> {
    if (adminNameSet) return adminNameSet;
    const s = new Set<string>();
    for (const f of mergedMapFeatureCollection?.features ?? []) {
        const props: any = f.properties || {};
        if (props.EMD_KOR_NM) s.add(String(props.EMD_KOR_NM));
        const parent = props.intel?.parentName || props.SIG_KOR_NM;
        if (parent) for (const tok of String(parent).split(' ')) if (tok) s.add(tok);
    }
    /**
     * 🔴 **빈 사전은 «답»이 아니다 — 캐시하지 않는다** (규칙 ④).
     *    지도가 아직 안 올라왔거나 로드가 실패했을 뿐이다. 빈 것을 굳히면 그 서버가 사는 내내
     *    트랩이 비고, 앱이 **앞에 붙는 지명을 못 봐** 「신도림동」이 「도림동」으로 통과한다.
     */
    if (s.size) adminNameSet = s;
    return s;
}

/** 키워드마다 "그 이름으로 시작하는 더 긴 지명"(트랩) — 없는 키워드는 키를 만들지 않는다 */
export function trapsForKeywords(keywords: string[]): Record<string, string[]> {
    const names = allAdminNames();
    const out: Record<string, string[]> = {};
    for (const k of keywords) {
        if (!k) continue;
        const traps: string[] = [];
        /* 🔴 앞뒤 둘 다 담는다 — 뒤는 「남동」→「남동구」, 앞은 「도림동」→「신도림동」.
              앞을 안 담으면 앱이 앞을 못 봐 「신도림동」이 「도림동」으로 통과한다 */
        for (const n of names) if (n !== k && (n.startsWith(k) || n.endsWith(k))) traps.push(n);
        if (traps.length) out[k] = traps;
    }
    return out;
}

/**
 * 도착 목표로 고를 수 있는 **시/군 목록**을 지도 데이터에서 만든다.
 *
 * 🔴 목록을 손으로 적지 않는다.
 *    기사님: *"7개를 임의로 내가 넣어 둔 거 같아. 시나 혹은 도 정도의 범위로 가져와야 할 듯."*
 *
 *    저장값(`파주`)과 선택지(`파주시`)가 안 맞으면 브라우저가 조용히 **첫 항목**을 보여 준다 —
 *    화면은 `용인시`인데 실제 필터는 파주가 된다 (서버 검색은 `includes` 라 `파주` 로도 잘 돌아 아무도 모른다).
 *
 * ══ 어떤 단위로 묶는가 ══
 *
 * 지도 데이터의 `parentName` 은 표기가 두 갈래다.
 *   `서울 강남구` · `인천 중구` · `대전 유성구`   — 특별시 · 광역시는 **구**까지 적혀 있다
 *   `파주시` · `수원시 권선구`                     — 도의 시 · 군
 *
 * 🔴 **시·도는 손으로 적지 않는다** — 동 사전(`sidoOf`)이 답한다. «서울·인천만 광역시»로
 *    적어 두면 대전이 경기도의 시처럼 줄에 선다 (기사님 지적).
 *
 * 특별시 · 광역시는 **구를 펼치고 맨 앞에 시 전체**를 둔다 (`서울` · `서울 강남구` · …).
 * 기사님이 강남구만 노리실 수도, 서울 전체로 두실 수도 있어야 한다.
 * 도는 시 · 군까지만 낸다 (`수원시` 면 그 안 4개 구 전부).
 *
 * 값은 지도의 `parentName` 그대로다 — `cityCenter` 가 «서울»은 접두로 모아 평균을 내고
 * «서울 강남구»는 정확히 하나를 찾는다. 「중구」처럼 두 시에 다 있는 이름은 홀로 쓰지 않는다.
 */
export function getSelectableCities(): { sido: string; cities: string[] }[] {
    if (!mergedMapFeatureCollection?.features) return [];

    const bySido = new Map<string, Set<string>>();
    for (const f of mergedMapFeatureCollection.features) {
        /* 🔴 이름은 **두 칸에서** 읽는다 — `intel` 이 없는 동이 562개 있고(세종 · 충북 · 충남 ·
           화성시 동탄구) 폴리곤은 멀쩡히 있다. 한 칸만 보면 그 지역을 통째로 못 고른다.
           지도의 다른 곳(`getCityRegionsWithRadius`)이 이미 같은 폴백을 쓴다 */
        const props = f.properties as any;
        const parent = (props?.intel?.parentName || props?.SIG_KOR_NM) as string | undefined;
        if (!parent) continue;

        const head = parent.split(' ')[0];
        const sido = sidoOf(parent);
        if (!sido) continue;   // 사전이 모르는 이름은 지어내지 않는다 (규칙 ④)

        if (!bySido.has(sido)) bySido.set(sido, new Set());
        /* 특별시 · 광역시는 첫 낱말이 곧 시·도 이름이다 — 그 아래를 구로 고른다.
           도는 첫 낱말이 이미 시 · 군 이름이라 거기서 멈춘다 */
        bySido.get(sido)!.add(head === sido ? parent : head);
    }

    /* 🏙️ 특별시 · 광역시 먼저, 그 다음 도 — 각각 가나다순.
       시 전체(`서울`)를 구들보다 앞에 세운다 */
    return Array.from(bySido.keys())
        .sort((a, b) => a.localeCompare(b, 'ko'))
        .sort((a, b) => Number(isProvince(a)) - Number(isProvince(b)))
        .map(sido => {
            /* 🔴 줄 세우는 기준은 **화면에 보이는 이름**이다 — 지도 표기가 갈려
               «인천 강화군»과 «옹진군»이 섞여 있어, 적힌 그대로 세우면 옹진군만 딴 자리에 선다 */
            const bare = (v: string) => v.startsWith(`${sido} `) ? v.slice(sido.length + 1) : v;
            const cities = Array.from(bySido.get(sido)!)
                .sort((a, b) => bare(a).localeCompare(bare(b), 'ko'));
            return { sido, cities: isProvince(sido) ? cities : [sido, ...cities] };
        });
}

/** 도인가 — 그 시·도 이름이 시·군·구 목록에 그대로 나오지 않으면 도다 (`경기` · `충남`) */
function isProvince(sido: string): boolean {
    return !sggList(sido).some(sgg => sgg.split(' ')[0] === sido);
}
