/**
 * 🧩 **배차망 화면에 나온 낱말을 갈래로 가른다** — 감사(`db-parse`)와 사전 초안(`db-dict`)이 함께 쓴다.
 *
 * 🔴 **두 벌로 두지 않는다.** 같은 낱말을 한쪽은 «지역», 한쪽은 «미분류» 로 세면
 *    «감사는 0 이라는데 사전은 셋» 처럼 갈라진다 (루트 `CLAUDE.md` 「짝이 있는 것」).
 *
 * 🔴 **어림잡지 않는다** — 지역인지는 **지도 명부**(`server/mapData/merged_map.geojson`)에 물어본다.
 *    «아는 것 / 모르는 것» 둘로만 가르면 지역 이름까지 «모르는 글자» 로 떠서, 사람이
 *    «이건 지역이겠지» 하고 넘기게 되고 그러면 **진짜 모르는 것이 묻힌다** (기사님 지시).
 *
 * 🔴 **미분류가 0 이 되는 것이 «100% 파싱» 이다** (기사님 지시).
 */
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

/** 배차망 이름 → 서버 사전 파일 이름 (픽커만 파일명이 다르다) */
export const dictFileOf = (target) => `keywords_${target === 'kakaopicker' ? 'picker' : target}.json`;

/**
 * 📖 서버 사전을 읽는다 — 배지·화면 글자처럼 «이미 아는 낱말».
 * @returns dict 원본 · 낱말 목록 · 빠른 조회 집합 · 여러 낱말짜리를 먼저 떼는 함수
 */
export function loadDict(ROOT, target) {
    const dictPath = join(ROOT, 'server/config', dictFileOf(target));
    let dict = {};
    let dictWords = [];
    if (existsSync(dictPath)) {
        dict = JSON.parse(readFileSync(dictPath, 'utf8'));
        dictWords = Object.values(dict).filter(Array.isArray).flat().filter((w) => typeof w === 'string');
    }
    /** 여러 낱말짜리를 먼저 뗀다 — «최종 수익» 을 조각내면 «최종»·«수익» 이 미분류로 잘못 뜬다 */
    const phrases = dictWords.filter((w) => w.includes(' ')).sort((a, b) => b.length - a.length);
    const stripPhrases = (t) => phrases.reduce((acc, p) => acc.split(p).join(' '), t);
    return { dict, dictPath, dictWords, dictSet: new Set(dictWords), stripPhrases, exists: existsSync(dictPath) };
}

/**
 * 🗺️ **지도 명부로 지역을 가린다.**
 * 명부는 «서현동» 처럼 온전한 꼴인데 카드는 «서현1» 로 줄여 주므로,
 * 양쪽에서 끝의 «동·읍·면·리·가·구·시·군» 과 숫자를 떼고 맞춘다.
 *
 * ⚠️ 명부에는 **법정동만** 있다 (V-World `LT_C_ADEMD_INFO`). 픽커는 행정동을 쓰므로
 *    «위례»·«해양»·«서농» 처럼 행정동만 있는 이름은 여기서 안 걸린다.
 */
export const bare = (s) => s.replace(/(동|읍|면|리|가|구|시|군)$/, '').replace(/\d+$/, '');

export function loadRegions(ROOT) {
    const MAP_PATH = join(ROOT, 'server/mapData/merged_map.geojson');
    const regionNames = new Set();
    if (existsSync(MAP_PATH)) {
        const geo = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
        for (const f of geo.features || []) {
            const pr = f.properties || {};
            for (const key of ['EMD_KOR_NM', 'name']) {
                const v = pr[key];
                if (typeof v === 'string' && v.trim()) { regionNames.add(v.trim()); regionNames.add(bare(v.trim())); }
            }
            const sig = pr.SIG_KOR_NM;
            if (typeof sig === 'string') for (const part of sig.split(/\s+/)) { regionNames.add(part); regionNames.add(bare(part)); }
        }
    }
    return { regionNames, isRegion: (w) => regionNames.has(w) || regionNames.has(bare(w)) };
}

/**
 * 🏪 가게·건물 이름의 모양 — «…점» · «[용인둔전]» · «맘스터치-성남점» · «…로12번길» · 여섯 글자 넘는 이름.
 *
 * 🔴 **사전의 `shopWords` 는 도구에서만 쓴다 — 앱에는 넣지 않는다.**
 *    가게 이름은 도보 콜의 **진짜 픽업지**라 앱은 그것을 지역 칸에 담아야 맞다.
 *    이 칸은 «미분류» 와 «가게·건물» 을 가리는 용도일 뿐이다
 *    (그래서 `pickerDictPaired` 의 짝 검사 목록에도 넣지 않는다).
 */
export const isPlace = (w) => /점$|[[\]]|-|로\d+번길$|아파트$|빌라$|타워$|센터$/.test(w) || w.length >= 6;

/**
 * 🔢 **글자가 아니라 «값»인 것** — 요금·거리·시각·남은 시간·예약 날짜.
 * 배차망이 달라도 모양이 같아서 여기 모아 둔다. 새 배차망에서 다른 꼴이 나오면 여기에 더한다.
 */
const VALUE_SHAPES = [
    /^[\d,.]+$/,                              // 요금·숫자
    /^\d+(\.\d+)?(km|m)$/,                    // 거리
    /^\d{1,2}:\d{2}$/,                        // 시각
    /^\d+분( 내)?$/,                           // 남은 시간
    /^\d{1,2}\/\d{1,2}\([월화수목금토일]\)$/,    // 예약 날짜
];
export const isValueShape = (t) => VALUE_SHAPES.some((re) => re.test(t));

/**
 * 🧮 **장부의 화면 원문에서 낱말을 모아 갈래로 센다.**
 *
 * 이미 어느 칸에 담긴 낱말(상차·도착·배지·크기)과 사전 낱말은 빼고, **남은 것**만 본다 —
 * 남은 것이 «앱이 어디에도 못 담은 글자» 이기 때문이다.
 *
 * @returns { 지역, '가게·건물', 미분류 } 각각 `Map<낱말, 나온 횟수>`, 그리고 낱말이 나온 원문 보기
 */
export function collectWords(rows, { dictWords, dictSet, stripPhrases, isRegion }) {
    const kinds = { 지역: new Map(), '가게·건물': new Map(), 미분류: new Map() };
    const samples = new Map();   // 낱말 → 그 낱말이 든 원문 한 줄 (사람이 정체를 가릴 때 본다)
    for (const r of rows) {
        if (!r.rawText) continue;
        const taken = new Set(
            `${r.pickup || ''} ${r.dropoff || ''} ${r.tagsText || ''} ${r.itemSize || ''}`.split(/\s+/).filter(Boolean),
        );
        for (const tok of stripPhrases(r.rawText).split(/\s+/)) {
            const t = tok.trim().replace(/,$/, '');
            if (!t || taken.has(t) || dictSet.has(t)) continue;
            if (isValueShape(t)) continue;
            if (dictWords.some((w) => w.length >= 2 && t.includes(w))) continue;   // 사전 낱말이 든 덩어리
            const kind = isRegion(t) ? '지역' : isPlace(t) ? '가게·건물' : '미분류';
            kinds[kind].set(t, (kinds[kind].get(t) || 0) + 1);
            if (!samples.has(t)) samples.set(t, r.rawText);
        }
    }
    return { kinds, samples };
}
