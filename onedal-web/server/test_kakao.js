const apiKey = 'YOUR_KEY_HERE'; // Wait, I can't put the real key. Where do I get the key?
// Let's use the .env file in server
require('dotenv').config({path: '/Users/seungwookkim/reps/onedal/onedal-web/server/.env'});
const key = process.env.KAKAO_REST_API_KEY;
if (!key) { console.error("No key"); process.exit(1); }

async function testQuery(type, query) {
    const url = `https://dapi.kakao.com/v2/local/search/${type}.json?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "Authorization": `KakaoAK ${key}` } });
    const data = await res.json();
    console.log(`[${type}] ${query}`);
    if (data.documents && data.documents.length > 0) {
        console.log(` -> Match: ${data.documents[0].address_name || data.documents[0].place_name} (x: ${data.documents[0].x}, y: ${data.documents[0].y})`);
    } else {
        console.log(` -> No match`);
    }
}

async function run() {
    await testQuery('address', '경기 광주시 경안동 204-5');
    await testQuery('keyword', '경기 광주시 경안동 204-5 홈플러스 광주점');
    await testQuery('address', '경기 광주시 경안동 204-5 홈플러스 광주점');
    await testQuery('keyword', '홈플러스 광주점');
    await testQuery('keyword', '경기 광주시 경안동 광주점');
}
run();
