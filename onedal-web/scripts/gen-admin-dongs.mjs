#!/usr/bin/env node
/**
 * 🗺️ **행정동 → 법정동 표를 뽑는다** — shared/src/adminDongs.ts (생성 파일)
 * 누가: 에이전트 · 기사님
 * 언제: 행정안전부가 행정동 · 법정동 코드를 새로 낼 때(동이 나뉘거나 합쳐질 때)
 * 어디서: cd onedal-web && pnpm gen:admin-dongs <KIKmix 파일 경로>
 * 무엇을: 행정안전부 «행정기관(행정동) 및 관할구역(법정동)» 꾸러미(jscode*.zip)의 KIKmix 파일에서
 *         명부(dongCentroids)와 같은 시도 범위의 «행정동 → 관할 법정동» 표를 shared 에 굳힌다
 * 왜: 픽커 화면은 행정동 이름(위례동 · 광남1동 · 역삼1동)을 쓰고 명부는 법정동뿐이라, 목적지 안의 콜이 «경유 이탈»로 떨어졌다
 *
 * 🔴 원천 파일은 레포에 넣지 않는다 — 받은 곳 · 기준일은 산출물 머리에 적는다.
 *    받는 곳: https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardList.do?bbsId=BBSMSTR_000000000052 («jscode<기준일>.zip»)
 * 🔴 읽는 법: cp949 고정 너비 — 칸 안에 띄어쓰기가 있어(«성남시 수정구») 공백으로 자르지 않고 바이트 자리로 자른다. 말소된 줄은 뺀다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) { console.error('쓰는 법: pnpm gen:admin-dongs <KIKmix.YYYYMMDD 파일 경로>'); process.exit(1); }
const day = (basename(src).match(/(\d{8})/) ?? [])[1];
if (!day) { console.error(`🛑 파일 이름에서 기준일(YYYYMMDD)을 못 찾았습니다: ${basename(src)}`); process.exit(1); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'shared/src/adminDongs.ts');

/* 명부의 시군구 글자 — 시도 줄임(«서울 강남구») 또는 시군구 그대로(«성남시 수정구» · «광주시»). 명부와 같은 범위만 */
const centroids = readFileSync(join(root, 'shared/src/dongCentroids.ts'), 'utf8');
const SIGUNGU = new Set([...centroids.matchAll(/\["[^"]*","([^"]*)"/g)].map(m => m[1]));
const SIDO_SHORT = { '서울특별시': '서울', '인천광역시': '인천', '대전광역시': '대전' };
const sigunguOf = (sido, sgg) => {
    if (sido === '세종특별자치시') return '세종특별자치시';
    const s = SIDO_SHORT[sido] ? `${SIDO_SHORT[sido]} ${sgg}` : sgg;
    return SIGUNGU.has(s) ? s : null;
};

const dec = new TextDecoder('euc-kr');
const cut = (b, from, to) => dec.decode(b.subarray(from, to)).trim();
const lines = readFileSync(src);
const map = new Map();   // «시군구|행정동» → { sigungu, admin, legal:Set }
let start = 0;
for (let i = 0; i <= lines.length; i++) {
    if (i < lines.length && lines[i] !== 0x0a) continue;
    const b = lines.subarray(start, i > start && lines[i - 1] === 0x0d ? i - 1 : i); start = i + 1;
    if (b.length < 150 || !/^\d{10}/.test(dec.decode(b.subarray(0, 10)))) continue;
    if (cut(b, 155, 163)) continue;                          // 말소된 줄
    const admin = cut(b, 73, 103), legal = cut(b, 115, 145);
    if (!admin || !legal || !/(동|가)$/.test(admin)) continue; // 동 단위 행정동만(읍 · 면은 행정과 법정 이름이 같다 · 리는 명부 밖)
    const sigungu = sigunguOf(cut(b, 11, 41), cut(b, 42, 72));
    if (!sigungu) continue;                                   // 명부 범위 밖 시도
    const key = `${sigungu}|${admin}`;
    const row = map.get(key) ?? { sigungu, admin, legal: new Set() };
    row.legal.add(legal);
    map.set(key, row);
}
/* 행정동 이름과 관할 법정동이 같은 한 벌(«신흥동» → 신흥동)은 명부가 이미 안다 — 다른 것만 싣는다 */
const rows = [...map.values()]
    .filter(r => !(r.legal.size === 1 && r.legal.has(r.admin)))
    .sort((a, b) => a.sigungu.localeCompare(b.sigungu) || a.admin.localeCompare(b.admin));

const body = rows.map(r => `    [${JSON.stringify(r.sigungu)},${JSON.stringify(r.admin)},${JSON.stringify([...r.legal].sort())}],`).join('\n');
writeFileSync(OUT, `/**
 * 행정동 → 관할 법정동 ${rows.length}개 — 픽커 화면의 행정동 이름(위례동 · 광남1동 · 역삼1동)을 명부(법정동)에 잇는 표.
 *
 * 🔴 **생성 파일이다 — 손으로 고치지 않는다.** 원천: 행정안전부 «행정기관(행정동) 및 관할구역(법정동)» 꾸러미의 ${basename(src)}
 *    (기준일 ${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)} · https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardList.do?bbsId=BBSMSTR_000000000052).
 *    다시 뽑기: cd onedal-web && pnpm gen:admin-dongs <KIKmix 파일 경로>
 * 범위: 명부(dongCentroids)와 같은 시도 · 동 단위 행정동 · 말소 안 된 것 · 행정동과 법정동이 같은 이름 한 벌은 뺀다(명부가 이미 안다).
 * 줄: [시군구(명부 글자 그대로), 행정동, 관할 법정동들] — 같은 행정동 이름이 여러 시군구에 있으면 시군구가 가른다.
 */
export const ADMIN_DONGS: ReadonlyArray<readonly [sigungu: string, adminDong: string, legalDongs: readonly string[]]> = [
${body}
];
`);
console.log(`✅ ${basename(OUT)} — 행정동 ${rows.length}개 (원천 ${basename(src)} · 기준일 ${day})`);
