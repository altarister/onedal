import fs from 'fs';
import * as turf from '@turf/turf';

const data = JSON.parse(fs.readFileSync('./server/mapData/merged_map.geojson', 'utf8'));

console.time('Find City Polygons');
const cityPolygons = data.features.filter((f: any) => f.properties.SIG_KOR_NM?.includes('용인시'));
console.timeEnd('Find City Polygons');

console.time('Buffer City Polygons');
const bufferedPolygons = cityPolygons.map((p: any) => turf.buffer(p, 10, {units: 'kilometers'}));
console.timeEnd('Buffer City Polygons');

console.time('Intersect All');
const matched = new Set<string>();
for (const f of data.features) {
    if (f.properties.SIG_KOR_NM?.includes('용인시')) {
        matched.add(f.properties.EMD_KOR_NM);
        continue;
    }
    // Check if f intersects ANY of the buffered polygons
    for (const bp of bufferedPolygons) {
        if (turf.booleanIntersects(f, bp)) {
            matched.add(f.properties.EMD_KOR_NM);
            break;
        }
    }
}
console.timeEnd('Intersect All');

console.log('Matched regions count:', matched.size);
