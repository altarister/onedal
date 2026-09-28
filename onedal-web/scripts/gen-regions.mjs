/**
 * 누가: onedal-04 (기사님 «상세의 필수 요소는 전체 주소» · 명부 원천 «가» = 서버 지도 산출물)
 * 언제: 서버 지도(merged_map)를 다시 만들어 shared/src/dongCentroids.ts 를 다시 뽑은 뒤
 * 어디서: onedal-web — `pnpm gen:regions`
 * 무엇을: shared DONG_CENTROIDS(시군구 → 읍면동 이름)를 원달앱 명부 상수(RegionRegister.kt)로 굳힌다
 * 왜: 원달앱이 «전체 주소인가»를 서버가 좌표를 찍는 지도와 같은 명부로 본다 — 두 파일이 같은지는 원달앱 AddressFormTest «명부는 서버 지도 산출물과 같다»가 문다
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../shared/src/dongCentroids.ts'), 'utf8');
const rows = [...src.matchAll(/\["([^"]+)","([^"]+)",[\d.]+,[\d.]+,"([^"]+)"\]/g)];
if (rows.length === 0) { console.error('❌ dongCentroids.ts 에서 줄을 못 읽었다'); process.exit(1); }

const bySgg = new Map();
for (const [, dong, sgg] of rows) {
    if (!bySgg.has(sgg)) bySgg.set(sgg, new Set());
    bySgg.get(sgg).add(dong);
}
const data = [...bySgg.keys()].sort()
    .map(sgg => `${sgg}=${[...bySgg.get(sgg)].sort().join(',')}`).join('|');

// JVM 상수 문자열은 65,535 바이트(한글 3바이트)가 한계다 — 넘으면 컴파일 에러로 만난다. 가까워지면 여기서 멈춘다
const bytes = Buffer.byteLength(data, 'utf8');
if (bytes > 60000) { console.error(`❌ 명부가 ${bytes} 바이트 — JVM 상수 한계(65,535)에 가깝다. DATA 를 시도별로 쪼개라`); process.exit(1); }

const out = join(here, '../../onedal-app/app/src/main/java/com/onedal/app/core/engine/RegionRegister.kt');
writeFileSync(out, `package com.onedal.app.core.engine

/**
 * 🗺️ **전체 주소 명부 — 생성 파일이다, 손으로 고치지 않는다** (\`cd onedal-web && pnpm gen:regions\`).
 * 원천은 서버 지도 산출물 \`onedal-web/shared/src/dongCentroids.ts\` 하나다 — 서버가 좌표를 찍는 지도와 같은 명부.
 * 시군구 ${bySgg.size}개 · 읍면동 ${rows.length}개. 꼴: «시군구=읍면동,읍면동|…» (광역시는 «서울 강남구», 도 아래는 «성남시 분당구»).
 */
object RegionRegister {
    const val DATA = "${data}"

    /** 시군구 → 읍면동 이름들 */
    val bySgg: Map<String, Set<String>> by lazy {
        DATA.split('|').associate { entry ->
            val (sgg, dongs) = entry.split('=', limit = 2)
            sgg to dongs.split(',').toSet()
        }
    }
}
`);
console.log(`✅ RegionRegister.kt — 시군구 ${bySgg.size} · 읍면동 ${rows.length} · ${bytes} 바이트`);
