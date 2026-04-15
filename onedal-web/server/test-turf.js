const turf = require('@turf/turf');
const fs = require('fs');

const lineCoords = [
  [127.343738865299, 37.3491281166849], // 광주 실촌
  [126.731291995743, 37.7715933191625]  // 파주
];

const line = turf.lineString(lineCoords);
const buf = turf.buffer(line, 10, { units: 'kilometers' });

console.log(JSON.stringify(buf));
