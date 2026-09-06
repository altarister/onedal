/**
 * generate_gyeonggi_intel_placeholders.js
 *
 * merged_map.geojson에서 경기도(41xxx) 지역을 읽어
 * scripts/data/intel/ 아래에 시/군 단위 JSON 플레이스홀더 파일을 생성합니다.
 *
 * 기존에 파일이 이미 있으면 덮어쓰지 않습니다 (--force 옵션으로 강제 덮어쓰기).
 *
 * 실행: node scripts/generate_gyeonggi_intel_placeholders.js [--force]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MERGED_MAP = path.join(__dirname, '../public/mapData/merged_map.geojson');
const INTEL_DIR  = path.join(__dirname, 'data/intel');
const FORCE      = process.argv.includes('--force');

// 시/군 코드 → 파일명 매핑 (가독성을 위해)
const CITY_NAMES = {
  '41110': 'suwon',       '41111': 'suwon_jangan', '41113': 'suwon_gwonseon',
  '41115': 'suwon_paldal','41117': 'suwon_yeongtong',
  '41130': 'seongnam',    '41131': 'seongnam_sujeong','41133': 'seongnam_jungwon','41135': 'seongnam_bundang',
  '41150': 'uijeongbu',   '41170': 'anyang',        '41171': 'anyang_manan',  '41173': 'anyang_dongan',
  '41190': 'bucheon',     '41210': 'gwangmyeong',   '41220': 'pyeongtaek',
  '41250': 'dongducheon', '41270': 'ansan',         '41271': 'ansan_sangnok', '41273': 'ansan_danwon',
  '41280': 'goyang',      '41281': 'goyang_deogyang','41283': 'goyang_ilsandong','41285': 'goyang_ilsanseo',
  '41290': 'gwacheon',    '41310': 'gueonggi_siheung', '41360': 'yongin',
  '41461': 'yongin_cheoin','41463': 'yongin_giheung','41465': 'yongin_suji',
  '41370': 'paju',        '41390': 'icheon',        '41410': 'anseong',
  '41430': 'hwaseong',    '41450': 'gwangju',       '41480': 'yangpyeong',
  '41500': 'icheon2',     '41550': 'pocheon',       '41570': 'yeoncheon',
  '41590': 'gapyeong',    '41610': 'gwangju2',      '41630': 'yangju',
  '41650': 'dongducheon2','41670': 'yeoju',         '41820': 'siheung',
  '41500': 'icheon',
};

// 시/군 코드 앞 5자리 추출 (예: 41111129 → 41111)
function getSigunCode(code) {
  // 8자리(법정동) 또는 10자리 코드에서 시군 코드 추출
  // 수원 장안구: 41111, 수원시 전체: 41110
  // 일반 시/군: 5자리
  return code.substring(0, 5);
}

// 지역 유형에 따른 기본 오더볼륨 추정
function guessOrderVolume(name, code) {
  // 읍 (코드 끝 2자리가 25, 30 등 - 8자리/5자리로 끝나는 읍면)
  if (name.endsWith('읍')) return '중';
  if (name.endsWith('면')) return '하';
  // 동 지역은 중간값
  return '중';
}

// 중요도 추정 (읍>동>면)
function guessImportance(name) {
  if (name.endsWith('읍')) return 3;
  if (name.endsWith('면')) return 2;
  return 3; // 동
}

function run() {
  console.log('🚀 경기도 Intel 플레이스홀더 생성 시작');

  if (!fs.existsSync(MERGED_MAP)) {
    console.error('❌ merged_map.geojson 파일을 찾을 수 없습니다:', MERGED_MAP);
    process.exit(1);
  }

  if (!fs.existsSync(INTEL_DIR)) {
    fs.mkdirSync(INTEL_DIR, { recursive: true });
  }

  const raw = fs.readFileSync(MERGED_MAP, 'utf8');
  const geojson = JSON.parse(raw);

  // 경기도 지역만 추출 (code가 41로 시작하는 것)
  const gyeonggi = geojson.features.filter(
    f => f.properties?.code?.startsWith('41') && f.properties?._isEmdGroup
  );

  console.log(`📍 경기도 대상 지역: ${gyeonggi.length}개`);

  // 시/군 코드별로 그룹핑
  const groups = {};
  for (const feature of gyeonggi) {
    const { code, name, SIG_KOR_NM } = feature.properties;
    const sigunCode = getSigunCode(code);
    if (!groups[sigunCode]) {
      groups[sigunCode] = { parentName: SIG_KOR_NM, regions: [] };
    }
    groups[sigunCode].regions.push({ code, name, SIG_KOR_NM });
  }

  console.log(`🗺️  시/군 그룹: ${Object.keys(groups).length}개`);

  let created = 0;
  let skipped = 0;

  for (const [sigunCode, { parentName, regions }] of Object.entries(groups)) {
    const citySlug = CITY_NAMES[sigunCode] || sigunCode;
    const filename = `${sigunCode}_${citySlug}.json`;
    const filepath = path.join(INTEL_DIR, filename);

    if (fs.existsSync(filepath) && !FORCE) {
      console.log(`⏭ 건너뜀 (이미 존재): ${filename}`);
      skipped++;
      continue;
    }

    // 플레이스홀더 데이터 생성
    const intel = {};
    for (const { code, name, SIG_KOR_NM } of regions) {
      intel[code] = {
        regionCode: code,
        name,
        parentName: SIG_KOR_NM,
        roads: [],
        orderVolume: guessOrderVolume(name, code),
        importance: guessImportance(name),
        landmarks: [],
        fieldTips: [
          `${name} 지역 인텔 데이터 추가 필요`,
          `주요 도로, 랜드마크, 배달 특이사항을 입력해주세요.`
        ]
      };
    }

    fs.writeFileSync(filepath, JSON.stringify(intel, null, 2), 'utf8');
    console.log(`✅ 생성: ${filename} (${regions.length}개 지역)`);
    created++;
  }

  console.log(`\n🎉 완료! 생성: ${created}개, 건너뜀: ${skipped}개`);
  console.log(`📁 결과물 위치: ${INTEL_DIR}`);
}

run();
