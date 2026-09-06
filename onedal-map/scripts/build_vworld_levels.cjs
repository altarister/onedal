#!/usr/bin/env node
/**
 * build_vworld_levels.cjs
 * 
 * V-World Single Source of Truth 빌드 스크립트
 * 
 * merged_map.geojson (Level 3, 법정동 단위) 을 유일한 원천으로 삼아
 * turf.js union/dissolve 로 상위 레벨 GeoJSON 을 자동 파생합니다.
 * 
 * Output:
 *   public/mapData/vworld_provinces.geojson      — Level 1 (서울/인천/경기)
 *   public/mapData/vworld_sig.geojson             — Level 2 Raw (82개 시/군/구)
 *   public/mapData/vworld_sig_merged.geojson      — Level 2 Merged (대도시 통합)
 * 
 * Usage:
 *   node scripts/build_vworld_levels.cjs
 */

const fs = require('fs');
const path = require('path');
const turf = require('@turf/turf');

// ─── Config ───────────────────────────────────────────────────────────
const INPUT_PATH = path.join(__dirname, '..', 'public', 'mapData', 'merged_map.geojson');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'mapData');

// V-World 기준 광역 코드 → 이름 매핑
const PROVINCE_NAMES = {
  '11': '서울특별시',
  '28': '인천광역시',
  '41': '경기도',
};

// 경기도 대도시 비자치구 → 상위 시 통합 매핑
// key: 4자리 코드, value: { code: 통합 5자리 코드, name: 상위 시 이름 }
const MERGED_CITY_MAP = {
  '4111': { code: '41110', name: '수원시' },
  '4113': { code: '41130', name: '성남시' },
  '4117': { code: '41170', name: '안양시' },
  '4119': { code: '41190', name: '부천시' },
  '4127': { code: '41270', name: '안산시' },
  '4128': { code: '41280', name: '고양시' },
  '4146': { code: '41460', name: '용인시' },
  '4159': { code: '41590', name: '화성시' },
};

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * 여러 feature들의 geometry를 하나로 합침 (turf.union)
 * turf v7 에서는 union(featureCollection) 형태
 */
function unionFeatures(features) {
  if (features.length === 0) return null;
  if (features.length === 1) return features[0];

  try {
    const fc = turf.featureCollection(features);
    const result = turf.union(fc);
    return result ? turf.rewind(result, { reverse: true }) : null;
  } catch (err) {
    // fallback: 순차적 union
    console.warn(`  ⚠ batch union failed, falling back to sequential union (${features.length} features)`);
    let merged = features[0];
    for (let i = 1; i < features.length; i++) {
      try {
        const fc2 = turf.featureCollection([merged, features[i]]);
        merged = turf.union(fc2);
      } catch (e) {
        console.warn(`  ⚠ skip feature ${i}: ${e.message}`);
      }
    }
    return merged ? turf.rewind(merged, { reverse: true }) : null;
  }
}

/**
 * feature의 centroid 를 계산하여 [lon, lat] 반환
 */
function computeCentroid(feature) {
  try {
    const c = turf.centroid(feature);
    return c.geometry.coordinates;
  } catch {
    return [0, 0];
  }
}

// ─── Main ─────────────────────────────────────────────────────────────

function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log(' V-World Level Builder — Single Source of Truth');
  console.log('═══════════════════════════════════════════════════');
  console.log();

  // 1. Load Level 3
  console.log(`📂 Loading Level 3: ${INPUT_PATH}`);
  const raw = fs.readFileSync(INPUT_PATH, 'utf-8');
  const level3 = JSON.parse(raw);
  console.log(`   ✓ ${level3.features.length} features loaded`);
  console.log();

  // ─────────────────────────────────────────────────────
  // 2. Build Level 2 Raw (SIG 단위 dissolve)
  // ─────────────────────────────────────────────────────
  console.log('🔨 Building Level 2 Raw (SIG dissolve)...');
  
  // Group features by 5-digit SIG code
  const sigGroups = new Map(); // Map<string, { name: string, features: Feature[] }>
  
  level3.features.forEach(f => {
    const code = f.properties.code;
    if (!code || code.length < 5) return;
    
    const sig5 = code.substring(0, 5);
    if (!sigGroups.has(sig5)) {
      sigGroups.set(sig5, {
        name: f.properties.SIG_KOR_NM || '',
        features: [],
      });
    }
    sigGroups.get(sig5).features.push(f);
  });

  console.log(`   Found ${sigGroups.size} SIG groups`);

  const level2RawFeatures = [];
  
  for (const [sig5, group] of sigGroups) {
    process.stdout.write(`   Dissolving ${sig5} (${group.name}) [${group.features.length} dongs]...`);
    
    const merged = unionFeatures(group.features);
    if (!merged) {
      console.log(' ✗ SKIP');
      continue;
    }
    
    merged.properties = {
      code: sig5,
      name: group.name,
      centroid: computeCentroid(merged),
    };
    
    level2RawFeatures.push(merged);
    console.log(' ✓');
  }

  const level2Raw = {
    type: 'FeatureCollection',
    features: level2RawFeatures,
  };

  const l2RawPath = path.join(OUTPUT_DIR, 'vworld_sig.geojson');
  fs.writeFileSync(l2RawPath, JSON.stringify(level2Raw));
  console.log(`   ✅ Level 2 Raw: ${level2RawFeatures.length} features → ${l2RawPath}`);
  console.log(`   📦 Size: ${(fs.statSync(l2RawPath).size / 1024 / 1024).toFixed(1)} MB`);
  console.log();

  // ─────────────────────────────────────────────────────
  // 3. Build Level 2 Merged (대도시 비자치구 통합)
  // ─────────────────────────────────────────────────────
  console.log('🔨 Building Level 2 Merged (대도시 통합)...');

  const level2MergedFeatures = [];
  const processedSigCodes = new Set(); // 이미 통합된 코드 추적

  // Step 1: 대도시 통합 (경기도 비자치구)
  for (const [prefix4, cityInfo] of Object.entries(MERGED_CITY_MAP)) {
    const childFeatures = level2RawFeatures.filter(f => 
      f.properties.code.startsWith(prefix4)
    );

    if (childFeatures.length === 0) {
      console.warn(`   ⚠ No children for ${cityInfo.name} (${prefix4})`);
      continue;
    }

    process.stdout.write(`   Merging ${cityInfo.name} (${childFeatures.length} gu)...`);
    
    const merged = unionFeatures(childFeatures);
    if (!merged) {
      console.log(' ✗ SKIP');
      continue;
    }

    merged.properties = {
      code: cityInfo.code,
      name: cityInfo.name,
      centroid: computeCentroid(merged),
      _isMergedCity: true,
    };

    level2MergedFeatures.push(merged);
    childFeatures.forEach(f => processedSigCodes.add(f.properties.code));
    console.log(' ✓');
  }

  // Step 2: 나머지 (서울 구, 인천 구/군, 경기 단독 시/군)
  for (const f of level2RawFeatures) {
    if (!processedSigCodes.has(f.properties.code)) {
      level2MergedFeatures.push({ ...f }); // 그대로 복사
    }
  }

  // Sort by code
  level2MergedFeatures.sort((a, b) => a.properties.code.localeCompare(b.properties.code));

  const level2Merged = {
    type: 'FeatureCollection',
    features: level2MergedFeatures,
  };

  const l2MergedPath = path.join(OUTPUT_DIR, 'vworld_sig_merged.geojson');
  fs.writeFileSync(l2MergedPath, JSON.stringify(level2Merged));
  console.log(`   ✅ Level 2 Merged: ${level2MergedFeatures.length} features → ${l2MergedPath}`);
  console.log(`   📦 Size: ${(fs.statSync(l2MergedPath).size / 1024 / 1024).toFixed(1)} MB`);
  console.log();

  // ─────────────────────────────────────────────────────
  // 4. Build Level 1 (광역 dissolve)
  // ─────────────────────────────────────────────────────
  console.log('🔨 Building Level 1 (Province dissolve)...');

  const level1Features = [];
  
  for (const [prefix2, provinceName] of Object.entries(PROVINCE_NAMES)) {
    const childFeatures = level2RawFeatures.filter(f => 
      f.properties.code.startsWith(prefix2)
    );

    if (childFeatures.length === 0) {
      console.warn(`   ⚠ No children for ${provinceName} (${prefix2})`);
      continue;
    }

    process.stdout.write(`   Dissolving ${provinceName} (${childFeatures.length} sig)...`);
    
    const merged = unionFeatures(childFeatures);
    if (!merged) {
      console.log(' ✗ SKIP');
      continue;
    }

    merged.properties = {
      code: prefix2,
      name: provinceName,
      centroid: computeCentroid(merged),
    };

    level1Features.push(merged);
    console.log(' ✓');
  }

  const level1 = {
    type: 'FeatureCollection',
    features: level1Features,
  };

  const l1Path = path.join(OUTPUT_DIR, 'vworld_provinces.geojson');
  fs.writeFileSync(l1Path, JSON.stringify(level1));
  console.log(`   ✅ Level 1: ${level1Features.length} features → ${l1Path}`);
  console.log(`   📦 Size: ${(fs.statSync(l1Path).size / 1024 / 1024).toFixed(1)} MB`);
  console.log();

  // ─────────────────────────────────────────────────────
  // 4.5. Mapshaper Topological Post-Processing (Slivers & Simplification)
  // ─────────────────────────────────────────────────────
  console.log('🔨 Running Mapshaper Post-Processing to fix jagged lines and slivers...');
  try {
    const { execSync } = require('child_process');
    
    console.log('   Cleaning Level 1...');
    execSync(`npx mapshaper ${l1Path} -clean allow-overlaps -simplify 20% -o force ${l1Path} format=geojson`, { stdio: 'ignore' });
    
    console.log('   Cleaning Level 2 Raw...');
    execSync(`npx mapshaper ${l2RawPath} -clean allow-overlaps -simplify 30% -o force ${l2RawPath} format=geojson`, { stdio: 'ignore' });
    
    console.log('   Cleaning Level 2 Merged...');
    execSync(`npx mapshaper ${l2MergedPath} -clean allow-overlaps -simplify 30% -o force ${l2MergedPath} format=geojson`, { stdio: 'ignore' });
    
    console.log('   ✅ Mapshaper cleanup complete.');
    
    // ─── [Additional Step] Filter Tiny Artifact Holes ───
    console.log('   🧹 Removing tiny artifact holes from generated GeoJSON levels...');
    const turf = require('@turf/turf');
    [l1Path, l2RawPath, l2MergedPath].forEach(filePath => {
      const fc = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      let removedHoles = 0;
      fc.features.forEach(f => {
        if (!f.geometry) return;
        
        // 1) First, measure and filter out tiny artifact holes
        const processPolygon = (coords) => {
          const exterior = coords[0];
          const holes = coords.slice(1);
          const validHoles = holes.filter(ring => {
            try {
              const poly = turf.polygon([ring]);
              const area = turf.area(poly);
              if (area < 50000000) { removedHoles++; return false; }
            } catch(e) { removedHoles++; return false; }
            return true;
          });
          return [exterior, ...validHoles];
        };
        
        if (f.geometry.type === 'Polygon') {
          f.geometry.coordinates = processPolygon(f.geometry.coordinates);
        } else if (f.geometry.type === 'MultiPolygon') {
          f.geometry.coordinates = f.geometry.coordinates.map(poly => processPolygon(poly));
        }

        // 2) Force strictly Right-Hand CCW winding order to prevent d3-geo from inverting the polygons into infinite globes
        f.geometry = turf.rewind(f.geometry, { reverse: true });
      });
      fs.writeFileSync(filePath, JSON.stringify(fc));
      console.log(`     Removed ${removedHoles} tiny artifact holes from ${path.basename(filePath)}`);
    });

    console.log(`   📦 Final Level 1 Size: ${(fs.statSync(l1Path).size / 1024 / 1024).toFixed(1)} MB`);
    console.log(`   📦 Final Level 2 Merged Size: ${(fs.statSync(l2MergedPath).size / 1024 / 1024).toFixed(1)} MB`);
    console.log();
  } catch (err) {
    console.warn('   ⚠ Mapshaper cleanup failed. Skipping simplification.', err);
  }

  // ─────────────────────────────────────────────────────
  // 5. Summary
  // ─────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════');
  console.log(' ✅ Build Complete!');
  console.log('═══════════════════════════════════════════════════');
  console.log();
  console.log(` Level 1 (provinces):     ${level1Features.length} features`);
  console.log(` Level 2 Raw (sig):       ${level2RawFeatures.length} features`);
  console.log(` Level 2 Merged:          ${level2MergedFeatures.length} features`);
  console.log(` Level 3 (dong, source):  ${level3.features.length} features`);
  console.log();

  // Verification: list all Level 2 Merged
  console.log('─ Level 2 Merged 전체 목록 ─');
  level2MergedFeatures.forEach(f => {
    const flag = f.properties._isMergedCity ? ' [MERGED]' : '';
    console.log(`  ${f.properties.code} ${f.properties.name}${flag}`);
  });
}

main();
