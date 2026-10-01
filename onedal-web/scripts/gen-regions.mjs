/**
 * 누가: onedal-04 (기사님 «상세의 필수 요소는 전체 주소» · 명부 원천 «가» = 서버 지도 산출물)
 * 언제: 서버 지도(merged_map)를 다시 만들어 shared/src/dongCentroids.ts 를 다시 뽑은 뒤
 * 어디서: onedal-web — `pnpm gen:regions`
 * 무엇을: shared DONG_CENTROIDS(시군구 → 읍면동 이름)와 shared ADMIN_DONGS(시군구 → 행정동)를 원달앱 명부 상수(RegionRegister.kt)로 굳힌다
 * 왜: 원달앱이 «전체 주소인가»·«이 글자가 지역인가»를 서버가 좌표를 찍는 지도 · 서버가 펴는 행정동과 같은 명부로 본다 — 같은지는 원달앱 AddressFormTest 두 시험(«명부는 서버 지도 산출물과 같다» · «행정동 명부는 shared 행정동 표와 같다»)이 문다
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
const packOf = (m) => [...m.keys()].sort().map(sgg => `${sgg}=${[...m.get(sgg)].sort().join(',')}`).join('|');
const data = packOf(bySgg);

/* 🗺️ 행정동 — shared ADMIN_DONGS(행정안전부 원천 생성 파일) · 그 시군구의 법정동과 같은 이름은 뺀다(명부가 이미 안다 — shared adminDongMatch 와 같은 규칙) */
const adminSrc = readFileSync(join(here, '../shared/src/adminDongs.ts'), 'utf8');
const adminRows = [...adminSrc.matchAll(/\["([^"]+)","([^"]+)",\[/g)];
if (adminRows.length === 0) { console.error('❌ adminDongs.ts 에서 줄을 못 읽었다'); process.exit(1); }
const adminBySgg = new Map();
for (const [, sgg, admin] of adminRows) {
    if (bySgg.get(sgg)?.has(admin)) continue;
    if (!adminBySgg.has(sgg)) adminBySgg.set(sgg, new Set());
    adminBySgg.get(sgg).add(admin);
}
const admin = packOf(adminBySgg);
const adminCount = [...adminBySgg.values()].reduce((n, s) => n + s.size, 0);

// JVM 상수 문자열은 65,535 바이트(한글 3바이트)가 한계다 — 넘으면 컴파일 에러로 만난다. 가까워지면 여기서 멈춘다(상수마다 따로 잰다)
const bytes = Buffer.byteLength(data, 'utf8');
if (bytes > 60000) { console.error(`❌ 명부가 ${bytes} 바이트 — JVM 상수 한계(65,535)에 가깝다. DATA 를 시도별로 쪼개라`); process.exit(1); }
const adminBytes = Buffer.byteLength(admin, 'utf8');
if (adminBytes > 60000) { console.error(`❌ 행정동 명부가 ${adminBytes} 바이트 — JVM 상수 한계(65,535)에 가깝다. ADMIN 을 시도별로 쪼개라`); process.exit(1); }

const out = join(here, '../../onedal-app/app/src/main/java/com/onedal/app/core/engine/RegionRegister.kt');
writeFileSync(out, `package com.onedal.app.core.engine

/**
 * 🗺️ **전체 주소 명부 — 생성 파일이다, 손으로 고치지 않는다** (\`cd onedal-web && pnpm gen:regions\`).
 * 원천은 둘 — 법정동은 서버 지도 산출물 \`onedal-web/shared/src/dongCentroids.ts\`(서버가 좌표를 찍는 지도와 같은 명부),
 * 행정동은 \`onedal-web/shared/src/adminDongs.ts\`(행정안전부 원천 · 서버가 도착 낱말을 펼 때 쓰는 표와 같은 것).
 * 시군구 ${bySgg.size}개 · 법정 읍면동 ${rows.length}개 · 행정동 ${adminCount}개(그 시군구 법정동과 같은 이름은 뺌). 꼴: «시군구=동,동|…» (광역시는 «서울 강남구», 도 아래는 «성남시 분당구»).
 */
object RegionRegister {
    const val DATA = "${data}"
    const val ADMIN = "${admin}"

    private fun unpack(s: String): Map<String, Set<String>> = s.split('|').associate { entry ->
        val (sgg, dongs) = entry.split('=', limit = 2)
        sgg to dongs.split(',').toSet()
    }

    /** 시군구 → 법정 읍면동 이름들(서버 지도와 같은 명부) */
    val bySgg: Map<String, Set<String>> by lazy { unpack(DATA) }

    /** 시군구 → 행정동 이름들 — 픽커 화면이 쓰는 이름(위례동 · 광남1동 · 처인구 중앙동). 법정동과 같은 이름은 없다 */
    val adminBySgg: Map<String, Set<String>> by lazy { unpack(ADMIN) }

    /** 시군구 → 법정동 ∪ 행정동 — «이 글자가 그 시군구의 동인가»를 묻는 곳(사진 줄 잇기 · 새 글자 가름)이 본다 */
    val withAdmin: Map<String, Set<String>> by lazy {
        (bySgg.keys + adminBySgg.keys).associateWith { (bySgg[it] ?: emptySet()) + (adminBySgg[it] ?: emptySet()) }
    }
}
`);
console.log(`✅ RegionRegister.kt — 시군구 ${bySgg.size} · 읍면동 ${rows.length} · ${bytes} 바이트 · 행정동 ${adminCount} · ${adminBytes} 바이트`);
