import fs from 'fs';
import osmtogeojson from 'osmtogeojson';
import https from 'https';
import { topology } from 'topojson-server';
import topojsonSimplify from 'topojson-simplify';
import { quantize } from 'topojson-client';
const { simplify, presimplify } = topojsonSimplify;

const QUERY = `
[out:json][timeout:180][maxsize:1073741824];
area(id:3600307756)->.searchArea;
(
  way["highway"~"motorway"](area.searchArea);
  way["highway"~"trunk"](area.searchArea);
  way["highway"~"primary"](area.searchArea);
  way["highway"~"secondary"](area.searchArea);
);
out geom;
`;

const OUTPUT_FILE = 'public/mapData/korea-roads-topo.json';

// Ensure directory exists
if (!fs.existsSync('public/mapData')) {
    fs.mkdirSync('public/mapData', { recursive: true });
}

console.log("Fetching road data from Overpass API...");

const req = https.request('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'MapApp/1.0 (https://github.com/seungwookkim/map)'
    }
}, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            let json;
            try {
                json = JSON.parse(data);
            } catch (e) {
                console.error("Failed to parse JSON. Raw response start:", data.substring(0, 500));
                return;
            }

            console.log(`Received raw data: ${json.elements?.length} elements.`);

            // Debug: Count types
            const typeCounts = {};
            if (json.elements) {
                json.elements.forEach(el => {
                    if (el.tags && el.tags.highway) {
                        const t = el.tags.highway;
                        typeCounts[t] = (typeCounts[t] || 0) + 1;
                    }
                });
            }
            console.log("Raw Highway Types:", typeCounts);

            console.log("Converting to GeoJSON...");
            const geojson = osmtogeojson(json);

            // Clean properties to save space
            const features = geojson.features.map(f => ({
                type: f.type,
                geometry: f.geometry,
                properties: {
                    highway: f.properties.highway,
                }
            }));

            const cleanGeoJSON = {
                type: "FeatureCollection",
                features: features
            };

            console.log(" Converting to TopoJSON & Simplifying...");

            // 1. Create Topology
            let topo = topology({ roads: cleanGeoJSON });

            // 2. Pre-simplify (Calculate weight for each point)
            topo = presimplify(topo);

            // 3. Simplify (Remove points with weight < minWeight)
            // Visvalingam algorithm. Value depends on coordinate system.
            // Since we are using unprojected coords (lon/lat), values are very small.
            // 1e-6 is roughly 10cm accuracy, 1e-4 is roughly 10m.
            topo = simplify(topo, 1e-4);

            // 4. Quantize (Convert float coords to integers with Delta encoding)
            // 1e5 = 100,000 grid size. Good balance for web maps.
            topo = quantize(topo, 1e5);

            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(topo));

            const stats = fs.statSync(OUTPUT_FILE);
            const fileSizeInMB = stats.size / (1024 * 1024);

            console.log(`Saved optimized TopoJSON to ${OUTPUT_FILE}`);
            console.log(`Final Size: ${fileSizeInMB.toFixed(2)} MB`);

        } catch (e) {
            console.error("Error processing data:", e);
        }
    });
});

req.on('error', (e) => {
    console.error("Request error:", e);
});

req.write(`data=${encodeURIComponent(QUERY)}`);
req.end();
