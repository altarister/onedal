/**
 * regenerate_seoul_incheon_intel.js
 * 
 * V-World 코드 체계에 맞춰 서울/인천 인텔 플레이스홀더를 재생성합니다.
 * 기존 23xxx 인천 인텔 → 28xxx로 변환
 * 기존 11xxx 서울 인텔 → V-World 8자리 코드로 변환
 * 
 * merged_map.geojson에서 서울/인천 feature를 읽어 인텔 JSON을 생성합니다.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔴 onedal-map 은 out/ 을 읽는다 (2026-09-06) — 원본(map/map)은 안 건드린다.
const MERGED_MAP = process.env.ONEDAL_MAP_OUT
    ? path.join(process.env.ONEDAL_MAP_OUT, 'merged_map.geojson')
    : path.join(__dirname, '../out/merged_map.geojson');
const INTEL_DIR = path.join(__dirname, 'data/intel');

// V-World 코드 → 구 이름 (merged_map에서 자동 추출)
// 제외: 옹진군 (다리 없이 배로만 접근)
const EXCLUDED_CODES = new Set(['28720']);

const GU_ENG_MAP = {
  // 서울 25구
  '11110': 'jongno', '11140': 'jung', '11170': 'yongsan',
  '11200': 'seongdong', '11215': 'gwangjin', '11230': 'dongdaemun',
  '11260': 'jungnang', '11290': 'seongbuk', '11305': 'gangbuk',
  '11320': 'dobong', '11350': 'nowon', '11380': 'eunpyeong',
  '11410': 'seodaemun', '11440': 'mapo', '11470': 'yangcheon',
  '11500': 'gangseo', '11530': 'guro', '11545': 'geumcheon',
  '11560': 'yeongdeungpo', '11590': 'dongjak', '11620': 'gwanak',
  '11650': 'seocho', '11680': 'gangnam', '11710': 'songpa',
  '11740': 'gangdong',
  // 인천 9구/군
  '28110': 'jung', '28140': 'dong', '28177': 'michuhol',
  '28185': 'yeonsu', '28200': 'namdong', '28237': 'bupyeong',
  '28245': 'gyeyang', '28260': 'seo', '28710': 'ganghwa',
};

async function run() {
  const raw = JSON.parse(await fs.readFile(MERGED_MAP, 'utf8'));

  // 🔴 **광역시는 구 이름에 광역명이 없다** (onedal-map 2026-09-06 실측).
  //    SIG_KOR_NM 이 「서구」·「유성구」라 「대전」으로 조회하면 **0개**가 나온다.
  //    그래서 광역시는 intel 의 parentName(=「대전 서구」)이 **광역명을 담는 유일한 곳**이다.
  //    도(道)는 SIG 가 「청주시 흥덕구」라 이 문제가 없다 — 그래서 광역시만 만든다.
  const METRO = { '11': ['서울', 'seoul'], '28': ['인천', 'incheon'], '30': ['대전', 'daejeon'] };
  const features = raw.features.filter(f => {
    const code = f.properties?.code;
    if (!code) return false;
    if (!METRO[code.substring(0, 2)]) return false;
    const guCode = code.substring(0, 5);
    if (EXCLUDED_CODES.has(guCode)) return false;
    return true;
  });

  // 구 코드별로 분류
  const byGu = {};
  for (const f of features) {
    const code = f.properties.code;
    const guCode = code.substring(0, 5);
    if (!byGu[guCode]) byGu[guCode] = [];
    byGu[guCode].push(f);
  }

  // 기존 인텔 폴더 삭제 후 재생성
  const dirOf = (prefix) => path.join(INTEL_DIR, `${prefix}_${METRO[prefix][1]}`);
  
  // 기존 23_incheon 삭제
  const oldIncheonDir = path.join(INTEL_DIR, '23_incheon');
  try {
    await fs.rm(oldIncheonDir, { recursive: true });
    console.log('🗑️  기존 23_incheon 폴더 삭제');
  } catch { /* 없으면 무시 */ }

  // 코드 체계가 바뀌면 옛 파일이 남아 죽은 채로 쌓인다 — 광역시 폴더를 통째로 다시 만든다.
  for (const prefix of Object.keys(METRO)) {
    try { await fs.rm(dirOf(prefix), { recursive: true }); } catch { /* 없으면 무시 */ }
    await fs.mkdir(dirOf(prefix), { recursive: true });
  }

  let createdCount = 0;
  for (const [guCode, dongList] of Object.entries(byGu)) {
    const guName = dongList[0]?.properties?.SIG_KOR_NM || guCode;
    const prefix = guCode.substring(0, 2);
    const [cityName, cityEng] = METRO[prefix];
    const subDir = dirOf(prefix);

    const guNameEng = GU_ENG_MAP[guCode] || guCode;
    const fileName = `${guCode}_${cityEng}_${guNameEng}.json`;
    const filePath = path.join(subDir, fileName);

    const intel = {};
    for (const f of dongList) {
      const code = f.properties.code;
      const name = f.properties.EMD_KOR_NM || f.properties.name;
      intel[code] = {
        regionCode: code,
        name,
        parentName: `${cityName} ${guName}`,
        roads: [],
        orderVolume: '중',
        importance: 3,
        landmarks: [],
        fieldTips: [
          `${name} 지역 인텔 데이터 추가 필요`,
          '주요 도로, 랜드마크, 배달 특이사항을 입력해주세요.',
        ],
      };
    }

    await fs.writeFile(filePath, JSON.stringify(intel, null, 2), 'utf8');
    console.log(`✅ Created: ${fileName} (${dongList.length}개 동)`);
    createdCount++;
  }

  console.log(`\n🎉 완료! 신규 생성: ${createdCount}개 파일 (V-World 코드 체계)`);
}

run().catch(console.error);
