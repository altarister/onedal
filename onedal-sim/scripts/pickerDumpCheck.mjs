#!/usr/bin/env node
/**
 * 📏 **픽커 리스트 화면 위치 검사** (2026-09-14 · 카카오픽커_시뮬레이터.md §11-2 · 2단계 2-3)
 *
 * 원달앱 픽커 파서(`onedal-app/.../kakaopicker/KakaoPickerParser.kt`)는 글자뿐 아니라 **화면 위치**를 본다.
 * 시뮬레이터 화면은 CSS 로 그리고 폰은 픽셀로 읽으므로, 눈으로 맞추지 않고 **폰 화면 구조(uiautomator)로** 검사한다.
 *
 *   node onedal-sim/scripts/pickerDumpCheck.mjs                 # 연결된 폰의 지금 화면
 *   node onedal-sim/scripts/pickerDumpCheck.mjs <추출파일.xml>   # 저장된 파일 (실물 덤프로 검사기부터 검사한다)
 *   node onedal-sim/scripts/pickerDumpCheck.mjs --kotlin        # 카드 글자 목록을 Kotlin listOf(...) 로 찍는다
 *
 * 검사 (파서 상수와 같은 값 — 파서가 바뀌면 여기도 본다):
 *   ① 요금 글자(쉼표 든 숫자) 가운데가 가로 600px 이상        FARE_MIN_CENTER_X
 *   ② 「리스트 설정」 글자가 있고, 리스트 요금은 전부 그 아래  isListCardAnchor
 *   ③ 카드 글자마다 가장 가까운 요금이 60px 안                 CARD_BAND_PX · nearestAnchorIndex
 *   ④ 한 글자 덩어리에 요금과 km 가 함께 있지 않다             (웹뷰가 글자를 뭉쳤는가)
 *   ⑤ 리스트 화면에 「수락하기」가 없다                        isDetailResidue
 *   ⑥ 카드 글자가 한 덩어리씩이다 — 거리·태그·크기·지역이 붙어 오지 않는다 (parse 의 when 갈래가 덩어리 하나를 한 칸으로 읽는다)
 *   ⑦ 화면 밖 글자가 폰에 안 올라온다 — 높이 0 노드 (웹뷰는 화면 밖 카드를 화면 끝 한 줄에 겹쳐 넘기고, 원달앱은 그것을 카드 한 장으로 묶는다)
 *   ⑧ 카드에 아래 탭 글자(신규 · 내 오더)가 안 붙는다 — 원달앱은 이 낱말을 안 버려서 지역으로 읽는다
 * 마지막에 실물 덤프(09)와 나란히 줄 간격·카드 간격을 찍는다 — 판정은 위 검사가 하고, 숫자는 눈으로 본다.
 * 종료 코드: 검사 하나라도 실패하면 1.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REFERENCE = join(HERE, '../../log/카카오픽커/화면덤프/09_리스트_퀵7건.xml');

// 원달앱 KakaoPickerParser 의 값 그대로
const FARE_REGEX = /^\d{1,3}(,\d{3})+$/;
const FARE_MIN_CENTER_X = 600;
const CARD_BAND_PX = 60;
const LIST_HEADER_WORD = '리스트 설정';
// 🔴 원달앱 NOISE_WORDS 와 **똑같이** 둔다 — 검사기에만 낱말을 더하면 원달앱이 못 버리는 글자를 검사기가 봐준다 (2026-09-14 실제로 그랬다)
const NOISE_WORDS = new Set(['카드설정', '수요지도', '리스트 설정', '추천순', '높은 가격순', '낮은 가격순', '가까운순', '수락']);
/** 카드에 붙으면 안 되는 화면 붙박이 글자 — 원달앱이 안 버린다 (⑧) */
const TAB_WORDS = ['신규', '내 오더'];
// 파서가 낱낱이 알아보는 낱말 — 한 덩어리가 이것과 **똑같아야** 그 칸으로 읽힌다 (KakaoPickerParser TAG_WORDS · ITEM_SIZES)
const TAG_WORDS = ['퀵', '도보', '한차', '급송', '단거리', '예약', '준비 완료', '반나절', '승', '내일', '오늘', '서포트모드', '착불'];
const ITEM_SIZES = ['초소형', '소형', '중형', '대형', '특대형'];
const DISTANCE_EXACT = /^\d+(\.\d+)?km$|^\d+m$/;

/** 이 덩어리가 여러 칸이 뭉친 것이면 까닭, 아니면 null */
function mergedReason(text) {
    if (FARE_REGEX.test(text) || DISTANCE_EXACT.test(text) || NOISE_WORDS.has(text)) return null;
    if (TAG_WORDS.includes(text) || ITEM_SIZES.includes(text) || /^준비 \d+분$/.test(text) || /^\d{1,2}:\d{2}$/.test(text)) return null;
    if (/\d+(\.\d+)?km|\d+m(?![a-z])/.test(text)) return '거리가 다른 글자와 붙었다';
    // 한 글자 태그(승)는 지명에도 들어 있어 빼고, 두 글자 이상 태그·크기·준비만 본다
    const inside = [...TAG_WORDS.filter(w => w.length >= 2), ...ITEM_SIZES, '준비'].find(w => text.includes(w));
    if (inside || text.startsWith('퀵')) return `태그·크기 «${inside ?? '퀵'}» 가 다른 글자와 붙었다`;
    if ([...NOISE_WORDS].filter(w => text.includes(w)).length >= 1) return '화면 붙박이 낱말이 붙었다';
    return null;
}

/** 카드가 아닌 큰 틀(웹뷰 페이지 전체 등) — 이보다 높은 노드는 카드 글자로 안 본다 */
const CONTAINER_MIN_HEIGHT = 200;

const args = process.argv.slice(2);
const kotlin = args.includes('--kotlin');
const file = args.find(a => !a.startsWith('--'));

/** uiautomator 덤프 → 글자 노드 [{ text, x1, y1, x2, y2, cx, cy }] */
function readNodes(xml) {
    const nodes = [];
    for (const n of xml.match(/<node[^>]*\/?>/g) ?? []) {
        const text = (/ text="([^"]*)"/.exec(n)?.[1] || / content-desc="([^"]*)"/.exec(n)?.[1] || '').replace(/&#10;/g, ' ').trim();
        const b = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(n);
        if (!text || !b) continue;
        const [x1, y1, x2, y2] = b.slice(1).map(Number);
        nodes.push({ text, x1, y1, x2, y2, cx: Math.floor((x1 + x2) / 2), cy: Math.floor((y1 + y2) / 2) });
    }
    return nodes;
}

function dumpFromPhone() {
    const serial = process.env.ANDROID_SERIAL ? ['-s', process.env.ANDROID_SERIAL] : [];
    const out = '/tmp/pickerDumpCheck.xml';
    execFileSync('adb', [...serial, 'shell', 'uiautomator', 'dump', '/sdcard/pickerDumpCheck.xml'], { stdio: 'ignore' });
    execFileSync('adb', [...serial, 'pull', '/sdcard/pickerDumpCheck.xml', out], { stdio: 'ignore' });
    return out;
}

const median = xs => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
};

/** 검사 + 잰 값 */
function inspect(allNodes) {
    const fails = [];
    // ⑦ — 높이 0 노드는 화면 밖 글자다. 원달앱은 이것도 받으므로 실패로 적고, 나머지 검사·잰 값에서는 뺀다
    const hidden = allNodes.filter(n => n.y2 <= n.y1);
    if (hidden.length) fails.push(`⑦ 높이 0 인 글자 ${hidden.length}개가 폰에 올라온다 (예: «${hidden.slice(0, 3).map(n => n.text).join('» «')}») — 화면 밖 카드다. 원달앱이 y=${hidden[0].y1} 한 줄에서 카드 한 장으로 묶는다`);
    const nodes = allNodes.filter(n => n.y2 > n.y1);
    const header = nodes.find(n => n.text.includes(LIST_HEADER_WORD));
    const commaNumbers = nodes.filter(n => FARE_REGEX.test(n.text));

    // ①
    const leftFares = commaNumbers.filter(n => n.cx < FARE_MIN_CENTER_X);
    if (!commaNumbers.length) fails.push('① 요금 글자(쉼표 든 숫자)가 하나도 없다');
    leftFares.forEach(n => fails.push(`① 요금 «${n.text}» 가운데 x=${n.cx} < ${FARE_MIN_CENTER_X} — 원달앱이 요금으로 안 본다`));

    // ②
    if (!header) fails.push(`② 「${LIST_HEADER_WORD}」 글자가 없다 — 원달앱이 리스트로 못 알아보고, 리스트 카드와 오더카드를 못 가른다`);
    const anchors = commaNumbers.filter(n => n.cx >= FARE_MIN_CENTER_X);
    const listAnchors = header ? anchors.filter(n => n.cy > header.cy).sort((a, b) => a.cy - b.cy) : [];
    const orderCardAnchors = header ? anchors.filter(n => n.cy <= header.cy) : [];
    if (header && anchors.length && !listAnchors.length) fails.push(`② 요금이 전부 「${LIST_HEADER_WORD}」 줄 위에 있다 — 리스트 카드가 0장으로 읽힌다`);

    // ③ — 리스트 카드 구간(첫 요금 위 ~ 마지막 요금 아래) 안의 글자는 가장 가까운 요금이 60px 안이어야 한다
    const cards = listAnchors.map(a => ({ anchor: a, texts: [] }));
    if (listAnchors.length) {
        const pitch = listAnchors.length > 1 ? median(listAnchors.slice(1).map((a, i) => a.cy - listAnchors[i].cy)) : CARD_BAND_PX * 2;
        const top = listAnchors[0].cy - pitch / 2;
        const bottom = listAnchors[listAnchors.length - 1].cy + pitch / 2;
        const inBand = nodes
            .filter(n => n.cy > top && n.cy < bottom && (n.y2 - n.y1) < CONTAINER_MIN_HEIGHT)
            .sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
        for (const n of inBand) {
            let best = -1, bestDist = Infinity;
            listAnchors.forEach((a, i) => { const d = Math.abs(a.cy - n.cy); if (d < bestDist) { bestDist = d; best = i; } });
            if (bestDist <= CARD_BAND_PX) cards[best].texts.push(n);
            else if (!NOISE_WORDS.has(n.text)) fails.push(`③ «${n.text}» (y=${n.cy}) 가 어느 요금에서도 ${CARD_BAND_PX}px 밖(${bestDist}px) — 카드가 반 토막 난다`);
        }
    }

    // ④
    nodes.filter(n => /\d{1,3}(,\d{3})+/.test(n.text) && /km/.test(n.text))
        .forEach(n => fails.push(`④ «${n.text}» — 요금과 km 가 한 덩어리다 (웹뷰가 글자를 뭉쳤다)`));

    // ⑤
    if (nodes.some(n => n.text.includes('수락하기'))) fails.push('⑤ 리스트 화면에 「수락하기」가 있다 — 원달앱이 상세 잔상으로 보고 판을 버린다');

    // ⑥ — 카드 글자가 한 덩어리씩인가 (2026-09-14 첫 폰 판에서 「퀵준비 완료대형」 · 「2.0km광주초월읍」 이 왔다)
    //    원달앱은 덩어리 하나를 거리 · 크기 · 태그 · 지역 중 **하나로** 읽는다 — 뭉치면 전부 «지역»으로 샌다
    cards.forEach(c => c.texts.forEach(t => {
        const reason = mergedReason(t.text);
        if (reason) fails.push(`⑥ «${t.text}» — ${reason} (웹뷰가 한 줄의 글자를 뭉쳤다)`);
        // ⑧
        if (TAB_WORDS.includes(t.text)) fails.push(`⑧ «${t.text}» (y=${t.cy}) 가 요금 «${c.anchor.text}» (y=${c.anchor.cy}) 카드에 붙었다 — 원달앱이 지역으로 읽는다 (실물 09 는 마지막 요금과 탭 글자가 195px 떨어져 있다)`);
    }));

    // 잰 값 — 카드 안에서 요금보다 위(태그줄)·아래(지역줄) 글자의 가운데 차이
    const above = [], below = [];
    cards.forEach(c => c.texts.filter(t => t !== c.anchor && !FARE_REGEX.test(t.text)).forEach(t => (t.cy < c.anchor.cy ? above : below).push(c.anchor.cy - t.cy)));
    const stats = {
        cards: listAnchors.length,
        orderCards: orderCardAnchors.length,
        pitch: listAnchors.length > 1 ? median(listAnchors.slice(1).map((a, i) => a.cy - listAnchors[i].cy)) : null,
        headerToFirstFare: header && listAnchors.length ? listAnchors[0].cy - header.cy : null,
        tagRowAbove: median(above),
        regionRowBelow: median(below.map(d => -d)),
        fareCenterX: median(listAnchors.map(a => a.cx)),
    };
    return { fails, cards, stats };
}

// ── 실행 ──
const path = file ?? dumpFromPhone();
if (!existsSync(path)) { console.error(`파일이 없다: ${path}`); process.exit(2); }
const { fails, cards, stats } = inspect(readNodes(readFileSync(path, 'utf8')));

console.log(`📏 픽커 리스트 위치 검사 — ${file ? path : '연결된 폰의 지금 화면'}`);
if (kotlin) {
    cards.forEach(c => console.log(`listOf(${c.texts.map(t => JSON.stringify(t.text)).join(', ')}),`));
}

const ref = existsSync(REFERENCE) && path !== REFERENCE ? inspect(readNodes(readFileSync(REFERENCE, 'utf8'))).stats : null;
const rows = [
    ['리스트 카드 수', 'cards'],
    ['오더카드 요금 수(「리스트 설정」 위)', 'orderCards'],
    ['카드 간격 px', 'pitch'],
    ['「리스트 설정」→첫 요금 px', 'headerToFirstFare'],
    ['요금 가운데 → 태그줄 가운데 px (위)', 'tagRowAbove'],
    ['요금 가운데 → 지역줄 가운데 px (아래)', 'regionRowBelow'],
    ['요금 글자 가운데 x', 'fareCenterX'],
];
console.log(`\n${'잰 값'.padEnd(34)} ${'이 화면'.padStart(8)} ${ref ? '실물 09'.padStart(8) : ''}`);
rows.forEach(([label, key]) => console.log(`${label.padEnd(34)} ${String(stats[key] ?? '—').padStart(8)} ${ref ? String(ref[key] ?? '—').padStart(8) : ''}`));

if (fails.length) {
    console.log(`\n🔴 ${fails.length}건 실패`);
    fails.forEach(f => console.log(`  ${f}`));
    process.exit(1);
}
console.log('\n✅ 검사 ①~⑧ 통과');
