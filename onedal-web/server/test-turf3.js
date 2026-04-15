const fs = require('fs');
const turf = require('@turf/turf');

// 1. Load map
const mapPath = './mapData/merged_map.geojson';
const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

// 2. Create a fake polyline from Gwangju to Paju via Uijeongbu
// Gwangju (127.25, 37.40) -> Hanam (127.21, 37.54) -> Namyangju (127.21, 37.63) -> Uijeongbu (127.05, 37.73) -> Paju (126.77, 37.76)
const lineCoords = [
  [127.25, 37.40],
  [127.21, 37.54],
  [127.21, 37.63],
  [127.05, 37.73],
  [126.77, 37.76]
];
const lineFeature = turf.lineString(lineCoords);
const buf = turf.buffer(lineFeature, 10, { units: 'kilometers' });

let hits = [];
for (const feat of mapData.features) {
  const name = feat.properties.EMD_KOR_NM;
  const sig = feat.properties.SIG_KOR_NM;
  if (!name) continue;
  try {
    if (turf.booleanIntersects(buf, feat)) {
      if (sig === '마포구' || sig === '강서구') {
        hits.push(`${sig} ${name}`);
      }
    }
  } catch (e) {}
}
console.log("Hits in Mapo/Gangseo:", hits);

// Search for '마포구' and print its coordinates to check if they are bounded properly
for (const feat of mapData.features) {
  const name = feat.properties.EMD_KOR_NM;
  const sig = feat.properties.SIG_KOR_NM;
  if (sig === '강서구' && name === '화곡동') {
     const bbox = turf.bbox(feat);
     console.log("강서구 화곡동 bbox:", bbox);
  }
}
