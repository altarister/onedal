import fs from 'fs';
import * as turf from '@turf/turf';

const data = JSON.parse(fs.readFileSync('./mapData/merged_map.geojson', 'utf8'));

console.time('Find City');
const cityFeatures = data.features.filter((f: any) => f.properties?.SIG_KOR_NM?.includes('용인시'));
const cityFc = turf.featureCollection(cityFeatures);
console.timeEnd('Find City');

console.time('Center and Buffer');
// turf.center gets the absolute center of the bounding box
// turf.centroid gets the center of mass
const center = turf.center(cityFc); 
const buffer = turf.buffer(center, 10, {units: 'kilometers'});
console.timeEnd('Center and Buffer');

console.time('Intersect');
const matched = new Set<string>();
const bufferBbox = turf.bbox(buffer);
for (const f of data.features) {
    if (!f.properties?.EMD_KOR_NM) continue;
    
    // Bbox check first
    if (!f.bbox) f.bbox = turf.bbox(f);
    if (bufferBbox[0] > f.bbox[2] || bufferBbox[2] < f.bbox[0] ||
        bufferBbox[1] > f.bbox[3] || bufferBbox[3] < f.bbox[1]) {
        continue;
    }
    
    if (turf.booleanIntersects(buffer, f)) {
        matched.add(f.properties.EMD_KOR_NM);
    }
}
console.timeEnd('Intersect');

console.log('Matched regions count:', matched.size);
console.log('Regions:', Array.from(matched).slice(0, 10));
