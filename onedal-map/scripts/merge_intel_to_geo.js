import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INTEL_DIR = path.join(__dirname, 'data/intel');
const OUTPUT_MAP_PATH = path.join(__dirname, '../public/mapData/merged_map.geojson');

/** 서브폴더까지 재귀적으로 JSON 파일 경로 목록을 반환 */
async function collectJsonFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectJsonFiles(fullPath));
    } else if (entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }
  return files;
}

async function run() {
  console.log('🚀 [GeoJSON-Intel Build] 데이터 매핑 스크립트 시작');

  const intelDB = {};
  const globalMnemonics = [];

  try {
    const intelFiles = await collectJsonFiles(INTEL_DIR);
    for (const filePath of intelFiles) {
      const data = JSON.parse(await fs.readFile(filePath, 'utf8'));

      if (data._meta && data._meta.mnemonics) {
        globalMnemonics.push(...data._meta.mnemonics);
        delete data._meta;
      }

      Object.assign(intelDB, data);
      const rel = path.relative(INTEL_DIR, filePath);
      console.log(`✅ Loaded Intel Data: ${rel} (${Object.keys(data).length} regions)`);
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('⚠️ 인텔 데이터 디렉터리가 없습니다. 빈 폴더를 생성합니다.');
      await fs.mkdir(INTEL_DIR, { recursive: true });
    } else {
      console.error('❌ Failed to read intel directory:', err.message);
    }
  }

  try {
    let geoJsonRaw = await fs.readFile(OUTPUT_MAP_PATH, 'utf8');
    const geoJson = JSON.parse(geoJsonRaw);

    // [필터링] 알루님 지도 전략: "우리는 시내권(법정동)과 읍/면(상위 8자리)만 취급한다. 잡다한 시골 '리'(10자리)는 버린다!"
    // 이미 맵 원본에 8자리 둥근 읍/면 폴리곤이 들어있으므로, 10자리로 쪼개진 '리' 조각들만 쏙 빼주면 완벽히 해결.
    const originalCount = geoJson.features.length;
    geoJson.features = geoJson.features.filter(f => f.properties.code && f.properties.code.length <= 8);
    console.log(`🧹 [Clean] 10자리 '리' 단위 조각 필터링 완료: ${originalCount}개 -> ${geoJson.features.length}개로 압축됨`);

    let matchCount = 0;

    geoJson.features = geoJson.features.map(feature => {
      const code = feature.properties.code;
      if (!code) return feature;

      const prefix8 = code.substring(0, 8);
      const prefix7 = code.substring(0, 7);
      const prefix6 = code.substring(0, 6);

      let targetIntel = null;
      if (intelDB[code]) targetIntel = intelDB[code];
      else if (intelDB[prefix8]) targetIntel = intelDB[prefix8];
      else if (intelDB[prefix7]) targetIntel = intelDB[prefix7];
      else if (intelDB[prefix6]) targetIntel = intelDB[prefix6];

      if (targetIntel) {
        feature.properties.intel = targetIntel;
        matchCount++;
      } else {
        if (feature.properties.intel) delete feature.properties.intel;
      }

      return feature;
    });

    // public/mapData 폴더가 없을 수도 있으니 미리 생성
    await fs.mkdir(path.dirname(OUTPUT_MAP_PATH), { recursive: true });

    geoJson.metadata = {
      mnemonics: globalMnemonics
    };

    await fs.writeFile(OUTPUT_MAP_PATH, JSON.stringify(geoJson));
    console.log(`🎉 [Success] GeoJSON 매핑 완료! (매칭된 인텔 구역 수: ${matchCount}개 / 맵의 전체 구역: ${geoJson.features.length})`);
    console.log(`📂 Saved to: ${OUTPUT_MAP_PATH}`);
  } catch (err) {
    console.error(`❌ 지도를 처리하는 중 오류가 발생했습니다:`, err.message);
    process.exit(1);
  }
}

run();
